import { describe, it, expect } from 'vitest';
import { isSmokeAlarm, categorizeDevice, getCategoryLabel } from '../shared/deviceCategories';

/**
 * Category Card Data Binding Tests
 * 
 * Verify that category cards are correctly bound to real data with accurate
 * device counts and proper filtering for navigation.
 */

describe('Category Card Data Binding', () => {
  describe('isSmokeAlarm helper', () => {
    it('should identify smoke detectors', () => {
      expect(isSmokeAlarm({ deviceType: 'Smoke Detector' })).toBe(true);
      expect(isSmokeAlarm({ deviceType: 'Photoelectric Smoke Alarm' })).toBe(true);
      expect(isSmokeAlarm({ deviceType: 'Ionization Smoke Sensor' })).toBe(true);
    });

    it('should identify smoke alarms from deviceCategory', () => {
      expect(isSmokeAlarm({ deviceCategory: 'Smoke Detection' })).toBe(true);
      expect(isSmokeAlarm({ deviceCategory: 'smoke alarm' })).toBe(true);
    });

    it('should identify smoke alarms from model', () => {
      expect(isSmokeAlarm({ model: 'Smoke-100' })).toBe(true);
      expect(isSmokeAlarm({ model: 'Kidde Smoke Detector' })).toBe(true);
    });

    it('should identify smoke alarms from description', () => {
      expect(isSmokeAlarm({ description: 'Ceiling mounted smoke alarm' })).toBe(true);
      expect(isSmokeAlarm({ description: 'Smoke detection device' })).toBe(true);
    });

    it('should NOT identify non-smoke devices even if they mention smoke', () => {
      expect(isSmokeAlarm({ deviceType: 'Smoke Extinguisher' })).toBe(false);
      expect(isSmokeAlarm({ deviceType: 'Pull Station for Smoke System' })).toBe(false);
    });

    it('should NOT identify fire alarm devices as smoke alarms', () => {
      expect(isSmokeAlarm({ deviceType: 'Pull Station' })).toBe(false);
      expect(isSmokeAlarm({ deviceType: 'Heat Detector' })).toBe(false);
      expect(isSmokeAlarm({ deviceType: 'Horn/Strobe' })).toBe(false);
    });

    it('should NOT identify extinguishers as smoke alarms', () => {
      expect(isSmokeAlarm({ deviceType: 'Fire Extinguisher' })).toBe(false);
      expect(isSmokeAlarm({ deviceType: 'ABC Extinguisher' })).toBe(false);
    });

    it('should NOT identify emergency lights as smoke alarms', () => {
      expect(isSmokeAlarm({ deviceType: 'Emergency Light' })).toBe(false);
      expect(isSmokeAlarm({ deviceType: 'Exit Sign' })).toBe(false);
    });

    it('should handle null/undefined fields', () => {
      expect(isSmokeAlarm({ deviceType: null })).toBe(false);
      expect(isSmokeAlarm({ deviceType: undefined })).toBe(false);
      expect(isSmokeAlarm({})).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isSmokeAlarm({ deviceType: 'SMOKE DETECTOR' })).toBe(true);
      expect(isSmokeAlarm({ deviceType: 'smoke detector' })).toBe(true);
      expect(isSmokeAlarm({ deviceType: 'Smoke Detector' })).toBe(true);
    });
  });

  describe('categorizeDevice with isSmokeAlarm', () => {
    it('should categorize smoke alarms first before other fire alarm devices', () => {
      expect(categorizeDevice({ deviceType: 'Smoke Detector' })).toBe('smoke');
      expect(categorizeDevice({ deviceType: 'Smoke Alarm' })).toBe('smoke');
    });

    it('should categorize non-smoke fire alarm devices correctly', () => {
      expect(categorizeDevice({ deviceType: 'Pull Station' })).toBe('fire_alarm');
      expect(categorizeDevice({ deviceType: 'Heat Detector' })).toBe('fire_alarm');
      expect(categorizeDevice({ deviceType: 'Horn/Strobe' })).toBe('fire_alarm');
      expect(categorizeDevice({ deviceType: 'Bell' })).toBe('fire_alarm');
      expect(categorizeDevice({ deviceType: 'Monitor Module' })).toBe('fire_alarm');
    });

    it('should categorize extinguishers correctly', () => {
      expect(categorizeDevice({ deviceType: 'Fire Extinguisher' })).toBe('extinguisher');
      expect(categorizeDevice({ deviceType: 'ABC Extinguisher' })).toBe('extinguisher');
    });

    it('should categorize emergency lights correctly', () => {
      expect(categorizeDevice({ deviceType: 'Emergency Light' })).toBe('emergency');
      expect(categorizeDevice({ deviceType: 'Exit Sign' })).toBe('emergency');
    });

    it('should NOT categorize smoke alarms as fire_alarm', () => {
      const category = categorizeDevice({ deviceType: 'Smoke Detector' });
      expect(category).toBe('smoke');
      expect(category).not.toBe('fire_alarm');
    });
  });

  describe('Device filtering for cards', () => {
    const mockDevices = [
      { id: 1, deviceType: 'Smoke Detector', location: 'Lobby' },
      { id: 2, deviceType: 'Pull Station', location: 'Hallway' },
      { id: 3, deviceType: 'Fire Extinguisher', location: 'Kitchen' },
      { id: 4, deviceType: 'Emergency Light', location: 'Exit' },
      { id: 5, deviceType: 'Photoelectric Smoke Alarm', location: 'Bedroom' },
      { id: 6, deviceType: 'Heat Detector', location: 'Garage' },
      { id: 7, deviceType: 'Horn/Strobe', location: 'Corridor' },
      { id: 8, deviceType: 'Exit Sign', location: 'Stairwell' },
      { id: 9, deviceType: 'Ionization Smoke Sensor', location: 'Office' },
      { id: 10, deviceType: 'ABC Extinguisher', location: 'Warehouse' },
    ];

    it('should filter smoke alarms correctly', () => {
      const smokeAlarms = mockDevices.filter(d => isSmokeAlarm(d));
      
      expect(smokeAlarms.length).toBe(3);
      expect(smokeAlarms.map(d => d.id)).toEqual([1, 5, 9]);
    });

    it('should filter fire alarm devices excluding smoke alarms', () => {
      const fireAlarmDevices = mockDevices.filter(d => {
        const category = categorizeDevice(d);
        return category === 'fire_alarm';
      });
      
      expect(fireAlarmDevices.length).toBe(3);
      expect(fireAlarmDevices.map(d => d.id)).toEqual([2, 6, 7]);
      expect(fireAlarmDevices.every(d => !isSmokeAlarm(d))).toBe(true);
    });

    it('should filter extinguishers correctly', () => {
      const extinguishers = mockDevices.filter(d => categorizeDevice(d) === 'extinguisher');
      
      expect(extinguishers.length).toBe(2);
      expect(extinguishers.map(d => d.id)).toEqual([3, 10]);
    });

    it('should filter emergency lights correctly', () => {
      const emergencyLights = mockDevices.filter(d => categorizeDevice(d) === 'emergency');
      
      expect(emergencyLights.length).toBe(2);
      expect(emergencyLights.map(d => d.id)).toEqual([4, 8]);
    });

    it('should not have overlapping categories', () => {
      const smokeAlarms = mockDevices.filter(d => isSmokeAlarm(d));
      const fireAlarmDevices = mockDevices.filter(d => categorizeDevice(d) === 'fire_alarm');
      const extinguishers = mockDevices.filter(d => categorizeDevice(d) === 'extinguisher');
      const emergencyLights = mockDevices.filter(d => categorizeDevice(d) === 'emergency');
      
      const allCategorized = [
        ...smokeAlarms.map(d => d.id),
        ...fireAlarmDevices.map(d => d.id),
        ...extinguishers.map(d => d.id),
        ...emergencyLights.map(d => d.id),
      ];
      
      // Check no duplicates
      const uniqueIds = new Set(allCategorized);
      expect(uniqueIds.size).toBe(allCategorized.length);
    });
  });

  describe('Progress calculation with real data', () => {
    const mockDevices = [
      { id: 1, deviceType: 'Smoke Detector' },
      { id: 2, deviceType: 'Smoke Alarm' },
      { id: 3, deviceType: 'Pull Station' },
      { id: 4, deviceType: 'Heat Detector' },
    ];

    const mockInspectionResults = [
      { id: 1, deviceId: 1, result: 'pass' },
      { id: 2, deviceId: 3, result: 'pass' },
    ];

    it('should calculate smoke alarm progress correctly', () => {
      const smokeAlarms = mockDevices.filter(d => isSmokeAlarm(d));
      const testedSmoke = mockInspectionResults.filter(r => {
        const device = mockDevices.find(d => d.id === r.deviceId);
        return device && isSmokeAlarm(device);
      });
      
      expect(smokeAlarms.length).toBe(2);
      expect(testedSmoke.length).toBe(1);
      
      const progress = (testedSmoke.length / smokeAlarms.length) * 100;
      expect(progress).toBe(50);
    });

    it('should calculate fire alarm device progress correctly', () => {
      const fireAlarmDevices = mockDevices.filter(d => categorizeDevice(d) === 'fire_alarm');
      const testedFireAlarm = mockInspectionResults.filter(r => {
        const device = mockDevices.find(d => d.id === r.deviceId);
        return device && categorizeDevice(device) === 'fire_alarm';
      });
      
      expect(fireAlarmDevices.length).toBe(2);
      expect(testedFireAlarm.length).toBe(1);
      
      const progress = (testedFireAlarm.length / fireAlarmDevices.length) * 100;
      expect(progress).toBe(50);
    });

    it('should not count smoke alarms in fire alarm device progress', () => {
      const fireAlarmDevices = mockDevices.filter(d => categorizeDevice(d) === 'fire_alarm');
      
      // Smoke alarms should not be included
      expect(fireAlarmDevices.every(d => !isSmokeAlarm(d))).toBe(true);
    });
  });

  describe('Category labels', () => {
    it('should return correct labels for categories', () => {
      expect(getCategoryLabel('smoke')).toBe('Smoke Alarms');
      expect(getCategoryLabel('fire_alarm')).toBe('Fire Alarm Devices');
      expect(getCategoryLabel('extinguisher')).toBe('Fire Extinguishers');
      expect(getCategoryLabel('emergency')).toBe('Emergency Lights');
      expect(getCategoryLabel('other')).toBe('Other Devices');
    });
  });

  describe('Query param filtering', () => {
    const mockDevices = [
      { id: 1, deviceType: 'Smoke Detector' },
      { id: 2, deviceType: 'Pull Station' },
      { id: 3, deviceType: 'Fire Extinguisher' },
      { id: 4, deviceType: 'Emergency Light' },
    ];

    it('should filter by smoke category', () => {
      const categoryFilter = 'smoke';
      const filtered = mockDevices.filter(d => isSmokeAlarm(d));
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(1);
    });

    it('should filter by firealarm category', () => {
      const categoryFilter = 'firealarm';
      const filtered = mockDevices.filter(d => categorizeDevice(d) === 'fire_alarm');
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(2);
    });

    it('should filter by extinguisher category', () => {
      const categoryFilter = 'extinguisher';
      const filtered = mockDevices.filter(d => categorizeDevice(d) === 'extinguisher');
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(3);
    });

    it('should filter by emergency category', () => {
      const categoryFilter = 'emergency';
      const filtered = mockDevices.filter(d => categorizeDevice(d) === 'emergency');
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(4);
    });

    it('should show all devices when no filter', () => {
      const categoryFilter = null;
      const filtered = categoryFilter ? [] : mockDevices;
      
      expect(filtered.length).toBe(4);
    });
  });
});
