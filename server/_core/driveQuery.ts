/**
 * Escapes a value for safe interpolation into a single-quoted Google Drive
 * API `q` query literal (e.g. `name='...'`, `'...' in parents`). Backslashes
 * must be escaped first so a trailing backslash doesn't consume the
 * quote-escaping backslash that follows.
 */
export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
