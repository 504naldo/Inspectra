import { router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { fireAlarmSystems, fireAlarmChecklistTemplates, fireAlarmInspectionResults } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";

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

  // Get checklist sections with items
  getChecklistSections: protectedProcedure.query(async () => {
    const database = await getDb();
    if (!database) return [];
    
    const items = await database
      .select()
      .from(fireAlarmChecklistTemplates)
      .orderBy(fireAlarmChecklistTemplates.sectionOrder, fireAlarmChecklistTemplates.id);
    
    // Group by section
    const sections: Record<string, any> = {};
    items.forEach((item) => {
      const sectionKey = `${item.sectionOrder}-${item.sectionName}`;
      if (!sections[sectionKey]) {
        sections[sectionKey] = {
          id: item.sectionOrder,
          sectionName: item.sectionName,
          sectionOrder: item.sectionOrder,
          items: [],
        };
      }
      sections[sectionKey].items.push(item);
    });
    
    return Object.values(sections).sort((a, b) => a.sectionOrder - b.sectionOrder);
  }),

  // Get inspection results for a job
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
      })
    )
    .mutation(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) throw new Error("Database not available");
      
      // Check if result already exists
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
        // Update existing
        await database
          .update(fireAlarmInspectionResults)
          .set({
            result: input.result,
            notes: input.notes || null,
            testedById: ctx.user.id,
            testedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(fireAlarmInspectionResults.id, existing[0].id));
        
        return { success: true, id: existing[0].id };
      } else {
        // Insert new
        const result = await database.insert(fireAlarmInspectionResults).values({
          jobId: input.jobId,
          fireAlarmSystemId: input.fireAlarmSystemId,
          checklistItemId: input.checklistItemId,
          result: input.result,
          notes: input.notes || null,
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
      
      // Check if system exists
      const existing = await database
        .select()
        .from(fireAlarmSystems)
        .where(eq(fireAlarmSystems.siteId, input.siteId))
        .limit(1);
      
      if (existing.length > 0) {
        // Update
        await database
          .update(fireAlarmSystems)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(fireAlarmSystems.id, existing[0].id));
        
        return { success: true, id: existing[0].id };
      } else {
        // Insert
        const result = await database.insert(fireAlarmSystems).values(input);
        return { success: true, id: Number((result as any).insertId) };
      }
    }),
});
