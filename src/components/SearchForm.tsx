"use client";

import { useRef } from "react";
import { MODE_INFO } from "@/lib/style";
import type { Mode } from "@/lib/types";

export function SearchForm({ query = "", mode = "semantic", compact = false }: { query?: string; mode?: Mode; compact?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const resubmit = () => {
    const q = form.current?.querySelector<HTMLInputElement>("input[name=q]")?.value.trim();
    if (q) form.current?.requestSubmit();
  };

  return (
    <form ref={form} action="/" method="get" className={compact ? "search compact" : "search"} role="search">
      <div className="field">
        <span className="sect" aria-hidden>§</span>
        <input
          name="q"
          defaultValue={query}
          placeholder="Describe what happened, in your own words…"
          aria-label="Your grievance"
          autoComplete="off"
          maxLength={500}
          required
        />
        <button className="go" type="submit">
          Search <span aria-hidden>→</span>
        </button>
      </div>
      <div className="modes" role="radiogroup" aria-label="How to search">
        {(Object.keys(MODE_INFO) as Mode[]).map((m) => (
          <label className="mode" key={m} title={MODE_INFO[m].blurb}>
            <input type="radio" name="mode" value={m} defaultChecked={m === mode} onChange={resubmit} />
            <span>
              {MODE_INFO[m].label}
              <em>{MODE_INFO[m].tech}</em>
            </span>
          </label>
        ))}
      </div>
    </form>
  );
}
