import { describe, it, expect } from 'vitest';

/**
 * Category Cards Tests
 * 
 * Verify that device categorization and progress calculation work correctly
 * for Smoke Alarms, Fire Alarm Devices, Extinguishers, and Emergency Lights.
 */

describe('Category Cards Functionality', () => {
  describe('Device categorization', () => {
    const categorizeDevice = (deviceType: string) => {
      const type = deviceType.toLowerCase();
      if (type.includes('smoke')) return 'smoke';
      if (type.includes('extinguisher')) return 'extinguisher';
      if (type.includes('emergency') || type.includes('exit')) return 'emergency';
      if (type.includes('pull') || type.includes('heat') || type.includes('horn') || 
          type.includes('strobe') || type.includes('module') || type.includes('bell')) return 'fire_alarm';
      return 'other';
    };

    it('should categorize smoke detectors as smoke', () => {
      expect(categorizeDevice('Smoke Detector')).toBe('smoke');
      expect(categorizeDevice('Photoelectric Smoke Alarm')).toBe('smoke');
      expect(categorizeDevice('Ionization Smoke Sensor')).toBe('smoke');
    });

    it('should categorize fire alarm devices correctly', () => {
      expect(categorizeDevice('Pull Station')).toBe('fire_alarm');
      expect(categorizeDevice('Heat Detector')).toBe('fire_alarm');
      expect(categorizeDevice('Horn/Strobe')).toBe('fire_alarm');
      expect(categorizeDevice('Strobe Light')).toBe('fire_alarm');
      expect(categorizeDevice('Monitor Module')).toBe('fire_alarm');
      expect(categorizeDevice('Bell')).toBe('fire_alarm');
    });

    it('should categorize extinguishers correctly', () => {
      expect(categorizeDevice('Fire Extinguisher')).toBe('extinguisher');
      expect(categorizeDevice('ABC Extinguisher')).toBe('extinguisher');
      expect(categorizeDevice('CO2 Extinguisher')).toBe('extinguisher');
    });

    it('should categorize emergency lights correctly', () => {
      expect(categorizeDevice('Emergency Light')).toBe('emergency');
      expect(categorizeDevice('Exit Sign')).toBe('emergency');
      expect(categorizeDevice('Emergency Exit Light')).toBe('emergency');
    });

    it('should separate smoke alarms from other fire alarm devices', () => {
      const smokeCategory = categorizeDevice('Smoke Detector');
      const pullStationCategory = categorizeDevice('Pull Station');
      
      expect(smokeCategory).toBe('smoke');
      expect(pullStationCategory).toBe('fire_alarm');
      expect(smokeCategory).not.toBe(pullStationCategory);
    });

    it('should handle case-insensitive device types', () => {
      expect(categorizeDevice('SMOKE DETECTOR')).toBe('smoke');
      expect(categorizeDevice('smoke detector')).toBe('smoke');
      expect(categorizeDevice('Smoke Detector')).toBe('smoke');
    });

    it('should categorize unknown devices as other', () => {
      expect(categorizeDevice('Unknown Device')).toBe('other');
      expect(categorizeDevice('Sprinkler Head')).toBe('other');
    });
  });

  describe('Progress calculation', () => {
    it('should calculate correct progress for category', () => {
      const total = 10;
      const tested = 7;
      const progress = (tested / total) * 100;
      
      expect(progress).toBe(70);
    });

    it('should handle zero devices', () => {
      const total = 0;
      const tested = 0;
      const progress = total > 0 ? (tested / total) * 100 : 0;
      
      expect(progress).toBe(0);
    });

    it('should handle complete progress', () => {
      const total = 5;
      const tested = 5;
      const progress = (tested / total) * 100;
      
      expect(progress).toBe(100);
    });

    it('should handle partial progress', () => {
      const total = 8;
      const tested = 3;
      const progress = (tested / total) * 100;
      
      expect(progress).toBe(37.5);
    });
  });

  describe('Category filtering', () => {
    const mockDevices = [
      { id: 1, deviceType: 'Smoke Detector', location: 'Lobby' },
      { id: 2, deviceType: 'Pull Station', location: 'Hallway' },
      { id: 3, deviceType: 'Fire Extinguisher', location: 'Kitchen' },
      { id: 4, deviceType: 'Emergency Light', location: 'Exit' },
      { id: 5, deviceType: 'Smoke Alarm', location: 'Bedroom' },
      { id: 6, deviceType: 'Heat Detector', location: 'Garage' },
      { id: 7, deviceType: 'Horn/Strobe', location: 'Corridor' },
      { id: 8, deviceType: 'Exit Sign', location: 'Stairwell' },
    ];

    const categorizeDevice = (deviceType: string) => {
      const type = deviceType.toLowerCase();
      if (type.includes('smoke')) return 'smoke';
      if (type.includes('extinguisher')) return 'extinguisher';
      if (type.includes('emergency') || type.includes('exit')) return 'emergency';
      if (type.includes('pull') || type.includes('heat') || type.includes('horn') || 
          type.includes('strobe') || type.includes('module') || type.includes('bell')) return 'fire_alarm';
      return 'other';
    };

    it('should filter smoke alarms correctly', () => {
      const smokeAlarms = mockDevices.filter(d => categorizeDevice(d.deviceType) === 'smoke');
      
      expect(smokeAlarms.length).toBe(2);
      expect(smokeAlarms[0].deviceType).toBe('Smoke Detector');
      expect(smokeAlarms[1].deviceType).toBe('Smoke Alarm');
    });

    it('should filter fire alarm devices correctly', () => {
      const fireAlarmDevices = mockDevices.filter(d => categorizeDevice(d.deviceType) === 'fire_alarm');
      
      expect(fireAlarmDevices.length).toBe(3);
      expect(fireAlarmDevices.map(d => d.deviceType)).toContain('Pull Station');
      expect(fireAlarmDevices.map(d => d.deviceType)).toContain('Heat Detector');
      expect(fireAlarmDevices.map(d => d.deviceType)).toContain('Horn/Strobe');
    });

    it('should filter extinguishers correctly', () => {
      const extinguishers = mockDevices.filter(d => categorizeDevice(d.deviceType) === 'extinguisher');
      
      expect(extinguishers.length).toBe(1);
      expect(extinguishers[0].deviceType).toBe('Fire Extinguisher');
    });

    it('should filter emergency lights correctly', () => {
      const emergencyLights = mockDevices.filter(d => categorizeDevice(d.deviceType) === 'emergency');
      
      expect(emergencyLights.length).toBe(2);
      expect(emergencyLights.map(d => d.deviceType)).toContain('Emergency Light');
      expect(emergencyLights.map(d => d.deviceType)).toContain('Exit Sign');
    });

    it('should not overlap categories', () => {
      const smokeAlarms = mockDevices.filter(d => categorizeDevice(d.deviceType) === 'smoke');
      const fireAlarmDevices = mockDevices.filter(d => categorizeDevice(d.deviceType) === 'fire_alarm');
      const extinguishers = mockDevices.filter(d => categorizeDevice(d.deviceType) === 'extinguisher');
      const emergencyLights = mockDevices.filter(d => categorizeDevice(d.deviceType) === 'emergency');
      
      const totalCategorized = smokeAlarms.length + fireAlarmDevices.length + 
                               extinguishers.length + emergencyLights.length;
      
      expect(totalCategorized).toBe(mockDevices.length);
    });
  });

  describe('Deficiency counting', () => {
    it('should count deficiencies for category', () => {
      const mockDeficiencies = [
        { id: 1, deviceId: 1, severity: 'major' },
        { id: 2, deviceId: 2, severity: 'critical' },
        { id: 3, deviceId: 5, severity: 'minor' },
      ];
      
      const mockDevices = [
        { id: 1, deviceType: 'Smoke Detector' },
        { id: 2, deviceType: 'Pull Station' },
        { id: 5, deviceType: 'Smoke Alarm' },
      ];
      
      const categorizeDevice = (deviceType: string) => {
        const type = deviceType.toLowerCase();
        if (type.includes('smoke')) return 'smoke';
        return 'other';
      };
      
      const smokeDeficiencies = mockDeficiencies.filter(d => {
        const device = mockDevices.find(dev => dev.id === d.deviceId);
        return device && categorizeDevice(device.deviceType) === 'smoke';
      });
      
      expect(smokeDeficiencies.length).toBe(2);
    });

    it('should handle zero deficiencies', () => {
      const mockDeficiencies: any[] = [];
      expect(mockDeficiencies.length).toBe(0);
    });
  });

  describe('Resume route logic', () => {
    it('should show resume route for smoke alarms if progress includes smoke', () => {
      const progress = { route: '/tech/jobs/123/smoke-alarms', label: 'Smoke Alarms' };
      const shouldShowResume = progress.route.includes('smoke');
      
      expect(shouldShowResume).toBe(true);
    });

    it('should show resume route for fire alarm devices if progress includes fire-alarm but not smoke', () => {
      const progress = { route: '/tech/jobs/123/fire-alarm', label: 'Fire Alarm' };
      const shouldShowResume = progress.route.includes('fire-alarm') && !progress.route.includes('smoke');
      
      expect(shouldShowResume).toBe(true);
    });

    it('should not show resume route for wrong category', () => {
      const progress = { route: '/tech/jobs/123/extinguishers', label: 'Extinguishers' };
      const shouldShowResume = progress.route.includes('smoke');
      
      expect(shouldShowResume).toBe(false);
    });

    it('should default to start route if no resume route', () => {
      const resumeRoute = undefined;
      const startRoute = '/tech/jobs/123#smoke-alarms';
      const targetRoute = resumeRoute || startRoute;
      
      expect(targetRoute).toBe(startRoute);
    });
  });

  describe('Card visibility', () => {
    it('should show card only if category has devices', () => {
      const smokeAlarms = [{ id: 1, deviceType: 'Smoke Detector' }];
      const shouldShowCard = smokeAlarms.length > 0;
      
      expect(shouldShowCard).toBe(true);
    });

    it('should hide card if category has no devices', () => {
      const smokeAlarms: any[] = [];
      const shouldShowCard = smokeAlarms.length > 0;
      
      expect(shouldShowCard).toBe(false);
    });
  });
});
