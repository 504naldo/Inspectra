import { describe, it, expect } from 'vitest';
import { detectHeaderRow } from './headerDetection';
import { autoMapColumns } from './autoMapper';

describe('Smoke Alarm Import with Header Detection', () => {
  it('should detect header row at index 11 for smoke alarm sheet', () => {
    // Simulate the actual structure from user's file
    const rows = [
      ['Date', 46048, null, null, null, null, 'BUILDING ID:', '#0816', null, null],
      ['BUILDING LIFE SAFETY SYSTEMS - SMOKE ALARM INSPECTION & TESTING (CAN/ULC-S552)', null, null, null, null, null, null, null, null, null],
      ['(SA-P) Smoke alarm ionization', null, null, null, '(SA/HD-I) Smoke alarm / Heat ionization', null, null, null, '(9L) 9 Volt lithium battery ', null],
      // ... more legend rows ...
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      // Row 11: Header row
      ['Suite Number / Location', 'Type', 'Power Source', 'Battery Type', 'Battery Replaced (Y/N)', 'Number of Batts', 'Cleaned & Tested (Y/N)', 'In Service Date', 'Maintenance Required (YES/NO/REPAIRED)', 'Remarks'],
      // Row 12: Building label
      ['BUILDING A', null, null, null, null, null, null, null, null, null],
      // Row 13+: Data rows
      [631, 'SA/CO-I', null, null, null, null, null, null, null, null],
      [631, 'SA-P', null, null, null, null, null, null, null, null],
      [630, 'SA/CO-I', null, null, null, null, null, null, null, null],
    ];
    
    const result = detectHeaderRow(rows, 'smokeAlarms', 30);
    
    // Should detect row 11 as header
    expect(result.headerRowIndex).toBe(11);
    expect(result.dataStartIndex).toBe(12);
    expect(result.headers).toContain('Suite Number / Location');
    expect(result.headers).toContain('Type');
    expect(result.headers).toContain('Power Source');
  });

  it('should auto-map Suite Number column correctly', () => {
    const headers = [
      'Suite Number / Location',
      'Type',
      'Power Source',
      'Battery Type',
      'Battery Replaced (Y/N)',
      'Number of Batts',
      'Cleaned & Tested (Y/N)',
      'In Service Date',
      'Maintenance Required (YES/NO/REPAIRED)',
      'Remarks'
    ];
    
    const mapping = autoMapColumns(headers, 'smokeAlarms');
    
    // Should map Suite Number
    expect(mapping.suiteNumber).toBe('Suite Number / Location');
    
    // Should map other fields
    // Type now maps to model (for device codes like SA/CO-1, SA-P)
    expect(mapping.model).toBe('Type');
    // Power Source maps to powerType
    expect(mapping.powerType).toBe('Power Source');
    expect(mapping.installDate).toBe('In Service Date');
    
    // Location is part of "Suite Number / Location" which is used for suiteNumber
  });

  it('should handle header with just "Suite #"', () => {
    const headers = ['Suite #', 'Location', 'Power Type', 'Install Date'];
    
    const mapping = autoMapColumns(headers, 'smokeAlarms');
    
    expect(mapping.suiteNumber).toBe('Suite #');
    expect(mapping.location).toBe('Location');
    // Power Type should map to powerType
    expect(mapping.powerType).toBe('Power Type');
    expect(mapping.installDate).toBe('Install Date');
  });

  it('should handle header with "Unit Number"', () => {
    const headers = ['Unit Number', 'Room', 'Battery', 'Installed'];
    
    const mapping = autoMapColumns(headers, 'smokeAlarms');
    
    expect(mapping.suiteNumber).toBe('Unit Number');
    expect(mapping.location).toBe('Room');
    expect(mapping.powerType).toBe('Battery');
    expect(mapping.installDate).toBe('Installed');
  });

  it('should handle header with "Apartment"', () => {
    const headers = ['Apt #', 'Area', 'Power Source', 'Date Installed'];
    
    const mapping = autoMapColumns(headers, 'smokeAlarms');
    
    expect(mapping.suiteNumber).toBe('Apt #');
    expect(mapping.location).toBe('Area');
    expect(mapping.powerType).toBe('Power Source');
    expect(mapping.installDate).toBe('Date Installed');
  });

  it('should detect header row with at least 2 keyword matches', () => {
    const rows = [
      ['Some', 'Random', 'Data'],
      ['More', 'Random', 'Stuff'],
      ['Suite', 'Location', 'Other'], // This should be detected (2 keywords)
      [101, 'Bedroom', 'Value'],
      [102, 'Kitchen', 'Value'],
    ];
    
    const result = detectHeaderRow(rows, 'smokeAlarms', 10);
    
    expect(result.headerRowIndex).toBe(2);
    expect(result.dataStartIndex).toBe(3);
  });

  it('should prefer row with more keyword matches', () => {
    const rows = [
      ['Suite', 'Location'], // 2 matches
      ['Suite', 'Location', 'Install', 'Power'], // 4 matches - should win
      ['Suite', 'Other', 'Data'], // 1 match
    ];
    
    const result = detectHeaderRow(rows, 'smokeAlarms', 10);
    
    expect(result.headerRowIndex).toBe(1); // Second row has most matches
  });

  it('should default to row 0 if no keywords found', () => {
    const rows = [
      ['Column A', 'Column B', 'Column C'],
      ['Data 1', 'Data 2', 'Data 3'],
    ];
    
    const result = detectHeaderRow(rows, 'smokeAlarms', 10);
    
    expect(result.headerRowIndex).toBe(0);
    expect(result.dataStartIndex).toBe(1);
  });

  it('should normalize headers before keyword matching', () => {
    const rows = [
      ['Random', 'Data'],
      ['Suite-Number', 'Location/Area', 'Install  Date'], // With punctuation and extra spaces
      ['101', 'Bedroom', '2024-01-01'],
    ];
    
    const result = detectHeaderRow(rows, 'smokeAlarms', 10);
    
    // Should detect row 1 despite punctuation/spacing
    expect(result.headerRowIndex).toBe(1);
    expect(result.headers).toEqual(['Suite-Number', 'Location/Area', 'Install  Date']);
  });
});
