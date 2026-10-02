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
/** Validate the supplied links AND their real ancestors before any invoice I/O. */
export async function assertInvoiceLinks(links: Links, companyId: number) {
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
    orgIds = new Set<number>();
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
    for (const parentKey of Object.keys(loaders) as (keyof Links)[]) {
      const parentId = (row as Links)[parentKey];
      if (parentId != null) pending.push([parentKey, parentId]);
    }
  }
  if (siteIds.size > 1 || orgIds.size > 1)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invoice parent links disagree",
    });
}
