import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, officeProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { logActivity } from "../activityLogger";
import { eq, and, inArray, isNull, gte, lte, or } from "drizzle-orm";
import {
  jobs,
  approvedWork,
  workOrders,
  monthlyServiceTracking,
  users,
  sites,
} from "../../drizzle/schema";

// ── Constants ─────────────────────────────────────────────────────────────────

const ITEM_TYPE = z.enum(["job", "approved_work", "work_order", "service_tracking"]);
type ItemType = z.infer<typeof ITEM_TYPE>;

const TERMINAL_JOB_STATUSES = ["completed", "cancelled"] as const;
const TERMINAL_AW_STATUSES = ["completed", "report_pending", "invoiced", "closed", "cancelled"] as const;
const TERMINAL_WO_STATUSES = ["completed", "cancelled"] as const;
const TERMINAL_ST_STATUSES = ["completed", "report_pending"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const schedulingAutomationRouter = router({

  /**
   * getQueue — Returns all items that need scheduling for this company.
   * Sources: unscheduled jobs, approved work (approved/ready_to_schedule),
   * pending work orders, and service tracking rows (not_scheduled/overdue).
   */
  getQueue: officeProcedure.query(async ({ ctx }) => {
    const companyId = ctx.user.companyId!;
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    // Fetch all company sites once for enrichment
    const allSites = await db
      .select({ id: sites.id, name: sites.name, address: sites.address, city: sites.city, buildingId: sites.buildingId })
      .from(sites)
      .where(eq(sites.companyId, companyId));
    const siteMap = new Map(allSites.map(s => [s.id, s]));

    // Fetch active technicians for enrichment
    const allTechs = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.isActive, 1)));
    const techMap = new Map(allTechs.map(t => [t.id, t]));

    // 1. Unscheduled pending jobs
    const pendingJobs = await db
      .select()
      .from(jobs)
      .where(and(
        eq(jobs.companyId, companyId),
        eq(jobs.status, "pending"),
        isNull(jobs.scheduledDate),
      ))
      .orderBy(jobs.createdAt);

    // 2. Approved work ready to schedule
    const awItems = await db
      .select()
      .from(approvedWork)
      .where(and(
        eq(approvedWork.companyId, companyId),
        or(
          eq(approvedWork.status, "approved"),
          eq(approvedWork.status, "ready_to_schedule"),
        ),
      ))
      .orderBy(approvedWork.createdAt);

    // 3. Pending work orders without a scheduled date
    const woItems = await db
      .select()
      .from(workOrders)
      .where(and(
        eq(workOrders.companyId, companyId),
        eq(workOrders.status, "pending"),
        isNull(workOrders.scheduledDate),
      ))
      .orderBy(workOrders.createdAt);

    // 4. Service tracking items not yet scheduled or overdue
    const stItems = await db
      .select()
      .from(monthlyServiceTracking)
      .where(and(
        eq(monthlyServiceTracking.companyId, companyId),
        or(
          eq(monthlyServiceTracking.status, "not_scheduled"),
          eq(monthlyServiceTracking.status, "overdue"),
        ),
      ))
      .orderBy(monthlyServiceTracking.targetDate);

    const enrichSite = (siteId: number | null | undefined) => {
      const s = siteMap.get(siteId ?? 0);
      return s ? { siteName: s.name, siteAddress: s.address, siteCity: s.city, buildingId: s.buildingId } : { siteName: null, siteAddress: null, siteCity: null, buildingId: null };
    };

    const enrichLead = (leadId: number | null | undefined) => techMap.get(leadId ?? 0)?.name ?? null;

    return {
      jobs: pendingJobs.map(j => ({
        id: j.id,
        itemType: "job" as const,
        title: j.title,
        jobType: j.jobType,
        priority: j.priority,
        status: j.status,
        notes: j.notes,
        createdAt: j.createdAt,
        leadTechnicianId: j.leadTechnicianId,
        leadTechnicianName: enrichLead(j.leadTechnicianId),
        ...enrichSite(j.siteId),
        siteId: j.siteId,
        customerOrgId: j.customerOrgId,
      })),

      approvedWork: awItems.map(aw => ({
        id: aw.id,
        itemType: "approved_work" as const,
        title: (aw as any).title,
        awType: aw.type,
        priority: null,
        status: aw.status,
        description: (aw as any).description,
        createdAt: aw.createdAt,
        assignedTechnicianIds: (aw.assignedTechnicianIds as number[] | null) ?? [],
        assignedTechNames: ((aw.assignedTechnicianIds as number[] | null) ?? []).map(id => techMap.get(id)?.name ?? null).filter(Boolean) as string[],
        ...enrichSite(aw.siteId),
        siteId: aw.siteId,
        customerOrgId: aw.customerOrgId,
      })),

      workOrders: woItems.map(wo => ({
        id: wo.id,
        itemType: "work_order" as const,
        title: wo.title,
        workType: wo.workType,
        priority: wo.priority,
        status: wo.status,
        estimatedHours: wo.estimatedHours ? Number(wo.estimatedHours) : null,
        createdAt: wo.createdAt,
        assignedTechnicianIds: (wo.assignedTechnicianIds as number[]) ?? [],
        assignedTechNames: ((wo.assignedTechnicianIds as number[]) ?? []).map(id => techMap.get(id)?.name ?? null).filter(Boolean) as string[],
        ...enrichSite(wo.siteId),
        siteId: wo.siteId,
        customerOrgId: wo.customerOrgId,
      })),

      serviceTracking: stItems.map(st => ({
        id: st.id,
        itemType: "service_tracking" as const,
        title: `${st.serviceType} — ${st.buildingId ?? st.siteId}`,
        serviceType: st.serviceType,
        trackingMonth: st.trackingMonth,
        targetDate: st.targetDate,
        status: st.status,
        hoursRequired: st.hoursRequired ? Number(st.hoursRequired) : null,
        techsRequired: st.techsRequired,
        hasLinkedJob: !!st.linkedJobId,
        createdAt: st.createdAt,
        assignedTechnicianIds: (st.assignedTechnicianIds as number[] | null) ?? [],
        assignedTechNames: ((st.assignedTechnicianIds as number[] | null) ?? []).map(id => techMap.get(id)?.name ?? null).filter(Boolean) as string[],
        ...enrichSite(st.siteId),
        siteId: st.siteId,
        customerOrgId: st.customerOrgId,
        buildingId: st.buildingId,
      })),

      counts: {
        jobs: pendingJobs.length,
        approvedWork: awItems.length,
        workOrders: woItems.length,
        serviceTracking: stItems.length,
        total: pendingJobs.length + awItems.length + woItems.length + stItems.length,
      },
    };
  }),

  /**
   * getTechnicianAvailability — Returns per-technician scheduled item counts
   * for a given date range (max 90 days). Used to help office staff identify
   * who has capacity on which days.
   */
  getTechnicianAvailability: officeProcedure
    .input(z.object({
      startDate: z.date(),
      endDate: z.date(),
    }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;

      // Cap range at 90 days
      const msInDay = 86400000;
      const rangeMs = input.endDate.getTime() - input.startDate.getTime();
      if (rangeMs < 0 || rangeMs > 90 * msInDay) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Date range must be 1–90 days" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const start = startOfDay(input.startDate);
      const end = endOfDay(input.endDate);

      // Active technicians for this company
      const techs = await db
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(and(eq(users.companyId, companyId), eq(users.isActive, 1)));

      // Jobs scheduled in range
      const scheduledJobs = await db
        .select({
          id: jobs.id,
          title: jobs.title,
          scheduledDate: jobs.scheduledDate,
          leadTechnicianId: jobs.leadTechnicianId,
        })
        .from(jobs)
        .where(and(
          eq(jobs.companyId, companyId),
          gte(jobs.scheduledDate, start),
          lte(jobs.scheduledDate, end),
        ));

      // Approved work scheduled in range
      const scheduledAw = await db
        .select({
          id: approvedWork.id,
          title: (approvedWork as any).title,
          scheduledDate: approvedWork.scheduledDate,
          assignedTechnicianIds: approvedWork.assignedTechnicianIds,
        })
        .from(approvedWork)
        .where(and(
          eq(approvedWork.companyId, companyId),
          gte(approvedWork.scheduledDate, start),
          lte(approvedWork.scheduledDate, end),
        ));

      // Work orders scheduled in range
      const scheduledWo = await db
        .select({
          id: workOrders.id,
          title: workOrders.title,
          scheduledDate: workOrders.scheduledDate,
          assignedTechnicianIds: workOrders.assignedTechnicianIds,
        })
        .from(workOrders)
        .where(and(
          eq(workOrders.companyId, companyId),
          gte(workOrders.scheduledDate, start),
          lte(workOrders.scheduledDate, end),
        ));

      // Build per-tech load maps
      // techId → array of { date (YYYY-MM-DD), title, itemType, itemId }
      type LoadEntry = { dateStr: string; title: string; itemType: string; itemId: number };
      const loadMap = new Map<number, LoadEntry[]>();

      const ensureTech = (id: number) => {
        if (!loadMap.has(id)) loadMap.set(id, []);
        return loadMap.get(id)!;
      };

      const toDateStr = (d: Date | null | undefined) => {
        if (!d) return "";
        return d.toISOString().slice(0, 10);
      };

      for (const j of scheduledJobs) {
        if (j.leadTechnicianId) {
          ensureTech(j.leadTechnicianId).push({
            dateStr: toDateStr(j.scheduledDate),
            title: j.title,
            itemType: "job",
            itemId: j.id,
          });
        }
      }

      for (const aw of scheduledAw) {
        const techIds = (aw.assignedTechnicianIds as number[] | null) ?? [];
        const dateStr = toDateStr(aw.scheduledDate);
        for (const tid of techIds) {
          ensureTech(tid).push({ dateStr, title: aw.title, itemType: "approved_work", itemId: aw.id });
        }
      }

      for (const wo of scheduledWo) {
        const techIds = (wo.assignedTechnicianIds as number[]) ?? [];
        const dateStr = toDateStr(wo.scheduledDate);
        for (const tid of techIds) {
          ensureTech(tid).push({ dateStr, title: wo.title, itemType: "work_order", itemId: wo.id });
        }
      }

      return techs.map(t => ({
        id: t.id,
        name: t.name ?? "Unknown",
        role: t.role,
        scheduledItems: loadMap.get(t.id) ?? [],
        totalScheduled: (loadMap.get(t.id) ?? []).length,
      }));
    }),

  /**
   * suggestSchedule — Suggests a date and technician for a scheduling queue item.
   * Heuristic: prefer preferredDate if provided, else use item's targetDate or today+3.
   * Pick the least-loaded technician on that date.
   */
  suggestSchedule: officeProcedure
    .input(z.object({
      itemType: ITEM_TYPE,
      itemId: z.number().int().positive(),
      preferredDate: z.date().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Resolve item and verify ownership
      let itemTargetDate: Date | null = null;
      let itemTitle = "";

      if (input.itemType === "job") {
        const rows = await db.select().from(jobs).where(eq(jobs.id, input.itemId)).limit(1);
        const item = rows[0];
        if (!item || item.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
        itemTitle = item.title;
      } else if (input.itemType === "approved_work") {
        const rows = await db.select().from(approvedWork).where(eq(approvedWork.id, input.itemId)).limit(1);
        const item = rows[0];
        if (!item || item.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
        itemTitle = (item as any).title;
      } else if (input.itemType === "work_order") {
        const rows = await db.select().from(workOrders).where(eq(workOrders.id, input.itemId)).limit(1);
        const item = rows[0];
        if (!item || item.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
        itemTitle = item.title;
      } else {
        const rows = await db.select().from(monthlyServiceTracking).where(eq(monthlyServiceTracking.id, input.itemId)).limit(1);
        const item = rows[0];
        if (!item || item.companyId !== companyId) throw new TRPCError({ code: "NOT_FOUND" });
        itemTitle = `${item.serviceType} — ${item.buildingId ?? item.siteId}`;
        if (item.targetDate) itemTargetDate = new Date(item.targetDate);
      }

      // Determine suggested date
      let suggestedDate: Date;
      if (input.preferredDate) {
        suggestedDate = input.preferredDate;
      } else if (itemTargetDate) {
        suggestedDate = itemTargetDate;
      } else {
        suggestedDate = new Date();
        suggestedDate.setDate(suggestedDate.getDate() + 3);
      }
      suggestedDate = startOfDay(suggestedDate);

      // Get all active technicians
      const techs = await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.companyId, companyId), eq(users.isActive, 1)));

      if (techs.length === 0) {
        return {
          suggestedDate,
          suggestedTechnicianId: null,
          suggestedTechnicianName: null,
          rationale: "No active technicians found. Date selected based on target/preferred date.",
          itemTitle,
        };
      }

      // Count existing items per tech on the suggested date
      const dayStart = startOfDay(suggestedDate);
      const dayEnd = endOfDay(suggestedDate);

      const dayJobs = await db
        .select({ leadTechnicianId: jobs.leadTechnicianId })
        .from(jobs)
        .where(and(eq(jobs.companyId, companyId), gte(jobs.scheduledDate, dayStart), lte(jobs.scheduledDate, dayEnd)));

      const dayAw = await db
        .select({ assignedTechnicianIds: approvedWork.assignedTechnicianIds })
        .from(approvedWork)
        .where(and(eq(approvedWork.companyId, companyId), gte(approvedWork.scheduledDate, dayStart), lte(approvedWork.scheduledDate, dayEnd)));

      const dayWo = await db
        .select({ assignedTechnicianIds: workOrders.assignedTechnicianIds })
        .from(workOrders)
        .where(and(eq(workOrders.companyId, companyId), gte(workOrders.scheduledDate, dayStart), lte(workOrders.scheduledDate, dayEnd)));

      const loadCount = new Map<number, number>(techs.map(t => [t.id, 0]));

      for (const j of dayJobs) {
        if (j.leadTechnicianId && loadCount.has(j.leadTechnicianId)) {
          loadCount.set(j.leadTechnicianId, (loadCount.get(j.leadTechnicianId) ?? 0) + 1);
        }
      }
      for (const aw of dayAw) {
        for (const tid of ((aw.assignedTechnicianIds as number[] | null) ?? [])) {
          if (loadCount.has(tid)) loadCount.set(tid, (loadCount.get(tid) ?? 0) + 1);
        }
      }
      for (const wo of dayWo) {
        for (const tid of ((wo.assignedTechnicianIds as number[]) ?? [])) {
          if (loadCount.has(tid)) loadCount.set(tid, (loadCount.get(tid) ?? 0) + 1);
        }
      }

      // Pick least loaded technician
      let minLoad = Infinity;
      let suggestedTechId: number | null = null;
      for (const [tid, count] of Array.from(loadCount.entries())) {
        if (count < minLoad) { minLoad = count; suggestedTechId = tid; }
      }

      const suggestedTech = techs.find(t => t.id === suggestedTechId);

      const dateReason = input.preferredDate ? "preferred date" : itemTargetDate ? "item target date" : "3 days from today";
      const techReason = suggestedTech
        ? `${suggestedTech.name ?? "Unknown"} has the fewest assignments (${minLoad}) on this day`
        : "no technician available";

      return {
        suggestedDate,
        suggestedTechnicianId: suggestedTechId,
        suggestedTechnicianName: suggestedTech?.name ?? null,
        rationale: `Date: ${dateReason}. Technician: ${techReason}.`,
        itemTitle,
      };
    }),

  /**
   * applySchedule — Applies a schedule to a queue item.
   * Always requires explicit user action (never auto-applied).
   * Verifies ownership, non-terminal status, and overwrite permission.
   */
  applySchedule: officeProcedure
    .input(z.object({
      itemType: ITEM_TYPE,
      itemId: z.number().int().positive(),
      scheduledDate: z.date(),
      technicianIds: z.array(z.number().int().positive()).optional(),
      overwrite: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const companyId = ctx.user.companyId!;
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Validate technicians belong to company and are active
      if (input.technicianIds && input.technicianIds.length > 0) {
        const techRows = await db
          .select({ id: users.id, companyId: users.companyId, isActive: users.isActive })
          .from(users)
          .where(inArray(users.id, input.technicianIds));
        for (const t of techRows) {
          if (t.companyId !== companyId || t.isActive !== 1) {
            throw new TRPCError({ code: "FORBIDDEN", message: "One or more technicians are invalid or inactive" });
          }
        }
        if (techRows.length !== input.technicianIds.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "One or more technicians not found" });
        }
      }

      if (input.itemType === "job") {
        const rows = await db.select().from(jobs).where(eq(jobs.id, input.itemId)).limit(1);
        const item = rows[0];
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        if (item.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if ((TERMINAL_JOB_STATUSES as readonly string[]).includes(item.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot schedule a job with status '${item.status}'` });
        }
        if (item.scheduledDate && !input.overwrite) {
          throw new TRPCError({ code: "CONFLICT", message: "Job is already scheduled. Set overwrite=true to replace." });
        }
        if (item.finalizedAt) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot modify a finalized job" });
        }

        await db.update(jobs).set({
          scheduledDate: input.scheduledDate,
          status: "scheduled",
          ...(input.technicianIds?.[0] ? { leadTechnicianId: input.technicianIds[0] } : {}),
        }).where(eq(jobs.id, input.itemId));

        void logActivity({
          ctx,
          entityType: "job",
          entityId: input.itemId,
          eventType: "scheduling_automation.applied",
          title: `Job scheduled via Scheduling Automation`,
          newValue: input.scheduledDate.toISOString().slice(0, 10),
        });

      } else if (input.itemType === "approved_work") {
        const rows = await db.select().from(approvedWork).where(eq(approvedWork.id, input.itemId)).limit(1);
        const item = rows[0];
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        if (item.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if ((TERMINAL_AW_STATUSES as readonly string[]).includes(item.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot schedule approved work with status '${item.status}'` });
        }
        if (item.scheduledDate && !input.overwrite) {
          throw new TRPCError({ code: "CONFLICT", message: "Approved work is already scheduled. Set overwrite=true to replace." });
        }

        await db.update(approvedWork).set({
          scheduledDate: input.scheduledDate,
          status: "scheduled",
          ...(input.technicianIds ? { assignedTechnicianIds: input.technicianIds } : {}),
        }).where(eq(approvedWork.id, input.itemId));

        void logActivity({
          ctx,
          entityType: "approved_work",
          entityId: input.itemId,
          eventType: "scheduling_automation.applied",
          title: `Approved work scheduled via Scheduling Automation`,
          newValue: input.scheduledDate.toISOString().slice(0, 10),
        });

      } else if (input.itemType === "work_order") {
        const rows = await db.select().from(workOrders).where(eq(workOrders.id, input.itemId)).limit(1);
        const item = rows[0];
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        if (item.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if ((TERMINAL_WO_STATUSES as readonly string[]).includes(item.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot schedule a work order with status '${item.status}'` });
        }
        if (item.scheduledDate && !input.overwrite) {
          throw new TRPCError({ code: "CONFLICT", message: "Work order is already scheduled. Set overwrite=true to replace." });
        }

        await db.update(workOrders).set({
          scheduledDate: input.scheduledDate,
          status: "scheduled",
          ...(input.technicianIds ? { assignedTechnicianIds: input.technicianIds } : {}),
        }).where(eq(workOrders.id, input.itemId));

        void logActivity({
          ctx,
          entityType: "work_order",
          entityId: input.itemId,
          eventType: "scheduling_automation.applied",
          title: `Work order scheduled via Scheduling Automation`,
          newValue: input.scheduledDate.toISOString().slice(0, 10),
        });

      } else {
        // service_tracking
        const rows = await db.select().from(monthlyServiceTracking).where(eq(monthlyServiceTracking.id, input.itemId)).limit(1);
        const item = rows[0];
        if (!item) throw new TRPCError({ code: "NOT_FOUND" });
        if (item.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
        if ((TERMINAL_ST_STATUSES as readonly string[]).includes(item.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot schedule a tracking item with status '${item.status}'` });
        }
        if (item.scheduledDate && !input.overwrite) {
          throw new TRPCError({ code: "CONFLICT", message: "Service tracking item is already scheduled. Set overwrite=true to replace." });
        }

        // Format as YYYY-MM-DD for the date column
        const dateStr = input.scheduledDate.toISOString().slice(0, 10);
        await db.update(monthlyServiceTracking).set({
          scheduledDate: dateStr as any,
          status: "scheduled",
          ...(input.technicianIds ? { assignedTechnicianIds: input.technicianIds } : {}),
        }).where(eq(monthlyServiceTracking.id, input.itemId));

        void logActivity({
          ctx,
          entityType: "monthly_service_tracking",
          entityId: input.itemId,
          eventType: "scheduling_automation.applied",
          title: `Service tracking item scheduled via Scheduling Automation`,
          newValue: dateStr,
        });
      }

      return { success: true as const, itemType: input.itemType, itemId: input.itemId };
    }),
});
