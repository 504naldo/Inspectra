import { router, protectedProcedure, technicianProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { fireAlarmSystems, fireAlarmChecklistTemplates, fireAlarmInspectionResults } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get or create the fire alarm system for a site.
 * Returns the system id.
 */
export async function getOrCreateFireAlarmSystem(siteId: number): Promise<number> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  const existing = await database
    .select({ id: fireAlarmSystems.id })
    .from(fireAlarmSystems)
    .where(eq(fireAlarmSystems.siteId, siteId))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  const result = await database.insert(fireAlarmSystems).values({ siteId });
  return Number((result as any)[0].insertId);
}

/**
 * Pre-populate fire alarm inspection result rows for a job from the active template.
 * Idempotent — skips if results already exist for this job.
 */
export async function populateJobFireAlarmChecklist(jobId: number, siteId: number): Promise<void> {
  const database = await getDb();
  if (!database) return;

  // Idempotency check
  const existing = await database
    .select({ id: fireAlarmInspectionResults.id })
    .from(fireAlarmInspectionResults)
    .where(eq(fireAlarmInspectionResults.jobId, jobId))
    .limit(1);
  if (existing.length > 0) return;

  const fireAlarmSystemId = await getOrCreateFireAlarmSystem(siteId);

  const templates = await database
    .select()
    .from(fireAlarmChecklistTemplates)
    .where(eq(fireAlarmChecklistTemplates.isActive, true))
    .orderBy(fireAlarmChecklistTemplates.sectionOrder, fireAlarmChecklistTemplates.id);

  if (templates.length === 0) return;

  const rows = templates.map((item) => ({
    jobId,
    fireAlarmSystemId,
    checklistItemId: item.id,
    result: "not_tested" as const,
    itemSnapshot: {
      id: item.id,
      sectionName: item.sectionName,
      sectionOrder: item.sectionOrder,
      itemLetter: item.itemLetter,
      itemDescription: item.itemDescription,
      inputType: item.inputType,
      numericLabel: item.numericLabel,
      numericUnit: item.numericUnit,
      hasSubItems: (item as any).hasSubItems ?? false,
      subItems: (item as any).subItems ?? null,
      notApplicableNote: (item as any).notApplicableNote ?? null,
      headerFields: (item as any).headerFields ?? null,
      standardId: item.standardId,
      standardVersion: item.standardVersion,
    },
  }));

  // Batch insert in chunks of 50
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await database.insert(fireAlarmInspectionResults).values(rows.slice(i, i + CHUNK));
  }
}

export const fireAlarmRouter = router({
  // Get fire alarm system by site ID
  getSystemBySite: protectedProcedure
    .input(z.object({ siteId: z.number() }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return null;

      const systems = await database
        .select()
        .from(fireAlarmSystems)
        .where(eq(fireAlarmSystems.siteId, input.siteId))
        .limit(1);

      return systems[0] || null;
    }),

  // Get checklist sections with items (template-level, backward compat)
  getChecklistSections: protectedProcedure.query(async () => {
    const database = await getDb();
    if (!database) return [];

    const items = await database
      .select()
      .from(fireAlarmChecklistTemplates)
      .where(eq(fireAlarmChecklistTemplates.isActive, true))
      .orderBy(fireAlarmChecklistTemplates.sectionOrder, fireAlarmChecklistTemplates.id);

    const sections: Record<string, any> = {};
    items.forEach((item) => {
      const sectionKey = `${item.sectionOrder}-${item.sectionName}`;
      if (!sections[sectionKey]) {
        sections[sectionKey] = {
          id: item.sectionOrder,
          sectionName: item.sectionName,
          sectionOrder: item.sectionOrder,
          notApplicableNote: (item as any).notApplicableNote ?? null,
          headerFields: (item as any).headerFields ?? null,
          items: [],
        };
      }
      sections[sectionKey].items.push(item);
    });

    return Object.values(sections).sort((a, b) => a.sectionOrder - b.sectionOrder);
  }),

  /**
   * Returns the full checklist for a job: all active template items merged with
   * this job's saved results. Use this instead of getChecklistSections + getInspectionResults.
   */
  getJobChecklist: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return [];

      const [templates, jobResults] = await Promise.all([
        database
          .select()
          .from(fireAlarmChecklistTemplates)
          .where(eq(fireAlarmChecklistTemplates.isActive, true))
          .orderBy(fireAlarmChecklistTemplates.sectionOrder, fireAlarmChecklistTemplates.id),
        database
          .select()
          .from(fireAlarmInspectionResults)
          .where(eq(fireAlarmInspectionResults.jobId, input.jobId)),
      ]);

      const byItemId = new Map(jobResults.map((r) => [r.checklistItemId, r]));

      return templates.map((item) => {
        const r = byItemId.get(item.id);
        return {
          id: item.id,
          sectionName: item.sectionName,
          sectionOrder: item.sectionOrder,
          itemLetter: item.itemLetter,
          itemDescription: item.itemDescription,
          inputType: item.inputType as string,
          numericLabel: item.numericLabel,
          numericUnit: item.numericUnit,
          isRequired: item.isRequired,
          hasSubItems: ((item as any).hasSubItems ?? false) as boolean,
          subItems: ((item as any).subItems ?? null) as string[] | null,
          notApplicableNote: ((item as any).notApplicableNote ?? null) as string | null,
          headerFields: ((item as any).headerFields ?? null) as string[] | null,
          resultId: r?.id ?? null,
          result: (r?.result ?? "not_tested") as "pass" | "fail" | "na" | "not_tested",
          numericValue: r?.numericValueRaw ?? null,
          textValue: r?.textValue ?? null,
          notes: r?.notes ?? null,
          fireAlarmSystemId: r?.fireAlarmSystemId ?? null,
        };
      });
    }),

  // Get inspection results for a job (raw, backward compat)
  getInspectionResults: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input }) => {
      const database = await getDb();
      if (!database) return [];

      return database
        .select()
        .from(fireAlarmInspectionResults)
        .where(eq(fireAlarmInspectionResults.jobId, input.jobId));
    }),

  // Save inspection result
  saveInspectionResult: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
        fireAlarmSystemId: z.number(),
        checklistItemId: z.number(),
        result: z.enum(["pass", "fail", "na", "not_tested"]),
        notes: z.string().optional(),
        numericValue: z.string().optional(),
        textValue: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const existing = await database
        .select()
        .from(fireAlarmInspectionResults)
        .where(
          and(
            eq(fireAlarmInspectionResults.jobId, input.jobId),
            eq(fireAlarmInspectionResults.checklistItemId, input.checklistItemId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        await database
          .update(fireAlarmInspectionResults)
          .set({
            result: input.result,
            notes: input.notes || null,
            numericValue: input.numericValue || null,
            textValue: input.textValue || null,
            testedById: ctx.user.id,
            testedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(fireAlarmInspectionResults.id, existing[0].id));

        return { success: true, id: existing[0].id };
      } else {
        const result = await database.insert(fireAlarmInspectionResults).values({
          jobId: input.jobId,
          fireAlarmSystemId: input.fireAlarmSystemId,
          checklistItemId: input.checklistItemId,
          result: input.result,
          notes: input.notes || null,
          numericValue: input.numericValue || null,
          textValue: input.textValue || null,
          testedById: ctx.user.id,
          testedAt: new Date(),
        });

        return { success: true, id: Number((result as any).insertId) };
      }
    }),

  // Create or update fire alarm system
  upsertSystem: protectedProcedure
    .input(
      z.object({
        siteId: z.number(),
        manufacturer: z.string().optional(),
        modelNumber: z.string().optional(),
        operationType: z.enum(["single_stage", "two_stage", "other"]).optional(),
        operationDescription: z.string().optional(),
        connectedToMonitoring: z.boolean().optional(),
        monitoringCentreName: z.string().optional(),
        monitoringCentrePhone: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");

      const existing = await database
        .select()
        .from(fireAlarmSystems)
        .where(eq(fireAlarmSystems.siteId, input.siteId))
        .limit(1);

      if (existing.length > 0) {
        await database
          .update(fireAlarmSystems)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(fireAlarmSystems.id, existing[0].id));

        return { success: true, id: existing[0].id };
      } else {
        const result = await database.insert(fireAlarmSystems).values(input);
        return { success: true, id: Number((result as any).insertId) };
      }
    }),
});
