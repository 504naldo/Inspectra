/**
 * offlineSyncIdempotency.test.ts — Part 11 offline-sync safeguards.
 *
 * A replayed offline "create deficiency" (same client localId / idempotencyKey)
 * must not create a duplicate server record, and a technician can only sync to a
 * job in their own company.
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
  return { company, job, caller: appRouter.createCaller(techCtx(company.id)) };
}

describe("Offline sync — deficiency create idempotency & authorization", () => {
  let A: Awaited<ReturnType<typeof tenant>>, B: Awaited<ReturnType<typeof tenant>>;
  beforeAll(async () => { A = await tenant("A"); B = await tenant("B"); });

  it("replaying the same idempotencyKey returns the same record (no duplicate)", async () => {
    const key = "offline-local-123";
    const first = await A.caller.deficiency.create({ jobId: A.job.id, title: "Blocked exit", idempotencyKey: key });
    const second = await A.caller.deficiency.create({ jobId: A.job.id, title: "Blocked exit", idempotencyKey: key });
    expect(second.id).toBe(first.id);
    const all = await db.getDeficienciesByJob(A.job.id);
    expect(all.filter((d) => d.idempotencyKey === key).length).toBe(1);
  });

  it("different keys create different records", async () => {
    const a = await A.caller.deficiency.create({ jobId: A.job.id, title: "X", idempotencyKey: "k-a" });
    const b = await A.caller.deficiency.create({ jobId: A.job.id, title: "Y", idempotencyKey: "k-b" });
    expect(a.id).not.toBe(b.id);
  });

  it("without a key it always creates (backward compatible)", async () => {
    const a = await A.caller.deficiency.create({ jobId: A.job.id, title: "Z" });
    const b = await A.caller.deficiency.create({ jobId: A.job.id, title: "Z" });
    expect(a.id).not.toBe(b.id);
  });

  it("rejects syncing a deficiency to another company's job", async () => {
    await expect(
      B.caller.deficiency.create({ jobId: A.job.id, title: "cross", idempotencyKey: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a key from a different job does not collide (find-or-create checks the job)", async () => {
    const key = "shared-key";
    const onA = await A.caller.deficiency.create({ jobId: A.job.id, title: "onA", idempotencyKey: key });
    // Same key, different job in the SAME company → must create a new record, not return onA.
    const job2 = await db.createJob({ companyId: A.company.id, siteId: A.job.siteId, customerOrgId: A.job.customerOrgId, jobNumber: "J-A2", title: "Job A2" } as any);
    const onA2 = await A.caller.deficiency.create({ jobId: job2.id, title: "onA2", idempotencyKey: key });
    expect(onA2.id).not.toBe(onA.id);
  });
});
