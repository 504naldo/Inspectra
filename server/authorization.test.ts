/**
 * authorization.test.ts — cross-tenant authorization coverage (Part 7).
 *
 * Real-DB tests that fail if company-ownership checks are removed. Covers the
 * named scoped getters (jobs/sites/invoices/deficiencies), the polymorphic
 * entity guard, and representative router-level cross-company access.
 *
 * Reusable `setupCompany` factory builds an isolated tenant (company → org →
 * site → job → deficiency → invoice) so tests assert same-company-allow vs
 * cross-company-forbid without duplicating setup.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import * as guards from "./tenantGuards";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctxFor(role: string, companyId: number, opts: { userId?: number; customerOrgId?: number } = {}): TrpcContext {
  return { user: { id: opts.userId ?? 1, openId: "o", email: "o@e.com", name: "O", role, companyId,
      customerOrgId: opts.customerOrgId ?? null, createdAt: new Date(), updatedAt: new Date() },
    req: { headers: {}, ip: "127.0.0.1" }, res: { setHeader(){}, clearCookie(){} },
    requestId: "t", ip: "127.0.0.1", userAgent: "v" } as unknown as TrpcContext;
}

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

type Tenant = Awaited<ReturnType<typeof setupCompany>>;
async function setupCompany(tag: string) {
  const company = await db.createCompany({ name: `Co ${tag}`, email: `${tag}@e.com` });
  const org = await db.createCustomerOrg({ companyId: company.id, name: `Org ${tag}` });
  const site = await db.createSite({ companyId: company.id, customerOrgId: org.id, name: `Site ${tag}` });
  const job = await db.createJob({ companyId: company.id, siteId: site.id, customerOrgId: org.id, jobNumber: `J-${tag}`, title: `Job ${tag}` } as any);
  const def = await db.createDeficiency({ jobId: job.id, reportedById: 1, title: `Def ${tag}` } as any);
  const caller = appRouter.createCaller(ctxFor("office", company.id));
  const inv = await caller.invoice.create({ taxRate: 0 });
  return { company, org, site, job, def, inv, caller };
}

describe("Cross-tenant authorization", () => {
  let A: Tenant, B: Tenant;
  beforeAll(async () => { A = await setupCompany("A"); B = await setupCompany("B"); });

  describe("scoped getters (tenantGuards)", () => {
    it("jobs: same-company returns, cross-company FORBIDDEN, missing NOT_FOUND", async () => {
      expect((await guards.getJobForCompany(A.job.id, A.company.id)).id).toBe(A.job.id);
      await expectCode(guards.getJobForCompany(A.job.id, B.company.id), "FORBIDDEN");
      await expectCode(guards.getJobForCompany(9_999_999, A.company.id), "NOT_FOUND");
    });
    it("sites: cross-company FORBIDDEN", async () => {
      expect((await guards.getSiteForCompany(A.site.id, A.company.id)).id).toBe(A.site.id);
      await expectCode(guards.getSiteForCompany(A.site.id, B.company.id), "FORBIDDEN");
    });
    it("invoices: cross-company FORBIDDEN", async () => {
      expect((await guards.getInvoiceForCompany(A.inv.id, A.company.id)).id).toBe(A.inv.id);
      await expectCode(guards.getInvoiceForCompany(A.inv.id, B.company.id), "FORBIDDEN");
    });
    it("deficiencies: parent-job ownership enforced, cross-company FORBIDDEN", async () => {
      expect((await guards.getDeficiencyForCompany(A.def.id, A.company.id)).id).toBe(A.def.id);
      await expectCode(guards.getDeficiencyForCompany(A.def.id, B.company.id), "FORBIDDEN");
    });
    it("polymorphic entity guard: deficiency belongs to its company only", async () => {
      await expect(guards.assertEntityCompany("deficiency", A.def.id, A.company.id)).resolves.toBeUndefined();
      await expectCode(guards.assertEntityCompany("deficiency", A.def.id, B.company.id), "FORBIDDEN");
    });
  });

  describe("router-level (invoices)", () => {
    it("same-company office can read its invoice", async () => {
      const inv = await A.caller.invoice.get({ id: A.inv.id });
      expect(inv.id).toBe(A.inv.id);
    });
    it("other-company office cannot read or mutate the invoice", async () => {
      await expectCode(B.caller.invoice.get({ id: A.inv.id }), "FORBIDDEN");
      await expectCode(B.caller.invoice.markPaid({ id: A.inv.id, amountPaid: 100 }), "FORBIDDEN");
    });
    it("a client-supplied company id cannot widen scope (list is scoped to ctx)", async () => {
      // invoice.list takes no companyId from the client; it derives scope from ctx.
      const aList = await A.caller.invoice.list({});
      const bList = await B.caller.invoice.list({});
      expect(aList.some((i: any) => i.id === A.inv.id)).toBe(true);
      expect(bList.some((i: any) => i.id === A.inv.id)).toBe(false);
    });
  });
});
