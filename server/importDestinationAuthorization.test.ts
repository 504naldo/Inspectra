import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { driveRouter } from "./routers/driveRouter";
import { filesRouter } from "./routers/filesRouter";
import { importRouter } from "./routers/importRouter";
import { getValidGoogleToken } from "./_core/googleAuth";
import { importPdfData } from "./_core/pdfImport";
import { safeXlsxRead } from "./_core/safeXlsxRead";
import { storageGet, storagePut } from "./storage";
import nodeFetch from "node-fetch";
import type { TrpcContext } from "./_core/context";
import * as XLSX from "xlsx";

vi.mock("./db", () => ({
  getSiteById: vi.fn(),
  getCustomerOrgById: vi.fn(),
  getJobById: vi.fn(),
  assertJobCompany: vi.fn(),
  getReportById: vi.fn(),
  getDb: vi.fn(),
  createAttachment: vi.fn(),
  createCustomerOrg: vi.fn(),
  createSite: vi.fn(),
  getCustomerOrgsByCompany: vi.fn(),
  getSitesByCustomerOrg: vi.fn(),
  createImportLog: vi.fn(),
  getMaxDeviceSortOrder: vi.fn(),
  createBulkImportRowResults: vi.fn(),
  updateImportLog: vi.fn(),
}));
vi.mock("./_core/googleAuth", () => ({ getValidGoogleToken: vi.fn() }));
vi.mock("./_core/pdfImport", () => ({ importPdfData: vi.fn() }));
vi.mock("./_core/safeXlsxRead", () => ({ safeXlsxRead: vi.fn() }));
vi.mock("./storage", () => ({ storageGet: vi.fn(), storagePut: vi.fn() }));
vi.mock("node-fetch", () => ({ default: vi.fn() }));
vi.mock("./_core/ssrfGuard", () => ({ assertPublicHttpUrl: vi.fn() }));

const ownSite = { id: 10, companyId: 1, customerOrgId: 100, name: "Own site" };
const siblingSite = { id: 11, companyId: 1, customerOrgId: 100, name: "Sibling site" };
const foreignSite = { id: 20, companyId: 2, customerOrgId: 200, name: "Foreign site" };
const ownJob = { id: 30, companyId: 1, customerOrgId: 100, siteId: 10 };
const attachment = {
  id: 40, entityType: "site", entityId: 10, siteId: 10,
  fileKey: "durable-key", fileUrl: "https://example.test/stale", fileName: "source.xlsx",
};
function context(role: "office" | "admin" = "office"): TrpcContext {
  return { user: { id: 1, role, companyId: 1, customerOrgId: null } } as TrpcContext;
}
function drive(role: "office" | "admin" = "office") {
  return driveRouter.createCaller(context(role));
}
function expectNoImportEffects() {
  for (const mock of [getValidGoogleToken, globalThis.fetch, nodeFetch, storageGet, storagePut, importPdfData,
    safeXlsxRead, db.createAttachment, db.createCustomerOrg, db.createSite, db.createImportLog]) {
    expect(mock).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", vi.fn());
  vi.mocked(db.getSiteById).mockImplementation(async id =>
    ({ 10: ownSite, 11: siblingSite, 20: foreignSite }[id] ?? undefined) as any);
  vi.mocked(db.getCustomerOrgById).mockImplementation(async id =>
    ({ 100: { id: 100, companyId: 1 }, 101: { id: 101, companyId: 1 }, 200: { id: 200, companyId: 2 } }[id] ?? undefined) as any);
  vi.mocked(db.assertJobCompany).mockResolvedValue(ownJob as any);
  vi.mocked(db.getJobById).mockResolvedValue(ownJob as any);
  vi.mocked(getValidGoogleToken).mockResolvedValue("fake-google-token");
  vi.mocked(importPdfData).mockResolvedValue({ success: true } as any);
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn(async () => [attachment]) };
  vi.mocked(db.getDb).mockResolvedValue({ select: vi.fn(() => query) } as any);
});

describe("Import destinations deny inconsistent links before provider or storage work", () => {
  const operations = [
    ["spreadsheet Drive", (caller: ReturnType<typeof drive>, links: object) => caller.importFromDrive({
      fileId: "fake-id", fileName: "source.xlsx", mimeType: "application/vnd.ms-excel", companyId: 1, ...links,
    })],
    ["PDF Drive", (caller: ReturnType<typeof drive>, links: object) => caller.importPdfFromDrive({
      fileId: "fake-id", fileName: "source.pdf", companyId: 1, ...links,
    })],
    ["PDF upload", (caller: ReturnType<typeof drive>, links: object) => caller.importPdfFromUpload({
      fileData: "not-a-pdf", fileName: "source.pdf", companyId: 1, ...links,
    })],
  ] as const;
  for (const [name, operation] of operations) {
    it.each(["office", "admin"] as const)(`${name}: %s cannot combine an owned company with a foreign site`, async role => {
      await expect(operation(drive(role), { siteId: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expectNoImportEffects();
    });
    it(`${name}: rejects same-company site/customer disagreement`, async () => {
      await expect(operation(drive(), { siteId: 10, customerOrgId: 101 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expectNoImportEffects();
    });
    it(`${name}: rejects a foreign customer without a site`, async () => {
      await expect(operation(drive(), { customerOrgId: 200 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expectNoImportEffects();
    });
    it(`${name}: rejects a missing site`, async () => {
      await expect(operation(drive(), { siteId: 999 })).rejects.toMatchObject({ code: "NOT_FOUND" });
      expectNoImportEffects();
    });
  }
  it("validates the site's inherited customer even when the caller omits customerOrgId", async () => {
    vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 100, companyId: 2 } as any);
    await expect(drive("admin").importPdfFromDrive({
      fileId: "fake-id", fileName: "source.pdf", companyId: 1, siteId: 10,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoImportEffects();
  });
  it("download checks a supplied company before an OAuth refresh", async () => {
    await expect(drive().downloadFile({ fileId: "fake-id", companyId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoImportEffects();
  });
  it("download rejects inconsistent explicit company/site links for an admin before OAuth refresh", async () => {
    await expect(drive("admin").downloadFile({ fileId: "fake-id", companyId: 1, siteId: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoImportEffects();
  });
  it("report export authorizes the report's real job before an OAuth refresh", async () => {
    vi.mocked(db.getReportById).mockResolvedValue({ id: 50, jobId: 31 } as any);
    vi.mocked(db.assertJobCompany).mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(drive().saveReport({ reportId: 50, jobId: 30 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoImportEffects();
  });
  it.each(["validate", "execute"] as const)("legacy %s rejects a foreign site before reading a workbook", async operation => {
    const caller = importRouter.createCaller(context());
    await expect(caller[operation]({
      companyId: 1, siteId: 20, importType: "site", fileName: "source.xlsx", fileData: "bad",
      sheetName: "Site", columnMapping: {}, duplicateHandling: "skip",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoImportEffects();
  });
});

describe("Authorized PDF handoff", () => {
  it("derives the customer from the authorized site for an upload", async () => {
    await drive().importPdfFromUpload({ fileName: "source.pdf", fileData: "cGRm", companyId: 1, siteId: 10 });
    expect(importPdfData).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 1, siteId: 10, customerOrgId: 100, userId: 1,
    }));
    expect(getValidGoogleToken).not.toHaveBeenCalled();
  });
  it("derives the customer before downloading a Drive PDF", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("fake-pdf") } as Response);
    await drive().importPdfFromDrive({ fileName: "source.pdf", fileId: "fake-id", companyId: 1, siteId: 10 });
    expect(importPdfData).toHaveBeenCalledWith(expect.objectContaining({ siteId: 10, customerOrgId: 100 }));
  });
  it("preserves core authorization errors for client recovery", async () => {
    vi.mocked(importPdfData).mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Destination changed" }));
    await expect(drive().importPdfFromUpload({
      fileName: "source.pdf", fileData: "cGRm", companyId: 1, siteId: 10,
    })).rejects.toMatchObject({ code: "FORBIDDEN", message: "Destination changed" });
  });
});

describe("Authorized spreadsheet and file handoff", () => {
  it("a platform admin can download to an authorized foreign site when no conflicting company was supplied", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false } as Response);
    await expect(drive("admin").downloadFile({ fileId: "fake-id", siteId: 20 }))
      .rejects.toMatchObject({ code: "NOT_FOUND", message: "Drive file not found or no access." });
    expect(getValidGoogleToken).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(storagePut).not.toHaveBeenCalled();
  });
  it("an existing Drive spreadsheet site supplies the customer without creating a replacement organization", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("fake-workbook") } as Response);
    vi.mocked(safeXlsxRead).mockResolvedValue({ SheetNames: ["Summary"], Sheets: { Summary: XLSX.utils.aoa_to_sheet([["Site name", "Original site"]]) } });
    vi.mocked(storagePut).mockResolvedValue({ key: "fake", url: "https://example.test/object" });
    const result = await drive().importFromDrive({
      fileId: "fake-id", fileName: "source.xlsx", mimeType: "application/vnd.ms-excel", companyId: 1, siteId: 10,
    });
    expect(result).toMatchObject({ success: true, siteId: 10, customerOrgId: 100 });
    expect(db.createCustomerOrg).not.toHaveBeenCalled();
    expect(db.createSite).not.toHaveBeenCalled();
    expect(db.createAttachment).toHaveBeenCalledWith(expect.objectContaining({ entityType: "site", entityId: 10, siteId: 10 }));
  });
  it("a Drive spreadsheet cannot reuse a name-matched site from a different company", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, arrayBuffer: async () => Buffer.from("fake-workbook") } as Response);
    vi.mocked(safeXlsxRead).mockResolvedValue({ SheetNames: ["Summary"], Sheets: { Summary: XLSX.utils.aoa_to_sheet([["Site name", "Foreign site"]]) } });
    vi.mocked(db.getSitesByCustomerOrg).mockResolvedValue([foreignSite] as any);
    await expect(drive("admin").importFromDrive({
      fileId: "fake-id", fileName: "source.xlsx", mimeType: "application/vnd.ms-excel", companyId: 1, customerOrgId: 100,
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storagePut).not.toHaveBeenCalled();
    expect(db.createAttachment).not.toHaveBeenCalled();
    expect(db.createSite).not.toHaveBeenCalled();
    expect(db.createCustomerOrg).not.toHaveBeenCalled();
  });
});

describe("Stored workbook source must agree with the selected destination", () => {
  it.each(["office", "admin"] as const)("%s cannot import a different site's workbook into an owned destination", async role => {
    const query = { from: vi.fn().mockReturnThis(), where: vi.fn(async () => [{ ...attachment, entityId: 11, siteId: 11 }]) };
    vi.mocked(db.getDb).mockResolvedValue({ select: vi.fn(() => query) } as any);
    await expect(filesRouter.createCaller(context(role)).importExcelDevices({ fileId: 40, siteId: 10, jobId: 30 }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Import source and destination disagree" });
    expectNoImportEffects();
  });
  it("an admin cannot import a different company's workbook into an owned destination", async () => {
    const query = { from: vi.fn().mockReturnThis(), where: vi.fn(async () => [{ ...attachment, entityId: 20, siteId: 20 }]) };
    vi.mocked(db.getDb).mockResolvedValue({ select: vi.fn(() => query) } as any);
    await expect(filesRouter.createCaller(context("admin")).importExcelDevices({ fileId: 40, siteId: 10, jobId: 30 }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Import source and destination disagree" });
    expectNoImportEffects();
  });
  it("rejects a job whose customer disagrees with the destination before reading an attachment", async () => {
    vi.mocked(db.assertJobCompany).mockResolvedValue({ ...ownJob, customerOrgId: 101 } as any);
    await expect(filesRouter.createCaller(context()).importExcelDevices({ fileId: 40, siteId: 10, jobId: 30 }))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: "Import job and site disagree" });
    expectNoImportEffects();
  });
  it("a consistent stored workbook reaches only its durable source URL", async () => {
    vi.mocked(storageGet).mockResolvedValue({ url: "https://example.test/fresh", key: "durable-key" });
    vi.mocked(nodeFetch).mockResolvedValue({ ok: false } as any);
    await expect(filesRouter.createCaller(context()).importExcelDevices({ fileId: 40, siteId: 10, jobId: 30 }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file" });
    expect(storageGet).toHaveBeenCalledWith("durable-key");
    expect(nodeFetch).toHaveBeenCalledWith("https://example.test/fresh", { redirect: "error" });
    expect(safeXlsxRead).not.toHaveBeenCalled();
  });
});
