/**
 * Route-parameter parsing helpers.
 *
 * Route IDs come from the URL as strings and were previously parsed with raw
 * `parseInt(params.id)`, which silently accepts junk: parseInt("12abc") === 12,
 * parseInt("") === NaN, and negatives/decimals/zero pass through. That mounts
 * detail components with NaN and fires tRPC queries with invalid IDs.
 *
 * `parseRequiredRouteId` accepts ONLY a positive integer record id.
 */
export function parseRequiredRouteId(
  value: string | undefined | null,
  opts: { allowZero?: boolean } = {},
): number | null {
  if (value == null) return null;
  const s = value.trim();
  // Digits only: rejects "", "  ", "12abc", "-1", "1.5", "1e3", "NaN", "0x1".
  if (!/^[0-9]+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  if (n < 0) return null;
  if (n === 0 && !opts.allowZero) return null;
  return n;
}
