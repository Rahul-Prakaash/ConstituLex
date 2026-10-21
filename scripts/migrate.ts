import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { required } from "./env";

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {}, prepare: false });
const dir = path.join(process.cwd(), "supabase", "migrations");

try {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    const started = Date.now();
    await sql.unsafe(readFileSync(path.join(dir, file), "utf8"));
    console.log(`applied  ${file}  (${Date.now() - started} ms)`);
  }
} finally {
  await sql.end();
}
