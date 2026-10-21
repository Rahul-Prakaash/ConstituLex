import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { DATA_DIR, loadCorpus } from "../src/lib/corpus";
import { loadStatements } from "../src/lib/load";
import { required } from "./env";

const corpus = loadCorpus();
const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {}, prepare: false });

try {
  const statements = loadStatements(corpus);
  const started = Date.now();
  await sql.begin(async (tx) => {
    for (const s of statements) await tx.unsafe(s.text, s.params as never[]);
  });
  const [{ cases, links }] = await sql`select (select count(*) from public.cases)::int as cases,
                                              (select count(*) from public.case_articles)::int as links`;
  console.log(`corpus   ${cases} cases, ${corpus.articles.length} Articles, ${links} case↔Article links in one transaction (${Date.now() - started} ms)`);
} finally {
  await sql.end();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.log("pdfs     skipped (set SUPABASE_SERVICE_ROLE_KEY to upload the judgments to Storage)");
} else {
  const storage = createClient(url, serviceKey, { auth: { persistSession: false } }).storage;
  const { data: buckets } = await storage.listBuckets();
  if (!buckets?.some((b) => b.name === "judgments")) {
    const { error } = await storage.createBucket("judgments", { public: true, allowedMimeTypes: ["application/pdf"] });
    if (error) throw error;
  }
  let uploaded = 0;
  for (const c of corpus.cases) {
    if (!c.pdf_file) continue;
    const body = readFileSync(path.join(DATA_DIR, "judgments", c.pdf_file));
    const { error } = await storage.from("judgments").upload(c.pdf_file, body, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(`${c.pdf_file}: ${error.message}`);
    uploaded++;
  }
  console.log(`pdfs     ${uploaded} judgments in the public "judgments" bucket`);
}
