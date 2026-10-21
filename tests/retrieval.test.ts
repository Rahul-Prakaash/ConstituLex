import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { loadCorpus } from "@/lib/corpus";
import type { Db } from "@/lib/db";
import { caseDetail, corpusStats, search, STRONG, THRESHOLD } from "@/lib/retrieval";
import { freshDatabase, pgliteDb } from "./pglite";

type Fixture = { query: string; embedding: number[]; top: { id: string; score: number }[] };
const fixtures: Fixture[] = JSON.parse(readFileSync("tests/fixtures/parity.json", "utf8"));
const corpus = loadCorpus();

let pg: PGlite;
let db: Db;

beforeAll(async () => {
  pg = await freshDatabase();
  db = pgliteDb(pg);
});

describe("schema", () => {
  it("re-applies cleanly, so a deploy can always be re-run", async () => {
    const dir = path.join(process.cwd(), "supabase", "migrations");
    for (const file of readdirSync(dir).sort()) await pg.exec(readFileSync(path.join(dir, file), "utf8"));
    const { rows } = await pg.query<{ n: number }>("select count(*)::int as n from public.cases");
    expect(rows[0].n).toBe(30);
  });

  it("is read-only to the public: row level security is on for every table", async () => {
    const { rows } = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r'`);
    expect(rows.length).toBe(5);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("refuses a malformed case", async () => {
    const bad = (sql: string) => expect(pg.query(sql)).rejects.toThrow();
    const v = `'[${Array(384).fill(0.01).join(",")}]'`;
    await bad(`insert into public.cases (id, title, citation, court, year, domain, org_type, summary, source_url, embedding, embedding_model)
               values ('Not A Slug', 'A title', 'c', 'court', 2000, 'privacy', 'corporation', 's', 'https://x', ${v}, 'm')`);
    await bad(`insert into public.cases (id, title, citation, court, year, domain, org_type, summary, source_url, embedding, embedding_model)
               values ('a-case', 'A title', 'c', 'court', 2000, 'astrology', 'corporation', 's', 'https://x', ${v}, 'm')`);
    await bad(`insert into public.cases (id, title, citation, court, year, domain, org_type, summary, source_url, embedding, embedding_model)
               values ('a-case', 'A title', 'c', 'court', 2000, 'privacy', 'corporation', 's', 'https://x', '[1,2,3]', 'm')`);
  });

  it("keeps every case's Articles as join rows", async () => {
    const { rows } = await pg.query<{ n: number }>("select count(*)::int as n from public.case_articles");
    expect(rows[0].n).toBe(corpus.cases.reduce((s, c) => s + c.articles.length, 0));
  });
});

describe("search by meaning (pgvector)", () => {
  it.each(fixtures.map((f) => [f.query, f] as const))("ranks %j exactly as the Python engine did", async (_q, f) => {
    const result = await search(db, f.query, { mode: "semantic", embedder: async () => f.embedding });
    expect(result.hits.map((h) => h.card.id)).toEqual(f.top.map((t) => t.id));
    result.hits.forEach((h, i) => expect(h.similarity).toBeCloseTo(f.top[i].score, 3));
  });

  it("embeds the question in TypeScript to the same vector Python produced", async () => {
    const result = await search(db, fixtures[0].query, { mode: "semantic" });
    const cos = result.embedding!.reduce((s, x, i) => s + x * fixtures[0].embedding[i], 0);
    expect(cos).toBeGreaterThan(0.9999);
    expect(result.hits[0].card.id).toBe(fixtures[0].top[0].id);
  });

  it("says when nothing is close enough", async () => {
    const cookies = fixtures.find((f) => f.query.includes("cookies"))!;
    const result = await search(db, cookies.query, { embedder: async () => cookies.embedding });
    expect(result.confidence).toBeLessThan(THRESHOLD);
    expect(result.band).toBe("weak");
    const water = fixtures.find((f) => f.query.includes("drinking water"))!;
    expect((await search(db, water.query, { embedder: async () => water.embedding })).band).toBe(
      water.top[0].score >= STRONG ? "strong" : "plausible");
  });

  it("can be narrowed to one domain", async () => {
    const f = fixtures[0];
    const result = await search(db, f.query, { embedder: async () => f.embedding, domain: "privacy" });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.every((h) => h.card.domain === "privacy")).toBe(true);
  });
});

describe("search by words (full text)", () => {
  it("folds accents, which MongoDB's text index could not", async () => {
    const result = await search(db, "nestle", { mode: "keyword" });
    expect(result.hits[0].card.id).toBe("nestle-maggi");
    expect(result.hits[0].card.title).toContain("Nestlé");
  });

  it("matches any of the words, best first, and marks them in a snippet", async () => {
    const result = await search(db, "maggi noodles lead content ban", { mode: "keyword" });
    expect(result.hits[0].card.id).toBe("nestle-maggi");
    expect(result.hits[0].score).toBe(1);
    expect(result.hits[0].snippet).toMatch(/«[^»]+»/);
  });

  it("still finds a misspelt case name", async () => {
    const result = await search(db, "vishakha", { mode: "keyword" });
    expect(result.hits[0].card.id).toBe("vishaka");
    expect(result.hits[0].matchedBy).toBe("trigram");
  });

  it("never embeds anything", async () => {
    const result = await search(db, "pavement dwellers", { mode: "keyword", embedder: async () => { throw new Error("no"); } });
    expect(result.embedding).toBeNull();
    expect(result.hits[0].card.id).toBe("olga-tellis");
  });
});

describe("hybrid (reciprocal rank fusion)", () => {
  it("rewards a case both lists agree on", async () => {
    const f = fixtures.find((x) => x.query.includes("harassment"))!;
    const result = await search(db, f.query, { mode: "hybrid", embedder: async () => f.embedding });
    const top = result.hits[0];
    expect(top.card.id).toBe("vishaka");
    expect(top.semanticRank).toBe(1);
    expect(top.keywordRank).not.toBeNull();
    expect(top.score).toBeCloseTo(1 / 61 + 1 / (60 + top.keywordRank!), 6);
  });
});

describe("cases and the links between them", () => {
  it("returns a case with its Articles' text and no embedding", async () => {
    const d = (await caseDetail(db, "olga-tellis"))!;
    expect(d.title).toMatch(/Olga Tellis/);
    expect(d.articles).toEqual(["14", "19", "21", "32"]);
    expect(d.article_text.map((a) => a.id)).toEqual(d.articles);
    expect(d.article_text.find((a) => a.id === "21")!.body).toMatch(/personal liberty/);
    expect(Object.keys(d)).not.toContain("embedding");
    expect(await caseDetail(db, "no-such-case")).toBeNull();
  });

  it("derives related cases the way the Neo4j edge did: a shared Article or respondent type", async () => {
    const d = (await caseDetail(db, "olga-tellis"))!;
    const self = corpus.cases.find((c) => c.id === "olga-tellis")!;
    for (const r of d.related) {
      const other = corpus.cases.find((c) => c.id === r.id)!;
      const shared = other.articles.filter((a) => self.articles.includes(a)).sort();
      expect(r.shared_articles.slice().sort()).toEqual(shared);
      expect(r.same_org).toBe(other.org_type === self.org_type);
      expect(shared.length > 0 || r.same_org).toBe(true);
    }
    const counts = d.related.map((r) => r.shared_articles.length);
    expect(counts).toEqual(counts.slice().sort((a, b) => b - a));
  });

  it("summarises the corpus", async () => {
    const s = await corpusStats(db);
    expect(s.cases).toBe(30);
    expect(s.articles).toBe(493);
    expect(s.domains.reduce((n, d) => n + d.cases, 0)).toBe(30);
    expect(s.top_articles[0]).toMatchObject({ id: "21", cases: 26 });
  });
});
