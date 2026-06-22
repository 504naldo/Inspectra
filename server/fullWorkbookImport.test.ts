import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { eq, and } from "drizzle-orm";
import { companies, customerOrgs, sites, jobs, attachments, devices } from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

/**
 * Full Workbook Import Test
 * 
 * Tests:
 * - Site tab parsing and update
 * - All device categories import (Fire Alarm, Extinguishers, Emergency Lights, Sprinkler)
 * - No row limits (processes all rows)
 * - Validation and exclusion reporting
 */

function createTestContext(role: "admin" | "office" | "technician" = "office") {
  return {
    user: {
      id: 1,
      openId: "test-open-id",
      name: "Test User",
      email: "test@example.com",
      role,
      companyId: 1,
      customerOrgId: null,
      isActive: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };
}

// Requires a real S3/R2 bucket — skips gracefully when credentials aren't configured.
describe.skipIf(!process.env.S3_ACCESS_KEY_ID)("Full Workbook Import", () => {
  let testCompanyId: number;
  let testCustomerOrgId: number;
  let testSiteId: number;
  let testJobId: number;
  let testAttachmentId: number;

  beforeAll(async () => {
    const database = await getDb();
    if (!database) throw new Error("Database not available");

    // Create test company
    const [company] = await database.insert(companies).values({
      name: "Test Import Company",
      email: "import@test.com",
    });
    testCompanyId = (company as any).insertId;

    // Create test customer org
    const [customerOrg] = await database.insert(customerOrgs).values({
      companyId: testCompanyId,
      name: "Test Customer for Import",
      contactName: "John Doe",
      contactEmail: "john@customer.com",
    });
    testCustomerOrgId = (customerOrg as any).insertId;

    // Create test site
    const [site] = await database.insert(sites).values({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: "Original Site Name",
      address: "123 Old Street",
      city: "Old City",
      state: "Old State",
      postalCode: "12345",
    });
    testSiteId = (site as any).insertId;

    // Create test job
    const [job] = await database.insert(jobs).values({
      companyId: testCompanyId,
      siteId: testSiteId,
      customerOrgId: testCustomerOrgId,
      jobNumber: `IMPORT-TEST-${Date.now()}`,
      title: "Full Workbook Import Test",
      jobType: "annual",
      status: "scheduled",
      scheduledDate: new Date(),
    });
    testJobId = (job as any).insertId;

    // Create test Excel workbook with multiple sheets
    const workbook = XLSX.utils.book_new();

    // Site sheet
    const siteData = [
      ["Site Name", "Address", "City", "State", "Postal Code", "Contact Name", "Contact Phone", "Notes"],
      ["Updated Site Name", "456 New Avenue", "New City", "New State", "67890", "Jane Smith", "555-1234", "Updated via import"],
    ];
    const siteSheet = XLSX.utils.aoa_to_sheet(siteData);
    XLSX.utils.book_append_sheet(workbook, siteSheet, "Site Information");

    // Fire Alarm Devices sheet (15 rows to test no limits)
    const fireAlarmData = [
      ["Location", "Tag", "Type", "Notes"],
      ["Lobby", "FA-001", "Smoke Detector", "Main entrance"],
      ["Hallway 1", "FA-002", "Pull Station", "Near exit"],
      ["Office 101", "FA-003", "Smoke Detector", ""],
      ["", "FA-004", "Horn/Strobe", ""], // Missing location - should be excluded
      ["Conference Room", "FA-005", "Smoke Detector", "Large room"],
      ["Kitchen", "FA-006", "Heat Detector", ""],
      ["Storage", "FA-007", "Smoke Detector", ""],
      ["Bathroom", "FA-008", "Horn/Strobe", ""],
      ["Stairwell A", "FA-009", "Smoke Detector", ""],
      ["Stairwell B", "FA-010", "Smoke Detector", ""],
      ["Elevator", "FA-011", "Smoke Detector", ""],
      ["Parking", "FA-012", "Pull Station", ""],
      ["Roof", "FA-013", "Smoke Detector", ""],
      ["Basement", "FA-014", "Smoke Detector", ""],
      ["Mechanical Room", "FA-015", "Heat Detector", "High temp area"],
    ];
    const fireAlarmSheet = XLSX.utils.aoa_to_sheet(fireAlarmData);
    XLSX.utils.book_append_sheet(workbook, fireAlarmSheet, "Fire Alarm Devices");

    // Fire Extinguishers sheet (10 rows)
    const extinguisherData = [
      ["Location", "Tag", "Type", "Notes"],
      ["Lobby", "EXT-001", "ABC 10lb", ""],
      ["Hallway 1", "EXT-002", "ABC 10lb", ""],
      ["Kitchen", "EXT-003", "K-Class", "Commercial kitchen"],
      ["Office 101", "EXT-004", "ABC 5lb", ""],
      ["Conference Room", "EXT-005", "ABC 10lb", ""],
      ["Storage", "EXT-006", "ABC 10lb", ""],
      ["Mechanical Room", "EXT-007", "ABC 20lb", ""],
      ["Parking", "EXT-008", "ABC 10lb", ""],
      ["", "EXT-009", "ABC 10lb", ""], // Missing location - should be excluded
      ["Roof", "EXT-010", "ABC 10lb", ""],
    ];
    const extinguisherSheet = XLSX.utils.aoa_to_sheet(extinguisherData);
    XLSX.utils.book_append_sheet(workbook, extinguisherSheet, "Fire Extinguishers");

    // Emergency Lights sheet (8 rows)
    const emergencyLightData = [
      ["Location", "Tag", "Type", "Notes"],
      ["Lobby", "EL-001", "Exit Sign", ""],
      ["Hallway 1", "EL-002", "Emergency Light", ""],
      ["Stairwell A", "EL-003", "Exit Sign", ""],
      ["Stairwell B", "EL-004", "Exit Sign", ""],
      ["Office 101", "EL-005", "Emergency Light", ""],
      ["Conference Room", "EL-006", "Emergency Light", ""],
      ["Parking", "EL-007", "Exit Sign", ""],
      ["Basement", "EL-008", "Emergency Light", ""],
    ];
    const emergencyLightSheet = XLSX.utils.aoa_to_sheet(emergencyLightData);
    XLSX.utils.book_append_sheet(workbook, emergencyLightSheet, "Emergency Lights");

    // Sprinkler Systems sheet (3 systems)
    const sprinklerSystemData = [
      ["Location", "System ID", "Type", "Pressure", "Manufacturer", "Model", "Notes"],
      ["Building A", "SPR-SYS-001", "Wet", "120 psi", "Viking", "Model X", "Main system"],
      ["Building B", "SPR-SYS-002", "Dry", "90 psi", "Tyco", "Model Y", "Cold storage"],
      ["Parking Garage", "SPR-SYS-003", "Wet", "110 psi", "Victaulic", "Model Z", ""],
    ];
    const sprinklerSystemSheet = XLSX.utils.aoa_to_sheet(sprinklerSystemData);
    XLSX.utils.book_append_sheet(workbook, sprinklerSystemSheet, "Sprinkler Systems");

    // Write workbook to buffer
    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Upload to S3
    const { url: fileUrl, key: fileKey } = await storagePut(
      `test-imports/full_workbook_${Date.now()}.xlsx`,
      excelBuffer,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    // Create attachment record
    const [attachment] = await database.insert(attachments).values({
      entityType: "job",
      entityId: testJobId,
      siteId: testSiteId,
      jobId: testJobId,
      uploadedById: 1,
      fileName: "full_workbook_test.xlsx",
      fileKey: fileKey,
      fileUrl: fileUrl,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileSize: excelBuffer.length,
      uploadStatus: "completed",
      importStatus: "none",
    });
    testAttachmentId = (attachment as any).insertId;
  });

  afterAll(async () => {
    const database = await getDb();
    if (!database) return;

    // Cleanup test data
    await database.delete(devices).where(eq(devices.companyId, testCompanyId));
    await database.delete(attachments).where(eq(attachments.entityId, testJobId));
    await database.delete(jobs).where(eq(jobs.id, testJobId));
    await database.delete(sites).where(eq(sites.id, testSiteId));
    await database.delete(customerOrgs).where(eq(customerOrgs.id, testCustomerOrgId));
    await database.delete(companies).where(eq(companies.id, testCompanyId));
  });

  it("should import full workbook with site parsing and all device categories", async () => {
    const ctx = createTestContext("office");
    ctx.user.companyId = testCompanyId;
    const caller = appRouter.createCaller(ctx);

    // Import assets
    const result = await caller.assetImport.importAssetsFromExcel({ jobId: testJobId });

    // Verify import summary
    expect(result.success).toBe(true);
    expect(result.siteFieldsUpdated).toBeGreaterThan(0);
    expect(result.deviceCounts.fireAlarm).toBe(14); // 15 rows - 1 excluded (missing location)
    expect(result.deviceCounts.extinguishers).toBe(9); // 10 rows - 1 excluded
    expect(result.deviceCounts.emergencyLights).toBe(8);
    expect(result.deviceCounts.sprinklerSystems).toBe(3);
    expect(result.deviceCounts.total).toBe(34);
    expect(result.excludedRowsCount).toBe(2); // 2 rows with missing location

    // Verify site was updated
    const database = await getDb();
    if (!database) throw new Error("Database not available");
    
    const [updatedSite] = await database
      .select()
      .from(sites)
      .where(eq(sites.id, testSiteId))
      .limit(1);

    expect(updatedSite.name).toBe("Updated Site Name");
    expect(updatedSite.address).toBe("456 New Avenue");
    expect(updatedSite.city).toBe("New City");
    expect(updatedSite.state).toBe("New State");
    expect(updatedSite.postalCode).toBe("67890");
    expect(updatedSite.contactName).toBe("Jane Smith");
    expect(updatedSite.contactPhone).toBe("555-1234");

    // Verify devices were created
    const allDevices = await database
      .select()
      .from(devices)
      .where(and(
        eq(devices.companyId, testCompanyId),
        eq(devices.siteId, testSiteId)
      ));

    expect(allDevices.length).toBe(34);

    // Verify device categories
    const fireAlarmDevices = allDevices.filter(d => d.category === "FIRE_ALARM_DEVICE");
    const extinguishers = allDevices.filter(d => d.category === "FIRE_EXTINGUISHER");
    const emergencyLights = allDevices.filter(d => d.category === "EMERGENCY_LIGHT");

    expect(fireAlarmDevices.length).toBe(17); // 14 fire alarm + 3 sprinkler systems
    expect(extinguishers.length).toBe(9);
    expect(emergencyLights.length).toBe(8);

    // Verify excluded rows are reported
    expect(result.excludedRows.length).toBe(2);
    expect(result.excludedRows[0].reason).toBe("Missing location");
  }, 30000);

  it("should handle idempotent imports (re-importing same file)", async () => {
    const ctx = createTestContext("office");
    ctx.user.companyId = testCompanyId;
    const caller = appRouter.createCaller(ctx);

    // Import again
    const result = await caller.assetImport.importAssetsFromExcel({ jobId: testJobId });

    // Should still report success
    expect(result.success).toBe(true);
    expect(result.deviceCounts.total).toBe(34);

    // Verify device count didn't double (upsert worked)
    const database = await getDb();
    if (!database) throw new Error("Database not available");
    
    const allDevices = await database
      .select()
      .from(devices)
      .where(and(
        eq(devices.companyId, testCompanyId),
        eq(devices.siteId, testSiteId)
      ));

    expect(allDevices.length).toBe(34); // Same count, not doubled
  }, 30000);
});
