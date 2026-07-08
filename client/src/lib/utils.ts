import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a YYYY-MM-DD string from <input type="date"> as local noon.
 * Using midnight (new Date("2026-04-24")) parses as UTC and shifts one day
 * back in negative-offset timezones. Noon is safe across UTC-12 to UTC+12.
 */
export function parseDateInput(value: string): Date {
  return new Date(value + "T12:00:00");
}

/**
 * Format a stored date for display, interpreting it in UTC to avoid the
 * UTC-midnight-to-local-previous-day shift.
 */
export function formatDate(d: Date | string | null | undefined, fallback = "—"): string {
  if (!d) return fallback;
  return new Date(d).toLocaleDateString(undefined, { timeZone: "UTC" });
}

/**
 * Format a monetary amount as USD with thousands separators, e.g. "$12,345.00".
 */
export function formatCurrency(amount: unknown): string {
  return `$${Number(amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * tRPC/Drizzle errors can leak raw "Failed query: ... params: ..." SQL strings
 * into error.message. Swap those for a generic fallback; pass through anything else.
 */
export function friendlyErrorMessage(err: { message?: string }, fallback: string): string {
  if (!err.message || err.message.includes("Failed query")) return fallback;
  return err.message;
}

/**
 * Escape a value for a single CSV cell, safe against spreadsheet formula
 * injection. Mirrors the server-side `csvCell` (server/routers/invoiceRouter.ts):
 * a leading =, +, -, or @ is prefixed with a single quote so Excel/Sheets/Sage
 * won't evaluate it as a formula; values containing quotes/commas/newlines are
 * quote-wrapped. Use for every client-generated CSV export.
 */
export function csvCell(v: unknown): string {
  if (v == null || v === "") return "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
