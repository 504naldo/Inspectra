import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { jobAssignments, jobs, type Job } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import type { Db } from "./db/client";
import * as db from "./db";
import { assertJobTechnician, syncLinkedWorkOrders } from "./jobLifecycleSync";

/** Every parent is locked before any consistent read or write in a batch. */
export async function withMutableAssignmentJobs<T>(
  ctx: TrpcContext,
  procedure: string,
  ids: number[],
  write: (parents: Job[], tx: Db) => Promise<T>,
): Promise<T> {
  const sorted = Array.from(new Set(ids)).sort((a, b) => a - b);
  if (!sorted.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Select at least one job." });
  for (const id of sorted) await db.assertJobCompany(id, ctx.user!.companyId!);
  return db.withAudit(ctx, procedure, async tx => {
    for (const id of sorted) await db.assertJobNotFinalized(id, tx);
    const parents: Job[] = [];
    for (const id of sorted) parents.push(await db.assertJobCompany(id, ctx.user!.companyId!));
    if (new Set(parents.map(job => job.companyId)).size !== 1) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "All selected jobs must belong to the same company." });
    }
    return write(parents, tx);
  });
}

export async function readJobAssignments(job: Job, tx: Db) {
  const rows = await tx.select().from(jobAssignments).where(eq(jobAssignments.jobId, job.id));
  const legacyLeads = rows.filter(row => row.role === "LEAD").map(row => row.userId);
  if (!job.leadTechnicianId && !job.assignedTechnicianId && legacyLeads.length > 1) {
    throw new TRPCError({ code: "CONFLICT", message: "This job has conflicting lead assignments. Reconcile them before continuing." });
  }
  const leadId = job.leadTechnicianId ?? job.assignedTechnicianId ?? legacyLeads[0] ?? null;
  return { ids: Array.from(new Set([...rows.map(row => row.userId), ...(leadId ? [leadId] : [])])), leadId };
}

export async function replaceJobAssignments(ctx: TrpcContext, job: Job, tx: Db, ids: number[], leadId: number | null) {
  const assigned = Array.from(new Set(ids));
  if (assigned.length && (!leadId || !assigned.includes(leadId))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "An assigned active technician must be selected as lead." });
  }
  for (const id of assigned) await assertJobTechnician(job, id);
  await tx.delete(jobAssignments).where(eq(jobAssignments.jobId, job.id));
  if (assigned.length) await tx.insert(jobAssignments).values(assigned.map(userId => ({
    jobId: job.id, companyId: job.companyId, userId,
    role: userId === leadId ? "LEAD" as const : "ASSIST" as const,
    assignedByUserId: ctx.user!.id,
  })));
  await tx.update(jobs).set({
    leadTechnicianId: assigned.length ? leadId : null,
    assignedTechnicianId: assigned.length ? leadId : null,
    assignedAt: assigned.length ? new Date() : null,
    assignedByUserId: assigned.length ? ctx.user!.id : null,
  }).where(eq(jobs.id, job.id));
  await syncLinkedWorkOrders(job, { assignedTechnicianIds: assigned });
}
