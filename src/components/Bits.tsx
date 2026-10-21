import { Fragment } from "react";
import { STRONG, THRESHOLD } from "@/lib/retrieval";
import { domainColour, OUTCOME, scoreColour } from "@/lib/style";
import type { Outcome } from "@/lib/types";

export function Stamp({ domain, label, inline = false }: { domain: string; label: string; inline?: boolean }) {
  return (
    <span className={inline ? "stamp inline" : "stamp"} style={{ ["--c" as string]: domainColour(domain) }}>
      {label}
    </span>
  );
}

export function Meter({ similarity }: { similarity: number }) {
  const scale = (v: number) => `${Math.min(100, (v / 0.6) * 100)}%`;
  const c = scoreColour(similarity);
  return (
    <div className="meter" style={{ ["--c" as string]: c }}>
      <div className="track">
        <div className="fill" style={{ width: scale(similarity) }} />
        <span className="tick" style={{ left: scale(THRESHOLD) }} data-l={THRESHOLD} />
        <span className="tick" style={{ left: scale(STRONG) }} data-l={STRONG} />
      </div>
      <b>{similarity.toFixed(3)}</b>
    </div>
  );
}

export function OutcomeLine({ outcome }: { outcome: Outcome | null }) {
  if (!outcome) return null;
  const o = OUTCOME[outcome.in_favour_of] ?? OUTCOME.partly;
  return (
    <span className="outcome" style={{ ["--c" as string]: o.colour }}>
      <i /> {o.label}
    </span>
  );
}

export function Snippet({ text }: { text: string }) {
  const parts = text.split(/«|»/);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

export function articleUrl(ikDoc: number | null): string | null {
  return ikDoc ? `https://indiankanoon.org/doc/${ikDoc}/` : null;
}
