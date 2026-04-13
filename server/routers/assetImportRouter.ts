import { z } from "zod";
import { router, protectedProcedure, officeProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attachments, sites } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { importWorkbookForSite } from "../services/workbookImport";

/**
 * Asset Import Router
 *
 * Both mutations delegate to the canonical workbookImport service so there is a
 * single parsing/validation/upsert pipeline for all device categories.
 *
 * - importAssetsFromExcel: job-based path — downloads the latest Excel attachment
 *   for a job and imports it for the job's site.
 * - importAllFromFile: direct base64 upload path — used by the Quick Import UI.
 */
export const assetImportRouter = router({
  /**
   * Import all device categories from the latest Excel file attached to a job.
   */
  importAssetsFromExcel: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { jobId } = input;
      const companyId = ctx.user.companyId;

      if (!companyId) throw new Error("User must belong to a company");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify job access and get siteId
      const { jobs } = await import("../../drizzle/schema");
      const [job] = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
        .limit(1);

      if (!job) throw new Error("Job not found or access denied");
      if (!job.siteId) throw new Error("Job must be linked to a site");

      // Find latest Excel attachment
      const excelMimeTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel.sheet.macroEnabled.12",
        "application/vnd.ms-excel",
      ];

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.entityType, "job"),
            eq(attachments.entityId, jobId),
            eq(attachments.uploadStatus, "completed"),
          ),
        )
        .orderBy(desc(attachments.createdAt))
        .limit(1);

      if (!attachment) {
        throw new Error("No file found for this job. Please upload an Excel file first.");
      }

      if (!excelMimeTypes.includes(attachment.mimeType || "")) {
        throw new Error(
          `File must be an Excel file (.xlsx, .xlsm, or .xls). Found: ${attachment.fileName}`,
        );
      }

      // Download and run the canonical import pipeline
      const response = await fetch(attachment.fileUrl);
      if (!response.ok) throw new Error("Failed to download Excel file from storage");

      const fileBuffer = Buffer.from(await response.arrayBuffer());
      const result = await importWorkbookForSite({
        fileBuffer,
        fileName: attachment.fileName,
        siteId: job.siteId,
        companyId,
        userId: ctx.user.id,
      });

      return formatResult(result);
    }),

  /**
   * Quick Import: accept a base64-encoded Excel workbook and import all device
   * categories for the given site in one shot. Used by the Quick Import UI.
   */
  importAllFromFile: officeProcedure
    .input(z.object({
      siteId:   z.number(),
      fileData: z.string(), // base64-encoded Excel file
      fileName: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { siteId, fileData, fileName } = input;
      const companyId = ctx.user.companyId;

      if (!companyId) throw new Error("User must belong to a company");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify site belongs to this company
      const [site] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, siteId), eq(sites.companyId, companyId)))
        .limit(1);

      if (!site) throw new Error("Site not found or access denied");

      const fileBuffer = Buffer.from(fileData, "base64");
      const result = await importWorkbookForSite({
        fileBuffer,
        fileName,
        siteId,
        companyId,
        userId: ctx.user.id,
      });

      return formatResult(result);
    }),
});

// ─── Response formatter ───────────────────────────────────────────────────────

/**
 * Normalise the WorkbookImportSummary into the shape the frontend expects.
 * sprinklerSystems and sprinklerDevices are kept at 0 for backward compat;
 * sprinkler sheet data is rolled up into fireAlarm.
 */
function formatResult(result: Awaited<ReturnType<typeof importWorkbookForSite>>) {
  return {
    success: true,
    siteFieldsUpdated: result.siteFieldsUpdated,
    deviceCounts: {
      fireAlarm:       result.counts.fireAlarm,
      extinguishers:   result.counts.extinguishers,
      emergencyLights: result.counts.emergencyLights,
      smokeAlarms:     result.counts.smokeAlarms,
      backflows:       result.counts.backflows,
      // Sprinklers are now folded into fireAlarm; kept for API compat
      sprinklerSystems: 0,
      sprinklerDevices: 0,
      total:           result.counts.total,
    },
    excludedRowsCount: result.excludedRowsCount,
    classifiedSheets: result.classifiedSheets,
    message: result.message,
  };
}
