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
   * List Shared Drives the user has access to.
   */
  listSharedDrives: adminOrOfficeProcedure.query(async ({ ctx }) => {
    const accessToken = await getValidGoogleToken(ctx.user.id);
    if (!accessToken) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Google account not connected. Please log out and log back in.",
      });
    }

    const url = new URL(`${DRIVE_API}/drives`);
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("fields", "drives(id,name)");

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      // Non-fatal — just return empty list if shared drives aren't accessible
      return { drives: [] as { id: string; name: string }[] };
    }

    const data = (await response.json()) as { drives: { id: string; name: string }[] };
    return { drives: data.drives ?? [] };
  }),

  /**
   * List the contents of a Drive folder (folders + spreadsheet files only).
   * If folderId is omitted, lists the Drive root.
   * Pass sharedWithMe=true to list files shared with the user instead.
   */
  listFolder: adminOrOfficeProcedure
    .input(z.object({
      folderId: z.string().optional(),
      sharedWithMe: z.boolean().optional(),
      /** When true, return all file types instead of only spreadsheets/folders/PDFs.
       *  Used by the import picker so users can see the full folder contents. */
      allFiles: z.boolean().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      const mimeFilter = `(mimeType='application/vnd.google-apps.folder' or mimeType='application/vnd.google-apps.spreadsheet' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/vnd.ms-excel' or mimeType='application/pdf' or name contains '.xlsm' or name contains '.csv')`;

      let q: string;
      if (input.sharedWithMe) {
        q = `sharedWithMe=true and trashed=false${input.allFiles ? "" : " and " + mimeFilter}`;
      } else {
        const parent = input.folderId ? `'${input.folderId}'` : "'root'";
        q = `${parent} in parents and trashed=false${input.allFiles ? "" : " and " + mimeFilter}`;
      }

      const baseUrl = new URL(`${DRIVE_API}/files`);
      baseUrl.searchParams.set("q", q);
      baseUrl.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,modifiedTime,size,driveId)");
      baseUrl.searchParams.set("orderBy", "folder,name");
      baseUrl.searchParams.set("pageSize", "1000");
      baseUrl.searchParams.set("includeItemsFromAllDrives", "true");
      baseUrl.searchParams.set("supportsAllDrives", "true");

      type DriveFile = { id: string; name: string; mimeType: string; modifiedTime: string; size?: string };
      const allFiles: DriveFile[] = [];
      let pageToken: string | null = null;

      do {
        const url = new URL(baseUrl.toString());
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          let googleMessage = "";
          try {
            const parsed = JSON.parse(body);
            googleMessage = parsed?.error?.message || parsed?.error_description || "";
          } catch {}
          console.error("[Drive] listFolder failed:", response.status, body);
          if (response.status === 401 || response.status === 403) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: googleMessage || "Google Drive access denied (403). The Drive API may not be enabled in Google Cloud Console, or Drive access is restricted by your organization.",
            });
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: googleMessage || `Failed to list Drive folder: ${response.status}`,
          });
        }

        const data = (await response.json()) as { files: DriveFile[]; nextPageToken?: string };
        allFiles.push(...(data.files ?? []));
        pageToken = data.nextPageToken ?? null;
      } while (pageToken);

      const SPREADSHEET_MIMES = new Set([
        "application/vnd.google-apps.spreadsheet",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/vnd.ms-excel.sheet.macroEnabled.12",
        "text/csv",
      ]);

      const items = allFiles.map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        isFolder: f.mimeType === "application/vnd.google-apps.folder",
        isSpreadsheet: SPREADSHEET_MIMES.has(f.mimeType),
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

      const baseUrl = new URL(`${DRIVE_API}/files`);
      baseUrl.searchParams.set("q", q);
      baseUrl.searchParams.set("fields", "nextPageToken,files(id,name)");
      baseUrl.searchParams.set("pageSize", "1000");
      baseUrl.searchParams.set("includeItemsFromAllDrives", "true");
      baseUrl.searchParams.set("supportsAllDrives", "true");
      baseUrl.searchParams.set("corpora", "allDrives");

      const allFolders: { id: string; name: string }[] = [];
      let pageToken: string | null = null;

      do {
        const url = new URL(baseUrl.toString());
        if (pageToken) url.searchParams.set("pageToken", pageToken);

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          return { folders: [] };
        }

        const data = (await response.json()) as { files: { id: string; name: string }[]; nextPageToken?: string };
        allFolders.push(...(data.files ?? []));
        pageToken = data.nextPageToken ?? null;
      } while (pageToken);

      return { folders: allFolders };
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

      if (input.companyId !== undefined && input.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot access data for another company." });
      }

      // 1. Fetch file metadata
      const metaResponse = await fetch(
        `${DRIVE_API}/files/${input.fileId}?fields=id,name,mimeType,size&supportsAllDrives=true`,
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
          `${DRIVE_API}/files/${input.fileId}/export?mimeType=${encodeURIComponent(exportMime)}&supportsAllDrives=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        fileName = meta.name.endsWith(".xlsx") ? meta.name : `${meta.name}.xlsx`;
        mimeType = exportMime;
      } else {
        downloadResponse = await fetch(
          `${DRIVE_API}/files/${input.fileId}?alt=media&supportsAllDrives=true`,
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

  /**
   * Download a spreadsheet from Drive, parse site info, auto-create customer org + site,
   * and return the data so the frontend can continue to the import wizard.
   */
  importFromDrive: adminOrOfficeProcedure
    .input(
      z.object({
        fileId: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        companyId: z.number(),
        customerOrgId: z.number().optional(),
        siteId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot import data for another company." });
      }
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      // 1. Download (or export) file from Drive
      const isGoogleSheet =
        input.mimeType === "application/vnd.google-apps.spreadsheet";
      const downloadUrl = isGoogleSheet
        ? `https://www.googleapis.com/drive/v3/files/${input.fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet&supportsAllDrives=true`
        : `https://www.googleapis.com/drive/v3/files/${input.fileId}?alt=media&supportsAllDrives=true`;

      const fileResponse = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!fileResponse.ok) {
        const errBody = await fileResponse.text().catch(() => "");
        console.error("[Drive] importFromDrive download failed:", fileResponse.status, errBody);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to download file from Google Drive.",
        });
      }

      const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

      // 2. Parse the spreadsheet
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const sheetNames = workbook.SheetNames;

      if (sheetNames.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Spreadsheet has no sheets.",
        });
      }

      // 3. Try to extract site info from a dedicated site/summary sheet
      const siteSheetName = sheetNames.find((n) => {
        const l = n.toLowerCase();
        return (
          l.includes("site") ||
          l.includes("summary") ||
          l.includes("info") ||
          l.includes("details")
        );
      });

      const siteInfo: {
        name?: string;
        address?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        contactName?: string;
        contactPhone?: string;
        contactEmail?: string;
        customerOrgName?: string;
      } = {};

      if (siteSheetName) {
        const siteSheet = workbook.Sheets[siteSheetName];
        const siteRows = XLSX.utils.sheet_to_json(siteSheet, {
          header: 1,
          defval: "",
        }) as any[][];

        for (const row of siteRows) {
          if (!row[0] || typeof row[0] !== "string") continue;
          const label = row[0].toString().toLowerCase().trim();
          const value = row[1]?.toString().trim() || "";

          if (label.includes("site name") || label.includes("building name") || label === "name") siteInfo.name = value;
          if (label.includes("address") || label.includes("street")) siteInfo.address = value;
          if (label === "city" || label.includes("city")) siteInfo.city = value;
          if (label.includes("province") || label.includes("state")) siteInfo.state = value;
          if (label.includes("postal") || label.includes("zip")) siteInfo.postalCode = value;
          if (label.includes("contact name") || label.includes("manager")) siteInfo.contactName = value;
          if ((label.includes("contact") && label.includes("phone")) || label === "phone") siteInfo.contactPhone = value;
          if ((label.includes("contact") && label.includes("email")) || label === "email") siteInfo.contactEmail = value;
          if (label.includes("customer") || label.includes("client") || label.includes("organization")) siteInfo.customerOrgName = value;
        }
      }

      // 4. Upsert customer org
      let customerOrgId = input.customerOrgId;
      if (!customerOrgId) {
        const orgName =
          siteInfo.customerOrgName ||
          siteInfo.name ||
          input.fileName.replace(/\.[^.]+$/, "");

        const existingOrgs = await db.getCustomerOrgsByCompany(input.companyId);
        const existing = existingOrgs.find(
          (o: any) => o.name.toLowerCase() === orgName.toLowerCase()
        );

        if (existing) {
          customerOrgId = existing.id;
        } else {
          const newOrg = await db.createCustomerOrg({
            companyId: input.companyId,
            name: orgName,
            contactName: siteInfo.contactName || null,
            contactEmail: siteInfo.contactEmail || null,
            contactPhone: siteInfo.contactPhone || null,
          });
          customerOrgId = (newOrg as any).id;
        }
      }

      // 5. Upsert site
      let siteId = input.siteId;
      if (!siteId) {
        const siteName =
          siteInfo.name || input.fileName.replace(/\.[^.]+$/, "");

        const existingSites = await db.getSitesByCustomerOrg(customerOrgId!);
        const existingSite = existingSites.find(
          (s: any) => s.name.toLowerCase() === siteName.toLowerCase()
        );

        if (existingSite) {
          siteId = existingSite.id;
        } else {
          const newSite = await db.createSite({
            companyId: input.companyId,
            customerOrgId: customerOrgId!,
            name: siteName,
            address: siteInfo.address,
            city: siteInfo.city,
            state: siteInfo.state,
            postalCode: siteInfo.postalCode,
            contactName: siteInfo.contactName,
            contactPhone: siteInfo.contactPhone,
          });
          siteId = (newSite as any).id;
        }
      }

      // 6. Store file in S3 as an audit attachment
      const contentType = isGoogleSheet
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : input.mimeType;
      const safeFileName = (
        isGoogleSheet && !input.fileName.endsWith(".xlsx")
          ? `${input.fileName}.xlsx`
          : input.fileName
      ).replace(/\s+/g, "_");
      const fileKey = `drive-imports/${input.companyId}/${siteId}/${Date.now()}-${safeFileName}`;
      const { url: fileUrl } = await storagePut(fileKey, fileBuffer, contentType);

      await db.createAttachment({
        entityType: "site",
        entityId: siteId!,
        uploadedById: ctx.user.id,
        fileName: safeFileName,
        fileKey,
        fileUrl,
        mimeType: contentType,
        fileSize: fileBuffer.length,
        siteId: siteId!,
      });

      return {
        success: true,
        customerOrgId: customerOrgId!,
        siteId: siteId!,
        siteName: siteInfo.name || input.fileName.replace(/\.[^.]+$/, ""),
        sheetNames,
        siteInfo,
        fileBuffer: fileBuffer.toString("base64"),
        message: `Site "${siteInfo.name || input.fileName}" ready. ${sheetNames.length} sheet(s) found.`,
      };
    }),

  /**
   * Import a PDF inspection report from Google Drive.
   * Downloads the file, extracts text, runs AI extraction, and creates site + devices.
   */
  importPdfFromDrive: adminOrOfficeProcedure
    .input(
      z.object({
        fileId: z.string(),
        fileName: z.string(),
        companyId: z.number(),
        customerOrgId: z.number().optional(),
        siteId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot import data for another company." });
      }
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected. Please log out and log back in.",
        });
      }

      const downloadUrl = `${DRIVE_API}/files/${input.fileId}?alt=media&supportsAllDrives=true&includeItemsFromAllDrives=true`;
      const fileResponse = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!fileResponse.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to download PDF from Google Drive.",
        });
      }

      const pdfBuffer = Buffer.from(await fileResponse.arrayBuffer());
      const { importPdfData } = await import("../_core/pdfImport");

      try {
        return await importPdfData({
          pdfBuffer,
          fileName: input.fileName,
          companyId: input.companyId,
          userId: ctx.user.id,
          customerOrgId: input.customerOrgId,
          siteId: input.siteId,
        });
      } catch (err: any) {
        throw new TRPCError({
          code: err.message?.includes("extract text") ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
          message: err.message || "Failed to import PDF.",
        });
      }
    }),

  /**
   * Import a PDF inspection report from a direct file upload (base64).
   * Same logic as importPdfFromDrive but accepts base64-encoded file data.
   */
  importPdfFromUpload: adminOrOfficeProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileData: z.string(), // base64
        companyId: z.number(),
        customerOrgId: z.number().optional(),
        siteId: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.companyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot import data for another company." });
      }
      const pdfBuffer = Buffer.from(input.fileData, "base64");
      const { importPdfData } = await import("../_core/pdfImport");

      try {
        return await importPdfData({
          pdfBuffer,
          fileName: input.fileName,
          companyId: input.companyId,
          userId: ctx.user.id,
          customerOrgId: input.customerOrgId,
          siteId: input.siteId,
        });
      } catch (err: any) {
        throw new TRPCError({
          code: err.message?.includes("extract text") ? "BAD_REQUEST" : "INTERNAL_SERVER_ERROR",
          message: err.message || "Failed to import PDF.",
        });
      }
    }),
});
