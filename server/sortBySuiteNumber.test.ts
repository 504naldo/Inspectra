import { describe, it, expect } from 'vitest';
import { sortBySuiteNumberDescending } from '../shared/deviceHelpers';

describe('sortBySuiteNumberDescending', () => {
  it('should sort numeric suite numbers in descending order', () => {
    const devices = [
      { id: 1, suiteNumber: '101', deviceType: 'Smoke' },
      { id: 2, suiteNumber: '631', deviceType: 'Smoke' },
      { id: 3, suiteNumber: '205', deviceType: 'Smoke' },
    ];

    const sorted = sortBySuiteNumberDescending(devices);
    
    expect(sorted.map(d => d.suiteNumber)).toEqual(['631', '205', '101']);
  });

  it('should handle null suite numbers by placing them last', () => {
    const devices = [
      { id: 1, suiteNumber: '101', deviceType: 'Smoke' },
      { id: 2, suiteNumber: null, deviceType: 'Smoke' },
      { id: 3, suiteNumber: '631', deviceType: 'Smoke' },
    ];

    const sorted = sortBySuiteNumberDescending(devices);
    
    expect(sorted.map(d => d.id)).toEqual([3, 1, 2]);
  });

  it('should sort alphanumeric suite numbers correctly', () => {
    const devices = [
      { id: 1, suiteNumber: 'A101', deviceType: 'Smoke' },
      { id: 2, suiteNumber: 'B205', deviceType: 'Smoke' },
      { id: 3, suiteNumber: 'A205', deviceType: 'Smoke' },
    ];

    const sorted = sortBySuiteNumberDescending(devices);
    
    // B205 > A205 > A101 (string comparison descending)
    expect(sorted.map(d => d.suiteNumber)).toEqual(['B205', 'A205', 'A101']);
  });

  it('should handle mixed numeric and alphanumeric suite numbers', () => {
    const devices = [
      { id: 1, suiteNumber: '101', deviceType: 'Smoke' },
      { id: 2, suiteNumber: 'PH1', deviceType: 'Smoke' },
      { id: 3, suiteNumber: '631', deviceType: 'Smoke' },
      { id: 4, suiteNumber: 'PH2', deviceType: 'Smoke' },
    ];

    const sorted = sortBySuiteNumberDescending(devices);
    
    // Numeric: 631, 101; Alphanumeric: PH2, PH1
    // Since numeric parsing fails for PH*, they're compared as strings
    expect(sorted.map(d => d.suiteNumber)).toEqual(['PH2', 'PH1', '631', '101']);
  });

  it('should handle suite numbers with leading zeros', () => {
    const devices = [
      { id: 1, suiteNumber: '0101', deviceType: 'Smoke' },
      { id: 2, suiteNumber: '0631', deviceType: 'Smoke' },
      { id: 3, suiteNumber: '0205', deviceType: 'Smoke' },
    ];

    const sorted = sortBySuiteNumberDescending(devices);
    
    // parseInt handles leading zeros: 631 > 205 > 101
    expect(sorted.map(d => d.suiteNumber)).toEqual(['0631', '0205', '0101']);
  });

  it('should not mutate the original array', () => {
    const devices = [
      { id: 1, suiteNumber: '101', deviceType: 'Smoke' },
      { id: 2, suiteNumber: '631', deviceType: 'Smoke' },
    ];

    const original = [...devices];
    sortBySuiteNumberDescending(devices);
    
    expect(devices).toEqual(original);
  });

  it('should handle empty array', () => {
    const devices: any[] = [];
    const sorted = sortBySuiteNumberDescending(devices);
    expect(sorted).toEqual([]);
  });

  it('should handle single device', () => {
    const devices = [
      { id: 1, suiteNumber: '101', deviceType: 'Smoke' },
    ];

    const sorted = sortBySuiteNumberDescending(devices);
    expect(sorted).toEqual(devices);
  });
});
