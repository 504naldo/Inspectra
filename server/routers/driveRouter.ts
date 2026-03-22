import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminOrOfficeProcedure } from "../_core/trpc";
import * as db from "../db";
import { getValidGoogleToken } from "../_core/googleAuth";
import { uploadReportToDrive } from "../_core/driveUpload";
import { storageGet } from "../storage";

export const driveRouter = router({
  /**
   * Manually save a report to Google Drive.
   */
  saveReport: adminOrOfficeProcedure
    .input(z.object({
      reportId: z.number(),
      jobId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      // Get report
      const report = await db.getReportById(input.reportId);
      if (!report) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }

      if (report.googleDriveUrl) {
        return {
          success: true,
          alreadySaved: true,
          driveUrl: report.googleDriveUrl,
        };
      }

      if (!report.fileUrl && !report.fileKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Report has no generated PDF. Generate the report first.",
        });
      }

      // Get job and site info for folder naming
      const job = await db.getJobById(input.jobId);
      const site = job ? await db.getSiteById(job.siteId) : null;
      const customerOrg = job ? await db.getCustomerOrgById(job.customerOrgId) : null;

      // Download PDF from S3
      let pdfBuffer: Buffer;
      try {
        const pdfUrl = report.fileUrl || (await storageGet(report.fileKey!)).url;
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) throw new Error(`PDF download failed: ${pdfResponse.status}`);
        pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      } catch (error) {
        console.error("[Drive] PDF download failed:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve the report PDF.",
        });
      }

      // Build filename
      const dateStr = new Date().toISOString().split("T")[0];
      const reportType = report.title?.toLowerCase().includes("annual") || report.title?.toLowerCase().includes("compliance")
        ? "Annual"
        : "Deficiency";
      const fileName = `${dateStr} ${reportType} Report - ${report.reportNumber || "Report"}.pdf`;

      // Upload to Drive
      const result = await uploadReportToDrive({
        userId: ctx.user.id,
        pdfBuffer,
        fileName,
        customerOrgName: customerOrg?.name || "Unknown Customer",
        siteName: site?.name || "Unknown Site",
      });

      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to upload to Google Drive. You may need to log out and log back in to grant Drive permissions.",
        });
      }

      // Save the Drive URL to the report record
      await db.updateReport(input.reportId, {
        googleDriveUrl: result.webViewLink,
      });

      return {
        success: true,
        alreadySaved: false,
        driveUrl: result.webViewLink,
        fileId: result.fileId,
      };
    }),

  /**
   * Check if current user has Drive connected.
   */
  checkConnection: adminOrOfficeProcedure.query(async ({ ctx }) => {
    const token = await getValidGoogleToken(ctx.user.id);
    return { connected: token !== null };
  }),
});
