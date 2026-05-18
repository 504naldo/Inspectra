import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, technicianProcedure, adminOrOfficeProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { feedbackItems, users, FEEDBACK_TYPES, FEEDBACK_STATUSES, FEEDBACK_PRIORITIES } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { logActivity } from "../activityLogger";
import * as db from "../db";

export const feedbackRouter = router({

  submit: technicianProcedure
    .input(z.object({
      type: z.enum(FEEDBACK_TYPES),
      title: z.string().min(1).max(255),
      description: z.string().max(5000).optional(),
      priority: z.enum(FEEDBACK_PRIORITIES).optional(),
      pageUrl: z.string().max(500).optional(),
      routeName: z.string().max(200).optional(),
      entityType: z.string().max(100).optional(),
      entityId: z.number().int().optional(),
      browserInfo: z.string().max(500).optional(),
      deviceInfo: z.string().max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "No company context" });

      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [created] = await database.insert(feedbackItems).values({
        companyId,
        submittedById: ctx.user.id,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority ?? "medium",
        pageUrl: input.pageUrl ?? null,
        routeName: input.routeName ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        browserInfo: input.browserInfo ?? null,
        deviceInfo: input.deviceInfo ?? null,
      }).$returningId();

      logActivity({
        ctx,
        entityType: "feedback",
        entityId: created.id,
        eventType: "feedback.submitted",
        title: `Feedback submitted: ${input.title}`,
        description: `Type: ${input.type}, Priority: ${input.priority ?? "medium"}`,
      });

      // Notify admins for urgent feedback
      if (input.priority === "urgent") {
        const dedupeKey = `feedback-urgent-${created.id}`;
        await db.createNotification({
          companyId,
          roleTarget: "admin",
          type: "feedback",
          severity: "urgent",
          title: "Urgent feedback submitted",
          message: `${ctx.user.name ?? "A user"} submitted urgent feedback: "${input.title}"`,
          href: "/admin/feedback",
          dedupeKey,
        });
      }

      return { id: created.id };
    }),

  mySubmissions: technicianProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId;
      if (!companyId) return [];
      const database = await getDb();
      if (!database) return [];

      return database
        .select()
        .from(feedbackItems)
        .where(and(
          eq(feedbackItems.companyId, companyId),
          eq(feedbackItems.submittedById, ctx.user.id),
        ))
        .orderBy(desc(feedbackItems.createdAt))
        .limit(input?.limit ?? 20);
    }),

  list: adminOrOfficeProcedure
    .input(z.object({
      status: z.enum(FEEDBACK_STATUSES).optional(),
      type: z.enum(FEEDBACK_TYPES).optional(),
      priority: z.enum(FEEDBACK_PRIORITIES).optional(),
      assignedToId: z.number().int().optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).optional())
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const database = await getDb();
      if (!database) return [];

      const conditions = [eq(feedbackItems.companyId, companyId)];
      if (input?.status) conditions.push(eq(feedbackItems.status, input.status));
      if (input?.type) conditions.push(eq(feedbackItems.type, input.type));
      if (input?.priority) conditions.push(eq(feedbackItems.priority, input.priority));
      if (input?.assignedToId) conditions.push(eq(feedbackItems.assignedToId, input.assignedToId));

      const rows = await database
        .select({
          id: feedbackItems.id,
          companyId: feedbackItems.companyId,
          submittedById: feedbackItems.submittedById,
          assignedToId: feedbackItems.assignedToId,
          type: feedbackItems.type,
          status: feedbackItems.status,
          priority: feedbackItems.priority,
          title: feedbackItems.title,
          description: feedbackItems.description,
          pageUrl: feedbackItems.pageUrl,
          routeName: feedbackItems.routeName,
          entityType: feedbackItems.entityType,
          entityId: feedbackItems.entityId,
          browserInfo: feedbackItems.browserInfo,
          deviceInfo: feedbackItems.deviceInfo,
          adminNotes: feedbackItems.adminNotes,
          resolvedAt: feedbackItems.resolvedAt,
          resolvedById: feedbackItems.resolvedById,
          createdAt: feedbackItems.createdAt,
          updatedAt: feedbackItems.updatedAt,
          submitterName: users.name,
          submitterEmail: users.email,
          submitterRole: users.role,
        })
        .from(feedbackItems)
        .leftJoin(users, eq(feedbackItems.submittedById, users.id))
        .where(and(...conditions))
        .orderBy(desc(feedbackItems.createdAt))
        .limit(input?.limit ?? 100);

      return rows;
    }),

  get: adminOrOfficeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [row] = await database
        .select({
          id: feedbackItems.id,
          companyId: feedbackItems.companyId,
          submittedById: feedbackItems.submittedById,
          assignedToId: feedbackItems.assignedToId,
          type: feedbackItems.type,
          status: feedbackItems.status,
          priority: feedbackItems.priority,
          title: feedbackItems.title,
          description: feedbackItems.description,
          pageUrl: feedbackItems.pageUrl,
          routeName: feedbackItems.routeName,
          entityType: feedbackItems.entityType,
          entityId: feedbackItems.entityId,
          browserInfo: feedbackItems.browserInfo,
          deviceInfo: feedbackItems.deviceInfo,
          adminNotes: feedbackItems.adminNotes,
          resolvedAt: feedbackItems.resolvedAt,
          resolvedById: feedbackItems.resolvedById,
          createdAt: feedbackItems.createdAt,
          updatedAt: feedbackItems.updatedAt,
          submitterName: users.name,
          submitterEmail: users.email,
          submitterRole: users.role,
        })
        .from(feedbackItems)
        .leftJoin(users, eq(feedbackItems.submittedById, users.id))
        .where(and(
          eq(feedbackItems.id, input.id),
          eq(feedbackItems.companyId, companyId),
        ))
        .limit(1);

      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  updateStatus: adminOrOfficeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      status: z.enum(FEEDBACK_STATUSES),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const isResolving = input.status === "resolved" || input.status === "closed" || input.status === "wont_fix";
      await database
        .update(feedbackItems)
        .set({
          status: input.status,
          ...(isResolving ? { resolvedAt: new Date(), resolvedById: ctx.user.id } : {}),
        })
        .where(and(eq(feedbackItems.id, input.id), eq(feedbackItems.companyId, companyId)));

      logActivity({
        ctx,
        entityType: "feedback",
        entityId: input.id,
        eventType: "feedback.status_changed",
        title: `Feedback status changed to ${input.status}`,
      });

      return { success: true };
    }),

  updatePriority: adminOrOfficeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      priority: z.enum(FEEDBACK_PRIORITIES),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database
        .update(feedbackItems)
        .set({ priority: input.priority })
        .where(and(eq(feedbackItems.id, input.id), eq(feedbackItems.companyId, companyId)));

      return { success: true };
    }),

  assign: adminOrOfficeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      assignedToId: z.number().int().positive().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database
        .update(feedbackItems)
        .set({ assignedToId: input.assignedToId })
        .where(and(eq(feedbackItems.id, input.id), eq(feedbackItems.companyId, companyId)));

      return { success: true };
    }),

  addAdminNote: adminOrOfficeProcedure
    .input(z.object({
      id: z.number().int().positive(),
      adminNotes: z.string().max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database
        .update(feedbackItems)
        .set({ adminNotes: input.adminNotes })
        .where(and(eq(feedbackItems.id, input.id), eq(feedbackItems.companyId, companyId)));

      return { success: true };
    }),

  close: adminOrOfficeProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const companyId = ctx.user.companyId!;
      const database = await getDb();
      if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await database
        .update(feedbackItems)
        .set({ status: "closed", resolvedAt: new Date(), resolvedById: ctx.user.id })
        .where(and(eq(feedbackItems.id, input.id), eq(feedbackItems.companyId, companyId)));

      return { success: true };
    }),
});
