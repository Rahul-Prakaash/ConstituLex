import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db";
import { freshDatabase, pgliteDb } from "./pglite";

type Login = { ok: boolean; token?: string; reason?: string; remaining?: number; retry_after?: number };
type Overview = {
  me: string;
  usage: { searches: number; matched: number; distinct: number };
  per_day: { day: string; searches: number }[];
  by_mode: { mode: string; searches: number }[];
  signins: { success: number; failure: number; locked: number; blocked: number };
  audit: { action: string; ok: boolean }[];
  chain: { ok: boolean; entries: number; broken_at: number | null };
  admins: { username: string }[];
  rls: { table: string; rls: boolean }[];
  corpus: { cases: number };
};

const PASSWORD = "Correct-Horse-42";

let pg: PGlite;
let db: Db;

const login = (u: string, p: string) => db.rpc<Login>("admin_login", { p_username: u, p_password: p });

beforeAll(async () => {
  pg = await freshDatabase();
  db = pgliteDb(pg);
  await pg.query("select public.admin_create($1, $2)", ["warden", PASSWORD]);
});

describe("accounts", () => {
  it("stores a bcrypt hash, never the password", async () => {
    const { rows } = await pg.query<{ pw_hash: string }>("select pw_hash from public.admins where username = 'warden'");
    expect(rows[0].pw_hash).toMatch(/^\$2a\$10\$/);
    expect(rows[0].pw_hash).not.toContain(PASSWORD);
  });

  it("refuses a weak password and a malformed username", async () => {
    await expect(pg.query("select public.admin_create('keeper', 'short')")).rejects.toThrow(/at least 12 characters/);
    await expect(pg.query(`select public.admin_create('Bad Name', '${PASSWORD}')`)).rejects.toThrow(/username/);
  });

  it("keeps every admin table out of the public's reach", async () => {
    for (const t of ["admins", "admin_sessions", "login_throttle", "audit_log", "search_log"]) {
      const { rows } = await pg.query<{ rls: boolean; anon: boolean }>(
        `select relrowsecurity as rls, has_table_privilege('anon', 'public.${t}', 'select') as anon
         from pg_class where oid = 'public.${t}'::regclass`);
      expect(rows[0]).toEqual({ rls: true, anon: false });
    }
  });

  it("lets the public call sign-in but never create an account or write the audit log", async () => {
    const can = async (fn: string) =>
      (await pg.query<{ ok: boolean }>(`select has_function_privilege('anon', '${fn}', 'execute') as ok`)).rows[0].ok;
    expect(await can("public.admin_login(text, text)")).toBe(true);
    expect(await can("public.admin_create(text, text)")).toBe(false);
    expect(await can("public.write_audit(text, text, text, boolean, jsonb)")).toBe(false);
    expect(await can("public.session_user_for(text)")).toBe(false);
  });
});

describe("signing in", () => {
  it("issues a 256-bit token and stores only its hash", async () => {
    const r = await login("Warden", PASSWORD);
    expect(r.ok).toBe(true);
    expect(r.token).toMatch(/^[0-9a-f]{64}$/);
    const { rows } = await pg.query<{ n: number }>("select count(*)::int as n from public.admin_sessions where token_hash = $1", [r.token]);
    expect(rows[0].n).toBe(0);
    expect(await db.rpc("admin_session", { p_token: r.token })).toMatchObject({ username: "warden" });
  });

  it("gives the same answer for a wrong password and an unknown user", async () => {
    const a = await login("warden", "Wrong-password-1");
    const b = await login("nobody", "Wrong-password-1");
    expect(a.reason).toBe("bad");
    expect(b.reason).toBe("bad");
    await login("warden", PASSWORD);
  });

  it("pauses a username after five failures, even for the right password", async () => {
    for (let i = 0; i < 4; i++) expect((await login("warden", `nope-${i}`)).reason).toBe("bad");
    const fifth = await login("warden", "nope-4");
    expect(fifth).toMatchObject({ ok: false, reason: "locked", retry_after: 900 });
    expect((await login("warden", PASSWORD)).reason).toBe("locked");
    await pg.query("update public.login_throttle set locked_until = now() - interval '1 second'");
    expect((await login("warden", PASSWORD)).ok).toBe(true);
  });

  it("expires an idle session and ends one on sign-out", async () => {
    const idle = (await login("warden", PASSWORD)).token!;
    await pg.query("update public.admin_sessions set last_seen = now() - interval '16 minutes' where token_hash = encode(extensions.digest($1, 'sha256'), 'hex')", [idle]);
    expect(await db.rpc("admin_session", { p_token: idle })).toBeNull();

    const live = (await login("warden", PASSWORD)).token!;
    expect(await db.rpc("admin_logout", { p_token: live })).toEqual({ ok: true });
    expect(await db.rpc("admin_session", { p_token: live })).toBeNull();
  });

  it("rejects anything that is not a token", async () => {
    for (const t of [null, "", "x", "' or 1=1 --", "f".repeat(65)]) expect(await db.rpc("admin_session", { p_token: t })).toBeNull();
  });
});

describe("changing the password", () => {
  it("needs the current one and signs out every other session", async () => {
    const mine = (await login("warden", PASSWORD)).token!;
    const other = (await login("warden", PASSWORD)).token!;
    const wrong = await db.rpc<{ ok: boolean; reason: string }>("admin_change_password", { p_token: mine, p_current: "guess", p_new: "Another-Pass-99" });
    expect(wrong).toMatchObject({ ok: false, reason: /current password is wrong/ });
    const weak = await db.rpc<{ ok: boolean; reason: string }>("admin_change_password", { p_token: mine, p_current: PASSWORD, p_new: "weak" });
    expect(weak.ok).toBe(false);
    expect(await db.rpc("admin_change_password", { p_token: mine, p_current: PASSWORD, p_new: "Another-Pass-99" })).toEqual({ ok: true });
    expect(await db.rpc("admin_session", { p_token: mine })).not.toBeNull();
    expect(await db.rpc("admin_session", { p_token: other })).toBeNull();
    expect((await login("warden", "Another-Pass-99")).ok).toBe(true);
    await pg.query("select public.admin_create('warden', $1)", [PASSWORD]);
  });
});

describe("the console", () => {
  it("is closed without a session", async () => {
    await expect(db.rpc("admin_overview", { p_token: "0".repeat(64), p_days: 7 })).rejects.toThrow(/Not signed in/);
  });

  it("reports searches, sign-ins and the corpus", async () => {
    await db.rpc("log_search", { p_query: "huts knocked down", p_mode: "semantic", p_band: "strong", p_top: "olga-tellis", p_ms: 120 });
    await db.rpc("log_search", { p_query: "Huts knocked down", p_mode: "semantic", p_band: "strong", p_top: "olga-tellis", p_ms: 80 });
    await db.rpc("log_search", { p_query: "cookies on a website", p_mode: "keyword", p_band: "none", p_top: null, p_ms: 30 });
    const token = (await login("warden", PASSWORD)).token!;
    const o = await db.rpc<Overview>("admin_overview", { p_token: token, p_days: 7 });
    expect(o.me).toBe("warden");
    expect(o.usage).toMatchObject({ searches: 3, matched: 2, distinct: 2 });
    expect(o.per_day).toHaveLength(7);
    expect(o.per_day.at(-1)!.searches).toBe(3);
    expect(o.by_mode[0]).toEqual({ mode: "semantic", searches: 2 });
    expect(o.signins.locked).toBe(1);
    expect(o.signins.failure).toBeGreaterThanOrEqual(5);
    expect(o.admins.map((a) => a.username)).toEqual(["warden"]);
    expect(o.rls.every((t) => t.rls)).toBe(true);
    expect(o.corpus.cases).toBe(30);
  });
});

describe("the audit log", () => {
  it("chains every entry to the one before it", async () => {
    const chain = await db.rpc<{ ok: boolean; entries: number }>("verify_audit_chain");
    expect(chain.ok).toBe(true);
    expect(chain.entries).toBeGreaterThan(10);
  });

  it("notices an edited entry", async () => {
    await pg.query("update public.audit_log set ok = true where action = 'login.locked'");
    const chain = await db.rpc<{ ok: boolean; broken_at: number }>("verify_audit_chain");
    expect(chain.ok).toBe(false);
    expect(chain.broken_at).toBeGreaterThan(0);
    await pg.query("update public.audit_log set ok = false where action = 'login.locked'");
    expect((await db.rpc<{ ok: boolean }>("verify_audit_chain")).ok).toBe(true);
  });
});
