import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { jobs, workOrders, type Job, type WorkOrder } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { jobRouter } from "./routers/jobRouter";
import { workOrderRouter } from "./routers/workOrderRouter";
import { populateJobFireAlarmChecklist } from "./fireAlarmRouter";
import { storagePut } from "./storage";
import { logActivity } from "./activityLogger";

vi.mock("./db", () => ({
  assertJobCompany: vi.fn(), assertJobNotFinalized: vi.fn(), withAudit: vi.fn(), getDb: vi.fn(),
  getJobById: vi.fn(), updateJob: vi.fn(), createJob: vi.fn(), deleteJobCascade: vi.fn(),
  getWorkOrderById: vi.fn(), updateWorkOrder: vi.fn(), createWorkOrder: vi.fn(),
  getUserById: vi.fn(), getJobTechnicians: vi.fn(), isUserAssignedToJob: vi.fn(),
  addJobAssignment: vi.fn(), removeJobAssignment: vi.fn(), clearJobAssignments: vi.fn(),
  getSiteById: vi.fn(), getCustomerOrgById: vi.fn(), getMonthlyTrackingByLinkedJobId: vi.fn(),
}));
vi.mock("./fireAlarmRouter", () => ({ populateJobFireAlarmChecklist: vi.fn() }));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));
vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));
vi.mock("./pushService", () => ({ sendPushToUser: vi.fn() }));
vi.mock("./emailService", () => ({ sendJobScheduledEmail: vi.fn() }));

const dialect = new MySqlDialect();
let job: Job;
let order: WorkOrder;
let assignments: number[];
let inside: boolean;
let sequence: string[];
let sealAtTransactionStart: boolean;
let failAssignment: number | undefined;
let tx: any;
function context(): TrpcContext {
  return { user: { id: 1, companyId: 10, role: "office" }, req: { headers: {} }, res: {} } as unknown as TrpcContext;
}
const caller = () => jobRouter.createCaller(context());
const woCaller = () => workOrderRouter.createCaller(context());

beforeEach(() => {
  vi.resetAllMocks();
  job = {
    id: 1, companyId: 10, siteId: 2, customerOrgId: 3, title: "Original job",
    status: "in_progress", finalizedAt: null, leadTechnicianId: 7, assignedTechnicianId: 7,
    techSignatureUrl: "https://example.test/signature.png", googleCalendarEventId: null,
  } as Job;
  order = { id: 20, jobId: 1, companyId: 10, siteId: 2, customerOrgId: 3, status: "in_progress", finalizedAt: null } as WorkOrder;
  assignments = [8];
  inside = false;
  sequence = [];
  sealAtTransactionStart = false;
  failAssignment = undefined;
  tx = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: any) => ({
      for: async (mode: string) => {
        expect(inside).toBe(true);
        expect(mode).toBe("update");
        const params = dialect.sqlToQuery(condition).params;
        if (table === jobs) {
          sequence.push("source job lock");
          return params[0] === job.id ? [structuredClone(job)] : [];
        }
        expect(table).toBe(workOrders);
        expect(sequence).toContain("job lock");
        sequence.push("work order lock");
        return params[0] === order.id || params[0] === order.jobId ? [structuredClone(order)] : [];
      },
    }) }) }),
  };
  vi.mocked(db.getDb).mockResolvedValue(tx);
  vi.mocked(db.assertJobCompany).mockImplementation(async id => {
    if (id !== job.id) throw new Error("unexpected job");
    return structuredClone(job);
  });
  vi.mocked(db.assertJobNotFinalized).mockImplementation(async (_id, connection) => {
    expect(inside).toBe(true);
    expect(connection).toBe(tx);
    sequence.push("job lock");
    if (job.finalizedAt) throw new TRPCError({ code: "FORBIDDEN", message: "JOB_FINALIZED_IMMUTABLE" });
  });
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _procedure, fn) => {
    expect(inside).toBe(false);
    if (sealAtTransactionStart) job.finalizedAt = new Date();
    const saved = structuredClone({ job, order, assignments });
    inside = true;
    sequence.push("begin");
    try {
      const result = await fn(tx);
      sequence.push("commit");
      return result;
    } catch (error) {
      ({ job, order, assignments } = saved);
      sequence.push("rollback");
      throw error;
    } finally { inside = false; }
  });
  vi.mocked(db.getJobById).mockImplementation(async () => structuredClone(job));
  vi.mocked(db.getWorkOrderById).mockImplementation(async () => structuredClone(order));
  vi.mocked(db.getUserById).mockImplementation(async id => ({ id, companyId: 10, role: "technician", isActive: 1, name: `Tech ${id}` }) as any);
  vi.mocked(db.getSiteById).mockResolvedValue({ id: 2, companyId: 10, customerOrgId: 3 } as any);
  vi.mocked(db.getCustomerOrgById).mockResolvedValue({ id: 3, companyId: 10 } as any);
  vi.mocked(db.updateJob).mockImplementation(async (_id, patch) => {
    expect(inside).toBe(true);
    sequence.push("job write"); Object.assign(job, patch);
  });
  vi.mocked(db.updateWorkOrder).mockImplementation(async (_id, patch) => {
    expect(inside).toBe(true);
    sequence.push("work order write"); Object.assign(order, patch);
  });
  vi.mocked(db.getJobTechnicians).mockImplementation(async () => ({
    lead: job.leadTechnicianId ? { id: job.leadTechnicianId } : null,
    additional: assignments.map(id => ({ id })),
  }) as any);
  vi.mocked(db.isUserAssignedToJob).mockImplementation(async (_job, id) => assignments.includes(id) || job.leadTechnicianId === id);
  vi.mocked(db.clearJobAssignments).mockImplementation(async () => {
    expect(inside).toBe(true); assignments = []; sequence.push("clear assignments");
  });
  vi.mocked(db.removeJobAssignment).mockImplementation(async (_job, id) => {
    expect(inside).toBe(true); assignments = assignments.filter(value => value !== id);
  });
  vi.mocked(db.addJobAssignment).mockImplementation(async value => {
    expect(inside).toBe(true);
    if (value.userId === failAssignment) throw new Error("assignment storage failed");
    if (value.role === "ASSIST") assignments.push(value.userId);
    return { ...value, id: value.userId };
  });
  vi.mocked(storagePut).mockResolvedValue({ key: "signature.png", url: "https://example.test/new-signature.png" });
  vi.mocked(logActivity).mockImplementation(async () => { expect(inside).toBe(false); expect(sequence).toContain("commit"); });
  vi.mocked(db.createJob).mockImplementation(async value => {
    expect(inside).toBe(true); sequence.push("clone job"); return { ...value, id: 99 };
  });
  vi.mocked(db.createWorkOrder).mockImplementation(async value => {
    expect(inside).toBe(true); sequence.push("clone work order"); return { ...value, id: 98 } as WorkOrder;
  });
  vi.mocked(populateJobFireAlarmChecklist).mockImplementation(async () => { expect(inside).toBe(true); sequence.push("clone checklist"); });
  vi.mocked(db.deleteJobCascade).mockImplementation(async () => { expect(inside).toBe(true); sequence.push("delete job"); });
});

const mutations = [
  ["edit", () => caller().update({ id: 1, notes: "changed" })],
  ["start", () => caller().start({ id: 1 })],
  ["complete", () => caller().complete({ id: 1 })],
  ["signature", () => caller().saveSignatures({ jobId: 1, techSignatureBase64: "aGVsbG8=" })],
  ["lead", () => caller().assignLeadTechnician({ jobId: 1, technicianId: 9 })],
  ["add technician", () => caller().addAdditionalTechnician({ jobId: 1, technicianId: 9 })],
  ["remove technician", () => caller().removeAdditionalTechnician({ jobId: 1, technicianId: 8 })],
  ["replace technicians", () => caller().setTechnicians({ jobId: 1, leadTechnicianId: 9, additionalTechnicianIds: [11] })],
  ["unassign", () => caller().unassignJob({ jobId: 1 })],
  ["customer decline", () => caller().recordCustomerDecline({ jobId: 1, reason: "No thanks" })],
  ["delete", () => caller().delete({ id: 1 })],
] as const;

describe("Job lifecycle source mutations", () => {
  it.each(mutations)("%s rechecks a seal committed after authorization", async (_name, mutate) => {
    sealAtTransactionStart = true;
    await expect(mutate()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateJob).not.toHaveBeenCalled();
    expect(db.updateWorkOrder).not.toHaveBeenCalled();
    expect(db.deleteJobCascade).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
    expect(storagePut).not.toHaveBeenCalled();
    expect(sequence).toEqual(["begin", "job lock", "rollback"]);
  });

  it("stores the actual uploaded signature keys with their metadata under the parent lock", async () => {
    vi.mocked(storagePut).mockImplementation(async () => {
      expect(inside).toBe(true);
      expect(sequence).toContain("job lock");
      const number = vi.mocked(storagePut).mock.calls.length;
      sequence.push("signature upload");
      return { key: `normalized/signature-${number}.png`, url: `https://example.test/signature-${number}.png` };
    });
    await caller().saveSignatures({ jobId: 1, techSignatureBase64: "aGVsbG8=", contactSignatureBase64: "Y29udGFjdA==", contactName: "On-site contact" });
    expect(job).toMatchObject({
      techSignatureKey: "normalized/signature-1.png", techSignatureUrl: "https://example.test/signature-1.png",
      contactSignatureKey: "normalized/signature-2.png", contactSignatureUrl: "https://example.test/signature-2.png",
      contactName: "On-site contact", techSignedAt: expect.any(Date), contactSignedAt: expect.any(Date),
    });
    expect(sequence).toEqual(["begin", "job lock", "signature upload", "signature upload", "job write", "commit"]);
  });

  it("keeps prior signature metadata when the second upload fails", async () => {
    const before = structuredClone(job);
    vi.mocked(storagePut).mockResolvedValueOnce({ key: "uploaded-tech.png", url: "https://example.test/tech.png" })
      .mockRejectedValueOnce(new Error("contact storage failed"));
    await expect(caller().saveSignatures({ jobId: 1, techSignatureBase64: "aGVsbG8=", contactSignatureBase64: "Y29udGFjdA==", contactName: "On-site contact" }))
      .rejects.toThrow("contact storage failed");
    expect(job).toEqual(before);
    expect(db.updateJob).not.toHaveBeenCalled();
    expect(sequence.at(-1)).toBe("rollback");
  });

  it("allows completion with a durable technician key even when no upload URL is stored", async () => {
    job.techSignatureUrl = null;
    job.techSignatureKey = "signatures/captured.png";
    await caller().complete({ id: 1 });
    expect(job.status).toBe("completed");
  });

  it("updates a job and its work order before commit, then emits activity", async () => {
    const date = new Date("2026-10-20T15:00:00Z");
    await caller().update({ id: 1, scheduledDate: date });
    expect(job.scheduledDate).toEqual(date);
    expect(order.scheduledDate).toEqual(date);
    expect(sequence).toEqual(["begin", "job lock", "job write", "work order lock", "work order write", "commit"]);
    expect(logActivity).toHaveBeenCalledOnce();
  });

  it("a finalized work order rolls back its corresponding job change", async () => {
    order.finalizedAt = new Date();
    await expect(caller().start({ id: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(job.status).toBe("in_progress");
    expect(job.startedAt).toBeUndefined();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("replacement assignment failure rolls back lead, removals, and earlier additions together", async () => {
    failAssignment = 12;
    await expect(caller().setTechnicians({ jobId: 1, leadTechnicianId: 9, additionalTechnicianIds: [11, 12] }))
      .rejects.toThrow("assignment storage failed");
    expect(job.leadTechnicianId).toBe(7);
    expect(assignments).toEqual([8]);
    expect(db.updateWorkOrder).not.toHaveBeenCalled();
  });

  it("promoting an assistant removes duplicate assignment and updates both lead fields", async () => {
    await caller().assignLeadTechnician({ jobId: 1, technicianId: 8 });
    expect(job).toMatchObject({ leadTechnicianId: 8, assignedTechnicianId: 8 });
    expect(assignments).toEqual([]);
    expect(order.assignedTechnicianIds).toEqual([8]);
  });

  it.each([
    () => caller().assignLeadTechnician({ jobId: 1, technicianId: 9 }),
    () => caller().addAdditionalTechnician({ jobId: 1, technicianId: 9 }),
    () => caller().setTechnicians({ jobId: 1, leadTechnicianId: 9, additionalTechnicianIds: [] }),
    () => caller().update({ id: 1, assignedTechnicianId: 9 }),
  ])("rejects a technician from another company before any mutation", async mutate => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 9, role: "technician", companyId: 99, isActive: 1 } as any);
    await expect(mutate()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateJob).not.toHaveBeenCalled();
    expect(db.clearJobAssignments).not.toHaveBeenCalled();
  });

  it("clones finalized source scope, work order and checklist in the same audited transaction", async () => {
    job.finalizedAt = new Date();
    job.status = "finalized";
    const result = await caller().clone({ jobId: 1 });
    expect(result.newJobId).toBe(99);
    expect(sequence).toEqual(["begin", "source job lock", "clone job", "clone work order", "clone checklist", "commit"]);
    expect(db.createJob).toHaveBeenCalledWith(expect.not.objectContaining({ finalizedAt: expect.anything() }));
  });

  it("clone checklist failure aborts the complete clone transaction", async () => {
    job.status = "completed";
    vi.mocked(populateJobFireAlarmChecklist).mockRejectedValue(new Error("snapshot storage failed"));
    await expect(caller().clone({ jobId: 1 })).rejects.toThrow("snapshot storage failed");
    expect(sequence.at(-1)).toBe("rollback");
    expect(sequence).not.toContain("commit");
  });
});

describe("Work order lifecycle boundaries", () => {
  it("customer accounts cannot read staff work order details through either lookup route", async () => {
    const customer = workOrderRouter.createCaller({
      ...context(), user: { ...context().user!, role: "customer", customerOrgId: 3 },
    } as TrpcContext);
    await expect(customer.get({ id: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(customer.listByJob({ jobId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.getWorkOrderById).not.toHaveBeenCalled();
  });
  const operations = [
    ["office edit", () => woCaller().update({ id: 20, title: "Changed" })],
    ["technician edit", () => woCaller().techUpdate({ id: 20, techNotes: "Changed" })],
    ["complete", () => woCaller().complete({ id: 20 })],
  ] as const;
  it.each(operations)("%s is serialized against job sealing", async (_name, mutate) => {
    sealAtTransactionStart = true;
    await expect(mutate()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateWorkOrder).not.toHaveBeenCalled();
  });
  it.each(operations)("%s rechecks the actual work order seal after its parent lock", async (_name, mutate) => {
    order.finalizedAt = new Date();
    await expect(mutate()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.updateWorkOrder).not.toHaveBeenCalled();
    expect(sequence).toEqual(["begin", "job lock", "work order lock", "rollback"]);
  });
  it("rejects work order links that do not match its real parent", async () => {
    order.siteId = 999;
    await expect(woCaller().update({ id: 20, title: "Changed" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.updateWorkOrder).not.toHaveBeenCalled();
  });
  it("completed work orders reject late technician content edits", async () => {
    order.status = "completed";
    await expect(woCaller().techUpdate({ id: 20, techNotes: "Changed" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.updateWorkOrder).not.toHaveBeenCalled();
  });
});
