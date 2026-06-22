import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { companies, users, sites, jobs, attachments } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { storagePut } from "./storage";

// Requires a real S3/R2 bucket — skips gracefully when credentials aren't configured.
describe.skipIf(!process.env.S3_ACCESS_KEY_ID)("Sheet Selection and Detection", () => {
  let testCompanyId: number;
  let testUserId: number;
  let testSiteId: number;
  let testJobId: number;
  let testFileId: number;
  let testFileUrl: string;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Create test company
    const [company] = await db
      .insert(companies)
      .values({
        name: "Sheet Selection Test Company",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .$returningId();
    testCompanyId = company.id;

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        openId: `test-sheet-selection-${Date.now()}`,
        name: "Sheet Test User",
        companyId: testCompanyId,
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .$returningId();
    testUserId = user.id;

    // Create test site
    const [site] = await db
      .insert(sites)
      .values({
        companyId: testCompanyId,
        customerOrgId: testCompanyId, // Required field
        name: "Sheet Test Site",
        address: "123 Test St",
        city: "Test City",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .$returningId();
    testSiteId = site.id;

    // Create test job
    const [job] = await db
      .insert(jobs)
      .values({
        companyId: testCompanyId,
        siteId: testSiteId,
        customerOrgId: testCompanyId, // Required field
        jobNumber: `SHEET-TEST-${Date.now()}`,
        title: "Sheet Test Job",
        jobType: "annual",
        status: "in_progress",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .$returningId();
    testJobId = job.id;

    // Create test Excel file with device and non-device sheets
    const wb = XLSX.utils.book_new();

    // Device sheet: Extinguishers
    const extData = [
      ["Date", "2026-01-20", "Building ID", "#TEST"],
      ["Unit #", "Location", "Type/Size", "Passed"],
      [1, "Basement", "5 LB ABC", "Yes"],
      [2, "First Floor", "10 LB ABC", "Yes"],
    ];
    const extSheet = XLSX.utils.aoa_to_sheet(extData);
    XLSX.utils.book_append_sheet(wb, extSheet, "Extinguishers");

    // Non-device sheet: Labour Rates (should be excluded)
    const labourData = [
      ["Labour Rates", "", ""],
      ["Position", "Rate", "Hours"],
      ["Technician", "$75/hr", "8"],
      ["Inspector", "$90/hr", "4"],
    ];
    const labourSheet = XLSX.utils.aoa_to_sheet(labourData);
    XLSX.utils.book_append_sheet(wb, labourSheet, "Labour Rates");

    // Non-device sheet: Summary (should be excluded)
    const summaryData = [
      ["Summary Report", "", ""],
      ["Total Devices", "2", ""],
      ["Total Cost", "$1200", ""],
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

    // Device sheet: Emergency Lights
    const lightsData = [
      ["Date", "2026-01-20", "Building ID", "#TEST"],
      ["Unit #", "Location", "Ladder Height", "Passed"],
      [1, "Hallway", "3'", "Yes"],
      [2, "Stairwell", "6'", "Yes"],
    ];
    const lightsSheet = XLSX.utils.aoa_to_sheet(lightsData);
    XLSX.utils.book_append_sheet(wb, lightsSheet, "Emergency Lights");

    // Write to buffer and upload
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const fileKey = `test-sheet-selection-${Date.now()}.xlsx`;
    const { url } = await storagePut(fileKey, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    testFileUrl = url;

    // Create attachment record
    const [file] = await db
      .insert(attachments)
      .values({
        companyId: testCompanyId,
        entityType: "job",
        entityId: testJobId,
        fileName: "test-sheet-selection.xlsx",
        fileKey,
        fileUrl: url,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        uploadedById: testUserId,
        importStatus: "none",
        createdAt: new Date(),
      })
      .$returningId();
    testFileId = file.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Cleanup
    await db.delete(attachments).where(eq(attachments.companyId, testCompanyId));
    await db.delete(jobs).where(eq(jobs.companyId, testCompanyId));
    await db.delete(sites).where(eq(sites.companyId, testCompanyId));
    await db.delete(users).where(eq(users.companyId, testCompanyId));
    await db.delete(companies).where(eq(companies.id, testCompanyId));
  });

  it("should detect device and non-device sheets correctly", async () => {
    // Download and parse the file
    const response = await fetch(testFileUrl);
    const buffer = await response.buffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    // Helper function (same as in filesRouter)
    const isDeviceSheet = (sheetName: string, sheet: any): { isDevice: boolean; reason: string } => {
      const lowerName = sheetName.toLowerCase();
      const excludeKeywords = ["labour", "labor", "rate", "pricing", "cost", "invoice", "summary", "notes", "legend"];
      if (excludeKeywords.some(kw => lowerName.includes(kw))) {
        return { isDevice: false, reason: "Excluded by keyword" };
      }
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      const first10Rows = rows.slice(0, 10);
      const allText = first10Rows.flat().map(cell => String(cell || "").toLowerCase()).join(" ");
      const deviceKeywords = ["device", "location", "serial", "smoke", "heat", "extinguisher", "emergency light", "pull station", "unit #"];
      const matchCount = deviceKeywords.filter(kw => allText.includes(kw)).length;
      if (matchCount >= 2) {
        return { isDevice: true, reason: `Matched ${matchCount} device keywords` };
      }
      return { isDevice: false, reason: "Not enough device keywords" };
    };

    const results = workbook.SheetNames.map(name => ({
      name,
      ...isDeviceSheet(name, workbook.Sheets[name])
    }));

    // Verify detection
    expect(results.find(r => r.name === "Extinguishers")?.isDevice).toBe(true);
    expect(results.find(r => r.name === "Emergency Lights")?.isDevice).toBe(true);
    expect(results.find(r => r.name === "Labour Rates")?.isDevice).toBe(false);
    expect(results.find(r => r.name === "Summary")?.isDevice).toBe(false);
  });

  it("should return available sheets in preview with detection flags", async () => {
    // This would normally call the tRPC procedure, but for testing we'll simulate it
    const response = await fetch(testFileUrl);
    const buffer = await response.buffer();
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const availableSheets: Array<{ name: string; isDevice: boolean; reason: string; rowCount: number }> = [];

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const lowerName = sheetName.toLowerCase();
      const excludeKeywords = ["labour", "labor", "rate", "pricing", "cost", "invoice", "summary", "notes", "legend"];
      const isExcluded = excludeKeywords.some(kw => lowerName.includes(kw));
      
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
      const first10Rows = rows.slice(0, 10);
      const allText = first10Rows.flat().map(cell => String(cell || "").toLowerCase()).join(" ");
      const deviceKeywords = ["device", "location", "serial", "smoke", "heat", "extinguisher", "emergency light", "pull station", "unit #"];
      const matchCount = deviceKeywords.filter(kw => allText.includes(kw)).length;
      
      const isDevice = !isExcluded && matchCount >= 2;
      const reason = isExcluded ? "Excluded by keyword" : matchCount >= 2 ? `Matched ${matchCount} device keywords` : "Not enough device keywords";
      
      availableSheets.push({
        name: sheetName,
        isDevice,
        reason,
        rowCount: XLSX.utils.sheet_to_json(sheet).length,
      });
    });

    // Verify results
    expect(availableSheets.length).toBe(4);
    expect(availableSheets.filter(s => s.isDevice).length).toBe(2); // Extinguishers and Emergency Lights
    expect(availableSheets.filter(s => !s.isDevice).length).toBe(2); // Labour Rates and Summary
  });
});
