import Link from "next/link";
import { Inspector } from "@/components/Inspector";
import { ResultCard } from "@/components/ResultCard";
import { SearchForm } from "@/components/SearchForm";
import { Setup } from "@/components/Setup";
import { Wheel } from "@/components/Wheel";
import { backend, configured } from "@/lib/backend";
import { corpusStats, MODES, search, STRONG, THRESHOLD } from "@/lib/retrieval";
import { domainColour } from "@/lib/style";
import type { Mode } from "@/lib/types";

export const dynamic = "force-dynamic";

const EXAMPLES = [
  "They knocked down our huts without telling us",
  "A factory near my village is polluting our drinking water",
  "My employer makes me work without wages",
  "An app took my fingerprints without asking",
  "Harassed at work by a colleague",
];

type Props = { searchParams: Promise<{ q?: string; mode?: string }> };

export default async function Home({ searchParams }: Props) {
  if (!configured()) return <Setup />;
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 500);
  const mode: Mode = MODES.includes(params.mode as Mode) ? (params.mode as Mode) : "semantic";
  return query ? <Results query={query} mode={mode} /> : <Landing />;
}

async function Landing() {
  const { db } = await backend();
  const stats = await corpusStats(db);
  const peak = Math.max(...stats.domains.map((d) => d.cases), 1);
  const peakArt = Math.max(...stats.top_articles.map((a) => a.cases), 1);

  return (
    <main>
      <section className="hero">
        <div>
          <div className="kicker">Constitution of India · Supreme Court</div>
          <h1>
            Constitu<i>Lex</i>
          </h1>
          <p className="lede">
            Say what happened in <b>ordinary words</b>. Get back the <b>case that decided it</b>, the <b>Articles</b> it
            turned on, and the judgment itself.
          </p>
          <SearchForm />
          <div className="examples">
            <small>Try</small>
            {EXAMPLES.map((e) => (
              <Link key={e} href={`/?${new URLSearchParams({ q: e })}`}>
                {e}
              </Link>
            ))}
          </div>
        </div>
        <Wheel />
      </section>

      <div className="sect-h" id="how">
        <h2>Three ways to ask Postgres</h2>
        <span>all of it inside the database</span>
      </div>
      <section className="ways">
        <div className="way">
          <span className="n">i</span>
          <code>match_cases()</code>
          <h3>By meaning</h3>
          <p>
            Your question becomes 384 numbers. pgvector compares them with every judgment by cosine distance, served by an
            HNSW index, so “huts knocked down” finds an eviction case that never says “huts”.
          </p>
        </div>
        <div className="way">
          <span className="n">ii</span>
          <code>keyword_cases()</code>
          <h3>By words</h3>
          <p>
            Weighted full text — title, then summary, then the quoted passages — that ignores accents, so “nestle” finds
            Nestlé, and falls back to trigram matching when a name is misspelt.
          </p>
        </div>
        <div className="way">
          <span className="n">iii</span>
          <code>hybrid_cases()</code>
          <h3>By both</h3>
          <p>
            Reciprocal rank fusion: each list votes 1 / (60 + rank) for its cases, so a judgment both methods agree on rises
            to the top.
          </p>
        </div>
      </section>

      <div className="sect-h" id="corpus">
        <h2>The corpus</h2>
        <span>
          {stats.years[0]}–{stats.years[1]}
        </span>
      </div>
      <section className="corpus">
        <div className="panel">
          <h3>Judgments by grievance</h3>
          <div className="bars">
            {stats.domains.map((d) => (
              <div className="bar" key={d.id}>
                <div className="top">
                  <span>{d.label}</span>
                  <b>{d.cases}</b>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${(d.cases / peak) * 100}%`, background: domainColour(d.id) }} />
                </div>
              </div>
            ))}
          </div>
          <div className="figures">
            <div>
              <b>{stats.cases}</b>
              <span>judgments</span>
            </div>
            <div>
              <b>{stats.articles}</b>
              <span>Articles</span>
            </div>
            <div>
              <b>{stats.cited}</b>
              <span>Articles cited</span>
            </div>
          </div>
        </div>
        <div className="panel">
          <h3>Articles the court relied on most</h3>
          <div className="bars">
            {stats.top_articles.map((a) => (
              <div className="bar" key={a.id}>
                <div className="top">
                  <span>
                    <span className="chip" style={{ marginRight: 8 }}>
                      Art. {a.label}
                    </span>
                    {a.title}
                  </span>
                  <b>{a.cases}</b>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${(a.cases / peakArt) * 100}%`, background: "var(--gold)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

async function Results({ query, mode }: { query: string; mode: Mode }) {
  const { db, kind } = await backend();
  let result;
  try {
    result = await search(db, query, { mode });
  } catch (e) {
    return (
      <main>
        <SearchForm query={query} mode={mode} compact />
        <div className="note">
          <b>The search could not run.</b> {(e as Error).message}
        </div>
      </main>
    );
  }

  const top = result.hits[0];
  return (
    <main>
      <SearchForm query={query} mode={mode} compact />
      <div className="results">
        <section aria-label="Results">
          <div className="verdict-bar">
            <span className={`band ${result.band}`}>{result.band === "none" ? "no match" : result.band}</span>
            <span>
              <b>{result.hits.length}</b> {result.hits.length === 1 ? "judgment" : "judgments"} for “{query}”
              {kind === "local" ? " · local Postgres" : " · Supabase"}
            </span>
          </div>
          {result.band === "weak" && (
            <div className="note">
              <b>Nothing close enough.</b> The best match scores {result.confidence.toFixed(3)}, under the {THRESHOLD} line
              measured for this corpus. Treat what follows as a lead, not an answer.
            </div>
          )}
          {result.band === "none" && (
            <div className="note">
              <b>No judgment matched.</b> Try describing what happened rather than naming a case, or search by meaning.
            </div>
          )}
          {result.hits.map((h, i) => (
            <ResultCard key={h.card.id} hit={h} rank={i + 1} query={query} mode={mode} />
          ))}
          {top && result.band === "strong" && mode !== "keyword" && (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>
              The first result clears {STRONG}, the level at which this corpus&apos;s matches have always been on-topic.
            </p>
          )}
        </section>
        <Inspector result={result} />
      </div>
    </main>
  );
}
