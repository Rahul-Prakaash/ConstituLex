import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface Db {
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
}

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export function supabaseDb(sb: SupabaseClient = supabase()): Db {
  return {
    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw new Error(`${fn}: ${error.message}`);
      return data as T;
    },
  };
}

export function pdfUrl(path: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return path && base ? `${base}/storage/v1/object/public/judgments/${encodeURIComponent(path)}` : null;
}
