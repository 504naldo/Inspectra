import { z } from "zod";
import { router, protectedProcedure, technicianProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  fireAlarmFormHeader,
  fireAlarmAttendanceLog,
  fireAlarmAncillaryCircuits,
} from "../../drizzle/schema";
import { eq, asc } from "drizzle-orm";

export const fireAlarmFormRouter = router({
  // ─── Header (cover page) ──────────────────────────────────────────────────

  getHeader: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
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
        sectionHeaderValues: z.record(z.record(z.string())).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      const { jobId, ...fields } = input;

      const existing = await db
        .select({ id: fireAlarmFormHeader.id })
        .from(fireAlarmFormHeader)
        .where(eq(fireAlarmFormHeader.jobId, jobId))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(fireAlarmFormHeader)
          .set(fields as any)
          .where(eq(fireAlarmFormHeader.jobId, jobId));
      } else {
        await db.insert(fireAlarmFormHeader).values({ jobId, ...fields } as any);
      }
      return { success: true };
    }),

  // ─── Attendance Log ───────────────────────────────────────────────────────

  getAttendanceLog: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      const { id, ...fields } = input;
      if (id) {
        await db
          .update(fireAlarmAttendanceLog)
          .set(fields as any)
          .where(eq(fireAlarmAttendanceLog.id, id));
        return { id };
      } else {
        const result = await db.insert(fireAlarmAttendanceLog).values(fields as any);
        return { id: Number((result as any)[0].insertId) };
      }
    }),

  deleteAttendanceRow: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db
        .delete(fireAlarmAttendanceLog)
        .where(eq(fireAlarmAttendanceLog.id, input.id));
      return { success: true };
    }),

  // ─── Ancillary Circuits (Section 12) ─────────────────────────────────────

  getAncillaryCircuits: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
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
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      const { id, ...fields } = input;
      if (id) {
        await db
          .update(fireAlarmAncillaryCircuits)
          .set(fields as any)
          .where(eq(fireAlarmAncillaryCircuits.id, id));
        return { id };
      } else {
        const result = await db.insert(fireAlarmAncillaryCircuits).values(fields as any);
        return { id: Number((result as any)[0].insertId) };
      }
    }),

  deleteAncillaryCircuit: technicianProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return;
      await db
        .delete(fireAlarmAncillaryCircuits)
        .where(eq(fireAlarmAncillaryCircuits.id, input.id));
      return { success: true };
    }),
});
