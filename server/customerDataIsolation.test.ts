/**
 * customerDataIsolation.test.ts
 *
 * Regression coverage for the H1 finding: the customer portal must never
 * receive internal-only fields (aiSummary, qaNote, estimatedCost,
 * resolutionNotes, repairs.aiRecommendations, non-customer-facing
 * attachments) even when it legitimately fetches its own org's reports
 * and deficiencies. Non-customer (office/admin/technician) callers must
 * keep receiving the full row, and a non-customer caller must not be able
 * to pull another company's customer-org data by passing an arbitrary
 * customerOrgId.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  getJobById: vi.fn(),
  getCustomerOrgById: vi.fn(),
  getReportById: vi.fn(),
  getReportsByJob: vi.fn(),
  getReportsByCustomerOrg: vi.fn(),
  getDeficiencyById: vi.fn(),
  getDeficienciesByCustomerOrg: vi.fn(),
  getAttachmentsByEntity: vi.fn(),
  getRepairsByDeficiency: vi.fn(),
}));

vi.mock("./db.sprinkler", () => ({
  getSprinklerInspectionById: vi.fn(),
  updateSprinklerInspection: vi.fn(),
}));

vi.mock("./_core/googleAuth.js", () => ({
  getValidGoogleToken: vi.fn(async () => "fake-google-token"),
}));

vi.mock("./customerRecords/driveService.js", () => ({
  isDriveConfigured: vi.fn(() => true),
  searchInRoot: vi.fn(async () => ({ entries: [], error: null })),
  listRootChildren: vi.fn(),
  listFolderById: vi.fn(),
  downloadDriveFile: vi.fn(),
}));

import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeUserCtx(
  role: AuthenticatedUser["role"],
  companyId: number | null,
  customerOrgId: number | null = null
): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "user-1",
    email: "user@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    companyId,
    customerOrgId,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    requestId: "test-request",
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  };
}

const REPORT_ROW = {
  id: 10,
  jobId: 1,
  reportNumber: "RPT-1",
  title: "Annual Fire Alarm Inspection",
  executiveSummary: "Everything passed.",
  aiSummary: "DRAFT AI summary — unverified",
  qaNote: "QA: needs corrections before sending",
  status: "approved",
  fileKey: "reports/10.pdf",
};

const JOB_ROW = { id: 1, companyId: 1, customerOrgId: 5 };

const DEFICIENCY_ROW = {
  id: 20,
  jobId: 1,
  title: "Damaged pull station",
  estimatedCost: "450.00",
  resolutionNotes: "Internal: ordered part #4471, ETA 3 days",
  correctiveAction: "Replace pull station",
  customerExplanation: "The pull station will be replaced under warranty.",
};

const REPAIR_ROW = {
  id: 30,
  deficiencyId: 20,
  description: "Replace pull station",
  aiRecommendations: { suggestedPart: "Internal AI part suggestion" },
};

const ATTACHMENT_ROWS = [
  { id: 1, entityType: "deficiency", entityId: 20, isCustomerFacing: 1, fileName: "after.jpg" },
  { id: 2, entityType: "deficiency", entityId: 20, isCustomerFacing: 0, fileName: "internal-note.jpg" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Customer data isolation — report.get", () => {
  it("strips aiSummary/qaNote for a customer caller", async () => {
    vi.mocked(db.getReportById).mockResolvedValue(REPORT_ROW as any);
    vi.mocked(db.getJobById).mockResolvedValue(JOB_ROW as any);

    const ctx = makeUserCtx("customer", null, 5);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.report.get({ id: 10 });

    expect(result).not.toHaveProperty("aiSummary");
    expect(result).not.toHaveProperty("qaNote");
    expect(result).toMatchObject({ id: 10, title: REPORT_ROW.title });
  });

  it("keeps aiSummary/qaNote for an office caller in the same company", async () => {
    vi.mocked(db.getReportById).mockResolvedValue(REPORT_ROW as any);
    vi.mocked(db.getJobById).mockResolvedValue(JOB_ROW as any);

    const ctx = makeUserCtx("office", 1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.report.get({ id: 10 });

    expect(result).toMatchObject({ aiSummary: REPORT_ROW.aiSummary, qaNote: REPORT_ROW.qaNote });
  });
});

describe("Customer data isolation — report.listByJob", () => {
  it("strips aiSummary/qaNote from every row for a customer caller", async () => {
    vi.mocked(db.getJobById).mockResolvedValue(JOB_ROW as any);
    vi.mocked(db.getReportsByJob).mockResolvedValue([REPORT_ROW] as any);

    const ctx = makeUserCtx("customer", null, 5);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.report.listByJob({ jobId: 1 });

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty("aiSummary");
    expect(result[0]).not.toHaveProperty("qaNote");
  });
});

describe("Customer data isolation — report.listByCustomerOrg", () => {
  it("strips aiSummary/qaNote for a customer caller", async () => {
    vi.mocked(db.getReportsByCustomerOrg).mockResolvedValue([REPORT_ROW] as any);

    const ctx = makeUserCtx("customer", null, 5);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.report.listByCustomerOrg({ customerOrgId: 5 });

    expect(result[0]).not.toHaveProperty("aiSummary");
    expect(result[0]).not.toHaveProperty("qaNote");
  });

  it("rejects a non-customer caller requesting a customer org from another company", async () => {
    vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 5, companyId: 2 } as any);

    const ctx = makeUserCtx("office", 1);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.report.listByCustomerOrg({ customerOrgId: 5 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(db.getReportsByCustomerOrg).not.toHaveBeenCalled();
  });
});

describe("Customer data isolation — deficiency.get", () => {
  it("strips estimatedCost/resolutionNotes, repairs.aiRecommendations, and internal-only attachments for a customer caller", async () => {
    vi.mocked(db.getDeficiencyById).mockResolvedValue(DEFICIENCY_ROW as any);
    vi.mocked(db.getJobById).mockResolvedValue(JOB_ROW as any);
    vi.mocked(db.getAttachmentsByEntity).mockResolvedValue(ATTACHMENT_ROWS as any);
    vi.mocked(db.getRepairsByDeficiency).mockResolvedValue([REPAIR_ROW] as any);

    const ctx = makeUserCtx("customer", null, 5);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.deficiency.get({ id: 20 });

    expect(result!.deficiency).not.toHaveProperty("estimatedCost");
    expect(result!.deficiency).not.toHaveProperty("resolutionNotes");
    expect(result!.deficiency).toMatchObject({ customerExplanation: DEFICIENCY_ROW.customerExplanation });

    expect(result!.repairs[0]).not.toHaveProperty("aiRecommendations");

    expect(result!.attachments).toHaveLength(1);
    expect(result!.attachments[0].id).toBe(1);
  });

  it("returns the full row, all repairs, and all attachments for an office caller", async () => {
    vi.mocked(db.getDeficiencyById).mockResolvedValue(DEFICIENCY_ROW as any);
    vi.mocked(db.getJobById).mockResolvedValue(JOB_ROW as any);
    vi.mocked(db.getAttachmentsByEntity).mockResolvedValue(ATTACHMENT_ROWS as any);
    vi.mocked(db.getRepairsByDeficiency).mockResolvedValue([REPAIR_ROW] as any);

    const ctx = makeUserCtx("office", 1);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.deficiency.get({ id: 20 });

    expect(result!.deficiency).toMatchObject({ estimatedCost: DEFICIENCY_ROW.estimatedCost });
    expect(result!.repairs[0]).toMatchObject({ aiRecommendations: REPAIR_ROW.aiRecommendations });
    expect(result!.attachments).toHaveLength(2);
  });
});

describe("Customer data isolation — deficiency.listByCustomerOrg", () => {
  it("strips estimatedCost/resolutionNotes for a customer caller", async () => {
    vi.mocked(db.getDeficienciesByCustomerOrg).mockResolvedValue([DEFICIENCY_ROW] as any);

    const ctx = makeUserCtx("customer", null, 5);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.deficiency.listByCustomerOrg({ customerOrgId: 5 });

    expect(result[0]).not.toHaveProperty("estimatedCost");
    expect(result[0]).not.toHaveProperty("resolutionNotes");
  });

  it("rejects a non-customer caller requesting a customer org from another company", async () => {
    vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 5, companyId: 2 } as any);

    const ctx = makeUserCtx("technician", 1);
    const caller = appRouter.createCaller(ctx);

    await expect(caller.deficiency.listByCustomerOrg({ customerOrgId: 5 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(db.getDeficienciesByCustomerOrg).not.toHaveBeenCalled();
  });
});
