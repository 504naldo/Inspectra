import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { appRouter } from "./routers";
import * as db from "./db";
import {
  users,
  invoices,
  invoicePayments,
  fireAlarmInspectionResults,
  fireAlarmChecklistTemplates,
} from "../drizzle/schema";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { COOKIE_NAME } from "../shared/const";
import { storagePut } from "./storage";
import type { TrpcContext } from "./_core/context";
vi.mock("./storage", () => ({
  storagePut: vi.fn(async () => ({ url: "https://example.test/object" })),
  storageGet: vi.fn(),
  storageGetDownload: vi.fn(),
}));

function context(
  role: "office" | "technician" | "customer" | "admin",
  companyId: number | null,
  customerOrgId: number | null = null,
  id = 1
): TrpcContext {
  return {
    user: {
      id,
      name: "Audit fixture",
      openId: `audit-${id}`,
      role,
      isActive: 1,
      companyId,
      customerOrgId,
    },
    req: { headers: {} },
    res: { setHeader() {}, clearCookie() {} },
    requestId: "audit-fixture",
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  } as unknown as TrpcContext;
}
async function tenant(tag: string) {
  const company = await db.createCompany({ name: `Audit ${tag}` });
  const org = await db.createCustomerOrg({
    companyId: company.id,
    name: `Audit org ${tag}`,
  });
  const site = await db.createSite({
    companyId: company.id,
    customerOrgId: org.id,
    name: `Audit site ${tag}`,
  });
  const job = await db.createJob({
    companyId: company.id,
    customerOrgId: org.id,
    siteId: site.id,
    title: `Audit job ${tag}`,
    jobNumber: `AUDIT-${tag}`,
    officeNotes: "private office notes",
  });
  const device = await db.createDevice({
    companyId: company.id,
    siteId: site.id,
    deviceType: "Smoke Detector",
  });
  return { company, org, site, job, device };
}
describe("Audit remediation — real MySQL boundaries and atomicity", () => {
  let A: Awaited<ReturnType<typeof tenant>>, B: typeof A, sibling: typeof A;
  let staff: ReturnType<typeof appRouter.createCaller>,
    admin: typeof staff,
    customer: typeof staff;
  let userId: number;
  const oldSecret = ENV.cookieSecret;
  beforeAll(async () => {
    A = await tenant("alpha");
    B = await tenant("beta");
    sibling = await tenant("sibling");
    await db.updateSite(sibling.site.id, { companyId: A.company.id });
    await db.updateCustomerOrg(sibling.org.id, { companyId: A.company.id });
    await db.updateJob(sibling.job.id, { companyId: A.company.id });
    await db.updateDevice(sibling.device.id, { companyId: A.company.id });
    const database = (await db.getDb())!;
    const [inserted] = await database
      .insert(users)
      .values({
        openId: "audit-revocation",
        companyId: A.company.id,
        name: "Audit fixture",
        role: "office",
        googleAccessToken: "fixture-access-token",
        googleRefreshToken: "fixture-refresh-token",
        pushToken: "fixture-push-token",
      })
      .$returningId();
    userId = inserted.id;
    staff = appRouter.createCaller(
      context("office", A.company.id, null, userId)
    );
    admin = appRouter.createCaller(
      context("admin", A.company.id, null, userId)
    );
    customer = appRouter.createCaller(
      context("customer", null, A.org.id, userId)
    );
    ENV.cookieSecret = "disposable-test-secret-with-at-least-32-characters";
  });
  afterAll(() => {
    ENV.cookieSecret = oldSecret;
  });
  it("public profiles never serialize Workspace/push credentials or the session counter", async () => {
    const own = await staff.auth.me();
    const list = await admin.user.list({ companyId: A.company.id });
    const get = await staff.user.get({ id: userId });
    for (const result of [own, list, get]) {
      const json = JSON.stringify(result);
      for (const field of [
        "googleAccessToken",
        "googleRefreshToken",
        "googleTokenExpiry",
        "pushToken",
        "sessionVersion",
      ])
        expect(json).not.toContain(field);
      expect(json).not.toContain("fixture-access-token");
    }
  });
  it("login upserts preserve established company and customer membership", async () => {
    await db.upsertUser({
      openId: "audit-revocation",
      companyId: B.company.id,
      customerOrgId: B.org.id,
      role: "technician",
    });
    const row = await db.getUserByOpenId("audit-revocation");
    expect(row?.companyId).toBe(A.company.id);
    expect(row?.role).toBe("office");
    expect(row?.customerOrgId).toBeNull();
  });
  it("a real signed cookie stops authenticating after logout", async () => {
    const row = (await db.getUserById(userId))!;
    const token = await sdk.createSessionToken(row.openId, {
      name: row.name!,
      sessionVersion: row.sessionVersion,
    });
    const request = { headers: { cookie: `${COOKIE_NAME}=${token}` } } as any;
    expect((await sdk.authenticateRequest(request)).id).toBe(userId);
    await staff.auth.logout();
    await expect(sdk.authenticateRequest(request)).rejects.toThrow(/revoked/);
    const fresh = (await db.getUserById(userId))!;
    const activeToken = await sdk.createSessionToken(fresh.openId, {
      name: fresh.name!,
      sessionVersion: fresh.sessionVersion,
    });
    const activeRequest = {
      headers: { cookie: `${COOKIE_NAME}=${activeToken}` },
    } as any;
    await admin.user.updateUser({ userId, isActive: false });
    await expect(sdk.authenticateRequest(request)).rejects.toThrow(/inactive/);
    await admin.user.updateUser({ userId, isActive: true });
    await expect(sdk.authenticateRequest(activeRequest)).rejects.toThrow(
      /revoked/
    );
    await expect(sdk.authenticateRequest(request)).rejects.toThrow(/revoked/);
  });
  it("customers with no company can read their org without internal job fields", async () => {
    const result = await customer.job.get({ id: A.job.id });
    expect(result.id).toBe(A.job.id);
    expect(result).not.toHaveProperty("officeNotes");
    expect(result).not.toHaveProperty("googleCalendarEventId");
    expect(
      (await customer.job.listByCustomerOrg({ customerOrgId: A.org.id })).some(
        j => j.id === A.job.id
      )
    ).toBe(true);
    await expect(
      customer.job.get({ id: sibling.job.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      customer.site.listByCustomerOrg({ customerOrgId: sibling.org.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("customer/company list parents are checked; platform admin can cross companies", async () => {
    await expect(
      staff.job.listByCustomerOrg({ customerOrgId: B.org.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.site.listByCustomerOrg({ customerOrgId: B.org.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await admin.job.get({ id: B.job.id })).id).toBe(B.job.id);
    expect(
      (await admin.site.listByCustomerOrg({ customerOrgId: B.org.id })).length
    ).toBeGreaterThan(0);
    await expect(staff.job.get({ id: 9999999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("customers cannot pull technician packets, fire-alarm results, or work-site secrets", async () => {
    for (const caller of [
      customer,
      appRouter.createCaller(
        context("customer", A.company.id, A.org.id, userId)
      ),
    ]) {
      await expect(
        caller.job.getOfflineJobPacket({ jobId: sibling.job.id })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.fireAlarm.getInspectionResults({ jobId: A.job.id })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.workSiteInfo.getForJob({ jobId: A.job.id })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
  it("invoice create/update reject foreign and inconsistent parents without writes", async () => {
    const original = await staff.invoice.create({
      customerOrgId: A.org.id,
      siteId: A.site.id,
    });
    await expect(
      staff.invoice.create({ customerOrgId: B.org.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.invoice.create({ jobId: 9999999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      staff.invoice.create({ customerOrgId: A.org.id, siteId: sibling.site.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      staff.invoice.update({ id: original.id, siteId: B.site.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.getInvoiceById(original.id))?.siteId).toBe(A.site.id);
  });
  it("a foreign line cannot be updated/deleted through an owned invoice", async () => {
    const foreign = await appRouter
      .createCaller(context("office", B.company.id, null, userId))
      .invoice.create({});
    const line = await db.createInvoiceLineItem({
      invoiceId: foreign.id,
      description: "Foreign",
      quantity: "1",
      unitPrice: "50",
      total: "50",
    });
    const own = await staff.invoice.create({});
    await expect(
      staff.invoice.updateLineItem({
        id: line.id,
        invoiceId: own.id,
        quantity: 2,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.invoice.removeLineItem({ id: line.id, invoiceId: own.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.getInvoiceLineItemById(line.id))?.quantity).toBe("1.00");
  });
  it("partial payments accumulate, retries do not duplicate receipts, and changed payloads conflict", async () => {
    const inv = await staff.invoice.create({ taxRate: 0 });
    await staff.invoice.addLineItem({
      invoiceId: inv.id,
      description: "Work",
      quantity: 1,
      unitPrice: 100,
      taxable: false,
    });
    const requestId = crypto.randomUUID();
    const first = await staff.invoice.markPaid({
      id: inv.id,
      amountPaid: 40,
      requestId,
    });
    expect(first.amountPaid).toBe(40);
    expect(
      await staff.invoice.markPaid({ id: inv.id, amountPaid: 40, requestId })
    ).toEqual(first);
    await expect(
      staff.invoice.markPaid({ id: inv.id, amountPaid: 50, requestId })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const second = await staff.invoice.markPaid({
      id: inv.id,
      amountPaid: 60,
      requestId: crypto.randomUUID(),
    });
    expect(second).toMatchObject({
      status: "paid",
      amountPaid: 100,
      balanceDue: 0,
    });
    expect(
      await staff.invoice.markPaid({ id: inv.id, amountPaid: 40, requestId })
    ).toEqual(first);
    expect(
      await (await db.getDb())!
        .select()
        .from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, inv.id))
    ).toHaveLength(2);
  });
  it("concurrent partial receipts serialize without losing either amount", async () => {
    const inv = await staff.invoice.create({ taxRate: 0 });
    await staff.invoice.addLineItem({
      invoiceId: inv.id,
      description: "Work",
      quantity: 1,
      unitPrice: 100,
      taxable: false,
    });
    await Promise.all(
      [40, 60].map(amountPaid =>
        staff.invoice.markPaid({
          id: inv.id,
          amountPaid,
          requestId: crypto.randomUUID(),
        })
      )
    );
    expect(await db.getInvoiceById(inv.id)).toMatchObject({
      amountPaid: "100.00",
      balanceDue: "0.00",
      status: "paid",
    });
  });
  it("single and bulk inspection writes validate actual devices before changing any row", async () => {
    await expect(
      staff.inspectionResult.upsert({
        jobId: A.job.id,
        deviceId: B.device.id,
        result: "pass",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.inspectionResult.bulkMarkPass({
        jobId: A.job.id,
        deviceIds: [A.device.id, sibling.device.id],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.inspectionResult.upsert({
        jobId: A.job.id,
        deviceId: 9999999,
        result: "pass",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await db.getInspectionResultsByJob(A.job.id)).toHaveLength(0);
  });
  it("JSON-round-tripped dates sync; malformed/mixed batches reject atomically without assignment gates", async () => {
    const tech = appRouter.createCaller(
      context("technician", A.company.id, null, userId)
    );
    const testedAt = new Date("2026-10-01T10:11:12.000Z");
    const captured = JSON.parse(
      JSON.stringify({
        jobId: A.job.id,
        deviceId: A.device.id,
        result: "pass",
        testedAt,
      })
    );
    await expect(
      tech.inspectionResult.syncBatch({
        results: [captured, { ...captured, deviceId: sibling.device.id }],
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.getInspectionResultsByJob(A.job.id)).toHaveLength(0);
    await expect(
      tech.inspectionResult.syncBatch({
        results: [{ ...captured, testedAt: "not-a-date" }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await tech.inspectionResult.syncBatch({ results: [captured] })
    ).toEqual({ synced: 1 });
    expect(
      (
        await db.getInspectionResultByJobAndDevice(A.job.id, A.device.id)
      )?.testedAt?.toISOString()
    ).toBe(testedAt.toISOString());
  });
  it("audited helpers share the transaction and roll back when the callback fails", async () => {
    const ctx = context("office", A.company.id, null, userId);
    await expect(
      db.withAudit(ctx, "audit.rollback", async tx => {
        expect(await db.getDb()).toBe(tx);
        const [variables] = await tx.execute(
          sql`SELECT @audit_actor AS actor, @audit_procedure AS procedureName, @audit_request_id AS requestId`
        );
        expect((variables as any)[0]).toMatchObject({
          actor: userId,
          procedureName: "audit.rollback",
          requestId: "audit-fixture",
        });
        await db.updateJob(A.job.id, { officeNotes: "should roll back" });
        throw new Error("rollback fixture");
      })
    ).rejects.toThrow("rollback fixture");
    expect((await db.getJobById(A.job.id))?.officeNotes).toBe(
      "private office notes"
    );
  });
  it("attachment canonical parent/link checks precede blob storage; customers see only public attachments", async () => {
    const input = {
      entityType: "job" as const,
      entityId: A.job.id,
      fileName: "fixture.txt",
      fileData: "aGVsbG8=",
      mimeType: "text/plain",
    };
    vi.mocked(storagePut).mockClear();
    for (const bad of [
      { ...input, siteId: B.site.id },
      { ...input, entityId: B.job.id },
      { ...input, entityId: 9999999 },
    ])
      await expect(staff.attachment.upload(bad)).rejects.toBeDefined();
    expect(storagePut).not.toHaveBeenCalled();
    const att = await staff.attachment.upload(input);
    expect(att).toMatchObject({ id: expect.any(Number) });
    await db.updateAttachment(att.id, { isCustomerFacing: 0 });
    expect(
      await customer.attachment.listByJob({ jobId: A.job.id })
    ).toHaveLength(0);
    await db.updateAttachment(att.id, { isCustomerFacing: 1 });
    expect(
      await customer.attachment.listByJob({ jobId: A.job.id })
    ).toHaveLength(1);
    await expect(
      customer.attachment.listByJob({ jobId: sibling.job.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.attachment.linkToEntities({ id: att.id, siteId: B.site.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.getAttachmentById(att.id))?.siteId).toBe(A.site.id);
  });
  it("fire-alarm saves check system/site/item and preserve question snapshots on update", async () => {
    const system = await staff.fireAlarm.upsertSystem({ siteId: A.site.id });
    const foreign = await appRouter
      .createCaller(context("office", B.company.id))
      .fireAlarm.upsertSystem({ siteId: B.site.id });
    const database = (await db.getDb())!;
    const [item] = await database
      .insert(fireAlarmChecklistTemplates)
      .values({
        sectionName: "Fixture section",
        sectionOrder: 999,
        itemLetter: "A",
        itemDescription: "Original audit question",
        inputType: "checkbox",
        isActive: true,
        effectiveDate: new Date("2026-01-01"),
      })
      .$returningId();
    const input = {
      jobId: A.job.id,
      fireAlarmSystemId: system.id,
      checklistItemId: item.id,
      result: "pass" as const,
    };
    await expect(
      staff.fireAlarm.saveInspectionResult({
        ...input,
        fireAlarmSystemId: foreign.id,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      staff.fireAlarm.saveInspectionResult({
        ...input,
        checklistItemId: 9999999,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const first = await staff.fireAlarm.saveInspectionResult(input);
    await database
      .update(fireAlarmChecklistTemplates)
      .set({ itemDescription: "Changed live template" })
      .where(eq(fireAlarmChecklistTemplates.id, item.id));
    expect(
      (await staff.fireAlarm.saveInspectionResult({ ...input, result: "fail" }))
        .id
    ).toBe(first.id);
    const [saved] = await database
      .select()
      .from(fireAlarmInspectionResults)
      .where(eq(fireAlarmInspectionResults.id, first.id));
    expect(saved.itemSnapshot).toMatchObject({
      itemDescription: "Original audit question",
    });
    expect(saved.technicianCertificationSnapshot).toMatchObject({
      name: "Audit fixture",
    });
  });
});
