import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Device } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { deficiencyRouter, repairRouter } from "./routers/deficiencyRouter";
import {
  assertDeviceRevision,
  buildCapturedDeviceSnapshot,
  getDeviceRevision,
} from "./canonicalDeviceEvidence";
import { callerIsPlatformOperator } from "./_core/actorContext";

vi.mock("./db", () => ({
  withAudit: vi.fn(),
  assertJobNotFinalized: vi.fn(),
  assertJobCompany: vi.fn(),
  getJobById: vi.fn(),
  getSiteById: vi.fn(),
  getCustomerOrgById: vi.fn(),
  getDeviceById: vi.fn(),
  getDeficiencyById: vi.fn(),
  getDeficiencyByIdempotencyKey: vi.fn(),
  getInspectionResultById: vi.fn(),
  createDeficiency: vi.fn(),
  updateDeficiency: vi.fn(),
  captureDeviceSnapshotForJob: vi.fn(),
  getRepairById: vi.fn(),
  createRepair: vi.fn(),
  updateRepair: vi.fn(),
  getAttachmentsByEntity: vi.fn(),
  getRepairsByDeficiency: vi.fn(),
}));
const ctx = {
  user: { id: 7, companyId: 10, role: "office" },
  req: { headers: {} },
  res: {},
} as unknown as TrpcContext;
const office = deficiencyRouter.createCaller(ctx);
const repair = repairRouter.createCaller(ctx);
const portal = deficiencyRouter.createCaller({
  ...ctx,
  user: {
    ...ctx.user!,
    id: 8,
    role: "customer",
    companyId: null,
    customerOrgId: 100,
  },
} as TrpcContext);
const jobs = [
  { id: 1, companyId: 10, siteId: 20, customerOrgId: 100 },
  { id: 2, companyId: 10, siteId: 21, customerOrgId: 100 },
];
let deviceRows: Device[];
let deficiency: any;
let repairRow: any;
let inside: boolean;
let sealed: boolean;
let events: string[];
let afterLock: (() => void) | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  deviceRows = [
    {
      id: 30,
      companyId: 10,
      siteId: 20,
      category: "FIRE_ALARM_DEVICE",
      deviceType: "Smoke detector",
      location: "Recorded lobby",
      isActive: true,
    },
    {
      id: 31,
      companyId: 10,
      siteId: 21,
      category: "FIRE_ALARM_DEVICE",
      deviceType: "Other site's detector",
      location: "Other site",
      isActive: true,
    },
  ] as Device[];
  deficiency = {
    id: 50,
    jobId: 1,
    deviceId: 30,
    reportedById: 7,
    status: "resolved",
    customerSignedOffAt: null,
    deviceSnapshot: buildCapturedDeviceSnapshot(deviceRows[0], jobs[0], 7),
  };
  repairRow = { id: 60, deficiencyId: 50 };
  inside = false;
  sealed = false;
  events = [];
  afterLock = undefined;
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _name, write) => {
    inside = true;
    try {
      return await write({} as any);
    } finally {
      inside = false;
    }
  });
  vi.mocked(db.assertJobNotFinalized).mockImplementation(async () => {
    events.push("seal-lock");
    if (sealed) throw new TRPCError({ code: "FORBIDDEN" });
    afterLock?.();
  });
  vi.mocked(db.getJobById).mockImplementation(
    async id => jobs.find(job => job.id === id) as any
  );
  vi.mocked(db.assertJobCompany).mockImplementation(async (id, companyId) => {
    const job = jobs.find(job => job.id === id);
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (job.companyId !== companyId && !callerIsPlatformOperator())
      throw new TRPCError({ code: "FORBIDDEN" });
    return job as any;
  });
  vi.mocked(db.getSiteById).mockImplementation(
    async id => ({ id, companyId: 10, customerOrgId: 100 }) as any
  );
  vi.mocked(db.getCustomerOrgById).mockResolvedValue({
    id: 100,
    companyId: 10,
  } as any);
  vi.mocked(db.getDeviceById).mockImplementation(async id =>
    deviceRows.find(row => row.id === id)
  );
  vi.mocked(db.getDeficiencyById).mockImplementation(async () => {
    if (inside) events.push("read-deficiency");
    return deficiency;
  });
  vi.mocked(db.getDeficiencyByIdempotencyKey).mockImplementation(
    async (_key, jobId) => {
      if (inside) events.push("idempotency");
      return deficiency.idempotencyKey && deficiency.jobId === jobId
        ? deficiency
        : undefined;
    }
  );
  vi.mocked(db.getInspectionResultById).mockImplementation(
    async id =>
      ({
        id,
        jobId: id === 41 ? 2 : 1,
        deviceId: id === 41 ? 31 : 30,
        companyId: 10,
      }) as any
  );
  vi.mocked(db.captureDeviceSnapshotForJob).mockImplementation(
    async (jobId, deviceId, actorId, revision) => {
      expect(inside).toBe(true);
      const device = deviceRows.find(row => row.id === deviceId)!;
      assertDeviceRevision(device, revision);
      return buildCapturedDeviceSnapshot(
        device,
        jobs.find(job => job.id === jobId)!,
        actorId
      );
    }
  );
  vi.mocked(db.createDeficiency).mockImplementation(async data => {
    expect(inside).toBe(true);
    return { id: 51, ...data };
  });
  vi.mocked(db.updateDeficiency).mockImplementation(async () => {
    expect(inside).toBe(true);
  });
  vi.mocked(db.getRepairById).mockImplementation(async () => repairRow);
  vi.mocked(db.createRepair).mockImplementation(async data => {
    expect(inside).toBe(true);
    return { id: 61, ...data };
  });
  vi.mocked(db.updateRepair).mockImplementation(async () => {
    expect(inside).toBe(true);
  });
  vi.mocked(db.getAttachmentsByEntity).mockResolvedValue([]);
  vi.mocked(db.getRepairsByDeficiency).mockResolvedValue([]);
});

describe("Deficiency evidence uses actual job/device ancestry", () => {
  it("captures only the device definition displayed when the deficiency was recorded", async () => {
    const created = await office.create({
      jobId: 1,
      deviceId: 30,
      title: "Failure",
      expectedDeviceRevision: getDeviceRevision(deviceRows[0]),
    });
    expect(created).toMatchObject({
      deviceId: 30,
      deviceSnapshot: {
        location: "Recorded lobby",
        jobId: 1,
        companyId: 10,
        siteId: 20,
        capturedById: 7,
      },
    });
    expect(events[0]).toBe("seal-lock");
  });

  it("does not capture today's metadata for stale or revisionless queued work", async () => {
    const old = getDeviceRevision(deviceRows[0]);
    deviceRows[0].location = "Changed while offline";
    for (const revision of [old, undefined])
      await expect(
        office.create({
          jobId: 1,
          deviceId: 30,
          title: "Failure",
          expectedDeviceRevision: revision,
        })
      ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.createDeficiency).not.toHaveBeenCalled();
  });

  it("rejects an unrelated same-company device and a foreign inspection result", async () => {
    await expect(
      office.create({
        jobId: 1,
        deviceId: 31,
        title: "Failure",
        expectedDeviceRevision: getDeviceRevision(deviceRows[1]),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      office.create({
        jobId: 1,
        inspectionResultId: 41,
        title: "Failure",
        expectedDeviceRevision: getDeviceRevision(deviceRows[1]),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.createDeficiency).not.toHaveBeenCalled();
  });

  it("derives the device from a scoped inspection result instead of losing its identity", async () => {
    const result = await office.create({
      jobId: 1,
      inspectionResultId: 40,
      title: "Failure",
      expectedDeviceRevision: getDeviceRevision(deviceRows[0]),
    });
    expect(result).toMatchObject({
      deviceId: 30,
      deviceSnapshot: { deviceId: 30 },
    });
  });

  it("allows device-less system observations without fabricating equipment metadata", async () => {
    expect(
      await office.create({ jobId: 1, title: "System concern" })
    ).toMatchObject({ deviceSnapshot: null });
  });

  it("replays an already persisted deficiency after seal without reinterpreting current metadata", async () => {
    deficiency.idempotencyKey = "saved-offline";
    sealed = true;
    expect(
      await office.create({
        jobId: 1,
        title: "Failure",
        idempotencyKey: "saved-offline",
      })
    ).toBe(deficiency);
    expect(db.withAudit).not.toHaveBeenCalled();
    expect(db.createDeficiency).not.toHaveBeenCalled();
  });

  it("does not disclose capture actor metadata in the customer's deficiency projection", async () => {
    const result = await portal.get({ id: 50 });
    expect(result?.deficiency).not.toHaveProperty("deviceSnapshot");
  });
});

describe("Deficiency, portal and repair writes cannot escape the seal", () => {
  it.each([
    [
      "create",
      () => office.create({ jobId: 1, title: "Failure" }),
      db.createDeficiency,
    ],
    [
      "update",
      () => office.update({ id: 50, description: "Changed" }),
      db.updateDeficiency,
    ],
    [
      "portal signoff",
      () => portal.signOffFromPortal({ deficiencyId: 50 }),
      db.updateDeficiency,
    ],
    [
      "repair create",
      () => repair.create({ deficiencyId: 50 }),
      db.createRepair,
    ],
    [
      "repair update",
      () => repair.update({ id: 60, status: "completed" }),
      db.updateRepair,
    ],
  ] as const)(
    "%s holds the parent lock before any write",
    async (_name, action, write) => {
      sealed = true;
      await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(write).not.toHaveBeenCalled();
      expect(events).toEqual(["seal-lock"]);
    }
  );

  it("allows an authorized customer without companyId to sign off only while the job is open", async () => {
    await portal.signOffFromPortal({ deficiencyId: 50 });
    expect(db.updateDeficiency).toHaveBeenCalledWith(
      50,
      expect.objectContaining({
        status: "closed",
        customerSignedOffAt: expect.any(Date),
      })
    );
  });

  it("rechecks a changed deficiency or repair parent after locking", async () => {
    afterLock = () => {
      deficiency = { ...deficiency, jobId: 2 };
    };
    await expect(
      office.update({ id: 50, description: "Changed" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    deficiency.jobId = 1;
    afterLock = () => {
      repairRow = { ...repairRow, deficiencyId: 99 };
    };
    await expect(
      repair.update({ id: 60, status: "completed" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.updateDeficiency).not.toHaveBeenCalled();
    expect(db.updateRepair).not.toHaveBeenCalled();
  });
});
