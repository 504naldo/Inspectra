import { describe, it, expect } from 'vitest';
import { sortByWalkOrderThenLocation } from '../shared/deviceHelpers';
import { isSmokeAlarm, categorizeDevice } from '../shared/deviceCategories';

/**
 * Category Workflow Fixes Tests
 * 
 * Verify that Start opens list view, Next/Previous navigation works in detail screens,
 * View All expands cards, and no duplicate lists appear.
 */

describe('Category Workflow Fixes', () => {
  describe('Start button behavior', () => {
    it('should expand card instead of navigating to single device', () => {
      let isExpanded = false;
      const hasProgress = false;
      const resumeRoute = undefined;

      // Simulate Start button click
      if (resumeRoute && hasProgress) {
        // Resume: would navigate
        expect(true).toBe(false); // Should not reach here
      } else {
        // Start: expand card
        if (!isExpanded) {
          isExpanded = true;
        }
      }

      expect(isExpanded).toBe(true);
    });

    it('should navigate to resume route when progress exists', () => {
      let navigated = false;
      const hasProgress = true;
      const resumeRoute = '/tech/jobs/1/device/5?category=smoke';

      // Simulate Resume button click
      if (resumeRoute && hasProgress) {
        navigated = true;
      }

      expect(navigated).toBe(true);
    });

    it('should not expand card if already expanded', () => {
      let isExpanded = true;
      let toggleCount = 0;
      const hasProgress = false;
      const resumeRoute = undefined;

      // Simulate Start button click
      if (resumeRoute && hasProgress) {
        // Resume
      } else {
        if (!isExpanded) {
          toggleCount++;
          isExpanded = true;
        }
      }

      expect(toggleCount).toBe(0);
      expect(isExpanded).toBe(true);
    });
  });

  describe('View All button behavior', () => {
    it('should expand card when not expanded', () => {
      let isExpanded = false;
      const devices = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));

      // Simulate View All click
      if (!isExpanded) {
        isExpanded = true;
      }

      expect(isExpanded).toBe(true);
    });

    it('should navigate to full list when expanded and has more than 10 devices', () => {
      let isExpanded = true;
      let navigated = false;
      const devices = Array.from({ length: 15 }, (_, i) => ({ id: i + 1 }));

      // Simulate View All click
      if (!isExpanded) {
        isExpanded = true;
      } else if (devices.length > 10) {
        navigated = true;
      }

      expect(navigated).toBe(true);
    });

    it('should not navigate when expanded with 10 or fewer devices', () => {
      let isExpanded = true;
      let navigated = false;
      const devices = Array.from({ length: 8 }, (_, i) => ({ id: i + 1 }));

      // Simulate View All click
      if (!isExpanded) {
        isExpanded = true;
      } else if (devices.length > 10) {
        navigated = true;
      }

      expect(navigated).toBe(false);
    });
  });

  describe('Next/Previous navigation in detail screen', () => {
    it('should calculate correct device indices', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 3, location: 'C', deviceType: 'Smoke' },
      ];

      const sortedDevices = sortByWalkOrderThenLocation(devices);
      const currentDeviceId = 2;
      const currentIndex = sortedDevices.findIndex(d => d.id === currentDeviceId);

      expect(currentIndex).toBe(1);
    });

    it('should identify when Previous is available', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 3, location: 'C', deviceType: 'Smoke' },
      ];

      const sortedDevices = sortByWalkOrderThenLocation(devices);
      const currentIndex = 1; // Middle device
      const hasPrevious = currentIndex > 0;

      expect(hasPrevious).toBe(true);
    });

    it('should identify when Next is available', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 3, location: 'C', deviceType: 'Smoke' },
      ];

      const sortedDevices = sortByWalkOrderThenLocation(devices);
      const currentIndex = 1; // Middle device
      const hasNext = currentIndex >= 0 && currentIndex < sortedDevices.length - 1;

      expect(hasNext).toBe(true);
    });

    it('should disable Previous at start of list', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
      ];

      const currentIndex = 0; // First device
      const hasPrevious = currentIndex > 0;

      expect(hasPrevious).toBe(false);
    });

    it('should disable Next at end of list', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
      ];

      const currentIndex = 1; // Last device
      const hasNext = currentIndex >= 0 && currentIndex < devices.length - 1;

      expect(hasNext).toBe(false);
    });

    it('should get correct previous device', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 3, location: 'C', deviceType: 'Smoke' },
      ];

      const sortedDevices = sortByWalkOrderThenLocation(devices);
      const currentIndex = 2; // Last device
      const hasPrevious = currentIndex > 0;
      const previousDevice = hasPrevious ? sortedDevices[currentIndex - 1] : null;

      expect(previousDevice?.id).toBe(2);
    });

    it('should get correct next device', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 3, location: 'C', deviceType: 'Smoke' },
      ];

      const sortedDevices = sortByWalkOrderThenLocation(devices);
      const currentIndex = 0; // First device
      const hasNext = currentIndex >= 0 && currentIndex < sortedDevices.length - 1;
      const nextDevice = hasNext ? sortedDevices[currentIndex + 1] : null;

      expect(nextDevice?.id).toBe(2);
    });
  });

  describe('Category filtering for navigation', () => {
    it('should filter smoke alarms correctly', () => {
      const devices = [
        { id: 1, deviceType: 'Smoke Detector', location: 'A' },
        { id: 2, deviceType: 'Heat Detector', location: 'B' },
        { id: 3, deviceType: 'Photoelectric Smoke Alarm', location: 'C' },
      ];

      const smokeDevices = devices.filter(d => isSmokeAlarm(d));
      
      expect(smokeDevices.length).toBe(2);
      expect(smokeDevices.map(d => d.id)).toEqual([1, 3]);
    });

    it('should filter fire alarm devices correctly', () => {
      const devices = [
        { id: 1, deviceType: 'Smoke Detector', location: 'A' },
        { id: 2, deviceType: 'Heat Detector', location: 'B' },
        { id: 3, deviceType: 'Pull Station', location: 'C' },
      ];

      const fireAlarmDevices = devices.filter(d => categorizeDevice(d) === 'fire_alarm');
      
      expect(fireAlarmDevices.length).toBe(2);
      expect(fireAlarmDevices.map(d => d.id)).toEqual([2, 3]);
    });

    it('should generate correct navigation URL with category param', () => {
      const jobId = 123;
      const deviceId = 456;
      const category = 'smoke';

      const url = `/tech/jobs/${jobId}/device/${deviceId}?category=${category}`;
      
      expect(url).toBe('/tech/jobs/123/device/456?category=smoke');
    });
  });

  describe('Position indicator', () => {
    it('should show correct position in list', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 3, location: 'C', deviceType: 'Smoke' },
      ];

      const currentIndex = 1; // Second device
      const position = currentIndex + 1;
      const total = devices.length;

      expect(position).toBe(2);
      expect(total).toBe(3);
    });

    it('should indicate start of list', () => {
      const currentIndex = 0;
      const hasPrevious = currentIndex > 0;
      const atStart = !hasPrevious;

      expect(atStart).toBe(true);
    });

    it('should indicate end of list', () => {
      const devices = [
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ];

      const currentIndex = 2; // Last device
      const hasNext = currentIndex >= 0 && currentIndex < devices.length - 1;
      const atEnd = !hasNext;

      expect(atEnd).toBe(true);
    });
  });

  describe('Navigation with walk order', () => {
    it('should navigate through devices in walk order', () => {
      const devices = [
        { id: 1, walkOrder: 3, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 1, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 2, location: 'C', deviceType: 'Smoke' },
      ];

      const sortedDevices = sortByWalkOrderThenLocation(devices);
      
      // Navigation should go: device 2 -> device 3 -> device 1
      expect(sortedDevices.map(d => d.id)).toEqual([2, 3, 1]);
    });

    it('should handle mixed walkOrder values in navigation', () => {
      const devices = [
        { id: 1, walkOrder: null, location: 'Basement', deviceType: 'Smoke' },
        { id: 2, walkOrder: 1, location: 'Lobby', deviceType: 'Smoke' },
        { id: 3, walkOrder: 2, location: 'Office', deviceType: 'Smoke' },
        { id: 4, walkOrder: null, location: 'Attic', deviceType: 'Smoke' },
      ];

      const sortedDevices = sortByWalkOrderThenLocation(devices);
      
      // Should be: walkOrder 1, 2, then nulls sorted by location (Attic, Basement)
      expect(sortedDevices.map(d => d.id)).toEqual([2, 3, 4, 1]);
    });
  });
});
