import { ChromaClient } from 'chromadb';

import { env } from './env.js';

/**
 * Connection parameters required by the Chroma JS client.
 * We prefer explicit host/port/ssl to avoid deprecated URL/path-based initialization paths.
 */
type ChromaConn = { ssl: boolean; host: string; port: number };

/**
 * Parses a CHROMA_URL (e.g., http://localhost:8000) into the explicit connection
 * fields expected by the Chroma JS client.
 *
 * Notes:
 * - If the URL omits a port, we fall back to 80 for http and 443 for https.
 * - Only the protocol, hostname, and port are used; path/query fragments are ignored.
 */
function parseChromaUrl(url: string): ChromaConn {
  const u = new URL(url);

  const ssl = u.protocol === 'https:';
  const port = u.port ? Number(u.port) : ssl ? 443 : 80;

  return {
    ssl,
    host: u.hostname,
    port,
  };
}

/**
 * Creates a configured Chroma client instance.
 *
 * This client is used for administrative operations (e.g., deleting a collection)
 * and can also be injected into higher-level adapters when needed.
 */
export function createChromaClient(): ChromaClient {
  const conn = parseChromaUrl(env.CHROMA_URL);
  return new ChromaClient(conn);
}
