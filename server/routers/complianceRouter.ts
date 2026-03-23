import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminOrOfficeProcedure, protectedProcedure } from "../_core/trpc";
import * as db from "../db";
import { withAudit } from "../db";
import { finalizeJob } from "../compliance/finalizeJob";
import { buildFinalizationPayload, computeFinalizationHash } from "../compliance/hash";
import { FINALIZATION_HASH_MISMATCH } from "../../shared/_core/errors";

// ============================================================
// COMPLIANCE ROUTER
// ============================================================
const complianceRouter = router({
  /**
   * finalizeJob
   * Seals a job as immutable, computes a SHA-256 finalization hash,
   * and transitions status to 'completed'.
   * Requires: admin or lead technician role.
   * clientAssertsSynced must be true.
   */
  finalizeJob: protectedProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
        clientAssertsSynced: z.literal(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return withAudit(ctx, "compliance.finalizeJob", async (tx) => {
        return finalizeJob(
          { jobId: input.jobId, clientAssertsSynced: input.clientAssertsSynced },
          ctx,
          tx as unknown as import("drizzle-orm/mysql2").MySql2Database<typeof import("../../drizzle/schema")>
        );
      });
    }),

  /**
   * verifyJobHash
   * Recomputes the finalization hash for a completed job and compares
   * it to the stored value. Returns match status and any mismatch details.
   * Requires: admin role only (audit-sensitive operation).
   */
  verifyJobHash: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }

      const dbConn = await db.getDb();
      if (!dbConn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const { jobs: jobsTable } = await import("../../drizzle/schema");
      const { eq: eqOp } = await import("drizzle-orm");

      const jobRows = await dbConn
        .select({
          id: jobsTable.id,
          finalizationHash: jobsTable.finalizationHash,
          finalizedAt: jobsTable.finalizedAt,
          status: jobsTable.status,
        })
        .from(jobsTable)
        .where(eqOp(jobsTable.id, input.jobId));

      if (jobRows.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Job ${input.jobId} not found` });
      }

      const job = jobRows[0];

      if (!job.finalizationHash || !job.finalizedAt) {
        return {
          jobId: input.jobId,
          isFinalized: false,
          hashMatch: null,
          message: "Job has not been finalized",
        };
      }

      const payload = await buildFinalizationPayload(input.jobId, dbConn as unknown as import("drizzle-orm/mysql2").MySql2Database<typeof import("../../drizzle/schema")>);
      const recomputedHash = computeFinalizationHash(payload);
      const hashMatch = recomputedHash === job.finalizationHash;

      if (!hashMatch) {
        console.error(
          `[compliance.verifyJobHash] HASH MISMATCH for job ${input.jobId}. ` +
          `stored=${job.finalizationHash} recomputed=${recomputedHash}`
        );
      }

      return {
        jobId: input.jobId,
        isFinalized: true,
        hashMatch,
        storedHash: job.finalizationHash,
        recomputedHash,
        finalizedAt: job.finalizedAt,
        message: hashMatch
          ? "Hash verified — record integrity confirmed"
          : FINALIZATION_HASH_MISMATCH,
      };
    }),
});

export { complianceRouter };
