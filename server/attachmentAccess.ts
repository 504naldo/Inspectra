import { TRPCError } from "@trpc/server";
import * as db from "./db";
import type { User } from "../drizzle/schema";
import { callerIsPlatformOperator } from "./_core/actorContext";
import type { AttachmentEntityType } from "./tenantGuards";

type Parent = {
  companyId: number;
  customerOrgId: number;
  siteId?: number;
  jobId?: number;
  deviceId?: number;
};
export async function resolveAttachmentParent(
  type: AttachmentEntityType,
  id: number
): Promise<Parent> {
  const missing = () =>
    new TRPCError({
      code: "NOT_FOUND",
      message: "Attachment parent not found",
    });
  const jobParent = async (jobId: number): Promise<Parent> => {
    const job = await db.getJobById(jobId);
    if (!job) throw missing();
    const site = await db.getSiteById(job.siteId);
    if (!site) throw missing();
    if (
      site.companyId !== job.companyId ||
      site.customerOrgId !== job.customerOrgId
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Job parent links disagree",
      });
    return {
      companyId: job.companyId,
      customerOrgId: job.customerOrgId,
      siteId: job.siteId,
      jobId,
    };
  };
  switch (type) {
    case "job":
      return jobParent(id);
    case "site": {
      const site = await db.getSiteById(id);
      if (!site) throw missing();
      return {
        companyId: site.companyId,
        customerOrgId: site.customerOrgId,
        siteId: id,
      };
    }
    case "customer_org": {
      const org = await db.getCustomerOrgById(id);
      if (!org) throw missing();
      return { companyId: org.companyId, customerOrgId: id };
    }
    case "device": {
      const device = await db.getDeviceById(id);
      if (!device) throw missing();
      const parent = await resolveAttachmentParent("site", device.siteId);
      if (device.companyId !== parent.companyId)
        throw new TRPCError({ code: "FORBIDDEN" });
      return { ...parent, deviceId: id };
    }
    case "inspection_result": {
      const result = await db.getInspectionResultById(id);
      if (!result) throw missing();
      const parent = await jobParent(result.jobId);
      const device = await db.getDeviceById(result.deviceId);
      if (
        !device ||
        device.siteId !== parent.siteId ||
        device.companyId !== parent.companyId
      )
        throw new TRPCError({ code: "FORBIDDEN" });
      return { ...parent, deviceId: result.deviceId };
    }
    case "deficiency": {
      const deficiency = await db.getDeficiencyById(id);
      if (!deficiency) throw missing();
      return jobParent(deficiency.jobId);
    }
    case "repair": {
      const repair = await db.getRepairById(id);
      if (!repair) throw missing();
      return resolveAttachmentParent("deficiency", repair.deficiencyId);
    }
    default:
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Unsupported attachment parent",
      });
  }
}

export async function assertAttachmentDestination(
  input: {
    entityType: AttachmentEntityType;
    entityId: number;
    jobId?: number | null;
    siteId?: number | null;
    deviceId?: number | null;
  },
  actor: Pick<User, "role" | "companyId" | "customerOrgId">,
  write = false
) {
  const parent = await resolveAttachmentParent(
    input.entityType,
    input.entityId
  );
  if (actor.role === "customer") {
    if (
      write ||
      actor.customerOrgId == null ||
      actor.customerOrgId !== parent.customerOrgId
    )
      throw new TRPCError({ code: "FORBIDDEN" });
  } else if (
    actor.companyId !== parent.companyId &&
    !callerIsPlatformOperator()
  )
    throw new TRPCError({ code: "FORBIDDEN" });
  for (const [key, type] of [
    ["jobId", "job"],
    ["siteId", "site"],
    ["deviceId", "device"],
  ] as const) {
    const id = input[key];
    if (id == null) continue;
    const other = await resolveAttachmentParent(type, id);
    if (
      other.companyId !== parent.companyId ||
      other.customerOrgId !== parent.customerOrgId ||
      (parent.siteId != null && other.siteId !== parent.siteId) ||
      (parent[key] != null && parent[key] !== id)
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Attachment links disagree with canonical parent",
      });
    if (key === "jobId") parent.jobId = id;
    if (key === "siteId") parent.siteId = id;
    if (key === "deviceId") parent.deviceId = id;
  }
  if (write) {
    if (!["admin", "office", "technician"].includes(actor.role))
      throw new TRPCError({ code: "FORBIDDEN" });
    if (parent.jobId != null) await db.assertJobNotFinalized(parent.jobId);
  }
  return parent;
}
