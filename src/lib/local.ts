import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { unaccent } from "@electric-sql/pglite/contrib/unaccent";
import { vector } from "@electric-sql/pglite-pgvector";
import { loadCorpus } from "./corpus";
import type { Db } from "./db";
import { vectorLiteral } from "./embed";
import { loadStatements } from "./load";

export async function freshDatabase(): Promise<PGlite> {
  const pg = await PGlite.create({ extensions: { vector, unaccent, pg_trgm } });
  const dir = path.join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  await pg.transaction(async (tx) => {
    for (const s of loadStatements(loadCorpus())) await tx.query(s.text, s.params);
  });
  return pg;
}

const SCALAR = new Set(["case_detail", "corpus_stats"]);
const CASTS: Record<string, string> = { query_embedding: "::extensions.vector", ids: "::text[]" };

export function pgliteDb(pg: PGlite): Db {
  return {
    async rpc<T>(fn: string, args: Record<string, unknown> = {}) {
      const names = Object.keys(args);
      const params = names.map((n) => (n === "query_embedding" && Array.isArray(args[n]) ? vectorLiteral(args[n] as number[]) : args[n]));
      const call = `public.${fn}(${names.map((n, i) => `${n} => $${i + 1}${CASTS[n] ?? ""}`).join(", ")})`;
      if (SCALAR.has(fn)) {
        const res = await pg.query<{ result: T }>(`select ${call} as result`, params);
        return res.rows[0]?.result as T;
      }
      const res = await pg.query(`select * from ${call}`, params);
      return res.rows as T;
    },
  };
}
