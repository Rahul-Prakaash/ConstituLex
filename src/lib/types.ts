export type Mode = "semantic" | "keyword" | "hybrid";

export type Outcome = {
  in_favour_of: "petitioner" | "respondent" | "partly";
  winner: string;
  verdict: string;
};

export type Parties = { petitioner: string; respondent: string };

export type Statute = { name: string; url: string };

export type CaseCard = {
  id: string;
  title: string;
  citation: string;
  court: string;
  year: number;
  domain: string;
  domain_label: string;
  org_type: string;
  org_label: string;
  summary: string;
  excerpts: string[];
  outcome: Outcome | null;
  parties: Parties | null;
  statutes: Statute[];
  pdf_path: string | null;
  articles: string[];
};

export type Hit = {
  card: CaseCard;
  score: number;
  similarity: number | null;
  snippet: string | null;
  semanticRank: number | null;
  keywordRank: number | null;
  matchedBy: string | null;
};

export type Band = "strong" | "plausible" | "weak" | "none";

export type SearchResult = {
  query: string;
  mode: Mode;
  hits: Hit[];
  band: Band;
  confidence: number;
  sql: string;
  timings: { embedMs: number | null; dbMs: number; totalMs: number };
  embedding: number[] | null;
};

export type ArticleText = { id: string; label: string; title: string | null; body: string | null; ik_doc: number | null };

export type RelatedCase = {
  id: string;
  title: string;
  year: number;
  domain: string;
  shared_articles: string[];
  same_org: boolean;
};

export type CaseDetail = CaseCard & {
  bench: string | null;
  judgment_date: string | null;
  source_url: string;
  pdf_pages: number | null;
  keywords: string[];
  article_text: ArticleText[];
  related: RelatedCase[];
};

export type CorpusStats = {
  cases: number;
  articles: number;
  cited: number;
  years: [number, number];
  domains: { id: string; label: string; cases: number }[];
  top_articles: { id: string; label: string; title: string; cases: number }[];
};
