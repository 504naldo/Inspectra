import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Checklist Response Functions', () => {
  let testJobId: number;
  
  beforeAll(async () => {
    // Create a test job for checklist responses
    const job = await db.createJob({
      jobNumber: `TEST-CHECKLIST-${Date.now()}`,
      title: 'Test Checklist Job',
      siteId: 1,
      customerOrgId: 1,
      companyId: 1,
      assignedToId: 1,
      status: 'in_progress',
      inspectionType: 'annual',
      scheduledDate: new Date(),
    });
    testJobId = job.id;
  });
  
  it('should save a checklist response', async () => {
    await db.saveChecklistResponse({
      jobId: testJobId,
      sectionNumber: '22.1',
      itemId: 'A',
      status: 'PASS',
    });
    
    const response = await db.getChecklistResponseByJobAndItem(testJobId, '22.1', 'A');
    expect(response).toBeDefined();
    expect(response?.status).toBe('PASS');
    expect(response?.sectionNumber).toBe('22.1');
    expect(response?.itemId).toBe('A');
  });
  
  it('should update an existing checklist response', async () => {
    // First save
    await db.saveChecklistResponse({
      jobId: testJobId,
      sectionNumber: '22.1',
      itemId: 'B',
      status: 'PASS',
    });
    
    // Update to DEFICIENT with comment
    await db.saveChecklistResponse({
      jobId: testJobId,
      sectionNumber: '22.1',
      itemId: 'B',
      status: 'DEFICIENT',
      comment: 'Requires attention',
    });
    
    const response = await db.getChecklistResponseByJobAndItem(testJobId, '22.1', 'B');
    expect(response?.status).toBe('DEFICIENT');
    expect(response?.comment).toBe('Requires attention');
  });
  
  it('should save multiple responses in bulk', async () => {
    const responses = [
      {
        jobId: testJobId,
        sectionNumber: '22.2',
        itemId: 'A',
        status: 'PASS' as const,
      },
      {
        jobId: testJobId,
        sectionNumber: '22.2',
        itemId: 'B',
        status: 'PASS' as const,
      },
      {
        jobId: testJobId,
        sectionNumber: '22.2',
        itemId: 'C',
        status: 'NA' as const,
        comment: 'Not applicable to this system',
      },
    ];
    
    await db.bulkSaveChecklistResponses(responses);
    
    const allResponses = await db.getChecklistResponsesByJob(testJobId);
    const section22_2 = allResponses.filter(r => r.sectionNumber === '22.2');
    
    expect(section22_2.length).toBeGreaterThanOrEqual(3);
    expect(section22_2.find(r => r.itemId === 'C')?.comment).toBe('Not applicable to this system');
  });
  
  it('should retrieve all responses for a job', async () => {
    const allResponses = await db.getChecklistResponsesByJob(testJobId);
    
    expect(allResponses.length).toBeGreaterThan(0);
    expect(allResponses.every(r => r.jobId === testJobId)).toBe(true);
  });
  
  it('should handle N/A status with comments', async () => {
    await db.saveChecklistResponse({
      jobId: testJobId,
      sectionNumber: '22.4',
      itemId: 'A',
      status: 'NA',
      comment: 'No access to this area during inspection',
    });
    
    const response = await db.getChecklistResponseByJobAndItem(testJobId, '22.4', 'A');
    expect(response?.status).toBe('NA');
    expect(response?.comment).toContain('No access');
  });
  
  it('should delete all responses for a job', async () => {
    // Save a response
    await db.saveChecklistResponse({
      jobId: testJobId,
      sectionNumber: '22.5',
      itemId: 'A',
      status: 'PASS',
    });
    
    // Verify it exists
    let responses = await db.getChecklistResponsesByJob(testJobId);
    const before = responses.length;
    expect(before).toBeGreaterThan(0);
    
    // Delete all
    await db.deleteChecklistResponsesByJob(testJobId);
    
    // Verify deleted
    responses = await db.getChecklistResponsesByJob(testJobId);
    expect(responses.length).toBe(0);
  });
});
