import { embeddableText, loadCorpus } from "../src/lib/corpus";
import { embed } from "../src/lib/embed";

const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

const { cases } = loadCorpus();
let worst = 1;
for (const c of cases) {
  const sim = cosine(await embed(embeddableText(c)), c.embedding);
  worst = Math.min(worst, sim);
  console.log(`${sim.toFixed(6)}  ${c.id}`);
}
console.log(`\nlowest cosine between the TypeScript and Python vectors: ${worst.toFixed(6)}`);
process.exit(worst > 0.995 ? 0 : 1);
