import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { jobAssignments, jobs, workOrders, type Job, type JobAssignment, type WorkOrder } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { jobAssignmentRouter } from "./jobAssignmentRouter";

vi.mock("./db", () => ({
  getDb: vi.fn(), withAudit: vi.fn(), assertJobCompany: vi.fn(), assertJobNotFinalized: vi.fn(),
  getUserById: vi.fn(), updateWorkOrder: vi.fn(),
}));
const dialect = new MySqlDialect();
let parents: Job[], assignments: JobAssignment[], orders: WorkOrder[];
let sequence: string[], inside: boolean, failInsertJob: number | null, sealOnBegin: number | null;
let tx: any;
function caller() {
  return jobAssignmentRouter.createCaller({
    user: { id: 1, role: "office", companyId: 10 }, req: { headers: {} }, res: {},
  } as unknown as TrpcContext);
}

beforeEach(() => {
  vi.resetAllMocks();
  parents = [1, 2].map(id => ({ id, companyId: 10, siteId: 3, customerOrgId: 4, leadTechnicianId: 7, assignedTechnicianId: 7, finalizedAt: null }) as Job);
  assignments = [1, 2].flatMap(jobId => [
    { jobId, companyId: 10, userId: 7, role: "LEAD" }, { jobId, companyId: 10, userId: 8, role: "ASSIST" },
  ] as JobAssignment[]);
  orders = [1, 2].map(jobId => ({ id: jobId + 20, jobId, companyId: 10, siteId: 3, customerOrgId: 4, finalizedAt: null, assignedTechnicianIds: [7, 8] }) as WorkOrder);
  sequence = []; inside = false; failInsertJob = null; sealOnBegin = null;
  tx = {
    select: () => ({ from: (table: unknown) => ({ where: (condition: any) => {
      const id = dialect.sqlToQuery(condition).params[0];
      const rows = () => {
        expect(inside).toBe(true);
        if (table === jobAssignments) { sequence.push(`assignments read ${id}`); return structuredClone(assignments.filter(row => row.jobId === id)); }
        if (table === workOrders) return structuredClone(orders.filter(row => row.jobId === id));
        throw new Error("unexpected read");
      };
      return {
        for: async () => { sequence.push(`work order lock ${id}`); return rows(); },
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(rows()).then(resolve, reject),
      };
    } }) }),
    delete: (table: unknown) => ({ where: async (condition: any) => {
      expect(inside).toBe(true); expect(table).toBe(jobAssignments);
      const id = dialect.sqlToQuery(condition).params[0];
      sequence.push(`delete ${id}`); assignments = assignments.filter(row => row.jobId !== id);
    } }),
    insert: (table: unknown) => ({ values: async (values: JobAssignment[]) => {
      expect(inside).toBe(true); expect(table).toBe(jobAssignments);
      sequence.push(`insert ${values[0].jobId}`);
      if (values[0].jobId === failInsertJob) throw new Error("assignment database write failed");
      assignments.push(...structuredClone(values));
    } }),
    update: (table: unknown) => ({ set: (values: Partial<Job>) => ({ where: async (condition: any) => {
      expect(inside).toBe(true); expect(table).toBe(jobs);
      const id = dialect.sqlToQuery(condition).params[0];
      sequence.push(`job write ${id}`); Object.assign(parents.find(job => job.id === id)!, values);
    } }) }),
  };
  vi.mocked(db.getDb).mockResolvedValue(tx);
  vi.mocked(db.assertJobCompany).mockImplementation(async (id, companyId) => {
    const job = parents.find(parent => parent.id === id);
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
    return structuredClone(job);
  });
  vi.mocked(db.assertJobNotFinalized).mockImplementation(async (id, connection) => {
    expect(inside).toBe(true); expect(connection).toBe(tx); sequence.push(`job lock ${id}`);
    if (parents.find(job => job.id === id)?.finalizedAt) throw new TRPCError({ code: "FORBIDDEN", message: "JOB_FINALIZED_IMMUTABLE" });
  });
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _procedure, fn) => {
    if (sealOnBegin) parents.find(job => job.id === sealOnBegin)!.finalizedAt = new Date();
    const saved = structuredClone({ parents, assignments, orders });
    inside = true; sequence.push("begin");
    try { const result = await fn(tx); sequence.push("commit"); return result; }
    catch (error) { ({ parents, assignments, orders } = saved); sequence.push("rollback"); throw error; }
    finally { inside = false; }
  });
  vi.mocked(db.getUserById).mockImplementation(async id => ({ id, companyId: 10, role: "technician", isActive: 1 }) as any);
  vi.mocked(db.updateWorkOrder).mockImplementation(async (id, patch) => {
    expect(inside).toBe(true); sequence.push(`work order write ${id}`); Object.assign(orders.find(order => order.id === id)!, patch);
  });
});

const operations = [
  ["replace", () => caller().setJobAssignments({ jobId: 1, technicianIds: [9], leadId: 9 })],
  ["add", () => caller().addJobAssignments({ jobId: 1, technicianIds: [9] })],
  ["remove", () => caller().removeJobAssignment({ jobId: 1, technicianId: 8 })],
  ["bulk", () => caller().bulkAssignJobs({ jobIds: [2, 1], technicianIds: [9], leadId: 9 })],
  ["reassign", () => caller().reassignTechnician({ jobIds: [2, 1], fromTechId: 7, toTechId: 9 })],
] as const;

describe("Every assignment route uses the parent's immutable boundary", () => {
  it.each(operations)("%s rejects a seal committed after its initial authorization", async (_name, operation) => {
    sealOnBegin = 1;
    await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(sequence).not.toContain("delete 1");
    expect(assignments).toHaveLength(4);
  });

  it("empty replacement clears primary lead, legacy assigned user, assignments and WO mirror atomically", async () => {
    expect(await caller().setJobAssignments({ jobId: 1, technicianIds: [], leadId: 0 })).toEqual({ success: true, count: 0 });
    expect(parents[0]).toMatchObject({ leadTechnicianId: null, assignedTechnicianId: null, assignedAt: null, assignedByUserId: null });
    expect(assignments.filter(row => row.jobId === 1)).toEqual([]);
    expect(orders[0].assignedTechnicianIds).toEqual([]);
  });

  it("deduplicates a replacement and keeps exactly one real lead in every representation", async () => {
    expect(await caller().setJobAssignments({ jobId: 1, technicianIds: [8, 9, 9], leadId: 9 })).toEqual({ success: true, count: 2 });
    expect(parents[0]).toMatchObject({ leadTechnicianId: 9, assignedTechnicianId: 9 });
    expect(assignments.filter(row => row.jobId === 1)).toEqual([
      expect.objectContaining({ userId: 8, role: "ASSIST", companyId: 10 }),
      expect.objectContaining({ userId: 9, role: "LEAD", companyId: 10 }),
    ]);
    expect(orders[0].assignedTechnicianIds).toEqual([8, 9]);
  });

  it("adding an existing assistant as lead promotes it and demotes the previous lead", async () => {
    expect(await caller().addJobAssignments({ jobId: 1, technicianIds: [8], leadId: 8 })).toEqual({ success: true, added: 0, skipped: 1 });
    expect(assignments.filter(row => row.jobId === 1 && row.role === "LEAD").map(row => row.userId)).toEqual([8]);
    expect(parents[0].leadTechnicianId).toBe(8);
  });

  it("removing the lead requires an assigned replacement and updates headers plus mirror", async () => {
    await expect(caller().removeJobAssignment({ jobId: 1, technicianId: 7 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller().removeJobAssignment({ jobId: 1, technicianId: 7, newLeadId: 99 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await caller().removeJobAssignment({ jobId: 1, technicianId: 7, newLeadId: 8 });
    expect(parents[0]).toMatchObject({ leadTechnicianId: 8, assignedTechnicianId: 8 });
    expect(orders[0].assignedTechnicianIds).toEqual([8]);
  });

  it("validates the replacement lead and actual tenant before any deletion", async () => {
    vi.mocked(db.getUserById).mockResolvedValue({ id: 9, companyId: 99, role: "technician", isActive: 1 } as any);
    await expect(caller().setJobAssignments({ jobId: 1, technicianIds: [9], leadId: 9 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(sequence).not.toContain("delete 1");
    expect(assignments).toHaveLength(4);
  });
});

describe("Batch assignment replacement and reassignment commit as a whole", () => {
  it("locks all jobs in ascending order before reading any assignment snapshot", async () => {
    await caller().bulkAssignJobs({ jobIds: [2, 1, 2], technicianIds: [9], leadId: 9, mode: "replace" });
    expect(sequence.slice(0, 5)).toEqual(["begin", "job lock 1", "job lock 2", "assignments read 1", "assignments read 2"]);
    expect(parents.map(job => job.leadTechnicianId)).toEqual([9, 9]);
  });

  it("a second-job insert failure rolls back earlier assignments, primary fields and WO mirrors", async () => {
    failInsertJob = 2;
    await expect(caller().bulkAssignJobs({ jobIds: [1, 2], technicianIds: [9], leadId: 9, mode: "add" })).rejects.toThrow("assignment database write failed");
    expect(parents.map(job => job.leadTechnicianId)).toEqual([7, 7]);
    expect(assignments.map(row => [row.jobId, row.userId])).toEqual([[1, 7], [1, 8], [2, 7], [2, 8]]);
    expect(orders.map(order => order.assignedTechnicianIds)).toEqual([[7, 8], [7, 8]]);
    expect(sequence.at(-1)).toBe("rollback");
  });

  it("a missing selected job fails before any batch changes", async () => {
    await expect(caller().reassignTechnician({ jobIds: [1, 99], fromTechId: 7, toTechId: 9 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(sequence).toEqual([]); expect(assignments).toHaveLength(4);
  });

  it("a source technician absent on one selected job rejects the entire reassignment", async () => {
    assignments = assignments.filter(row => !(row.jobId === 2 && row.userId === 8));
    await expect(caller().reassignTechnician({ jobIds: [1, 2], fromTechId: 8, toTechId: 9 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(sequence).not.toContain("delete 1"); expect(parents[0].leadTechnicianId).toBe(7);
  });

  it("reassigns a lead to an existing assistant once and preserves every primary/mirror field", async () => {
    expect(await caller().reassignTechnician({ jobIds: [1, 2], fromTechId: 7, toTechId: 8 })).toEqual({ reassigned: 2 });
    expect(assignments.map(row => [row.jobId, row.userId, row.role])).toEqual([[1, 8, "LEAD"], [2, 8, "LEAD"]]);
    expect(parents.map(job => job.assignedTechnicianId)).toEqual([8, 8]);
    expect(orders.map(order => order.assignedTechnicianIds)).toEqual([[8], [8]]);
  });
});
