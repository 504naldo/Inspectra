import * as db from "./db";
import type { Db } from "./db/client";
import type { TrpcContext } from "./_core/context";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { jobs } from "../drizzle/schema";

/** Read and publish one coherent report snapshot; finalized jobs remain readable. */
export async function withReportJob<T>(
  ctx: TrpcContext,
  procedure: string,
  jobId: number,
  generate: (job: Awaited<ReturnType<typeof db.assertJobCompany>>, transaction: Db) => Promise<T>,
): Promise<T> {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  await db.assertJobCompany(jobId, ctx.user.companyId!);
  return db.withAudit(ctx, procedure, async transaction => {
    const [locked] = await transaction.select().from(jobs).where(eq(jobs.id, jobId)).for("update");
    if (!locked) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
    const job = await db.assertJobCompany(jobId, ctx.user!.companyId!);
    return generate(job, transaction);
  });
}

/** The first transactional read locks the seal parent before a snapshot exists. */
export async function withMutableJob<T>(
  ctx: TrpcContext,
  procedure: string,
  jobId: number,
  write: (
    job: Awaited<ReturnType<typeof db.assertJobCompany>>,
    transaction: Db
  ) => Promise<T>
): Promise<T> {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  await db.assertJobCompany(jobId, ctx.user.companyId!);
  return db.withAudit(ctx, procedure, async transaction => {
    await db.assertJobNotFinalized(jobId, transaction);
    const job = await db.assertJobCompany(jobId, ctx.user!.companyId!);
    return write(job, transaction);
  });
}
