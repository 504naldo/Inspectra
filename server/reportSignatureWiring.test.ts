import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { generateInspectionReportPDF } from "./pdfGeneratorFirePro";
import { generateComplianceReportPDF } from "./pdfGeneratorCompliance";
import { reportRouter } from "./routers/reportRouter";

vi.mock("./db", () => ({
  assertJobCompany: vi.fn(),
  getDb: vi.fn(),
  getSiteById: vi.fn(),
  getCustomerOrgById: vi.fn(),
  getCompanyById: vi.fn(),
  getCompanySettings: vi.fn(),
  getInspectionResultsByJob: vi.fn(),
  getDeficienciesByJob: vi.fn(),
  getInspectionStats: vi.fn(),
  createReport: vi.fn(),
  updateJob: vi.fn(),
}));
vi.mock("./jobWriteTransaction", () => ({
  withReportJob: async (
    ctx: TrpcContext,
    _procedure: string,
    jobId: number,
    generate: (job: Job) => unknown,
  ) => generate(await db.assertJobCompany(jobId, ctx.user!.companyId!)),
}));
vi.mock("./pdfGeneratorFirePro", () => ({ generateInspectionReportPDF: vi.fn() }));
vi.mock("./pdfGeneratorCompliance", () => ({ generateComplianceReportPDF: vi.fn() }));
vi.mock("./canonicalFireAlarmReport", () => ({
  getCanonicalFireAlarmChecklist: vi.fn().mockResolvedValue([]),
}));
vi.mock("./canonicalTemplateReport", () => ({
  getCapturedTemplateReportData: vi.fn().mockResolvedValue([]),
}));
vi.mock("./recordedReportFacts", async importOriginal => ({
  ...(await importOriginal<typeof import("./recordedReportFacts")>()),
  getRecordedReportFacts: vi.fn().mockResolvedValue({
    inspectionDate: new Date("2026-10-01T12:00:00Z"),
    technicianName: "Captured technician",
  }),
}));
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "reports/generated.pdf", url: "https://storage.example/generated.pdf" }),
}));
vi.mock("./emailService", () => ({ sendReportEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./_core/driveUpload", () => ({ uploadReportToDrive: vi.fn().mockResolvedValue(null) }));

const context = {
  user: { id: 7, companyId: 10, role: "office" },
  req: { headers: {} },
  res: {},
} as unknown as TrpcContext;

let job: Job;
beforeEach(() => {
  vi.clearAllMocks();
  job = {
    id: 20,
    companyId: 10,
    siteId: 30,
    customerOrgId: 40,
    jobNumber: "JOB-20",
    title: "Annual inspection",
    jobType: "annual",
    status: "completed",
    finalizedAt: new Date("2026-10-02T12:00:00Z"),
    leadTechnicianId: 7,
    techSignatureKey: null,
    techSignatureUrl: null,
  } as Job;
  vi.mocked(db.assertJobCompany).mockImplementation(async () => job);
  vi.mocked(db.getSiteById).mockResolvedValue({ id: 30, name: "Test building" } as any);
  vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 40, name: "Test customer" } as any);
  vi.mocked(db.getCompanyById).mockResolvedValue({ id: 10, name: "Test company" } as any);
  vi.mocked(db.getCompanySettings).mockResolvedValue({ logoUrl: null } as any);
  vi.mocked(db.getInspectionResultsByJob).mockResolvedValue([]);
  vi.mocked(db.getDeficienciesByJob).mockResolvedValue([]);
  vi.mocked(db.getInspectionStats).mockResolvedValue({ total: 0, pass: 0, fail: 0 } as any);
  vi.mocked(db.createReport).mockResolvedValue({ id: 50 } as any);
  vi.mocked(generateInspectionReportPDF).mockResolvedValue(Buffer.from("inspection-pdf"));
  vi.mocked(generateComplianceReportPDF).mockResolvedValue(Buffer.from("compliance-pdf"));
});

const sources = [
  {
    name: "durable key and expired URL",
    key: "signatures/permanent.png",
    url: "https://storage.example/expired.png?X-Amz-Date=20200101T000000Z",
  },
  { name: "durable key only", key: "signatures/permanent.png", url: null },
  { name: "legacy URL only", key: null, url: "https://storage.example/legacy.png" },
];

describe.each([
  { procedure: "generatePDF" as const, generator: generateInspectionReportPDF },
  { procedure: "generateCompliancePDF" as const, generator: generateComplianceReportPDF },
])("$procedure signature wiring", ({ procedure, generator }) => {
  it.each(sources)("preserves $name through the customer-safe builder", async ({ key, url }) => {
    job.techSignatureKey = key;
    job.techSignatureUrl = url;
    const persistedJob = structuredClone(job);

    const result = await reportRouter.createCaller(context)[procedure]({ jobId: job.id });

    expect(result.success).toBe(true);
    expect(generator).toHaveBeenCalledOnce();
    expect(vi.mocked(generator).mock.calls[0][0]).toMatchObject({
      techSignatureKey: key ?? undefined,
      techSignatureUrl: url ?? undefined,
    });
    expect(job).toEqual(persistedJob);
    expect(db.updateJob).not.toHaveBeenCalled();
  });
});
