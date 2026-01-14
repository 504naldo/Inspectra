import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { jobs, jobAssignments, users, companies, sites, customerOrgs } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Integration tests for multi-technician job assignment system
 * Tests the job_assignments many-to-many relationship
 */

describe('Multi-Technician Job Assignment', () => {
  let testCompanyId: number;
  let testSiteId: number;
  let testCustomerOrgId: number;
  let testJobId: number;
  let testTech1Id: number;
  let testTech2Id: number;
  let testTech3Id: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Create test company
    const [company] = await db.insert(companies).values({
      name: 'Test Company for Multi-Assign',
    }).$returningId();
    testCompanyId = company.id;

    // Create test customer org
    const [customerOrg] = await db.insert(customerOrgs).values({
      companyId: testCompanyId,
      name: 'Test Customer Org',
    }).$returningId();
    testCustomerOrgId = customerOrg.id;

    // Create test site
    const [site] = await db.insert(sites).values({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Test Site',
      address: '123 Test St',
    }).$returningId();
    testSiteId = site.id;

    // Create test technicians
    const [tech1] = await db.insert(users).values({
      openId: 'test-tech-1-multi',
      name: 'Tech One',
      email: 'tech1@test.com',
      role: 'technician',
      companyId: testCompanyId,
    }).$returningId();
    testTech1Id = tech1.id;

    const [tech2] = await db.insert(users).values({
      openId: 'test-tech-2-multi',
      name: 'Tech Two',
      email: 'tech2@test.com',
      role: 'technician',
      companyId: testCompanyId,
    }).$returningId();
    testTech2Id = tech2.id;

    const [tech3] = await db.insert(users).values({
      openId: 'test-tech-3-multi',
      name: 'Tech Three',
      email: 'tech3@test.com',
      role: 'technician',
      companyId: testCompanyId,
    }).$returningId();
    testTech3Id = tech3.id;

    // Create test job
    const [job] = await db.insert(jobs).values({
      companyId: testCompanyId,
      siteId: testSiteId,
      customerOrgId: testCustomerOrgId,
      jobNumber: 'TEST-MULTI-001',
      title: 'Multi-Technician Test Job',
      status: 'pending',
    }).$returningId();
    testJobId = job.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Cleanup in reverse order of creation
    await db.delete(jobAssignments).where(eq(jobAssignments.jobId, testJobId));
    await db.delete(jobs).where(eq(jobs.id, testJobId));
    await db.delete(sites).where(eq(sites.id, testSiteId));
    await db.delete(customerOrgs).where(eq(customerOrgs.id, testCustomerOrgId));
    await db.delete(users).where(eq(users.id, testTech1Id));
    await db.delete(users).where(eq(users.id, testTech2Id));
    await db.delete(users).where(eq(users.id, testTech3Id));
    await db.delete(companies).where(eq(companies.id, testCompanyId));
  });

  it('should assign multiple technicians to a job', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Assign two technicians
    await db.insert(jobAssignments).values([
      {
        jobId: testJobId,
        userId: testTech1Id,
        role: 'LEAD',
      },
      {
        jobId: testJobId,
        userId: testTech2Id,
        role: 'ASSIST',
      },
    ]);

    // Verify assignments
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    expect(assignments).toHaveLength(2);
    expect(assignments.find(a => a.userId === testTech1Id)?.role).toBe('LEAD');
    expect(assignments.find(a => a.userId === testTech2Id)?.role).toBe('ASSIST');
  });

  it('should prevent duplicate assignments (unique constraint)', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Try to assign the same technician twice
    await expect(async () => {
      await db.insert(jobAssignments).values({
        jobId: testJobId,
        userId: testTech1Id,
        role: 'ASSIST',
      });
    }).rejects.toThrow();
  });

  it('should allow adding additional technicians', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Add third technician
    await db.insert(jobAssignments).values({
      jobId: testJobId,
      userId: testTech3Id,
      role: 'ASSIST',
    });

    // Verify all three assignments exist
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    expect(assignments).toHaveLength(3);
  });

  it('should allow removing a technician from a job', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Remove tech2
    await db
      .delete(jobAssignments)
      .where(eq(jobAssignments.userId, testTech2Id));

    // Verify only 2 assignments remain
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    expect(assignments).toHaveLength(2);
    expect(assignments.find(a => a.userId === testTech2Id)).toBeUndefined();
  });

  it('should support replacing all assignments', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Delete all existing assignments
    await db.delete(jobAssignments).where(eq(jobAssignments.jobId, testJobId));

    // Assign only tech2
    await db.insert(jobAssignments).values({
      jobId: testJobId,
      userId: testTech2Id,
      role: 'LEAD',
    });

    // Verify only tech2 is assigned
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    expect(assignments).toHaveLength(1);
    expect(assignments[0].userId).toBe(testTech2Id);
    expect(assignments[0].role).toBe('LEAD');
  });

  it('should support unassigning all technicians', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Delete all assignments
    await db.delete(jobAssignments).where(eq(jobAssignments.jobId, testJobId));

    // Verify no assignments
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    expect(assignments).toHaveLength(0);
  });
});
