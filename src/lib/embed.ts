import path from "node:path";
import {
  AutoModel,
  AutoTokenizer,
  env,
  mean_pooling,
  type PreTrainedModel,
  type PreTrainedTokenizer,
  type Tensor,
} from "@huggingface/transformers";

export const MODEL = "Xenova/all-MiniLM-L6-v2";
export const DIMENSIONS = 384;

export const MAX_TOKENS = 256;

env.cacheDir = path.join(process.cwd(), ".cache", "models");
if (process.env.CONSTITULEX_OFFLINE === "1") env.allowRemoteModels = false;

type Embedder = { tokenizer: PreTrainedTokenizer; model: PreTrainedModel };
const slot = globalThis as typeof globalThis & { __constitulexEmbedder?: Promise<Embedder> };

export function loadEmbedder(): Promise<Embedder> {
  slot.__constitulexEmbedder ??= Promise.all([
    AutoTokenizer.from_pretrained(MODEL),
    AutoModel.from_pretrained(MODEL, { dtype: "fp32" }),
  ]).then(([tokenizer, model]) => ({ tokenizer, model }));
  return slot.__constitulexEmbedder;
}

export async function embed(text: string): Promise<number[]> {
  const { tokenizer, model } = await loadEmbedder();
  const inputs = tokenizer(text, { truncation: true, max_length: MAX_TOKENS });
  const { last_hidden_state } = (await model(inputs)) as { last_hidden_state: Tensor };
  const pooled = mean_pooling(last_hidden_state, inputs.attention_mask).normalize(2, -1);
  return Array.from(pooled.data as Float32Array);
}

export function vectorLiteral(v: number[]): string {
  return `[${v.map((x) => Number(x.toFixed(7))).join(",")}]`;
}
