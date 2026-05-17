import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, technicianProcedure, officeProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { getAllUsers, createNotification, hasUndismissedNotification } from "../db";
import { logActivity } from "../activityLogger";
import { eq, and, or, gte, lte, inArray } from "drizzle-orm";
import {
  employeeAvailabilityBlocks,
  AVAILABILITY_BLOCK_TYPES,
  AVAILABILITY_BLOCK_STATUSES,
  users,
} from "../../drizzle/schema";

// ─── Zod enums ────────────────────────────────────────────────────────────────

const TYPE_ENUM = z.enum(AVAILABILITY_BLOCK_TYPES);
const STATUS_ENUM = z.enum(AVAILABILITY_BLOCK_STATUSES);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const blockInput = z.object({
  type: TYPE_ENUM.default("vacation"),
  startDate: z.string().regex(DATE_RE),
  endDate: z.string().regex(DATE_RE),
  startTime: z.string().regex(TIME_RE).optional(),
  endTime: z.string().regex(TIME_RE).optional(),
  allDay: z.boolean().default(true),
  reason: z.string().max(500).default(""),
  employeeNotes: z.string().max(2000).optional(),
});

// ─── Guard helpers ────────────────────────────────────────────────────────────

async function requireBlock(id: number, companyId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const [block] = await db
    .select()
    .from(employeeAvailabilityBlocks)
    .where(and(eq(employeeAvailabilityBlocks.id, id), eq(employeeAvailabilityBlocks.companyId, companyId)))
    .limit(1);
  if (!block) throw new TRPCError({ code: "NOT_FOUND" });
  return block;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const availabilityRouter = router({

  listMyAvailability: technicianProcedure
    .input(z.object({
      from: z.string().regex(DATE_RE).optional(),
      to: z.string().regex(DATE_RE).optional(),
      status: STATUS_ENUM.optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const conditions = [
        eq(employeeAvailabilityBlocks.userId, ctx.user.id),
        eq(employeeAvailabilityBlocks.companyId, ctx.user.companyId),
      ];
      if (input.status) conditions.push(eq(employeeAvailabilityBlocks.status, input.status));
      if (input.from) conditions.push(gte(employeeAvailabilityBlocks.endDate, input.from as any));
      if (input.to) conditions.push(lte(employeeAvailabilityBlocks.startDate, input.to as any));
      return db
        .select()
        .from(employeeAvailabilityBlocks)
        .where(and(...conditions))
        .orderBy(employeeAvailabilityBlocks.startDate);
    }),

  listCompanyAvailability: officeProcedure
    .input(z.object({
      userId: z.number().int().positive().optional(),
      type: TYPE_ENUM.optional(),
      status: STATUS_ENUM.optional(),
      from: z.string().regex(DATE_RE).optional(),
      to: z.string().regex(DATE_RE).optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(employeeAvailabilityBlocks.companyId, ctx.user.companyId)];
      if (input.userId) conditions.push(eq(employeeAvailabilityBlocks.userId, input.userId));
      if (input.type) conditions.push(eq(employeeAvailabilityBlocks.type, input.type));
      if (input.status) conditions.push(eq(employeeAvailabilityBlocks.status, input.status));
      if (input.from) conditions.push(gte(employeeAvailabilityBlocks.endDate, input.from as any));
      if (input.to) conditions.push(lte(employeeAvailabilityBlocks.startDate, input.to as any));

      const blocks = await db
        .select()
        .from(employeeAvailabilityBlocks)
        .where(and(...conditions))
        .orderBy(employeeAvailabilityBlocks.startDate);

      const allUsersInCompany = await getAllUsers(ctx.user.companyId);
      const userMap = new Map(allUsersInCompany.map(u => [u.id, { name: u.name, email: u.email, role: u.role }]));

      return blocks.map(b => ({
        ...b,
        userName: userMap.get(b.userId)?.name ?? null,
        userEmail: userMap.get(b.userId)?.email ?? null,
        userRole: userMap.get(b.userId)?.role ?? null,
      }));
    }),

  getAvailabilityBlock: technicianProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const block = await requireBlock(input.id, ctx.user.companyId);
      if (block.userId !== ctx.user.id && !["admin", "office"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return block;
    }),

  createTimeOffRequest: technicianProcedure
    .input(blockInput)
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (input.startDate > input.endDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Start date must be on or before end date" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [result] = await db.insert(employeeAvailabilityBlocks).values({
        companyId: ctx.user.companyId,
        userId: ctx.user.id,
        type: input.type,
        status: "requested",
        startDate: input.startDate as any,
        endDate: input.endDate as any,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        allDay: input.allDay ? 1 : 0,
        reason: input.reason,
        employeeNotes: input.employeeNotes ?? null,
        requestedAt: new Date(),
      });

      const blockId = (result as any).insertId as number;

      void logActivity({
        ctx,
        entityType: "availability_block",
        entityId: blockId,
        eventType: "time_off_requested",
        title: `Time off requested: ${input.type} (${input.startDate} – ${input.endDate})`,
      });

      // Notify admin/office users
      const allUsersInCompany = await getAllUsers(ctx.user.companyId);
      const admins = allUsersInCompany.filter(u => ["admin", "office"].includes(u.role) && u.id !== ctx.user.id);
      for (const admin of admins) {
        const dedupeKey = `time_off_request_${blockId}_${admin.id}`;
        const already = await hasUndismissedNotification(ctx.user.companyId, dedupeKey);
        if (!already) {
          await createNotification({
            companyId: ctx.user.companyId,
            userId: admin.id,
            type: "time_off_requested",
            title: "Time Off Request",
            message: `${ctx.user.name ?? "An employee"} requested ${input.type} from ${input.startDate} to ${input.endDate}.`,
            severity: "info",
            entityType: "availability_block",
            entityId: blockId,
            dedupeKey,
          });
        }
      }

      return { id: blockId };
    }),

  updateTimeOffRequest: technicianProcedure
    .input(blockInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const block = await requireBlock(input.id, ctx.user.companyId);
      if (block.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (block.status !== "requested") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only requested blocks can be edited" });
      }
      if (input.startDate > input.endDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Start date must be on or before end date" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.update(employeeAvailabilityBlocks).set({
        type: input.type,
        startDate: input.startDate as any,
        endDate: input.endDate as any,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        allDay: input.allDay ? 1 : 0,
        reason: input.reason,
        employeeNotes: input.employeeNotes ?? null,
      }).where(eq(employeeAvailabilityBlocks.id, input.id));

      void logActivity({
        ctx,
        entityType: "availability_block",
        entityId: input.id,
        eventType: "time_off_updated",
        title: `Time off request updated: ${input.type} (${input.startDate} – ${input.endDate})`,
      });

      return { id: input.id };
    }),

  cancelTimeOffRequest: technicianProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const block = await requireBlock(input.id, ctx.user.companyId);
      if (block.userId !== ctx.user.id && !["admin", "office"].includes(ctx.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (block.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already cancelled" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.update(employeeAvailabilityBlocks)
        .set({ status: "cancelled" })
        .where(eq(employeeAvailabilityBlocks.id, input.id));

      void logActivity({
        ctx,
        entityType: "availability_block",
        entityId: input.id,
        eventType: "time_off_cancelled",
        title: `Time off cancelled`,
      });

      return { id: input.id };
    }),

  approveTimeOffRequest: officeProcedure
    .input(z.object({ id: z.number().int().positive(), adminNotes: z.string().max(1000).optional() }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const block = await requireBlock(input.id, ctx.user.companyId);
      if (block.userId === ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot approve your own time-off request" });
      }
      if (block.status !== "requested") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only requested blocks can be approved" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.update(employeeAvailabilityBlocks).set({
        status: "approved",
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
        adminNotes: input.adminNotes ?? null,
      }).where(eq(employeeAvailabilityBlocks.id, input.id));

      void logActivity({
        ctx,
        entityType: "availability_block",
        entityId: input.id,
        eventType: "time_off_approved",
        title: `Time off approved`,
      });

      // Notify employee
      const dedupeKey = `time_off_approved_${input.id}`;
      const already = await hasUndismissedNotification(ctx.user.companyId, dedupeKey);
      if (!already) {
        await createNotification({
          companyId: ctx.user.companyId,
          userId: block.userId,
          type: "time_off_approved",
          title: "Time Off Approved",
          message: `Your ${block.type} request (${String(block.startDate).slice(0, 10)} – ${String(block.endDate).slice(0, 10)}) has been approved.`,
          severity: "info",
          entityType: "availability_block",
          entityId: input.id,
          dedupeKey,
        });
      }

      return { id: input.id };
    }),

  rejectTimeOffRequest: officeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      reason: z.string().max(1000).optional(),
      adminNotes: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const block = await requireBlock(input.id, ctx.user.companyId);
      if (block.status !== "requested") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only requested blocks can be rejected" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.update(employeeAvailabilityBlocks).set({
        status: "rejected",
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
        adminNotes: input.adminNotes ?? input.reason ?? null,
      }).where(eq(employeeAvailabilityBlocks.id, input.id));

      void logActivity({
        ctx,
        entityType: "availability_block",
        entityId: input.id,
        eventType: "time_off_rejected",
        title: `Time off rejected`,
        description: input.reason ?? null,
      });

      // Notify employee
      const dedupeKey = `time_off_rejected_${input.id}`;
      const already = await hasUndismissedNotification(ctx.user.companyId, dedupeKey);
      if (!already) {
        await createNotification({
          companyId: ctx.user.companyId,
          userId: block.userId,
          type: "time_off_rejected",
          title: "Time Off Not Approved",
          message: `Your ${block.type} request (${String(block.startDate).slice(0, 10)} – ${String(block.endDate).slice(0, 10)}) was not approved.${input.reason ? ` Reason: ${input.reason}` : ""}`,
          severity: "warning",
          entityType: "availability_block",
          entityId: input.id,
          dedupeKey,
        });
      }

      return { id: input.id };
    }),

  // Admin can create a block for any employee (e.g. training day, forced stat holiday)
  createAdminBlock: officeProcedure
    .input(blockInput.extend({
      userId: z.number().int().positive(),
      adminNotes: z.string().max(1000).optional(),
      status: STATUS_ENUM.default("approved"),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      if (input.startDate > input.endDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Start date must be on or before end date" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [result] = await db.insert(employeeAvailabilityBlocks).values({
        companyId: ctx.user.companyId,
        userId: input.userId,
        type: input.type,
        status: input.status,
        startDate: input.startDate as any,
        endDate: input.endDate as any,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
        allDay: input.allDay ? 1 : 0,
        reason: input.reason,
        employeeNotes: input.employeeNotes ?? null,
        adminNotes: input.adminNotes ?? null,
        reviewedById: ctx.user.id,
        reviewedAt: new Date(),
      });

      const blockId = (result as any).insertId as number;

      void logActivity({
        ctx,
        entityType: "availability_block",
        entityId: blockId,
        eventType: "admin_block_created",
        title: `Admin created availability block: ${input.type} for user #${input.userId}`,
      });

      return { id: blockId };
    }),

  getAvailabilityCalendar: officeProcedure
    .input(z.object({
      from: z.string().regex(DATE_RE),
      to: z.string().regex(DATE_RE),
      status: STATUS_ENUM.optional(),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];

      const conditions = [
        eq(employeeAvailabilityBlocks.companyId, ctx.user.companyId),
        gte(employeeAvailabilityBlocks.endDate, input.from as any),
        lte(employeeAvailabilityBlocks.startDate, input.to as any),
      ];
      if (input.status) conditions.push(eq(employeeAvailabilityBlocks.status, input.status));

      const blocks = await db
        .select()
        .from(employeeAvailabilityBlocks)
        .where(and(...conditions))
        .orderBy(employeeAvailabilityBlocks.startDate);

      const allUsersInCompany = await getAllUsers(ctx.user.companyId);
      const userMap = new Map(allUsersInCompany.map(u => [u.id, { name: u.name, role: u.role }]));

      return blocks.map(b => ({
        ...b,
        userName: userMap.get(b.userId)?.name ?? null,
        userRole: userMap.get(b.userId)?.role ?? null,
      }));
    }),

  getUnavailableUsersForDate: technicianProcedure
    .input(z.object({ date: z.string().regex(DATE_RE) }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];

      const blocks = await db
        .select()
        .from(employeeAvailabilityBlocks)
        .where(and(
          eq(employeeAvailabilityBlocks.companyId, ctx.user.companyId),
          eq(employeeAvailabilityBlocks.status, "approved"),
          lte(employeeAvailabilityBlocks.startDate, input.date as any),
          gte(employeeAvailabilityBlocks.endDate, input.date as any),
        ));

      const allUsersInCompany = await getAllUsers(ctx.user.companyId);
      const userMap = new Map(allUsersInCompany.map(u => [u.id, { name: u.name, role: u.role }]));

      return blocks.map(b => ({
        userId: b.userId,
        userName: userMap.get(b.userId)?.name ?? null,
        userRole: userMap.get(b.userId)?.role ?? null,
        type: b.type,
        reason: b.reason,
        allDay: b.allDay,
        startTime: b.startTime,
        endTime: b.endTime,
      }));
    }),

  checkSchedulingConflicts: officeProcedure
    .input(z.object({
      userIds: z.array(z.number().int().positive()).min(1).max(50),
      startDate: z.string().regex(DATE_RE),
      endDate: z.string().regex(DATE_RE),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];

      const blocks = await db
        .select()
        .from(employeeAvailabilityBlocks)
        .where(and(
          eq(employeeAvailabilityBlocks.companyId, ctx.user.companyId),
          eq(employeeAvailabilityBlocks.status, "approved"),
          inArray(employeeAvailabilityBlocks.userId, input.userIds),
          lte(employeeAvailabilityBlocks.startDate, input.endDate as any),
          gte(employeeAvailabilityBlocks.endDate, input.startDate as any),
        ));

      const allUsersInCompany = await getAllUsers(ctx.user.companyId);
      const userMap = new Map(allUsersInCompany.map(u => [u.id, { name: u.name, role: u.role }]));

      return blocks.map(b => ({
        userId: b.userId,
        userName: userMap.get(b.userId)?.name ?? null,
        type: b.type,
        startDate: String(b.startDate).slice(0, 10),
        endDate: String(b.endDate).slice(0, 10),
        reason: b.reason,
      }));
    }),

  // For payroll hours integration: get approved blocks in a date range for the current user
  getMyApprovedBlocksForPeriod: technicianProcedure
    .input(z.object({
      from: z.string().regex(DATE_RE),
      to: z.string().regex(DATE_RE),
    }))
    .query(async ({ input, ctx }) => {
      if (!ctx.user.companyId) throw new TRPCError({ code: "FORBIDDEN" });
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(employeeAvailabilityBlocks)
        .where(and(
          eq(employeeAvailabilityBlocks.userId, ctx.user.id),
          eq(employeeAvailabilityBlocks.companyId, ctx.user.companyId),
          eq(employeeAvailabilityBlocks.status, "approved"),
          lte(employeeAvailabilityBlocks.startDate, input.to as any),
          gte(employeeAvailabilityBlocks.endDate, input.from as any),
        ))
        .orderBy(employeeAvailabilityBlocks.startDate);
    }),
});
