import { describe, it, expect } from "vitest";
import { fileNameToSiteName, pickSiteName, parseArgs } from "./cleanupSchemaEchoNames";
import { isSchemaEcho } from "../server/_core/schemaEcho";

// Pure — no DB. Locks the name-derivation used by the cleanup script.

describe("isSchemaEcho", () => {
  it("flags the production echo and its variants", () => {
    expect(isSchemaEcho("string or null - the building/site name")).toBe(true);
    expect(isSchemaEcho("string")).toBe(true);
    expect(isSchemaEcho("string - street address")).toBe(true);
    expect(isSchemaEcho("null")).toBe(true);
    expect(isSchemaEcho("  NULL ")).toBe(true);
  });
  it("does not flag genuine values", () => {
    expect(isSchemaEcho("String Lighting Co")).toBe(false);
    expect(isSchemaEcho("Strings Music Hall")).toBe(false);
    expect(isSchemaEcho("400-11950 80th Ave")).toBe(false);
    expect(isSchemaEcho("")).toBe(false);
    expect(isSchemaEcho(null)).toBe(false);
  });
});

describe("fileNameToSiteName", () => {
  it("drops extension and normalizes separators", () => {
    expect(fileNameToSiteName("Tribe_Management_0420.pdf")).toBe("Tribe Management 0420");
    expect(fileNameToSiteName("annual report.PDF")).toBe("annual report");
    expect(fileNameToSiteName("  spaced__out__name.pdf ")).toBe("spaced out name");
  });
});

describe("pickSiteName", () => {
  it("prefers the PDF file name when usable", () => {
    expect(
      pickSiteName({ pdfFileName: "Acme_Tower.pdf", summaryBuildingName: "X", fileNumber: "0420", buildingId: "B1" })
    ).toBe("Acme Tower");
  });
  it("falls back to summary building name, then file number, then buildingId", () => {
    expect(
      pickSiteName({ pdfFileName: null, summaryBuildingName: "Harbour Centre", fileNumber: "0420", buildingId: "B1" })
    ).toBe("Harbour Centre");
    expect(
      pickSiteName({ pdfFileName: null, summaryBuildingName: "string or null", fileNumber: "#0420", buildingId: "B1" })
    ).toBe("Site #0420");
    expect(
      pickSiteName({ pdfFileName: null, summaryBuildingName: null, fileNumber: null, buildingId: "EWF-1234" })
    ).toBe("EWF-1234");
  });
  it("returns null when nothing trustworthy is available (never invents a name)", () => {
    expect(
      pickSiteName({ pdfFileName: "string or null.pdf", summaryBuildingName: "string", fileNumber: "", buildingId: "string or null" })
    ).toBeNull();
    expect(
      pickSiteName({ pdfFileName: null, summaryBuildingName: null, fileNumber: null, buildingId: null })
    ).toBeNull();
  });
});

describe("parseArgs", () => {
  it("defaults to dry run on company 1", () => {
    expect(parseArgs([])).toEqual({ companyId: 1, fix: false });
  });
  it("honors --fix and --company", () => {
    expect(parseArgs(["--company", "3", "--fix"])).toEqual({ companyId: 3, fix: true });
  });
  it("--dry-run overrides a later default but --fix wins when both given in order", () => {
    expect(parseArgs(["--fix", "--dry-run"])).toEqual({ companyId: 1, fix: false });
  });
});
