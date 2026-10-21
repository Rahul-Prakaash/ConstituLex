import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm, PasswordForm } from "@/components/AdminForms";
import { Setup } from "@/components/Setup";
import { currentSession, overview, type Overview } from "@/lib/admin";
import { configured } from "@/lib/backend";
import { domainColour } from "@/lib/style";
import { signOut } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Administrator", robots: { index: false, follow: false } };

const TABS = [
  { id: "usage", label: "Usage" },
  { id: "security", label: "Security" },
  { id: "account", label: "Account" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const BAND_COLOUR: Record<string, string> = { strong: "#2b6c47", plausible: "#a47c25", weak: "#9a2c1f", none: "#847a6a" };
const MODE_COLOUR: Record<string, string> = { semantic: "#1d375c", keyword: "#cf5f1a", hybrid: "#6b3fa0" };
const ACTION_COLOUR: Record<string, string> = { login: "#2b6c47", session: "#847a6a", password: "#a47c25", admin: "#1d375c" };

type Props = { searchParams: Promise<{ tab?: string; days?: string }> };

export default async function AdminPage({ searchParams }: Props) {
  if (!configured()) return <Setup />;
  const session = await currentSession();
  if (!session) return <Gate />;

  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === params.tab) ? (params.tab as Tab) : "usage";
  const days = params.days === "30" ? 30 : 7;
  const o = await overview(days);
  if (!o) return <Gate />;

  return (
    <main className="admin">
      <div className="ahead">
        <div>
          <div className="kicker env">Administrator · signed in</div>
          <h1>Console</h1>
        </div>
        <div className="who">
          signed in as <b>{o.me}</b>
          <br />
          {o.sessions} active session{o.sessions === 1 ? "" : "s"} · idle limit 15 min
        </div>
        <form action={signOut}>
          <button className="ghost" type="submit">Sign out</button>
        </form>
      </div>

      <nav className="tabs" aria-label="Console sections">
        {TABS.map((t) => (
          <Link key={t.id} href={`/admin?tab=${t.id}${days === 30 ? "&days=30" : ""}`} className={t.id === tab ? "on" : ""}>
            {t.label}
          </Link>
        ))}
        {tab === "usage" && (
          <span className="range">
            <Link href="/admin?tab=usage" className={days === 7 ? "on" : ""}>7 days</Link>
            <Link href="/admin?tab=usage&days=30" className={days === 30 ? "on" : ""}>30 days</Link>
          </span>
        )}
      </nav>

      {tab === "usage" && <Usage o={o} />}
      {tab === "security" && <Security o={o} />}
      {tab === "account" && <Account o={o} />}
    </main>
  );
}

function Gate() {
  return (
    <main className="gate">
      <Link href="/" className="back">← Back to search</Link>
      <div className="gate-card">
        <div className="seal" aria-hidden>
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6L12 3Z" />
            <path d="m9 12 2.2 2.2L15.2 10" />
          </svg>
        </div>
        <h1>Administrator</h1>
        <p>Sign in to see how the corpus is being used and who has been in.</p>
        <LoginForm />
        <ul className="guards">
          <li><b>bcrypt</b> hashes, checked inside Postgres — the password never leaves the server</li>
          <li><b>Five wrong attempts</b> pause that username for 15 minutes</li>
          <li><b>Sessions</b> end after 15 idle minutes or 8 hours, in an httpOnly cookie</li>
          <li><b>Every attempt</b> is written to a hash-chained audit log</li>
        </ul>
      </div>
    </main>
  );
}

function Tiles({ items }: { items: { value: string; label: string; colour: string }[] }) {
  return (
    <div className="tiles">
      {items.map((t) => (
        <div className="tile" key={t.label} style={{ "--c": t.colour } as React.CSSProperties}>
          <b>{t.value}</b>
          <span>{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function HBars({ rows, empty }: { rows: { label: string; value: number; colour: string }[]; empty: string }) {
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  const peak = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar" key={r.label}>
          <div className="top">
            <span>{r.label}</span>
            <b>{r.value}</b>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${(r.value / peak) * 100}%`, background: r.colour }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

function Usage({ o }: { o: Overview }) {
  const u = o.usage;
  const peak = Math.max(...o.per_day.map((d) => d.searches), 1);
  const share = u.searches ? Math.round((u.matched / u.searches) * 100) : 0;
  return (
    <>
      <Tiles
        items={[
          { value: String(u.searches), label: `searches in the last ${o.days} days`, colour: "#1d375c" },
          { value: `${share}%`, label: "found a judgment above the line", colour: "#2b6c47" },
          { value: String(u.distinct), label: "different questions asked", colour: "#a47c25" },
          { value: `${Math.round(u.p95_ms)} ms`, label: "95th-percentile search time", colour: "#cf5f1a" },
        ]}
      />
      <div className="duo">
        <section className="panel">
          <h3>Searches per day</h3>
          <div className="cols">
            {o.per_day.map((d, i) => (
              <div className={`c${i === o.per_day.length - 1 ? " today" : ""}`} key={d.day} title={`${d.searches} searches, ${d.matched} matched`}>
                <span className={d.searches ? "n" : "n z"}>{d.searches}</span>
                <div className="stack" style={{ height: `${(d.searches / peak) * 100}%` }}>
                  <i className="m" style={{ flex: d.matched }} />
                  <i className="u" style={{ flex: d.searches - d.matched }} />
                </div>
                <span className="d">{new Date(d.day).toLocaleDateString("en-IN", o.days > 7 ? { day: "numeric" } : { weekday: "short" })}</span>
              </div>
            ))}
          </div>
          <div className="key">
            <span style={{ "--c": "#2b6c47" } as React.CSSProperties}><i />found a judgment</span>
            <span style={{ "--c": "#d8ccb6" } as React.CSSProperties}><i />nothing close enough</span>
          </div>
        </section>
        <section className="panel">
          <h3>How people searched</h3>
          <HBars rows={o.by_mode.map((m) => ({ label: m.mode, value: m.searches, colour: MODE_COLOUR[m.mode] ?? "#3c4657" }))} empty="No searches yet." />
          <h3 style={{ marginTop: 24 }}>How sure the answer was</h3>
          <HBars rows={o.by_band.map((b) => ({ label: b.band, value: b.searches, colour: BAND_COLOUR[b.band] ?? "#3c4657" }))} empty="No searches yet." />
        </section>
      </div>
      <div className="duo">
        <section className="panel">
          <h3>Grievances people brought</h3>
          <HBars rows={o.by_domain.map((d) => ({ label: d.label, value: d.searches, colour: domainColour(d.domain) }))} empty="No matched searches yet." />
        </section>
        <section className="panel">
          <h3>Judgments most often found</h3>
          <HBars rows={o.top_cases.map((c) => ({ label: c.title, value: c.searches, colour: "#a47c25" }))} empty="No matched searches yet." />
        </section>
      </div>
      <section className="panel">
        <h3>Latest searches</h3>
        {o.recent.length === 0 ? (
          <p className="empty">Nothing searched yet. Ask the site a question and it appears here.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>When</th><th>Question</th><th>Mode</th><th>Answer</th><th className="num">Time</th></tr>
            </thead>
            <tbody>
              {o.recent.map((r, i) => (
                <tr key={i}>
                  <td className="mono">{when(r.at)}</td>
                  <td className="q">{r.query}</td>
                  <td><span className="tag" style={{ "--c": MODE_COLOUR[r.mode] } as React.CSSProperties}>{r.mode}</span></td>
                  <td>
                    <span className="tag" style={{ "--c": BAND_COLOUR[r.band] } as React.CSSProperties}>{r.band}</span>
                    {r.top_case && <Link className="mono link" href={`/case/${r.top_case}`}> {r.top_case}</Link>}
                  </td>
                  <td className="num">{r.ms ?? "–"} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="foot2">Only the question, the mode and the answer band are kept — no IP address, no cookie, nothing about who asked.</p>
      </section>
    </>
  );
}

function Security({ o }: { o: Overview }) {
  const s = o.signins;
  const posture = [
    { ok: o.rls.every((t) => t.rls), name: "Row level security", value: `${o.rls.filter((t) => t.rls).length} / ${o.rls.length} tables`, why: "Every table refuses the public key unless a policy allows it. Admin tables have no policy at all." },
    { ok: o.chain.ok, name: "Audit chain", value: o.chain.ok ? `${o.chain.entries} entries intact` : `broken at #${o.chain.broken_at}`, why: "Each entry carries the SHA-256 of the one before it, so an edited or deleted row shows." },
    { ok: true, name: "Password storage", value: "bcrypt · cost 10", why: "Hashed by pgcrypto inside Postgres. Unknown usernames cost the same time as wrong passwords." },
    { ok: true, name: "Lockout", value: "5 tries · 15 min", why: "Counted per username in the database, so restarting the app does not reset it." },
    { ok: true, name: "Sessions", value: "15 min idle · 8 h max", why: "A random 256-bit token in an httpOnly, SameSite=Strict cookie. Only its hash is stored." },
  ];
  return (
    <>
      <Tiles
        items={[
          { value: `${posture.filter((p) => p.ok).length}/${posture.length}`, label: "protections in place", colour: "#2b6c47" },
          { value: String(s.success), label: "sign-ins in the last 7 days", colour: "#1d375c" },
          { value: String(s.failure), label: "wrong passwords", colour: "#a47c25" },
          { value: String(s.locked + s.blocked), label: "times a username was paused or refused", colour: "#9a2c1f" },
        ]}
      />
      <div className="duo">
        <section className="panel">
          <h3>Posture</h3>
          <div className="post">
            {posture.map((p) => (
              <div key={p.name} style={{ "--c": p.ok ? "#2b6c47" : "#9a2c1f" } as React.CSSProperties}>
                <i />
                <div>
                  <b>{p.name}</b> <em>{p.value}</em>
                  <p>{p.why}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h3>Audit log <span className={o.chain.ok ? "ok" : "bad"}>{o.chain.ok ? "chain verified" : "chain broken"}</span></h3>
          <table className="tbl">
            <tbody>
              {o.audit.map((e) => {
                const family = e.action.split(".")[0];
                return (
                  <tr key={e.seq}>
                    <td className="mono">#{e.seq}</td>
                    <td><span className="tag" style={{ "--c": e.ok ? ACTION_COLOUR[family] ?? "#847a6a" : "#9a2c1f" } as React.CSSProperties}>{e.action}</span></td>
                    <td className="q">{e.actor}</td>
                    <td className="mono">{when(e.at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function Account({ o }: { o: Overview }) {
  return (
    <div className="duo">
      <section className="panel">
        <h3>Change your password</h3>
        <PasswordForm />
      </section>
      <section className="panel">
        <h3>Administrators</h3>
        <table className="tbl">
          <thead>
            <tr><th>Username</th><th>Last sign-in</th><th>Password set</th></tr>
          </thead>
          <tbody>
            {o.admins.map((a) => (
              <tr key={a.username}>
                <td className="q">{a.username}{a.username === o.me && <span className="tag" style={{ "--c": "#2b6c47", marginLeft: 8 } as React.CSSProperties}>you</span>}</td>
                <td className="mono">{when(a.last_login_at)}</td>
                <td className="mono">{when(a.password_changed_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="foot2">
          Accounts are created from the command line only — <code>npm run admin:create -- &lt;username&gt;</code> — so the website itself can never make one.
        </p>
      </section>
    </div>
  );
}
