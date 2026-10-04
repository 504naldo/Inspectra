import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getCanonicalFireAlarmChecklist } from "./canonicalFireAlarmReport";
import { TRPCError } from "@trpc/server";
vi.mock("./canonicalFireAlarmReport", () => ({
  getCanonicalFireAlarmChecklist: vi.fn(),
}));

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({}),
  assertJobCompany: vi.fn().mockResolvedValue({
    id: 1,
    companyId: 1,
    siteId: 1,
    customerOrgId: 1,
    assignedTechnicianId: null,
  }),
  getSiteById: vi.fn().mockResolvedValue({ id: 1, name: "Test Site" }),
  getCustomerOrgById: vi.fn().mockResolvedValue({ id: 1, name: "Test Customer" }),
  getCompanyById: vi.fn().mockResolvedValue({ id: 1, name: "Test Company" }),
  getInspectionResultsByJob: vi.fn().mockResolvedValue([]),
  getDeficienciesByJob: vi.fn().mockResolvedValue([]),
  getUserById: vi.fn().mockResolvedValue({ id: 2, name: "Test Technician" }),
  getChecklistResponsesByJob: vi.fn(),
}));

import * as db from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createOfficeContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "office-user-1",
    email: "office@example.com",
    name: "Test Office User",
    loginMethod: "manus",
    role: "office",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    companyId: 1,
    customerOrgId: null,
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), setHeader: vi.fn(), } as unknown as TrpcContext["res"],
  };
}

describe("Annual report generation - checklist completeness gate", () => {
  it("blocks generation when the CAN/ULC-S536 checklist is incomplete", async () => {
    vi.mocked(getCanonicalFireAlarmChecklist).mockRejectedValue(
      new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Fire alarm checklist item(s) incomplete",
      }));

    const caller = appRouter.createCaller(createOfficeContext());

    await expect(caller.annualReport.generate({ jobId: 1 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("checklist item(s) incomplete"),
    });
  });

  it("does not block on the checklist gate once every item has a saved response", async () => {
    vi.mocked(getCanonicalFireAlarmChecklist).mockResolvedValue([]);

    const caller = appRouter.createCaller(createOfficeContext());

    // The checklist gate is satisfied; whatever happens afterward (PDF assembly,
    // storage, etc., which this test does not mock) must not be a checklist error.
    await expect(caller.annualReport.generate({ jobId: 1 })).rejects.not.toMatchObject({
      message: expect.stringContaining("checklist item(s) incomplete"),
    });
  });
});
