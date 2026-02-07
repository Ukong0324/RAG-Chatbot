import path from 'node:path';

import type { Document } from '@langchain/core/documents';
import { DirectoryLoader } from '@langchain/classic/document_loaders/fs/directory';
import { TextLoader } from '@langchain/classic/document_loaders/fs/text';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';

import { sanitizeForChromaMetadata } from './metadata.js';

/**
 * Extracts a page number from PDFLoader metadata when available.
 *
 * Implementation notes:
 * - LangChain's PDF loader commonly attaches `loc.pageNumber`, but the exact shape may vary
 *   between versions and loaders. We therefore treat metadata as unknown and read defensively.
 *
 * @param metadata Raw metadata object attached to a Document.
 * @returns A finite page number when present; otherwise null.
 */
function extractPdfPage(metadata: Record<string, unknown>): number | null {
  // PDFLoader commonly provides { loc: { pageNumber: number } } (shape can vary by version).
  const loc = metadata.loc;

  if (typeof loc === 'object' && loc !== null) {
    const pageNumber = (loc as Record<string, unknown>).pageNumber;

    if (typeof pageNumber === 'number' && Number.isFinite(pageNumber)) {
      return pageNumber;
    }
  }

  return null;
}

/**
 * Loads documents from the given directory using file-extension-based loaders.
 *
 * Responsibilities:
 * - Read supported file types (TXT/MD/PDF).
 * - Normalize and sanitize metadata so it is compatible with Chroma constraints.
 *
 * Important:
 * - Chroma metadata values must be primitives (string/number/boolean/null). Loader metadata
 *   frequently contains nested objects (e.g., `loc`), so we normalize to a small stable set.
 *
 * @param dataDir Directory containing input documents.
 * @returns An array of Documents with sanitized metadata.
 */
export async function loadDocuments(dataDir: string): Promise<Document[]> {
  const loader = new DirectoryLoader(dataDir, {
    // Text sources: treat both .txt and .md as plain text for now.
    '.txt': (p: string) => new TextLoader(p),
    '.md': (p: string) => new TextLoader(p),

    // PDFs: extract text content via the PDF loader.
    '.pdf': (p: string) => new PDFLoader(p),
  });

  // Load documents (content + loader-provided metadata).
  const docs = await loader.load();

  // Normalize/sanitize metadata for Chroma.
  for (const d of docs) {
    // `source` is typically a file path provided by the loader.
    const sourcePath = typeof d.metadata.source === 'string' ? d.metadata.source : '';
    const filename = sourcePath ? path.basename(sourcePath) : 'unknown';

    // Page numbers are only applicable to PDFs and may be absent.
    const page = extractPdfPage(d.metadata as Record<string, unknown>);

    // Keep only metadata we intentionally rely on and ensure it is Chroma-safe.
    const normalized: Record<string, unknown> = {
      filename,
      source: sourcePath,
      page, // null allowed
    };

    d.metadata = sanitizeForChromaMetadata(normalized);
  }

  return docs;
}
