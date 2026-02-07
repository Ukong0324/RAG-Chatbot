import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { ChatOpenAI } from '@langchain/openai';
import type { Document } from '@langchain/core/documents';

import { env } from './core/env.js';
import { getVectorStore } from './core/vectorstore.js';

/**
 * Generic metadata bag attached to retrieved Documents.
 * We keep this as unknown-based to avoid accidental reliance on unstable loader schemas.
 */
type Meta = Record<string, unknown>;

/**
 * Minimal surface area needed from the vector store.
 * This avoids typed-lint noise when upstream types are incomplete/unstable across versions.
 */
type SimilaritySearchCapable = {
  similaritySearch: (query: string, k?: number) => Promise<Array<Document<Meta>>>;
};

/**
 * Fixed refusal text when the system cannot find enough evidence in the provided corpus.
 * This path MUST not invoke the LLM to minimize hallucination and cost.
 */
const NO_EVIDENCE_MESSAGE =
  'I could not find sufficient evidence in the provided documents (PDF/TXT) to answer your question.';

/**
 * Evidence gating thresholds (score-based).
 * These constants control when we allow the LLM to respond.
 *
 * Notes:
 * - Higher thresholds reduce hallucination but may increase false refusals.
 * - Tune with a small evaluation set (in-domain + out-of-domain queries).
 */
const MIN_OVERLAP_RATIO = 0.45; // Minimum fraction of query tokens found in top retrieved text.
const MIN_MATCHED_TOKENS = 1; // Minimum number of distinct query tokens found in top retrieved text.
const TOP_SOURCES_FOR_SCORING = 3; // Number of top chunks considered for evidence scoring.

/**
 * Reads a string value from metadata safely.
 * @returns The string if present and of type string; otherwise null.
 */
function getString(meta: Meta, key: string): string | null {
  const v = meta[key];
  return typeof v === 'string' ? v : null;
}

/**
 * Reads a finite number value from metadata safely.
 * @returns The number if present, type number, and finite; otherwise null.
 */
function getNumber(meta: Meta, key: string): number | null {
  const v = meta[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Formats a citation label for display.
 * We prefer `[filename p.N]` when a page is available; otherwise `[filename]`.
 */
function formatCite(meta: Meta): string {
  const filename = getString(meta, 'filename') ?? 'unknown';
  const page = getNumber(meta, 'page');
  return page !== null ? `[${filename} p.${page}]` : `[${filename}]`;
}

/**
 * Extracts citations from retrieved documents and de-duplicates while preserving order.
 * We keep this separate from prompt construction so output formatting is consistent.
 */
function extractCitations(docs: Array<Document<Meta>>): string[] {
  const cites = docs.map((d) => formatCite((d.metadata ?? {}) as Meta));
  return Array.from(new Set(cites));
}

/**
 * Builds a compact context string from retrieved documents.
 * We include a stable "Source N [cite]" header so the model can reference evidence implicitly.
 *
 * Important:
 * - Keep context tight (topK only) to reduce distraction and hallucination.
 * - Do not embed a citations section here; citations are rendered by the CLI.
 */
function buildContext(docs: Array<Document<Meta>>): string {
  return docs
    .map((d, i) => {
      const meta: Meta = (d.metadata ?? {}) as Meta;
      const cite = formatCite(meta);
      return `Source ${i + 1} ${cite}\n${d.pageContent}`;
    })
    .join('\n\n');
}

/**
 * Tokenizes input text into a simple alphanumeric token list.
 *
 * Design choice:
 * - This is intentionally simple and language-agnostic for a lightweight evidence heuristic.
 * - We avoid stopword lists to keep behavior predictable and corpus-independent.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/**
 * Computes a lexical overlap score between the question and the top retrieved chunks.
 *
 * This is NOT a semantic score; it is a conservative guardrail that helps reject
 * obviously out-of-domain queries before calling the LLM.
 */
function evidenceScore(
  question: string,
  docs: Array<Document<Meta>>,
): {
  matchedTokens: number;
  totalTokens: number;
  overlapRatio: number;
} {
  // Unique query tokens to avoid overweighting repeated words.
  const qTokens = Array.from(new Set(tokenize(question)));
  const totalTokens = qTokens.length;

  // Empty or too-short queries should never be considered "grounded".
  if (totalTokens === 0) {
    return { matchedTokens: 0, totalTokens: 0, overlapRatio: 0 };
  }

  // Build a limited evidence "haystack" from the top retrieved chunks.
  // We cap per-chunk characters to keep the heuristic stable across very large chunks.
  const hay = docs
    .slice(0, TOP_SOURCES_FOR_SCORING)
    .map((d) => d.pageContent.slice(0, 1600))
    .join(' ')
    .toLowerCase();

  // Count how many distinct query tokens appear in the evidence text.
  let matchedTokens = 0;
  for (const t of qTokens) {
    if (hay.includes(t)) matchedTokens += 1;
  }

  const overlapRatio = matchedTokens / totalTokens;
  return { matchedTokens, totalTokens, overlapRatio };
}

/**
 * Determines whether we have enough evidence to proceed with generation.
 *
 * Policy:
 * - If evidence is insufficient, we MUST refuse without invoking the LLM.
 * - This is the primary control for hallucination minimization.
 */
function hasEnoughEvidence(question: string, docs: Array<Document<Meta>>): boolean {
  // Require at least 2 chunks to reduce single-chunk spurious matches.
  if (docs.length < 2) return false;

  const s = evidenceScore(question, docs);

  // Score-only gate:
  // - require an absolute minimum of matched tokens
  // - and a minimum overlap ratio
  if (s.matchedTokens < MIN_MATCHED_TOKENS) return false;
  if (s.overlapRatio < MIN_OVERLAP_RATIO) return false;

  return true;
}

/**
 * CLI entrypoint.
 * Reads questions from stdin, retrieves evidence, gates by score, and optionally generates an answer.
 */
async function main(): Promise<void> {
  // Initialize vector store once for the lifetime of the process.
  const storeRaw = await getVectorStore();
  const store = storeRaw as unknown as SimilaritySearchCapable;

  // Deterministic generation: temperature 0 and a compact, strict system policy.
  const llm = new ChatOpenAI({
    apiKey: env.OPENAI_API_KEY,
    model: 'gpt-5.2',
    temperature: 0,
  });

  // Readline interface for interactive CLI usage.
  const rl = readline.createInterface({ input, output });

  try {
    while (true) {
      // Prompt for a user question. Empty input exits.
      const q = await rl.question('Question (empty to exit): ');
      const question = q.trim();
      if (!question) break;

      // Prompt for retrieval depth (TopK). Defaults to 8.
      const kInput = await rl.question('TopK (default 8): ');
      const kParsed = Number(kInput.trim());
      const k = Number.isFinite(kParsed) && kParsed > 0 ? Math.floor(kParsed) : 8;

      console.log('Retrieving sources...');
      const retrieved = await store.similaritySearch(question, k);
      console.log(`Retrieved chunks: ${retrieved.length}`);

      // Log heuristic score so tuning can be done empirically.
      const score = evidenceScore(question, retrieved);
      console.log(
        `Evidence score: matchedTokens=${score.matchedTokens}, totalTokens=${score.totalTokens}, overlapRatio=${score.overlapRatio.toFixed(
          3,
        )}`,
      );

      // Hard refusal path: do not invoke the LLM when evidence is weak.
      if (!hasEnoughEvidence(question, retrieved)) {
        console.log(NO_EVIDENCE_MESSAGE);
        console.log('');
        continue;
      }

      // Build context and citations only after evidence passes the gate.
      const context = buildContext(retrieved);
      const citations = extractCitations(retrieved).slice(0, 5);

      // System policy focuses on grounding and anti-fabrication.
      // We avoid unnatural "English-only" directives; output is naturally English via the template.
      const system = [
        'You are a strict RAG assistant.',
        'Use only the provided sources as evidence.',
        'If the sources do not contain enough information to answer, say so clearly.',
        'Do not use outside knowledge.',
        'Do not fabricate citations.',
      ].join(' ');

      // User message provides the question and the evidence context.
      // We explicitly request an answer-only output (citations are rendered by the CLI).
      const user = [
        `Question: ${question}`,
        '',
        'Sources:',
        context,
        '',
        'Output format:',
        '[Answer]',
        '(Concise, grounded strictly in the sources. Do not include a citations section.)',
      ].join('\n');

      console.log('Generating answer...');
      const resp = await llm.invoke([
        { role: 'system', content: system },
        { role: 'user', content: user },
      ]);

      // Print model answer first, then render citations deterministically from retrieval metadata.
      console.log(String(resp.content).trim());
      console.log('');
      console.log('[Citations]');
      for (const c of citations) console.log(`- ${c}`);
      console.log('');
    }
  } finally {
    // Always close readline to avoid hanging the Node process.
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
