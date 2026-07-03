/**
 * capabilityEnforcement.test.ts — PR-10 capability enforcement.
 *
 * Certain sensitive actions were previously open to any office *or* admin user.
 * Per the agreed capability matrix they are now admin-only, enforced server-side:
 *   - Invoicing: void, exportSage, markReadyForSageExport, markExportedToSage
 *     (office keeps create / edit / markPaid / send).
 *   - Payroll: approve, reject, bulkApprove, bulkReject, markExported, exportData
 *     (office keeps view / summaries / setAdminNotes; technicians submit their own).
 *
 * These tests fail if any of those gates is relaxed back to office. They also cover
 * the bypass path: office must not be able to reach invoice "void" through the
 * generic updateStatus transition.
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

describe("PR-10 capability enforcement", () => {
  let companyId: number;
  let office: ReturnType<typeof appRouter.createCaller>;
  let admin: ReturnType<typeof appRouter.createCaller>;
  let tech: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const company = await db.createCompany({ name: "Cap Co", email: "cap@e.com" });
    companyId = company.id;
    office = appRouter.createCaller(ctxFor("office", companyId, 10));
    admin = appRouter.createCaller(ctxFor("admin", companyId, 11));
    tech = appRouter.createCaller(ctxFor("technician", companyId, 12));
  });

  describe("invoices", () => {
    it("office cannot void; admin can", async () => {
      const inv = await office.invoice.create({ taxRate: 0 }); // office still creates
      await expectForbidden(office.invoice.void({ id: inv.id }));
      const res = await admin.invoice.void({ id: inv.id });
      expect(res).toMatchObject({ success: true });
    });

    it("office cannot reach 'void' through updateStatus (bypass closed)", async () => {
      const inv = await office.invoice.create({ taxRate: 0 });
      await expectForbidden(office.invoice.updateStatus({ id: inv.id, status: "void" }));
      // …but office can still make a legitimate transition.
      await expect(office.invoice.updateStatus({ id: inv.id, status: "sent" })).resolves.toMatchObject({ success: true });
    });

    it("office is blocked from Sage export actions; admin passes the gate", async () => {
      const inv = await office.invoice.create({ taxRate: 0 });
      await expectForbidden(office.invoice.exportSage({ ids: [inv.id] }));
      await expectForbidden(office.invoice.markReadyForSageExport({ id: inv.id }));
      await expectForbidden(office.invoice.markExportedToSage({ id: inv.id }));
      await expectPassesRoleGate(admin.invoice.exportSage({ ids: [inv.id] }));
      await expectPassesRoleGate(admin.invoice.markReadyForSageExport({ id: inv.id }));
    });

    it("office keeps its normal AR actions (create / markPaid)", async () => {
      const inv = await office.invoice.create({ taxRate: 0 });
      await expect(office.invoice.markPaid({ id: inv.id, amountPaid: 100 })).resolves.toBeTruthy();
    });
  });

  describe("payroll", () => {
    async function submittedEntry() {
      const { id } = await tech.payrollHours.create({ entryDate: "2026-01-02", regularMinutes: 480, totalMinutes: 480 });
      await tech.payrollHours.submit({ id });
      return id;
    }

    it("office cannot approve/reject; admin (a different user) can approve", async () => {
      const id = await submittedEntry();
      await expectForbidden(office.payrollHours.approve({ id }));
      await expectForbidden(office.payrollHours.reject({ id, reason: "x" }));
      const res = await admin.payrollHours.approve({ id });
      expect(res).toMatchObject({ success: true });
    });

    it("office is blocked from bulk approve/reject, markExported and exportData", async () => {
      const id = await submittedEntry();
      await expectForbidden(office.payrollHours.bulkApprove({ ids: [id] }));
      await expectForbidden(office.payrollHours.bulkReject({ ids: [id] }));
      await expectForbidden(office.payrollHours.markExported({ ids: [id] }));
      await expectForbidden(office.payrollHours.exportData({}));
      // admin passes the role gate on the payroll run.
      await expectPassesRoleGate(admin.payrollHours.exportData({}));
    });

    it("office keeps its allowed payroll views (listCompany / getReviewSummary)", async () => {
      await expect(office.payrollHours.listCompany({})).resolves.toBeDefined();
    });
  });
});
