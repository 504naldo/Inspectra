import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import * as sprinklerDb from "./db.sprinkler";
import { checklistRouter, inspectionResultRouter } from "./routers/inspectionRouter";
import { sprinklerRouter } from "./sprinklerRouter";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  withAudit: vi.fn(), assertJobCompany: vi.fn(), assertJobNotFinalized: vi.fn(),
  saveChecklistResponse: vi.fn(), bulkSaveChecklistResponses: vi.fn(), deleteChecklistResponsesByJob: vi.fn(),
  upsertInspectionResult: vi.fn(), createSyncLog: vi.fn(),
}));
vi.mock("./tenantGuards", () => ({ assertDeviceForJob: vi.fn() }));
vi.mock("./db.sprinkler", () => ({
  getSprinklerInspectionById: vi.fn(), getSprinklerDeviceById: vi.fn(), getSprinklerChecklistItemById: vi.fn(),
  createSprinklerInspection: vi.fn(), updateSprinklerInspection: vi.fn(), finalizeSprinklerInspection: vi.fn(),
  upsertSprinklerSystems: vi.fn(), upsertSprinklerChecklistItems: vi.fn(), updateSprinklerChecklistItem: vi.fn(),
  upsertSprinklerDevices: vi.fn(), updateSprinklerDevice: vi.fn(), createSprinklerDevice: vi.fn(), deleteSprinklerDevice: vi.fn(),
  validateSprinklerInspectionForFinalize: vi.fn(),
}));

const ctx = { user: { id: 3, role: "office", companyId: 10 }, req: { headers: {} }, res: {} } as unknown as TrpcContext;
const checklist = checklistRouter.createCaller(ctx);
const inspection = inspectionResultRouter.createCaller(ctx);
const sprinkler = sprinklerRouter.createCaller(ctx);
const tx = {} as Parameters<Parameters<typeof db.withAudit>[2]>[0];
const response = { jobId: 1, sectionNumber: "1", itemId: "test", status: "PASS" as const };
let insideTransaction: boolean;
let sealed: boolean;
let events: string[];

beforeEach(() => {
  vi.resetAllMocks();
  insideTransaction = false;
  sealed = false;
  events = [];
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _name, fn) => {
    insideTransaction = true;
    try { return await fn(tx); } finally { insideTransaction = false; }
  });
  vi.mocked(db.assertJobCompany).mockImplementation(async id => {
    if (insideTransaction) events.push(`read:${id}`);
    return { id, companyId: 10, siteId: 20 } as any;
  });
  vi.mocked(db.assertJobNotFinalized).mockImplementation(async (id, connection) => {
    expect(insideTransaction).toBe(true);
    expect(connection).toBe(tx);
    events.push(`lock:${id}`);
    if (sealed) throw new TRPCError({ code: "FORBIDDEN", message: "JOB_FINALIZED_IMMUTABLE" });
  });
  vi.mocked(sprinklerDb.getSprinklerInspectionById).mockImplementation(async id => {
    if (insideTransaction) events.push("inspection");
    return { id, jobId: 1 } as any;
  });
  vi.mocked(sprinklerDb.getSprinklerDeviceById).mockResolvedValue({ id: 5, inspectionId: 2 } as any);
  vi.mocked(sprinklerDb.getSprinklerChecklistItemById).mockResolvedValue({ id: 5, inspectionId: 2 } as any);
  vi.mocked(sprinklerDb.validateSprinklerInspectionForFinalize).mockResolvedValue({ valid: true, errors: [] });
  vi.mocked(db.upsertInspectionResult).mockResolvedValue({ id: 7 } as any);
});

const writes = [
  ["checklist save", () => checklist.saveResponse(response), db.saveChecklistResponse],
  ["checklist batch", () => checklist.bulkSaveResponses({ responses: [response] }), db.bulkSaveChecklistResponses],
  ["checklist delete", () => checklist.deleteByJob({ jobId: 1 }), db.deleteChecklistResponsesByJob],
  ["sprinkler create", () => sprinkler.createInspection({ jobId: 1, inspectionDate: new Date() }), sprinklerDb.createSprinklerInspection],
  ["sprinkler update", () => sprinkler.updateInspection({ id: 2, buildingId: "Changed" }), sprinklerDb.updateSprinklerInspection],
  ["sprinkler finalize", () => sprinkler.finalizeInspection({ id: 2 }), sprinklerDb.finalizeSprinklerInspection],
  ["sprinkler systems", () => sprinkler.upsertSystems({ inspectionId: 2, systems: [{ systemNumber: 1 }] }), sprinklerDb.upsertSprinklerSystems],
  ["sprinkler checklist", () => sprinkler.upsertChecklistItems({ inspectionId: 2, items: [] }), sprinklerDb.upsertSprinklerChecklistItems],
  ["sprinkler checklist update", () => sprinkler.updateChecklistItem({ id: 5, comment: "Changed" }), sprinklerDb.updateSprinklerChecklistItem],
  ["sprinkler devices", () => sprinkler.upsertDevices({ inspectionId: 2, devices: [] }), sprinklerDb.upsertSprinklerDevices],
  ["sprinkler device update", () => sprinkler.updateDevice({ id: 5, location: "Changed" }), sprinklerDb.updateSprinklerDevice],
  ["sprinkler device create", () => sprinkler.createDevice({ inspectionId: 2, deviceOrder: 1, location: "Lobby" }), sprinklerDb.createSprinklerDevice],
  ["sprinkler device delete", () => sprinkler.deleteDevice({ id: 5 }), sprinklerDb.deleteSprinklerDevice],
] as const;

describe("Legacy inspection writes serialize with the job seal", () => {
  it.each(writes)("%s keeps authorization, parent lock and write in one transaction", async (_name, action, write) => {
    vi.mocked(write).mockImplementation(async () => {
      expect(insideTransaction).toBe(true);
      expect(events[0]).toBe("lock:1");
      return undefined as any;
    });
    await action();
    expect(write).toHaveBeenCalledOnce();
    expect(db.withAudit).toHaveBeenCalledOnce();
    expect(events[0]).toBe("lock:1");
  });

  it.each(writes)("%s rejects when finalization commits after preauthorization", async (_name, action, write) => {
    vi.mocked(db.withAudit).mockImplementation(async (_ctx, _name, fn) => {
      // The initial company/ancestor reads saw a draft. A finalizer commits
      // before this transaction obtains its locking read.
      sealed = true;
      insideTransaction = true;
      try { return await fn(tx); } finally { insideTransaction = false; }
    });
    await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(write).not.toHaveBeenCalled();
    expect(events).toEqual(["lock:1"]);
  });

  it("locks every checklist batch parent in ID order before consistent reads", async () => {
    await checklist.bulkSaveResponses({ responses: [response, { ...response, jobId: 3 }, { ...response, jobId: 2 }] });
    expect(events).toEqual(["lock:1", "lock:2", "lock:3", "read:1", "read:2", "read:3"]);
    expect(db.bulkSaveChecklistResponses).toHaveBeenCalledOnce();
  });

  it("does not save any checklist response if a later batch job is sealed", async () => {
    vi.mocked(db.assertJobNotFinalized).mockImplementation(async id => {
      if (id === 2) throw new TRPCError({ code: "FORBIDDEN" });
    });
    await expect(checklist.bulkSaveResponses({ responses: [response, { ...response, jobId: 2 }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.bulkSaveChecklistResponses).not.toHaveBeenCalled();
  });

  it("locks every offline result parent before reading authorization or device data", async () => {
    await inspection.syncBatch({ results: [
      { jobId: 3, deviceId: 31, result: "pass", expectedDeviceRevision: "displayed-device-31" },
      { jobId: 1, deviceId: 11, result: "pass", expectedDeviceRevision: "displayed-device-11" },
    ] });
    expect(events).toEqual(["lock:1", "lock:3", "read:1", "read:3"]);
    expect(db.upsertInspectionResult).toHaveBeenCalledTimes(2);
  });

  it("denies a foreign sprinkler ancestor before opening a write transaction", async () => {
    vi.mocked(db.assertJobCompany).mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(sprinkler.updateDevice({ id: 5, location: "Foreign" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.withAudit).not.toHaveBeenCalled();
    expect(sprinklerDb.updateSprinklerDevice).not.toHaveBeenCalled();
  });

  it("rejects an inspection that changes parent before its job lock is obtained", async () => {
    vi.mocked(sprinklerDb.getSprinklerInspectionById)
      .mockResolvedValueOnce({ id: 2, jobId: 1 } as any)
      .mockResolvedValueOnce({ id: 2, jobId: 99 } as any);
    await expect(sprinkler.updateInspection({ id: 2, buildingId: "Changed" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sprinklerDb.updateSprinklerInspection).not.toHaveBeenCalled();
  });

  it("rejects a child that changes inspection before its job lock is obtained", async () => {
    vi.mocked(sprinklerDb.getSprinklerDeviceById)
      .mockResolvedValueOnce({ id: 5, inspectionId: 2 } as any)
      .mockResolvedValueOnce({ id: 5, inspectionId: 99 } as any);
    await expect(sprinkler.updateDevice({ id: 5, location: "Changed" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sprinklerDb.updateSprinklerDevice).not.toHaveBeenCalled();
  });
});
