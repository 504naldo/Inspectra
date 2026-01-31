/**
 * Suite Number Normalization Tests
 * 
 * Tests for stripping leading # from suite numbers during import
 */

import { describe, it, expect } from 'vitest';
import { getImportSchema } from './importSchemas';

describe('Suite Number Normalization', () => {
  const schema = getImportSchema('smokeAlarms');

  it('should strip leading # from suite number', () => {
    const row = {
      suiteNumber: '#0816',
      powerType: 'battery',
    };
    
    const result = schema.validateRow(row);
    expect(result.valid).toBe(true);
    expect(row.suiteNumber).toBe('0816');
  });

  it('should handle suite number without #', () => {
    const row = {
      suiteNumber: '101',
      powerType: 'hardwired',
    };
    
    const result = schema.validateRow(row);
    expect(result.valid).toBe(true);
    expect(row.suiteNumber).toBe('101');
  });

  it('should handle numeric suite numbers', () => {
    const row = {
      suiteNumber: 631,
      powerType: 'sealed',
    };
    
    const result = schema.validateRow(row);
    expect(result.valid).toBe(true);
    expect(row.suiteNumber).toBe(631);
  });

  it('should strip # from string with spaces', () => {
    const row = {
      suiteNumber: '  #0816  ',
      powerType: 'unknown',
    };
    
    const result = schema.validateRow(row);
    expect(result.valid).toBe(true);
    expect(row.suiteNumber).toBe('0816');
  });

  it('should handle alphanumeric suite numbers', () => {
    const row = {
      suiteNumber: '#A-101',
      powerType: 'battery',
    };
    
    const result = schema.validateRow(row);
    expect(result.valid).toBe(true);
    expect(row.suiteNumber).toBe('A-101');
  });

  it('should reject empty suite number after stripping', () => {
    const row = {
      suiteNumber: '#',
      powerType: 'battery',
    };
    
    const result = schema.validateRow(row);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Suite number is required');
  });
});
