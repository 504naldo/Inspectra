import { TRPCError } from "@trpc/server";
import * as db from "./db";

type Links = {
  customerOrgId?: number | null;
  siteId?: number | null;
  jobId?: number | null;
  workOrderId?: number | null;
  quoteId?: number | null;
  approvedWorkId?: number | null;
};

/** Prove an execution chain; a building quote's explicit sentinel is not a job. */
export async function getRepairQuoteProvenanceJobId(links: Links, companyId: number): Promise<number | null> {
  if (links.workOrderId == null || links.quoteId == null) return null;
  const order = await db.getWorkOrderById(links.workOrderId);
  const quote = await db.getQuoteById(links.quoteId);
  if (!order || !quote || order.quoteId !== quote.id || order.jobId === quote.jobId ||
      (links.jobId != null && links.jobId !== order.jobId)) return null;
  const job = await db.getJobById(order.jobId);
  const buildingOrigin = quote.quoteType === "building" && quote.jobId === 0;
  if (quote.jobId === 0 && !buildingOrigin) return null;
  if (!job || (buildingOrigin ? job.jobType !== "annual" : job.jobType !== "repair") ||
      job.companyId !== companyId || order.companyId !== companyId || quote.companyId !== companyId ||
      order.siteId !== job.siteId || order.customerOrgId !== job.customerOrgId ||
      quote.siteId !== job.siteId || quote.customerOrgId !== job.customerOrgId ||
      (links.siteId != null && links.siteId !== job.siteId) || (links.customerOrgId != null && links.customerOrgId !== job.customerOrgId)) return null;
  return quote.jobId;
}
/** Validate the supplied links AND their real ancestors before any invoice I/O. */
export async function assertInvoiceLinks(links: Links, companyId: number) {
  const provenanceJobId = await getRepairQuoteProvenanceJobId(links, companyId);
  const loaders = {
    customerOrgId: db.getCustomerOrgById,
    siteId: db.getSiteById,
    jobId: db.getJobById,
    workOrderId: db.getWorkOrderById,
    quoteId: db.getQuoteById,
    approvedWorkId: db.getApprovedWorkById,
  };
  const pending = Object.entries(links).filter(
    ([key, id]) => key in loaders && id != null
  ) as [keyof Links, number][];
  const seen = new Set<string>(),
    siteIds = new Set<number>(),
    orgIds = new Set<number>(),
    jobIds = new Set<number>(),
    quoteIds = new Set<number>(),
    workOrderIds = new Set<number>();
  while (pending.length) {
    const [key, id] = pending.shift()!;
    if (seen.has(`${key}:${id}`)) continue;
    seen.add(`${key}:${id}`);
    const row = await loaders[key](id);
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invoice parent not found",
      });
    if (row.companyId !== companyId)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Invoice parent belongs to another company",
      });
    if (key === "siteId") siteIds.add(id);
    if (key === "customerOrgId") orgIds.add(id);
    if (key === "jobId") jobIds.add(id);
    if (key === "quoteId") quoteIds.add(id);
    if (key === "workOrderId") workOrderIds.add(id);
    for (const parentKey of Object.keys(loaders) as (keyof Links)[]) {
      const parentId = (row as Links)[parentKey];
      // Only a fully proven building quote -> WO -> actual annual-job chain
      // can omit the legacy quote.jobId=0 sentinel from ancestor traversal.
      if (key === "quoteId" && parentKey === "jobId" && parentId === 0 && provenanceJobId === 0) continue;
      if (parentId != null) pending.push([parentKey, parentId]);
    }
  }
  if (jobIds.size > 1) {
    if (provenanceJobId != null) jobIds.delete(provenanceJobId);
  }
  if (siteIds.size > 1 || orgIds.size > 1 || jobIds.size > 1 || quoteIds.size > 1 || workOrderIds.size > 1)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invoice parent links disagree",
    });
}
