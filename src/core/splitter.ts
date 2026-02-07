import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

/**
 * Creates the document splitter used during ingestion.
 *
 * Rationale:
 * - Smaller chunks generally improve retrieval precision and reduce hallucination risk.
 * - A modest overlap helps preserve context across chunk boundaries (definitions, equations, etc.).
 *
 * Tuning notes:
 * - chunkSize too small can fragment meaning and hurt recall.
 * - chunkSize too large can dilute similarity search and increase irrelevant matches.
 * - overlap should be large enough to bridge boundaries but not so large that it wastes tokens.
 */
export function createSplitter(): RecursiveCharacterTextSplitter {
  // Conservative defaults optimized for grounding and citation quality.
  return new RecursiveCharacterTextSplitter({
    chunkSize: 1200,
    chunkOverlap: 200,
  });
}
