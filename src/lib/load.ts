import { articleRow, caseRow, type Corpus } from "./corpus";

export type Statement = { text: string; params: unknown[] };

const json = (v: unknown) => JSON.stringify(v ?? null);

export function loadStatements(corpus: Corpus): Statement[] {
  const out: Statement[] = [];

  for (const d of corpus.domains) {
    out.push({
      text: "insert into public.domains (id, label) values ($1, $2) on conflict (id) do update set label = excluded.label",
      params: [d.id, d.label],
    });
  }
  for (const o of corpus.orgTypes) {
    out.push({
      text: "insert into public.org_types (id, label) values ($1, $2) on conflict (id) do update set label = excluded.label",
      params: [o.id, o.label],
    });
  }
  for (const a of corpus.articles.map(articleRow)) {
    out.push({
      text: `insert into public.articles (id, number, label, title, body, part, kind, ik_doc)
             values ($1, $2, $3, $4, $5, $6, $7, $8)
             on conflict (id) do update set number = excluded.number, label = excluded.label, title = excluded.title,
               body = excluded.body, part = excluded.part, kind = excluded.kind, ik_doc = excluded.ik_doc`,
      params: [a.id, a.number, a.label, a.title, a.body, a.part, a.kind, a.ik_doc],
    });
  }
  for (const c of corpus.cases) {
    const r = caseRow(c);
    out.push({
      text: `insert into public.cases (id, title, citation, court, year, domain, org_type, summary, excerpts, keywords,
               source_url, bench, judgment_date, outcome, parties, statutes, pdf_path, pdf_pages, embedding, embedding_model)
             values ($1, $2, $3, $4, $5, $6, $7, $8,
               array(select jsonb_array_elements_text(($9::text)::jsonb)), array(select jsonb_array_elements_text(($10::text)::jsonb)),
               $11, $12, $13::date, ($14::text)::jsonb, ($15::text)::jsonb, ($16::text)::jsonb, $17, $18, $19::extensions.vector, $20)
             on conflict (id) do update set title = excluded.title, citation = excluded.citation, court = excluded.court,
               year = excluded.year, domain = excluded.domain, org_type = excluded.org_type, summary = excluded.summary,
               excerpts = excluded.excerpts, keywords = excluded.keywords, source_url = excluded.source_url,
               bench = excluded.bench, judgment_date = excluded.judgment_date, outcome = excluded.outcome,
               parties = excluded.parties, statutes = excluded.statutes, pdf_path = excluded.pdf_path,
               pdf_pages = excluded.pdf_pages, embedding = excluded.embedding, embedding_model = excluded.embedding_model`,
      params: [
        r.id, r.title, r.citation, r.court, r.year, r.domain, r.org_type, r.summary,
        json(r.excerpts), json(r.keywords), r.source_url, r.bench, r.judgment_date,
        json(r.outcome), json(r.parties), json(r.statutes), r.pdf_path, r.pdf_pages, r.embedding, r.embedding_model,
      ],
    });
    out.push({
      text: `with wanted as (select jsonb_array_elements_text(($2::text)::jsonb) as article_id)
             insert into public.case_articles (case_id, article_id)
             select $1, article_id from wanted on conflict do nothing`,
      params: [c.id, json(c.articles)],
    });
    out.push({
      text: `delete from public.case_articles
             where case_id = $1 and article_id <> all (array(select jsonb_array_elements_text(($2::text)::jsonb)))`,
      params: [c.id, json(c.articles)],
    });
  }
  return out;
}
