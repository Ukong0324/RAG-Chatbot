import { env } from '../core/env.js';
import { createChromaClient } from '../core/chromaClient.js';
import { loadDocuments } from '../core/loaders.js';
import { createSplitter } from '../core/splitter.js';
import { getVectorStore } from '../core/vectorstore.js';

/**
 * Deletes the target Chroma collection when RESET_COLLECTION is enabled.
 *
 * Rationale:
 * - During early development, re-ingesting the same corpus repeatedly is common.
 * - Resetting avoids duplicated vectors and makes results deterministic across runs.
 *
 * Safety:
 * - Deletion is guarded by an explicit environment flag.
 * - Missing collection errors are swallowed intentionally (idempotent behavior).
 */
async function resetCollectionIfNeeded(): Promise<void> {
  if (!env.RESET_COLLECTION) return;

  const client = createChromaClient();

  try {
    await client.deleteCollection({ name: env.CHROMA_COLLECTION });
    console.log(`Deleted collection: ${env.CHROMA_COLLECTION}`);
  } catch {
    // Ignore if the collection does not exist.
  }
}

/**
 * CLI entrypoint for ingestion.
 *
 * Pipeline:
 * 1) Optionally reset the target collection (development convenience).
 * 2) Load documents from DATA_DIR (PDF/TXT/MD, depending on loaders).
 * 3) Split documents into chunks suitable for embedding + retrieval.
 * 4) Embed and upsert chunks into Chroma via the vector store adapter.
 */
async function main(): Promise<void> {
  await resetCollectionIfNeeded();

  // Load raw documents from the configured data directory.
  const rawDocs = await loadDocuments(env.DATA_DIR);

  // Short-circuit when no inputs are present.
  if (rawDocs.length === 0) {
    console.log(`No documents found in: ${env.DATA_DIR}`);
    return;
  }

  // Split documents into smaller chunks to improve retrieval granularity.
  const splitter = createSplitter();
  const chunks = await splitter.splitDocuments(rawDocs);

  // Initialize the vector store and ingest chunks.
  // Embeddings are computed client-side (e.g., OpenAIEmbeddings) before upserting into Chroma.
  const store = getVectorStore();
  await store.addDocuments(chunks);

  // Summary output for quick verification in CI/local runs.
  console.log('Ingest complete.');
  console.log(`Documents: ${rawDocs.length}`);
  console.log(`Chunks: ${chunks.length}`);
  console.log(`Chroma collection: ${env.CHROMA_COLLECTION}`);
}

/**
 * Top-level error handler for the CLI.
 * Prints a useful stack trace and exits with non-zero status.
 */
main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(err.message);
    console.error(err.stack);
  } else {
    console.error(err);
  }
  process.exit(1);
});
