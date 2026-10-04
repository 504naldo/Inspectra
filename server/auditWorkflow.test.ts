import { beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import * as db from "./db";
import { appRouter } from "./routers";
import { buildEventBody } from "./routers/calendarRouter";
import { jobs, reports } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
vi.mock("./_core/googleAuth", () => ({
  getValidGoogleToken: vi.fn(async () => "fixture-google-token"),
}));
vi.mock("./storage", () => ({
  storageGet: vi.fn(async key => ({ url: `https://fixture.test/${key}` })),
  storageGetDownload: vi.fn(),
  storagePut: vi.fn(),
}));
function context(companyId: number, id: number) {
  return {
    user: {
      id,
      openId: `workflow-${id}`,
      role: "office",
      companyId,
      customerOrgId: null,
      name: "Fixture",
    },
    req: { headers: {} },
    res: { setHeader() {} },
    requestId: "workflow",
    ipAddress: "127.0.0.1",
    userAgent: "vitest",
  } as unknown as TrpcContext;
}
afterEach(() => vi.unstubAllGlobals());
describe("Audit QA and Calendar workflows — disposable MySQL, fake Calendar", () => {
  let companyId: number, siteId: number, orgId: number;
  let office: ReturnType<typeof appRouter.createCaller>;
  beforeAll(async () => {
    companyId = (await db.createCompany({ name: "Workflow fixture" })).id;
    orgId = (await db.createCustomerOrg({ companyId, name: "Workflow org" }))
      .id;
    siteId = (
      await db.createSite({
        companyId,
        customerOrgId: orgId,
        name: "Workflow site",
      })
    ).id;
    office = appRouter.createCaller(context(companyId, 7));
  });
  async function job(extra: Record<string, unknown> = {}) {
    return db.createJob({
      companyId,
      siteId,
      customerOrgId: orgId,
      jobNumber: `WF-${crypto.randomUUID().slice(0, 8)}`,
      title: "Workflow",
      ...extra,
    });
  }
  it("an older unreported job remains discoverable behind 50 newer reported jobs; counts do not depend on the tab", async () => {
    const database = (await db.getDb())!,
      oldest = await job({
        status: "completed",
        completedAt: new Date("2026-01-01"),
      });
    const newer = await database
      .insert(jobs)
      .values(
        Array.from({ length: 50 }, (_, i) => ({
          companyId,
          siteId,
          customerOrgId: orgId,
          jobNumber: `WF-new-${i}`,
          title: "Already reported",
          status: "completed" as const,
          completedAt: new Date("2026-02-01"),
        }))
      )
      .$returningId();
    await database
      .insert(reports)
      .values(
        newer.map(row => ({
          jobId: row.id,
          generatedById: 7,
          reportNumber: `WF-R-${row.id}`,
          title: "Generated",
          status: "generated" as const,
        }))
      );
    const all = await office.reportQa.listQueue({ filter: "all", limit: 100 });
    const generated = await office.reportQa.listQueue({
      filter: "generated",
      limit: 100,
    });
    expect(all.items.some(item => item.jobId === oldest.id)).toBe(true);
    expect(all.counts.field_complete).toBe(1);
    expect(generated.counts.field_complete).toBe(1);
  });
  it("both approval entry points honor the company reports.approve denial", async () => {
    const parent = await job();
    const report = await db.createReport({
      jobId: parent.id,
      generatedById: 7,
      reportNumber: "WF-denied",
      title: "Approval fixture",
      status: "generated",
    });
    await db.setRolePermissionOverride({
      companyId,
      role: "office",
      permission: "reports.approve",
      allowed: false,
    });
    await expect(
      office.report.update({ id: report.id, status: "approved" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      office.reportQa.approveReport({ reportId: report.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.getReportById(report.id))?.status).toBe("generated");
  });
  it("office can run QA while missing canonical annual evidence is explicitly flagged", async () => {
    const parent = await job();
    expect(
      (await office.ai.runQACheck({ jobId: parent.id })).issues.join(" ")
    ).toMatch(/checklist/);
  });
  it.each([
    ["2026-10-01T18:00:00Z", "2026-10-01T19:30:00Z"],
    ["2026-11-01T05:30:00Z", "2026-11-01T07:30:00Z"],
  ])(
    "Calendar preserves actual UTC schedule instants including DST windows (%s)",
    async (start, end) => {
      const parent = await job({
        scheduledStartAt: new Date(start),
        scheduledEndAt: new Date(end),
      });
      const event = await buildEventBody(parent.id);
      expect(event.start).toEqual({
        dateTime: new Date(start).toISOString(),
        timeZone: "America/Toronto",
      });
      expect(event.end.dateTime).toBe(new Date(end).toISOString());
    }
  );
  it("date-only jobs require an explicit schedule instead of inventing a visit time", async () => {
    const parent = await job({ scheduledDate: new Date("2026-10-01") });
    await expect(buildEventBody(parent.id)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
  it("Bob cannot update/delete Alice's event or clear its pointer", async () => {
    const parent = await job({
      scheduledStartAt: new Date("2026-10-01T18:00:00Z"),
      scheduledEndAt: new Date("2026-10-01T19:30:00Z"),
    });
    const provider = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "alice-event",
            htmlLink: "https://calendar.test/event",
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", provider);
    await office.calendar.createEvent({ jobId: parent.id });
    expect(await db.getJobById(parent.id)).toMatchObject({
      googleCalendarEventId: "alice-event",
      googleCalendarOwnerId: 7,
      googleCalendarId: "primary",
    });
    const bob = appRouter.createCaller(context(companyId, 8));
    provider.mockClear();
    await expect(
      bob.calendar.updateEvent({ jobId: parent.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      bob.calendar.deleteEvent({ jobId: parent.id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(provider).not.toHaveBeenCalled();
    expect((await db.getJobById(parent.id))?.googleCalendarEventId).toBe(
      "alice-event"
    );
    await office.calendar.deleteEvent({ jobId: parent.id });
    expect(provider.mock.calls[0][0]).toContain(
      "/calendars/primary/events/alice-event"
    );
  });
});
