import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { articleUrl, OutcomeLine, Stamp } from "@/components/Bits";
import { Setup } from "@/components/Setup";
import { backend, configured } from "@/lib/backend";
import { pdfUrl } from "@/lib/db";
import { caseDetail } from "@/lib/retrieval";
import { isVerbatim, OUTCOME } from "@/lib/style";
import type { CaseDetail, Statute } from "@/lib/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; mode?: string }> };

async function load(id: string): Promise<CaseDetail | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) return null;
  const { db } = await backend();
  return caseDetail(db, id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!configured()) return {};
  const c = await load((await params).id);
  return c ? { title: c.title, description: c.summary.slice(0, 160) } : {};
}

function Summary({ text, statutes }: { text: string; statutes: Statute[] }) {
  const laws = statutes.filter((s) => s.url.startsWith("https://indiankanoon.org/") && text.includes(s.name));
  if (!laws.length) return <>{text}</>;
  const pattern = new RegExp(`(${laws.map((l) => l.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`);
  return (
    <>
      {text.split(pattern).map((part, i) => {
        const law = laws.find((l) => l.name === part);
        return law ? (
          <a key={i} href={law.url} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        );
      })}
    </>
  );
}

export default async function CasePage({ params, searchParams }: Props) {
  if (!configured()) return <Setup />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const c = await load(id);
  if (!c) notFound();

  const back = sp.q ? `/?${new URLSearchParams({ q: sp.q, mode: sp.mode ?? "semantic" })}` : "/";
  const quote = c.excerpts.find(isVerbatim) ?? c.excerpts[0];
  const outcome = c.outcome ? OUTCOME[c.outcome.in_favour_of] ?? OUTCOME.partly : null;
  const pdf = pdfUrl(c.pdf_path);

  return (
    <main>
      <Link className="back" href={back}>
        ← {sp.q ? "Back to the results" : "Search"}
      </Link>

      <header className="case-head">
        <div>
          <Stamp domain={c.domain} label={c.domain_label} inline />
          <h1>{c.title}</h1>
          <div className="cite">
            {c.citation} · {c.court} · {c.judgment_date ?? c.year}
            {c.bench ? ` · ${c.bench}` : ""}
          </div>
        </div>
        <OutcomeLine outcome={c.outcome} />
      </header>

      <div className="case-grid">
        <article>
          {c.parties && c.outcome && outcome && (
            <div className="parties">
              <div>
                <div className="k">Brought by</div>
                <div className="v">{c.parties.petitioner}</div>
              </div>
              <div>
                <div className="k">Against</div>
                <div className="v">{c.parties.respondent}</div>
              </div>
              <div className="out">
                <span className="badge" style={{ ["--c" as string]: outcome.colour }}>
                  {outcome.label}
                </span>
                <div className="v" style={{ marginTop: 0 }}>
                  <b>In favour of: {c.outcome.winner}.</b> {c.outcome.verdict}
                </div>
              </div>
            </div>
          )}

          {quote && (
            <blockquote className="pull">
              {isVerbatim(quote) ? quote : quote.replace(/^holding\s*[—-]\s*/i, "")}
              <footer>{isVerbatim(quote) ? "Citable passage · verified against the judgment" : "Holding · summarised, not quoted"}</footer>
            </blockquote>
          )}

          <div className="prose">
            <Summary text={c.summary} statutes={c.statutes} />
          </div>

          <div className="sect-h">
            <h2>Articles engaged</h2>
            <span>case_articles ⋈ articles</span>
          </div>
          {c.article_text.map((a) => (
            <details className="art" key={a.id}>
              <summary>
                <b>Art. {a.label}</b>
                <span>{a.title}</span>
              </summary>
              <div className="txt">
                {a.body}
                {articleUrl(a.ik_doc) && (
                  <>
                    <br />
                    <a href={articleUrl(a.ik_doc)!} target="_blank" rel="noopener noreferrer">
                      Read Article {a.label} on Indian Kanoon ↗
                    </a>
                  </>
                )}
              </div>
            </details>
          ))}

          {c.excerpts.length > 1 && (
            <>
              <div className="sect-h">
                <h2>Every passage</h2>
                <span>{c.excerpts.length} on file</span>
              </div>
              {c.excerpts.map((e) => (
                <blockquote className="pull" key={e} style={{ fontSize: 18, margin: "18px 0" }}>
                  {isVerbatim(e) ? e : e.replace(/^holding\s*[—-]\s*/i, "")}
                  <footer>{isVerbatim(e) ? "Verbatim" : "Holding · summarised"}</footer>
                </blockquote>
              ))}
            </>
          )}
        </article>

        <aside className="side">
          {pdf && (
            <a className="download" href={pdf} target="_blank" rel="noopener noreferrer">
              <span className="doc">PDF</span>
              <span>
                <b>Read the judgment</b>
                <small>
                  Supabase Storage{c.pdf_pages ? ` · ${c.pdf_pages} pages` : ""}
                </small>
              </span>
            </a>
          )}
          <div className="panel" style={{ padding: 18 }}>
            <h3>Related judgments</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {c.related.map((r) => (
                <Link className="rel" key={r.id} href={`/case/${r.id}${sp.q ? `?${new URLSearchParams({ q: sp.q, mode: sp.mode ?? "semantic" })}` : ""}`}>
                  <b>{r.title}</b>
                  <span className="row">
                    {r.shared_articles.map((a) => (
                      <span className="chip" key={a}>
                        Art. {a}
                      </span>
                    ))}
                    {r.same_org && <span className="tag">same respondent</span>}
                    <span style={{ marginLeft: "auto", font: "11px var(--mono)", color: "var(--muted)" }}>{r.year}</span>
                  </span>
                </Link>
              ))}
            </div>
            <p style={{ margin: "14px 0 0", font: "11px/1.6 var(--mono)", color: "var(--muted)" }}>
              Cases sharing an Article or the same kind of respondent, found by related_cases() — what the graph edge
              :RELATED_TO meant, as one SQL join.
            </p>
          </div>
          {c.keywords.length > 0 && (
            <div className="panel" style={{ padding: 18 }}>
              <h3>Keywords</h3>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {c.keywords.map((k) => (
                  <Link key={k} className="chip law" href={`/?${new URLSearchParams({ q: k, mode: "keyword" })}`}>
                    {k}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
