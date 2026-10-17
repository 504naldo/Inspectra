import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { approvedWork, jobs, quotes, repairQuoteItems, workOrders, type ApprovedWork, type InsertApprovedWork } from "../drizzle/schema";
import { callerIsPlatformOperator } from "./_core/actorContext";
import type { TrpcContext } from "./_core/context";
import type { Db } from "./db/client";
import * as db from "./db";
import { assertInvoiceLinks, getRepairQuoteProvenanceJobId } from "./invoiceLinks";

type Links = Pick<InsertApprovedWork, "jobId" | "quoteId" | "quoteItemId" | "workOrderId" | "deficiencyId" | "siteId" | "customerOrgId"> & {
  assignedTechnicianIds?: number[] | null;
};

export async function getApprovedWorkForCompany(id: number, companyId: number): Promise<ApprovedWork> {
  const record = await db.getApprovedWorkById(id);
  if (!record) throw new TRPCError({ code: "NOT_FOUND" });
  if (record.companyId !== companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });
  return record;
}

async function discoverJobIds(links: Links): Promise<number[]> {
  const ids = new Set<number>();
  if (links.jobId != null) ids.add(links.jobId);
  for (const [id, load] of [
    [links.quoteId, db.getQuoteById], [links.workOrderId, db.getWorkOrderById], [links.deficiencyId, db.getDeficiencyById],
  ] as const) {
    if (id != null) {
      const parent = await load(id);
      if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Approved work parent not found" });
      if (parent.jobId != null) ids.add(parent.jobId);
    }
  }
  return Array.from(ids).sort((a, b) => a - b);
}

async function lockJobs(tx: Db, ids: number[], companyId: number, provenanceJobs: number[], financialTracking = false) {
  for (const id of ids) {
    if (id === 0 && provenanceJobs.includes(id)) continue;
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for("update");
    if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
    if (job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Approved work parent belongs to another company" });
    if (job.finalizedAt && !provenanceJobs.includes(id) && !financialTracking) throw new TRPCError({ code: "FORBIDDEN", message: "Finalized jobs are immutable" });
  }
}

async function lockLinkedParents(tx: Db, linkSets: Links[], lockedJobs: number[], financialTracking = false) {
  for (const [key, table] of [["quoteId", quotes], ["workOrderId", workOrders]] as const) {
    const ids = Array.from(new Set(linkSets.map(links => links[key]).filter((id): id is number => id != null))).sort((a, b) => a - b);
    for (const id of ids) {
      const [parent] = await tx.select().from(table).where(eq(table.id, id)).for("update");
      if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: "Approved work parent not found" });
      if (parent.jobId != null && !lockedJobs.includes(parent.jobId)) {
        throw new TRPCError({ code: "CONFLICT", message: "Approved work links changed. Retry using the current record." });
      }
      if (table === workOrders && parent.finalizedAt && !financialTracking) throw new TRPCError({ code: "CONFLICT", message: "Work order is finalized" });
    }
  }
}

/** Called only while the actual quote is locked; aggregate and item scopes cannot overlap. */
export async function assertNoOverlappingQuoteApproval(tx: Db, quoteId: number, quoteItemId?: number) {
  const records = await tx.select({ id: approvedWork.id, quoteItemId: approvedWork.quoteItemId })
    .from(approvedWork).where(eq(approvedWork.quoteId, quoteId));
  if (records.some(record => quoteItemId == null || record.quoteItemId == null || record.quoteItemId === quoteItemId)) {
    throw new TRPCError({ code: "CONFLICT", message: "Approved work already represents this quote scope. Aggregate and item approvals cannot overlap." });
  }
}

export async function markQuoteItemConverted(tx: Db, quoteId: number, itemId: number) {
  await tx.update(repairQuoteItems).set({ approvalStatus: "converted_to_approved_work" })
    .where(and(eq(repairQuoteItems.id, itemId), eq(repairQuoteItems.quoteId, quoteId)));
}

export async function assertApprovedWorkLinks(links: Links, companyId: number) {
  await assertInvoiceLinks(links, companyId);
  for (const id of links.assignedTechnicianIds ?? []) {
    const user = await db.getUserById(id);
    if (!user || user.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN", message: "Assigned staff belongs to another company" });
  }
  if (links.deficiencyId != null) {
    const deficiency = await db.getDeficiencyById(links.deficiencyId);
    if (!deficiency) throw new TRPCError({ code: "NOT_FOUND", message: "Deficiency not found" });
    await assertInvoiceLinks({ ...links, jobId: deficiency.jobId }, companyId);
    if (links.jobId != null && links.jobId !== deficiency.jobId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Deficiency does not belong to the approved work job" });
    }
    if (links.quoteId != null) {
      const quote = await db.getQuoteById(links.quoteId);
      if (quote?.jobId !== deficiency.jobId) throw new TRPCError({ code: "BAD_REQUEST", message: "Deficiency does not belong to the approved quote job" });
    }
  }
  if (links.quoteItemId != null) {
    const item = await db.getRepairQuoteItemById(links.quoteItemId);
    if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Quote item not found" });
    if (links.quoteId == null || item.quoteId !== links.quoteId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Quote item does not belong to the approved work quote" });
    }
    if (links.deficiencyId != null && item.deficiencyId !== links.deficiencyId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Quote item deficiency does not match the approved work" });
    }
    if (item.deficiencyId != null) {
      const source = await db.getDeficiencyById(item.deficiencyId);
      if (!source) throw new TRPCError({ code: "NOT_FOUND", message: "Quote item deficiency not found" });
      // A source item can retain the original inspection deficiency when its
      // work is executed on a separate repair job. It remains provenance only.
      await assertInvoiceLinks({ quoteId: links.quoteId, jobId: source.jobId, siteId: links.siteId, customerOrgId: links.customerOrgId }, companyId);
    }
    return item;
  }
}

export function assertApprovedWorkOpen(record: ApprovedWork) {
  if (record.status === "closed" || record.status === "cancelled") {
    throw new TRPCError({ code: "CONFLICT", message: `Cannot change a ${record.status} approved work record.` });
  }
}

export async function withLockedApprovedWork<T>(ctx: TrpcContext, procedure: string, id: number, patch: Links, write: (record: ApprovedWork, tx: Db) => Promise<T>, options: { financialTracking?: boolean } = {}): Promise<T> {
  const candidate = await getApprovedWorkForCompany(id, ctx.user!.companyId!);
  const prospective = { ...candidate, ...patch };
  const jobIds = Array.from(new Set([...(await discoverJobIds(candidate)), ...(await discoverJobIds(prospective))])).sort((a, b) => a - b);
  const provenanceJobs = [await getRepairQuoteProvenanceJobId(candidate, candidate.companyId), await getRepairQuoteProvenanceJobId(prospective, candidate.companyId)]
    .filter((id): id is number => id != null);
  return db.withAudit(ctx, procedure, async tx => {
    // Discover outside this transaction; locking reads must precede its first
    // consistent snapshot. Job -> quote/work order -> approved work is shared
    // with sealing and the other financial/execution mutation routes.
    // Financial tracking may derive an invoice/close record after execution was
    // sealed. Its callers never mutate execution or the approval scope/amount.
    await lockJobs(tx, jobIds, candidate.companyId, provenanceJobs, options.financialTracking);
    await lockLinkedParents(tx, [candidate, prospective], jobIds, options.financialTracking);
    const [record] = await tx.select().from(approvedWork).where(eq(approvedWork.id, id)).for("update");
    if (!record) throw new TRPCError({ code: "NOT_FOUND" });
    if (record.companyId !== candidate.companyId) throw new TRPCError({ code: "CONFLICT", message: "Approved work ownership changed" });
    for (const key of ["jobId", "quoteId", "workOrderId", "deficiencyId"] as const) {
      if (record[key] !== candidate[key]) throw new TRPCError({ code: "CONFLICT", message: "Approved work links changed. Retry using the current record." });
    }
    const currentJobIds = await discoverJobIds({ ...record, ...patch });
    if (currentJobIds.some(jobId => !jobIds.includes(jobId))) throw new TRPCError({ code: "CONFLICT", message: "Approved work links changed. Retry using the current record." });
    await assertApprovedWorkLinks(record, record.companyId);
    await assertApprovedWorkLinks({ ...record, ...patch }, record.companyId);
    return write(record, tx);
  });
}

export async function withApprovedWorkCreation<T>(ctx: TrpcContext, procedure: string, companyId: number, links: Links, write: (tx: Db) => Promise<T>): Promise<T> {
  if (companyId !== ctx.user!.companyId && !callerIsPlatformOperator()) throw new TRPCError({ code: "FORBIDDEN" });
  const jobIds = await discoverJobIds(links);
  const provenanceJobId = await getRepairQuoteProvenanceJobId(links, companyId);
  return db.withAudit(ctx, procedure, async tx => {
    await lockJobs(tx, jobIds, companyId, provenanceJobId == null ? [] : [provenanceJobId]);
    await lockLinkedParents(tx, [links], jobIds);
    const currentJobIds = await discoverJobIds(links);
    if (currentJobIds.some(jobId => !jobIds.includes(jobId))) throw new TRPCError({ code: "CONFLICT", message: "Approved work links changed. Retry using the current record." });
    await assertApprovedWorkLinks(links, companyId);
    return write(tx);
  });
}
