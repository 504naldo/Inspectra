import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import { eq, and } from "drizzle-orm";
import { companies, customerOrgs, sites, jobs, attachments, devices } from "../drizzle/schema";
import { getDb } from "./db";
import { storagePut } from "./storage";
import * as XLSX from "xlsx";

/**
 * filesRouter Site Sheet Import Test
 * 
 * Tests:
 * - Site sheet detection in previewImportExcel
 * - Site sheet parsing with key/value format
 * - Site record update with upsert strategy
 * - Device import still works (all rows, no limits)
 */

function createTestContext(role: "admin" | "office" | "technician" = "office") {
  return {
    user: {
      id: 1,
      openId: "test-filesrouter-site",
      name: "Test User",
      email: "test@example.com",
      role,
      companyId: 1,
      isActive: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
  };
}

describe("filesRouter Site Sheet Import", () => {
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
      name: "Test FilesRouter Company",
      email: "filesrouter@test.com",
    });
    testCompanyId = (company as any).insertId;

    // Create test customer org
    const [customerOrg] = await database.insert(customerOrgs).values({
      companyId: testCompanyId,
      name: "Test Customer for FilesRouter",
      contactName: "John Doe",
      contactEmail: "john@customer.com",
    });
    testCustomerOrgId = (customerOrg as any).insertId;

    // Create test site with original data
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
      jobNumber: `FILESROUTER-TEST-${Date.now()}`,
      title: "FilesRouter Site Import Test",
      jobType: "annual",
      status: "scheduled",
      scheduledDate: new Date(),
    });
    testJobId = (job as any).insertId;

    // Create test Excel workbook with Site sheet + device sheets
    const workbook = XLSX.utils.book_new();

    // Site sheet (key/value format)
    const siteData = [
      ["Site Name", "Updated Site Name from Excel"],
      ["Address", "456 New Avenue"],
      ["City", "New City"],
      ["State", "New State"],
      ["Postal Code", "67890"],
      ["Contact Name", "Jane Smith"],
      ["Contact Phone", "555-1234"],
      ["Notes", "Updated via filesRouter import"],
    ];
    const siteSheet = XLSX.utils.aoa_to_sheet(siteData);
    XLSX.utils.book_append_sheet(workbook, siteSheet, "Site Information");

    // Fire Extinguishers sheet (12 rows to test no limits)
    const extinguisherData = [
      ["Location", "Tag", "Type"],
      ["Lobby", "EXT-001", "ABC 10lb"],
      ["Hallway 1", "EXT-002", "ABC 10lb"],
      ["Kitchen", "EXT-003", "K-Class"],
      ["Office 101", "EXT-004", "ABC 5lb"],
      ["Conference Room", "EXT-005", "ABC 10lb"],
      ["Storage", "EXT-006", "ABC 10lb"],
      ["Mechanical Room", "EXT-007", "ABC 20lb"],
      ["Parking", "EXT-008", "ABC 10lb"],
      ["Basement", "EXT-009", "ABC 10lb"],
      ["Roof", "EXT-010", "ABC 10lb"],
      ["Stairwell A", "EXT-011", "ABC 10lb"],
      ["Stairwell B", "EXT-012", "ABC 10lb"],
    ];
    const extinguisherSheet = XLSX.utils.aoa_to_sheet(extinguisherData);
    XLSX.utils.book_append_sheet(workbook, extinguisherSheet, "Fire Extinguishers");

    // Emergency Lights sheet (8 rows)
    const emergencyLightData = [
      ["Location", "Tag", "Type"],
      ["Lobby", "EL-001", "Exit Sign"],
      ["Hallway 1", "EL-002", "Emergency Light"],
      ["Stairwell A", "EL-003", "Exit Sign"],
      ["Stairwell B", "EL-004", "Exit Sign"],
      ["Office 101", "EL-005", "Emergency Light"],
      ["Conference Room", "EL-006", "Emergency Light"],
      ["Parking", "EL-007", "Exit Sign"],
      ["Basement", "EL-008", "Emergency Light"],
    ];
    const emergencyLightSheet = XLSX.utils.aoa_to_sheet(emergencyLightData);
    XLSX.utils.book_append_sheet(workbook, emergencyLightSheet, "Emergency Lights");

    // Write workbook to buffer
    const excelBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Upload to S3
    const { url: fileUrl, key: fileKey } = await storagePut(
      `test-filesrouter/site_import_${Date.now()}.xlsx`,
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
      fileName: "filesrouter_site_test.xlsx",
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

  it("should detect Site sheet in preview", async () => {
    const ctx = createTestContext("office");
    ctx.user.companyId = testCompanyId;
    const caller = appRouter.createCaller(ctx);

    // Preview import
    const preview = await caller.files.previewImportExcel({ fileId: testAttachmentId });

    // Verify Site sheet detected
    expect(preview.hasSiteSheet).toBe(true);
    expect(preview.sitePreview).toBeDefined();
    expect(preview.sitePreview.name).toBe("Updated Site Name from Excel");
    expect(preview.sitePreview.address).toBe("456 New Avenue");
    expect(preview.sitePreview.city).toBe("New City");
    expect(preview.sitePreview.contactName).toBe("Jane Smith");
    expect(preview.sitePreview.contactPhone).toBe("555-1234");

    // Verify device counts
    expect(preview.counts.extinguishers).toBe(12);
    expect(preview.counts.emergencyLights).toBe(8);
  }, 30000);

  it("should import Site sheet and update site record", async () => {
    const ctx = createTestContext("office");
    ctx.user.companyId = testCompanyId;
    const caller = appRouter.createCaller(ctx);

    // Import devices (which now also imports Site)
    const result = await caller.files.importExcelDevices({
      fileId: testAttachmentId,
      siteId: testSiteId,
      jobId: testJobId,
    });

    // Verify site was updated
    expect(result.siteUpdated.fieldsUpdated).toBeGreaterThan(0);
    expect(result.siteUpdated.updatedFields).toContain("name");
    expect(result.siteUpdated.updatedFields).toContain("address");
    expect(result.siteUpdated.updatedFields).toContain("city");

    // Verify site record in database
    const database = await getDb();
    if (!database) throw new Error("Database not available");

    const [updatedSite] = await database
      .select()
      .from(sites)
      .where(eq(sites.id, testSiteId))
      .limit(1);

    expect(updatedSite.name).toBe("Updated Site Name from Excel");
    expect(updatedSite.address).toBe("456 New Avenue");
    expect(updatedSite.city).toBe("New City");
    expect(updatedSite.state).toBe("New State");
    expect(updatedSite.postalCode).toBe("67890");
    expect(updatedSite.contactName).toBe("Jane Smith");
    expect(updatedSite.contactPhone).toBe("555-1234");

    // Verify devices were imported (all rows, no limits)
    expect(result.imported.extinguishers).toBe(12);
    expect(result.imported.emergencyLights).toBe(8);

    const allDevices = await database
      .select()
      .from(devices)
      .where(and(
        eq(devices.companyId, testCompanyId),
        eq(devices.siteId, testSiteId)
      ));

    expect(allDevices.length).toBe(20); // 12 extinguishers + 8 emergency lights
  }, 30000);

  it("should handle re-import without duplicates", async () => {
    const ctx = createTestContext("office");
    ctx.user.companyId = testCompanyId;
    const caller = appRouter.createCaller(ctx);

    // Import again
    const result = await caller.files.importExcelDevices({
      fileId: testAttachmentId,
      siteId: testSiteId,
      jobId: testJobId,
    });

    // Should update existing devices, not create new ones
    expect(result.updated.extinguishers).toBe(12);
    expect(result.updated.emergencyLights).toBe(8);
    expect(result.imported.extinguishers).toBe(0);
    expect(result.imported.emergencyLights).toBe(0);

    // Verify device count didn't double
    const database = await getDb();
    if (!database) throw new Error("Database not available");

    const allDevices = await database
      .select()
      .from(devices)
      .where(and(
        eq(devices.companyId, testCompanyId),
        eq(devices.siteId, testSiteId)
      ));

    expect(allDevices.length).toBe(20); // Same count, not doubled
  }, 30000);
});
