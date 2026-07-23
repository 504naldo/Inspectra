/**
 * accessControl.test.ts — company-scoped per-role permission overrides.
 *
 * Verifies the editor endpoints and that an override is actually enforced at a
 * wired endpoint (reportQa.approveReport → reports.approve), while admin (the
 * platform operator) is never restricted. Needs a real MySQL (CI provisions
 * mysql:8); skipped locally without DATABASE_URL.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctxFor(role: string, companyId: number, userId = 1): TrpcContext {
  return { user: { id: userId, openId: "o", email: "o@e.com", name: "O", role, companyId,
      customerOrgId: null, createdAt: new Date(), updatedAt: new Date() },
    req: { headers: {}, ip: "127.0.0.1" }, res: { setHeader(){}, clearCookie(){} },
    requestId: "t", ip: "127.0.0.1", userAgent: "v" } as unknown as TrpcContext;
}
async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

describe("Access control — per-role permission overrides", () => {
  let companyId: number, reportId: number;
  let admin: ReturnType<typeof appRouter.createCaller>;
  let office: ReturnType<typeof appRouter.createCaller>;

  beforeAll(async () => {
    const company = await db.createCompany({ name: "AC Co", email: "ac@e.com" });
    companyId = company.id;
    const org = await db.createCustomerOrg({ companyId, name: "AC Org" });
    const site = await db.createSite({ companyId, customerOrgId: org.id, name: "AC Site" });
    const job = await db.createJob({ companyId, siteId: site.id, customerOrgId: org.id, jobNumber: "AC-1", title: "AC Job" } as any);
    const report = await db.createReport({
      jobId: job.id, generatedById: 1, reportNumber: "AC-R-1", title: "AC Report", status: "generated",
    } as any);
    reportId = report.id;
    admin = appRouter.createCaller(ctxFor("admin", companyId));
    office = appRouter.createCaller(ctxFor("office", companyId));
  });

  it("only an admin can edit overrides", async () => {
    await expectCode(
      office.accessControl.setRolePermission({ role: "office", permission: "reports.approve", allowed: false }),
      "FORBIDDEN",
    );
  });

  it("rejects an unknown permission", async () => {
    await expectCode(
      admin.accessControl.setRolePermission({ role: "office", permission: "not.a.permission", allowed: false }),
      "BAD_REQUEST",
    );
  });

  it("enforces a denial: office loses reports.approve once the admin revokes it", async () => {
    // Baseline allows office to approve — succeeds before any override.
    await expect(office.reportQa.approveReport({ reportId })).resolves.toBeTruthy();

    await admin.accessControl.setRolePermission({ role: "office", permission: "reports.approve", allowed: false });
    const cfg = await admin.accessControl.getRolePermissions();
    expect(cfg.overrides).toContainEqual({ role: "office", permission: "reports.approve", allowed: false });

    // Now the same office call is rejected by the override.
    await expectCode(office.reportQa.approveReport({ reportId }), "FORBIDDEN");
  });

  it("admin (platform operator) is never restricted by an override", async () => {
    // Override denying office is in place from the previous test; admin still approves.
    await expect(admin.reportQa.approveReport({ reportId })).resolves.toBeTruthy();
  });

  it("clearing the override restores the baseline", async () => {
    await admin.accessControl.setRolePermission({ role: "office", permission: "reports.approve", allowed: null });
    const cfg = await admin.accessControl.getRolePermissions();
    expect(cfg.overrides.find((o) => o.role === "office" && o.permission === "reports.approve")).toBeUndefined();
    await expect(office.reportQa.approveReport({ reportId })).resolves.toBeTruthy();
  });
});
