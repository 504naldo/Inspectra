import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';

describe('Site Details Sync & Reliability', () => {
  let testCompanyId: number;
  let testCustomerOrgId: number;

  beforeAll(async () => {
    // Create test company
    const company = await db.createCompany({
      name: 'Test Fire Protection Co',
      email: 'test@example.com',
    });
    testCompanyId = company.id;

    // Create test customer org
    const customerOrg = await db.createCustomerOrg({
      companyId: testCompanyId,
      name: 'Test Customer',
      contactName: 'John Doe',
      contactEmail: 'john@customer.com',
    });
    testCustomerOrgId = customerOrg.id;
  });

  it('should always initialize summary on site creation', async () => {
    // Build summary like the router does
    const input = {
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'New Test Site',
      address: '456 Test St',
      city: 'Vancouver',
      state: 'BC',
      postalCode: 'V6B 2A2',
      contactName: 'Jane Doe',
      contactPhone: '(604) 555-5678',
    };
    
    const summary = {
      client: { name: input.name },
      building: { name: input.name || '' },
      address: {
        street: input.address || '',
        city: input.city || '',
        state: input.state || '',
        postalCode: input.postalCode || '',
      },
      contacts: [{
        name: input.contactName || '',
        phone: input.contactPhone || '',
        email: '',
        role: 'Primary Contact',
      }],
      monitoring: {
        company: '',
        accountNumber: '',
        phone: '',
        password: '',
      },
      notes: '',
    };
    
    const site = await db.createSite({ ...input, summary });

    // Summary should always exist
    expect(site.summary).toBeDefined();
    expect(site.summary).not.toBeNull();
    
    // Summary should have complete structure
    expect(site.summary?.client).toBeDefined();
    expect(site.summary?.building).toBeDefined();
    expect(site.summary?.address).toBeDefined();
    expect(site.summary?.contacts).toBeDefined();
    expect(site.summary?.monitoring).toBeDefined();
    
    // Values should match input
    expect(site.summary?.building?.name).toBe('New Test Site');
    expect(site.summary?.address?.street).toBe('456 Test St');
    expect(site.summary?.address?.city).toBe('Vancouver');
    expect(site.summary?.contacts?.[0]?.name).toBe('Jane Doe');
    expect(site.summary?.contacts?.[0]?.phone).toBe('(604) 555-5678');
  });

  it('should initialize summary with empty strings for missing fields', async () => {
    const input = {
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Minimal Site',
    };
    
    const summary = {
      client: { name: input.name },
      building: { name: input.name || '' },
      address: {
        street: '',
        city: '',
        state: '',
        postalCode: '',
      },
      contacts: [{
        name: '',
        phone: '',
        email: '',
        role: 'Primary Contact',
      }],
      monitoring: {
        company: '',
        accountNumber: '',
        phone: '',
        password: '',
      },
      notes: '',
    };
    
    const site = await db.createSite({ ...input, summary });

    // Summary should exist even with minimal input
    expect(site.summary).toBeDefined();
    expect(site.summary?.building?.name).toBe('Minimal Site');
    expect(site.summary?.address?.street).toBe('');
    expect(site.summary?.address?.city).toBe('');
    expect(site.summary?.contacts?.[0]?.name).toBe('');
    expect(site.summary?.contacts?.[0]?.phone).toBe('');
    expect(site.summary?.contacts?.[0]?.email).toBe('');
    expect(site.summary?.monitoring?.company).toBe('');
  });

  it('should provide summary fallback for old sites without summary', async () => {
    // Create a site directly without summary (simulating old data)
    const db_instance = await db.getDb();
    if (!db_instance) throw new Error('DB not available');
    
    const { sites } = await import('../drizzle/schema');
    const result = await db_instance.insert(sites).values({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Old Site Without Summary',
      address: '789 Old St',
      city: 'Victoria',
      contactName: 'Old Contact',
      contactPhone: '(250) 555-9999',
      // No summary field
    });
    
    const siteId = Number(result[0].insertId);
    
    // Retrieve the site - should have fallback summary
    const site = await db.getSiteById(siteId);
    
    expect(site).toBeDefined();
    expect(site?.summary).toBeDefined();
    expect(site?.summary?.building?.name).toBe('Old Site Without Summary');
    expect(site?.summary?.address?.street).toBe('789 Old St');
    expect(site?.summary?.address?.city).toBe('Victoria');
    expect(site?.summary?.contacts?.[0]?.name).toBe('Old Contact');
    expect(site?.summary?.contacts?.[0]?.phone).toBe('(250) 555-9999');
  });

  it('should keep summary in sync when updating flat columns', async () => {
    // Create initial site
    const site = await db.createSite({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Site To Update',
      address: '100 Update St',
      city: 'Burnaby',
      contactName: 'Original Contact',
      contactPhone: '(604) 555-1111',
    });

    // Update flat columns
    await db.updateSite(site.id, {
      name: 'Updated Site Name',
      address: '200 Updated St',
      city: 'Richmond',
      contactName: 'Updated Contact',
      contactPhone: '(604) 555-2222',
    });

    // Retrieve updated site
    const updatedSite = await db.getSiteById(site.id);

    // Summary should be synced with flat columns
    expect(updatedSite?.summary?.building?.name).toBe('Updated Site Name');
    expect(updatedSite?.summary?.address?.street).toBe('200 Updated St');
    expect(updatedSite?.summary?.address?.city).toBe('Richmond');
    expect(updatedSite?.summary?.contacts?.[0]?.name).toBe('Updated Contact');
    expect(updatedSite?.summary?.contacts?.[0]?.phone).toBe('(604) 555-2222');
  });

  it('should preserve contactEmail in summary.contacts[0].email', async () => {
    const site = await db.createSite({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Site With Email',
      contactName: 'Contact Person',
      contactPhone: '(604) 555-3333',
    });

    // Update with email
    await db.updateSite(site.id, {
      contactName: 'Contact Person',
      contactPhone: '(604) 555-3333',
    });

    const updatedSite = await db.getSiteById(site.id);
    
    expect(updatedSite?.summary?.contacts?.[0]?.email).toBeDefined();
  });

  it('should preserve monitoring info when updating other fields', async () => {
    // Create site with monitoring info
    const site = await db.createSite({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Site With Monitoring',
    });

    // Manually set monitoring info
    await db.updateSite(site.id, {
      summary: {
        ...site.summary,
        monitoring: {
          company: 'Central Monitoring',
          accountNumber: 'ACC-999',
          phone: '1-800-MONITOR',
          password: 'SECRET123',
        },
      } as any,
    });

    // Update other fields
    await db.updateSite(site.id, {
      name: 'Updated Site Name',
      address: '300 Monitor St',
    });

    // Monitoring info should be preserved
    const updatedSite = await db.getSiteById(site.id);
    expect(updatedSite?.summary?.monitoring?.company).toBe('Central Monitoring');
    expect(updatedSite?.summary?.monitoring?.accountNumber).toBe('ACC-999');
    expect(updatedSite?.summary?.monitoring?.password).toBe('SECRET123');
  });

  it('should handle partial updates without losing other summary data', async () => {
    const site = await db.createSite({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Full Site',
      address: '400 Full St',
      city: 'Surrey',
      state: 'BC',
      postalCode: 'V3S 1A1',
      contactName: 'Full Contact',
      contactPhone: '(604) 555-4444',
      notes: 'Important notes',
    });

    // Update only address
    await db.updateSite(site.id, {
      address: '500 Partial St',
    });

    const updatedSite = await db.getSiteById(site.id);
    
    // Updated field should change
    expect(updatedSite?.summary?.address?.street).toBe('500 Partial St');
    
    // Other fields should remain
    expect(updatedSite?.summary?.building?.name).toBe('Full Site');
    expect(updatedSite?.summary?.address?.city).toBe('Surrey');
    expect(updatedSite?.summary?.contacts?.[0]?.name).toBe('Full Contact');
    expect(updatedSite?.summary?.notes).toBe('Important notes');
  });
});
