import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { attachments, devices, jobs, sites } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import * as XLSX from "xlsx";

/**
 * Asset Import Router
 * 
 * Handles importing full workbooks with:
 * - Site information parsing and update
 * - All device categories (Fire Alarm, Extinguishers, Emergency Lights, Sprinkler)
 * - No row limits (processes entire sheets)
 * - Validation and exclusion reporting
 */

export const assetImportRouter = router({
  /**
   * Import assets from the latest Excel file attached to a job
   * 
   * Process:
   * 1. Find latest Excel attachment for the job
   * 2. Download and parse entire Excel workbook
   * 3. Parse Site tab and update site record (upsert strategy)
   * 4. Extract ALL devices from relevant tabs (no row limits)
   * 5. Upsert devices with proper site/company linking
   * 6. Return detailed import summary with exclusions
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
        "application/vnd.ms-excel.sheet.macroEnabled.12", // .xlsm
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
          `File must be an Excel file (.xlsx, .xlsm, or .xls). Found: ${attachment.fileName}`
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

      // Find all device sheets
      const siteSheet = findSheet(["site", "building", "property", "info"]);
      const fireAlarmSheet = findSheet(["fire alarm device", "alarm device", "fa device", "device list"]);
      const extinguisherSheet = findSheet(["exting", "extinguisher", "fire ext"]);
      const emergencyLightSheet = findSheet(["emerg", "exit", "lighting", "light"]);
      const sprinklerSystemSheet = findSheet(["sprinkler system", "sprinkler"]);
      const sprinklerDeviceSheet = findSheet(["sprinkler device", "sprinkler head"]);

      // Initialize counters
      let siteFieldsUpdated = 0;
      let fireAlarmCount = 0;
      let extinguisherCount = 0;
      let emergencyLightCount = 0;
      let sprinklerSystemCount = 0;
      let sprinklerDeviceCount = 0;
      const excludedRows: Array<{ sheet: string; reason: string; rowData?: any }> = [];

      // Step 5: Parse and update Site information
      if (siteSheet) {
        try {
          const sheet = workbook.Sheets[siteSheet];
          const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
          
          if (rows.length > 0) {
            const siteData = rows[0]; // Assume first row has site info
            
            // Extract site fields
            const siteName = extractField(siteData, ["site name", "building name", "property name", "name"]);
            const address = extractField(siteData, ["address", "street", "location"]);
            const city = extractField(siteData, ["city", "municipality"]);
            const state = extractField(siteData, ["state", "province", "region"]);
            const postalCode = extractField(siteData, ["postal", "zip", "postal code", "zip code"]);
            const contactName = extractField(siteData, ["contact name", "contact", "site contact"]);
            const contactPhone = extractField(siteData, ["contact phone", "phone", "telephone"]);
            const notes = extractField(siteData, ["notes", "comments", "remarks"]);

            // Update site record (only overwrite non-empty values)
            const updateData: any = {};
            if (siteName) { updateData.name = siteName; siteFieldsUpdated++; }
            if (address) { updateData.address = address; siteFieldsUpdated++; }
            if (city) { updateData.city = city; siteFieldsUpdated++; }
            if (state) { updateData.state = state; siteFieldsUpdated++; }
            if (postalCode) { updateData.postalCode = postalCode; siteFieldsUpdated++; }
            if (contactName) { updateData.contactName = contactName; siteFieldsUpdated++; }
            if (contactPhone) { updateData.contactPhone = contactPhone; siteFieldsUpdated++; }
            if (notes) { updateData.notes = notes; siteFieldsUpdated++; }

            if (Object.keys(updateData).length > 0) {
              updateData.updatedAt = new Date();
              await db.update(sites).set(updateData).where(eq(sites.id, job.siteId));
            }
          }
        } catch (error: any) {
          console.error("Error parsing Site sheet:", error);
          excludedRows.push({ sheet: "Site", reason: `Parse error: ${error.message}` });
        }
      }

      // Step 6: Parse Fire Alarm Devices (ALL rows)
      if (fireAlarmSheet) {
        const sheet = workbook.Sheets[fireAlarmSheet];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          
          // Check if row is completely blank
          if (isRowBlank(row)) continue;

          const location = extractField(row, ["location", "area", "room", "zone"]);
          const identifier = extractField(row, ["tag", "id", "number", "identifier", "label"]);
          const type = extractField(row, ["type", "class", "category", "device type"]);
          const notes = extractField(row, ["notes", "comments", "remarks"]);

          // Exclude rows without location
          if (!location) {
            excludedRows.push({ 
              sheet: "Fire Alarm Devices", 
              reason: "Missing location", 
              rowData: { row: i + 2, identifier, type } 
            });
            continue;
          }

          const externalRef = identifier || createHash(location, type, "FIRE_ALARM_DEVICE");

          await upsertDevice({
            companyId,
            siteId: job.siteId,
            category: "FIRE_ALARM_DEVICE",
            location,
            deviceType: type || "Fire Alarm Device",
            barcode: identifier || null,
            notes: notes || null,
            externalRef,
          });

          fireAlarmCount++;
        }
      }

      // Step 7: Parse Fire Extinguishers (ALL rows)
      if (extinguisherSheet) {
        const sheet = workbook.Sheets[extinguisherSheet];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          
          if (isRowBlank(row)) continue;

          const location = extractField(row, ["location", "area", "room", "zone"]);
          const identifier = extractField(row, ["tag", "id", "number", "identifier", "label"]);
          const type = extractField(row, ["type", "class", "category"]);
          const notes = extractField(row, ["notes", "comments", "remarks"]);

          if (!location) {
            excludedRows.push({ 
              sheet: "Fire Extinguishers", 
              reason: "Missing location", 
              rowData: { row: i + 2, identifier, type } 
            });
            continue;
          }

          const externalRef = identifier || createHash(location, type, "FIRE_EXTINGUISHER");

          await upsertDevice({
            companyId,
            siteId: job.siteId,
            category: "FIRE_EXTINGUISHER",
            location,
            deviceType: type || "Fire Extinguisher",
            barcode: identifier || null,
            notes: notes || null,
            externalRef,
          });

          extinguisherCount++;
        }
      }

      // Step 8: Parse Emergency Lights (ALL rows)
      if (emergencyLightSheet) {
        const sheet = workbook.Sheets[emergencyLightSheet];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          
          if (isRowBlank(row)) continue;

          const location = extractField(row, ["location", "area", "room", "zone"]);
          const identifier = extractField(row, ["tag", "id", "number", "identifier", "label"]);
          const type = extractField(row, ["type", "class", "category"]);
          const notes = extractField(row, ["notes", "comments", "remarks"]);

          if (!location) {
            excludedRows.push({ 
              sheet: "Emergency Lights", 
              reason: "Missing location", 
              rowData: { row: i + 2, identifier, type } 
            });
            continue;
          }

          const externalRef = identifier || createHash(location, type, "EMERGENCY_LIGHT");

          await upsertDevice({
            companyId,
            siteId: job.siteId,
            category: "EMERGENCY_LIGHT",
            location,
            deviceType: type || "Emergency Light",
            barcode: identifier || null,
            notes: notes || null,
            externalRef,
          });

          emergencyLightCount++;
        }
      }

      // Step 9: Parse Sprinkler Systems (if present)
      // Note: Sprinkler systems have complex numeric fields that should be stored in sprinklerSystems table
      // For now, we'll import them as devices with notes containing the numeric data
      if (sprinklerSystemSheet) {
        const sheet = workbook.Sheets[sprinklerSystemSheet];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          
          if (isRowBlank(row)) continue;

          const location = extractField(row, ["location", "area", "coverage", "zone"]);
          const identifier = extractField(row, ["system number", "system id", "id"]);
          const type = extractField(row, ["type", "system type"]);
          
          // Extract numeric fields
          const pressure = extractField(row, ["pressure", "water pressure", "system pressure"]);
          const manufacturer = extractField(row, ["manufacturer", "make"]);
          const model = extractField(row, ["model", "model number"]);
          
          // Combine notes with numeric data
          let notes = extractField(row, ["notes", "comments", "remarks"]);
          if (pressure) notes += `\nPressure: ${pressure}`;
          if (manufacturer) notes += `\nManufacturer: ${manufacturer}`;
          if (model) notes += `\nModel: ${model}`;

          if (!location) {
            excludedRows.push({ 
              sheet: "Sprinkler Systems", 
              reason: "Missing location", 
              rowData: { row: i + 2, identifier, type } 
            });
            continue;
          }

          const externalRef = identifier || createHash(location, type, "SPRINKLER_SYSTEM");

          // Store as FIRE_ALARM_DEVICE category with "Sprinkler System" type
          await upsertDevice({
            companyId,
            siteId: job.siteId,
            category: "FIRE_ALARM_DEVICE",
            location,
            deviceType: type || "Sprinkler System",
            barcode: identifier || null,
            notes: notes.trim() || null,
            externalRef,
          });

          sprinklerSystemCount++;
        }
      }

      // Step 10: Parse Sprinkler Devices (if present)
      if (sprinklerDeviceSheet) {
        const sheet = workbook.Sheets[sprinklerDeviceSheet];
        const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          
          if (isRowBlank(row)) continue;

          const location = extractField(row, ["location", "area", "room", "zone"]);
          const identifier = extractField(row, ["tag", "id", "number", "identifier", "head number"]);
          const type = extractField(row, ["type", "head type", "sprinkler type"]);
          const notes = extractField(row, ["notes", "comments", "remarks"]);

          if (!location) {
            excludedRows.push({ 
              sheet: "Sprinkler Devices", 
              reason: "Missing location", 
              rowData: { row: i + 2, identifier, type } 
            });
            continue;
          }

          const externalRef = identifier || createHash(location, type, "SPRINKLER_DEVICE");

          await upsertDevice({
            companyId,
            siteId: job.siteId,
            category: "FIRE_ALARM_DEVICE",
            location,
            deviceType: type || "Sprinkler Head",
            barcode: identifier || null,
            notes: notes || null,
            externalRef,
          });

          sprinklerDeviceCount++;
        }
      }

      // Step 11: Return detailed import summary
      const totalDevices = fireAlarmCount + extinguisherCount + emergencyLightCount + sprinklerSystemCount + sprinklerDeviceCount;
      
      return {
        success: true,
        siteFieldsUpdated,
        deviceCounts: {
          fireAlarm: fireAlarmCount,
          extinguishers: extinguisherCount,
          emergencyLights: emergencyLightCount,
          sprinklerSystems: sprinklerSystemCount,
          sprinklerDevices: sprinklerDeviceCount,
          total: totalDevices,
        },
        excludedRowsCount: excludedRows.length,
        excludedRows: excludedRows.slice(0, 20), // Return first 20 for display
        message: `Imported ${totalDevices} devices across ${Object.values({ fireAlarmCount, extinguisherCount, emergencyLightCount, sprinklerSystemCount, sprinklerDeviceCount }).filter(c => c > 0).length} categories. ${siteFieldsUpdated > 0 ? `Updated ${siteFieldsUpdated} site fields.` : ''} ${excludedRows.length > 0 ? `Excluded ${excludedRows.length} rows.` : ''}`,
      };
    }),
});

/**
 * Helper: Check if row is completely blank
 */
function isRowBlank(row: any): boolean {
  return Object.values(row).every(val => !val || String(val).trim() === "");
}

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
  category: "FIRE_EXTINGUISHER" | "EMERGENCY_LIGHT" | "FIRE_ALARM_DEVICE" | "SMOKE_ALARM";
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
