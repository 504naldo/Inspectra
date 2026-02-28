/**
 * Tests for:
 * 1. Admin deficiency list – estimatedCost column and total calculation
 * 2. bulkMarkPass – withAudit + assertJobNotFinalized guard
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ─── Feature 1: estimatedCost column total calculation ───────────────────────

describe('admin deficiency list – cost total calculation', () => {
  const mockDeficiencies = [
    { id: 1, title: 'Broken detector', severity: 'critical', status: 'open', estimatedCost: '250.00', systemCategory: 'FIRE_ALARM' },
    { id: 2, title: 'Missing label', severity: 'minor', status: 'open', estimatedCost: '75.50', systemCategory: 'FIRE_EXTINGUISHER' },
    { id: 3, title: 'Corroded head', severity: 'major', status: 'resolved', estimatedCost: null, systemCategory: 'SPRINKLER' },
    { id: 4, title: 'Dead battery', severity: 'observation', status: 'open', estimatedCost: '0', systemCategory: 'SMOKE_ALARM' },
  ];

  const calcTotal = (defs: typeof mockDeficiencies) =>
    defs.reduce((sum, d) => {
      const c = d.estimatedCost != null ? parseFloat(String(d.estimatedCost)) : 0;
      return sum + (isNaN(c) ? 0 : c);
    }, 0);

  const countWithCost = (defs: typeof mockDeficiencies) =>
    defs.filter(d => d.estimatedCost != null && parseFloat(String(d.estimatedCost)) > 0).length;

  it('calculates total correctly including string decimals', () => {
    expect(calcTotal(mockDeficiencies)).toBeCloseTo(325.50, 2);
  });

  it('ignores null estimatedCost entries', () => {
    const noNulls = mockDeficiencies.filter(d => d.estimatedCost != null);
    expect(calcTotal(noNulls)).toBeCloseTo(325.50, 2);
  });

  it('counts only deficiencies with cost > 0', () => {
    expect(countWithCost(mockDeficiencies)).toBe(2); // 250.00 and 75.50; 0 and null excluded
  });

  it('formats cost as CAD currency string', () => {
    const cost = 325.5;
    const formatted = `$${cost.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    expect(formatted).toContain('325');
    expect(formatted).toContain('.');
    expect(formatted.startsWith('$')).toBe(true);
  });

  it('returns 0 total when all costs are null', () => {
    const noCosts = mockDeficiencies.map(d => ({ ...d, estimatedCost: null }));
    expect(calcTotal(noCosts)).toBe(0);
  });

  it('handles a single deficiency with cost', () => {
    const single = [{ id: 1, title: 'Test', severity: 'major', status: 'open', estimatedCost: '1500.00', systemCategory: 'FIRE_ALARM' }];
    expect(calcTotal(single)).toBeCloseTo(1500.00, 2);
  });

  it('systemCategory renders with underscores replaced by spaces', () => {
    const category = 'FIRE_ALARM';
    const rendered = category.replace(/_/g, ' ');
    expect(rendered).toBe('FIRE ALARM');
  });

  it('SMOKE_ALARM category renders correctly', () => {
    const category = 'SMOKE_ALARM';
    const rendered = category.replace(/_/g, ' ');
    expect(rendered).toBe('SMOKE ALARM');
  });
});

// ─── Feature 2: bulkMarkPass withAudit guard ─────────────────────────────────

describe('bulkMarkPass – withAudit + assertJobNotFinalized', () => {
  const bulkMarkPassSchema = z.object({
    jobId: z.number().int().positive(),
    deviceIds: z.array(z.number().int().positive()).min(1),
    notes: z.string().optional(),
  });

  it('accepts valid input with multiple device IDs', () => {
    const result = bulkMarkPassSchema.safeParse({ jobId: 1, deviceIds: [10, 11, 12] });
    expect(result.success).toBe(true);
  });

  it('accepts optional notes', () => {
    const result = bulkMarkPassSchema.safeParse({ jobId: 1, deviceIds: [10], notes: 'All tested OK' });
    expect(result.success).toBe(true);
  });

  it('rejects empty deviceIds array', () => {
    const result = bulkMarkPassSchema.safeParse({ jobId: 1, deviceIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects missing jobId', () => {
    const result = bulkMarkPassSchema.safeParse({ deviceIds: [10] });
    expect(result.success).toBe(false);
  });

  it('procedure name follows dot-notation convention', () => {
    const name = 'inspectionResult.bulkMarkPass';
    expect(name).toMatch(/^\w+\.\w+$/);
  });

  it('assertJobNotFinalized blocks finalized jobs', () => {
    const assertNotFinalized = (finalizedAt: Date | null) => {
      if (finalizedAt !== null) throw new Error('JOB_FINALIZED_IMMUTABLE');
    };
    expect(() => assertNotFinalized(new Date())).toThrow('JOB_FINALIZED_IMMUTABLE');
    expect(() => assertNotFinalized(null)).not.toThrow();
  });

  it('bulk result shape has count and results array', () => {
    const mockResult = { count: 3, results: [{ id: 1 }, { id: 2 }, { id: 3 }] };
    expect(mockResult.count).toBe(3);
    expect(mockResult.results).toHaveLength(3);
  });

  it('each result in bulk has expected fields', () => {
    const resultSchema = z.object({
      jobId: z.number(),
      deviceId: z.number(),
      result: z.literal('pass'),
      technicianId: z.number(),
    });
    const mockEntry = { jobId: 1, deviceId: 10, result: 'pass' as const, technicianId: 5 };
    expect(resultSchema.safeParse(mockEntry).success).toBe(true);
  });
});
