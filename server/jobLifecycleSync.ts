import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import * as schema from "../drizzle/schema";
import * as db from "./db";

/** Called and awaited inside the job's audited transaction, after its lock. */
export async function syncLinkedWorkOrders(job: schema.Job, patch: Partial<schema.InsertWorkOrder>) {
  const tx = await db.getDb();
  if (!tx) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const orders = await tx.select().from(schema.workOrders).where(eq(schema.workOrders.jobId, job.id)).for("update");
  for (const wo of orders) {
    if (wo.companyId !== job.companyId || wo.siteId !== job.siteId || wo.customerOrgId !== job.customerOrgId) {
      throw new TRPCError({ code: "CONFLICT", message: "Work order links do not match the job." });
    }
    if (wo.finalizedAt) throw new TRPCError({ code: "CONFLICT", message: "The linked work order is finalized and cannot be modified." });
    await db.updateWorkOrder(wo.id, patch);
  }
}

export async function assertJobTechnician(job: schema.Job, technicianId: number) {
  const technician = await db.getUserById(technicianId);
  if (!technician || technician.companyId !== job.companyId || !["technician", "admin", "office"].includes(technician.role) || !technician.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid technician for this job's company." });
  }
  return technician;
}
