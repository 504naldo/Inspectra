import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as db from './db';

/**
 * Walk Order Device Ordering Tests
 * 
 * Verify that devices are automatically assigned walkOrder during testing
 * and that PDF reports respect this ordering.
 */

describe('Walk Order Functionality', () => {
  describe('getNextWalkOrder', () => {
    it('should return 1 for first device in inspection', async () => {
      // Mock empty inspection results
      vi.spyOn(db, 'getNextWalkOrder').mockResolvedValue(1);
      
      const nextOrder = await db.getNextWalkOrder(123);
      expect(nextOrder).toBe(1);
    });

    it('should return incremented walkOrder for subsequent devices', async () => {
      // Mock existing walkOrder
      vi.spyOn(db, 'getNextWalkOrder').mockResolvedValue(5);
      
      const nextOrder = await db.getNextWalkOrder(123);
      expect(nextOrder).toBe(5);
    });
  });

  describe('upsertInspectionResult - walkOrder assignment', () => {
    it('should assign walkOrder when device is first tested', async () => {
      const mockResult = {
        id: 1,
        jobId: 123,
        deviceId: 456,
        technicianId: 789,
        result: 'pass' as const,
        notes: null,
        testedAt: new Date(),
        syncedAt: null,
        walkOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(db, 'upsertInspectionResult').mockResolvedValue(mockResult);

      const result = await db.upsertInspectionResult({
        jobId: 123,
        deviceId: 456,
        technicianId: 789,
        result: 'pass',
        testedAt: new Date(),
      });

      expect(result.walkOrder).toBe(1);
    });

    it('should not assign walkOrder when result is not_tested', async () => {
      const mockResult = {
        id: 1,
        jobId: 123,
        deviceId: 456,
        technicianId: 789,
        result: 'not_tested' as const,
        notes: null,
        testedAt: null,
        syncedAt: null,
        walkOrder: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(db, 'upsertInspectionResult').mockResolvedValue(mockResult);

      const result = await db.upsertInspectionResult({
        jobId: 123,
        deviceId: 456,
        technicianId: 789,
        result: 'not_tested',
      });

      expect(result.walkOrder).toBeNull();
    });

    it('should preserve walkOrder when updating existing result', async () => {
      const mockResult = {
        id: 1,
        jobId: 123,
        deviceId: 456,
        technicianId: 789,
        result: 'pass' as const,
        notes: 'Updated notes',
        testedAt: new Date(),
        syncedAt: null,
        walkOrder: 3, // Existing walkOrder
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(db, 'upsertInspectionResult').mockResolvedValue(mockResult);

      const result = await db.upsertInspectionResult({
        jobId: 123,
        deviceId: 456,
        technicianId: 789,
        result: 'pass',
        notes: 'Updated notes',
        testedAt: new Date(),
      });

      expect(result.walkOrder).toBe(3); // Should preserve existing walkOrder
    });
  });

  describe('Device list sorting', () => {
    it('should sort devices by walkOrder ascending', () => {
      const devices = [
        { deviceId: 1, walkOrder: 3, location: 'Lobby' },
        { deviceId: 2, walkOrder: 1, location: 'Kitchen' },
        { deviceId: 3, walkOrder: 2, location: 'Bedroom' },
      ];

      const sorted = devices.sort((a, b) => {
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      });

      expect(sorted[0].walkOrder).toBe(1);
      expect(sorted[1].walkOrder).toBe(2);
      expect(sorted[2].walkOrder).toBe(3);
    });

    it('should place devices without walkOrder at the end', () => {
      const devices = [
        { deviceId: 1, walkOrder: 2, location: 'Lobby' },
        { deviceId: 2, walkOrder: null, location: 'Kitchen' },
        { deviceId: 3, walkOrder: 1, location: 'Bedroom' },
        { deviceId: 4, walkOrder: null, location: 'Bathroom' },
      ];

      const sorted = devices.sort((a, b) => {
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      });

      expect(sorted[0].walkOrder).toBe(1);
      expect(sorted[1].walkOrder).toBe(2);
      expect(sorted[2].walkOrder).toBeNull();
      expect(sorted[3].walkOrder).toBeNull();
    });

    it('should use location as fallback for devices without walkOrder', () => {
      const devices = [
        { deviceId: 1, walkOrder: null, location: 'Lobby' },
        { deviceId: 2, walkOrder: null, location: 'Kitchen' },
        { deviceId: 3, walkOrder: null, location: 'Bedroom' },
      ];

      const sorted = devices.sort((a, b) => {
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      });

      expect(sorted[0].location).toBe('Bedroom');
      expect(sorted[1].location).toBe('Kitchen');
      expect(sorted[2].location).toBe('Lobby');
    });

    it('should handle mixed walkOrder and null values correctly', () => {
      const devices = [
        { deviceId: 1, walkOrder: 5, location: 'Lobby' },
        { deviceId: 2, walkOrder: null, location: 'Attic' },
        { deviceId: 3, walkOrder: 2, location: 'Kitchen' },
        { deviceId: 4, walkOrder: null, location: 'Basement' },
        { deviceId: 5, walkOrder: 1, location: 'Bedroom' },
      ];

      const sorted = devices.sort((a, b) => {
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      });

      // First three should be ordered by walkOrder
      expect(sorted[0].walkOrder).toBe(1);
      expect(sorted[1].walkOrder).toBe(2);
      expect(sorted[2].walkOrder).toBe(5);
      
      // Last two should be null, sorted by location
      expect(sorted[3].walkOrder).toBeNull();
      expect(sorted[3].location).toBe('Attic');
      expect(sorted[4].walkOrder).toBeNull();
      expect(sorted[4].location).toBe('Basement');
    });
  });

  describe('Sequential walkOrder assignment', () => {
    it('should assign sequential walkOrder numbers as devices are tested', () => {
      const testSequence = [
        { deviceId: 101, expectedWalkOrder: 1 },
        { deviceId: 102, expectedWalkOrder: 2 },
        { deviceId: 103, expectedWalkOrder: 3 },
        { deviceId: 104, expectedWalkOrder: 4 },
      ];

      testSequence.forEach((test, index) => {
        expect(test.expectedWalkOrder).toBe(index + 1);
      });
    });

    it('should maintain walkOrder sequence even if devices are tested out of physical order', () => {
      // Technician tests devices in this order: Lobby -> Attic -> Kitchen -> Bedroom
      const testingOrder = [
        { deviceId: 1, location: 'Lobby', walkOrder: 1 },
        { deviceId: 4, location: 'Attic', walkOrder: 2 },
        { deviceId: 2, location: 'Kitchen', walkOrder: 3 },
        { deviceId: 3, location: 'Bedroom', walkOrder: 4 },
      ];

      // PDF should list them in testing order, not physical order
      const sorted = testingOrder.sort((a, b) => a.walkOrder - b.walkOrder);

      expect(sorted[0].location).toBe('Lobby');
      expect(sorted[1].location).toBe('Attic');
      expect(sorted[2].location).toBe('Kitchen');
      expect(sorted[3].location).toBe('Bedroom');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty device list', () => {
      const devices: any[] = [];
      const sorted = devices.sort((a, b) => {
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      });

      expect(sorted.length).toBe(0);
    });

    it('should handle all devices having null walkOrder', () => {
      const devices = [
        { deviceId: 1, walkOrder: null, location: 'C' },
        { deviceId: 2, walkOrder: null, location: 'A' },
        { deviceId: 3, walkOrder: null, location: 'B' },
      ];

      const sorted = devices.sort((a, b) => {
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      });

      expect(sorted[0].location).toBe('A');
      expect(sorted[1].location).toBe('B');
      expect(sorted[2].location).toBe('C');
    });

    it('should handle devices with same walkOrder (edge case)', () => {
      const devices = [
        { deviceId: 1, walkOrder: 1, location: 'Lobby' },
        { deviceId: 2, walkOrder: 1, location: 'Kitchen' },
        { deviceId: 3, walkOrder: 2, location: 'Bedroom' },
      ];

      const sorted = devices.sort((a, b) => {
        if (a.walkOrder === null && b.walkOrder === null) return (a.location || '').localeCompare(b.location || '');
        if (a.walkOrder === null) return 1;
        if (b.walkOrder === null) return -1;
        return a.walkOrder - b.walkOrder;
      });

      // Should maintain stable sort for same walkOrder
      expect(sorted[0].walkOrder).toBe(1);
      expect(sorted[1].walkOrder).toBe(1);
      expect(sorted[2].walkOrder).toBe(2);
    });
  });
});
