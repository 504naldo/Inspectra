/**
 * server/_core/schemaEcho.ts
 *
 * Single source of truth for detecting AI-extraction "schema echoes": values
 * where an LLM copied a field's type description into the value instead of
 * extracting real content, e.g. "string or null - the building/site name",
 * "string", "string - street address", or a literal "null".
 *
 * Used by the PDF-import runtime guard (pdfImport.ts) and by the one-off
 * cleanup script that scrubs rows created before that guard existed
 * (scripts/cleanupSchemaEchoNames.ts). Keep the two in lock-step by importing
 * from here — do not re-declare the pattern.
 *
 * Deliberately dependency-free (no DB / storage / LLM imports) so scripts can
 * import it without pulling server runtime side effects.
 */

// Matches a leaked schema placeholder. A genuine value like "String Lighting
// Co" is NOT matched, because "String" is not followed by " or null",
// end-of-string, or a separator ( -, –, —, : ).
export const SCHEMA_ECHO_RE = /^"?string(?:\s+or\s+null)?"?(?:\s*[-–—:].*)?$/i;

/**
 * True when the value is obviously a leaked schema placeholder or a literal
 * "null" string rather than real extracted content.
 */
export function isSchemaEcho(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase() === "null") return true;
  return SCHEMA_ECHO_RE.test(trimmed);
}
