import type { Db } from "./db";
import { embed as defaultEmbed } from "./embed";
import type { Band, CaseCard, CaseDetail, CorpusStats, Hit, Mode, SearchResult } from "./types";

export const THRESHOLD = 0.23;
export const STRONG = 0.4;

export const MODES: Mode[] = ["semantic", "keyword", "hybrid"];

type SemanticRow = { id: string; similarity: number };
type KeywordRow = { id: string; score: number; rank: number; snippet: string | null; matched_by: string };
type HybridRow = { id: string; score: number; similarity: number; semantic_rank: number | null; keyword_rank: number | null };

export type SearchOptions = {
  mode?: Mode;
  limit?: number;
  domain?: string | null;
  embedder?: (text: string) => Promise<number[]>;
};

export function bandFor(similarity: number | null): Band {
  if (similarity === null) return "none";
  if (similarity >= STRONG) return "strong";
  if (similarity >= THRESHOLD) return "plausible";
  return "weak";
}

function quote(text: string): string {
  return `'${text.replace(/'/g, "''")}'`;
}

function vectorPreview(v: number[]): string {
  return `'[${v.slice(0, 3).map((x) => x.toFixed(4)).join(", ")}, … ${v.length} dims]'::vector`;
}

async function cards(db: Db, ids: string[]): Promise<Map<string, CaseCard>> {
  if (ids.length === 0) return new Map();
  const rows = await db.rpc<CaseCard[]>("cases_by_ids", { ids });
  return new Map(rows.map((r) => [r.id, r]));
}

export async function search(db: Db, rawQuery: string, options: SearchOptions = {}): Promise<SearchResult> {
  const query = rawQuery.trim();
  if (!query) throw new Error("Type a grievance to search for.");
  const mode = options.mode ?? "semantic";
  const limit = Math.min(Math.max(options.limit ?? 5, 1), 20);
  const domain = options.domain ?? null;
  const embedder = options.embedder ?? defaultEmbed;

  const started = performance.now();
  let embedding: number[] | null = null;
  let embedMs: number | null = null;
  if (mode !== "keyword") {
    const t = performance.now();
    embedding = await embedder(query);
    embedMs = performance.now() - t;
  }

  const dbStarted = performance.now();
  let hits: Hit[] = [];
  let sql = "";

  if (mode === "semantic") {
    const rows = await db.rpc<SemanticRow[]>("match_cases", { query_embedding: embedding, match_count: limit, filter_domain: domain });
    const byId = await cards(db, rows.map((r) => r.id));
    hits = rows.flatMap((r) => {
      const card = byId.get(r.id);
      return card ? [{ card, score: r.similarity, similarity: r.similarity, snippet: null, semanticRank: null, keywordRank: null, matchedBy: "pgvector" }] : [];
    });
    sql = `select * from match_cases(${vectorPreview(embedding!)}, ${limit});`;
  } else if (mode === "keyword") {
    const rows = await db.rpc<KeywordRow[]>("keyword_cases", { query_text: query, match_count: limit, filter_domain: domain });
    const byId = await cards(db, rows.map((r) => r.id));
    hits = rows.flatMap((r) => {
      const card = byId.get(r.id);
      return card ? [{ card, score: r.score, similarity: null, snippet: r.snippet, semanticRank: null, keywordRank: null, matchedBy: r.matched_by }] : [];
    });
    sql = `select * from keyword_cases(${quote(query)}, ${limit});`;
  } else {
    const rows = await db.rpc<HybridRow[]>("hybrid_cases", { query_text: query, query_embedding: embedding, match_count: limit, filter_domain: domain });
    const byId = await cards(db, rows.map((r) => r.id));
    hits = rows.flatMap((r) => {
      const card = byId.get(r.id);
      return card
        ? [{ card, score: r.score, similarity: r.similarity, snippet: null, semanticRank: r.semantic_rank, keywordRank: r.keyword_rank, matchedBy: "rrf" }]
        : [];
    });
    sql = `select * from hybrid_cases(${quote(query)}, ${vectorPreview(embedding!)}, ${limit}, 60);`;
  }

  const dbMs = performance.now() - dbStarted;
  const top = hits[0] ?? null;
  const confidence = top ? (mode === "keyword" ? top.score : top.similarity ?? 0) : 0;
  const band: Band = !top
    ? "none"
    : mode === "keyword"
      ? top.matchedBy === "full text" ? "strong" : "plausible"
      : bandFor(top.similarity);

  return {
    query,
    mode,
    hits,
    band,
    confidence,
    sql,
    timings: { embedMs, dbMs, totalMs: performance.now() - started },
    embedding,
  };
}

export async function caseDetail(db: Db, id: string): Promise<CaseDetail | null> {
  return (await db.rpc<CaseDetail | null>("case_detail", { case_id: id })) ?? null;
}

export async function corpusStats(db: Db): Promise<CorpusStats> {
  return db.rpc<CorpusStats>("corpus_stats");
}
