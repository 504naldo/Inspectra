import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, officeProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import { logActivity } from "../activityLogger";
import { TIME_ENTRY_LABOUR_TYPES, TIME_ENTRY_STATUSES } from "../../drizzle/schema";

const LABOUR_TYPE_ENUM = z.enum(TIME_ENTRY_LABOUR_TYPES);
const STATUS_ENUM = z.enum(TIME_ENTRY_STATUSES);

const createInput = z.object({
  jobId: z.number().int().positive().optional(),
  workOrderId: z.number().int().positive().optional(),
  approvedWorkId: z.number().int().positive().optional(),
  siteId: z.number().int().positive().optional(),
  customerOrgId: z.number().int().positive().optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  durationMinutes: z.number().int().min(1).max(1440),
  labourType: LABOUR_TYPE_ENUM.default("inspection"),
  description: z.string().max(1000).default(""),
  internalNotes: z.string().optional(),
});

async function requireEntry(id: number, companyId: number) {
  const entry = await db.getTimeEntryById(id);
  if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
  if (entry.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return entry;
}

export const timeTrackingRouter = router({
  listMine: technicianProcedure
    .input(z.object({
      jobId: z.number().int().positive().optional(),
      workOrderId: z.number().int().positive().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      status: STATUS_ENUM.optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getTimeEntriesByUser(ctx.user.id, ctx.user.companyId, {
        jobId: input.jobId,
        from: input.from,
        to: input.to,
        status: input.status,
      });
    }),

  listCompany: officeProcedure
    .input(z.object({
      userId: z.number().int().positive().optional(),
      jobId: z.number().int().positive().optional(),
      workOrderId: z.number().int().positive().optional(),
      approvedWorkId: z.number().int().positive().optional(),
      status: STATUS_ENUM.optional(),
      labourType: LABOUR_TYPE_ENUM.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getTimeEntriesByCompany(ctx.user.companyId, {
        status: input.status,
        userId: input.userId,
        jobId: input.jobId,
        workOrderId: input.workOrderId,
        approvedWorkId: input.approvedWorkId,
        from: input.from,
        to: input.to,
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return requireEntry(input.id, ctx.user.companyId);
    }),

  create: technicianProcedure
    .input(createInput)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const id = await db.createTimeEntry({
        ...input,
        companyId: ctx.user.companyId,
        userId: ctx.user.id,
        status: "draft",
        entryDate: input.entryDate as any,
      });
      void logActivity({
        companyId: ctx.user.companyId,
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? "Technician",
        actorRole: ctx.user.role,
        entityType: "time_entry",
        entityId: id,
        eventType: "created",
        title: `Time entry created: ${input.durationMinutes} min (${input.labourType})`,
      } as any);
      return { id };
    }),

  update: technicianProcedure
    .input(z.object({
      id: z.number().int().positive(),
      durationMinutes: z.number().int().min(1).max(1440).optional(),
      labourType: LABOUR_TYPE_ENUM.optional(),
      description: z.string().max(1000).optional(),
      internalNotes: z.string().optional(),
      entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requireEntry(input.id, ctx.user.companyId);
      if (entry.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (entry.status !== "draft" && entry.status !== "rejected") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only edit draft or rejected entries." });
      }
      const { id, ...rest } = input;
      await db.updateTimeEntry(id, { ...rest, status: "draft" } as any);
      return { success: true };
    }),

  submit: technicianProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requireEntry(input.id, ctx.user.companyId);
      if (entry.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (entry.status !== "draft" && entry.status !== "rejected") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only submit draft or rejected entries." });
      }
      await db.updateTimeEntry(input.id, { status: "submitted" });
      void logActivity({
        companyId: ctx.user.companyId,
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? "Technician",
        actorRole: ctx.user.role,
        entityType: "time_entry",
        entityId: input.id,
        eventType: "submitted",
        title: `Time entry submitted for approval`,
      } as any);
      const dedupeKey = `time_submitted_${input.id}`;
      const exists = await db.hasUndismissedNotification(ctx.user.companyId, dedupeKey);
      if (!exists) {
        void db.createNotification({
          companyId: ctx.user.companyId,
          type: "time_entry_submitted",
          title: "Time Entry Submitted",
          message: `${ctx.user.name ?? "A technician"} submitted a time entry for approval (${entry.durationMinutes} min, ${entry.labourType})`,
          dedupeKey,
        });
      }
      return { success: true };
    }),

  approve: officeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requireEntry(input.id, ctx.user.companyId);
      if (entry.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only approve submitted entries." });
      }
      await db.updateTimeEntry(input.id, {
        status: "approved",
        approvedById: ctx.user.id,
        approvedAt: new Date(),
      });
      void logActivity({
        companyId: ctx.user.companyId,
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? "Office",
        actorRole: ctx.user.role,
        entityType: "time_entry",
        entityId: input.id,
        eventType: "approved",
        title: `Time entry approved`,
      } as any);
      return { success: true };
    }),

  reject: officeProcedure
    .input(z.object({ id: z.number().int().positive(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requireEntry(input.id, ctx.user.companyId);
      if (entry.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only reject submitted entries." });
      }
      await db.updateTimeEntry(input.id, {
        status: "rejected",
        internalNotes: input.reason
          ? `Rejected: ${input.reason}${entry.internalNotes ? `\n\n${entry.internalNotes}` : ""}`
          : entry.internalNotes ?? undefined,
      });
      void logActivity({
        companyId: ctx.user.companyId,
        actorUserId: ctx.user.id,
        actorName: ctx.user.name ?? "Office",
        actorRole: ctx.user.role,
        entityType: "time_entry",
        entityId: input.id,
        eventType: "rejected",
        title: `Time entry rejected${input.reason ? `: ${input.reason}` : ""}`,
      } as any);
      return { success: true };
    }),

  deleteDraft: technicianProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requireEntry(input.id, ctx.user.companyId);
      if (entry.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (entry.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only delete draft entries." });
      }
      await db.deleteTimeEntry(input.id);
      return { success: true };
    }),

  getSummary: officeProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.companyId) return null;
      const now = new Date();
      const day = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((day + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      return db.getTimesheetSummary(ctx.user.companyId, fmt(monday), fmt(sunday));
    }),

  getByJob: protectedProcedure
    .input(z.object({ jobId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getTimeEntriesByCompany(ctx.user.companyId, { jobId: input.jobId });
    }),

  getByWorkOrder: protectedProcedure
    .input(z.object({ workOrderId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getTimeEntriesByCompany(ctx.user.companyId, { workOrderId: input.workOrderId });
    }),

  getByApprovedWork: protectedProcedure
    .input(z.object({ approvedWorkId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getTimeEntriesByCompany(ctx.user.companyId, { approvedWorkId: input.approvedWorkId });
    }),
});
