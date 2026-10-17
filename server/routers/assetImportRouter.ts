import { z } from "zod";
import { router, officeProcedure } from "../_core/trpc";
import { getDb, assertJobNotFinalized } from "../db";
import { attachments } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { importWorkbookForSite, previewWorkbookForSite } from "../services/workbookImport";
import { assertSiteCompany, getJobForCompany } from "../tenantGuards";
import { assertImportDestination } from "../importDestination";
import { assertAttachmentDestination, assertAttachmentLinksUnchanged, withAttachmentWrite } from "../attachmentAccess";
import { resolveAuthorizedStorageDownload } from "../storageDownload";
import { TRPCError } from "@trpc/server";

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
const workbookUploadInput = z.object({
  siteId: z.number(),
  fileData: z.string(),
  fileName: z.string(),
});

export const assetImportRouter = router({
  /**
   * Import all device categories from the latest Excel file attached to a job.
   */
  importAssetsFromExcel: officeProcedure
    .input(z.object({ jobId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const { jobId } = input;
      const job = await getJobForCompany(jobId, ctx.user.companyId!);
      const destination = await assertImportDestination({
        companyId: job.companyId,
        siteId: job.siteId,
        customerOrgId: job.customerOrgId,
      });
      if (!destination.site) throw new TRPCError({ code: "BAD_REQUEST", message: "Job must be linked to a site" });
      await assertJobNotFinalized(jobId);
      const db = await getDb();
      if (!db) throw new Error("Database not available");

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

      const source = await assertAttachmentDestination(attachment, ctx.user);
      if (
        source.companyId !== job.companyId ||
        source.customerOrgId !== job.customerOrgId ||
        (source.siteId != null && source.siteId !== destination.site.id) ||
        (source.jobId != null && source.jobId !== job.id)
      ) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Import source and destination disagree" });
      }
      const downloadUrl = await resolveAuthorizedStorageDownload(attachment);
      if (!downloadUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment has no downloadable file" });
      const response = await fetch(downloadUrl, { redirect: "error" });
      if (!response.ok) throw new Error("Failed to download Excel file from storage");

      const fileBuffer = Buffer.from(await response.arrayBuffer());
      return withAttachmentWrite(ctx, "assetImport.importAssetsFromExcel", [attachment,
        { entityType: "job", entityId: jobId },
      ], async () => {
        const currentFile = await assertAttachmentLinksUnchanged(attachment);
        if (currentFile.fileKey !== attachment.fileKey ||
            (!attachment.fileKey && currentFile.fileUrl !== attachment.fileUrl)) {
          throw new TRPCError({ code: "CONFLICT", message: "Import source changed. Preview it again." });
        }
        const currentJob = await getJobForCompany(jobId, ctx.user.companyId!);
        if (currentJob.siteId !== destination.site!.id || currentJob.companyId !== job.companyId ||
            currentJob.customerOrgId !== job.customerOrgId) {
          throw new TRPCError({ code: "CONFLICT", message: "Import destination changed. Preview it again." });
        }
        return formatResult(await importWorkbookForSite({
          fileBuffer, fileName: currentFile.fileName, siteId: destination.site!.id,
          companyId: job.companyId, customerOrgId: job.customerOrgId, userId: ctx.user.id,
        }));
      });
    }),

  /** Preview the canonical workbook plan without writing any records. */
  previewAllFromFile: officeProcedure.input(workbookUploadInput)
    .mutation(async ({ input, ctx }) => {
      const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
      await assertImportDestination({ companyId: site.companyId, siteId: site.id, customerOrgId: site.customerOrgId });
      return previewWorkbookForSite({
        fileBuffer: Buffer.from(input.fileData, "base64"),
        fileName: input.fileName,
        siteId: site.id,
        companyId: site.companyId,
        customerOrgId: site.customerOrgId,
        userId: ctx.user.id,
      });
    }),

  /** Quick Import revalidates the workbook and current saved identities. */
  importAllFromFile: officeProcedure.input(workbookUploadInput)
    .mutation(async ({ input, ctx }) => {
      const site = await assertSiteCompany(input.siteId, ctx.user.companyId!);
      await assertImportDestination({ companyId: site.companyId, siteId: site.id, customerOrgId: site.customerOrgId });
      const result = await importWorkbookForSite({
        fileBuffer: Buffer.from(input.fileData, "base64"),
        fileName: input.fileName,
        siteId: site.id,
        companyId: site.companyId,
        customerOrgId: site.customerOrgId,
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
    insertedCount: result.insertedCount,
    updatedCount: result.updatedCount,
    excludedRowsCount: result.excludedRowsCount,
    excludedRows: result.excludedRows,
    classifiedSheets: result.classifiedSheets,
    message: result.message,
  };
}
