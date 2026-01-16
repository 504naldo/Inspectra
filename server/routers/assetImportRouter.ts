import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attachments, devices, jobs } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import * as XLSX from "xlsx";

/**
 * Asset Import Router
 * 
 * Handles importing devices (Fire Extinguishers, Emergency Lights) from Excel files
 * attached to jobs. Supports idempotent imports using externalRef for matching.
 */

export const assetImportRouter = router({
  /**
   * Import assets from the latest Excel file attached to a job
   * 
   * Process:
   * 1. Find latest Excel attachment for the job
   * 2. Download and parse Excel file
   * 3. Extract devices from relevant tabs (fuzzy matching)
   * 4. Upsert devices with proper site/company linking
   * 5. Return import counts
   */
  importAssetsFromExcel: protectedProcedure
    .input(
      z.object({
        jobId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { jobId } = input;
      const userId = ctx.user.id;
      const companyId = ctx.user.companyId;

      if (!companyId) {
        throw new Error("User must belong to a company");
      }

      // Step 1: Get job details to verify access and get siteId
      const db = await getDb();
      if (!db) {
        throw new Error("Database not available");
      }

      const [job] = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, jobId), eq(jobs.companyId, companyId)))
        .limit(1);

      if (!job) {
        throw new Error("Job not found or access denied");
      }

      if (!job.siteId) {
        throw new Error("Job must be linked to a site");
      }

      // Step 2: Find latest Excel attachment for this job
      const excelMimeTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel", // .xls
      ];

      const [attachment] = await db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.entityType, "job"),
            eq(attachments.entityId, jobId),
            eq(attachments.uploadStatus, "completed")
          )
        )
        .orderBy(desc(attachments.createdAt))
        .limit(1);

      if (!attachment) {
        throw new Error("No file found for this job. Please upload an Excel file first.");
      }

      // Verify it's an Excel file
      if (!excelMimeTypes.includes(attachment.mimeType || "")) {
        throw new Error(
          `File must be an Excel file (.xlsx or .xls). Found: ${attachment.fileName}`
        );
      }

      // Step 3: Download and parse Excel file
      const response = await fetch(attachment.fileUrl);
      if (!response.ok) {
        throw new Error("Failed to download Excel file from storage");
      }

      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });

      // Step 4: Find relevant sheets using fuzzy matching
      const sheetNames = workbook.SheetNames;
      
      const findSheet = (keywords: string[]): string | null => {
        for (const sheetName of sheetNames) {
          const lowerName = sheetName.toLowerCase();
          if (keywords.some((kw) => lowerName.includes(kw))) {
            return sheetName;
          }
        }
        return null;
      };

      const extinguisherSheet = findSheet(["exting", "extinguisher", "fire ext"]);
      const emergencyLightSheet = findSheet(["emerg", "exit", "lighting", "light"]);

      let extinguisherCount = 0;
      let emergencyLightCount = 0;

      // Step 5: Parse Fire Extinguisher sheet
      if (extinguisherSheet) {
        const sheet = workbook.Sheets[extinguisherSheet];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

        for (const row of rows) {
          // Extract fields from row (flexible column name matching)
          const location = extractField(row, ["location", "area", "room", "zone"]);
          const identifier = extractField(row, ["tag", "id", "number", "identifier", "label"]);
          const type = extractField(row, ["type", "class", "category"]);
          const status = extractField(row, ["status", "condition"]);
          const notes = extractField(row, ["notes", "comments", "remarks"]);

          // Skip empty rows
          if (!location && !identifier) continue;

          // Create externalRef for idempotent matching
          const externalRef = identifier || createHash(location, type, "FIRE_EXTINGUISHER");

          // Upsert device
          await upsertDevice({
            companyId,
            siteId: job.siteId,
            category: "FIRE_EXTINGUISHER",
            location: location || "Unknown",
            deviceType: type || "Fire Extinguisher",
            barcode: identifier || null,
            notes: notes || null,
            externalRef,
          });

          extinguisherCount++;
        }
      }

      // Step 6: Parse Emergency Light sheet
      if (emergencyLightSheet) {
        const sheet = workbook.Sheets[emergencyLightSheet];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

        for (const row of rows) {
          const location = extractField(row, ["location", "area", "room", "zone"]);
          const identifier = extractField(row, ["tag", "id", "number", "identifier", "label"]);
          const type = extractField(row, ["type", "class", "category"]);
          const status = extractField(row, ["status", "condition"]);
          const notes = extractField(row, ["notes", "comments", "remarks"]);

          // Skip empty rows
          if (!location && !identifier) continue;

          // Create externalRef for idempotent matching
          const externalRef = identifier || createHash(location, type, "EMERGENCY_LIGHT");

          // Upsert device
          await upsertDevice({
            companyId,
            siteId: job.siteId,
            category: "EMERGENCY_LIGHT",
            location: location || "Unknown",
            deviceType: type || "Emergency Light",
            barcode: identifier || null,
            notes: notes || null,
            externalRef,
          });

          emergencyLightCount++;
        }
      }

      // Step 7: Return import summary
      return {
        success: true,
        extinguisherCount,
        emergencyLightCount,
        totalCount: extinguisherCount + emergencyLightCount,
        message: `Imported ${extinguisherCount} fire extinguishers and ${emergencyLightCount} emergency lights`,
      };
    }),
});

/**
 * Helper: Extract field from row using flexible column name matching
 */
function extractField(row: any, possibleKeys: string[]): string {
  for (const key of Object.keys(row)) {
    const lowerKey = key.toLowerCase().trim();
    if (possibleKeys.some((pk) => lowerKey.includes(pk))) {
      const value = row[key];
      return typeof value === "string" ? value.trim() : String(value || "");
    }
  }
  return "";
}

/**
 * Helper: Create stable hash for externalRef when no identifier exists
 */
function createHash(location: string, type: string, category: string): string {
  const combined = `${category}:${location}:${type}`.toLowerCase().replace(/\s+/g, "-");
  return combined;
}

/**
 * Helper: Upsert device (create or update based on externalRef)
 */
async function upsertDevice(data: {
  companyId: number;
  siteId: number;
  category: "FIRE_EXTINGUISHER" | "EMERGENCY_LIGHT" | "FIRE_ALARM_DEVICE";
  location: string;
  deviceType: string;
  barcode: string | null;
  notes: string | null;
  externalRef: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  // Check if device exists by externalRef
  const [existing] = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.companyId, data.companyId),
        eq(devices.siteId, data.siteId),
        eq(devices.externalRef, data.externalRef)
      )
    )
    .limit(1);

  if (existing) {
    // Update existing device
    await db
      .update(devices)
      .set({
        category: data.category,
        location: data.location,
        deviceType: data.deviceType,
        barcode: data.barcode,
        notes: data.notes,
        updatedAt: new Date(),
      })
      .where(eq(devices.id, existing.id));
  } else {
    // Insert new device
    await db.insert(devices).values({
      companyId: data.companyId,
      siteId: data.siteId,
      category: data.category,
      location: data.location,
      deviceType: data.deviceType,
      barcode: data.barcode,
      notes: data.notes,
      externalRef: data.externalRef,
    });
  }
}
