import { TRPCError } from "@trpc/server";
import { assertCustomerOrgCompany, assertSiteCompany } from "./tenantGuards";

/** Resolve every supplied link before downloading, parsing or importing a file.
 * Admins can authorize foreign records, but a single import must still describe
 * one company and one customer organization.
 */
export async function assertImportDestination(input: {
  companyId: number;
  siteId?: number;
  customerOrgId?: number;
}) {
  const site = input.siteId != null
    ? await assertSiteCompany(input.siteId, input.companyId)
    : undefined;
  if (site && (
    site.companyId !== input.companyId ||
    (input.customerOrgId != null && site.customerOrgId !== input.customerOrgId)
  )) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Import destination links disagree" });
  }
  const customerOrgId = site?.customerOrgId ?? input.customerOrgId;
  if (customerOrgId != null) {
    const org = await assertCustomerOrgCompany(customerOrgId, input.companyId);
    if (org.companyId !== input.companyId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Import destination links disagree" });
    }
  }
  return { site, customerOrgId };
}
