import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import {
  jobs,
  workOrders,
  approvedWork,
  monthlyServiceTracking,
  users,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { deviceRouter, smokeAlarmRouter } from "./routers/deviceRouters";
import { technicianRouter } from "./routers/technicianRouter";
import { schedulingAutomationRouter } from "./routers/schedulingAutomationRouter";

vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));
vi.mock("./canonicalFireAlarmReport", () => ({
  getCanonicalFireAlarmChecklist: vi.fn(),
}));
vi.mock("./db", () => ({
  withAudit: vi.fn(),
  getDb: vi.fn(),
  assertJobCompany: vi.fn(),
  assertJobNotFinalized: vi.fn(),
  getJobById: vi.fn(),
  getSiteById: vi.fn(),
  getDeviceById: vi.fn(),
  getCustomerOrgById: vi.fn(),
  createDevice: vi.fn(),
  updateDevice: vi.fn(),
  upsertInspectionResult: vi.fn(),
  updateSmokeAlarmTestResult: vi.fn(),
  assertDeviceCaptureRevision: vi.fn(),
  refreshJobDeviceEvidence: vi.fn(),
  getReportsByJob: vi.fn(),
  createReport: vi.fn(),
  updateReport: vi.fn(),
  hasUndismissedNotification: vi.fn(),
  createNotification: vi.fn(),
  updateJob: vi.fn(),
  updateWorkOrder: vi.fn(),
  clearJobAssignments: vi.fn(),
  addJobAssignment: vi.fn(),
  getWorkOrderById: vi.fn(),
  getApprovedWorkById: vi.fn(),
  getQuoteById: vi.fn(),
  getDeficiencyById: vi.fn(),
}));

const ctx = {
  user: { id: 7, companyId: 1, role: "office" },
  req: { headers: {} },
  res: {},
} as unknown as TrpcContext;
const devices = deviceRouter.createCaller(ctx);
const smoke = smokeAlarmRouter.createCaller(ctx);
const technician = technicianRouter.createCaller(ctx);
const scheduling = schedulingAutomationRouter.createCaller(ctx);
let job: any;
let order: any;
let approved: any;
let tracking: any;
let device: any;
let reports: any[];
let notifications: any[];
let inspectionRows: any[];
let assignments: number[];
let inside: boolean;
let sealed: boolean;
let events: string[];
let afterBegin: (() => void) | undefined;
const directWrite = vi.fn();
const transaction = {
  select: () => ({
    from: (table: unknown) => {
      const rows = () =>
        table === jobs
          ? [job]
          : table === workOrders
            ? [order]
            : table === approvedWork
              ? [approved]
              : table === monthlyServiceTracking
                ? [tracking]
                : table === users
                  ? [
                      { id: 8, companyId: 1, role: "technician", isActive: 1 },
                      { id: 9, companyId: 1, role: "technician", isActive: 1 },
                    ]
                  : [];
      const query = {
        where: () => query,
        limit: async () => rows(),
        for: async () => {
          events.push(table === jobs ? "rowlock:job" : "rowlock:child");
          return rows();
        },
      };
      return query;
    },
  }),
  update: () => ({
    set: (data: unknown) => ({ where: () => directWrite(data) }),
  }),
} as unknown as Parameters<Parameters<typeof db.withAudit>[2]>[0];

beforeEach(() => {
  vi.resetAllMocks();
  job = {
    id: 1,
    companyId: 1,
    siteId: 10,
    customerOrgId: 100,
    finalizedAt: null,
    status: "in_progress",
    jobType: "service_call",
    title: "Fixture",
    jobNumber: "J-1",
    scheduledDate: null,
  };
  order = {
    id: 50,
    companyId: 1,
    siteId: 10,
    customerOrgId: 100,
    jobId: 1,
    finalizedAt: null,
    status: "pending",
    scheduledDate: null,
  };
  approved = {
    id: 60,
    companyId: 1,
    siteId: 10,
    customerOrgId: 100,
    jobId: 1,
    quoteId: null,
    workOrderId: null,
    deficiencyId: null,
    quoteItemId: null,
    status: "approved",
    scheduledDate: null,
  };
  tracking = {
    id: 70,
    companyId: 1,
    siteId: 10,
    customerOrgId: 100,
    linkedJobId: 1,
    status: "not_scheduled",
    scheduledDate: null,
  };
  device = { id: 8, companyId: 1, siteId: 10, category: "SMOKE_ALARM" };
  reports = [];
  notifications = [];
  inspectionRows = [];
  assignments = [];
  inside = false;
  sealed = false;
  events = [];
  afterBegin = undefined;
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _name, write) => {
    const priorJob = { ...job };
    const priorReports = reports.map(row => ({ ...row }));
    const priorNotifications = notifications.map(row => ({ ...row }));
    const priorInspections = inspectionRows.map(row => ({ ...row }));
    const priorAssignments = [...assignments];
    inside = true;
    afterBegin?.();
    try {
      return await write(transaction);
    } catch (error) {
      job = priorJob;
      reports = priorReports;
      notifications = priorNotifications;
      inspectionRows = priorInspections;
      assignments = priorAssignments;
      throw error;
    } finally {
      inside = false;
    }
  });
  vi.mocked(db.getDb).mockResolvedValue(transaction as any);
  vi.mocked(db.assertJobCompany).mockImplementation(async (id, companyId) => {
    if (id !== job.id) throw new TRPCError({ code: "NOT_FOUND" });
    if (companyId !== job.companyId) throw new TRPCError({ code: "FORBIDDEN" });
    if (inside) events.push("read:job");
    return job;
  });
  vi.mocked(db.assertJobNotFinalized).mockImplementation(async (_id, tx) => {
    expect(inside).toBe(true);
    expect(tx).toBe(transaction);
    events.push("seal-lock");
    if (sealed) throw new TRPCError({ code: "FORBIDDEN" });
  });
  vi.mocked(db.getJobById).mockImplementation(async () => job);
  vi.mocked(db.getSiteById).mockImplementation(
    async id => ({ id, companyId: 1, customerOrgId: 100 }) as any
  );
  vi.mocked(db.getCustomerOrgById).mockResolvedValue({
    id: 100,
    companyId: 1,
  } as any);
  vi.mocked(db.getDeviceById).mockImplementation(async () => device);
  vi.mocked(db.createDevice).mockImplementation(async data => {
    expect(inside).toBe(true);
    return { id: 9, ...data };
  });
  vi.mocked(db.updateDevice).mockImplementation(async () => {
    expect(inside).toBe(true);
  });
  vi.mocked(db.assertDeviceCaptureRevision).mockImplementation(
    async (_jobId, _deviceId, revision) => {
      expect(inside).toBe(true);
      if (device.siteId !== job.siteId || device.companyId !== job.companyId)
        throw new TRPCError({ code: "FORBIDDEN" });
      if (!revision) throw new TRPCError({ code: "CONFLICT" });
      return device;
    }
  );
  vi.mocked(db.refreshJobDeviceEvidence).mockResolvedValue("updated-device");
  vi.mocked(db.upsertInspectionResult).mockImplementation(async data => {
    expect(inside).toBe(true);
    inspectionRows.push(data);
    return { id: 2, ...data } as any;
  });
  vi.mocked(db.updateSmokeAlarmTestResult).mockImplementation(async () => {
    expect(inside).toBe(true);
  });
  vi.mocked(db.getReportsByJob).mockImplementation(async () => reports);
  vi.mocked(db.createReport).mockImplementation(async data => {
    expect(inside).toBe(true);
    const row = { id: 2, ...data };
    reports.push(row);
    return row;
  });
  vi.mocked(db.hasUndismissedNotification).mockImplementation(
    async () => notifications.length > 0
  );
  vi.mocked(db.createNotification).mockImplementation(async data => {
    expect(inside).toBe(true);
    notifications.push(data);
    return { id: 3, ...data };
  });
  vi.mocked(db.updateJob).mockImplementation(async (_id, patch) => {
    expect(inside).toBe(true);
    Object.assign(job, patch);
  });
  vi.mocked(db.updateWorkOrder).mockImplementation(async (_id, patch) => {
    expect(inside).toBe(true);
    Object.assign(order, patch);
  });
  vi.mocked(db.clearJobAssignments).mockImplementation(async () => {
    expect(inside).toBe(true);
    assignments = [];
  });
  vi.mocked(db.addJobAssignment).mockImplementation(async data => {
    expect(inside).toBe(true);
    assignments.push(data.userId);
    return { id: data.userId, ...data };
  });
  vi.mocked(db.getWorkOrderById).mockImplementation(async () => order);
  vi.mocked(db.getApprovedWorkById).mockImplementation(async () => approved);
  directWrite.mockImplementation(async () => {
    expect(inside).toBe(true);
  });
});

describe("Remaining field and submission writes hold the job seal", () => {
  it.each([
    [
      "inspection device fields",
      () =>
        devices.technicianUpdate({
          expectedDeviceRevision: "displayed-device",
          jobId: 1,
          id: 8,
          location: "changed",
        }),
      db.updateDevice,
    ],
    [
      "inspection smoke creation",
      () =>
        smoke.create({
          jobId: 1,
          companyId: 1,
          siteId: 10,
          suiteNumber: "101",
        }),
      db.createDevice,
    ],
    [
      "inspection smoke edit",
      () => smoke.update({ jobId: 1, id: 8, location: "changed" }),
      db.updateDevice,
    ],
    [
      "inspection device creation",
      () =>
        devices.addDuringInspection({
          jobId: 1,
          siteId: 10,
          companyId: 999,
          category: "SMOKE_ALARM",
          deviceType: "Alarm",
        }),
      db.createDevice,
    ],
    [
      "inspection device removal",
      () => devices.softDelete({ jobId: 1, deviceId: 8 }),
      db.updateDevice,
    ],
    [
      "smoke alarm test",
      () =>
        smoke.recordTest({
          expectedDeviceRevision: "displayed-device",
          jobId: 1,
          id: 8,
          testResult: "pass",
        }),
      db.upsertInspectionResult,
    ],
    [
      "QA submission",
      () => technician.submitForQA({ jobId: 1 }),
      db.createReport,
    ],
    [
      "job scheduling",
      () =>
        scheduling.applySchedule({
          itemType: "job",
          itemId: 1,
          scheduledDate: new Date(),
        }),
      db.updateJob,
    ],
  ] as const)(
    "%s rejects a seal that commits after preauthorization",
    async (_name, action, write) => {
      afterBegin = () => {
        sealed = true;
        job.finalizedAt = new Date();
      };
      await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(write).not.toHaveBeenCalled();
      expect(events).toEqual(["seal-lock"]);
    }
  );

  it("does not let a mutable job add or remove a device on another site", async () => {
    await expect(
      devices.addDuringInspection({
        jobId: 1,
        siteId: 20,
        companyId: 1,
        category: "SMOKE_ALARM",
        deviceType: "Alarm",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    device.siteId = 20;
    await expect(
      devices.softDelete({ jobId: 1, deviceId: 8 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.createDevice).not.toHaveBeenCalled();
    expect(db.updateDevice).not.toHaveBeenCalled();
  });

  it("requires the smoke test's captured job and its actual smoke device", async () => {
    await expect(
      smoke.recordTest({
        expectedDeviceRevision: "displayed-device",
        id: 8,
        testResult: "pass",
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    device.siteId = 20;
    await expect(
      smoke.recordTest({
        expectedDeviceRevision: "displayed-device",
        jobId: 1,
        id: 8,
        testResult: "pass",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    device.siteId = 10;
    device.category = "FIRE_ALARM_DEVICE";
    await expect(
      smoke.recordTest({
        expectedDeviceRevision: "displayed-device",
        jobId: 1,
        id: 8,
        testResult: "pass",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateSmokeAlarmTestResult).not.toHaveBeenCalled();
  });

  it("does not let field technicians omit the job on device or smoke metadata writes", async () => {
    const techCtx = {
      ...ctx,
      user: { ...ctx.user!, role: "technician" },
    } as TrpcContext;
    const technicianDevices = deviceRouter.createCaller(techCtx);
    const technicianSmoke = smokeAlarmRouter.createCaller(techCtx);
    await expect(
      technicianDevices.technicianUpdate({
        expectedDeviceRevision: "displayed-device",
        id: 8,
        location: "changed",
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      technicianSmoke.create({ companyId: 1, siteId: 10, suiteNumber: "101" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      technicianSmoke.update({ id: 8, location: "changed" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.createDevice).not.toHaveBeenCalled();
    expect(db.updateDevice).not.toHaveBeenCalled();
  });

  it("retains authorized office master-data maintenance without a job", async () => {
    await smoke.create({ companyId: 1, siteId: 10, suiteNumber: "101" });
    await smoke.update({ id: 8, location: "changed" });
    expect(db.createDevice).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        siteId: 10,
        category: "SMOKE_ALARM",
      })
    );
    expect(db.updateDevice).toHaveBeenCalledWith(
      8,
      expect.objectContaining({ location: "changed" })
    );
  });

  it("stores job-specific smoke evidence and preserves no-access as untested", async () => {
    await smoke.recordTest({
      expectedDeviceRevision: "displayed-device",
      jobId: 1,
      id: 8,
      testResult: "no_access",
      notes: "Tenant away",
    });
    expect(db.upsertInspectionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 1,
        deviceId: 8,
        result: "not_tested",
        notes: "No access — Tenant away",
        technicianId: 7,
        carriedForward: 0,
      })
    );
    expect(events[0]).toBe("seal-lock");
  });

  it("keeps the per-job smoke result and latest device update in one rollback boundary", async () => {
    vi.mocked(db.updateSmokeAlarmTestResult).mockRejectedValueOnce(
      new Error("write failed")
    );
    await expect(
      smoke.recordTest({
        expectedDeviceRevision: "displayed-device",
        jobId: 1,
        id: 8,
        testResult: "pass",
      })
    ).rejects.toThrow("write failed");
    expect(inspectionRows).toEqual([]);
    expect(db.withAudit).toHaveBeenCalledOnce();
  });

  it("repeated QA submission reuses its report and notification", async () => {
    const first = await technician.submitForQA({ jobId: 1 });
    expect(await technician.submitForQA({ jobId: 1 })).toEqual(first);
    expect(db.createReport).toHaveBeenCalledOnce();
    expect(db.createNotification).toHaveBeenCalledOnce();
  });

  it("does not commit a partial QA report if notification persistence fails", async () => {
    vi.mocked(db.createNotification).mockRejectedValueOnce(
      new Error("notification failed")
    );
    await expect(technician.submitForQA({ jobId: 1 })).rejects.toThrow(
      "notification failed"
    );
    expect(reports).toEqual([]);
    expect(notifications).toEqual([]);
  });
});

describe("Scheduling mutations use the same execution parent locks", () => {
  it("keeps job, lead/additional assignments and work order schedule consistent", async () => {
    const date = new Date("2026-10-21T18:00:00Z");
    await scheduling.applySchedule({
      itemType: "job",
      itemId: 1,
      scheduledDate: date,
      technicianIds: [8, 9],
    });
    expect(job).toMatchObject({
      scheduledDate: date,
      status: "scheduled",
      leadTechnicianId: 8,
      assignedTechnicianId: 8,
      assignedByUserId: 7,
    });
    expect(assignments).toEqual([8, 9]);
    expect(order).toMatchObject({
      scheduledDate: date,
      status: "scheduled",
      assignedTechnicianIds: [8, 9],
    });
    expect(events[0]).toBe("seal-lock");
  });

  it("rolls back scheduling when a linked work order is finalized", async () => {
    order.finalizedAt = new Date();
    await expect(
      scheduling.applySchedule({
        itemType: "job",
        itemId: 1,
        scheduledDate: new Date(),
        technicianIds: [8, 9],
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(job.scheduledDate).toBe(null);
    expect(assignments).toEqual([]);
  });

  it("work-order scheduling rejects the sealed parent or finalized source", async () => {
    sealed = true;
    await expect(
      scheduling.applySchedule({
        itemType: "work_order",
        itemId: 50,
        scheduledDate: new Date(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    sealed = false;
    order.finalizedAt = new Date();
    await expect(
      scheduling.applySchedule({
        itemType: "work_order",
        itemId: 50,
        scheduledDate: new Date(),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.updateJob).not.toHaveBeenCalled();
  });

  it("approved-work scheduling checks the finalization of its execution parent", async () => {
    job.finalizedAt = new Date();
    await expect(
      scheduling.applySchedule({
        itemType: "approved_work",
        itemId: 60,
        scheduledDate: new Date(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(directWrite).not.toHaveBeenCalled();
    expect(events[0]).toBe("rowlock:job");
  });

  it("service tracking cannot reschedule a sealed or contradictory linked job", async () => {
    sealed = true;
    await expect(
      scheduling.applySchedule({
        itemType: "service_tracking",
        itemId: 70,
        scheduledDate: new Date(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    sealed = false;
    tracking.siteId = 99;
    await expect(
      scheduling.applySchedule({
        itemType: "service_tracking",
        itemId: 70,
        scheduledDate: new Date(),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(directWrite).not.toHaveBeenCalled();
  });

  it("standalone service tracking is locked and updated in one audited transaction", async () => {
    tracking.linkedJobId = null;
    await scheduling.applySchedule({
      itemType: "service_tracking",
      itemId: 70,
      scheduledDate: new Date(),
    });
    expect(db.withAudit).toHaveBeenCalledOnce();
    expect(events[0]).toBe("rowlock:child");
    expect(directWrite).toHaveBeenCalledOnce();
  });
});
