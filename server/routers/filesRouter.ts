import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { attachments, devices } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import * as XLSX from "xlsx";
import fetch from "node-fetch";
import crypto from "crypto";

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
      // Generate unique file key
      const randomSuffix = Math.random().toString(36).substring(7);
      const fileKey = `${input.companyId}/jobs/${input.jobId}/${input.fileName}-${randomSuffix}`;
      
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
    .input(z.object({ fileId: z.number() }))
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

      // Download file
      const response = await fetch(file.fileUrl);
      if (!response.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to download file" });
      }

      const buffer = await response.buffer();
      const workbook = XLSX.read(buffer, { type: "buffer" });

      // Parse sheets with fuzzy matching
      const categories = {
        fireAlarm: [] as any[],
        extinguishers: [] as any[],
        emergencyLights: [] as any[],
        sprinkler: [] as any[],
      };

      let totalRows = 0;

      workbook.SheetNames.forEach((sheetName) => {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        const lowerName = sheetName.toLowerCase();

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

      return {
        totalRows,
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
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      if (!ctx.user.companyId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "User must belong to a company" });
      }

      // Get file record
      const [file] = await db
        .select()
        .from(attachments)
        .where(eq(attachments.id, input.fileId));

      if (!file) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
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

      let sequenceOrder = 1;

      // Helper to generate deterministic dedupe key
      const generateDedupeKey = (category: string, location: string, description: string) => {
        const hash = crypto.createHash("md5");
        hash.update(`${category}:${location}:${description}`);
        return hash.digest("hex");
      };

      // Helper to find location column
      const findLocationValue = (row: any): string | null => {
        const locationKeys = ["location", "Location", "LOCATION", "loc", "Loc"];
        for (const key of locationKeys) {
          if (row[key]) return String(row[key]).trim();
        }
        return null;
      };

      // Helper to find description/label
      const findDescriptionValue = (row: any): string => {
        const descKeys = ["description", "Description", "DESCRIPTION", "label", "Label", "type", "Type"];
        for (const key of descKeys) {
          if (row[key]) return String(row[key]).trim();
        }
        return "";
      };

      // Helper to find external ref (tag/ID)
      const findExternalRef = (row: any): string | null => {
        const refKeys = ["tag", "Tag", "TAG", "id", "ID", "identifier", "Identifier", "barcode", "Barcode"];
        for (const key of refKeys) {
          if (row[key]) return String(row[key]).trim();
        }
        return null;
      };

      // Process each sheet
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        const lowerName = sheetName.toLowerCase();
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
        } else if (
          lowerName.includes("alarm") ||
          lowerName.includes("device") ||
          lowerName.includes("smoke")
        ) {
          category = "FIRE_ALARM_DEVICE";
          counterKey = "fireAlarm";
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
      };
    }),
});
