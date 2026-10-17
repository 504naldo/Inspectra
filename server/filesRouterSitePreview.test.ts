import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import fetch from "node-fetch";
import { getDb } from "./db";
import { assertAttachmentDestination, assertAttachmentLinksUnchanged, withAttachmentWrite } from "./attachmentAccess";
import { resolveAuthorizedStorageDownload } from "./storageDownload";
import { filesRouter } from "./routers/filesRouter";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({ getDb: vi.fn(), assertJobCompany: vi.fn(), createAttachment: vi.fn() }));
vi.mock("./attachmentAccess", () => ({ assertAttachmentDestination: vi.fn(), assertAttachmentLinksUnchanged: vi.fn(),
  requireUploadedAttachment: vi.fn(), withAttachmentWrite: vi.fn(), filterAuthorizedAttachments: vi.fn() }));
vi.mock("./storageDownload", () => ({ resolveAuthorizedStorageDownload: vi.fn() }));
vi.mock("node-fetch", () => ({ default: vi.fn() }));

const file = { id: 50, entityType: "job", entityId: 20, jobId: 20, siteId: 10,
  fileKey: "synthetic-site.xlsx", fileName: "site.xlsx" };
const caller = () => filesRouter.createCaller({ user: { id: 7, role: "office", companyId: 3 } } as TrpcContext);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getDb).mockResolvedValue({ select: () => ({ from: () => ({ where: async () => [file] }) }) } as any);
  vi.mocked(assertAttachmentDestination).mockResolvedValue({ companyId: 3, siteId: 10, jobId: 20 } as any);
  vi.mocked(assertAttachmentLinksUnchanged).mockResolvedValue(file as any);
  vi.mocked(resolveAuthorizedStorageDownload).mockResolvedValue("https://files.example.invalid/synthetic-site.xlsx");
  const tx = { update: () => ({ set: () => ({ where: async () => undefined }) }) };
  vi.mocked(withAttachmentWrite).mockImplementation(async (_ctx, _name, _destinations, operation) => operation([], tx as any));
});

describe("site worksheet previews", () => {
  it.each(["two-column key/value", "three-column label/spacer/value"])("reads %s fields from a real XLSX workbook", async format => {
    const fields = [
      ["Site Name", "Synthetic Site"],
      ["Address", "456 Test Avenue"],
      ["City", "Synthetic City"],
      ["Contact Name", "Synthetic Contact"],
      ["Contact Phone", "555-0100"],
    ];
    const workbook = XLSX.utils.book_new();
    const rows = format.startsWith("two") ? fields : fields.map(([label, value]) => [label, "", value]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Site Information");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Location", "Tag", "Type"],
      ...Array.from({ length: 12 }, (_, index) => [`Location ${index + 1}`, `EXT-${index + 1}`, "ABC 10lb"]),
    ]), "Fire Extinguishers");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Location", "Tag", "Type"],
      ...Array.from({ length: 8 }, (_, index) => [`Location ${index + 1}`, `EL-${index + 1}`, "Emergency Light"]),
    ]), "Emergency Lights");
    for (const name of ["Labour Rates", "Summary"]) {
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
        ["Device Type", "Location"], ["Synthetic", "Synthetic"],
      ]), name);
    }
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Description", "Value"], ["Archive metadata", "Synthetic"],
    ]), "Extinguisher Devices Archive");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Location", "Time"], ["Synthetic airport", "09:00"],
    ]), "Flight Schedule");
    const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    vi.mocked(fetch).mockResolvedValue({ ok: true, buffer: async () => bytes } as any);

    const preview = await caller().previewImportExcel({ fileId: file.id });

    expect(preview).toMatchObject({ hasSiteSheet: true, sitePreview: {
      name: "Synthetic Site", address: "456 Test Avenue", city: "Synthetic City",
      contactName: "Synthetic Contact", contactPhone: "555-0100",
    }, counts: { extinguishers: 12, emergencyLights: 8 }, totalRows: 20 });
    expect(preview.availableSheets).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Fire Extinguishers", isDevice: true }),
      expect.objectContaining({ name: "Emergency Lights", isDevice: true }),
      expect.objectContaining({ name: "Labour Rates", isDevice: false }),
      expect.objectContaining({ name: "Summary", isDevice: false }),
      expect.objectContaining({ name: "Extinguisher Devices Archive", isDevice: false }),
      expect.objectContaining({ name: "Flight Schedule", isDevice: false }),
    ]));
  });
});
