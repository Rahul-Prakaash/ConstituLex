export function Setup() {
  return (
    <main className="setup">
      <h1>Connect a database</h1>
      <p>
        ConstituLex reads from Postgres on Supabase. Add your project&apos;s keys, create the schema and load the corpus:
      </p>
      <pre>{`cp .env.example .env.local      # fill in the four values
npm run db:setup                # schema + 30 judgments + 493 Articles
npm run dev`}</pre>
      <p>
        No Supabase project yet? <code>npm run dev:local</code> runs the very same schema in an in-process Postgres with
        pgvector.
      </p>
    </main>
  );
}
