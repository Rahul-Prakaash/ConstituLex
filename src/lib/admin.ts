import "server-only";
import { cookies } from "next/headers";
import { backend } from "./backend";

export const COOKIE = "clx_admin";
const EIGHT_HOURS = 8 * 60 * 60;

export type Session = { username: string; last_login_at: string | null; password_changed_at: string };

export type Overview = {
  me: string;
  days: number;
  usage: { searches: number; matched: number; distinct: number; p50_ms: number; p95_ms: number };
  per_day: { day: string; searches: number; matched: number }[];
  by_mode: { mode: string; searches: number }[];
  by_band: { band: string; searches: number }[];
  by_domain: { domain: string; label: string; searches: number }[];
  top_cases: { id: string; title: string; searches: number }[];
  recent: { at: string; query: string; mode: string; band: string; top_case: string | null; ms: number | null }[];
  signins: { success: number; failure: number; locked: number; blocked: number };
  audit: { seq: number; at: string; actor: string; action: string; target: string | null; ok: boolean; detail: Record<string, unknown> }[];
  chain: { ok: boolean; entries: number; broken_at: number | null };
  admins: { username: string; created_at: string; last_login_at: string | null; password_changed_at: string; disabled: boolean }[];
  sessions: number;
  rls: { table: string; rls: boolean }[];
  corpus: { cases: number; articles: number; cited: number };
};

export async function token(): Promise<string | null> {
  const value = (await cookies()).get(COOKIE)?.value ?? null;
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

export async function setToken(value: string) {
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: EIGHT_HOURS,
  });
}

export async function clearToken() {
  (await cookies()).delete(COOKIE);
}

export async function currentSession(): Promise<Session | null> {
  const t = await token();
  if (!t) return null;
  const { db } = await backend();
  return db.rpc<Session | null>("admin_session", { p_token: t });
}

export async function overview(days: number): Promise<Overview | null> {
  const t = await token();
  if (!t) return null;
  const { db } = await backend();
  try {
    return await db.rpc<Overview>("admin_overview", { p_token: t, p_days: days });
  } catch {
    return null;
  }
}
