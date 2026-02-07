import 'dotenv/config';
import { z } from 'zod';

/**
 * Runtime environment schema validation.
 *
 * Goals:
 * - Fail fast with a clear error when required configuration is missing or invalid.
 * - Keep environment parsing deterministic and centralized (single source of truth).
 *
 * Notes:
 * - RESET_COLLECTION is parsed as a boolean flag. Only the literal string "true" enables it.
 * - CHROMA_URL must be a valid URL (e.g., http://localhost:8000).
 */
const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  CHROMA_URL: z.string().url(),
  CHROMA_COLLECTION: z.string().min(1),
  DATA_DIR: z.string().min(1),

  // Development convenience flag:
  // When true, the ingest CLI will delete the target collection before upserting new vectors.
  RESET_COLLECTION: z
    .string()
    .optional()
    .transform((v) => v === 'true')
    // zod's default expects the input type; we set a safe boolean default explicitly.
    .default('false' as unknown as boolean),
});

/**
 * Parsed and validated environment configuration.
 * Access this object instead of process.env directly throughout the codebase.
 */
export const env = EnvSchema.parse(process.env);
