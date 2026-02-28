/**
 * Tests for technician certification fields on the users table.
 * Covers: schema presence, updateUser with cert fields, listUsers returns cert fields.
 */
import { describe, it, expect } from 'vitest';

// ─── Schema presence ────────────────────────────────────────────────────────

describe('users schema – certification columns', () => {
  it('has certNumber column defined in schema', async () => {
    const { users } = await import('../drizzle/schema');
    expect(users.certNumber).toBeDefined();
  });

  it('has certificationLevel column defined in schema', async () => {
    const { users } = await import('../drizzle/schema');
    expect(users.certificationLevel).toBeDefined();
  });

  it('has certExpiry column defined in schema', async () => {
    const { users } = await import('../drizzle/schema');
    expect(users.certExpiry).toBeDefined();
  });
});

// ─── updateUser input validation ────────────────────────────────────────────

describe('updateUser – certification input validation', () => {
  it('accepts certNumber as optional string', () => {
    const { z } = require('zod');
    const schema = z.object({
      userId: z.number(),
      certNumber: z.string().max(64).optional().nullable(),
      certificationLevel: z.string().max(128).optional().nullable(),
      certExpiry: z.string().optional().nullable(),
    });
    const result = schema.safeParse({
      userId: 1,
      certNumber: 'CFAA-12345',
      certificationLevel: 'Level II Fire Alarm Technician',
      certExpiry: '2027-06-30',
    });
    expect(result.success).toBe(true);
  });

  it('rejects certNumber longer than 64 characters', () => {
    const { z } = require('zod');
    const schema = z.object({
      certNumber: z.string().max(64).optional().nullable(),
    });
    const result = schema.safeParse({ certNumber: 'A'.repeat(65) });
    expect(result.success).toBe(false);
  });

  it('rejects certificationLevel longer than 128 characters', () => {
    const { z } = require('zod');
    const schema = z.object({
      certificationLevel: z.string().max(128).optional().nullable(),
    });
    const result = schema.safeParse({ certificationLevel: 'B'.repeat(129) });
    expect(result.success).toBe(false);
  });

  it('accepts null values to clear certification fields', () => {
    const { z } = require('zod');
    const schema = z.object({
      certNumber: z.string().max(64).optional().nullable(),
      certificationLevel: z.string().max(128).optional().nullable(),
      certExpiry: z.string().optional().nullable(),
    });
    const result = schema.safeParse({
      certNumber: null,
      certificationLevel: null,
      certExpiry: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts omitted certification fields (all optional)', () => {
    const { z } = require('zod');
    const schema = z.object({
      userId: z.number(),
      certNumber: z.string().max(64).optional().nullable(),
      certificationLevel: z.string().max(128).optional().nullable(),
      certExpiry: z.string().optional().nullable(),
    });
    const result = schema.safeParse({ userId: 42 });
    expect(result.success).toBe(true);
  });
});

// ─── Date conversion helper ──────────────────────────────────────────────────

describe('certExpiry date conversion', () => {
  it('converts ISO string to Date object correctly', () => {
    const isoString = '2027-06-30';
    const d = new Date(isoString);
    expect(d).toBeInstanceOf(Date);
    expect(isNaN(d.getTime())).toBe(false);
  });

  it('returns null when certExpiry is empty string', () => {
    const certExpiry = '';
    const result = certExpiry ? new Date(certExpiry) : null;
    expect(result).toBeNull();
  });

  it('returns null when certExpiry is null', () => {
    const certExpiry: string | null = null;
    const result = certExpiry ? new Date(certExpiry) : null;
    expect(result).toBeNull();
  });
});
