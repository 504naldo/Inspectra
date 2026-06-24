import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb, assertJobCompany } from "../db";
import { attachments, devices, jobs, sites } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as XLSX from "xlsx";
import fetch from "node-fetch";
import crypto from "crypto";
import { safeToLower, safeIncludes, safeTrim } from "../safeStringHelpers";
import { assertSiteCompany, assertEntityCompany, getAttachmentOwnerCompanyId } from "../tenantGuards";

export const filesRouter = router({
  // Upload file to S3 and return URL
  uploadToS3: protectedProcedure
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
    .mutation(async ({ input, ctx }) => {
      // Use server-side companyId — never trust the client-supplied value.
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "User has no company assignment" });

      const randomSuffix = Math.random().toString(36).substring(7);
      const fileKey = `${companyId}/jobs/${input.jobId}/${input.fileName}-${randomSuffix}`;
      
      // Decode base64 file data
      const buffer = Buffer.from(input.fileData, "base64");
      
      // Import storage helper
      const { storagePut } = await import("../storage");
      
      // Fallback for empty MIME types (Chrome mobile/desktop often sends "" or generic types for .xlsm)
      const contentType = input.mimeType?.trim() || "application/octet-stream";
      
      // Upload to S3
      const { url } = await storagePut(fileKey, buffer, contentType);
      
      return {
        fileKey,
        fileUrl: url,
      };
    }),

  // List files for a job
  listByJob: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify the job belongs to the caller's company before returning attachments.
      const [job] = await db
        .select({ companyId: jobs.companyId })
        .from(jobs)
        .where(eq(jobs.id, input.jobId));

      if (!job || job.companyId !== ctx.user.companyId) {
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

      return files;
    }),

  // Create file attachment
  create: protectedProcedure
    .input(
      z.object({
        entityType: z.enum(["inspection_result", "deficiency", "repair", "device", "job", "site", "customer_org"]),
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
      const companyId = ctx.user.companyId;
      if (!companyId) throw new TRPCError({ code: "FORBIDDEN", message: "User has no company assignment" });

      await assertEntityCompany(input.entityType, input.entityId, companyId);
      if (input.siteId !== undefined) await assertSiteCompany(input.siteId, companyId);
      if (input.jobId !== undefined) await assertJobCompany(input.jobId, companyId);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [attachment] = await db.insert(attachments).values({
        ...input,
        uploadedById: ctx.user.id,
        uploadStatus: "completed",
        importStatus: "none",
      });

      return attachment;
    }),

  // Preview Excel import
  previewImportExcel: protectedProcedure
    .input(z.object({ 
      fileId: z.number(),
      sheetName: z.string().optional() 
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Get file record
      const [file] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, input.fileId));

      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      }

      const ownerCompanyId = await getAttachmentOwnerCompanyId(file);
      if (ownerCompanyId !== null && ownerCompanyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      // Download file
      const response = await fetch(file.fileUrl);
      if (!response.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file" });
      }

      const buffer = await response.buffer();
      const workbook = XLSX.read(buffer, { type: "buffer" });

      // Helper: Detect if sheet is a device sheet
      const isDeviceSheet = (sheetName: string, sheet: any): { isDevice: boolean; reason: string } => {
        const lowerName = safeToLower(sheetName);
        if (!lowerName) {
          return { isDevice: false, reason: "Invalid sheet name" };
        }
        
        // Exclude sheets with pricing/labour keywords
        const excludeKeywords = ["labour", "labor", "rate", "pricing", "cost", "invoice", "summary", "notes", "legend"];
        if (excludeKeywords.some(kw => lowerName.includes(kw))) {
          return { isDevice: false, reason: "Excluded by keyword" };
        }
        
        // Get first 10 rows to check headers
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        const first10Rows = rows.slice(0, 10);
        const allText = first10Rows.flat().map(cell => safeToLower(cell)).join(" ");
        
        // Device sheet indicators
        const deviceKeywords = ["device", "location", "serial", "smoke", "heat", "extinguisher", "emergency light", "pull station", "unit #"];
        const matchCount = deviceKeywords.filter(kw => allText.includes(kw)).length;
        
        if (matchCount >= 2) {
          return { isDevice: true, reason: `Matched ${matchCount} device keywords` };
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
      const availableSheets: Array<{ name: string; isDevice: boolean; reason: string; rowCount: number }> = [];

      workbook.SheetNames.forEach((sheetName) => {
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
          const siteRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
          
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
            name: extractValue(["site name", "building name", "property name", "name"]),
            address: extractValue(["address", "street"]),
            city: extractValue(["city", "municipality"]),
            contactName: extractValue(["contact name", "contact", "site contact"]),
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

      // Update import status
      await db
        .update(attachments)
        .set({ importStatus: "previewed" })
        .where(eq(attachments.id, input.fileId));

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
  importExcelDevices: protectedProcedure
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
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      if (!ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User must belong to a company" });
      }

      await assertSiteCompany(input.siteId, ctx.user.companyId);
      await assertJobCompany(input.jobId, ctx.user.companyId);

      // Get file record
      const [file] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, input.fileId));

      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      }

      const ownerCompanyId = await getAttachmentOwnerCompanyId(file);
      if (ownerCompanyId !== null && ownerCompanyId !== ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }

      // Download file
      const response = await fetch(file.fileUrl);
      if (!response.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file" });
      }

      const buffer = await response.buffer();
      const workbook = XLSX.read(buffer, { type: "buffer" });

      const imported = {
        fireAlarm: 0,
        extinguishers: 0,
        emergencyLights: 0,
        sprinkler: 0,
      };

      const updated = {
        fireAlarm: 0,
        extinguishers: 0,
        emergencyLights: 0,
        sprinkler: 0,
      };

      const excluded: any[] = [];
      
      // Site update tracking
      let siteFieldsUpdated = 0;
      const siteUpdatedFields: string[] = [];

      let sequenceOrder = 1;

      // Helper to generate deterministic dedupe key
      const generateDedupeKey = (category: string, location: string, description: string) => {
        const hash = crypto.createHash("md5");
        hash.update(`${category}:${location}:${description}`);
        return hash.digest("hex");
      };

      // Helper to find location column
      const findLocationValue = (row: any): string | null => {
        const locationKeys = ["location", "Location", "LOCATION", "loc", "Loc", "Device Location", "device location"];
        for (const key of locationKeys) {
          if (row[key]) return String(row[key]).trim();
        }
        return null;
      };

      // Helper to find description/label
      const findDescriptionValue = (row: any): string => {
        const descKeys = ["description", "Description", "DESCRIPTION", "label", "Label", "type", "Type", "Type/Size", "type/size", "Device Type", "device type"];
        for (const key of descKeys) {
          if (row[key]) return String(row[key]).trim();
        }
        return "";
      };

      // Helper to find external ref (tag/ID)
      const findExternalRef = (row: any): string | null => {
        const refKeys = ["tag", "Tag", "TAG", "id", "ID", "identifier", "Identifier", "barcode", "Barcode", "Unit #", "unit #"];
        for (const key of refKeys) {
          if (row[key]) return String(row[key]).trim();
        }
        return null;
      };
      
      // Helper to extract value from key/value pair row
      const extractValueFromKeyValue = (rows: any[][], targetKeys: string[]): string => {
        for (const row of rows) {
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
      
      // Step 1: Parse Site sheet first (if present)
      const siteSheetName = workbook.SheetNames.find(name => {
        const lower = safeToLower(name);
        if (!lower) return false;
        return lower.includes("site") || lower.includes("building") || lower.includes("property") || lower.includes("info");
      });
      
      if (siteSheetName) {
        const siteSheet = workbook.Sheets[siteSheetName];
        // Parse as key/value pairs (header: 1 returns array of arrays)
        const siteRows = XLSX.utils.sheet_to_json(siteSheet, { header: 1, defval: "" }) as any[][];
        
        // Extract site fields
        const siteName = extractValueFromKeyValue(siteRows, ["site name", "building name", "property name", "name"]);
        const address = extractValueFromKeyValue(siteRows, ["address", "street"]);
        const city = extractValueFromKeyValue(siteRows, ["city", "municipality"]);
        const state = extractValueFromKeyValue(siteRows, ["state", "province", "region"]);
        const postalCode = extractValueFromKeyValue(siteRows, ["postal", "zip", "postal code", "zip code"]);
        const contactName = extractValueFromKeyValue(siteRows, ["contact name", "contact", "site contact"]);
        const contactPhone = extractValueFromKeyValue(siteRows, ["contact phone", "phone", "telephone"]);
        const notes = extractValueFromKeyValue(siteRows, ["notes", "comments", "remarks"]);
        
        // Update site record (only overwrite non-empty values)
        const siteUpdateData: any = {};
        if (siteName) { siteUpdateData.name = siteName; siteUpdatedFields.push("name"); siteFieldsUpdated++; }
        if (address) { siteUpdateData.address = address; siteUpdatedFields.push("address"); siteFieldsUpdated++; }
        if (city) { siteUpdateData.city = city; siteUpdatedFields.push("city"); siteFieldsUpdated++; }
        if (state) { siteUpdateData.state = state; siteUpdatedFields.push("state"); siteFieldsUpdated++; }
        if (postalCode) { siteUpdateData.postalCode = postalCode; siteUpdatedFields.push("postalCode"); siteFieldsUpdated++; }
        if (contactName) { siteUpdateData.contactName = contactName; siteUpdatedFields.push("contactName"); siteFieldsUpdated++; }
        if (contactPhone) { siteUpdateData.contactPhone = contactPhone; siteUpdatedFields.push("contactPhone"); siteFieldsUpdated++; }
        if (notes) { siteUpdateData.notes = notes; siteUpdatedFields.push("notes"); siteFieldsUpdated++; }
        
        if (Object.keys(siteUpdateData).length > 0) {
          siteUpdateData.updatedAt = new Date();
          await db.update(sites).set(siteUpdateData).where(eq(sites.id, input.siteId));
        }
      }

      // Helper: Detect if sheet is a device sheet (reuse from preview)
      const isDeviceSheet = (sheetName: string, sheet: any): boolean => {
        const lowerName = safeToLower(sheetName);
        if (!lowerName) return false;
        const excludeKeywords = ["labour", "labor", "rate", "pricing", "cost", "invoice", "summary", "notes", "legend"];
        if (excludeKeywords.some(kw => lowerName.includes(kw))) return false;
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        const first10Rows = rows.slice(0, 10);
        const allText = first10Rows.flat().map(cell => safeToLower(cell)).join(" ");
        const deviceKeywords = ["device", "location", "serial", "smoke", "heat", "extinguisher", "emergency light", "pull station", "unit #"];
        const matchCount = deviceKeywords.filter(kw => allText.includes(kw)).length;
        return matchCount >= 2;
      };

      // Step 2: Process device sheets
      for (const sheetName of workbook.SheetNames) {
        // Skip site sheet (already processed)
        const lowerSheetName = safeToLower(sheetName);
        if (!lowerSheetName) continue;
        if (lowerSheetName.includes("site") || lowerSheetName.includes("building") || lowerSheetName.includes("property") || lowerSheetName.includes("info")) {
          continue;
        }
        
        // If selectedSheets provided, only import those sheets
        if (input.selectedSheets && input.selectedSheets.length > 0) {
          if (!input.selectedSheets.includes(sheetName)) {
            continue;
          }
        } else {
          // Auto-detect: skip non-device sheets
          const sheet = workbook.Sheets[sheetName];
          if (!isDeviceSheet(sheetName, sheet)) {
            continue;
          }
        }
        const sheet = workbook.Sheets[sheetName];
        // Try parsing with default headers (Row 1)
        let rows = XLSX.utils.sheet_to_json(sheet);
        
        // If no valid rows or first row looks like a title, try Row 2 as headers
        if (rows.length === 0 || (rows[0] && typeof rows[0] === 'object' && !('Location' in rows[0]) && !('location' in rows[0]))) {
          // Parse with Row 2 as headers
          rows = XLSX.utils.sheet_to_json(sheet, { range: 1 }); // Start from row 2 (0-indexed)
        }

        const lowerName = safeToLower(sheetName);
        let category: "FIRE_EXTINGUISHER" | "EMERGENCY_LIGHT" | "FIRE_ALARM_DEVICE" | "SMOKE_ALARM" | null = null;
        let counterKey: keyof typeof imported | null = null;

        if (lowerName.includes("exting")) {
          category = "FIRE_EXTINGUISHER";
          counterKey = "extinguishers";
        } else if (lowerName.includes("emerg") || lowerName.includes("exit") || lowerName.includes("light")) {
          category = "EMERGENCY_LIGHT";
          counterKey = "emergencyLights";
        } else if (lowerName.includes("sprink")) {
          // Skip sprinkler for now - not in devices category enum
          continue;
        } else if (lowerName.includes("individual device record")) {
          // This is the actual Fire Alarm device list
          category = "FIRE_ALARM_DEVICE";
          counterKey = "fireAlarm";
          // Headers are on Row 3 for this sheet
          rows = XLSX.utils.sheet_to_json(sheet, { range: 2 }); // Start from row 3 (0-indexed)
        } else if (lowerName.includes("smoke alarm")) {
          category = "SMOKE_ALARM";
          counterKey = "fireAlarm"; // Count as fire alarm devices
          // This is a legend sheet, skip it
          continue;
        } else if (
          lowerName.includes("alarm") ||
          lowerName.includes("device")
        ) {
          // Skip generic alarm/device sheets that are forms, not device lists
          continue;
        }

        if (!category || !counterKey) continue;

        for (const row of rows) {
          const location = findLocationValue(row);
          if (!location) {
            excluded.push({
              row,
              reason: "Missing location",
              sheet: sheetName,
            });
            continue;
          }

          const description = findDescriptionValue(row);
          const externalRef = findExternalRef(row);
          const dedupeKey = externalRef || generateDedupeKey(category, location, description);

          // Check if device exists
          const dbInstance = await getDb();
          if (!dbInstance) continue;
          const existing = await dbInstance
            .select()
            .from(devices)
            .where(
              and(
                eq(devices.companyId, ctx.user.companyId!),
                eq(devices.siteId, input.siteId),
                eq(devices.externalRef, dedupeKey)
              )
            );

          if (existing.length > 0) {
            // Update existing
            await dbInstance
              .update(devices)
              .set({
                location,
                deviceType: description,
                category,
                updatedAt: new Date(),
              })
              .where(eq(devices.id, existing[0].id));

            updated[counterKey]++;
          } else {
            // Insert new
            await dbInstance.insert(devices).values({
              companyId: ctx.user.companyId!,
              siteId: input.siteId,
              location,
              deviceType: description,
              category,
              externalRef: dedupeKey,
              isActive: true,
            });

            imported[counterKey]++;
          }

          sequenceOrder++;
        }
      }

      // Update import status
      const finalDb = await getDb();
      if (finalDb) {
        await finalDb
          .update(attachments)
          .set({
            importStatus: "imported",
            importSummary: { imported, updated, excluded },
          })
          .where(eq(attachments.id, input.fileId));
      }

      return {
        imported,
        updated,
        excluded,
        siteUpdated: {
          fieldsUpdated: siteFieldsUpdated,
          updatedFields: siteUpdatedFields,
        },
      };
    }),
});
