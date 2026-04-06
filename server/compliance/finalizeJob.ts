/**
 * compliance/finalizeJob.ts
 *
 * Finalization logic for immutable job sealing.
 *
 * Permission rules:
 *   - Requires adminOrOfficeProcedure (role = 'admin' or 'office')
 *   - Additionally: user must be admin OR user.id === job.leadTechnicianId
 *   - Customers can never finalize
 *
 * Status transition matrix:
 *   in_progress  → completed ✅
 *   pending      → block with JOB_NOT_IN_PROGRESS
 *   scheduled    → block with JOB_NOT_IN_PROGRESS
 *   completed    → block with JOB_ALREADY_FINALIZED
 *   cancelled    → block with JOB_CANCELLED_CANNOT_FINALIZE
 *
 * Sync assertion:
 *   - clientAssertsSynced must be true
 *   - Sets syncAssertedAt and syncAssertedById
 *   - Runs best-effort check for unsynced rows (warnings only, does not block)
 */

import { eq, isNull, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";
import type { TrpcContext } from "../_core/context";
import {
  JOB_FINALIZED_IMMUTABLE,
  JOB_NOT_IN_PROGRESS,
  JOB_ALREADY_FINALIZED,
  JOB_CANCELLED_CANNOT_FINALIZE,
  SYNC_ASSERTION_REQUIRED,
} from "../../shared/_core/errors";
import {
  buildFinalizationPayload,
  computeFinalizationHash,
} from "./hash";

export type FinalizeJobInput = {
  jobId: number;
  clientAssertsSynced: true;
};

export type FinalizeJobResult = {
  jobId: number;
  finalizedAt: Date;
  finalizationHash: string;
  warnings?: string[];
};

/**
 * finalizeJob
 *
 * Core finalization logic. Must be called inside a withAudit transaction.
 * The `db` parameter is the transactional DB client from withAudit.
 */
export async function finalizeJob(
  input: FinalizeJobInput,
  ctx: TrpcContext,
  db: MySql2Database<typeof schema>
): Promise<FinalizeJobResult> {
  const { jobId, clientAssertsSynced } = input;

  // 1. Sync assertion check
  if (!clientAssertsSynced) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: SYNC_ASSERTION_REQUIRED,
    });
  }

  // 2. Fetch job row (server-side re-verification, do not trust client)
  const jobRows = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));

  if (jobRows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: `Job ${jobId} not found` });
  }

  const job = jobRows[0];

  // 3. Permission check
  // ctx.user is guaranteed non-null by protectedProcedure + adminOrOfficeProcedure
  const user = ctx.user!;

  if (user.role === "customer") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Customers cannot finalize jobs",
    });
  }

  // Must be admin OR the lead technician on this job
  const isAdmin = user.role === "admin";
  const isLeadTech = job.leadTechnicianId !== null && job.leadTechnicianId === user.id;

  if (!isAdmin && !isLeadTech) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only admin or the lead technician can finalize this job",
    });
  }

  // 4. Status transition matrix
  if (job.finalizedAt !== null) {
    throw new TRPCError({
      code: "CONFLICT",
      message: JOB_FINALIZED_IMMUTABLE,
    });
  }

  if (job.status === "cancelled") {
    throw new TRPCError({
      code: "CONFLICT",
      message: JOB_CANCELLED_CANNOT_FINALIZE,
    });
  }

  if (job.status === "completed") {
    throw new TRPCError({
      code: "CONFLICT",
      message: JOB_ALREADY_FINALIZED,
    });
  }

  if (job.status === "pending" || job.status === "scheduled") {
    throw new TRPCError({
      code: "CONFLICT",
      message: JOB_NOT_IN_PROGRESS,
    });
  }

  // status must be 'in_progress' at this point

  // 5. Signature check — technician signature required before finalization
  if (!job.techSignatureUrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Technician signature is required before finalizing.",
    });
  }

  // 6. Sync assertion: set fields and run best-effort unsynced row check
  const now = new Date();
  const warnings: string[] = [];

  // Count unsynced inspection_results
  const unsyncedInspectionRows = await db
    .select({ id: schema.inspectionResults.id })
    .from(schema.inspectionResults)
    .where(
      and(
        eq(schema.inspectionResults.jobId, jobId),
        isNull(schema.inspectionResults.syncedAt)
      )
    );

  if (unsyncedInspectionRows.length > 0) {
    warnings.push(
      `${unsyncedInspectionRows.length} inspection_results rows have no syncedAt marker`
    );
  }

  // Count unsynced fire_alarm_inspection_results
  const unsyncedFireAlarmRows = await db
    .select({ id: schema.fireAlarmInspectionResults.id })
    .from(schema.fireAlarmInspectionResults)
    .where(
      and(
        eq(schema.fireAlarmInspectionResults.jobId, jobId),
        isNull(schema.fireAlarmInspectionResults.syncedAt)
      )
    );

  if (unsyncedFireAlarmRows.length > 0) {
    warnings.push(
      `${unsyncedFireAlarmRows.length} fire_alarm_inspection_results rows have no syncedAt marker`
    );
  }

  // 6. Build finalization payload and compute hash
  const payload = await buildFinalizationPayload(jobId, db);
  const finalizationHash = computeFinalizationHash(payload);

  // 7. Write finalization fields + status transition
  await db
    .update(schema.jobs)
    .set({
      status: "completed",
      finalizedAt: now,
      finalizedById: user.id,
      finalizationHash,
      syncAssertedAt: now,
      syncAssertedById: user.id,
      completedAt: now,
    })
    .where(eq(schema.jobs.id, jobId));

  return {
    jobId,
    finalizedAt: now,
    finalizationHash,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
