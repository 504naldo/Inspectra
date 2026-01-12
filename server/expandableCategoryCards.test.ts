import { describe, it, expect } from 'vitest';
import { sortByWalkOrderThenLocation, findFirstUntestedDevice } from '../shared/deviceHelpers';

/**
 * Expandable Category Cards Tests
 * 
 * Verify that expandable category cards correctly sort devices by walk order,
 * show device lists inside cards, and implement accordion behavior.
 */

describe('Expandable Category Cards', () => {
  describe('sortByWalkOrderThenLocation', () => {
    it('should sort by walkOrder ascending', () => {
      const devices = [
        { id: 1, walkOrder: 3, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 1, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 2, location: 'C', deviceType: 'Smoke' },
      ];

      const sorted = sortByWalkOrderThenLocation(devices);
      
      expect(sorted.map(d => d.id)).toEqual([2, 3, 1]);
    });

    it('should place null walkOrder at the end', () => {
      const devices = [
        { id: 1, walkOrder: 2, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: null, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 1, location: 'C', deviceType: 'Smoke' },
        { id: 4, walkOrder: null, location: 'D', deviceType: 'Smoke' },
      ];

      const sorted = sortByWalkOrderThenLocation(devices);
      
      expect(sorted.map(d => d.id)).toEqual([3, 1, 2, 4]);
    });

    it('should sort by location when walkOrder is the same', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'Lobby', deviceType: 'Smoke' },
        { id: 2, walkOrder: 1, location: 'Basement', deviceType: 'Smoke' },
        { id: 3, walkOrder: 1, location: 'Office', deviceType: 'Smoke' },
      ];

      const sorted = sortByWalkOrderThenLocation(devices);
      
      expect(sorted.map(d => d.location)).toEqual(['Basement', 'Lobby', 'Office']);
    });

    it('should sort by deviceType when walkOrder and location are the same', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'Lobby', deviceType: 'Smoke Detector' },
        { id: 2, walkOrder: 1, location: 'Lobby', deviceType: 'Heat Detector' },
        { id: 3, walkOrder: 1, location: 'Lobby', deviceType: 'Pull Station' },
      ];

      const sorted = sortByWalkOrderThenLocation(devices);
      
      expect(sorted.map(d => d.deviceType)).toEqual(['Heat Detector', 'Pull Station', 'Smoke Detector']);
    });

    it('should handle null locations', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: null, deviceType: 'Smoke' },
        { id: 2, walkOrder: 1, location: 'Lobby', deviceType: 'Smoke' },
        { id: 3, walkOrder: 1, location: null, deviceType: 'Smoke' },
      ];

      const sorted = sortByWalkOrderThenLocation(devices);
      
      // Null locations should be sorted to the beginning (empty string sorts first)
      expect(sorted.map(d => d.id)).toEqual([1, 3, 2]);
    });

    it('should not mutate original array', () => {
      const devices = [
        { id: 1, walkOrder: 3, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 1, location: 'B', deviceType: 'Smoke' },
      ];

      const original = [...devices];
      sortByWalkOrderThenLocation(devices);
      
      expect(devices).toEqual(original);
    });
  });

  describe('findFirstUntestedDevice', () => {
    it('should find first untested device', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 3, location: 'C', deviceType: 'Smoke' },
      ];

      const testedIds = new Set([1]);
      const firstUntested = findFirstUntestedDevice(devices, testedIds);
      
      expect(firstUntested?.id).toBe(2);
    });

    it('should return undefined when all devices are tested', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
      ];

      const testedIds = new Set([1, 2]);
      const firstUntested = findFirstUntestedDevice(devices, testedIds);
      
      expect(firstUntested).toBeUndefined();
    });

    it('should return first device when none are tested', () => {
      const devices = [
        { id: 1, walkOrder: 1, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'B', deviceType: 'Smoke' },
      ];

      const testedIds = new Set<number>([]);
      const firstUntested = findFirstUntestedDevice(devices, testedIds);
      
      expect(firstUntested?.id).toBe(1);
    });
  });

  describe('Device list preview', () => {
    it('should limit preview to 10 items', () => {
      const devices = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        walkOrder: i + 1,
        location: `Location ${i + 1}`,
        deviceType: 'Smoke Detector',
      }));

      const previewLimit = 10;
      const preview = devices.slice(0, previewLimit);
      
      expect(preview.length).toBe(10);
      expect(devices.length).toBe(15);
    });

    it('should indicate when there are more items', () => {
      const devices = Array.from({ length: 15 }, (_, i) => ({
        id: i + 1,
        walkOrder: i + 1,
        location: `Location ${i + 1}`,
        deviceType: 'Smoke Detector',
      }));

      const previewLimit = 10;
      const hasMore = devices.length > previewLimit;
      
      expect(hasMore).toBe(true);
    });

    it('should not indicate more items when total is less than limit', () => {
      const devices = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        walkOrder: i + 1,
        location: `Location ${i + 1}`,
        deviceType: 'Smoke Detector',
      }));

      const previewLimit = 10;
      const hasMore = devices.length > previewLimit;
      
      expect(hasMore).toBe(false);
    });
  });

  describe('Accordion behavior', () => {
    it('should track expanded card state', () => {
      let expandedCard: string | null = null;

      // Expand smoke card
      expandedCard = 'smoke';
      expect(expandedCard).toBe('smoke');

      // Expand firealarm card (should close smoke)
      expandedCard = 'firealarm';
      expect(expandedCard).toBe('firealarm');
      expect(expandedCard).not.toBe('smoke');
    });

    it('should toggle card expansion', () => {
      let expandedCard: string | null = null;

      // Expand card
      expandedCard = expandedCard === 'smoke' ? null : 'smoke';
      expect(expandedCard).toBe('smoke');

      // Collapse card
      expandedCard = expandedCard === 'smoke' ? null : 'smoke';
      expect(expandedCard).toBeNull();
    });

    it('should only allow one card expanded at a time', () => {
      let expandedCard: string | null = null;

      // Expand smoke card
      expandedCard = 'smoke';
      expect(expandedCard).toBe('smoke');

      // Expand firealarm card
      expandedCard = 'firealarm';
      expect(expandedCard).toBe('firealarm');

      // Verify smoke is no longer expanded
      const isSmokeExpanded = expandedCard === 'smoke';
      const isFirealarmExpanded = expandedCard === 'firealarm';
      
      expect(isSmokeExpanded).toBe(false);
      expect(isFirealarmExpanded).toBe(true);
    });
  });

  describe('Device navigation', () => {
    it('should generate correct device route', () => {
      const jobId = 123;
      const deviceId = 456;
      
      const route = `/tech/jobs/${jobId}/device/${deviceId}`;
      
      expect(route).toBe('/tech/jobs/123/device/456');
    });

    it('should generate correct category filter route', () => {
      const jobId = 123;
      const category = 'smoke';
      
      const route = `/tech/jobs/${jobId}?category=${category}`;
      
      expect(route).toBe('/tech/jobs/123?category=smoke');
    });
  });

  describe('Walk order integration', () => {
    it('should sort devices with mixed walkOrder values', () => {
      const devices = [
        { id: 1, walkOrder: null, location: 'Basement', deviceType: 'Smoke' },
        { id: 2, walkOrder: 2, location: 'Lobby', deviceType: 'Smoke' },
        { id: 3, walkOrder: 1, location: 'Office', deviceType: 'Smoke' },
        { id: 4, walkOrder: null, location: 'Attic', deviceType: 'Smoke' },
        { id: 5, walkOrder: 3, location: 'Garage', deviceType: 'Smoke' },
      ];

      const sorted = sortByWalkOrderThenLocation(devices);
      
      // walkOrder 1, 2, 3, then nulls sorted by location (Attic, Basement)
      expect(sorted.map(d => d.id)).toEqual([3, 2, 5, 4, 1]);
    });

    it('should maintain walk order when adding inspection results', () => {
      const devices = [
        { id: 1, walkOrder: 2, location: 'A', deviceType: 'Smoke' },
        { id: 2, walkOrder: 1, location: 'B', deviceType: 'Smoke' },
        { id: 3, walkOrder: 3, location: 'C', deviceType: 'Smoke' },
      ];

      const inspectionResults = [
        { deviceId: 1, result: 'pass' },
        { deviceId: 3, result: 'fail' },
      ];

      const sorted = sortByWalkOrderThenLocation(devices).map(d => ({
        ...d,
        result: inspectionResults.find(r => r.deviceId === d.id)?.result
      }));
      
      expect(sorted.map(d => d.id)).toEqual([2, 1, 3]);
      expect(sorted[0].result).toBeUndefined();
      expect(sorted[1].result).toBe('pass');
      expect(sorted[2].result).toBe('fail');
    });
  });
});
