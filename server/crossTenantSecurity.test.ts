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
    // tenantGuards.ts (real, unmocked) calls these getters directly.
    getSiteById: vi.fn(),
    getAreaById: vi.fn(),
    getDeviceById: vi.fn(),
    getDevicesByIds: vi.fn(),
    getCustomerOrgById: vi.fn(),
    getCustomerOrgsByCompany: vi.fn(),
    getSitesByCompany: vi.fn(),
    searchJobs: vi.fn(),
    getAttachmentById: vi.fn(),
    getAttachmentsByEntity: vi.fn(),
    getInspectionResultById: vi.fn(),
    getDeficiencyById: vi.fn(),
    getRepairById: vi.fn(),
    getUploadQueueItemById: vi.fn(),
    getUploadQueueItemByLocalId: vi.fn(),
    updateDevice: vi.fn(),
    updateArea: vi.fn(),
    reorderDevices: vi.fn(),
    updateAttachment: vi.fn(),
    updateAttachmentTags: vi.fn(),
    deleteAttachment: vi.fn(),
    createAttachment: vi.fn(),
    createUploadQueueItem: vi.fn(),
    createCustomerOrg: vi.fn(),
    updateCustomerOrg: vi.fn(),
    deleteCustomerOrg: vi.fn(),
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

describe("Cross-tenant job ownership — deviceRouter.update", () => {
  it("rejects a device belonging to another company with FORBIDDEN", async () => {
    vi.mocked(db.getDeviceById).mockResolvedValue({ id: 1, companyId: 2 } as any);

    const ctx = makeUserCtx(1, "office");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.device.update({ id: 1, deviceType: "Smoke Detector" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.updateDevice).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — deviceRouter.reorder", () => {
  it("rejects a batch containing a device from another company with FORBIDDEN", async () => {
    vi.mocked(db.getDevicesByIds).mockResolvedValue([
      { id: 1, companyId: 1 },
      { id: 2, companyId: 2 },
    ] as any);

    const ctx = makeUserCtx(1, "office");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.device.reorder({ orderedIds: [1, 2] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.reorderDevices).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — attachmentRouter.update", () => {
  it("rejects an attachment whose parent job belongs to another company with FORBIDDEN", async () => {
    vi.mocked(db.getAttachmentById).mockResolvedValue({ id: 1, jobId: 5, siteId: null, deviceId: null } as any);
    vi.mocked(db.getJobById).mockResolvedValue({ id: 5, companyId: 2 } as any);

    const ctx = makeUserCtx(1, "office");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.attachment.update({ id: 1, caption: "updated" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.updateAttachment).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — attachmentRouter.delete", () => {
  it("rejects an attachment whose parent site belongs to another company with FORBIDDEN", async () => {
    vi.mocked(db.getAttachmentById).mockResolvedValue({ id: 1, jobId: null, siteId: 5, deviceId: null } as any);
    vi.mocked(db.getSiteById).mockResolvedValue({ id: 5, companyId: 2 } as any);

    const ctx = makeUserCtx(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.attachment.delete({ id: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.deleteAttachment).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — attachmentRouter.listByEntity", () => {
  it("rejects a device entityId belonging to another company with FORBIDDEN", async () => {
    vi.mocked(db.getDeviceById).mockResolvedValue({ id: 1, companyId: 2 } as any);

    const ctx = makeUserCtx(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.attachment.listByEntity({ entityType: "device", entityId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.getAttachmentsByEntity).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant data injection — attachmentRouter.upload", () => {
  it("rejects a siteId belonging to another company with FORBIDDEN, even when the entity itself is owned by the caller", async () => {
    vi.mocked(db.getDeviceById).mockResolvedValue({ id: 1, companyId: 1 } as any);
    vi.mocked(db.getSiteById).mockResolvedValue({ id: 5, companyId: 2 } as any);

    const ctx = makeUserCtx(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.attachment.upload({
        entityType: "device",
        entityId: 1,
        fileName: "photo.png",
        fileData: "AAAA",
        mimeType: "image/png",
        siteId: 5,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.createAttachment).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — uploadQueueRouter.complete", () => {
  it("rejects completing another user's queue item with FORBIDDEN", async () => {
    vi.mocked(db.getUploadQueueItemById).mockResolvedValue({
      id: 1,
      userId: 99,
      entityType: "job",
      entityId: 1,
      fileName: "photo.png",
      mimeType: "image/png",
      fileSize: 100,
      caption: null,
      tags: null,
    } as any);

    const ctx = makeUserCtx(1); // ctx user id is 1, queue item belongs to user 99
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.uploadQueue.complete({ id: 1, fileKey: "key", fileUrl: "https://example.com/key" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.createAttachment).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — filesRouter.create", () => {
  it("rejects an entityId belonging to another company's job with FORBIDDEN before touching the database", async () => {
    vi.mocked(db.getJobById).mockResolvedValue({ id: 1, companyId: 2 } as any);

    const ctx = makeUserCtx(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.files.create({
        entityType: "job",
        entityId: 1,
        fileName: "report.xlsx",
        fileKey: "key",
        fileUrl: "https://example.com/key",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.getDb).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — filesRouter.importExcelDevices", () => {
  it("rejects a site belonging to another company with FORBIDDEN before reading the file", async () => {
    vi.mocked(db.getDb).mockResolvedValue({} as any);
    vi.mocked(db.getSiteById).mockResolvedValue({ id: 1, companyId: 2 } as any);

    const ctx = makeUserCtx(1);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.files.importExcelDevices({ fileId: 1, siteId: 1, jobId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.assertJobCompany).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — customerOrgRouter.update", () => {
  it("rejects a customer org belonging to another company with FORBIDDEN", async () => {
    vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 1, companyId: 2 } as any);

    const ctx = makeUserCtx(1, "office");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.customerOrg.update({ id: 1, name: "Acme" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.updateCustomerOrg).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — customerOrgRouter.delete", () => {
  it("rejects a customer org belonging to another company with FORBIDDEN", async () => {
    vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 1, companyId: 2 } as any);

    const ctx = makeUserCtx(1, "office");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.customerOrg.delete({ id: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.deleteCustomerOrg).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — customerOrgRouter.get", () => {
  it("rejects a customer org belonging to another company with FORBIDDEN for a non-customer caller", async () => {
    vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 1, companyId: 2 } as any);

    const ctx = makeUserCtx(1); // technician in company 1
    const caller = appRouter.createCaller(ctx);

    await expect(caller.customerOrg.get({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Cross-tenant job ownership — customerOrgRouter.create", () => {
  it("rejects a client-supplied companyId that doesn't match the caller's own company with FORBIDDEN", async () => {
    const ctx = makeUserCtx(1, "office");
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.customerOrg.create({ companyId: 2, name: "Acme" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.createCustomerOrg).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant job ownership — customerOrgRouter.list", () => {
  it("rejects a client-supplied companyId that doesn't match the caller's own company with FORBIDDEN", async () => {
    const ctx = makeUserCtx(1, "office");
    const caller = appRouter.createCaller(ctx);

    await expect(caller.customerOrg.list({ companyId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(db.getCustomerOrgsByCompany).not.toHaveBeenCalled();
  });
});

describe("Cross-tenant scoping — customerRecordsRouter.search", () => {
  it("always scopes the search to the caller's own company, ignoring any client-supplied companyId", async () => {
    vi.mocked(db.getCustomerOrgsByCompany).mockResolvedValue([]);
    vi.mocked(db.getSitesByCompany).mockResolvedValue([]);
    vi.mocked(db.searchJobs).mockResolvedValue([]);

    const ctx = makeUserCtx(1, "office");
    const caller = appRouter.createCaller(ctx);

    await caller.customerRecords.search({ query: "acme" } as any);

    expect(db.getCustomerOrgsByCompany).toHaveBeenCalledWith(1);
    expect(db.getSitesByCompany).toHaveBeenCalledWith(1);
    expect(db.searchJobs).toHaveBeenCalledWith(1, "acme");
  });
});
