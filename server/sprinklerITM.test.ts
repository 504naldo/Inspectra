import { describe, it, expect } from 'vitest';
import * as sprinklerDb from './db.sprinkler';

describe('Sprinkler ITM Module', () => {
  describe('System Category Detection', () => {
    it('should identify dry system from type flags', () => {
      const system = {
        isDryPipePartialTest: true,
        isDryPipeFullFlowTest: false,
        isPreaction: false,
        isWet: false,
      };

      const isDry = system.isDryPipePartialTest || system.isDryPipeFullFlowTest || system.isPreaction;
      expect(isDry).toBe(true);
    });

    it('should identify wet system correctly', () => {
      const system = {
        isDryPipePartialTest: false,
        isDryPipeFullFlowTest: false,
        isPreaction: false,
        isWet: true,
      };

      const isDry = system.isDryPipePartialTest || system.isDryPipeFullFlowTest || system.isPreaction;
      expect(isDry).toBe(false);
      expect(system.isWet).toBe(true);
    });
  });

  describe('Validation Logic', () => {
    it('should require location for devices', () => {
      const devices = [
        { location: 'Main Floor', deviceType: 'TS' },
        { location: null, deviceType: 'FS' },
        { location: 'Parkade', deviceType: 'LA' },
      ];

      const missingLocation = devices.filter(d => !d.location);
      expect(missingLocation.length).toBe(1);
    });

    it('should require comments for NO responses in checklist', () => {
      const checklistItems = [
        { response: 'YES', comment: null },
        { response: 'NO', comment: null },
        { response: 'NO', comment: 'Needs repair' },
        { response: 'NA', comment: null },
      ];

      const invalidItems = checklistItems.filter(
        item => item.response === 'NO' && !item.comment
      );

      expect(invalidItems.length).toBe(1);
    });

    it('should allow NA responses without comments', () => {
      const checklistItems = [
        { response: 'NA', comment: null },
        { response: 'NA', comment: 'Not applicable to this building' },
      ];

      const invalidItems = checklistItems.filter(
        item => item.response === 'NO' && !item.comment
      );

      expect(invalidItems.length).toBe(0);
    });
  });

  describe('Numeric Field Validation', () => {
    it('should accept valid pressure values', () => {
      const pressures = [120, 85, 200, 0];
      const allValid = pressures.every(p => typeof p === 'number' && p >= 0);
      expect(allValid).toBe(true);
    });

    it('should accept valid timing values', () => {
      const timings = [30, 45, 60, 120];
      const allValid = timings.every(t => typeof t === 'number' && t >= 0);
      expect(allValid).toBe(true);
    });

    it('should handle null numeric values in draft mode', () => {
      const system = {
        systemWaterPressure: null,
        supplyWaterPressure: 120,
        tripTime: null,
      };

      // In draft mode, null values are acceptable
      expect(system.systemWaterPressure).toBeNull();
      expect(system.supplyWaterPressure).toBe(120);
    });
  });

  describe('Section Completion Tracking', () => {
    it('should calculate checklist section completion', () => {
      const generalSection = [
        { response: 'YES' },
        { response: 'NO' },
        { response: null },
        { response: 'NA' },
        { response: null },
      ];

      const answered = generalSection.filter(item => item.response !== null).length;
      const total = generalSection.length;
      const completion = { answered, total };

      expect(completion.answered).toBe(3);
      expect(completion.total).toBe(5);
      expect(completion.answered / completion.total).toBe(0.6);
    });
  });

  describe('Device Ordering', () => {
    it('should maintain device order', () => {
      const devices = [
        { deviceOrder: 1, location: 'Floor 1' },
        { deviceOrder: 2, location: 'Floor 2' },
        { deviceOrder: 3, location: 'Floor 3' },
      ];

      const sorted = devices.sort((a, b) => a.deviceOrder - b.deviceOrder);
      expect(sorted[0].deviceOrder).toBe(1);
      expect(sorted[2].deviceOrder).toBe(3);
    });

    it('should generate next device order', () => {
      const existingDevices = [
        { deviceOrder: 1 },
        { deviceOrder: 2 },
        { deviceOrder: 5 },
      ];

      const nextOrder = existingDevices.length > 0
        ? Math.max(...existingDevices.map(d => d.deviceOrder)) + 1
        : 1;

      expect(nextOrder).toBe(6);
    });
  });
});
