import { assertAttachmentDestination, assertAttachmentLinksUnchanged, requireUploadedAttachment, withAttachmentWrite, filterAuthorizedAttachments } from "../attachmentAccess";
import { resolveAuthorizedStorageDownload } from "../storageDownload";
import { z } from "zod";
import { callerIsPlatformOperator } from "../_core/actorContext";
import { router, protectedProcedure,
  officeProcedure,
  technicianProcedure, } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, assertJobCompany, createAttachment } from "../db";
import { attachments, devices, jobs, sites } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as XLSX from "xlsx";
import fetch from "node-fetch";
import { safeToLower, safeIncludes, safeTrim } from "../safeStringHelpers";
import { assertSiteCompany, assertEntityCompany, getAttachmentOwnerCompanyId, } from "../tenantGuards";
import { safeXlsxRead } from "../_core/safeXlsxRead";
import { importWorkbookForSite } from "../services/workbookImport";

export const filesRouter = router({
  // Upload file to S3 and return URL
  uploadToS3: technicianProcedure
    .input(
      z.object({
        fileName: z.string(),
        fileSize: z.number(),
        mimeType: z.string(),
        companyId: z.number(),
        jobId: z.number(),
        fileData: z.string(), // base64 encoded file data
      })
    )
    .mutation(async ({ input, ctx }) => withAttachmentWrite(
      ctx, "files.uploadToS3", [{ entityType: "job", entityId: input.jobId }], async ([parent]) => {

      const randomSuffix = Math.random().toString(36).substring(7);
      const fileKey = `${parent.companyId}/jobs/${input.jobId}/${input.fileName}-${randomSuffix}`;
      
      // Decode base64 file data
      const buffer = Buffer.from(input.fileData, "base64");
      
      // Import storage helper
      const { storagePut } = await import("../storage");
      
      // Fallback for empty MIME types (Chrome mobile/desktop often sends "" or generic types for .xlsm)
      const contentType = input.mimeType?.trim() || "application/octet-stream";
      
      // Upload to S3
      const { url } = await storagePut(fileKey, buffer, contentType);
      
      // Persist provenance in the same locked transaction. A later compatibility
      // registration can only return this row, never attach an arbitrary key.
      return createAttachment({
        companyId: parent.companyId,
        entityType: "job",
        entityId: input.jobId,
        jobId: parent.jobId,
        siteId: parent.siteId,
        uploadedById: ctx.user.id,
        fileName: input.fileName,
        fileKey,
        fileUrl: url,
        mimeType: contentType,
        fileSize: buffer.length,
        uploadStatus: "completed",
        importStatus: "none",
      });
    })),

  // List files for a job
  listByJob: technicianProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify the job belongs to the caller's company before returning attachments.
      const [job] = await db
        .select({ companyId: jobs.companyId })
        .from(jobs)
        .where(eq(jobs.id, input.jobId));

      if (!job ||
        ( job.companyId !== ctx.user.companyId && !callerIsPlatformOperator())) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied." });
      }

      const files = await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.entityType, "job"),
            eq(attachments.entityId, input.jobId)
          )
        )
        .orderBy(attachments.createdAt);

      return filterAuthorizedAttachments(files, ctx.user);
    }),

  // Create file attachment
  create: technicianProcedure
    .input(
      z.object({
        entityType: z.enum(["inspection_result", "deficiency", "repair", "device", "job", "site", "customer_org",]),
        entityId: z.number(),
        siteId: z.number().optional(),
        jobId: z.number().optional(),
        fileName: z.string(),
        fileKey: z.string(),
        fileUrl: z.string(),
        mimeType: z.string().optional(),
        fileSize: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const attachment = await requireUploadedAttachment(input, input.fileKey, ctx.user);
      // A lost registration response is safe to replay, including after seal:
      // all authoritative metadata comes from the already-persisted upload.
      return { ...attachment, insertId: attachment.id };
    }),

  // Preview Excel import
  previewImportExcel: officeProcedure
    .input(z.object({ 
      fileId: z.number(),
      sheetName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable", });

      // Get file record
      const [file] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, input.fileId));

      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      } await assertAttachmentDestination(file, ctx.user);

      // Download file
      const downloadUrl = await resolveAuthorizedStorageDownload(file);
      if (!downloadUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment has no downloadable file" });
      const response = await fetch(downloadUrl, { redirect: "error" });
      if (!response.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file", });
      }

      const buffer = await response.buffer();
      const workbook = await safeXlsxRead(buffer, { type: "buffer" });

      // Helper: Detect if sheet is a device sheet
      const isDeviceSheet = (sheetName: string, sheet: any): { isDevice: boolean; reason: string } => {
        const lowerName = safeToLower(sheetName);
        if (!lowerName) {
          return { isDevice: false, reason: "Invalid sheet name" };
        }
        
        // Exclude sheets with pricing/labour keywords
        const excludeKeywords = ["labour", "labor", "rate", "pricing", "cost", "invoice", "summary", "notes", "legend",];
        if (excludeKeywords.some(kw => lowerName.includes(kw))) {
          return { isDevice: false, reason: "Excluded by keyword" };
        }
        
        // Get first 10 rows to check headers
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        const first10Rows = rows.slice(0, 10);
        const allText = first10Rows.flat().map(cell => safeToLower(cell)).join(" ");
        
        // Device sheet indicators
        const deviceKeywords = ["device", "location", "serial", "smoke", "heat", "extinguisher", "emergency light", "pull station", "unit #",];
        const matchCount = deviceKeywords.filter(kw => allText.includes(kw)).length;
        
        if (matchCount >= 2) {
          return { isDevice: true, reason: `Matched ${matchCount} device keywords`, };
        }
        
        return { isDevice: false, reason: "Not enough device keywords" };
      };

      // Parse sheets with fuzzy matching
      const categories = {
        fireAlarm: [] as any[],
        extinguishers: [] as any[],
        emergencyLights: [] as any[],
        sprinkler: [] as any[],
      };

      let totalRows = 0;
      let hasSiteSheet = false;
      let sitePreview: any = null;
      const availableSheets: Array<{ name: string; isDevice: boolean; reason: string; rowCount: number; }> = [];

      workbook.SheetNames.forEach(sheetName => {
        const lowerName = safeToLower(sheetName);
        if (!lowerName) return;
        const sheet = workbook.Sheets[sheetName];
        
        // Detect if this is a device sheet
        const detection = isDeviceSheet(sheetName, sheet);
        const rows = XLSX.utils.sheet_to_json(sheet);
        availableSheets.push({
          name: sheetName,
          isDevice: detection.isDevice,
          reason: detection.reason,
          rowCount: rows.length,
        });
        
        // Check for Site sheet
        if (lowerName.includes("site") || lowerName.includes("building") || lowerName.includes("property") || lowerName.includes("info")) {
          hasSiteSheet = true;
          // Parse as key/value pairs for preview
          const siteRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", }) as any[][];
          
          const extractValue = (targetKeys: string[]): string => {
            for (const row of siteRows) {
              if (row.length < 3) continue;
              const key = safeTrim(safeToLower(row[0]));
              // Try column 3 first (index 2), then column 2 (index 1)
              const value = String(row[2] || row[1] || "").trim();
              if (targetKeys.some(tk => key.includes(safeToLower(tk))) && value) {
                return value;
              }
            }
            return "";
          };
          
          sitePreview = {
            name: extractValue(["site name", "building name", "property name", "name",]),
            address: extractValue(["address", "street"]),
            city: extractValue(["city", "municipality"]),
            contactName: extractValue(["contact name", "contact", "site contact",]),
            contactPhone: extractValue(["contact phone", "phone", "telephone"]),
          };
          return; // Skip adding to device categories
        }
        
        // Skip non-device sheets
        if (!detection.isDevice) {
          return;
        }

        if (lowerName.includes("exting")) {
          categories.extinguishers.push(...rows);
          totalRows += rows.length;
        } else if (lowerName.includes("emerg") || lowerName.includes("exit") || lowerName.includes("light")) {
          categories.emergencyLights.push(...rows);
          totalRows += rows.length;
        } else if (lowerName.includes("sprink")) {
          categories.sprinkler.push(...rows);
          totalRows += rows.length;
        } else if (
          lowerName.includes("alarm") ||
          lowerName.includes("device") ||
          lowerName.includes("smoke")
        ) {
          categories.fireAlarm.push(...rows);
          totalRows += rows.length;
        }
      });

      await withAttachmentWrite(ctx, "files.previewImportExcel", [file], async (_parents, tx) => {
        await assertAttachmentLinksUnchanged(file);
        await tx.update(attachments).set({ importStatus: "previewed" }).where(eq(attachments.id, input.fileId));
      });

      // Determine which sheet to use
      let selectedSheet = input.sheetName;
      if (!selectedSheet) {
        // Smart default: first device sheet (non-ignored)
        selectedSheet = availableSheets.find(s => s.isDevice)?.name || availableSheets[0]?.name || "";
      }
      
      // If a specific sheet is selected, only process that sheet
      if (input.sheetName && typeof input.sheetName === 'string' && workbook.Sheets[input.sheetName]) {
        const sheet = workbook.Sheets[input.sheetName];
        const lowerName = safeToLower(input.sheetName);
        const rows = XLSX.utils.sheet_to_json(sheet);
        
        // Clear categories and only add from selected sheet
        categories.fireAlarm = [];
        categories.extinguishers = [];
        categories.emergencyLights = [];
        categories.sprinkler = [];
        totalRows = rows.length;
        
        if (lowerName.includes("exting")) {
          categories.extinguishers = rows;
        } else if (lowerName.includes("emerg") || lowerName.includes("exit") || lowerName.includes("light")) {
          categories.emergencyLights = rows;
        } else if (lowerName.includes("sprink")) {
          categories.sprinkler = rows;
        } else if (lowerName.includes("alarm") || lowerName.includes("device") || lowerName.includes("smoke")) {
          categories.fireAlarm = rows;
        }
      }

      return {
        totalRows,
        hasSiteSheet,
        sitePreview,
        availableSheets,
        selectedSheet,
        counts: {
          fireAlarm: categories.fireAlarm.length,
          extinguishers: categories.extinguishers.length,
          emergencyLights: categories.emergencyLights.length,
          sprinkler: categories.sprinkler.length,
        },
        sampleRows: {
          fireAlarm: categories.fireAlarm.slice(0, 10),
          extinguishers: categories.extinguishers.slice(0, 10),
          emergencyLights: categories.emergencyLights.slice(0, 10),
          sprinkler: categories.sprinkler.slice(0, 10),
        },
      };
    }),

  // Import Excel devices (idempotent)
  importExcelDevices: officeProcedure
    .input(
      z.object({
        fileId: z.number(),
        siteId: z.number(),
        jobId: z.number(),
        selectedSheets: z.array(z.string()).optional(), // Optional: if not provided, import all device sheets
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable", });

      if (!ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User must belong to a company", });
      }

      // Stamp created devices with the site's company (not ctx.user) so a
      // cross-company admin import attributes them to the target company.
      const targetSite = await assertSiteCompany(input.siteId, ctx.user.companyId);
      const targetCompanyId = targetSite.companyId;
      const targetJob =
      await assertJobCompany(input.jobId, ctx.user.companyId);
      if (
        targetJob.siteId !== targetSite.id ||
        targetJob.companyId !== targetSite.companyId ||
        targetJob.customerOrgId !== targetSite.customerOrgId
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Import job and site disagree",
        });

      // Get file record
      const [file] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, input.fileId));

      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      }
      const source = await assertAttachmentDestination(file, ctx.user);
      if (
        source.companyId !== targetCompanyId ||
        source.customerOrgId !== targetSite.customerOrgId ||
        (source.siteId != null && source.siteId !== targetSite.id)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Import source and destination disagree",
        });
      }

      // Download file
      const downloadUrl = await resolveAuthorizedStorageDownload(file);
      if (!downloadUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "Attachment has no downloadable file" });
      const response = await fetch(downloadUrl, { redirect: "error" });
      if (!response.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file", });
      }

      const buffer = await response.buffer();
      return withAttachmentWrite(ctx, "files.importExcelDevices", [
        file, { entityType: "job", entityId: input.jobId },
      ], async (_parents, tx) => {
        const currentFile = await assertAttachmentLinksUnchanged(file);
        if (currentFile.fileKey !== file.fileKey || (!file.fileKey && currentFile.fileUrl !== file.fileUrl)) {
          throw new TRPCError({ code: "CONFLICT", message: "Import source changed. Preview it again." });
        }
        const currentJob = await assertJobCompany(input.jobId, ctx.user.companyId!);
        const currentSite = await assertSiteCompany(input.siteId, ctx.user.companyId!);
        if (currentSite.companyId !== targetCompanyId ||
            currentSite.customerOrgId !== targetSite.customerOrgId ||
            currentJob.siteId !== currentSite.id ||
            currentJob.companyId !== currentSite.companyId ||
            currentJob.customerOrgId !== currentSite.customerOrgId) {
          throw new TRPCError({ code: "CONFLICT", message: "Import destination changed. Preview it again." });
        }
        const result = await importWorkbookForSite({
          fileBuffer: buffer, fileName: currentFile.fileName,
          siteId: input.siteId, companyId: targetCompanyId, customerOrgId: targetSite.customerOrgId, userId: ctx.user.id,
          selectedSheets: input.selectedSheets,
          preserveSourceOrder: true,
        });
        const legacyCounts = (counts: typeof result.counts) => ({
          fireAlarm: counts.fireAlarm + counts.smokeAlarms,
          extinguishers: counts.extinguishers, emergencyLights: counts.emergencyLights,
          sprinkler: 0,
        });
        const imported = legacyCounts(result.insertedCounts);
        const updated = legacyCounts(result.updatedCounts);
        const excluded = result.excludedRows.map(row => ({ ...row, sheet: row.sheetName }));
        await tx.update(attachments).set({
          importStatus: "imported", importSummary: { imported, updated, excluded },
        }).where(eq(attachments.id, input.fileId));
        return {
          imported, updated, excluded,
          siteUpdated: { fieldsUpdated: result.siteFieldsUpdated, updatedFields: result.siteUpdatedFields },
        };
      });
    }),
});
