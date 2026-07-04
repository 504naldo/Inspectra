/**
 * capabilityEnforcement.test.ts — PR-10 capability matrix.
 *
 * Payroll approval/export and invoice void/Sage-export are per-company actions
 * held by `office` (and `admin`), NOT technicians/customers. (They were briefly
 * admin-only, but under the platform-operator model that routed every company's
 * payroll/void to the central operator, so they were returned to office —
 * docs/CAPABILITY_MATRIX.md.)
 *
 * These tests fail if the gate is loosened to technician, or if the payroll
 * self-approval block is dropped.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctxFor(role: string, companyId: number, userId: number): TrpcContext {
  return { user: { id: userId, openId: "o", email: `${role}${userId}@e.com`, name: role, role, companyId,
      customerOrgId: null, createdAt: new Date(), updatedAt: new Date() },
    req: { headers: {}, ip: "127.0.0.1" }, res: { setHeader(){}, clearCookie(){} },
    requestId: "t", ip: "127.0.0.1", ipAddress: "127.0.0.1", userAgent: "v" } as unknown as TrpcContext;
}

async function expectForbidden(p: Promise<unknown>) {
  await expect(p).rejects.toMatchObject({ code: "FORBIDDEN" });
}
/** Proves the role gate let the caller through: it resolves, or fails for a
 *  non-authorization (domain) reason — never a FORBIDDEN from the middleware. */
async function expectPassesRoleGate(p: Promise<unknown>) {
  try {
    await p;
  } catch (e: any) {
    expect(e?.code, `unexpected FORBIDDEN: ${e?.message}`).not.toBe("FORBIDDEN");
  }
}

describe("PR-10 capability matrix (office-held per-company actions)", () => {
  let companyId: number;
  let office: ReturnType<typeof appRouter.createCaller>;
  let tech: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const company = await db.createCompany({ name: "Cap Co", email: "cap@e.com" });
    companyId = company.id;
    office = appRouter.createCaller(ctxFor("office", companyId, 10));
    tech = appRouter.createCaller(ctxFor("technician", companyId, 12));
  });

  describe("invoices", () => {
    it("office can void; technician cannot", async () => {
      const inv = await office.invoice.create({ taxRate: 0 });
      await expectForbidden(tech.invoice.void({ id: inv.id }));
      expect(await office.invoice.void({ id: inv.id })).toMatchObject({ success: true });
    });

    it("office can Sage-export; technician cannot", async () => {
      const inv = await office.invoice.create({ taxRate: 0 });
      await expectForbidden(tech.invoice.exportSage({ ids: [inv.id] }));
      await expectForbidden(tech.invoice.markReadyForSageExport({ id: inv.id }));
      await expectPassesRoleGate(office.invoice.exportSage({ ids: [inv.id] }));
      await expectPassesRoleGate(office.invoice.markReadyForSageExport({ id: inv.id }));
    });

    it("office keeps its normal AR actions (create / markPaid)", async () => {
      const inv = await office.invoice.create({ taxRate: 0 });
      await expect(office.invoice.markPaid({ id: inv.id, amountPaid: 100 })).resolves.toBeTruthy();
    });
  });

  describe("payroll", () => {
    async function submittedEntry(byUserId = 12) {
      const author = appRouter.createCaller(ctxFor("technician", companyId, byUserId));
      const { id } = await author.payrollHours.create({ entryDate: "2026-01-02", regularMinutes: 480, totalMinutes: 480 });
      await author.payrollHours.submit({ id });
      return id;
    }

    it("office can approve/reject a submitted entry; technician cannot", async () => {
      const id = await submittedEntry();
      await expectForbidden(tech.payrollHours.approve({ id }));
      expect(await office.payrollHours.approve({ id })).toMatchObject({ success: true });
    });

    it("office cannot approve its OWN entry (segregation of duties preserved)", async () => {
      const ownId = await submittedEntry(10); // authored by the office user (id 10)
      await expectForbidden(office.payrollHours.approve({ id: ownId }));
    });

    it("office can run bulk approve / markExported / exportData; technician cannot", async () => {
      const id = await submittedEntry();
      await expectForbidden(tech.payrollHours.exportData({}));
      await expectForbidden(tech.payrollHours.markExported({ ids: [id] }));
      await expectPassesRoleGate(office.payrollHours.exportData({}));
      await expectPassesRoleGate(office.payrollHours.bulkApprove({ ids: [id] }));
    });

    it("office keeps its payroll views (listCompany)", async () => {
      await expect(office.payrollHours.listCompany({})).resolves.toBeDefined();
    });
  });
});
