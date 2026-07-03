/**
 * tenantGuards.ts
 *
 * Shared company-ownership assertions used by routers to stop cross-tenant
 * IDOR access: loads a record by id and throws NOT_FOUND/FORBIDDEN when it
 * doesn't belong to the caller's company, before any read or write proceeds.
 */
import { TRPCError } from "@trpc/server";
import * as db from "./db";

// ── Named scoped getters ──────────────────────────────────────────────────────
// Prefer these over `getById(id)` + manual `companyId` comparison: they load the
// record and enforce company ownership in one place (throwing NOT_FOUND/FORBIDDEN),
// so a caller can't forget the check. `companyId` must always come from
// authenticated context (ctx.user.companyId), never from client input.

/** Load a job and assert it belongs to the company. Throws otherwise. */
export async function getJobForCompany(jobId: number, companyId: number) {
  return db.assertJobCompany(jobId, companyId);
}

/** Load a site and assert it belongs to the company. */
export async function getSiteForCompany(siteId: number, companyId: number) {
  return assertSiteCompany(siteId, companyId);
}

/** Load an invoice and assert it belongs to the company. */
export async function getInvoiceForCompany(invoiceId: number, companyId: number) {
  const invoice = await db.getInvoiceById(invoiceId);
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
  if (invoice.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return invoice;
}

/** Load a quote and assert it belongs to the company. */
export async function getQuoteForCompany(quoteId: number, companyId: number) {
  const quote = await db.getQuoteById(quoteId);
  if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
  if (quote.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return quote;
}

/** Load a deficiency and assert (via its parent job) it belongs to the company. */
export async function getDeficiencyForCompany(deficiencyId: number, companyId: number) {
  const deficiency = await db.getDeficiencyById(deficiencyId);
  if (!deficiency) throw new TRPCError({ code: "NOT_FOUND", message: "Deficiency not found" });
  const job = await db.getJobById(deficiency.jobId);
  if (!job || job.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return deficiency;
}

export async function assertSiteCompany(siteId: number, companyId: number) {
  const site = await db.getSiteById(siteId);
  if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "Site not found" });
  if (site.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return site;
}

export async function assertAreaCompany(areaId: number, companyId: number) {
  const area = await db.getAreaById(areaId);
  if (!area) throw new TRPCError({ code: "NOT_FOUND", message: "Area not found" });
  await assertSiteCompany(area.siteId, companyId);
  return area;
}

export async function assertDeviceCompany(deviceId: number, companyId: number) {
  const device = await db.getDeviceById(deviceId);
  if (!device) throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
  if (device.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return device;
}

export async function assertCustomerOrgCompany(customerOrgId: number, companyId: number) {
  const org = await db.getCustomerOrgById(customerOrgId);
  if (!org) throw new TRPCError({ code: "NOT_FOUND", message: "Customer organization not found" });
  if (org.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return org;
}

export async function assertWorkOrderCompany(workOrderId: number, companyId: number) {
  const wo = await db.getWorkOrderById(workOrderId);
  if (!wo) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
  if (wo.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return wo;
}

export async function assertPartsCatalogItemCompany(itemId: number, companyId: number) {
  const item = await db.getPartsCatalogItemById(itemId);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Parts catalog item not found" });
  if (item.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return item;
}

/**
 * Attachments don't have their own companyId column — ownership is resolved
 * via whichever parent ref (jobId/siteId/deviceId) is populated.
 */
export async function getAttachmentOwnerCompanyId(attachment: {
  jobId: number | null;
  siteId: number | null;
  deviceId: number | null;
}) {
  if (attachment.jobId) {
    const job = await db.getJobById(attachment.jobId);
    return job?.companyId ?? null;
  }
  if (attachment.siteId) {
    const site = await db.getSiteById(attachment.siteId);
    return site?.companyId ?? null;
  }
  if (attachment.deviceId) {
    const device = await db.getDeviceById(attachment.deviceId);
    return device?.companyId ?? null;
  }
  return null;
}

export async function assertAttachmentCompany(attachmentId: number, companyId: number) {
  const attachment = await db.getAttachmentById(attachmentId);
  if (!attachment) throw new TRPCError({ code: "NOT_FOUND", message: "Attachment not found" });
  const ownerCompanyId = await getAttachmentOwnerCompanyId(attachment);
  if (ownerCompanyId !== null && ownerCompanyId !== companyId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return attachment;
}

export type AttachmentEntityType =
  | "inspection_result"
  | "deficiency"
  | "repair"
  | "device"
  | "job"
  | "site"
  | "customer_org";

/**
 * Resolves the owning company for any of the entity types attachments can
 * link to, walking up to the parent job where the entity itself has no
 * direct companyId column. Returns null when the entity (or its parent)
 * doesn't exist.
 */
export async function resolveEntityOwnerCompanyId(
  entityType: AttachmentEntityType,
  entityId: number
): Promise<number | null> {
  switch (entityType) {
    case "job": {
      const job = await db.getJobById(entityId);
      return job?.companyId ?? null;
    }
    case "site": {
      const site = await db.getSiteById(entityId);
      return site?.companyId ?? null;
    }
    case "device": {
      const device = await db.getDeviceById(entityId);
      return device?.companyId ?? null;
    }
    case "customer_org": {
      const org = await db.getCustomerOrgById(entityId);
      return org?.companyId ?? null;
    }
    case "inspection_result": {
      const result = await db.getInspectionResultById(entityId);
      if (!result) return null;
      const job = await db.getJobById(result.jobId);
      return job?.companyId ?? null;
    }
    case "deficiency": {
      const deficiency = await db.getDeficiencyById(entityId);
      if (!deficiency) return null;
      const job = await db.getJobById(deficiency.jobId);
      return job?.companyId ?? null;
    }
    case "repair": {
      const repair = await db.getRepairById(entityId);
      if (!repair) return null;
      const deficiency = await db.getDeficiencyById(repair.deficiencyId);
      if (!deficiency) return null;
      const job = await db.getJobById(deficiency.jobId);
      return job?.companyId ?? null;
    }
  }
}

export async function assertEntityCompany(
  entityType: AttachmentEntityType,
  entityId: number,
  companyId: number
) {
  const ownerCompanyId = await resolveEntityOwnerCompanyId(entityType, entityId);
  if (ownerCompanyId === null) {
    throw new TRPCError({ code: "NOT_FOUND", message: `${entityType} ${entityId} not found` });
  }
  if (ownerCompanyId !== companyId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}
