import { describe, it, expect } from "vitest";
import {
  isSpreadsheetEntry,
  pickSummarySpreadsheet,
  pickSummarySheetName,
  summaryToCustomer,
} from "./summaryExtract";
import type { DriveEntry } from "./driveService";
import type { SiteSummary } from "../../drizzle/schema";

// Pure — no Drive, no XLSX. Locks how a customer folder maps to prefill fields.

function entry(p: Partial<DriveEntry> & { name: string }): DriveEntry {
  return { id: p.id ?? p.name, name: p.name, mimeType: p.mimeType ?? "application/octet-stream", isFolder: p.isFolder ?? false };
}

describe("isSpreadsheetEntry", () => {
  it("accepts google sheets, xlsx MIME, and .xlsx/.xls names; rejects folders and other files", () => {
    expect(isSpreadsheetEntry(entry({ name: "S", mimeType: "application/vnd.google-apps.spreadsheet" }))).toBe(true);
    expect(isSpreadsheetEntry(entry({ name: "book.xlsx", mimeType: "application/octet-stream" }))).toBe(true);
    expect(isSpreadsheetEntry(entry({ name: "old.xls" }))).toBe(true);
    expect(isSpreadsheetEntry(entry({ name: "Folder", isFolder: true, mimeType: "application/vnd.google-apps.folder" }))).toBe(false);
    expect(isSpreadsheetEntry(entry({ name: "report.pdf", mimeType: "application/pdf" }))).toBe(false);
  });
});

describe("pickSummarySpreadsheet", () => {
  it("prefers a summary-named spreadsheet over other spreadsheets", () => {
    const chosen = pickSummarySpreadsheet([
      entry({ name: "Devices.xlsx" }),
      entry({ name: "Site Summary Sheet.xlsx" }),
      entry({ name: "Notes.pdf", mimeType: "application/pdf" }),
    ]);
    expect(chosen?.name).toBe("Site Summary Sheet.xlsx");
  });
  it("falls back to the first spreadsheet when none is summary-named", () => {
    const chosen = pickSummarySpreadsheet([
      entry({ name: "Devices.xlsx" }),
      entry({ name: "Other.xlsx" }),
    ]);
    expect(chosen?.name).toBe("Devices.xlsx");
  });
  it("returns null when the folder has no spreadsheet", () => {
    expect(pickSummarySpreadsheet([entry({ name: "a.pdf", mimeType: "application/pdf" })])).toBeNull();
  });
});

describe("pickSummarySheetName", () => {
  it("prefers a known summary tab over others, respecting priority", () => {
    expect(pickSummarySheetName(["Devices", "Summary Sheet", "Summary"])).toBe("Summary Sheet");
    expect(pickSummarySheetName(["Devices", "Work Site Info"])).toBe("Work Site Info");
  });
  it("falls back to the first tab, and null when empty", () => {
    expect(pickSummarySheetName(["Devices", "Pricing"])).toBe("Devices");
    expect(pickSummarySheetName([])).toBeNull();
  });
});

describe("summaryToCustomer", () => {
  it("maps client/contact/address onto customer fields", () => {
    const summary: SiteSummary = {
      client: { name: "Tribe Management Inc." },
      address: { street: "400-11950 80th Ave", city: "Delta", state: "BC", postalCode: "V4C 1X7" },
      contacts: [
        { name: "", role: "Header" },
        { name: "Jane Doe", phone: "604-376-9320", email: "jane@tribe.example" },
      ],
    };
    expect(summaryToCustomer(summary)).toEqual({
      name: "Tribe Management Inc.",
      contactName: "Jane Doe",
      contactEmail: "jane@tribe.example",
      contactPhone: "604-376-9320",
      address: "400-11950 80th Ave, Delta, BC, V4C 1X7",
    });
  });
  it("falls back to billing address and returns nulls for missing data", () => {
    const summary: SiteSummary = {
      client: {},
      billing: { address: "PO Box 12", city: "Vancouver" },
      contacts: [],
    };
    const out = summaryToCustomer(summary);
    expect(out.name).toBeNull();
    expect(out.contactName).toBeNull();
    expect(out.address).toBe("PO Box 12, Vancouver");
  });
  it("returns all nulls for an empty summary", () => {
    expect(summaryToCustomer({})).toEqual({
      name: null, contactName: null, contactEmail: null, contactPhone: null, address: null,
    });
  });
});
