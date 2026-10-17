import { beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { importPdfData } from "./_core/pdfImport";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";
import { runWithActor } from "./_core/actorContext";

const { parsePdf } = vi.hoisted(() => ({ parsePdf: vi.fn() }));
vi.mock("module", () => ({ createRequire: () => () => parsePdf }));
vi.mock("./db", () => ({
  getSiteById: vi.fn(), getCustomerOrgById: vi.fn(), getCustomerOrgsByCompany: vi.fn(),
  getSitesByCustomerOrg: vi.fn(), createCustomerOrg: vi.fn(), createSite: vi.fn(),
  getMaxDeviceSortOrder: vi.fn(), createDevice: vi.fn(), createAttachment: vi.fn(),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));

const site = { id: 10, companyId: 1, customerOrgId: 100, name: "Original site" };
const options = { pdfBuffer: Buffer.from("fake PDF"), fileName: "inspection.pdf", companyId: 1, userId: 1 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(db.getSiteById).mockResolvedValue(site as any);
  vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 100, companyId: 1 } as any);
  vi.mocked(db.getCustomerOrgsByCompany).mockResolvedValue([{ id: 100, name: "Original customer", companyId: 1 }] as any);
  vi.mocked(db.getSitesByCustomerOrg).mockResolvedValue([site] as any);
  vi.mocked(db.getMaxDeviceSortOrder).mockResolvedValue(0);
  vi.mocked(storagePut).mockResolvedValue({ key: "fake", url: "https://example.test/object" });
  parsePdf.mockResolvedValue({ text: "Inspection text for an existing building with sufficient content to extract." });
  vi.mocked(invokeLLM).mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({
      site: { name: "Original site", customerOrgName: "Original customer" },
      devices: [{ deviceType: "Smoke Detector", category: "FIRE_ALARM_DEVICE" }],
      summary: { totalDevices: 1, categories: { FIRE_ALARM_DEVICE: 1 }, confidence: "high", warnings: [] },
    }) } }],
  } as any);
});
function expectNoWrites() {
  for (const mock of [db.createCustomerOrg, db.createSite, db.createDevice, db.createAttachment, storagePut])
    expect(mock).not.toHaveBeenCalled();
}
describe("Core PDF import enforces destination links independently of its router", () => {
  it("rejects a mismatched customer before text extraction and AI", async () => {
    await expect(importPdfData({ ...options, siteId: 10, customerOrgId: 101 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(parsePdf).not.toHaveBeenCalled();
    expect(invokeLLM).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it("rejects a foreign inherited customer before text extraction and AI", async () => {
    vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 100, companyId: 2 } as any);
    await expect(runWithActor({ role: "admin", companyId: 1 }, () => importPdfData({ ...options, siteId: 10 })))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(parsePdf).not.toHaveBeenCalled();
    expect(invokeLLM).not.toHaveBeenCalled();
    expectNoWrites();
  });
  it.each(["office", "admin"])("%s rejects a name-matched site owned by a different company before writing", async role => {
    vi.mocked(db.getSiteById).mockResolvedValue({ ...site, companyId: 2 } as any);
    await expect(runWithActor({ role, companyId: 1 }, () => importPdfData(options)))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(invokeLLM).toHaveBeenCalledOnce();
    expectNoWrites();
  });
  it("rejects a name-matched site linked to a different customer before writing", async () => {
    vi.mocked(db.getSiteById).mockResolvedValue({ ...site, customerOrgId: 101 } as any);
    await expect(importPdfData(options)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expectNoWrites();
  });
  it("imports into a consistent existing site using its canonical customer", async () => {
    const result = await importPdfData({ ...options, siteId: 10 });
    expect(result).toMatchObject({ success: true, siteId: 10, customerOrgId: 100, devicesCreated: 1 });
    expect(db.createDevice).toHaveBeenCalledWith(expect.objectContaining({ companyId: 1, siteId: 10 }));
    expect(db.createAttachment).toHaveBeenCalledWith(expect.objectContaining({ entityType: "site", entityId: 10, siteId: 10 }));
    expect(db.createCustomerOrg).not.toHaveBeenCalled();
    expect(db.createSite).not.toHaveBeenCalled();
  });
});
