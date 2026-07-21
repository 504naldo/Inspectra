/**
 * offlineSyncSafeguards.test.ts — offline field-sync server safeguards.
 *
 * Complements offlineSyncIdempotency.test.ts. Verifies that every offline write
 * path a technician replays on reconnect is:
 *   • rejected when the job has since been FINALIZED (scenario: job finalized
 *     while offline), and
 *   • scoped to the caller's company (scenario: queue record pointing to another
 *     company's job) — the client never supplies the company id.
 *
 * Also documents the current authorization model for the "reassigned while
 * offline" scenario: writes are company-scoped, not assignment-scoped.
 *
 * Like the sibling suite, this needs a real MySQL (CI provisions mysql:8);
 * without DATABASE_URL the tenant() setup throws and the cases are skipped.
 */
import { describe, it, expect, beforeAll } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function techCtx(companyId: number, userId = 1): TrpcContext {
  return { user: { id: userId, openId: "t", email: "t@e.com", name: "T", role: "technician", companyId, createdAt: new Date(), updatedAt: new Date() },
    req: { headers: {}, ip: "127.0.0.1" }, res: { setHeader(){}, clearCookie(){} }, requestId: "t", ip: "127.0.0.1", ipAddress: "127.0.0.1", userAgent: "v" } as unknown as TrpcContext;
}

async function tenant(tag: string) {
  const company = await db.createCompany({ name: `Co ${tag}`, email: `${tag}@e.com` });
  const org = await db.createCustomerOrg({ companyId: company.id, name: `Org ${tag}` });
  const site = await db.createSite({ companyId: company.id, customerOrgId: org.id, name: `Site ${tag}` });
  const job = await db.createJob({ companyId: company.id, siteId: site.id, customerOrgId: org.id, jobNumber: `J-${tag}`, title: `Job ${tag}` } as any);
  return { company, site, job, caller: appRouter.createCaller(techCtx(company.id)) };
}

describe("Offline sync — finalized-job rejection across write paths", () => {
  let A: Awaited<ReturnType<typeof tenant>>;
  let finalizedJobId: number;

  beforeAll(async () => {
    A = await tenant("FIN");
    // A deficiency must exist (created while the job was open) so the media path
    // has a target; create it before finalizing.
    const def = await A.caller.deficiency.create({ jobId: A.job.id, title: "pre-finalize def" });
    (globalThis as any).__defId = def.id;
    // Finalize the job — simulates an office user finalizing while the tech was offline.
    await db.updateJob(A.job.id, { finalizedAt: new Date() } as any);
    finalizedJobId = A.job.id;
  });

  it("rejects a replayed device-test batch on a finalized job", async () => {
    await expect(
      A.caller.inspectionResult.syncBatch({ results: [{ jobId: finalizedJobId, deviceId: 1, result: "pass" }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a replayed checklist bulk-save on a finalized job", async () => {
    await expect(
      A.caller.checklist.bulkSaveResponses({
        responses: [{ jobId: finalizedJobId, sectionNumber: "1", itemId: "a", status: "PASS" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a replayed fire-alarm result on a finalized job", async () => {
    await expect(
      A.caller.fireAlarm.saveInspectionResult({
        jobId: finalizedJobId, fireAlarmSystemId: 1, checklistItemId: 1, result: "pass",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a replayed template response on a finalized job", async () => {
    await expect(
      A.caller.inspectionTemplate.saveResponse({
        jobId: finalizedJobId, templateId: 1, sectionId: 1, itemId: 1, responseValue: "ok",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a replayed deficiency create on a finalized job", async () => {
    await expect(
      A.caller.deficiency.create({ jobId: finalizedJobId, title: "late def", idempotencyKey: "late-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a replayed photo upload on a finalized job", async () => {
    await expect(
      A.caller.media.uploadDeficiencyMedia({
        deficiencyId: (globalThis as any).__defId,
        fileName: "p.jpg", mimeType: "image/jpeg", fileSize: 10, fileData: "AAAA",
        idempotencyKey: "late-photo-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("Offline sync — company scoping (no client-supplied company id)", () => {
  let A: Awaited<ReturnType<typeof tenant>>, B: Awaited<ReturnType<typeof tenant>>;
  beforeAll(async () => { A = await tenant("SC-A"); B = await tenant("SC-B"); });

  it("rejects a device-test batch replayed against another company's job", async () => {
    // B's technician (company id comes from ctx, not the payload) cannot write to A's job.
    await expect(
      B.caller.inspectionResult.syncBatch({ results: [{ jobId: A.job.id, deviceId: 1, result: "pass" }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a checklist bulk-save replayed against another company's job", async () => {
    await expect(
      B.caller.checklist.bulkSaveResponses({
        responses: [{ jobId: A.job.id, sectionNumber: "1", itemId: "a", status: "PASS" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("documents the model: a same-company write is NOT assignment-scoped", async () => {
    // "Reassigned while offline": a second job in the same company that this
    // technician was never added to job_assignments for. The write still
    // succeeds — writes are authorized by company + finalized state, not by the
    // assignment list. (Intentional current behavior; see the audit notes.)
    const job2 = await db.createJob({ companyId: A.company.id, siteId: A.site.id, customerOrgId: A.job.customerOrgId, jobNumber: "J-SC-A2", title: "A2" } as any);
    const created = await A.caller.deficiency.create({ jobId: job2.id, title: "unassigned-but-allowed" });
    expect(created.id).toBeTruthy();
  });
});
