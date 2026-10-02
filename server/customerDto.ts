/**
 * customerDto.ts
 *
 * Strips internal-only fields from rows before they reach customer-role
 * callers. Customers can legitimately fetch their own org's reports and
 * deficiencies, but raw DB rows carry fields meant for internal staff only
 * (unverified AI drafts, QA notes, internal cost/resolution notes).
 *
 * Apply conditionally on the caller's role:
 *   ctx.user.role === 'customer' ? toCustomerSafeReport(report) : report
 */

import type { Report, Deficiency, Repair,
  Job,
  Invoice,
  Site,
  Attachment, } from "../drizzle/schema";

// Returns the nominal row type (not `Omit<...>`) so non-customer call sites
// that read the stripped fields keep type-checking correctly — TS otherwise
// collapses the get() resolver's `isCustomer ? safe : raw` ternary down to
// the narrower Omit type for every caller, not just customer ones.

export function toCustomerSafeReport(report: Report): Report {
  const { aiSummary, qaNote, ...safe } = report;
  return safe as Report;
}

export function toCustomerSafeDeficiency(deficiency: Deficiency): Deficiency {
  const { estimatedCost, resolutionNotes, ...safe } = deficiency;
  return safe as Deficiency;
}

export function toCustomerSafeRepair(repair: Repair): Repair {
  const { aiRecommendations, ...safe } = repair;
  return safe as Repair;
}

export function toCustomerSafeJob(job: Job): Job {
  const {
    id,
    companyId,
    customerOrgId,
    siteId,
    jobNumber,
    title,
    jobType,
    status,
    priority,
    scheduledDate,
    scheduledStartAt,
    scheduledEndAt,
    startedAt,
    completedAt,
    createdAt,
    updatedAt,
  } = job;
  return {
    id,
    companyId,
    customerOrgId,
    siteId,
    jobNumber,
    title,
    jobType,
    status,
    priority,
    scheduledDate,
    scheduledStartAt,
    scheduledEndAt,
    startedAt,
    completedAt,
    createdAt,
    updatedAt,
  } as Job;
}
export function toCustomerSafeInvoice(invoice: Invoice): Invoice {
  const {
    internalNotes,
    sageCustomerCode,
    sageGlCode,
    sageDepartment,
    sageExportStatus,
    sageExportedAt,
    createdById,
    approvedWorkId,
    workOrderId,
    quoteId,
    ...safe
  } = invoice;
  return safe as Invoice;
}
export function toCustomerSafeSite(site: Site): Site {
  const {
    id,
    companyId,
    customerOrgId,
    name,
    address,
    city,
    state,
    postalCode,
    createdAt,
    updatedAt,
  } = site;
  return {
    id,
    companyId,
    customerOrgId,
    name,
    address,
    city,
    state,
    postalCode,
    createdAt,
    updatedAt,
  } as Site;
}

export function toCustomerSafeAttachment(row: Attachment): Attachment {
  const {
    id,
    fileName,
    fileUrl,
    mimeType,
    fileSize,
    caption,
    locationNote,
    createdAt,
    updatedAt,
  } = row;
  return {
    id,
    fileName,
    fileUrl,
    mimeType,
    fileSize,
    caption,
    locationNote,
    createdAt,
    updatedAt,
  } as Attachment;
}
