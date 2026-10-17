import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { jobs, quotes, workOrders, type Job, type Quote, type WorkOrder } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import type { Db } from "./db/client";
import { runWithDb } from "./db/client";
import * as db from "./db";
import { getQuoteForCompany } from "./tenantGuards";
import { assertRepairQuoteFinalized } from "./repairQuoteIntegrity";

export type RepairQuoteLifecycle = {
  quote: Quote;
  tx: Db;
  sourceJob: Job;
  linkedJobs: Map<number, Job>;
  orders: WorkOrder[];
};

/** Discover ancestors outside the transaction, then lock jobs → quote → WOs. */
export async function withLockedRepairQuoteLifecycle<T>(
  ctx: TrpcContext,
  procedure: string,
  quoteId: number,
  write: (state: RepairQuoteLifecycle) => Promise<T>,
  requireFinalized = true,
): Promise<T> {
  const authorized = await getQuoteForCompany(quoteId, ctx.user!.companyId!);
  return withAuthorizedRepairQuoteLifecycle(ctx, procedure, authorized, write, requireFinalized);
}

/** Public/customer entry points supply a token/org-authorized candidate and recheck under the lock. */
export async function withAuthorizedRepairQuoteLifecycle<T>(
  ctx: TrpcContext | undefined,
  procedure: string,
  authorized: Quote,
  write: (state: RepairQuoteLifecycle) => Promise<T>,
  requireFinalized = true,
): Promise<T> {
  const quoteId = authorized.id;
  if (authorized.quoteType !== "repair") throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a repair quote." });
  if (requireFinalized) assertRepairQuoteFinalized(authorized);
  const database = await db.getDb();
  if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const candidates = await database.select().from(workOrders).where(eq(workOrders.quoteId, quoteId));
  const jobIds = Array.from(new Set([authorized.jobId, ...candidates.map(order => order.jobId)])).sort((a, b) => a - b);
  const mutate = async (tx: Db) => {
    const linkedJobs = new Map<number, Job>();
    // Current locking reads first; no stale REPEATABLE READ snapshot before waits.
    for (const id of jobIds) {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for("update");
      if (!job || job.companyId !== authorized.companyId || job.siteId !== authorized.siteId || job.customerOrgId !== authorized.customerOrgId) {
        throw new TRPCError({ code: "CONFLICT", message: "Quote job links are inconsistent; reconcile them before continuing." });
      }
      linkedJobs.set(id, job);
    }
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
    if (quote.companyId !== authorized.companyId || quote.jobId !== authorized.jobId || quote.siteId !== authorized.siteId || quote.customerOrgId !== authorized.customerOrgId || quote.quoteType !== "repair") {
      throw new TRPCError({ code: "CONFLICT", message: "Quote links changed. Reload and retry." });
    }
    if (requireFinalized) assertRepairQuoteFinalized(quote);
    const orders = await tx.select().from(workOrders).where(eq(workOrders.quoteId, quoteId)).for("update");
    if (orders.some(order => !linkedJobs.has(order.jobId))) {
      throw new TRPCError({ code: "CONFLICT", message: "The repair work order changed. Reload and retry the same operation." });
    }
    return write({ quote, tx, sourceJob: linkedJobs.get(quote.jobId)!, linkedJobs, orders });
  };
  if (ctx?.user) return db.withAudit(ctx, procedure, mutate);
  return database.transaction(async tx => runWithDb(tx as unknown as Db, () => mutate(tx as unknown as Db)));
}

export function assertRepairQuoteApprovalMutable(quote: Quote): void {
  if (["declined", "expired", "cancelled"].includes(quote.status)) {
    throw new TRPCError({ code: "CONFLICT", message: "This quote is closed. Create a new quote for a revised customer decision." });
  }
}

export function assertRepairQuoteDeliveryTransition(quote: Quote, next: "ready_to_send" | "sent" | "viewed"): void {
  if (!["draft", "ready_to_send", "sent", "viewed"].includes(quote.status)) {
    throw new TRPCError({ code: "CONFLICT", message: "This quote already has a customer decision and cannot be moved back into delivery." });
  }
  if (next === "ready_to_send" && ["sent", "viewed"].includes(quote.status)) {
    throw new TRPCError({ code: "CONFLICT", message: "This quote has already been sent." });
  }
  if (next === "viewed" && !["sent", "viewed"].includes(quote.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Mark the quote sent before recording a view." });
  }
}
