import { STRONG, THRESHOLD } from "./retrieval";

export const DOMAIN_COLOURS: Record<string, string> = {
  environmental_harm: "#2b6c47",
  labour_rights: "#1d375c",
  corporate_accountability: "#6b3fa0",
  privacy: "#a47c25",
  housing_eviction: "#cf5f1a",
  discrimination: "#9a2c1f",
  food_consumer_safety: "#17707a",
};

export const domainColour = (domain: string) => DOMAIN_COLOURS[domain] ?? "#3c4657";

export function scoreColour(similarity: number | null): string {
  if (similarity === null) return "#3c4657";
  if (similarity >= STRONG) return "#2b6c47";
  if (similarity >= THRESHOLD) return "#a47c25";
  return "#9a2c1f";
}

export const OUTCOME: Record<string, { label: string; colour: string }> = {
  petitioner: { label: "Petitioner won", colour: "#2b6c47" },
  respondent: { label: "Petitioner lost", colour: "#9a2c1f" },
  partly: { label: "Mixed result", colour: "#a47c25" },
};

export const MODE_INFO = {
  semantic: { label: "Meaning", tech: "pgvector", blurb: "cosine similarity on a 384-d embedding, HNSW index" },
  keyword: { label: "Words", tech: "tsvector", blurb: "weighted full-text search, accent-insensitive, typo fallback" },
  hybrid: { label: "Both", tech: "RRF", blurb: "reciprocal rank fusion of the two lists" },
} as const;

export const isVerbatim = (excerpt: string) => !excerpt.trimStart().toLowerCase().startsWith("holding");
