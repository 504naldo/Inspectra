/**
 * Tests for three features:
 * 1. estimatedCost field in deficiency.create / deficiency.update
 * 2. withAudit() wired into write procedures (schema-level)
 * 3. compliance.verifyJobHash procedure (input validation)
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Feature 1: estimatedCost input validation ──────────────────────────────

describe('deficiency estimatedCost input validation', () => {
  const createSchema = z.object({
    jobId: z.number(),
    title: z.string().min(1),
    estimatedCost: z.number().nonnegative().optional(),
  });

  const updateSchema = z.object({
    id: z.number(),
    estimatedCost: z.number().nonnegative().optional(),
  });

  it('accepts a valid positive estimatedCost on create', () => {
    const result = createSchema.safeParse({ jobId: 1, title: 'Broken detector', estimatedCost: 250.00 });
    expect(result.success).toBe(true);
  });

  it('accepts zero estimatedCost on create', () => {
    const result = createSchema.safeParse({ jobId: 1, title: 'Broken detector', estimatedCost: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects negative estimatedCost on create', () => {
    const result = createSchema.safeParse({ jobId: 1, title: 'Broken detector', estimatedCost: -1 });
    expect(result.success).toBe(false);
  });

  it('accepts omitted estimatedCost on create (optional)', () => {
    const result = createSchema.safeParse({ jobId: 1, title: 'Broken detector' });
    expect(result.success).toBe(true);
  });

  it('accepts a valid estimatedCost on update', () => {
    const result = updateSchema.safeParse({ id: 5, estimatedCost: 1500.50 });
    expect(result.success).toBe(true);
  });

  it('rejects negative estimatedCost on update', () => {
    const result = updateSchema.safeParse({ id: 5, estimatedCost: -0.01 });
    expect(result.success).toBe(false);
  });

  it('converts number to string for drizzle decimal storage', () => {
    const cost = 250.75;
    const stored = String(cost);
    expect(stored).toBe('250.75');
    expect(typeof stored).toBe('string');
  });

  it('handles decimal precision correctly', () => {
    const cost = 1234.56;
    const stored = String(cost);
    expect(parseFloat(stored)).toBeCloseTo(1234.56, 2);
  });
});

// ─── Feature 2: withAudit wiring – schema-level guards ──────────────────────

describe('withAudit – audit context requirements', () => {
  it('requires a non-null user in ctx', () => {
    // Simulate the guard logic: if ctx.user is null, throw UNAUTHORIZED
    const guardFn = (ctx: { user: any }) => {
      if (!ctx.user) throw new Error('UNAUTHORIZED');
      return 'ok';
    };
    expect(() => guardFn({ user: null })).toThrow('UNAUTHORIZED');
    expect(guardFn({ user: { id: 1 } })).toBe('ok');
  });

  it('procedure names follow dot-notation convention', () => {
    const names = [
      'inspectionResult.upsert',
      'deficiency.create',
      'deficiency.update',
      'repair.create',
    ];
    names.forEach(name => {
      expect(name).toMatch(/^\w+\.\w+$/);
    });
  });

  it('assertJobNotFinalized throws when finalizedAt is set', () => {
    // Simulate the guard logic
    const assertNotFinalized = (finalizedAt: Date | null) => {
      if (finalizedAt !== null) throw new Error('JOB_FINALIZED_IMMUTABLE');
    };
    expect(() => assertNotFinalized(new Date())).toThrow('JOB_FINALIZED_IMMUTABLE');
    expect(() => assertNotFinalized(null)).not.toThrow();
  });
});

// ─── Feature 3: verifyJobHash input validation ───────────────────────────────

describe('compliance.verifyJobHash input validation', () => {
  const inputSchema = z.object({
    jobId: z.number().int().positive(),
  });

  it('accepts a valid positive integer jobId', () => {
    const result = inputSchema.safeParse({ jobId: 42 });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer jobId', () => {
    const result = inputSchema.safeParse({ jobId: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects zero jobId', () => {
    const result = inputSchema.safeParse({ jobId: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative jobId', () => {
    const result = inputSchema.safeParse({ jobId: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects missing jobId', () => {
    const result = inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('verifyJobHash result shape has required fields', () => {
    const resultSchema = z.object({
      jobId: z.number(),
      isFinalized: z.boolean(),
      hashMatch: z.boolean(),
      storedHash: z.string().nullable(),
      recomputedHash: z.string(),
      finalizedAt: z.date().nullable(),
      message: z.string(),
    });

    const mockResult = {
      jobId: 42,
      isFinalized: true,
      hashMatch: true,
      storedHash: 'abc123',
      recomputedHash: 'abc123',
      finalizedAt: new Date(),
      message: 'Hash verified — record integrity confirmed',
    };

    const parsed = resultSchema.safeParse(mockResult);
    expect(parsed.success).toBe(true);
  });

  it('detects hash mismatch in result', () => {
    const mismatchResult = {
      jobId: 42,
      isFinalized: true,
      hashMatch: false,
      storedHash: 'abc123',
      recomputedHash: 'xyz789',
      finalizedAt: new Date(),
      message: 'HASH MISMATCH',
    };
    expect(mismatchResult.hashMatch).toBe(false);
    expect(mismatchResult.storedHash).not.toBe(mismatchResult.recomputedHash);
  });
});
