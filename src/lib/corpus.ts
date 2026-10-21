import { readFileSync } from "node:fs";
import path from "node:path";

export type CaseJson = {
  id: string;
  title: string;
  citation: string;
  court: string;
  year: number;
  domain: string;
  org_type: string;
  summary: string;
  excerpts: string[];
  articles: string[];
  source_url: string;
  bench: string | null;
  judgment_date: string | null;
  keywords: string[];
  outcome: unknown;
  parties: unknown;
  statutes: unknown[];
  pdf_file: string | null;
  pdf_pages: number | null;
  embedding_model: string;
  embedding: number[];
};

export type ArticleJson = {
  id: string;
  number: number | null;
  label: string;
  title: string | null;
  text: string | null;
  part: string | null;
  kind: string | null;
  indiankanoon_doc: number | null;
};

export type Vocab = { id: string; label: string };

export type Corpus = { cases: CaseJson[]; articles: ArticleJson[]; domains: Vocab[]; orgTypes: Vocab[] };

export const DATA_DIR = path.join(process.cwd(), "data");

function read<T>(name: string): T {
  return JSON.parse(readFileSync(path.join(DATA_DIR, `${name}.json`), "utf8")) as T;
}

export function loadCorpus(): Corpus {
  return {
    cases: read<CaseJson[]>("cases"),
    articles: read<ArticleJson[]>("articles"),
    domains: read<Vocab[]>("domains"),
    orgTypes: read<Vocab[]>("org_types"),
  };
}

export function embeddableText(c: CaseJson): string {
  return [c.title, c.domain.replace(/_/g, " "), c.summary, c.excerpts.join(" "), c.keywords.join(" ")]
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function caseRow(c: CaseJson) {
  return {
    id: c.id,
    title: c.title,
    citation: c.citation,
    court: c.court,
    year: c.year,
    domain: c.domain,
    org_type: c.org_type,
    summary: c.summary,
    excerpts: c.excerpts,
    keywords: c.keywords,
    source_url: c.source_url,
    bench: c.bench,
    judgment_date: c.judgment_date,
    outcome: c.outcome ?? null,
    parties: c.parties ?? null,
    statutes: c.statutes ?? [],
    pdf_path: c.pdf_file,
    pdf_pages: c.pdf_pages,
    embedding: `[${c.embedding.join(",")}]`,
    embedding_model: c.embedding_model,
  };
}

export function articleRow(a: ArticleJson) {
  return {
    id: a.id,
    number: a.number,
    label: a.label,
    title: a.title,
    body: a.text,
    part: a.part,
    kind: a.kind,
    ik_doc: a.indiankanoon_doc,
  };
}
