import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getSiteById, getJobById, getCustomerOrgById, getDb, assertJobCompany, assertJobNotFinalized } from "./db";
import { storageGet } from "./storage";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { assetImportRouter } from "./routers/assetImportRouter";
import { importWorkbookForSite, previewWorkbookForSite } from "./services/workbookImport";
import { assertAttachmentLinksUnchanged, withAttachmentWrite } from "./attachmentAccess";

vi.mock("./db", () => ({
  getDb: vi.fn(), getSiteById: vi.fn(), getJobById: vi.fn(), getCustomerOrgById: vi.fn(),
  assertJobCompany: vi.fn(), assertJobNotFinalized: vi.fn(),
}));
vi.mock("./attachmentAccess", async original => ({
  ...await original<typeof import("./attachmentAccess")>(),
  withAttachmentWrite: vi.fn(async (_ctx, _procedure, _destinations, callback) => callback([], {})),
  assertAttachmentLinksUnchanged: vi.fn(async file => file),
}));
vi.mock("./storage", () => ({ storageGet: vi.fn() }));
vi.mock("./_core/ssrfGuard", () => ({ assertPublicHttpUrl: vi.fn() }));
vi.mock("./services/workbookImport", () => ({
  importWorkbookForSite: vi.fn(),
  previewWorkbookForSite: vi.fn(),
}));

const counts = { fireAlarm: 1, extinguishers: 0, emergencyLights: 0, smokeAlarms: 0, backflows: 0, total: 1 };
const preview = { counts, insertedCount: 0, updatedCount: 1, excludedRowsCount: 1,
  excludedRows: [{ sheetName: "Fire Alarm", rowNumber: 4, reason: "Ambiguous device identity" }], classifiedSheets: [] };
const input = { siteId: 100, fileData: Buffer.from("workbook").toString("base64"), fileName: "audit.xlsx" };
const site = { id: 100, companyId: 7, customerOrgId: 70 };
const job = { id: 300, companyId: 7, siteId: 100, customerOrgId: 70 };
let jobAttachment: Record<string, any>;
function caller(role: "office" | "admin" | "technician" | "customer", companyId = 7) {
  return assetImportRouter.createCaller({ user: { id: 1, role, companyId } } as TrpcContext);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withAttachmentWrite).mockImplementation(async (_ctx, _name, _parents, callback) => callback([], {} as any));
  vi.mocked(assertAttachmentLinksUnchanged).mockImplementation(async file => file as any);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => Buffer.from("downloaded workbook") })));
  jobAttachment = { id: 500, entityType: "job", entityId: 300, jobId: 300, siteId: 100,
    fileKey: "durable-workbook", fileUrl: "https://example.test/stale", fileName: "source.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  vi.mocked(getJobById).mockResolvedValue(job as any);
  vi.mocked(assertJobCompany).mockResolvedValue(job as any);
  vi.mocked(assertJobNotFinalized).mockResolvedValue(undefined);
  vi.mocked(getCustomerOrgById).mockResolvedValue({ id: 70, companyId: 7 } as any);
  vi.mocked(storageGet).mockResolvedValue({ url: "https://example.test/fresh" } as any);
  const query = { from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(), limit: vi.fn(async () => [jobAttachment]) };
  vi.mocked(getDb).mockResolvedValue({ select: vi.fn(() => query) } as any);
  vi.mocked(getSiteById).mockResolvedValue(site as any);
  vi.mocked(previewWorkbookForSite).mockResolvedValue(preview);
  vi.mocked(importWorkbookForSite).mockResolvedValue({ ...preview, siteFieldsUpdated: 0, siteUpdatedFields: [], insertedCounts: { ...counts, fireAlarm: 0, total: 0 }, updatedCounts: counts, message: "0 inserted, 1 updated" });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe.each(["previewAllFromFile", "importAllFromFile"] as const)("workbook upload %s", method => {
  it("authorizes the site before sending its company to the canonical service", async () => {
    const result = await caller("office")[method](input);
    const service = method === "previewAllFromFile" ? previewWorkbookForSite : importWorkbookForSite;
    expect(service).toHaveBeenCalledTimes(1);
    expect(service).toHaveBeenCalledWith({ fileBuffer: Buffer.from("workbook"), fileName: "audit.xlsx", siteId: 100, companyId: 7, customerOrgId: 70, userId: 1 });
    expect(result).toMatchObject({ insertedCount: 0, updatedCount: 1, excludedRowsCount: 1, excludedRows: preview.excludedRows });
    expect(vi.mocked(getSiteById).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(service).mock.invocationCallOrder[0]);
  });

  it("rejects cross-company office requests before parsing the workbook", async () => {
    await expect(caller("office", 8)[method](input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(previewWorkbookForSite).not.toHaveBeenCalled();
    expect(importWorkbookForSite).not.toHaveBeenCalled();
  });

  it("rejects missing sites before parsing the workbook", async () => {
    vi.mocked(getSiteById).mockResolvedValue(undefined);
    await expect(caller("office")[method](input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(previewWorkbookForSite).not.toHaveBeenCalled();
    expect(importWorkbookForSite).not.toHaveBeenCalled();
  });

  it("rejects an inconsistent destination customer before parsing even for a platform admin", async () => {
    vi.mocked(getCustomerOrgById).mockResolvedValue({ id: 70, companyId: 8 } as any);
    await expect(caller("admin")[method](input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(previewWorkbookForSite).not.toHaveBeenCalled();
    expect(importWorkbookForSite).not.toHaveBeenCalled();
  });

  it("attributes platform-admin cross-company imports to the destination company", async () => {
    await caller("admin", 8)[method](input);
    const service = method === "previewAllFromFile" ? previewWorkbookForSite : importWorkbookForSite;
    expect(service).toHaveBeenCalledWith(expect.objectContaining({ companyId: 7, siteId: 100 }));
  });

  it("rejects technician uploads before loading the destination or workbook", async () => {
    await expect(caller("technician")[method](input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getSiteById).not.toHaveBeenCalled();
    expect(previewWorkbookForSite).not.toHaveBeenCalled();
    expect(importWorkbookForSite).not.toHaveBeenCalled();
  });
});


describe("job workbook source and destination boundary", () => {
  it("runs execution under the source and destination job seal locks", async () => {
    await caller("office").importAssetsFromExcel({ jobId: 300 });
    expect(withAttachmentWrite).toHaveBeenCalledWith(expect.anything(), "assetImport.importAssetsFromExcel",
      [jobAttachment, { entityType: "job", entityId: 300 }], expect.any(Function));
    expect(assertAttachmentLinksUnchanged).toHaveBeenCalledWith(jobAttachment);
  });

  it("rejects a job finalized while its workbook was downloading", async () => {
    vi.mocked(withAttachmentWrite).mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "Job is finalized" }));
    await expect(caller("office").importAssetsFromExcel({ jobId: 300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(importWorkbookForSite).not.toHaveBeenCalled();
  });

  it("rejects replacement of the downloaded file before execution", async () => {
    vi.mocked(assertAttachmentLinksUnchanged).mockImplementation(async file => ({ ...file, fileKey: "replacement.xlsx" }) as any);
    await expect(caller("office").importAssetsFromExcel({ jobId: 300 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(importWorkbookForSite).not.toHaveBeenCalled();
  });

  function expectNoDownloadOrImport() {
    expect(storageGet).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(importWorkbookForSite).not.toHaveBeenCalled();
  }

  it.each(["customer", "technician"] as const)("blocks %s before resolving job or source", async role => {
    await expect(caller(role).importAssetsFromExcel({ jobId: 300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(assertJobCompany).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
    expectNoDownloadOrImport();
  });

  it("rejects a foreign-office job before source work", async () => {
    vi.mocked(assertJobCompany).mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller("office", 8).importAssetsFromExcel({ jobId: 300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getDb).not.toHaveBeenCalled();
    expectNoDownloadOrImport();
  });

  it.each(["office", "admin"] as const)("rejects inconsistent job/site/customer links for %s", async role => {
    vi.mocked(getSiteById).mockResolvedValue({ ...site, customerOrgId: 71 } as any);
    await expect(caller(role).importAssetsFromExcel({ jobId: 300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoDownloadOrImport();
  });

  it("rejects cross-company destination links even for a platform admin", async () => {
    vi.mocked(getSiteById).mockResolvedValue({ ...site, companyId: 8 } as any);
    await expect(caller("admin").importAssetsFromExcel({ jobId: 300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoDownloadOrImport();
  });

  it("rejects contradictory attachment metadata before signing the source", async () => {
    jobAttachment.siteId = 101;
    vi.mocked(getSiteById).mockImplementation(async id => ({ ...site, id }) as any);
    await expect(caller("office").importAssetsFromExcel({ jobId: 300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoDownloadOrImport();
  });

  it("rejects an attachment belonging to another job even at the same site", async () => {
    jobAttachment.entityId = 301;
    jobAttachment.jobId = 301;
    vi.mocked(getJobById).mockResolvedValue({ ...job, id: 301 } as any);
    await expect(caller("office").importAssetsFromExcel({ jobId: 300 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoDownloadOrImport();
  });

  it("rejects a finalized job before signing or parsing its workbook", async () => {
    vi.mocked(assertJobNotFinalized).mockRejectedValue(new TRPCError({ code: "BAD_REQUEST", message: "Job is finalized" }));
    await expect(caller("office").importAssetsFromExcel({ jobId: 300 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expectNoDownloadOrImport();
  });

  it("resolves the durable source key and attributes platform-admin writes to the job company", async () => {
    const result = await caller("admin", 8).importAssetsFromExcel({ jobId: 300 });
    expect(storageGet).toHaveBeenCalledWith("durable-workbook");
    expect(globalThis.fetch).toHaveBeenCalledWith("https://example.test/fresh", { redirect: "error" });
    expect(importWorkbookForSite).toHaveBeenCalledWith({ fileBuffer: Buffer.from("downloaded workbook"), fileName: "source.xlsx", siteId: 100, companyId: 7, customerOrgId: 70, userId: 1 });
    expect(result).toMatchObject({ insertedCount: 0, updatedCount: 1, excludedRows: preview.excludedRows });
  });
});
