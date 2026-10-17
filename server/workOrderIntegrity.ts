import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { workOrders, type WorkOrder } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import type { Db } from "./db/client";
import { withMutableJob } from "./jobWriteTransaction";
import { assertWorkOrderCompany } from "./tenantGuards";

/** Lock the seal parent before the child; all writers use this lock order. */
export async function withMutableWorkOrder<T>(
  ctx: TrpcContext,
  procedure: string,
  workOrderId: number,
  write: (order: WorkOrder, transaction: Db) => Promise<T>,
): Promise<T> {
  const candidate = await assertWorkOrderCompany(workOrderId, ctx.user!.companyId!);
  return withMutableJob(ctx, procedure, candidate.jobId, async (job, transaction) => {
    const [order] = await transaction.select().from(workOrders).where(eq(workOrders.id, workOrderId)).for("update");
    if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
    if (order.jobId !== job.id || order.companyId !== job.companyId || order.siteId !== job.siteId || order.customerOrgId !== job.customerOrgId) {
      throw new TRPCError({ code: "CONFLICT", message: "Work order links changed or do not match its job." });
    }
    if (order.finalizedAt) throw new TRPCError({ code: "CONFLICT", message: "Work order is finalized and cannot be modified." });
    return write(order, transaction);
  });
}
