import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node", "@electric-sql/pglite", "@electric-sql/pglite-pgvector"],
  poweredByHeader: false,
};

export default config;
