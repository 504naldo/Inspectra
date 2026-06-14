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
