import { embed, MODEL } from "../src/lib/embed";

const started = Date.now();
const v = await embed("warm-up");
console.log(`${MODEL} ready in .cache/models (${v.length} dimensions, ${Date.now() - started} ms)`);
