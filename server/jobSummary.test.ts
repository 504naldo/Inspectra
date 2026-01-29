import { describe, it, expect, beforeAll } from 'vitest';
import { getJobSummary } from './jobSummary';
import * as db from './db';

describe('Job Summary', () => {
  let testJobId: number;
  let testSiteId: number;
  let testCompanyId: number;
  let testCustomerOrgId: number;

  beforeAll(async () => {
    // Create test data
    const company = await db.createCompany({
      name: 'Test Company',
      address: '123 Test St',
      phone: '555-0100',
      email: 'test@example.com',
    });
    testCompanyId = company.id;

    const customerOrg = await db.createCustomerOrg({
      companyId: testCompanyId,
      name: 'Test Customer',
      contactName: 'John Doe',
      contactEmail: 'john@example.com',
      contactPhone: '555-0101',
    });
    testCustomerOrgId = customerOrg.id;

    const site = await db.createSite({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Test Site',
      address: '456 Test Ave',
      city: 'Test City',
      province: 'BC',
      postalCode: 'V1V 1V1',
    });
    testSiteId = site.id;

    const job = await db.createJob({
      companyId: testCompanyId,
      siteId: testSiteId,
      customerOrgId: testCustomerOrgId,
      jobNumber: 'TEST-001',
      title: 'Test Job',
      jobType: 'annual',
      status: 'in_progress',
    });
    testJobId = job.id;
  });

  it('should return job summary with basic info', async () => {
    const summary = await getJobSummary(testJobId);

    expect(summary).toBeDefined();
    expect(summary.jobId).toBe(testJobId);
    expect(summary.siteId).toBe(testSiteId);
    expect(summary.siteName).toBe('Test Site');
    expect(summary.siteAddress).toBe('456 Test Ave');
    expect(summary.jobNumber).toBe('TEST-001');
  });

  it('should calculate system coverage correctly', async () => {
    const summary = await getJobSummary(testJobId);

    expect(summary.summary.systemCoverage).toBeDefined();
    expect(summary.summary.systemCoverage.fireAlarmSystem).toBe(false); // No devices yet
    expect(summary.summary.systemCoverage.sprinklerITM).toBe(false);
    expect(summary.summary.systemCoverage.fireExtinguishers).toBe(false);
    expect(summary.summary.systemCoverage.emergencyLighting).toBe(false);
    expect(summary.summary.systemCoverage.smokeAlarms).toBe(false);
  });

  it('should calculate inspection totals correctly', async () => {
    const summary = await getJobSummary(testJobId);

    expect(summary.summary.inspectionTotals).toBeDefined();
    expect(summary.summary.inspectionTotals.fireAlarmDevices).toBe(0); // No devices yet
    expect(summary.summary.inspectionTotals.sprinklerComponents).toBe(0);
    expect(summary.summary.inspectionTotals.smokeAlarms).toBe(0);
    expect(summary.summary.inspectionTotals.fireExtinguishers).toBe(0);
    expect(summary.summary.inspectionTotals.emergencyLights).toBe(0);
  });

  it('should calculate deficiency breakdown correctly', async () => {
    const summary = await getJobSummary(testJobId);

    expect(summary.summary.deficiencyBreakdown).toBeDefined();
    expect(summary.summary.deficiencyBreakdown.total).toBe(0); // No deficiencies yet
    expect(summary.summary.deficiencyBreakdown.critical).toBe(0);
    expect(summary.summary.deficiencyBreakdown.major).toBe(0);
    expect(summary.summary.deficiencyBreakdown.minor).toBe(0);
  });

  it('should calculate cost summary correctly', async () => {
    const summary = await getJobSummary(testJobId);

    expect(summary.summary.costSummary).toBeDefined();
    expect(summary.summary.costSummary.labourSubtotal).toBe(0); // No costs yet
    expect(summary.summary.costSummary.materialsSubtotal).toBe(0);
    expect(summary.summary.costSummary.subtotal).toBe(0);
    expect(summary.summary.costSummary.tax).toBe(0);
    expect(summary.summary.costSummary.grandTotal).toBe(0);
  });

  it('should calculate completion status correctly', async () => {
    const summary = await getJobSummary(testJobId);

    expect(summary.completionStatus).toBeDefined();
    expect(summary.completionStatus.sectionsCompleted).toBe(0); // No sections completed yet
    expect(summary.completionStatus.totalSections).toBe(5);
    expect(summary.completionStatus.percentComplete).toBe(0);
  });

  it('should throw error for non-existent job', async () => {
    await expect(getJobSummary(99999)).rejects.toThrow('Job 99999 not found');
  });
});
