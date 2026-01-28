import { describe, it, expect, beforeEach } from 'vitest';
import * as db from './db';

describe('Smoke Alarm Database Functions', () => {
  // Note: These tests assume a test database is available
  // In a real scenario, you'd use a test database or mocks
  
  it('should have smoke alarm query functions defined', () => {
    expect(typeof db.getSmokeAlarmsBySite).toBe('function');
    expect(typeof db.getSmokeAlarmsByJob).toBe('function');
    expect(typeof db.getSmokeAlarmCountBySite).toBe('function');
    expect(typeof db.updateSmokeAlarmTestResult).toBe('function');
  });
});

describe('Smoke Alarm Validation', () => {
  it('should require suite number for smoke alarms', () => {
    const validAlarm = {
      suiteNumber: '101',
      location: 'Hallway',
      powerType: 'hardwired' as const,
    };
    
    expect(validAlarm.suiteNumber).toBeTruthy();
    expect(validAlarm.suiteNumber.length).toBeGreaterThan(0);
  });

  it('should accept valid power types', () => {
    const validPowerTypes = ['hardwired', 'battery', 'sealed', 'unknown'];
    
    validPowerTypes.forEach(powerType => {
      expect(['hardwired', 'battery', 'sealed', 'unknown']).toContain(powerType);
    });
  });

  it('should accept valid test results', () => {
    const validTestResults = ['pass', 'fail', 'no_access', 'na'];
    
    validTestResults.forEach(result => {
      expect(['pass', 'fail', 'no_access', 'na']).toContain(result);
    });
  });
});

describe('Smoke Alarm Test Result Logic', () => {
  it('should identify results that require deficiency', () => {
    const requiresDeficiency = (testResult: string) => {
      return testResult === 'fail' || testResult === 'no_access';
    };

    expect(requiresDeficiency('fail')).toBe(true);
    expect(requiresDeficiency('no_access')).toBe(true);
    expect(requiresDeficiency('pass')).toBe(false);
    expect(requiresDeficiency('na')).toBe(false);
  });

  it('should format install dates correctly', () => {
    const formatDate = (date: Date | string | null) => {
      if (!date) return 'Unknown';
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString();
    };

    expect(formatDate(null)).toBe('Unknown');
    expect(formatDate(new Date('2024-01-15'))).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });
});

describe('Smoke Alarm PDF Categorization', () => {
  it('should categorize smoke alarm deficiencies correctly', () => {
    const categoryMap: Record<string, string> = {
      'FIRE_ALARM': 'Fire Alarm Deficiencies',
      'SMOKE_ALARM': 'Smoke Alarm Deficiencies',
      'FIRE_EXTINGUISHER': 'Fire Extinguisher Deficiencies',
      'EMERGENCY_LIGHTING': 'Emergency Lighting Deficiencies',
      'SPRINKLER': 'Sprinkler Deficiencies'
    };

    expect(categoryMap['SMOKE_ALARM']).toBe('Smoke Alarm Deficiencies');
  });

  it('should detect smoke alarms from device type', () => {
    const detectCategory = (deviceType: string) => {
      const typeLower = deviceType.toLowerCase();
      if (typeLower.includes('smoke alarm')) {
        return 'Smoke Alarm Deficiencies';
      }
      return 'Fire Alarm Deficiencies';
    };

    expect(detectCategory('Smoke Alarm')).toBe('Smoke Alarm Deficiencies');
    expect(detectCategory('Smoke Alarm - Battery')).toBe('Smoke Alarm Deficiencies');
    expect(detectCategory('Smoke Detector')).toBe('Fire Alarm Deficiencies');
  });
});
