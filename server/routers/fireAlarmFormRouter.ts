import { withMutableJob } from "../jobWriteTransaction";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, technicianProcedure } from "../_core/trpc";
import { getDb, assertJobCompany } from "../db";
import {
  fireAlarmFormHeader,
  fireAlarmAttendanceLog,
  fireAlarmAncillaryCircuits,
} from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";

async function deleteFormRow(
  ctx: import("../_core/context").TrpcContext,
  table: typeof fireAlarmAttendanceLog | typeof fireAlarmAncillaryCircuits,
  id: number,
  label: string,
) {
  const database = await getDb();
  if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [parent] = await database.select({ jobId: table.jobId }).from(table).where(eq(table.id, id)).limit(1);
  if (!parent) throw new TRPCError({ code: "NOT_FOUND", message: `${label} not found` });
  return withMutableJob(ctx, `fireAlarmForm.delete${label.replace(/\s/g, "")}`, parent.jobId, async (_job, transaction) => {
    const [current] = await transaction.select({ jobId: table.jobId }).from(table).where(eq(table.id, id)).limit(1);
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: `${label} not found` });
    if (current.jobId !== parent.jobId) throw new TRPCError({ code: "CONFLICT", message: "Form row parent changed; reload before deleting" });
    await transaction.delete(table).where(eq(table.id, id));
    return { success: true };
  });
}

// These three tables carry only `jobId` (no `companyId`), so every procedure
// must scope through the parent job with `assertJobCompany` before reading or
// writing — otherwise a technician can address another company's fire-alarm
// form by passing its jobId / row id (see FABLE_APPLICATION_AUDIT FAB-09).
// Mutations additionally assert the job is not finalized (finalized jobs are
// immutable), and id-addressed writes/deletes verify the row belongs to the
// scoped job so a valid-jobId caller can't reach a foreign row by id.

export const fireAlarmFormRouter = router({
  // ─── Header (cover page) ──────────────────────────────────────────────────

  getHeader: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;
      await assertJobCompany(input.jobId, ctx.user.companyId!);
      const rows = await db
        .select()
        .from(fireAlarmFormHeader)
        .where(eq(fireAlarmFormHeader.jobId, input.jobId))
        .limit(1);
      return rows[0] ?? null;
    }),

  upsertHeader: technicianProcedure
    .input(
      z.object({
        jobId: z.number(),
        inspectionDate: z.string().optional(),
        systemManufacturer: z.string().optional(),
        systemModel: z.string().optional(),
        systemSerialNo: z.string().optional(),
        systemInstallYear: z.string().optional(),
        operationType: z.string().optional(),
        connectedToFSRC: z.boolean().optional(),
        fsrcName: z.string().optional(),
        fsrcPhone: z.string().optional(),
        fsrcAccountNo: z.string().optional(),
        techName: z.string().optional(),
        techCertNo: z.string().optional(),
        techCertLevel: z.string().optional(),
        techCompany: z.string().optional(),
        recommendations: z.string().optional(),
        sectionHeaderValues: z.record(z.string(), z.record(z.string(), z.string())).optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withMutableJob(ctx, "fireAlarmForm.upsertHeader", input.jobId, async (_job, db) => {
      const { jobId, ...fields } = input;

      const existing = await db
        .select()
        .from(fireAlarmFormHeader)
        .where(eq(fireAlarmFormHeader.jobId, jobId))
        .limit(1);

      if (input.sectionHeaderValues !== undefined || input.connectedToFSRC !== undefined) {
        const oldValues = existing[0]?.sectionHeaderValues ?? {};
        fields.sectionHeaderValues = {
          ...oldValues,
          ...input.sectionHeaderValues,
          _inspection_capture: {
            ...oldValues._inspection_capture,
            ...(input.connectedToFSRC !== undefined ? { connectedToFSRC: String(input.connectedToFSRC) } : {}),
          },
        };
      }

      if (existing.length > 0) {
        await db
          .update(fireAlarmFormHeader)
          .set(fields as any)
          .where(eq(fireAlarmFormHeader.jobId, jobId));
      } else {
        await db.insert(fireAlarmFormHeader).values({ jobId, ...fields } as any);
      }
      return { success: true };
    })),

  // ─── Attendance Log ───────────────────────────────────────────────────────

  getAttendanceLog: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      await assertJobCompany(input.jobId, ctx.user.companyId!);
      return db
        .select()
        .from(fireAlarmAttendanceLog)
        .where(eq(fireAlarmAttendanceLog.jobId, input.jobId))
        .orderBy(asc(fireAlarmAttendanceLog.rowOrder), asc(fireAlarmAttendanceLog.id));
    }),

  upsertAttendanceRow: technicianProcedure
    .input(
      z.object({
        id: z.number().optional(),
        jobId: z.number(),
        rowOrder: z.number().optional(),
        techName: z.string().optional(),
        certNo: z.string().optional(),
        attendanceDate: z.string().optional(),
        timeIn: z.string().optional(),
        timeOut: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withMutableJob(ctx, "fireAlarmForm.upsertAttendanceRow", input.jobId, async (_job, db) => {
      const { id, ...fields } = input;
      if (id) {
        // The target row must belong to the scoped job — reject cross-job/tenant ids.
        const existing = await db
          .select({ jobId: fireAlarmAttendanceLog.jobId })
          .from(fireAlarmAttendanceLog)
          .where(eq(fireAlarmAttendanceLog.id, id))
          .limit(1);
        if (!existing[0] || existing[0].jobId !== input.jobId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Attendance row not found", });
        }
        await db
          .update(fireAlarmAttendanceLog)
          .set(fields as any)
          .where(eq(fireAlarmAttendanceLog.id, id));
        return { id };
      } else {
        const result = await db.insert(fireAlarmAttendanceLog).values(fields as any);
        return { id: Number((result as any)[0].insertId) };
      }
    })
    ),

  deleteAttendanceRow: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input, ctx }) => deleteFormRow(ctx, fireAlarmAttendanceLog, input.id, "Attendance row")),

  // ─── Ancillary Circuits (Section 12) ─────────────────────────────────────

  getAncillaryCircuits: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      await assertJobCompany(input.jobId, ctx.user.companyId!);
      return db
        .select()
        .from(fireAlarmAncillaryCircuits)
        .where(eq(fireAlarmAncillaryCircuits.jobId, input.jobId))
        .orderBy(asc(fireAlarmAncillaryCircuits.rowOrder), asc(fireAlarmAncillaryCircuits.id));
    }),

  upsertAncillaryCircuit: technicianProcedure
    .input(
      z.object({
        id: z.number().optional(),
        jobId: z.number(),
        rowOrder: z.number().optional(),
        circuitDescription: z.string().optional(),
        circuitType: z.string().optional(),
        poweredBy: z.string().optional(),
        operationConfirmed: z.enum(["yes", "no", "na"]).optional(),
        confirmationMethod: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      withMutableJob(ctx, "fireAlarmForm.upsertAncillaryCircuit", input.jobId, async (_job, db) => {
      const { id, ...fields } = input;
      if (id) {
        // The target row must belong to the scoped job — reject cross-job/tenant ids.
        const existing = await db
          .select({ jobId: fireAlarmAncillaryCircuits.jobId })
          .from(fireAlarmAncillaryCircuits)
          .where(eq(fireAlarmAncillaryCircuits.id, id))
          .limit(1);
        if (!existing[0] || existing[0].jobId !== input.jobId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Ancillary circuit not found", });
        }
        await db
          .update(fireAlarmAncillaryCircuits)
          .set(fields as any)
          .where(eq(fireAlarmAncillaryCircuits.id, id));
        return { id };
      } else {
        const result = await db.insert(fireAlarmAncillaryCircuits).values(fields as any);
        return { id: Number((result as any)[0].insertId) };
      }
    })
    ),

  deleteAncillaryCircuit: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input, ctx }) => deleteFormRow(ctx, fireAlarmAncillaryCircuits, input.id, "Ancillary circuit")),
});
