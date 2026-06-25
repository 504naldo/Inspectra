import { describe, it, expect } from 'vitest';
import { normalizeHeader, autoMapColumns, getMappingStats, MAPPING_RULES } from './autoMapper';
import { scoreSheet, suggestSheet } from './sheetSuggestion';
import { getImportSchema, shouldSkipRow } from './importSchemas';

describe('Auto-Mapping', () => {
  it('should normalize headers correctly', () => {
    expect(normalizeHeader('Device Type')).toBe('device type');
    expect(normalizeHeader('Serial #')).toBe('serial');
    expect(normalizeHeader('  Manufacturer  ')).toBe('manufacturer');
    expect(normalizeHeader('Model-Number')).toBe('model number');
  });

  it('should auto-map fire alarm device columns', () => {
    const headers = ['Device Type', 'Location', 'Manufacturer', 'Model', 'Serial Number', 'Notes'];
    const mapping = autoMapColumns(headers, 'fireAlarmDevices');
    
    expect(mapping.deviceType).toBe('Device Type');
    expect(mapping.location).toBe('Location');
    expect(mapping.manufacturer).toBe('Manufacturer');
    expect(mapping.model).toBe('Model');
    expect(mapping.serialNumber).toBe('Serial Number');
    expect(mapping.notes).toBe('Notes');
  });

  it('should handle fuzzy matching with synonyms', () => {
    const headers = ['Type', 'Room', 'Mfr', 'S/N', 'Tag'];
    const mapping = autoMapColumns(headers, 'fireAlarmDevices');
    
    expect(mapping.deviceType).toBe('Type');
    expect(mapping.location).toBe('Room');
    expect(mapping.manufacturer).toBe('Mfr');
    expect(mapping.serialNumber).toBe('S/N');
    expect(mapping.barcode).toBe('Tag');
  });

  it('should calculate mapping stats correctly', () => {
    const mapping = {
      deviceType: 'Type',
      location: 'Room',
      manufacturer: 'Mfr',
    };
    const stats = getMappingStats(mapping, 'fireAlarmDevices');
    
    expect(stats.mapped).toBe(3);
    expect(stats.total).toBe(MAPPING_RULES.fireAlarmDevices.length);
  });

  it('should map fire extinguisher columns', () => {
    const headers = ['Type', 'Location', 'Floor', 'Serial Number', 'Qty'];
    const mapping = autoMapColumns(headers, 'fireExtinguishers');
    
    expect(mapping.deviceType).toBe('Type');
    expect(mapping.location).toBe('Location');
    expect(mapping.floor).toBe('Floor');
    expect(mapping.serialNumber).toBe('Serial Number');
    expect(mapping.quantity).toBe('Qty');
  });
});

describe('Sheet Suggestion', () => {
  it('should score sheets based on header match', () => {
    const headers = ['Device Type', 'Location', 'Manufacturer', 'Model', 'Serial Number'];
    const score = scoreSheet('Individual Devices', headers, 'fireAlarmDevices');
    
    expect(score.score).toBeGreaterThan(0);
    expect(score.matchedFields.length).toBeGreaterThan(0);
  });

  it('should give bonus points for relevant sheet names', () => {
    const headers = ['Device Type', 'Location'];
    const score1 = scoreSheet('Individual Device Record', headers, 'fireAlarmDevices');
    const score2 = scoreSheet('Sheet1', headers, 'fireAlarmDevices');
    
    expect(score1.score).toBeGreaterThan(score2.score);
  });

  it('should penalize pricing/labour sheets', () => {
    const headers = ['Item', 'Rate', 'Price'];
    const score1 = scoreSheet('Labour Rates', headers, 'fireAlarmDevices');
    const score2 = scoreSheet('Devices', headers, 'fireAlarmDevices');
    
    expect(score1.score).toBeLessThan(score2.score);
  });
});

describe('Import Schemas', () => {
  it('should validate fire alarm device rows', () => {
    const schema = getImportSchema('fireAlarmDevices');
    
    // Valid with deviceType
    const valid1 = schema.validateRow({ deviceType: 'Smoke Detector', location: 'Room 101' });
    expect(valid1.valid).toBe(true);
    
    // Valid with model + manufacturer
    const valid2 = schema.validateRow({ model: 'SD-100', manufacturer: 'Acme', location: 'Room 101' });
    expect(valid2.valid).toBe(true);
    
    // Invalid - missing both
    const invalid = schema.validateRow({ location: 'Room 101' });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it('should validate fire extinguisher rows', () => {
    const schema = getImportSchema('fireExtinguishers');
    
    // Valid
    const valid = schema.validateRow({ deviceType: 'ABC', location: 'Hallway' });
    expect(valid.valid).toBe(true);
    
    // Invalid - missing deviceType
    const invalid = schema.validateRow({ location: 'Hallway' });
    expect(invalid.valid).toBe(false);
  });

  it('should validate site rows', () => {
    const schema = getImportSchema('site');
    
    // Valid
    const valid = schema.validateRow({ siteName: 'Building A', address: '123 Main St' });
    expect(valid.valid).toBe(true);
    
    // Invalid - missing siteName
    const invalid = schema.validateRow({ address: '123 Main St' });
    expect(invalid.valid).toBe(false);
  });

  it('should skip heading rows', () => {
    const headers = ['Device Type', 'Location', 'Model'];
    
    // Empty row
    expect(shouldSkipRow(['', '', ''], headers)).toBe(true);
    
    // Heading row
    expect(shouldSkipRow(['SECTION A', '', ''], headers)).toBe(true);
    
    // Pricing row
    expect(shouldSkipRow(['Labour Rate', '50', ''], headers)).toBe(true);
    
    // Valid data row
    expect(shouldSkipRow(['Smoke Detector', 'Room 101', 'SD-100'], headers)).toBe(false);
  });

  it('should assign correct categories', () => {
    expect(getImportSchema('fireAlarmDevices').category).toBe('FIRE_ALARM_DEVICE');
    expect(getImportSchema('fireExtinguishers').category).toBe('FIRE_EXTINGUISHER');
    expect(getImportSchema('emergencyLights').category).toBe('EMERGENCY_LIGHT');
    // Domain rule (importSchemas.ts): sprinkler devices are stored under FIRE_ALARM_DEVICE.
    expect(getImportSchema('sprinklerDevices').category).toBe('FIRE_ALARM_DEVICE');
  });
});
