/**
 * Chroma metadata values must be primitive types (or null).
 * Nested objects/arrays are not accepted by the Chroma API and will throw at upsert time.
 */
export type ChromaMetadataValue = string | number | boolean | null;

/**
 * Type guard for values that are directly acceptable as Chroma metadata.
 *
 * @param value Unknown metadata value.
 * @returns True when the value is a Chroma-accepted primitive; otherwise false.
 */
function isPrimitive(value: unknown): value is ChromaMetadataValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/**
 * Converts an unknown value to a stable, meaningful string.
 *
 * Design goals:
 * - Avoid accidental "[object Object]" serialization.
 * - Preserve useful diagnostics for Error instances.
 * - Prefer JSON when possible for objects/arrays to keep the representation readable.
 *
 * @param value Unknown value to stringify.
 * @returns A best-effort string representation.
 */
function safeToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  // Preserve actionable context for errors (stack preferred).
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  // Avoid "[object Object]" and always return a meaningful representation.
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

/**
 * Sanitizes a metadata object so it can be stored in Chroma.
 *
 * Behavior:
 * - Drops keys with `undefined` values (Chroma does not accept undefined).
 * - Keeps primitive values as-is (string/number/boolean/null).
 * - Stringifies non-primitive values (objects/arrays/errors) using safeToString().
 *
 * @param input Arbitrary metadata object.
 * @returns A new metadata object compatible with Chroma constraints.
 */
export function sanitizeForChromaMetadata(
  input: Record<string, unknown>,
): Record<string, ChromaMetadataValue> {
  const out: Record<string, ChromaMetadataValue> = {};

  for (const [key, value] of Object.entries(input)) {
    // Undefined is not a valid Chroma metadata value; omit the key entirely.
    if (value === undefined) continue;

    // Primitive values are accepted by Chroma as-is.
    if (isPrimitive(value)) {
      out[key] = value;
      continue;
    }

    // Convert arrays/objects/errors to a stable string to satisfy Chroma's metadata constraints.
    out[key] = safeToString(value);
  }

  return out;
}
