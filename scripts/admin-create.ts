import { randomInt } from "node:crypto";
import postgres from "postgres";
import { required } from "./env";

const username = process.argv[2];
if (!username) {
  console.error("Usage: npm run admin:create -- <username>");
  process.exit(1);
}

const SETS = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "-_.!@#%+="];
const pick = (s: string) => s[randomInt(s.length)];
const chars = SETS.map(pick);
while (chars.length < 20) chars.push(pick(SETS.join("")));
for (let i = chars.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [chars[i], chars[j]] = [chars[j], chars[i]];
}
const password = chars.join("");

const sql = postgres(required("DATABASE_URL"), { max: 1, onnotice: () => {}, prepare: false });
try {
  const [row] = await sql<{ r: { username: string; created: boolean } }[]>`select public.admin_create(${username}, ${password}) as r`;
  console.log(`${row.r.created ? "created" : "reset"}  ${row.r.username}`);
  console.log(`password  ${password}`);
  console.log("Shown once and stored nowhere. Sign in at /admin and change it under Account.");
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
