import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { jobs } from "../drizzle/schema";
import * as db from "./db";
import * as sprinklerDb from "./db.sprinkler";
import { checklistRouter } from "./routers/inspectionRouter";
import { sprinklerRouter } from "./sprinklerRouter";
import type { TrpcContext } from "./_core/context";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("Legacy inspection sealing and rollback (MySQL)", () => {
  let companyId: number, siteId: number, orgId: number;
  let ctx: TrpcContext;
  beforeAll(async () => {
    const company = await db.createCompany({ name: "Inspection seal integrity" });
    companyId = company.id;
    const org = await db.createCustomerOrg({ companyId, name: "Inspection seal org" });
    orgId = org.id;
    const site = await db.createSite({ companyId, customerOrgId: orgId, name: "Inspection seal site" });
    siteId = site.id;
    ctx = {
      user: { id: 1, role: "office", companyId }, req: { headers: {} }, res: {},
      requestId: "inspection-seal-integrity", ipAddress: "127.0.0.1", userAgent: "vitest",
    } as unknown as TrpcContext;
  });
  afterEach(() => vi.restoreAllMocks());

  async function fixture() {
    const job = await db.createJob({ companyId, customerOrgId: orgId, siteId, title: "Seal fixture" });
    const created = await sprinklerDb.createSprinklerInspection({ jobId: job.id, inspectionDate: new Date() });
    const inspectionId = Number(created.insertId);
    await db.saveChecklistResponse({ jobId: job.id, sectionNumber: "1", itemId: "A", status: "PASS", comment: "Original" });
    return { job, inspectionId };
  }

  async function seal(jobId: number, paused?: ReturnType<typeof deferred>, release?: ReturnType<typeof deferred>) {
    await db.withAudit(ctx, "test.seal", async tx => {
      await db.assertJobNotFinalized(jobId, tx);
      await tx.update(jobs).set({ finalizedAt: new Date() }).where(eq(jobs.id, jobId));
      paused?.resolve();
      if (release) await release.promise;
    });
  }

  it.each(["save", "batch", "delete", "sprinkler"] as const)("rejects %s waiting behind a concurrent job seal", async kind => {
    const { job, inspectionId } = await fixture();
    const checklist = checklistRouter.createCaller(ctx);
    const sprinkler = sprinklerRouter.createCaller(ctx);
    const paused = deferred(), release = deferred();
    const sealing = seal(job.id, paused, release);
    await paused.promise;
    const response = { jobId: job.id, sectionNumber: "1", itemId: "A", status: "DEFICIENT" as const, comment: "Late" };
    const writing = (
      kind === "save" ? checklist.saveResponse(response) :
      kind === "batch" ? checklist.bulkSaveResponses({ responses: [response] }) :
      kind === "delete" ? checklist.deleteByJob({ jobId: job.id }) :
      sprinkler.updateInspection({ id: inspectionId, buildingId: "Late" })
    ).then(() => "written", error => error.code as string);
    let early;
    try {
      early = await Promise.race([writing, new Promise<null>(done => setTimeout(() => done(null), 100))]);
    } finally { release.resolve(); }
    await sealing;
    expect(early).toBeNull();
    expect(await writing).toBe("FORBIDDEN");
    expect(await db.getChecklistResponsesByJob(job.id)).toMatchObject([{ status: "PASS", comment: "Original" }]);
    expect((await sprinklerDb.getSprinklerInspectionById(inspectionId))?.buildingId).toBeNull();
  });

  it("holds the job lock until a checklist write commits", async () => {
    const { job } = await fixture();
    const saved = deferred(), release = deferred();
    const original = db.saveChecklistResponse;
    vi.spyOn(db, "saveChecklistResponse").mockImplementation(async values => {
      const result = await original(values);
      saved.resolve();
      await release.promise;
      return result;
    });
    const writing = checklistRouter.createCaller(ctx).saveResponse({ jobId: job.id, sectionNumber: "1", itemId: "A", status: "DEFICIENT", comment: "Committed before seal" });
    await saved.promise;
    const sealing = seal(job.id).then(() => "sealed");
    let early;
    try {
      early = await Promise.race([sealing, new Promise<null>(done => setTimeout(() => done(null), 100))]);
    } finally { release.resolve(); }
    await writing;
    await sealing;
    expect(early).toBeNull();
    expect(await db.getChecklistResponsesByJob(job.id)).toMatchObject([{ status: "DEFICIENT", comment: "Committed before seal" }]);
    expect((await db.getJobById(job.id))?.finalizedAt).toBeTruthy();
  });

  it("rolls back the whole checklist batch when its audited operation fails", async () => {
    const { job } = await fixture();
    // bulkSaveChecklistResponses calls its local helper, so inject failure after
    // the whole DAL call: neither write may escape the route transaction.
    const originalBulk = db.bulkSaveChecklistResponses;
    vi.spyOn(db, "bulkSaveChecklistResponses").mockImplementation(async values => {
      await originalBulk(values);
      throw new Error("Injected batch failure");
    });
    await expect(checklistRouter.createCaller(ctx).bulkSaveResponses({ responses: [
      { jobId: job.id, sectionNumber: "1", itemId: "A", status: "DEFICIENT" },
      { jobId: job.id, sectionNumber: "1", itemId: "B", status: "PASS" },
    ] })).rejects.toThrow("Injected batch failure");
    expect(await db.getChecklistResponsesByJob(job.id)).toMatchObject([{ itemId: "A", status: "PASS", comment: "Original" }]);
  });

  it.each(["systems", "checklist", "devices"] as const)("rolls back sprinkler %s replacement on the audited connection", async kind => {
    const { inspectionId } = await fixture();
    const caller = sprinklerRouter.createCaller(ctx);
    if (kind === "systems") {
      await sprinklerDb.upsertSprinklerSystems(inspectionId, [{ systemNumber: 1, notes: "Original" }]);
      const original = sprinklerDb.upsertSprinklerSystems;
      vi.spyOn(sprinklerDb, "upsertSprinklerSystems").mockImplementation(async (...args) => {
        await original(...args);
        throw new Error("Injected replacement failure");
      });
      await expect(caller.upsertSystems({ inspectionId, systems: [{ systemNumber: 2, notes: "Replacement" }] })).rejects.toThrow("Injected replacement failure");
      expect(await sprinklerDb.getSprinklerSystemsByInspectionId(inspectionId)).toMatchObject([{ systemNumber: 1, notes: "Original" }]);
    } else if (kind === "checklist") {
      await sprinklerDb.upsertSprinklerChecklistItems(inspectionId, [{ section: "A", questionText: "Original", questionOrder: 1 }]);
      const original = sprinklerDb.upsertSprinklerChecklistItems;
      vi.spyOn(sprinklerDb, "upsertSprinklerChecklistItems").mockImplementation(async (...args) => {
        await original(...args);
        throw new Error("Injected replacement failure");
      });
      await expect(caller.upsertChecklistItems({ inspectionId, items: [{ section: "B", questionText: "Replacement", questionOrder: 2 }] })).rejects.toThrow("Injected replacement failure");
      expect(await sprinklerDb.getSprinklerChecklistItemsByInspectionId(inspectionId)).toMatchObject([{ section: "A", questionText: "Original" }]);
    } else {
      await sprinklerDb.upsertSprinklerDevices(inspectionId, [{ deviceOrder: 1, location: "Original" }]);
      const original = sprinklerDb.upsertSprinklerDevices;
      vi.spyOn(sprinklerDb, "upsertSprinklerDevices").mockImplementation(async (...args) => {
        await original(...args);
        throw new Error("Injected replacement failure");
      });
      await expect(caller.upsertDevices({ inspectionId, devices: [{ deviceOrder: 2, location: "Replacement" }] })).rejects.toThrow("Injected replacement failure");
      expect(await sprinklerDb.getSprinklerDevicesByInspectionId(inspectionId)).toMatchObject([{ deviceOrder: 1, location: "Original" }]);
    }
  });
});
