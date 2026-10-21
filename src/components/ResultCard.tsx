import Link from "next/link";
import type { Hit, Mode } from "@/lib/types";
import { Meter, OutcomeLine, Snippet, Stamp } from "./Bits";

export function ResultCard({ hit, rank, query, mode }: { hit: Hit; rank: number; query: string; mode: Mode }) {
  const c = hit.card;
  const href = `/case/${c.id}?${new URLSearchParams({ q: query, mode })}`;
  return (
    <article className={rank === 1 ? "card first" : "card"}>
      <span className="rank">{String(rank).padStart(2, "0")}</span>
      <Stamp domain={c.domain} label={c.domain_label} />
      <h3>
        <Link href={href}>{c.title}</Link>
      </h3>
      <div className="cite">
        {c.citation} · {c.court} · {c.year}
      </div>

      {hit.similarity !== null && <Meter similarity={hit.similarity} />}

      <p className="summary">
        {hit.snippet ? (
          <>
            {c.summary.startsWith(hit.snippet.replace(/[«»]/g, "").slice(0, 24)) ? "" : "… "}
            <Snippet text={hit.snippet} />
          </>
        ) : (
          c.summary
        )}
      </p>

      <div className="foot">
        <OutcomeLine outcome={c.outcome} />
        {c.articles.map((a) => (
          <span className="chip" key={a}>
            Art. {a}
          </span>
        ))}
        {hit.matchedBy === "trigram" && <span className="chip law">closest spelling</span>}
        {hit.semanticRank !== null || hit.keywordRank !== null ? (
          <span className="chip law">
            meaning #{hit.semanticRank ?? "–"} · words #{hit.keywordRank ?? "–"}
          </span>
        ) : null}
        <Link className="read" href={href}>
          Read the case →
        </Link>
      </div>
    </article>
  );
}
