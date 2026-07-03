import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, officeProcedure, adminProcedure, technicianProcedure } from "../_core/trpc";
import * as db from "../db";
import { logActivity } from "../activityLogger";
import { PAYROLL_WORK_TYPES, PAYROLL_ENTRY_STATUSES } from "../../drizzle/schema";
import { getAllUsers } from "../db";

const WORK_TYPE_ENUM = z.enum(PAYROLL_WORK_TYPES);
const STATUS_ENUM = z.enum(PAYROLL_ENTRY_STATUSES);

const createInput = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  payPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  breakMinutes: z.number().int().min(0).max(480).default(0),
  regularMinutes: z.number().int().min(0).max(1440),
  overtimeMinutes: z.number().int().min(0).max(480).optional(),
  totalMinutes: z.number().int().min(1).max(1440),
  workType: WORK_TYPE_ENUM.default("regular_work"),
  jobId: z.number().int().positive().optional(),
  workOrderId: z.number().int().positive().optional(),
  approvedWorkId: z.number().int().positive().optional(),
  siteId: z.number().int().positive().optional(),
  customerOrgId: z.number().int().positive().optional(),
  description: z.string().max(1000).default(""),
  employeeNotes: z.string().max(2000).optional(),
});

async function requirePayrollEntry(id: number, companyId: number) {
  const entry = await db.getPayrollEntryById(id);
  if (!entry) throw new TRPCError({ code: "NOT_FOUND" });
  if (entry.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
  return entry;
}

export const payrollHoursRouter = router({
  listMine: technicianProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      status: STATUS_ENUM.optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getPayrollEntriesByUser(ctx.user.id, ctx.user.companyId, {
        from: input.from,
        to: input.to,
        status: input.status,
      });
    }),

  listCompany: officeProcedure
    .input(z.object({
      userId: z.number().int().positive().optional(),
      status: STATUS_ENUM.optional(),
      workType: WORK_TYPE_ENUM.optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getPayrollEntriesByCompany(ctx.user.companyId, {
        status: input.status,
        userId: input.userId,
        workType: input.workType,
        from: input.from,
        to: input.to,
      });
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return requirePayrollEntry(input.id, ctx.user.companyId);
    }),

  create: technicianProcedure
    .input(createInput)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const id = await db.createPayrollEntry({
        ...input,
        companyId: ctx.user.companyId,
        userId: ctx.user.id,
        status: "draft",
        entryDate: input.entryDate as any,
        payPeriodStart: input.payPeriodStart as any ?? null,
        payPeriodEnd: input.payPeriodEnd as any ?? null,
      });
      void logActivity({
        ctx,
        entityType: "payroll_entry",
        entityId: id,
        eventType: "created",
        title: `Payroll entry created: ${(input.totalMinutes / 60).toFixed(2)}h (${input.workType}) on ${input.entryDate}`,
      });
      return { id };
    }),

  update: technicianProcedure
    .input(z.object({
      id: z.number().int().positive(),
      entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      payPeriodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      payPeriodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      breakMinutes: z.number().int().min(0).max(480).optional(),
      regularMinutes: z.number().int().min(0).max(1440).optional(),
      overtimeMinutes: z.number().int().min(0).max(480).optional(),
      totalMinutes: z.number().int().min(1).max(1440).optional(),
      workType: WORK_TYPE_ENUM.optional(),
      jobId: z.number().int().positive().optional(),
      workOrderId: z.number().int().positive().optional(),
      description: z.string().max(1000).optional(),
      employeeNotes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requirePayrollEntry(input.id, ctx.user.companyId);
      if (entry.userId !== ctx.user.id && ctx.user.role !== "admin" && ctx.user.role !== "office") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (entry.status !== "draft" && entry.status !== "rejected") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only edit draft or rejected entries." });
      }
      const { id, ...rest } = input;
      await db.updatePayrollEntry(id, { ...rest, status: "draft" } as any);
      return { success: true };
    }),

  submit: technicianProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requirePayrollEntry(input.id, ctx.user.companyId);
      if (entry.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (entry.status !== "draft" && entry.status !== "rejected") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only submit draft or rejected entries." });
      }
      await db.updatePayrollEntry(input.id, {
        status: "submitted",
        submittedAt: new Date(),
      });
      void logActivity({
        ctx,
        entityType: "payroll_entry",
        entityId: input.id,
        eventType: "submitted",
        title: "Payroll entry submitted for approval",
      });
      const dedupeKey = `payroll_submitted_${input.id}`;
      const exists = await db.hasUndismissedNotification(ctx.user.companyId, dedupeKey);
      if (!exists) {
        void db.createNotification({
          companyId: ctx.user.companyId,
          type: "payroll_entry_submitted",
          title: "Payroll Hours Submitted",
          message: `${ctx.user.name ?? "An employee"} submitted payroll hours for approval (${(entry.totalMinutes / 60).toFixed(2)}h, ${entry.workType})`,
          dedupeKey,
        });
      }
      return { success: true };
    }),

  approve: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requirePayrollEntry(input.id, ctx.user.companyId);
      if (entry.userId === ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot approve your own payroll entry." });
      }
      if (entry.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only approve submitted entries." });
      }
      await db.updatePayrollEntry(input.id, {
        status: "approved",
        approvedById: ctx.user.id,
        approvedAt: new Date(),
      });
      void logActivity({
        ctx,
        entityType: "payroll_entry",
        entityId: input.id,
        eventType: "approved",
        title: "Payroll entry approved",
      });
      return { success: true };
    }),

  reject: adminProcedure
    .input(z.object({ id: z.number().int().positive(), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requirePayrollEntry(input.id, ctx.user.companyId);
      if (entry.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only reject submitted entries." });
      }
      await db.updatePayrollEntry(input.id, {
        status: "rejected",
        rejectedById: ctx.user.id,
        rejectedAt: new Date(),
        rejectionReason: input.reason ?? null,
      });
      void logActivity({
        ctx,
        entityType: "payroll_entry",
        entityId: input.id,
        eventType: "rejected",
        title: `Payroll entry rejected${input.reason ? `: ${input.reason}` : ""}`,
      });
      return { success: true };
    }),

  bulkApprove: adminProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(100) }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      // Verify all entries belong to this company and are submitted, and not owned by the approver
      const entries = await Promise.all(input.ids.map((id) => requirePayrollEntry(id, ctx.user.companyId!)));
      const notSubmitted = entries.filter((e) => e.status !== "submitted");
      if (notSubmitted.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${notSubmitted.length} entries are not in submitted status.` });
      }
      const selfApproval = entries.filter((e) => e.userId === ctx.user.id);
      if (selfApproval.length > 0) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot approve your own payroll entries." });
      }
      await db.bulkUpdatePayrollEntries(input.ids, {
        status: "approved",
        approvedById: ctx.user.id,
        approvedAt: new Date(),
      });
      void logActivity({
        ctx,
        entityType: "payroll_entry",
        entityId: input.ids[0],
        eventType: "bulk_approved",
        title: `Bulk approved ${input.ids.length} payroll entries`,
      });
      return { count: input.ids.length };
    }),

  markExported: adminProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      await Promise.all(input.ids.map((id) => requirePayrollEntry(id, ctx.user.companyId!)));
      await db.bulkUpdatePayrollEntries(input.ids, {
        status: "exported",
        exportedAt: new Date(),
        exportedById: ctx.user.id,
      });
      void logActivity({
        ctx,
        entityType: "payroll_entry",
        entityId: input.ids[0],
        eventType: "exported",
        title: `Marked ${input.ids.length} payroll entries as exported`,
      });
      return { count: input.ids.length };
    }),

  getSummary: officeProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) return null;
      return db.getPayrollSummary(ctx.user.companyId, input.from, input.to);
    }),

  exportData: adminProcedure
    .input(z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      userId: z.number().int().positive().optional(),
      status: STATUS_ENUM.optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      return db.getPayrollExportData(ctx.user.companyId, {
        from: input.from,
        to: input.to,
        userId: input.userId,
        status: input.status,
      });
    }),

  deleteDraft: technicianProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entry = await requirePayrollEntry(input.id, ctx.user.companyId);
      if (entry.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (entry.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Can only delete draft entries." });
      }
      await db.deletePayrollEntry(input.id);
      return { success: true };
    }),

  // ─── Review-specific procedures ────────────────────────────────────────────

  setAdminNotes: officeProcedure
    .input(z.object({ id: z.number().int().positive(), adminNotes: z.string().max(2000) }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      await requirePayrollEntry(input.id, ctx.user.companyId);
      await db.updatePayrollEntry(input.id, { adminNotes: input.adminNotes || null });
      return { success: true };
    }),

  bulkReject: adminProcedure
    .input(z.object({
      ids: z.array(z.number().int().positive()).min(1).max(100),
      reason: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const entries = await Promise.all(input.ids.map((id) => requirePayrollEntry(id, ctx.user.companyId!)));
      const notSubmitted = entries.filter((e) => e.status !== "submitted");
      if (notSubmitted.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${notSubmitted.length} entries are not in submitted status.` });
      }
      await db.bulkUpdatePayrollEntries(input.ids, {
        status: "rejected",
        rejectedById: ctx.user.id,
        rejectedAt: new Date(),
        rejectionReason: input.reason ?? null,
      });
      void logActivity({
        ctx,
        entityType: "payroll_entry",
        entityId: input.ids[0],
        eventType: "bulk_rejected",
        title: `Bulk rejected ${input.ids.length} payroll entries${input.reason ? `: ${input.reason}` : ""}`,
      });
      return { count: input.ids.length };
    }),

  getReviewSummary: officeProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) return null;
      return db.getPayrollReviewSummary(ctx.user.companyId, input.from, input.to);
    }),

  getMissingHoursSummary: officeProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) return [];
      const allUsers = await getAllUsers(ctx.user.companyId);
      const employees = allUsers.filter(
        (u: any) => ["admin", "office", "technician"].includes(u.role) && u.isActive === 1,
      );
      const entries = await db.getPayrollEntriesByCompany(ctx.user.companyId, {
        from: input.from,
        to: input.to,
      });
      return employees.map((emp: any) => {
        const empEntries = entries.filter((e) => e.userId === emp.id);
        const hasSubmitted = empEntries.some((e) =>
          ["submitted", "approved", "exported", "locked"].includes(e.status),
        );
        return {
          userId: emp.id as number,
          name: (emp.name ?? `User #${emp.id}`) as string,
          email: (emp.email ?? "") as string,
          role: emp.role as string,
          hasSubmitted,
          hasAnyEntries: empEntries.length > 0,
          draftCount: empEntries.filter((e) => e.status === "draft").length,
          rejectedCount: empEntries.filter((e) => e.status === "rejected").length,
        };
      }).filter((e: any) => !e.hasSubmitted);
    }),
});
