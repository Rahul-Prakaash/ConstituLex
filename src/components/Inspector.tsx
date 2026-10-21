import { Fragment } from "react";
import { STRONG, THRESHOLD } from "@/lib/retrieval";
import { MODE_INFO, scoreColour } from "@/lib/style";
import type { SearchResult } from "@/lib/types";

function Barcode({ v }: { v: number[] }) {
  const peak = Math.max(...v.map(Math.abs)) || 1;
  return (
    <svg className="barcode" viewBox={`0 0 ${v.length} 54`} preserveAspectRatio="none" role="img" aria-label={`${v.length}-number query embedding`}>
      <line x1="0" x2={v.length} y1="27" y2="27" stroke="#26324a" strokeWidth="0.5" />
      {v.map((x, i) => {
        const h = (Math.abs(x) / peak) * 25;
        return <rect key={i} x={i} width="0.82" y={x >= 0 ? 27 - h : 27} height={Math.max(h, 0.4)} fill={x >= 0 ? "#f0a26a" : "#6f9bd8"} />;
      })}
    </svg>
  );
}

const TOKENS = /('(?:[^']|'')*')|\b(select|from)\b|\b(match_cases|keyword_cases|hybrid_cases|cases_by_ids)\b/g;

function Sql({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKENS)) {
    out.push(<Fragment key={`t${last}`}>{text.slice(last, m.index)}</Fragment>);
    const cls = m[1] ? "s" : m[2] ? "k" : "f";
    out.push(<span key={`m${m.index}`} className={cls}>{m[0]}</span>);
    last = m.index! + m[0].length;
  }
  out.push(<Fragment key="end">{text.slice(last)}</Fragment>);
  return <pre className="sql">{out}</pre>;
}

const ms = (v: number | null) => (v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v.toFixed(0)} ms`);

export function Inspector({ result }: { result: SearchResult }) {
  const info = MODE_INFO[result.mode];
  const slowest = Math.max(result.timings.embedMs ?? 0, result.timings.dbMs, 1);
  return (
    <aside className="inspector" aria-label="How this answer was found">
      <h4>How it was found</h4>
      <div className="sub">
        {info.label} · {info.tech} — {info.blurb}
      </div>

      {result.embedding && (
        <>
          <div className="lbl">
            Your question, as numbers <em>{result.embedding.length} dimensions · all-MiniLM-L6-v2</em>
          </div>
          <Barcode v={result.embedding} />
        </>
      )}

      <div className="lbl">
        The call to Postgres <em>via supabase.rpc()</em>
      </div>
      <Sql text={`${result.sql}\nselect * from cases_by_ids(…${result.hits.length} ids);`} />

      <div className="lbl">Time spent</div>
      <div className="timing">
        <div>
          embedding <span className="t"><span style={{ width: `${((result.timings.embedMs ?? 0) / slowest) * 100}%`, background: "#f0a26a" }} /></span>
          <b>{ms(result.timings.embedMs)}</b>
        </div>
        <div>
          postgres <span className="t"><span style={{ width: `${(result.timings.dbMs / slowest) * 100}%`, background: "#8fd1a8" }} /></span>
          <b>{ms(result.timings.dbMs)}</b>
        </div>
      </div>

      {result.hits.length > 0 && (
        <>
          <div className="lbl">
            Every candidate <em>{result.mode === "hybrid" ? "RRF score · similarity" : result.mode === "keyword" ? "rank, best = 1" : "cosine similarity"}</em>
          </div>
          <table className="cands">
            <tbody>
              {result.hits.map((h, i) => {
                const v = h.similarity ?? h.score;
                return (
                  <tr key={h.card.id}>
                    <td>{i + 1}</td>
                    <td className="id">{h.card.id}</td>
                    <td className="v">
                      <span className="mini">
                        <span style={{ width: `${Math.min(100, (v / (h.similarity !== null ? 0.6 : 1)) * 100)}%`, background: scoreColour(h.similarity) }} />
                      </span>
                      {result.mode === "hybrid" ? `${h.score.toFixed(4)}·${v.toFixed(2)}` : v.toFixed(3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      <div className="facts">
        Similarity bands measured on this corpus: <b>≥ {STRONG}</b> strong, <b>≥ {THRESHOLD}</b> plausible, below that the
        page says nothing is close enough. Read-only: row-level security lets the public key select and nothing else.
      </div>
    </aside>
  );
}
