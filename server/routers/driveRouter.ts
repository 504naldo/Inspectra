import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminOrOfficeProcedure } from "../_core/trpc";
import * as db from "../db";
import { getValidGoogleToken } from "../_core/googleAuth";
import { uploadReportToDrive } from "../_core/driveUpload";
import { storageGet, storagePut } from "../storage";
import { nanoid } from "nanoid";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

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

  /**
   * List the contents of a Drive folder (folders + spreadsheet files only).
   * If folderId is omitted, lists the Drive root.
   */
  listFolder: adminOrOfficeProcedure
    .input(z.object({ folderId: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      const parent = input.folderId ? `'${input.folderId}'` : "'root'";
      const q = `${parent} in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or mimeType='application/vnd.google-apps.spreadsheet' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel' or name contains '.xlsm' or name contains '.csv')`;

      const url = new URL(`${DRIVE_API}/files`);
      url.searchParams.set("q", q);
      url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,size)");
      url.searchParams.set("orderBy", "folder,name");
      url.searchParams.set("pageSize", "100");

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error("[Drive] listFolder failed:", response.status, body);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list Drive folder: ${response.status}`,
        });
      }

      const data = (await response.json()) as {
        files: {
          id: string;
          name: string;
          mimeType: string;
          modifiedTime: string;
          size?: string;
        }[];
      };

      const items = data.files.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder: f.mimeType === "application/vnd.google-apps.folder",
        modifiedTime: f.modifiedTime,
        size: f.size,
      }));

      return { items };
    }),

  /**
   * Search for a folder by name anywhere in Drive.
   */
  findFolder: adminOrOfficeProcedure
    .input(z.object({ name: z.string() }))
    .query(async ({ input, ctx }) => {
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      const q = `name='${input.name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

      const url = new URL(`${DRIVE_API}/files`);
      url.searchParams.set("q", q);
      url.searchParams.set("fields", "files(id,name)");
      url.searchParams.set("pageSize", "10");

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        return { folders: [] };
      }

      const data = (await response.json()) as {
        files: { id: string; name: string }[];
      };

      return { folders: data.files };
    }),

  /**
   * Download a file from Drive, upload to S3, optionally create attachment record.
   * Returns base64 fileData for the import pipeline + attachment info.
   */
  downloadFile: adminOrOfficeProcedure
    .input(
      z.object({
        fileId: z.string(),
        siteId: z.number().optional(),
        companyId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      // 1. Fetch file metadata
      const metaResponse = await fetch(
        `${DRIVE_API}/files/${input.fileId}?fields=id,name,mimeType,size`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!metaResponse.ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Drive file not found or no access." });
      }
      const meta = (await metaResponse.json()) as {
        id: string;
        name: string;
        mimeType: string;
        size?: string;
      };

      const isGoogleSheet = meta.mimeType === "application/vnd.google-apps.spreadsheet";

      // 2. Download (or export) the file
      let downloadResponse: Response;
      let fileName: string;
      let mimeType: string;

      if (isGoogleSheet) {
        // Export Google Sheets as .xlsx
        const exportMime =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        downloadResponse = await fetch(
          `${DRIVE_API}/files/${input.fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        fileName = meta.name.endsWith(".xlsx") ? meta.name : `${meta.name}.xlsx`;
        mimeType = exportMime;
      } else {
        downloadResponse = await fetch(
          `${DRIVE_API}/files/${input.fileId}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        fileName = meta.name;
        mimeType = meta.mimeType;
      }

      if (!downloadResponse.ok) {
        const body = await downloadResponse.text().catch(() => "");
        console.error("[Drive] download failed:", downloadResponse.status, body);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to download file from Drive.",
        });
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileData = buffer.toString("base64");

      // 3. Upload to S3
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileKey = `drive-import/${nanoid()}-${safeFileName}`;
      const { url: fileUrl } = await storagePut(fileKey, buffer, mimeType);

      // 4. Create attachment record if siteId provided
      let attachmentId: number | null = null;
      if (input.siteId && input.companyId) {
        const attachment = await db.createAttachment({
          entityType: "site",
          entityId: input.siteId,
          uploadedById: ctx.user.id,
          fileName,
          fileKey,
          fileUrl,
          mimeType,
          fileSize: buffer.length,
          siteId: input.siteId,
        });
        attachmentId = (attachment as any)?.id ?? null;
      }

      return {
        attachmentId,
        fileName,
        fileUrl,
        fileKey,
        fileData,
        mimeType,
      };
    }),
});
