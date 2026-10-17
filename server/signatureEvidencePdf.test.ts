import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { storageGet } from "./storage";
import { assertPublicHttpUrl } from "./_core/ssrfGuard";
import { generateComplianceReportPDF, type ComplianceReportData } from "./pdfGeneratorCompliance";
import { generateInspectionReportPDF, type ReportData } from "./pdfGeneratorFirePro";
import { buildCustomerSafeComplianceData, buildCustomerSafeReportData } from "./customerSafeReport";

vi.mock("./storage", () => ({ storageGet: vi.fn() }));
vi.mock("./_core/ssrfGuard", () => ({ assertPublicHttpUrl: vi.fn() }));
const fetchMock = vi.fn();
// A real, repository-owned PNG exercises PDFKit's actual image embedding.
const png = readFileSync(new URL("../assets/ewf-logo.png", import.meta.url));
const inspection: ReportData = {
  jobNumber: "SIG-1", jobTitle: "Captured inspection", siteName: "Recorded building", siteAddress: "Recorded address", siteCity: "Recorded city", siteState: "",
  customerName: "Recorded customer", inspectionDate: new Date("2026-10-17T12:00:00Z"), technicianName: "Recorded technician", companyName: "Recorded company", deviceSummaries: [], deficiencies: [], inspectionResults: [],
};
const compliance: ComplianceReportData = {
  workOrderNumber: "SIG-1", dateOfService: new Date("2026-10-17T12:00:00Z"), contactPerson: "Recorded contact", contactPhone: "", buildingName: "Recorded building", buildingAddress: "Recorded address", city: "Recorded city",
  systemsInspected: { fireAlarmSystem: false, commonAreaDevices: false, inSuiteDevices: false, sprinklerSystem: false, fireExtinguishers: false, emergencyLighting: false, hydrant: false, winterization: false, generator: false, backflow: false, monitoring: false, smokeControl: false, suppressionSystems: false, standpipe: false, kitchen: false },
  systemModel: "Not recorded", deficienciesIdentified: false, technicianName: "Recorded technician", technicianCertificateNumber: "", companyName: "Recorded company", companyPhone: "", checklists: [], fireAlarmDevices: [], fireExtinguishers: [], emergencyLights: [], deficiencies: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(storageGet).mockResolvedValue({ key: "signatures/permanent.png", url: "https://storage.example/fresh?signature=new" });
  vi.stubEnv("S3_ENDPOINT", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(png));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const imageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype \/Image\b/g) ?? []).length;
const generators = [
  ["inspection", (signature = {}) => generateInspectionReportPDF(buildCustomerSafeReportData({ ...inspection, ...signature }))],
  ["compliance", (signature = {}) => generateComplianceReportPDF(buildCustomerSafeComplianceData({ ...compliance, ...signature }))],
] as const;
it.each(generators)("%s PDFs embed a freshly signed durable signature instead of its expired upload URL", async (_name, generate) => {
  const unsigned = await generate();
  const signature = { techSignatureKey: "signatures/permanent.png", techSignatureUrl: "https://storage.example/old?signature=expired" };
  const before = structuredClone(signature);
  const signed = await generate(signature);
  expect(storageGet).toHaveBeenCalledWith(signature.techSignatureKey);
  expect(assertPublicHttpUrl).toHaveBeenCalledWith("https://storage.example/fresh?signature=new");
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledWith("https://storage.example/fresh?signature=new", { redirect: "error" });
  expect(imageCount(signed)).toBeGreaterThan(imageCount(unsigned));
  expect(signed.toString("latin1")).not.toContain("signatures/permanent.png");
  expect(signature).toEqual(before);
});
it.each(generators)("%s PDFs fail when captured signature bytes cannot be rendered", async (_name, generate) => {
  fetchMock.mockResolvedValue(new Response("invalid-image"));
  await expect(generate({ techSignatureKey: "signatures/permanent.png" }).then(() => undefined)).rejects.toThrow("signature could not be rendered");
});
it.each(generators)("%s PDFs embed signatures at the exact configured private storage endpoint", async (_name, generate) => {
  vi.stubEnv("S3_ENDPOINT", "http://127.0.0.1:9000");
  vi.stubEnv("S3_BUCKET", "inspectra-images");
  const freshUrl = `http://127.0.0.1:9000/inspectra-images/signatures/permanent.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${"a".repeat(64)}`;
  vi.mocked(storageGet).mockResolvedValue({ key: "signatures/permanent.png", url: freshUrl });
  const unsigned = await generate();
  const signed = await generate({ techSignatureKey: "signatures/permanent.png", techSignatureUrl: "http://127.0.0.1:9000/stale.png" });
  expect(fetchMock).toHaveBeenCalledWith(freshUrl, { redirect: "error" });
  expect(assertPublicHttpUrl).not.toHaveBeenCalled();
  expect(imageCount(signed)).toBeGreaterThan(imageCount(unsigned));
});
