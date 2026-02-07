import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import type { Document } from '@langchain/core/documents';

import { getVectorStore } from '../core/vectorstore.js';

/**
 * Generic metadata bag attached to retrieved Documents.
 * Keep this broad (unknown-based) to avoid coupling to loader-specific metadata shapes.
 */
type Meta = Record<string, unknown>;

/**
 * Minimal vector store surface needed for this CLI.
 * This keeps typed linting stable even when upstream library types vary by version.
 */
type SimilaritySearchCapable = {
  similaritySearch: (query: string, k?: number) => Promise<Array<Document<Meta>>>;
};

/**
 * Reads a string value from metadata safely.
 * @returns The string value if present; otherwise null.
 */
function getString(meta: Meta, key: string): string | null {
  const v = meta[key];
  return typeof v === 'string' ? v : null;
}

/**
 * Reads a finite number value from metadata safely.
 * @returns The number value if present and finite; otherwise null.
 */
function getNumber(meta: Meta, key: string): number | null {
  const v = meta[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Formats a citation label for console output.
 * Prefers `[filename p.N]` when a page number exists; otherwise falls back to `[filename]`.
 */
function formatCite(meta: Meta): string {
  const filename = getString(meta, 'filename') ?? 'unknown';
  const page = getNumber(meta, 'page');
  return page !== null ? `[${filename} p.${page}]` : `[${filename}]`;
}

/**
 * CLI entrypoint.
 * Performs similarity search against the vector store and prints short snippets per match.
 */
async function main(): Promise<void> {
  // Initialize the vector store once for the lifetime of the process.
  const storeRaw = getVectorStore();
  const store = storeRaw as unknown as SimilaritySearchCapable;

  // Interactive prompt loop.
  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      // Prompt for a query. Empty input exits.
      const q = await rl.question('Query (empty to exit): ');
      const query = q.trim();
      if (!query) break;

      // Prompt for retrieval depth (TopK). Defaults to 5.
      const kInput = await rl.question('TopK (default 5): ');
      const kParsed = Number(kInput.trim());
      const k = Number.isFinite(kParsed) && kParsed > 0 ? Math.floor(kParsed) : 5;

      // Retrieve the top-K most similar chunks.
      const results = await store.similaritySearch(query, k);

      console.log(`Results: ${results.length}`);

      for (const r of results) {
        // Metadata is optional and may vary by loader; treat as unknown and read defensively.
        const meta: Meta = (r.metadata ?? {}) as Meta;

        const cite = formatCite(meta);
        const snippet = r.pageContent.slice(0, 220).replace(/\s+/g, ' ').trim();

        console.log(`- ${cite} ${snippet}...`);
      }

      // Separator between queries to keep output readable.
      console.log('');
    }
  } finally {
    // Always close readline to avoid leaving the Node process hanging.
    rl.close();
  }
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
