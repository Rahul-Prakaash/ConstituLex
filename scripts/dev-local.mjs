import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, CONSTITULEX_LOCAL_DB: "1", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" },
});
child.on("exit", (code) => process.exit(code ?? 0));
