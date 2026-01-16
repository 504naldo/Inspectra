import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { jobs, sites, companies, attachments, devices } from '../drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { storagePut } from './storage';
import * as fs from 'fs';
import * as path from 'path';

describe('Asset Import from Excel', () => {
  let testCompanyId: number;
  let testSiteId: number;
  let testJobId: number;
  let testAttachmentId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Create test company
    const [company] = await db.insert(companies).values({
      name: 'Test Import Company',
      email: 'test@import.com',
    }).$returningId();
    testCompanyId = company.id;

    // Create test site
    const [site] = await db.insert(sites).values({
      companyId: testCompanyId,
      customerOrgId: 1,
      name: 'Test Import Site',
      address: '123 Test St',
    }).$returningId();
    testSiteId = site.id;

    // Create test job
    const [job] = await db.insert(jobs).values({
      companyId: testCompanyId,
      siteId: testSiteId,
      customerOrgId: 1,
      jobNumber: 'TEST-IMPORT-001',
      title: 'Test Import Job',
      status: 'pending',
      priority: 'medium',
      jobType: 'annual',
    }).$returningId();
    testJobId = job.id;

    // Upload sample Excel file to S3
    const excelPath = path.join(process.cwd(), 'sample_assets.xlsx');
    const excelBuffer = fs.readFileSync(excelPath);
    
    const { url: fileUrl, key: fileKey } = await storagePut(
      `test-imports/sample_assets_${Date.now()}.xlsx`,
      excelBuffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    // Create attachment record
    const [attachment] = await db.insert(attachments).values({
      entityType: 'job',
      entityId: testJobId,
      jobId: testJobId,
      siteId: testSiteId,
      uploadedById: 1,
      fileName: 'sample_assets.xlsx',
      fileKey: fileKey,
      fileUrl: fileUrl,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileSize: excelBuffer.length,
      uploadStatus: 'completed',
    }).$returningId();
    testAttachmentId = attachment.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Clean up test data
    await db.delete(devices).where(eq(devices.companyId, testCompanyId));
    await db.delete(attachments).where(eq(attachments.id, testAttachmentId));
    await db.delete(jobs).where(eq(jobs.id, testJobId));
    await db.delete(sites).where(eq(sites.id, testSiteId));
    await db.delete(companies).where(eq(companies.id, testCompanyId));
  });

  it('should import fire extinguishers and emergency lights from Excel', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Import the assetImportRouter procedure
    const { assetImportRouter } = await import('./routers/assetImportRouter');
    
    // Create a mock context
    const mockCtx = {
      user: {
        id: 1,
        companyId: testCompanyId,
        role: 'admin' as const,
      },
      req: {} as any,
      res: {} as any,
    };

    // Call the import procedure
    const caller = assetImportRouter.createCaller(mockCtx);
    const result = await caller.importAssetsFromExcel({ jobId: testJobId });

    // Verify result
    expect(result.success).toBe(true);
    expect(result.extinguisherCount).toBe(15);
    expect(result.emergencyLightCount).toBe(23);
    expect(result.totalCount).toBe(38);
    expect(result.message).toContain('15 fire extinguishers');
    expect(result.message).toContain('23 emergency lights');

    // Verify devices were created in database
    const extinguishers = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.companyId, testCompanyId),
          eq(devices.siteId, testSiteId),
          eq(devices.category, 'FIRE_EXTINGUISHER')
        )
      );

    const emergencyLights = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.companyId, testCompanyId),
          eq(devices.siteId, testSiteId),
          eq(devices.category, 'EMERGENCY_LIGHT')
        )
      );

    expect(extinguishers.length).toBe(15);
    expect(emergencyLights.length).toBe(23);

    // Verify sample device data
    const extinguisher1 = extinguishers.find(d => d.barcode === 'EXT-001');
    expect(extinguisher1).toBeDefined();
    expect(extinguisher1?.location).toBe('Main Lobby');
    expect(extinguisher1?.deviceType).toBe('ABC 10lb');
    expect(extinguisher1?.notes).toBe('Near front entrance');
    expect(extinguisher1?.externalRef).toBeDefined();

    const light1 = emergencyLights.find(d => d.barcode === 'LIGHT-001');
    expect(light1).toBeDefined();
    expect(light1?.location).toBe('Main Entrance');
    expect(light1?.deviceType).toBe('Exit Sign LED');
    expect(light1?.notes).toBe('Above door');
    expect(light1?.externalRef).toBeDefined();
  });

  it('should be idempotent - running import twice should not duplicate devices', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    const { assetImportRouter } = await import('./routers/assetImportRouter');
    
    const mockCtx = {
      user: {
        id: 1,
        companyId: testCompanyId,
        role: 'admin' as const,
      },
      req: {} as any,
      res: {} as any,
    };

    // Run import a second time
    const caller = assetImportRouter.createCaller(mockCtx);
    const result = await caller.importAssetsFromExcel({ jobId: testJobId });

    // Should still report same counts (updates, not new inserts)
    expect(result.success).toBe(true);
    expect(result.extinguisherCount).toBe(15);
    expect(result.emergencyLightCount).toBe(23);

    // Verify device count hasn't increased
    const extinguishers = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.companyId, testCompanyId),
          eq(devices.siteId, testSiteId),
          eq(devices.category, 'FIRE_EXTINGUISHER')
        )
      );

    const emergencyLights = await db
      .select()
      .from(devices)
      .where(
        and(
          eq(devices.companyId, testCompanyId),
          eq(devices.siteId, testSiteId),
          eq(devices.category, 'EMERGENCY_LIGHT')
        )
      );

    // Should still be 15 and 23, not 30 and 46
    expect(extinguishers.length).toBe(15);
    expect(emergencyLights.length).toBe(23);
  });

  it('should throw error if no Excel file is attached to job', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Create a job without attachments
    const [jobWithoutFile] = await db.insert(jobs).values({
      companyId: testCompanyId,
      siteId: testSiteId,
      customerOrgId: 1,
      jobNumber: 'TEST-NO-FILE',
      title: 'Test Job Without File',
      status: 'pending',
      priority: 'medium',
      jobType: 'annual',
    }).$returningId();

    const { assetImportRouter } = await import('./routers/assetImportRouter');
    
    const mockCtx = {
      user: {
        id: 1,
        companyId: testCompanyId,
        role: 'admin' as const,
      },
      req: {} as any,
      res: {} as any,
    };

    const caller = assetImportRouter.createCaller(mockCtx);
    
    await expect(
      caller.importAssetsFromExcel({ jobId: jobWithoutFile.id })
    ).rejects.toThrow('No file found for this job');

    // Clean up
    await db.delete(jobs).where(eq(jobs.id, jobWithoutFile.id));
  });

  it('should throw error if user does not have companyId', async () => {
    const { assetImportRouter } = await import('./routers/assetImportRouter');
    
    const mockCtx = {
      user: {
        id: 1,
        companyId: null,
        role: 'admin' as const,
      },
      req: {} as any,
      res: {} as any,
    };

    const caller = assetImportRouter.createCaller(mockCtx);
    
    await expect(
      caller.importAssetsFromExcel({ jobId: testJobId })
    ).rejects.toThrow('User must belong to a company');
  });
});
