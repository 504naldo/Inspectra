/**
 * PR-18's four remaining id-addressed procedures. Requires disposable MySQL
 * initialized with drizzle-kit migrate, exactly as CI initializes its database.
 * Real rows verify denied writes leave both existing and absent children unchanged.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as db from "./db";
import { appRouter } from "./routers";
import { fireAlarmSystems, users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

type Role = NonNullable<TrpcContext["user"]>["role"];

function callerFor(role: Role, companyId: number | null, customerOrgId: number | null = null, userId = 1) {
  return appRouter.createCaller({
    user: { id: userId, openId: `pr18-${userId}`, email: "pr18@example.com", name: "PR-18",
      role, companyId, customerOrgId, createdAt: new Date(), updatedAt: new Date() },
    req: { headers: {}, ip: "127.0.0.1" }, res: { setHeader() {}, clearCookie() {} },
    requestId: "pr18", ip: "127.0.0.1", userAgent: "vitest",
  } as unknown as TrpcContext);
}

async function tenant(tag: string) {
  const company = await db.createCompany({ name: `PR18 ${tag}` });
  const org = await db.createCustomerOrg({ companyId: company.id, name: `PR18 org ${tag}` });
  const site = await db.createSite({ companyId: company.id, customerOrgId: org.id, name: `PR18 site ${tag}` });
  const job = await db.createJob({ companyId: company.id, customerOrgId: org.id, siteId: site.id,
    jobNumber: `PR18-${tag}`, title: `PR18 job ${tag}` });
  return { company, org, site, job };
}

type Tenant = Awaited<ReturnType<typeof tenant>>;
const MISSING = 9_999_999;

describe("PR-18 — parent access before child reads and writes", () => {
  let A: Tenant, B: Tenant, sibling: { siteId: number; jobId: number };
  let technicianId: number, leadId: number, assistId: number, systemId: number;

  beforeAll(async () => {
    A = await tenant("A");
    B = await tenant("B");
    const org = await db.createCustomerOrg({ companyId: A.company.id, name: "PR18 other org in A" });
    const site = await db.createSite({ companyId: A.company.id, customerOrgId: org.id, name: "PR18 sibling site" });
    const job = await db.createJob({ companyId: A.company.id, customerOrgId: org.id, siteId: site.id,
      jobNumber: "PR18-sibling", title: "PR18 sibling job" });
    sibling = { siteId: site.id, jobId: job.id };

    const database = (await db.getDb())!;
    const techs = await database.insert(users).values(["writer", "lead", "assist"].map(tag => ({
      companyId: A.company.id, role: "technician" as const, isActive: 1,
      openId: `pr18-${tag}`, name: `PR18 ${tag}`, email: `pr18-${tag}@example.com`,
    }))).$returningId();
    [technicianId, leadId, assistId] = techs.map(t => t.id);
    await db.updateJob(A.job.id, { leadTechnicianId: leadId, finalizedAt: new Date(), status: "completed" });
    await db.addJobAssignment({ jobId: A.job.id, userId: assistId, role: "ASSIST", assignedByUserId: leadId });
    systemId = (await callerFor("office", A.company.id).fireAlarm.upsertSystem({
      siteId: A.site.id, manufacturer: "PR18 original",
    })).id;
  });

  async function systemsFor(siteId: number) {
    return (await db.getDb())!.select().from(fireAlarmSystems).where(eq(fireAlarmSystems.siteId, siteId));
  }

  async function emptySite(tag: string, owner = A) {
    return db.createSite({ companyId: owner.company.id, customerOrgId: owner.org.id, name: `PR18 ${tag}` });
  }

  it.each(["office", "technician"] as const)("%s can read its company's system and job technicians without an assignment", async role => {
    const caller = callerFor(role, A.company.id, null, technicianId);
    expect(await db.isUserAssignedToJob(A.job.id, technicianId)).toBe(false);
    expect(await caller.fireAlarm.getSystemBySite({ siteId: A.site.id })).toMatchObject({ id: systemId });
    expect(await caller.job.getJobTechnicians({ jobId: A.job.id })).toEqual({
      lead: { id: leadId, name: "PR18 lead", email: "pr18-lead@example.com" },
      additional: [{ id: assistId, name: "PR18 assist", email: "pr18-assist@example.com" }],
    });
  });

  it.each(["office", "technician"] as const)("%s cannot read another company's system or job technicians", async role => {
    const caller = callerFor(role, B.company.id);
    await expect(caller.fireAlarm.getSystemBySite({ siteId: A.site.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.job.getJobTechnicians({ jobId: A.job.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["office", "technician"] as const)("%s can insert and then update its company's system", async role => {
    const site = await emptySite(`${role} insert`);
    const caller = callerFor(role, A.company.id, null, technicianId);
    const inserted = await caller.fireAlarm.upsertSystem({ siteId: site.id, manufacturer: "Inserted" });
    const updated = await caller.fireAlarm.upsertSystem({ siteId: site.id, manufacturer: "Updated", connectedToMonitoring: true });
    expect(updated).toEqual(inserted);
    expect(await systemsFor(site.id)).toMatchObject([{ id: inserted.id, siteId: site.id, manufacturer: "Updated", connectedToMonitoring: true }]);
  });

  it.each(["office", "technician"] as const)("%s denied cross-company insert/update leave rows unchanged", async role => {
    const site = await emptySite(`${role} denied insert`);
    const before = await systemsFor(A.site.id);
    const caller = callerFor(role, B.company.id);
    await expect(caller.fireAlarm.upsertSystem({ siteId: site.id, manufacturer: "Unauthorized insert" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await systemsFor(site.id)).toEqual([]);
    await expect(caller.fireAlarm.upsertSystem({ siteId: A.site.id, manufacturer: "Unauthorized update" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await systemsFor(A.site.id)).toEqual(before);
  });

  it.each(["linked company", "null company"] as const)("customer with %s may read its own organization's system and job technicians", async binding => {
    const caller = callerFor("customer", binding === "null company" ? null : A.company.id, A.org.id);
    expect(await caller.fireAlarm.getSystemBySite({ siteId: A.site.id })).toMatchObject({ id: systemId });
    expect(await caller.job.getJobTechnicians({ jobId: A.job.id })).toMatchObject({ lead: { id: leadId }, additional: [{ id: assistId }] });
    const site = await emptySite(`customer ${binding} no system`);
    expect(await caller.fireAlarm.getSystemBySite({ siteId: site.id })).toBeNull();
  });

  it.each(["linked company", "null company"] as const)("customer with %s cannot read a sibling organization or foreign company", async binding => {
    const caller = callerFor("customer", binding === "null company" ? null : A.company.id, A.org.id);
    for (const target of [sibling, { siteId: B.site.id, jobId: B.job.id }]) {
      await expect(caller.fireAlarm.getSystemBySite({ siteId: target.siteId })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(caller.job.getJobTechnicians({ jobId: target.jobId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it.each(["linked company", "null company"] as const)("customer with %s cannot insert or update even its own organization's system", async binding => {
    const caller = callerFor("customer", binding === "null company" ? null : A.company.id, A.org.id);
    const site = await emptySite(`customer ${binding} denied insert`);
    const before = await systemsFor(A.site.id);
    await expect(caller.fireAlarm.upsertSystem({ siteId: site.id, manufacturer: "Customer insert" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await systemsFor(site.id)).toEqual([]);
    await expect(caller.fireAlarm.upsertSystem({ siteId: A.site.id, manufacturer: "Customer update" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await systemsFor(A.site.id)).toEqual(before);
  });

  it("a customer with no organization cannot read child data", async () => {
    const caller = callerFor("customer", A.company.id);
    await expect(caller.fireAlarm.getSystemBySite({ siteId: A.site.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.job.getJobTechnicians({ jobId: A.job.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["office", "technician", "customer", "admin"] as const)("%s gets NOT_FOUND for missing parents, and cannot create an orphan system", async role => {
    const caller = callerFor(role, role === "customer" || role === "admin" ? null : A.company.id, A.org.id);
    await expect(caller.fireAlarm.getSystemBySite({ siteId: MISSING })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.job.getJobTechnicians({ jobId: MISSING })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.fireAlarm.upsertSystem({ siteId: MISSING })).rejects.toMatchObject({ code: role === "customer" ? "FORBIDDEN" : "NOT_FOUND" });
    expect(await systemsFor(MISSING)).toEqual([]);
  });

  it("an existing site without a system returns null; a missing site is NOT_FOUND", async () => {
    const site = await emptySite("no system");
    const caller = callerFor("office", A.company.id);
    expect(await caller.fireAlarm.getSystemBySite({ siteId: site.id })).toBeNull();
    await expect(caller.fireAlarm.getSystemBySite({ siteId: MISSING })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("office may read its site's last inspection summary but not another company's", async () => {
    const caller = callerFor("office", A.company.id);
    expect(await caller.site.getLastInspectionSummary({ siteId: A.site.id })).toMatchObject({ found: true, jobId: A.job.id, deviceCount: 0 });
    await expect(callerFor("office", B.company.id).site.getLastInspectionSummary({ siteId: A.site.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.site.getLastInspectionSummary({ siteId: MISSING })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await caller.site.getLastInspectionSummary({ siteId: sibling.siteId })).toEqual({ found: false });
  });

  it.each(["technician", "customer"] as const)("%s cannot read inspection summaries, even for its own company/organization", async role => {
    const caller = callerFor(role, role === "customer" ? null : A.company.id, A.org.id);
    await expect(caller.site.getLastInspectionSummary({ siteId: A.site.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["foreign company", "null company"] as const)("platform admin with %s retains cross-company reads, inserts and updates", async binding => {
    const caller = callerFor("admin", binding === "null company" ? null : B.company.id);
    expect(await caller.fireAlarm.getSystemBySite({ siteId: A.site.id })).toMatchObject({ id: systemId });
    expect(await caller.job.getJobTechnicians({ jobId: A.job.id })).toMatchObject({ lead: { id: leadId } });
    expect(await caller.site.getLastInspectionSummary({ siteId: A.site.id })).toMatchObject({ found: true, jobId: A.job.id });
    await expect(caller.site.getLastInspectionSummary({ siteId: MISSING })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const site = await emptySite(`admin ${binding} insert`);
    const inserted = await caller.fireAlarm.upsertSystem({ siteId: site.id, manufacturer: "Admin insert" });
    expect(await systemsFor(site.id)).toMatchObject([{ id: inserted.id, siteId: site.id, manufacturer: "Admin insert" }]);
    const updated = await caller.fireAlarm.upsertSystem({ siteId: A.site.id, manufacturer: "Admin update" });
    expect(updated.id).toBe(systemId);
    expect(await systemsFor(A.site.id)).toMatchObject([{ id: systemId, siteId: A.site.id, manufacturer: "Admin update" }]);
  });

  it("a reassigned technician can still read job technicians and insert/update captured system details", async () => {
    const site = await emptySite("reassigned technician");
    const job = await db.createJob({ companyId: A.company.id, customerOrgId: A.org.id, siteId: site.id,
      jobNumber: "PR18-reassigned", title: "PR18 reassignment" });
    await db.addJobAssignment({ jobId: job.id, userId: technicianId, role: "ASSIST", assignedByUserId: leadId });
    expect(await db.isUserAssignedToJob(job.id, technicianId)).toBe(true);
    await db.removeJobAssignment(job.id, technicianId);
    expect(await db.isUserAssignedToJob(job.id, technicianId)).toBe(false);
    const caller = callerFor("technician", A.company.id, null, technicianId);
    expect(await caller.job.getJobTechnicians({ jobId: job.id })).toEqual({ lead: null, additional: [] });
    const inserted = await caller.fireAlarm.upsertSystem({ siteId: site.id, manufacturer: "Offline insert" });
    const updated = await caller.fireAlarm.upsertSystem({ siteId: site.id, manufacturer: "Offline update" });
    expect(updated.id).toBe(inserted.id);
    expect(await caller.fireAlarm.getSystemBySite({ siteId: site.id })).toMatchObject({ id: inserted.id, manufacturer: "Offline update" });
  });
});
