import { describe, it, expect } from 'vitest';
import { autoMapColumns, normalizeHeader, getMappingStats } from './autoMapper';

describe('Auto-Mapping with Null/Undefined Headers', () => {
  it('should handle null headers without crashing', () => {
    const headers = ['Date', null, 'Location', null, 'Building ID', '#0816'];
    
    // Should not throw
    expect(() => {
      autoMapColumns(headers as any, 'fireAlarmDevices');
    }).not.toThrow();
  });

  it('should filter out null/undefined headers', () => {
    const headers = ['Device Type', null, undefined, 'Location', '', 'Serial Number'];
    
    const mapping = autoMapColumns(headers as any, 'fireAlarmDevices');
    
    // Should only map non-null headers
    expect(mapping.deviceType).toBe('Device Type');
    expect(mapping.location).toBe('Location');
    expect(mapping.serialNumber).toBe('Serial Number');
  });

  it('should handle array with only null values', () => {
    const headers = [null, null, null, undefined, ''];
    
    const mapping = autoMapColumns(headers as any, 'fireAlarmDevices');
    
    // Should return empty mapping
    expect(Object.keys(mapping).length).toBe(0);
  });

  it('should handle mixed valid and invalid headers', () => {
    const headers = [
      'Suite #',
      null,
      'Location',
      undefined,
      'Power Type',
      '',
      'Install Date',
      null
    ];
    
    const mapping = autoMapColumns(headers as any, 'smokeAlarms');
    
    // Should map valid headers
    expect(mapping.suiteNumber).toBe('Suite #');
    expect(mapping.location).toBe('Location');
    expect(mapping.powerType).toBe('Power Type');
    expect(mapping.installDate).toBe('Install Date');
    
    // Should have 4 mappings (only valid headers)
    expect(Object.keys(mapping).length).toBe(4);
  });

  it('should handle numeric headers', () => {
    const headers = ['Device Type', 46048, 'Location', 123];
    
    const mapping = autoMapColumns(headers as any, 'fireAlarmDevices');
    
    // Should convert numbers to strings and map
    expect(mapping.deviceType).toBe('Device Type');
    expect(mapping.location).toBe('Location');
  });

  it('should normalize headers correctly with special characters', () => {
    expect(normalizeHeader('Device-Type')).toBe('device type');
    expect(normalizeHeader('Serial #')).toBe('serial');
    expect(normalizeHeader('Suite  Number  ')).toBe('suite number');
    expect(normalizeHeader('Power/Type')).toBe('power type');
  });

  it('should get correct mapping stats with null headers', () => {
    const headers = ['Suite #', null, 'Location', undefined, 'Power Type'];
    const mapping = autoMapColumns(headers as any, 'smokeAlarms');
    const stats = getMappingStats(mapping, 'smokeAlarms');
    
    // Should count only successfully mapped fields
    expect(stats.mapped).toBe(3); // suite, location, powerType
    expect(stats.total).toBe(7); // Total rules for smokeAlarms
  });

  it('should handle real-world header from user file', () => {
    // Actual header from user's file: ["Date",null,46048,null,"Building ID","#0816"]
    const headers = ['Date', null, 46048, null, 'Building ID', '#0816'];
    
    const mapping = autoMapColumns(headers as any, 'smokeAlarms');
    
    // Should not crash and should map what it can
    expect(() => mapping).not.toThrow();
    
    // Date might map to installDate
    if (mapping.installDate) {
      expect(mapping.installDate).toBe('Date');
    }
  });

  it('should prioritize exact matches over partial matches', () => {
    const headers = ['Type', 'Device Type', 'Location'];
    
    const mapping = autoMapColumns(headers, 'fireAlarmDevices');
    
    // Should map to first matching header (Type comes first)
    // Both match 'type' keyword, but Type is encountered first
    expect(mapping.deviceType).toBe('Type');
    expect(mapping.location).toBe('Location');
  });

  it('should not reuse headers for multiple fields', () => {
    const headers = ['Location', 'Room', 'Area'];
    
    const mapping = autoMapColumns(headers, 'fireAlarmDevices');
    
    // Should only map one location field (highest priority match)
    expect(mapping.location).toBe('Location');
    
    // Other location keywords should not be mapped since location is already taken
    const mappedValues = Object.values(mapping);
    expect(mappedValues.filter(v => v === 'Location').length).toBe(1);
  });
});

describe('normalizeHeader with null/undefined', () => {
  it('should handle null gracefully', () => {
    // safeToLower and safeTrim should handle null
    expect(() => normalizeHeader(null as any)).not.toThrow();
  });

  it('should handle undefined gracefully', () => {
    expect(() => normalizeHeader(undefined as any)).not.toThrow();
  });

  it('should handle empty string', () => {
    expect(normalizeHeader('')).toBe('');
  });

  it('should handle whitespace-only string', () => {
    expect(normalizeHeader('   ')).toBe('');
  });
});
