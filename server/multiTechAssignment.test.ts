import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Multi-Tech Job Assignment', () => {
  let companyId: number;
  let siteId: number;
  let customerOrgId: number;
  let leadTechId: number;
  let additionalTech1Id: number;
  let additionalTech2Id: number;
  let jobId: number;

  beforeAll(async () => {
    // Create test company
    const company = await db.createCompany({
      name: 'Test Fire Company',
      email: 'test@firecompany.com',
      phone: '555-0100'
    });
    companyId = company.id;

    // Create customer org
    const customerOrg = await db.createCustomerOrg({
      companyId,
      name: 'Test Customer',
      contactName: 'John Doe',
      contactEmail: 'john@customer.com',
      contactPhone: '555-0200'
    });
    customerOrgId = customerOrg.id;

    // Create site
    const site = await db.createSite({
      companyId,
      customerOrgId,
      name: 'Test Site',
      address: '123 Test St',
      city: 'Test City',
      postalCode: '12345'
    });
    siteId = site.id;

    // Create technicians
    await db.upsertUser({
      openId: 'lead-tech-test',
      name: 'Lead Technician',
      email: 'lead@ewandf.ca',
      role: 'technician',
      isActive: 1,
      companyId
    });
    const leadTech = await db.getUserByOpenId('lead-tech-test');
    if (!leadTech) throw new Error('Failed to create lead tech');
    leadTechId = leadTech.id;

    await db.upsertUser({
      openId: 'additional-tech-1-test',
      name: 'Additional Tech 1',
      email: 'tech1@ewandf.ca',
      role: 'technician',
      isActive: 1,
      companyId
    });
    const additionalTech1 = await db.getUserByOpenId('additional-tech-1-test');
    if (!additionalTech1) throw new Error('Failed to create additional tech 1');
    additionalTech1Id = additionalTech1.id;

    await db.upsertUser({
      openId: 'additional-tech-2-test',
      name: 'Additional Tech 2',
      email: 'tech2@ewandf.ca',
      role: 'technician',
      isActive: 1,
      companyId
    });
    const additionalTech2 = await db.getUserByOpenId('additional-tech-2-test');
    if (!additionalTech2) throw new Error('Failed to create additional tech 2');
    additionalTech2Id = additionalTech2.id;

    // Create job
    const job = await db.createJob({
      companyId,
      siteId,
      customerOrgId,
      jobNumber: 'TEST-JOB-001',
      title: 'Test Job',
      jobType: 'annual',
      status: 'pending'
    });
    jobId = job.id;
  });

  it('should assign lead technician to job', async () => {
    await db.updateJob(jobId, {
      leadTechnicianId: leadTechId,
      assignedAt: new Date()
    });

    const job = await db.getJobById(jobId);
    expect(job?.leadTechnicianId).toBe(leadTechId);
  });

  it('should add additional technician to job', async () => {
    await db.addJobAssignment({
      jobId,
      userId: additionalTech1Id,
      role: 'ASSIST'
    });

    const technicians = await db.getJobTechnicians(jobId);
    expect(technicians.additional).toHaveLength(1);
    expect(technicians.additional[0].id).toBe(additionalTech1Id);
  });

  it('should add multiple additional technicians', async () => {
    await db.addJobAssignment({
      jobId,
      userId: additionalTech2Id,
      role: 'ASSIST'
    });

    const technicians = await db.getJobTechnicians(jobId);
    expect(technicians.additional).toHaveLength(2);
    expect(technicians.lead?.id).toBe(leadTechId);
  });

  it('should remove additional technician', async () => {
    await db.removeJobAssignment(jobId, additionalTech1Id);

    const technicians = await db.getJobTechnicians(jobId);
    expect(technicians.additional).toHaveLength(1);
    expect(technicians.additional[0].id).toBe(additionalTech2Id);
  });

  it('should clear all additional technicians', async () => {
    await db.clearJobAssignments(jobId);

    const technicians = await db.getJobTechnicians(jobId);
    expect(technicians.additional).toHaveLength(0);
    expect(technicians.lead?.id).toBe(leadTechId);
  });

  it('should return lead and additional technicians', async () => {
    // Re-add technicians
    await db.addJobAssignment({
      jobId,
      userId: additionalTech1Id,
      role: 'ASSIST'
    });
    await db.addJobAssignment({
      jobId,
      userId: additionalTech2Id,
      role: 'ASSIST'
    });

    const technicians = await db.getJobTechnicians(jobId);
    
    expect(technicians.lead).toBeDefined();
    expect(technicians.lead?.id).toBe(leadTechId);
    expect(technicians.lead?.name).toBe('Lead Technician');
    
    expect(technicians.additional).toHaveLength(2);
    const techIds = technicians.additional.map(t => t.id);
    expect(techIds).toContain(additionalTech1Id);
    expect(techIds).toContain(additionalTech2Id);
  });

  it('should handle job with no lead technician', async () => {
    // Create job without lead
    const job2 = await db.createJob({
      companyId,
      siteId,
      customerOrgId,
      jobNumber: 'TEST-JOB-002',
      title: 'Unassigned Job',
      jobType: 'annual',
      status: 'pending'
    });

    const technicians = await db.getJobTechnicians(job2.id);
    expect(technicians.lead).toBeNull();
    expect(technicians.additional).toHaveLength(0);
  });
});
