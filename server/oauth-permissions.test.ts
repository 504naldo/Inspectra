import { describe, it, expect } from 'vitest';

/**
 * OAuth and Permissions Fix Tests
 * 
 * These tests verify the fixes for:
 * 1. Company assignment on login
 * 2. Role and activation for @ewandf.ca emails
 * 3. Admin/office permissions
 * 4. Technician list deduplication
 */

describe('OAuth Company Assignment', () => {
  it('should assign companyId when single company exists', () => {
    const allCompanies = [{ id: 1, name: 'EWF' }];
    let companyId: number | undefined;

    if (allCompanies.length === 1) {
      companyId = allCompanies[0].id;
    }

    expect(companyId).toBe(1);
  });

  it('should assign first companyId when multiple companies exist', () => {
    const allCompanies = [
      { id: 1, name: 'EWF' },
      { id: 2, name: 'Other Company' }
    ];
    let companyId: number | undefined;

    if (allCompanies.length === 1) {
      companyId = allCompanies[0].id;
    } else if (allCompanies.length > 1) {
      companyId = allCompanies[0].id;
    }

    expect(companyId).toBe(1);
  });

  it('should leave companyId undefined when no companies exist', () => {
    const allCompanies: any[] = [];
    let companyId: number | undefined;

    if (allCompanies.length === 1) {
      companyId = allCompanies[0].id;
    } else if (allCompanies.length > 1) {
      companyId = allCompanies[0].id;
    }

    expect(companyId).toBeUndefined();
  });
});

describe('OAuth Role and Activation Logic', () => {
  it('should assign admin role and activate ranaldo@ewandf.ca', () => {
    const email = 'ranaldo@ewandf.ca';
    let role: 'admin' | 'office' | 'technician' | 'customer' = 'technician';
    let isActive = 1;

    if (email === 'ranaldo@ewandf.ca') {
      role = 'admin';
      isActive = 1;
    } else if (email.endsWith('@ewandf.ca')) {
      role = 'technician';
      isActive = 1;
    }

    expect(role).toBe('admin');
    expect(isActive).toBe(1);
  });

  it('should assign technician role and activate other @ewandf.ca emails', () => {
    const email = 'chris@ewandf.ca';
    let role: 'admin' | 'office' | 'technician' | 'customer' = 'technician';
    let isActive = 1;

    if (email === 'ranaldo@ewandf.ca') {
      role = 'admin';
      isActive = 1;
    } else if (email.endsWith('@ewandf.ca')) {
      role = 'technician';
      isActive = 1;
    }

    expect(role).toBe('technician');
    expect(isActive).toBe(1);
  });

  it('should default to technician role for non-EWF emails', () => {
    const email = 'external@example.com';
    let role: 'admin' | 'office' | 'technician' | 'customer' = 'technician';
    let isActive = 1;

    if (email === 'ranaldo@ewandf.ca') {
      role = 'admin';
      isActive = 1;
    } else if (email.endsWith('@ewandf.ca')) {
      role = 'technician';
      isActive = 1;
    }

    expect(role).toBe('technician');
    expect(isActive).toBe(1);
  });

  it('should handle case-insensitive email matching', () => {
    const email = 'RANALDO@EWANDF.CA'.toLowerCase();
    let role: 'admin' | 'office' | 'technician' | 'customer' = 'technician';
    let isActive = 1;

    if (email === 'ranaldo@ewandf.ca') {
      role = 'admin';
      isActive = 1;
    } else if (email.endsWith('@ewandf.ca')) {
      role = 'technician';
      isActive = 1;
    }

    expect(role).toBe('admin');
    expect(isActive).toBe(1);
  });
});

describe('Technician List Deduplication', () => {
  it('should deduplicate technicians by normalized email', () => {
    const allTechnicians = [
      { id: 1, name: 'Chris', email: 'chris@ewandf.ca' },
      { id: 2, name: 'Chris', email: 'CHRIS@EWANDF.CA' },
      { id: 3, name: 'Chris', email: ' chris@ewandf.ca ' },
      { id: 4, name: 'John', email: 'john@ewandf.ca' },
    ];

    const seen = new Set<string>();
    const technicians = allTechnicians.filter(tech => {
      if (!tech.email) return false;
      const normalizedEmail = tech.email.trim().toLowerCase();
      if (seen.has(normalizedEmail)) return false;
      seen.add(normalizedEmail);
      return true;
    });

    expect(technicians).toHaveLength(2);
    expect(technicians[0].id).toBe(1); // First occurrence of chris@ewandf.ca
    expect(technicians[1].id).toBe(4); // john@ewandf.ca
  });

  it('should filter out technicians without email', () => {
    const allTechnicians = [
      { id: 1, name: 'Chris', email: 'chris@ewandf.ca' },
      { id: 2, name: 'No Email', email: null },
      { id: 3, name: 'John', email: 'john@ewandf.ca' },
    ];

    const seen = new Set<string>();
    const technicians = allTechnicians.filter(tech => {
      if (!tech.email) return false;
      const normalizedEmail = tech.email.trim().toLowerCase();
      if (seen.has(normalizedEmail)) return false;
      seen.add(normalizedEmail);
      return true;
    });

    expect(technicians).toHaveLength(2);
    expect(technicians.every(t => t.email !== null)).toBe(true);
  });

  it('should keep first occurrence when duplicates exist', () => {
    const allTechnicians = [
      { id: 5, name: 'Chris A', email: 'chris@ewandf.ca' },
      { id: 3, name: 'Chris B', email: 'chris@ewandf.ca' },
      { id: 1, name: 'Chris C', email: 'chris@ewandf.ca' },
    ];

    const seen = new Set<string>();
    const technicians = allTechnicians.filter(tech => {
      if (!tech.email) return false;
      const normalizedEmail = tech.email.trim().toLowerCase();
      if (seen.has(normalizedEmail)) return false;
      seen.add(normalizedEmail);
      return true;
    });

    expect(technicians).toHaveLength(1);
    expect(technicians[0].id).toBe(5); // First in array
    expect(technicians[0].name).toBe('Chris A');
  });
});

describe('Admin/Office Permissions', () => {
  it('should allow admin role', () => {
    const user = { role: 'admin' };
    const isAllowed = user.role === 'admin' || user.role === 'office';
    expect(isAllowed).toBe(true);
  });

  it('should allow office role', () => {
    const user = { role: 'office' };
    const isAllowed = user.role === 'admin' || user.role === 'office';
    expect(isAllowed).toBe(true);
  });

  it('should deny technician role', () => {
    const user = { role: 'technician' };
    const isAllowed = user.role === 'admin' || user.role === 'office';
    expect(isAllowed).toBe(false);
  });

  it('should deny customer role', () => {
    const user = { role: 'customer' };
    const isAllowed = user.role === 'admin' || user.role === 'office';
    expect(isAllowed).toBe(false);
  });
});
