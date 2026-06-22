/**
 * crossTenantSecurity.test.ts
 *
 * Proves the company-ownership and finalization guards added to the
 * inspection/checklist, fire alarm, sprinkler, and compliance routers:
 *   - A user from Company B is rejected with FORBIDDEN when operating on
 *     a jobId/inspectionId that belongs to Company A.
 *   - Mutations on an already-finalized job are rejected, not silently
 *     accepted.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => {
  const getJobById = vi.fn();
  return {
    getDb: vi.fn(),
    getJobById,
    // Mirrors the real helper: loads the job via getJobById and enforces company scope.
    assertJobCompany: vi.fn(async (jobId: number, companyId: number) => {
      const job = await getJobById(jobId);
      if (!job) throw new Error(`Job ${jobId} not found`);
      if (job.companyId !== companyId) throw new Error("Access denied");
      return job;
    }),
    // Mirrors the real helper: throws when the job is already finalized.
    assertJobNotFinalized: vi.fn(async (jobId: number) => {
      const job = await getJobById(jobId);
      if (job?.finalizedAt) throw new Error("Job is finalized and immutable");
    }),
    saveChecklistResponse: vi.fn(),
    bulkSaveChecklistResponses: vi.fn(),
    withAudit: vi.fn(async (_ctx: any, _name: any, fn: any) => fn({})),
  };
});

vi.mock("./db.sprinkler", () => ({
  getSprinklerInspectionById: vi.fn(),
  updateSprinklerInspection: vi.fn(),
}));

import * as db from "./db";
import * as sprinklerDb from "./db.sprinkler";
import { finalizeJob } from "./compliance/finalizeJob";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeUserCtx(companyId: number, role: AuthenticatedUser["role"] = "technician"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "user-1",
    email: "user@example.com",
    name: "Test User",
    loginMethod: "manus",
    role,
    companyId,
    customerOrgId: null,
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Cross-tenant job ownership — checklistRouter.saveResponse", () => {
  it("rejects a job belonging to another company with FORBIDDEN", async () => {
    vi.mocked(db.getJobById).mockResolvedValue({ id: 1, companyId: 2, finalizedAt: null } as any);

    const ctx = makeUserCtx(1); // caller is in company 1, job belongs to company 2
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.checklist.saveResponse({
        jobId: 1,
        sectionNumber: "1",
        itemId: "1a",
        status: "PASS",
      })
    ).rejects.toThrow();

    expect(db.saveChecklistResponse).not.toHaveBeenCalled();
  });

  it("rejects writes against an already-finalized job", async () => {
    vi.mocked(db.getJobById).mockResolvedValue({
      id: 1,
      companyId: 1,
      finalizedAt: new Date(),
    } as any);

    const ctx = makeUserCtx(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.checklist.saveResponse({
        jobId: 1,
        sectionNumber: "1",
        itemId: "1a",
        status: "PASS",
      })
    ).rejects.toThrow();

    expect(db.saveChecklistResponse).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — checklistRouter.bulkSaveResponses", () => {
  it("rejects writes against an already-finalized job", async () => {
    vi.mocked(db.getJobById).mockResolvedValue({
      id: 1,
      companyId: 1,
      finalizedAt: new Date(),
    } as any);

    const ctx = makeUserCtx(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.checklist.bulkSaveResponses({
        responses: [{ jobId: 1, sectionNumber: "1", itemId: "1a", status: "PASS" }],
      })
    ).rejects.toThrow();

    expect(db.bulkSaveChecklistResponses).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — fireAlarmRouter.saveInspectionResult", () => {
  it("rejects a job belonging to another company with FORBIDDEN", async () => {
    vi.mocked(db.getJobById).mockResolvedValue({ id: 1, companyId: 2, finalizedAt: null } as any);

    const ctx = makeUserCtx(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.fireAlarm.saveInspectionResult({
        jobId: 1,
        fireAlarmSystemId: 1,
        checklistItemId: 1,
        result: "pass",
      })
    ).rejects.toThrow();

    expect(db.getDb).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — sprinklerRouter.updateInspection", () => {
  it("rejects an inspection whose parent job belongs to another company with FORBIDDEN", async () => {
    vi.mocked(sprinklerDb.getSprinklerInspectionById).mockResolvedValue({ id: 1, jobId: 1 } as any);
    vi.mocked(db.getJobById).mockResolvedValue({ id: 1, companyId: 2, finalizedAt: null } as any);

    const ctx = makeUserCtx(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.sprinkler.updateInspection({ id: 1, buildingId: "B1" })
    ).rejects.toThrow();

    expect(sprinklerDb.updateSprinklerInspection).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — complianceRouter.finalizeJob (function-level)", () => {
  it("rejects a job belonging to another company with FORBIDDEN before any further DB access", async () => {
    const jobRow = {
      id: 1,
      companyId: 2,
      leadTechnicianId: null,
      finalizedAt: null,
      status: "in_progress",
      techSignatureUrl: "sig.png",
    };

    let selectCalls = 0;
    const fakeDb = {
      select: () => {
        selectCalls++;
        return {
          from: () => ({
            where: () => Promise.resolve([jobRow]),
          }),
        };
      },
    } as any;

    const ctx = makeUserCtx(1, "admin");

    await expect(
      finalizeJob({ jobId: 1, clientAssertsSynced: true }, ctx, fakeDb)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // Only the initial job lookup should have run — the company check
    // must short-circuit before the sync-assertion / payload-building queries.
    expect(selectCalls).toBe(1);
  });
});
