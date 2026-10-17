import { TRPCError } from "@trpc/server";
import * as db from "./db";
import type { User } from "../drizzle/schema";
import { callerIsPlatformOperator } from "./_core/actorContext";
import type { AttachmentEntityType } from "./tenantGuards";
import type { TrpcContext } from "./_core/context";
import { customerOrgs, sites } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export type AttachmentParent = {
  companyId: number;
  customerOrgId: number;
  siteId?: number;
  jobId?: number;
  deviceId?: number;
};
export type AttachmentDestination = {
  entityType: AttachmentEntityType;
  entityId: number;
  jobId?: number | null;
  siteId?: number | null;
  deviceId?: number | null;
};
export async function resolveAttachmentParent(
  type: AttachmentEntityType,
  id: number
): Promise<AttachmentParent> {
  const missing = () =>
    new TRPCError({
      code: "NOT_FOUND",
      message: "Attachment parent not found",
    });
  const jobParent = async (jobId: number): Promise<AttachmentParent> => {
    const job = await db.getJobById(jobId);
    if (!job) throw missing();
    const site = await resolveAttachmentParent("site", job.siteId);
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
      const org = await db.getCustomerOrgById(site.customerOrgId);
      if (!org) throw missing();
      if (org.companyId !== site.companyId)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Site customer organization links disagree",
        });
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
  input: AttachmentDestination,
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
      (["jobId", "siteId", "deviceId"] as const).some(
        link =>
          parent[link] != null &&
          other[link] != null &&
          parent[link] !== other[link]
      ) ||
      (parent[key] != null && parent[key] !== id)
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Attachment links disagree with canonical parent",
      });
    // Carry every derived link forward so optional links are also checked
    // against each other (for example an org's job and a different site).
    for (const link of ["jobId", "siteId", "deviceId"] as const)
      if (other[link] != null) parent[link] = other[link];
  }
  if (write) {
    if (!["admin", "office", "technician"].includes(actor.role))
      throw new TRPCError({ code: "FORBIDDEN" });
    if (parent.jobId != null) await db.assertJobNotFinalized(parent.jobId);
  }
  return parent;
}

/**
 * Resolve the parent before entering the transaction, then acquire all seal
 * locks before any repeatable-read snapshot is established. In particular, a
 * concurrent idempotent upload must see the attachment committed by the first
 * request after waiting for its parent's lock.
 */
export async function withAttachmentWrite<T>(
  ctx: TrpcContext,
  procedure: string,
  destinations: AttachmentDestination[],
  operation: (
    parents: AttachmentParent[],
    tx: Parameters<Parameters<typeof db.withAudit>[2]>[0]
  ) => Promise<T>
): Promise<T> {
  if (!ctx.user || !["admin", "office", "technician"].includes(ctx.user.role))
    throw new TRPCError({ code: "FORBIDDEN" });
  const actor = ctx.user;
  const expected = await Promise.all(
    destinations.map(input => assertAttachmentDestination(input, actor))
  );
  return db.withAudit(ctx, procedure, async tx => {
    const jobIds = Array.from(
      new Set(
        expected.flatMap(parent => (parent.jobId == null ? [] : [parent.jobId]))
      )
    ).sort((a, b) => a - b);
    for (const jobId of jobIds) await db.assertJobNotFinalized(jobId, tx);
    // A canonical site/device can be uploaded with or without an optional job
    // link. Both variants must hold the same site lock for idempotent replay.
    const siteIds = Array.from(
      new Set(
        expected.flatMap(parent =>
          parent.siteId != null ? [parent.siteId] : []
        )
      )
    ).sort((a, b) => a - b);
    for (const siteId of siteIds)
      await tx
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.id, siteId))
        .for("update");
    const orgIds = Array.from(
      new Set(
        expected.flatMap((parent, index) =>
          destinations[index].entityType === "customer_org"
            ? [parent.customerOrgId]
            : []
        )
      )
    ).sort((a, b) => a - b);
    for (const orgId of orgIds)
      await tx
        .select({ id: customerOrgs.id })
        .from(customerOrgs)
        .where(eq(customerOrgs.id, orgId))
        .for("update");
    const parents = await Promise.all(
      destinations.map(input => assertAttachmentDestination(input, actor))
    );
    const keys = [
      "companyId",
      "customerOrgId",
      "jobId",
      "siteId",
      "deviceId",
    ] as const;
    if (
      parents.some((parent, index) =>
        keys.some(key => parent[key] !== expected[index][key])
      )
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Attachment parent changed. Refresh and try again.",
      });
    return operation(parents, tx);
  });
}

/** A completed idempotent replay is a read, even if the job has since sealed. */
export async function findAttachmentReplay(
  destination: AttachmentDestination,
  idempotencyKey: string,
  actor: Pick<User, "id" | "role" | "companyId" | "customerOrgId">
) {
  await assertAttachmentDestination(destination, actor);
  const existing = await db.getAttachmentByIdempotencyKey(
    idempotencyKey,
    destination.entityType,
    destination.entityId
  );
  if (!existing) return undefined;
  if (
    existing.uploadedById !== actor.id ||
    existing.uploadStatus !== "completed"
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "Upload key is already in use.",
    });
  return requireUploadedAttachment(destination, existing.fileKey, actor);
}

/** A caller may register only an object already persisted by our upload paths. */
export async function requireUploadedAttachment(
  destination: AttachmentDestination,
  fileKey: string,
  actor: Pick<User, "id" | "role" | "companyId" | "customerOrgId">
) {
  const parent = await assertAttachmentDestination(destination, actor);
  const rows = await db.getAttachmentsByEntity(
    destination.entityType,
    destination.entityId
  );
  const attachment = rows.find(
    row =>
      row.fileKey === fileKey &&
      row.uploadedById === actor.id &&
      row.uploadStatus === "completed"
  );
  if (!attachment)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Complete a file upload before registering it.",
    });
  const storedParent = await assertAttachmentDestination(attachment, actor);
  if (
    (parent.jobId != null && parent.jobId !== storedParent.jobId) ||
    (parent.siteId != null && parent.siteId !== storedParent.siteId) ||
    (parent.deviceId != null && parent.deviceId !== storedParent.deviceId)
  )
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Uploaded file belongs to another destination.",
    });
  return attachment;
}

/** Revalidate an id-addressed attachment after its parent locks are acquired. */
export async function assertAttachmentLinksUnchanged(
  expected: { id: number } & AttachmentDestination
) {
  const current = await db.getAttachmentById(expected.id);
  if (!current) throw new TRPCError({ code: "NOT_FOUND" });
  const keys = [
    "entityType",
    "entityId",
    "jobId",
    "siteId",
    "deviceId",
  ] as const;
  if (keys.some(key => current[key] !== expected[key]))
    throw new TRPCError({
      code: "CONFLICT",
      message: "Attachment links changed. Refresh and try again.",
    });
  return current;
}

/** Optional query links are indexes, not authority over a legacy row's parent. */
export async function filterAuthorizedAttachments<
  T extends AttachmentDestination,
>(
  rows: T[],
  actor: Pick<User, "role" | "companyId" | "customerOrgId">
): Promise<T[]> {
  const checks = new Map<string, Promise<boolean>>();
  const visible = await Promise.all(
    rows.map(async row => {
      const key = JSON.stringify([
        row.entityType,
        row.entityId,
        row.jobId ?? null,
        row.siteId ?? null,
        row.deviceId ?? null,
      ]);
      if (!checks.has(key))
        checks.set(
          key,
          assertAttachmentDestination(row, actor).then(
            () => true,
            error => {
              if (
                error instanceof TRPCError &&
                ["FORBIDDEN", "NOT_FOUND"].includes(error.code)
              )
                return false;
              throw error;
            }
          )
        );
      return (await checks.get(key)) === true;
    })
  );
  return rows.filter((_row, index) => visible[index]);
}
