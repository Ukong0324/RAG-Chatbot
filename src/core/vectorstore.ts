import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OpenAIEmbeddings } from '@langchain/openai';

import { env } from './env.js';
import { createChromaClient } from './chromaClient.js';

/**
 * Creates the embeddings implementation used by the vector store.
 *
 * Notes:
 * - Embeddings are generated client-side (not by Chroma). This keeps deployment simple and portable.
 * - The OpenAI API key is loaded from validated environment configuration.
 */
export function createEmbeddings(): OpenAIEmbeddings {
  return new OpenAIEmbeddings({
    apiKey: env.OPENAI_API_KEY,
  });
}

/**
 * Returns a configured Chroma vector store instance.
 *
 * Design choices:
 * - We inject a preconfigured ChromaClient via `index` to control connection settings
 *   (host/port/ssl) and to avoid deprecated URL/path initialization paths.
 * - The store is created per-process and reused by CLI commands to avoid repeated setup.
 */
export function getVectorStore(): Chroma {
  const embeddings = createEmbeddings();
  const client = createChromaClient();

  return new Chroma(embeddings, {
    collectionName: env.CHROMA_COLLECTION,
    index: client,
  });
}
