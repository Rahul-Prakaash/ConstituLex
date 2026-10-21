"use server";

import { redirect } from "next/navigation";
import { clearToken, setToken, token } from "@/lib/admin";
import { backend } from "@/lib/backend";

export type FormState = { error?: string; done?: string } | undefined;

type Login = { ok: boolean; token?: string; reason?: string; remaining?: number; retry_after?: number };

export async function signIn(_prev: FormState, form: FormData): Promise<FormState> {
  const username = String(form.get("username") ?? "").slice(0, 64);
  const password = String(form.get("password") ?? "").slice(0, 256);
  if (!username || !password) return { error: "Enter a username and a password." };

  const { db } = await backend();
  const r = await db.rpc<Login>("admin_login", { p_username: username, p_password: password });
  if (!r.ok || !r.token) {
    if (r.reason === "locked") {
      const minutes = Math.max(1, Math.ceil((r.retry_after ?? 900) / 60));
      return { error: `Too many attempts. Sign-in for this username is paused for ${minutes} minute${minutes === 1 ? "" : "s"}.` };
    }
    const left = r.remaining ?? 0;
    return { error: `That username and password do not match.${left > 0 && left < 3 ? ` ${left} attempt${left === 1 ? "" : "s"} left before a pause.` : ""}` };
  }
  await setToken(r.token);
  redirect("/admin");
}

export async function signOut() {
  const t = await token();
  if (t) {
    const { db } = await backend();
    await db.rpc("admin_logout", { p_token: t }).catch(() => null);
  }
  await clearToken();
  redirect("/admin");
}

export async function changePassword(_prev: FormState, form: FormData): Promise<FormState> {
  const t = await token();
  if (!t) redirect("/admin");
  const current = String(form.get("current") ?? "").slice(0, 256);
  const next = String(form.get("next") ?? "").slice(0, 256);
  if (next !== String(form.get("confirm") ?? "")) return { error: "The two new passwords are different." };

  const { db } = await backend();
  const r = await db.rpc<{ ok: boolean; reason?: string }>("admin_change_password", { p_token: t, p_current: current, p_new: next });
  if (!r.ok) {
    if (r.reason === "signed out") redirect("/admin");
    return { error: r.reason ?? "The password was not changed." };
  }
  return { done: "Password changed. Every other session was signed out." };
}
