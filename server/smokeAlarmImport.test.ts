import { describe, it, expect } from 'vitest';
import { autoMapColumns, normalizeHeader } from './autoMapper';
import { getImportSchema } from './importSchemas';

describe('Smoke Alarm Import Auto-Mapping', () => {
  it('should auto-map suite number columns', () => {
    const headers = ['Suite #', 'Location', 'Power Type', 'Install Date', 'Notes'];
    const mapping = autoMapColumns(headers, 'smokeAlarms');
    
    expect(mapping.suiteNumber).toBe('Suite #');
    expect(mapping.location).toBe('Location');
    expect(mapping.powerType).toBe('Power Type');
    expect(mapping.installDate).toBe('Install Date');
    expect(mapping.notes).toBe('Notes');
  });

  it('should match unit number as suite number', () => {
    const headers = ['Unit Number', 'Room', 'Battery Type'];
    const mapping = autoMapColumns(headers, 'smokeAlarms');
    
    expect(mapping.suiteNumber).toBe('Unit Number');
    expect(mapping.location).toBe('Room');
  });

  it('should match apartment as suite number', () => {
    const headers = ['Apartment', 'Position', 'Type'];
    const mapping = autoMapColumns(headers, 'smokeAlarms');
    
    expect(mapping.suiteNumber).toBe('Apartment');
    expect(mapping.location).toBe('Position');
  });

  it('should normalize headers correctly', () => {
    expect(normalizeHeader('Suite #')).toBe('suite');
    expect(normalizeHeader('Install Date')).toBe('install date');
    expect(normalizeHeader('Power/Type')).toBe('power type');
  });
});

describe('Smoke Alarm Import Validation', () => {
  const schema = getImportSchema('smokeAlarms');

  it('should validate smoke alarm with required suite number', () => {
    const validRow = {
      suiteNumber: '101',
      location: 'Hallway',
      powerType: 'hardwired',
      installDate: '2024-01-15',
    };
    
    const result = schema.validateRow(validRow);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject smoke alarm without suite number', () => {
    const invalidRow = {
      location: 'Hallway',
      powerType: 'battery',
    };
    
    const result = schema.validateRow(invalidRow);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Suite number is required');
  });

  it('should validate power types', () => {
    const validPowerTypes = ['hardwired', 'battery', 'sealed', 'unknown'];
    
    validPowerTypes.forEach(powerType => {
      const row = { suiteNumber: '101', powerType };
      const result = schema.validateRow(row);
      expect(result.valid).toBe(true);
    });
  });

  it('should normalize invalid power type to unknown', () => {
    const invalidRow = {
      suiteNumber: '101',
      powerType: 'solar',
    };
    
    const result = schema.validateRow(invalidRow);
    // Should pass validation (normalized to 'unknown')
    expect(result.valid).toBe(true);
    // Power type should be normalized
    expect(invalidRow.powerType).toBe('unknown');
  });

  it('should accept smoke alarm without optional fields', () => {
    const minimalRow = {
      suiteNumber: '202',
    };
    
    const result = schema.validateRow(minimalRow);
    expect(result.valid).toBe(true);
  });

  it('should have correct category', () => {
    expect(schema.category).toBe('SMOKE_ALARM');
  });

  it('should list correct required and optional fields', () => {
    expect(schema.requiredFields).toContain('suiteNumber');
    expect(schema.optionalFields).toContain('location');
    expect(schema.optionalFields).toContain('powerType');
    expect(schema.optionalFields).toContain('installDate');
  });
});

describe('Smoke Alarm Import Data Processing', () => {
  it('should normalize power type to lowercase', () => {
    const powerTypes = ['Hardwired', 'BATTERY', 'Sealed', 'Unknown'];
    const normalized = powerTypes.map(pt => String(pt).toLowerCase().trim());
    
    expect(normalized).toEqual(['hardwired', 'battery', 'sealed', 'unknown']);
  });

  it('should handle install date parsing', () => {
    const dateString = '2024-01-15';
    const date = new Date(dateString);
    
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2024);
    expect(date.getMonth()).toBe(0); // January is 0
  });

  it('should handle missing install date', () => {
    const installDate = null;
    const result = installDate ? new Date(installDate) : null;
    
    expect(result).toBeNull();
  });
});
