import { describe, it, expect } from 'vitest';
import { validateDeficiencyReportLocations } from './locationValidation';

describe('Deficiency Report Location Validation - Override Mode', () => {
  const mockDeficienciesWithLocations = [
    {
      id: 1,
      description: 'Smoke alarm not responding',
      severity: 'critical',
      location: 'Hallway 2nd Floor',
    },
    {
      id: 2,
      description: 'Fire extinguisher expired',
      severity: 'major',
      location: 'Kitchen',
    },
  ];

  const mockDeficienciesMissingLocations = [
    {
      id: 3,
      description: 'Emergency light battery low',
      severity: 'major',
      location: null,
    },
    {
      id: 4,
      description: 'Pull station cover damaged',
      severity: 'minor',
      location: null,
    },
  ];

  const mockMixedDeficiencies = [
    ...mockDeficienciesWithLocations,
    ...mockDeficienciesMissingLocations,
  ];

  describe('Production Mode (default - strict validation)', () => {
    it('should pass validation when all deficiencies have locations', () => {
      const result = validateDeficiencyReportLocations(mockDeficienciesWithLocations);
      
      expect(result.isValid).toBe(true);
      expect(result.missingDeficiencies).toHaveLength(0);
      expect(result.totalMissing).toBe(0);
    });

    it('should fail validation when any deficiency is missing location', () => {
      const result = validateDeficiencyReportLocations(mockDeficienciesMissingLocations);
      
      expect(result.isValid).toBe(false);
      expect(result.missingDeficiencies).toHaveLength(2);
      expect(result.totalMissing).toBe(2);
    });

    it('should fail validation with mixed deficiencies (some with, some without locations)', () => {
      const result = validateDeficiencyReportLocations(mockMixedDeficiencies);
      
      expect(result.isValid).toBe(false);
      expect(result.missingDeficiencies).toHaveLength(2);
      expect(result.totalMissing).toBe(2);
      
      // Verify correct deficiencies are flagged
      expect(result.missingDeficiencies[0].id).toBe(3);
      expect(result.missingDeficiencies[1].id).toBe(4);
    });

    it('should identify deficiencies with empty string locations as missing', () => {
      const deficienciesWithEmptyStrings = [
        {
          id: 5,
          description: 'Test deficiency',
          severity: 'minor',
          location: '',
        },
        {
          id: 6,
          description: 'Another test',
          severity: 'minor',
          location: '   ', // Whitespace only
        },
      ];
      
      const result = validateDeficiencyReportLocations(deficienciesWithEmptyStrings);
      
      expect(result.isValid).toBe(false);
      expect(result.missingDeficiencies).toHaveLength(2);
    });
  });

  describe('Admin Override Mode (allowMissingLocations = true)', () => {
    it('should pass validation even with missing locations when override is enabled', () => {
      const result = validateDeficiencyReportLocations(mockDeficienciesMissingLocations, true);
      
      expect(result.isValid).toBe(true); // Override allows generation
      expect(result.missingDeficiencies).toHaveLength(2); // But still tracks missing items
      expect(result.totalMissing).toBe(2);
    });

    it('should still track missing deficiencies for warning generation', () => {
      const result = validateDeficiencyReportLocations(mockMixedDeficiencies, true);
      
      expect(result.isValid).toBe(true);
      expect(result.missingDeficiencies).toHaveLength(2);
      
      // Verify missing items are correctly identified
      expect(result.missingDeficiencies[0]).toEqual({
        id: 3,
        description: 'Emergency light battery low',
        severity: 'major',
      });
      expect(result.missingDeficiencies[1]).toEqual({
        id: 4,
        description: 'Pull station cover damaged',
        severity: 'minor',
      });
    });

    it('should pass with zero missing items when all have locations', () => {
      const result = validateDeficiencyReportLocations(mockDeficienciesWithLocations, true);
      
      expect(result.isValid).toBe(true);
      expect(result.missingDeficiencies).toHaveLength(0);
      expect(result.totalMissing).toBe(0);
    });

    it('should handle empty deficiencies array in override mode', () => {
      const result = validateDeficiencyReportLocations([], true);
      
      expect(result.isValid).toBe(true);
      expect(result.missingDeficiencies).toHaveLength(0);
      expect(result.totalMissing).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty deficiencies array in production mode', () => {
      const result = validateDeficiencyReportLocations([]);
      
      expect(result.isValid).toBe(true);
      expect(result.missingDeficiencies).toHaveLength(0);
    });

    it('should preserve deficiency details in missing items list', () => {
      const result = validateDeficiencyReportLocations(mockDeficienciesMissingLocations, true);
      
      result.missingDeficiencies.forEach((missing) => {
        expect(missing).toHaveProperty('id');
        expect(missing).toHaveProperty('description');
        expect(missing).toHaveProperty('severity');
        expect(missing.description).toBeTruthy();
      });
    });

    it('should not include device info in validation result', () => {
      const result = validateDeficiencyReportLocations(mockMixedDeficiencies, true);
      
      expect(result.missingDevices).toHaveLength(0);
      expect(result.missingDevices).toEqual([]);
    });
  });

  describe('Parameter Defaults', () => {
    it('should default to strict mode when allowMissingLocations is undefined', () => {
      const result = validateDeficiencyReportLocations(mockDeficienciesMissingLocations, undefined);
      
      expect(result.isValid).toBe(false);
    });

    it('should default to strict mode when allowMissingLocations is not provided', () => {
      const result = validateDeficiencyReportLocations(mockDeficienciesMissingLocations);
      
      expect(result.isValid).toBe(false);
    });

    it('should respect explicit false value for allowMissingLocations', () => {
      const result = validateDeficiencyReportLocations(mockDeficienciesMissingLocations, false);
      
      expect(result.isValid).toBe(false);
    });
  });
});
