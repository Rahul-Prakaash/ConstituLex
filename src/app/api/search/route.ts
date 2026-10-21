import { NextResponse, type NextRequest } from "next/server";
import { backend, configured } from "@/lib/backend";
import { MODES, search } from "@/lib/retrieval";
import type { Mode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!configured()) return NextResponse.json({ error: "No database configured." }, { status: 503 });
  const p = req.nextUrl.searchParams;
  const q = (p.get("q") ?? "").trim().slice(0, 500);
  if (!q) return NextResponse.json({ error: "Pass the grievance as ?q=" }, { status: 400 });
  const mode = (MODES.includes(p.get("mode") as Mode) ? p.get("mode") : "semantic") as Mode;
  const limit = Number(p.get("limit") ?? 5) || 5;

  try {
    const { db } = await backend();
    const r = await search(db, q, { mode, limit, domain: p.get("domain") || null });
    await db
      .rpc("log_search", { p_query: q, p_mode: mode, p_band: r.band, p_top: r.hits[0]?.card.id ?? null, p_ms: Math.round(r.timings.totalMs) })
      .catch(() => null);
    return NextResponse.json({
      query: r.query,
      mode: r.mode,
      band: r.band,
      confidence: r.confidence,
      timings: r.timings,
      hits: r.hits.map((h) => ({
        id: h.card.id,
        title: h.card.title,
        citation: h.card.citation,
        year: h.card.year,
        domain: h.card.domain,
        articles: h.card.articles,
        score: h.score,
        similarity: h.similarity,
        snippet: h.snippet,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
