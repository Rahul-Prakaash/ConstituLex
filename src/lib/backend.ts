import "server-only";
import { supabaseDb, type Db } from "./db";

export type Backend = { db: Db; kind: "supabase" | "local" };

const slot = globalThis as typeof globalThis & { __constitulexLocal?: Promise<Db> };

export function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || process.env.CONSTITULEX_LOCAL_DB === "1";
}

export async function backend(): Promise<Backend> {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { db: supabaseDb(), kind: "supabase" };
  }
  if (process.env.CONSTITULEX_LOCAL_DB === "1") {
    slot.__constitulexLocal ??= import("./local").then(async (m) => m.pgliteDb(await m.freshDatabase()));
    return { db: await slot.__constitulexLocal, kind: "local" };
  }
  throw new Error("No database configured.");
}
