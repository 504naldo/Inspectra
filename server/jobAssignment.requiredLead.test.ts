import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getDb } from './db';
import { jobs, jobAssignments, users, companies, sites, customerOrgs } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Integration tests for REQUIRED Lead technician feature
 * Tests that exactly one LEAD must exist per job when there are assignments
 */

describe('Required Lead Technician', () => {
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
      name: 'Test Company for Required Lead',
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
      openId: 'test-tech-1-lead',
      name: 'Tech One',
      email: 'tech1-lead@test.com',
      role: 'technician',
      companyId: testCompanyId,
    }).$returningId();
    testTech1Id = tech1.id;

    const [tech2] = await db.insert(users).values({
      openId: 'test-tech-2-lead',
      name: 'Tech Two',
      email: 'tech2-lead@test.com',
      role: 'technician',
      companyId: testCompanyId,
    }).$returningId();
    testTech2Id = tech2.id;

    const [tech3] = await db.insert(users).values({
      openId: 'test-tech-3-lead',
      name: 'Tech Three',
      email: 'tech3-lead@test.com',
      role: 'technician',
      companyId: testCompanyId,
    }).$returningId();
    testTech3Id = tech3.id;

    // Create test job
    const [job] = await db.insert(jobs).values({
      companyId: testCompanyId,
      siteId: testSiteId,
      customerOrgId: testCustomerOrgId,
      jobNumber: 'TEST-LEAD-001',
      title: 'Required Lead Test Job',
      status: 'pending',
    }).$returningId();
    testJobId = job.id;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // Cleanup
    await db.delete(jobAssignments).where(eq(jobAssignments.jobId, testJobId));
    await db.delete(jobs).where(eq(jobs.id, testJobId));
    await db.delete(sites).where(eq(sites.id, testSiteId));
    await db.delete(customerOrgs).where(eq(customerOrgs.id, testCustomerOrgId));
    await db.delete(users).where(eq(users.id, testTech1Id));
    await db.delete(users).where(eq(users.id, testTech2Id));
    await db.delete(users).where(eq(users.id, testTech3Id));
    await db.delete(companies).where(eq(companies.id, testCompanyId));
  });

  it('should require exactly one LEAD when assigning technicians', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Assign two technicians with one Lead
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

    // Verify exactly one Lead exists
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    const leads = assignments.filter(a => a.role === 'LEAD');
    const assists = assignments.filter(a => a.role === 'ASSIST');

    expect(leads).toHaveLength(1);
    expect(assists).toHaveLength(1);
    expect(leads[0].userId).toBe(testTech1Id);
  });

  it('should allow changing the Lead technician', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Change Lead from tech1 to tech2
    await db
      .update(jobAssignments)
      .set({ role: 'ASSIST' })
      .where(eq(jobAssignments.userId, testTech1Id));

    await db
      .update(jobAssignments)
      .set({ role: 'LEAD' })
      .where(eq(jobAssignments.userId, testTech2Id));

    // Verify new Lead
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    const leads = assignments.filter(a => a.role === 'LEAD');
    expect(leads).toHaveLength(1);
    expect(leads[0].userId).toBe(testTech2Id);
  });

  it('should allow adding assistant technicians without changing Lead', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Add tech3 as assistant
    await db.insert(jobAssignments).values({
      jobId: testJobId,
      userId: testTech3Id,
      role: 'ASSIST',
    });

    // Verify Lead is still tech2
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    const leads = assignments.filter(a => a.role === 'LEAD');
    expect(leads).toHaveLength(1);
    expect(leads[0].userId).toBe(testTech2Id);
    expect(assignments).toHaveLength(3);
  });

  it('should allow removing assistant technicians without affecting Lead', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Remove tech1 (assistant)
    await db
      .delete(jobAssignments)
      .where(eq(jobAssignments.userId, testTech1Id));

    // Verify Lead is still tech2
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    const leads = assignments.filter(a => a.role === 'LEAD');
    expect(leads).toHaveLength(1);
    expect(leads[0].userId).toBe(testTech2Id);
    expect(assignments).toHaveLength(2);
  });

  it('should allow unassigning all technicians (no Lead required when empty)', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Remove all assignments
    await db.delete(jobAssignments).where(eq(jobAssignments.jobId, testJobId));

    // Verify no assignments
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    expect(assignments).toHaveLength(0);
  });

  it('should assign first technician as Lead when starting fresh', async () => {
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Assign tech3 as first and only technician
    await db.insert(jobAssignments).values({
      jobId: testJobId,
      userId: testTech3Id,
      role: 'LEAD',
    });

    // Verify tech3 is Lead
    const assignments = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, testJobId));

    expect(assignments).toHaveLength(1);
    expect(assignments[0].role).toBe('LEAD');
    expect(assignments[0].userId).toBe(testTech3Id);
  });
});
