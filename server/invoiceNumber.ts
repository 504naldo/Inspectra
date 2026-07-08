/**
 * Shared invoice-number generation.
 *
 * Previously duplicated in invoiceRouter.ts and approvedWorkRouter.ts, each using
 * only the low 4 base-36 chars of the millisecond clock — high collision risk,
 * and the two paths didn't share a namespace. This is the single source of truth.
 *
 * Format: `${PREFIX}-${YYYY}-${SUFFIX}` where SUFFIX is the full base-36
 * millisecond timestamp plus 3 random base-36 chars. That is far wider than the
 * old 4-char slice, so practical collisions are effectively impossible; the
 * `(companyId, invoiceNumber)` unique index (drizzle/schema.ts) is the backstop
 * that rejects the astronomically rare duplicate so a retry can re-mint.
 */
export function generateInvoiceNumber(prefix = "INV", now = new Date()): string {
  const year = now.getFullYear();
  const ts = now.getTime().toString(36).toUpperCase();
  let rand = "";
  for (let i = 0; i < 3; i++) rand += Math.floor(Math.random() * 36).toString(36).toUpperCase();
  return `${prefix}-${year}-${ts}${rand}`;
}
