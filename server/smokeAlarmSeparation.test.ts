import { describe, it, expect } from 'vitest';
import { calculateInspectionTotals, calculateSystemCoverage } from './pdfSummaryCalculator';
import { categorizeDevice, isSmokeAlarm } from '../shared/deviceCategories';

describe('Smoke Alarm Separation', () => {
  describe('categorizeDevice', () => {
    it('should categorize SMOKE_ALARM category as smoke, not fire_alarm', () => {
      const device = {
        deviceType: 'Smoke Alarm',
        category: 'SMOKE_ALARM',
        model: null,
        description: null,
      };
      
      expect(categorizeDevice(device)).toBe('smoke');
    });

    it('should categorize FIRE_ALARM category as fire_alarm', () => {
      const device = {
        deviceType: 'Heat Detector',
        category: 'FIRE_ALARM',
        model: null,
        description: null,
      };
      
      expect(categorizeDevice(device)).toBe('fire_alarm');
    });

    it('should detect smoke alarms by deviceType even without category', () => {
      const device = {
        deviceType: 'Smoke Alarm',
        category: null,
        model: null,
        description: null,
      };
      
      expect(categorizeDevice(device)).toBe('smoke');
    });

    it('should not categorize smoke detectors as smoke alarms', () => {
      const device = {
        deviceType: 'Smoke Detector',
        category: 'FIRE_ALARM',
        model: null,
        description: null,
      };
      
      // Smoke detectors are fire alarm system devices, not smoke alarms
      expect(categorizeDevice(device)).toBe('fire_alarm');
    });
  });

  describe('isSmokeAlarm', () => {
    it('should return true for smoke alarms', () => {
      expect(isSmokeAlarm({ deviceType: 'Smoke Alarm', category: null, model: null, description: null })).toBe(true);
    });

    it('should return false for smoke detectors (fire alarm system)', () => {
      expect(isSmokeAlarm({ deviceType: 'Smoke Detector', category: 'FIRE_ALARM', model: null, description: null })).toBe(false);
    });

    it('should return false for pull stations', () => {
      expect(isSmokeAlarm({ deviceType: 'Pull Station', category: null, model: null, description: null })).toBe(false);
    });
  });

  describe('calculateInspectionTotals', () => {
    it('should exclude smoke alarms from fire alarm device count', () => {
      const deviceSummaries = [
        { deviceType: 'Smoke Alarm', total: 50, passed: 45, failed: 5, na: 0 },
        { deviceType: 'Heat Detector', total: 20, passed: 18, failed: 2, na: 0 },
        { deviceType: 'Pull Station', total: 10, passed: 10, failed: 0, na: 0 },
      ];

      const totals = calculateInspectionTotals(deviceSummaries);

      expect(totals.smokeAlarms).toBe(50);
      expect(totals.fireAlarmDevices).toBe(30); // Only heat detectors + pull stations
    });

    it('should handle zero smoke alarms correctly', () => {
      const deviceSummaries = [
        { deviceType: 'Heat Detector', total: 20, passed: 18, failed: 2, na: 0 },
        { deviceType: 'Pull Station', total: 10, passed: 10, failed: 0, na: 0 },
      ];

      const totals = calculateInspectionTotals(deviceSummaries);

      expect(totals.smokeAlarms).toBe(0);
      expect(totals.fireAlarmDevices).toBe(30);
    });

    it('should handle only smoke alarms correctly', () => {
      const deviceSummaries = [
        { deviceType: 'Smoke Alarm', total: 100, passed: 95, failed: 5, na: 0 },
      ];

      const totals = calculateInspectionTotals(deviceSummaries);

      expect(totals.smokeAlarms).toBe(100);
      expect(totals.fireAlarmDevices).toBe(0);
    });
  });

  describe('calculateSystemCoverage', () => {
    it('should show fire alarm system without smoke alarms', () => {
      const deviceSummaries = [
        { deviceType: 'Heat Detector', total: 20, passed: 18, failed: 2, na: 0 },
      ];
      const inspectionResults = [];

      const coverage = calculateSystemCoverage(deviceSummaries, inspectionResults);

      expect(coverage.fireAlarmSystem).toBe(true);
      expect(coverage.smokeAlarms).toBe(false);
    });

    it('should show smoke alarms separately from fire alarm system', () => {
      const deviceSummaries = [
        { deviceType: 'Smoke Alarm', total: 50, passed: 45, failed: 5, na: 0 },
      ];
      const inspectionResults = [];

      const coverage = calculateSystemCoverage(deviceSummaries, inspectionResults);

      expect(coverage.fireAlarmSystem).toBe(false); // No system devices
      expect(coverage.smokeAlarms).toBe(true);
    });

    it('should show both when both exist', () => {
      const deviceSummaries = [
        { deviceType: 'Smoke Alarm', total: 50, passed: 45, failed: 5, na: 0 },
        { deviceType: 'Heat Detector', total: 20, passed: 18, failed: 2, na: 0 },
      ];
      const inspectionResults = [];

      const coverage = calculateSystemCoverage(deviceSummaries, inspectionResults);

      expect(coverage.fireAlarmSystem).toBe(true);
      expect(coverage.smokeAlarms).toBe(true);
    });
  });
});
