/**
 * server/customerRecords/summaryExtract.ts
 *
 * Helpers for turning a customer's Drive folder into prefilled customer-org
 * fields, by locating and reading its "summary sheet" spreadsheet.
 *
 * The Drive I/O + XLSX parsing live in customerRecordsRouter (they need real
 * credentials and the workbook binary). Everything here is pure and unit-tested:
 *   - which file in a folder is the summary spreadsheet,
 *   - which tab inside that workbook is the summary sheet,
 *   - how a parsed SiteSummary maps onto customer-org fields.
 */

import type { SiteSummary } from "../../drizzle/schema.js";
import type { DriveEntry } from "./driveService.js";

const SPREADSHEET_MIMES = new Set([
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

// A folder file that could be a summary workbook (by MIME or extension).
export function isSpreadsheetEntry(entry: DriveEntry): boolean {
  return (
    !entry.isFolder &&
    (SPREADSHEET_MIMES.has(entry.mimeType) || /\.(xlsx|xlsm|xls)$/i.test(entry.name))
  );
}

// File-name hints that a workbook is the customer/site summary.
const SUMMARY_NAME_RE = /summary|site\s*info|work\s*site|building\s*info|property\s*info/i;

/**
 * Choose the spreadsheet most likely to be the summary sheet: prefer one whose
 * name looks like a summary, else fall back to the only/first spreadsheet.
 * Returns null when the folder has no spreadsheet at all.
 */
export function pickSummarySpreadsheet(entries: DriveEntry[]): DriveEntry | null {
  const sheets = entries.filter(isSpreadsheetEntry);
  return sheets.find((e) => SUMMARY_NAME_RE.test(e.name)) ?? sheets[0] ?? null;
}

// Preferred worksheet-tab names, in priority order.
const PREFERRED_TABS = [
  "summary sheet",
  "work site info",
  "inspection summary",
  "site info",
  "summary",
];

/**
 * Choose the worksheet tab to parse. Prefers a known summary tab name, else the
 * first tab. Returns null only when the workbook has no sheets.
 */
export function pickSummarySheetName(sheetNames: string[]): string | null {
  for (const p of PREFERRED_TABS) {
    const match = sheetNames.find((n) => n.trim().toLowerCase().includes(p));
    if (match) return match;
  }
  return sheetNames[0] ?? null;
}

export interface ExtractedCustomer {
  name: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
}

function clean(value: string | undefined | null): string | null {
  const t = (value ?? "").trim();
  return t.length ? t : null;
}

function joinAddress(parts: Array<string | undefined>): string | null {
  const cleaned = parts.map((p) => (p ?? "").trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : null;
}

/**
 * Map a parsed SiteSummary onto customer-org fields. The customer name comes
 * from the client, contact from the first usable contact row, and address from
 * the site address (falling back to billing).
 */
export function summaryToCustomer(summary: SiteSummary): ExtractedCustomer {
  const contact =
    (summary.contacts ?? []).find((c) => c && (c.name || c.email || c.phone)) ?? {};

  const siteAddress = joinAddress([
    summary.address?.street,
    summary.address?.city,
    summary.address?.state,
    summary.address?.postalCode,
  ]);
  const billingAddress = joinAddress([
    summary.billing?.address,
    summary.billing?.city,
    summary.billing?.state,
    summary.billing?.postalCode,
  ]);

  return {
    name: clean(summary.client?.name),
    contactName: clean(contact.name),
    contactEmail: clean(contact.email),
    contactPhone: clean(contact.phone),
    address: siteAddress ?? billingAddress,
  };
}
