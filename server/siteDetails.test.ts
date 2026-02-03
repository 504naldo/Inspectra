import { describe, it, expect, beforeAll } from 'vitest';
import * as db from './db';
import type { SiteSummary } from '../drizzle/schema';

describe('Site Details Feature', () => {
  let testCompanyId: number;
  let testCustomerOrgId: number;
  let testSiteId: number;

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

  it('should create site with summary data from form', async () => {
    const summary: SiteSummary = {
      building: {
        name: 'Test Building',
      },
      address: {
        street: '123 Main St',
        city: 'Vancouver',
        state: 'BC',
        postalCode: 'V6B 1A1',
      },
      contacts: [{
        name: 'Jane Smith',
        phone: '(604) 555-1234',
        email: 'jane@example.com',
      }],
      notes: 'Test site notes',
    };

    const site = await db.createSite({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Test Building',
      address: '123 Main St',
      city: 'Vancouver',
      state: 'BC',
      postalCode: 'V6B 1A1',
      contactName: 'Jane Smith',
      contactPhone: '(604) 555-1234',
      summary,
    });

    testSiteId = site.id;

    expect(site.summary).toBeDefined();
    expect(site.summary?.building?.name).toBe('Test Building');
    expect(site.summary?.address?.street).toBe('123 Main St');
    expect(site.summary?.address?.city).toBe('Vancouver');
    expect(site.summary?.contacts?.[0]?.name).toBe('Jane Smith');
    expect(site.summary?.contacts?.[0]?.phone).toBe('(604) 555-1234');
    expect(site.summary?.notes).toBe('Test site notes');
  });

  it('should retrieve site with summary data', async () => {
    const site = await db.getSiteById(testSiteId);

    expect(site).toBeDefined();
    expect(site?.summary).toBeDefined();
    expect(site?.summary?.building?.name).toBe('Test Building');
    expect(site?.summary?.address?.city).toBe('Vancouver');
    expect(site?.summary?.contacts?.[0]?.name).toBe('Jane Smith');
  });

  it('should update site summary with monitoring information', async () => {
    const updatedSummary: SiteSummary = {
      ...{
        building: { name: 'Test Building' },
        address: {
          street: '123 Main St',
          city: 'Vancouver',
          state: 'BC',
          postalCode: 'V6B 1A1',
        },
        contacts: [{
          name: 'Jane Smith',
          phone: '(604) 555-1234',
          email: 'jane@example.com',
        }],
      },
      monitoring: {
        company: 'Central Station Monitoring',
        accountNumber: 'ACC-12345',
        phone: '1-800-555-ALARM',
        password: 'CODE123',
      },
    };

    await db.updateSite(testSiteId, {
      summary: updatedSummary,
    });

    const site = await db.getSiteById(testSiteId);

    expect(site?.summary?.monitoring?.company).toBe('Central Station Monitoring');
    expect(site?.summary?.monitoring?.accountNumber).toBe('ACC-12345');
    expect(site?.summary?.monitoring?.phone).toBe('1-800-555-ALARM');
    expect(site?.summary?.monitoring?.password).toBe('CODE123');
  });

  it('should handle site with minimal summary data', async () => {
    const minimalSummary: SiteSummary = {
      building: {
        name: 'Minimal Site',
      },
    };

    const site = await db.createSite({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'Minimal Site',
      summary: minimalSummary,
    });

    expect(site.summary).toBeDefined();
    expect(site.summary?.building?.name).toBe('Minimal Site');
    expect(site.summary?.address).toBeUndefined();
    expect(site.summary?.contacts).toBeUndefined();
  });

  it('should handle site with no summary data', async () => {
    const site = await db.createSite({
      companyId: testCompanyId,
      customerOrgId: testCustomerOrgId,
      name: 'No Summary Site',
    });

    expect(site.summary).toBeUndefined();
  });

  it('should update site summary with building details', async () => {
    const summaryWithBuilding: SiteSummary = {
      building: {
        name: 'Test Building',
        year: '2010',
        class: 'Class A',
        stories: '5',
      },
      address: {
        street: '123 Main St',
        city: 'Vancouver',
        state: 'BC',
        postalCode: 'V6B 1A1',
      },
    };

    await db.updateSite(testSiteId, {
      summary: summaryWithBuilding,
    });

    const site = await db.getSiteById(testSiteId);

    expect(site?.summary?.building?.year).toBe('2010');
    expect(site?.summary?.building?.class).toBe('Class A');
    expect(site?.summary?.building?.stories).toBe('5');
  });

  it('should handle multiple contacts in summary', async () => {
    const summaryWithMultipleContacts: SiteSummary = {
      building: { name: 'Test Building' },
      contacts: [
        {
          name: 'Primary Contact',
          role: 'Building Manager',
          phone: '(604) 555-1111',
          email: 'primary@example.com',
        },
        {
          name: 'Secondary Contact',
          role: 'Maintenance',
          phone: '(604) 555-2222',
          email: 'secondary@example.com',
        },
      ],
    };

    await db.updateSite(testSiteId, {
      summary: summaryWithMultipleContacts,
    });

    const site = await db.getSiteById(testSiteId);

    expect(site?.summary?.contacts).toHaveLength(2);
    expect(site?.summary?.contacts?.[0]?.name).toBe('Primary Contact');
    expect(site?.summary?.contacts?.[0]?.role).toBe('Building Manager');
    expect(site?.summary?.contacts?.[1]?.name).toBe('Secondary Contact');
    expect(site?.summary?.contacts?.[1]?.role).toBe('Maintenance');
  });
});
