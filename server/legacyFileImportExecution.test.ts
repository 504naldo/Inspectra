import { beforeEach, describe, expect, it, vi } from "vitest";
import fetch from "node-fetch";
import { TRPCError } from "@trpc/server";
import { getDb, assertJobCompany } from "./db";
import { assertSiteCompany } from "./tenantGuards";
import { assertAttachmentDestination, assertAttachmentLinksUnchanged, withAttachmentWrite } from "./attachmentAccess";
import { importWorkbookForSite } from "./services/workbookImport";
import { filesRouter } from "./routers/filesRouter";
import { storageGet } from "./storage";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn(), assertJobCompany: vi.fn(), createAttachment: vi.fn() }));
vi.mock("./tenantGuards", () => ({ assertSiteCompany: vi.fn(), assertEntityCompany: vi.fn(), getAttachmentOwnerCompanyId: vi.fn() }));
vi.mock("./attachmentAccess", () => ({ assertAttachmentDestination: vi.fn(), assertAttachmentLinksUnchanged: vi.fn(), requireUploadedAttachment: vi.fn(), withAttachmentWrite: vi.fn() }));
vi.mock("./services/workbookImport", () => ({ importWorkbookForSite: vi.fn() }));
vi.mock("./_core/ssrfGuard", () => ({ assertPublicHttpUrl: vi.fn() }));
vi.mock("./storage", () => ({ storageGet: vi.fn() }));
vi.mock("node-fetch", () => ({ default: vi.fn() }));

const site = { id: 10, companyId: 3, customerOrgId: 30 };
const job = { id: 20, companyId: 3, customerOrgId: 30, siteId: 10 };
const file = { id: 50, entityType: "job", entityId: 20, jobId: 20, siteId: 10,
  fileKey: "old-import.xlsx", fileUrl: "https://files.test/stale", fileName: "source.xlsx" };
const request = { fileId: 50, siteId: 10, jobId: 20, selectedSheets: ["Emergency Lights"] };
const caller = () => filesRouter.createCaller({ user: { id: 7, role: "admin", companyId: 99 } } as TrpcContext);
let tx: any;
let updateSummary: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assertSiteCompany).mockResolvedValue(site as any);
  vi.mocked(assertJobCompany).mockResolvedValue(job as any);
  vi.mocked(assertAttachmentDestination).mockResolvedValue({ ...site, siteId: 10, jobId: 20 } as any);
  vi.mocked(assertAttachmentLinksUnchanged).mockResolvedValue(file as any);
  vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ where: async () => [file] }) }) } as any);
  vi.mocked(storageGet).mockResolvedValue({ url: "https://files.test/current" } as any);
  vi.mocked(fetch).mockResolvedValue({ ok: true, buffer: async () => Buffer.from("downloaded source") } as any);
  updateSummary = vi.fn(async () => undefined);
  tx = { update: vi.fn(() => ({ set: () => ({ where: updateSummary }) })) };
  vi.mocked(withAttachmentWrite).mockImplementation(async (_ctx, _name, _destinations, operation) => operation([], tx));
  const empty = { fireAlarm: 0, extinguishers: 0, emergencyLights: 0, smokeAlarms: 0, backflows: 0, total: 0 };
  vi.mocked(importWorkbookForSite).mockResolvedValue({ counts: { ...empty, emergencyLights: 2, total: 2 },
    insertedCounts: { ...empty, emergencyLights: 1, total: 1 }, updatedCounts: { ...empty, emergencyLights: 1, total: 1 },
    insertedCount: 1, updatedCount: 1, excludedRowsCount: 0, excludedRows: [], classifiedSheets: [],
    siteFieldsUpdated: 2, siteUpdatedFields: ["name", "city"], message: "Imported" });
});

describe("legacy file workbook execution", () => {
  it("delegates to the canonical importer under source/target locks with the destination company's identity", async () => {
    expect(await caller().importExcelDevices(request)).toEqual({
      imported: { fireAlarm: 0, extinguishers: 0, emergencyLights: 1, sprinkler: 0 },
      updated: { fireAlarm: 0, extinguishers: 0, emergencyLights: 1, sprinkler: 0 },
      excluded: [], siteUpdated: { fieldsUpdated: 2, updatedFields: ["name", "city"] },
    });
    expect(withAttachmentWrite).toHaveBeenCalledWith(expect.anything(), "files.importExcelDevices", [file, { entityType: "job", entityId: 20 }], expect.any(Function));
    expect(importWorkbookForSite).toHaveBeenCalledWith({ fileBuffer: Buffer.from("downloaded source"),
      fileName: "source.xlsx", siteId: 10, companyId: 3, customerOrgId: 30, userId: 7,
      selectedSheets: ["Emergency Lights"], preserveSourceOrder: true });
    expect(updateSummary).toHaveBeenCalledTimes(1);
  });

  it("rejects source/destination disagreement before contacting storage", async () => {
    vi.mocked(assertAttachmentDestination).mockResolvedValue({ companyId: 4, customerOrgId: 30, siteId: 10 } as any);
    await expect(caller().importExcelDevices(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(storageGet).not.toHaveBeenCalled();
    expect(importWorkbookForSite).not.toHaveBeenCalled();
  });

  it("rejects a source job sealed during download before importing any rows", async () => {
    vi.mocked(withAttachmentWrite).mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller().importExcelDevices(request)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(importWorkbookForSite).not.toHaveBeenCalled();
    expect(updateSummary).not.toHaveBeenCalled();
  });

  it("rejects a replacement source key and a changed customer after obtaining locks", async () => {
    vi.mocked(assertAttachmentLinksUnchanged).mockResolvedValue({ ...file, fileKey: "replacement.xlsx" } as any);
    await expect(caller().importExcelDevices(request)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(importWorkbookForSite).not.toHaveBeenCalled();
    vi.mocked(assertAttachmentLinksUnchanged).mockResolvedValue(file as any);
    vi.mocked(assertSiteCompany).mockResolvedValueOnce(site as any).mockResolvedValueOnce({ ...site, customerOrgId: 31 } as any);
    await expect(caller().importExcelDevices(request)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(importWorkbookForSite).not.toHaveBeenCalled();
  });

  it("propagates a failed import-summary save to the owner of the shared transaction", async () => {
    updateSummary.mockRejectedValue(new Error("Import status failed"));
    await expect(caller().importExcelDevices(request)).rejects.toThrow("Import status failed");
    expect(importWorkbookForSite).toHaveBeenCalledTimes(1);
  });
});
