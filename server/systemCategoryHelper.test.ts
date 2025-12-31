import { describe, it, expect } from 'vitest';
import { detectSystemCategory, getSystemCategory, getSystemCategoryLabel, getAllSystemCategories } from './systemCategoryHelper';

describe('System Category Auto-Detection', () => {
  describe('detectSystemCategory', () => {
    describe('Sprinkler Detection', () => {
      it('should detect sprinkler from "sprinkler" keyword', () => {
        expect(detectSystemCategory('Sprinkler head missing')).toBe('SPRINKLER');
        expect(detectSystemCategory('Replace sprinkler heads')).toBe('SPRINKLER');
      });

      it('should detect sprinkler from FDC keywords', () => {
        expect(detectSystemCategory('FDC testing required')).toBe('SPRINKLER');
        expect(detectSystemCategory('Fire Department Connection inspection')).toBe('SPRINKLER');
      });

      it('should detect sprinkler from standpipe keywords', () => {
        expect(detectSystemCategory('Standpipe valve issue')).toBe('SPRINKLER');
        expect(detectSystemCategory('Siamese connection damaged')).toBe('SPRINKLER');
      });

      it('should detect sprinkler from system component keywords', () => {
        expect(detectSystemCategory('Flow switch malfunction')).toBe('SPRINKLER');
        expect(detectSystemCategory('Tamper switch not working')).toBe('SPRINKLER');
        expect(detectSystemCategory('Zone valve needs replacement')).toBe('SPRINKLER');
        expect(detectSystemCategory('Alarm valve inspection')).toBe('SPRINKLER');
      });

      it('should detect sprinkler from system type keywords', () => {
        expect(detectSystemCategory('Dry system pressure low')).toBe('SPRINKLER');
        expect(detectSystemCategory('Wet system leak detected')).toBe('SPRINKLER');
        expect(detectSystemCategory('Antifreeze system maintenance')).toBe('SPRINKLER');
      });

      it('should detect sprinkler from testing keywords', () => {
        expect(detectSystemCategory('End-of-line testing required')).toBe('SPRINKLER');
        expect(detectSystemCategory('EOL test failed')).toBe('SPRINKLER');
        expect(detectSystemCategory('Hydrostatic test needed')).toBe('SPRINKLER');
      });

      it('should detect sprinkler from spare heads keywords', () => {
        expect(detectSystemCategory('Spare heads cabinet missing')).toBe('SPRINKLER');
        expect(detectSystemCategory('Insufficient spare sprinkler heads')).toBe('SPRINKLER');
      });

      it('should detect sprinkler from location keywords', () => {
        expect(detectSystemCategory('Sprinkler room access blocked')).toBe('SPRINKLER');
        expect(detectSystemCategory('Riser room inspection')).toBe('SPRINKLER');
      });
    });

    describe('Fire Alarm Detection', () => {
      it('should detect fire alarm from device keywords', () => {
        expect(detectSystemCategory('Smoke detector not responding')).toBe('FIRE_ALARM');
        expect(detectSystemCategory('Heat detector malfunction')).toBe('FIRE_ALARM');
        expect(detectSystemCategory('Pull station damaged')).toBe('FIRE_ALARM');
      });

      it('should detect fire alarm from notification device keywords', () => {
        expect(detectSystemCategory('Horn strobe not working')).toBe('FIRE_ALARM');
        expect(detectSystemCategory('Notification device failure')).toBe('FIRE_ALARM');
      });

      it('should detect fire alarm from panel keywords', () => {
        expect(detectSystemCategory('Fire alarm control panel error')).toBe('FIRE_ALARM');
        expect(detectSystemCategory('FACP battery replacement')).toBe('FIRE_ALARM');
        expect(detectSystemCategory('Annunciator display issue')).toBe('FIRE_ALARM');
      });
    });

    describe('Fire Extinguisher Detection', () => {
      it('should detect fire extinguisher from basic keywords', () => {
        expect(detectSystemCategory('Fire extinguisher expired')).toBe('FIRE_EXTINGUISHER');
        expect(detectSystemCategory('Extinguisher tag missing')).toBe('FIRE_EXTINGUISHER');
      });

      it('should detect fire extinguisher from type keywords', () => {
        expect(detectSystemCategory('ABC extinguisher needs recharge')).toBe('FIRE_EXTINGUISHER');
        expect(detectSystemCategory('CO2 extinguisher inspection')).toBe('FIRE_EXTINGUISHER');
        expect(detectSystemCategory('K class extinguisher missing')).toBe('FIRE_EXTINGUISHER');
      });

      it('should detect fire extinguisher from mounting keywords', () => {
        expect(detectSystemCategory('Extinguisher cabinet damaged')).toBe('FIRE_EXTINGUISHER');
        expect(detectSystemCategory('Extinguisher mount loose')).toBe('FIRE_EXTINGUISHER');
      });
    });

    describe('Emergency Lighting Detection', () => {
      it('should detect emergency lighting from basic keywords', () => {
        expect(detectSystemCategory('Emergency light battery low')).toBe('EMERGENCY_LIGHTING');
        expect(detectSystemCategory('Exit sign not illuminated')).toBe('EMERGENCY_LIGHTING');
      });

      it('should detect emergency lighting from system keywords', () => {
        expect(detectSystemCategory('Emergency lighting test failed')).toBe('EMERGENCY_LIGHTING');
        expect(detectSystemCategory('Egress lighting insufficient')).toBe('EMERGENCY_LIGHTING');
        expect(detectSystemCategory('Battery backup not working')).toBe('EMERGENCY_LIGHTING');
      });
    });

    describe('Edge Cases', () => {
      it('should return null for unrecognized text', () => {
        expect(detectSystemCategory('Random text without keywords')).toBeNull();
        expect(detectSystemCategory('General building maintenance')).toBeNull();
      });

      it('should be case-insensitive', () => {
        expect(detectSystemCategory('SPRINKLER HEAD MISSING')).toBe('SPRINKLER');
        expect(detectSystemCategory('smoke detector issue')).toBe('FIRE_ALARM');
        expect(detectSystemCategory('FIRE EXTINGUISHER EXPIRED')).toBe('FIRE_EXTINGUISHER');
      });

      it('should use description when title is generic', () => {
        expect(detectSystemCategory('Deficiency found', 'Sprinkler head damaged during construction')).toBe('SPRINKLER');
        expect(detectSystemCategory('Issue detected', 'Fire alarm pull station cover missing')).toBe('FIRE_ALARM');
      });

      it('should prioritize category with most keyword matches', () => {
        // If multiple keywords from same category appear, that category wins
        expect(detectSystemCategory('Sprinkler head and FDC testing required')).toBe('SPRINKLER');
      });

      it('should handle empty or null description', () => {
        expect(detectSystemCategory('Sprinkler issue', null)).toBe('SPRINKLER');
        expect(detectSystemCategory('Sprinkler issue', undefined)).toBe('SPRINKLER');
        expect(detectSystemCategory('Sprinkler issue', '')).toBe('SPRINKLER');
      });
    });
  });

  describe('getSystemCategory', () => {
    it('should return manual category when provided', () => {
      expect(getSystemCategory('FIRE_ALARM', 'Sprinkler head missing')).toBe('FIRE_ALARM');
      expect(getSystemCategory('SPRINKLER', 'Smoke detector issue')).toBe('SPRINKLER');
    });

    it('should auto-detect when manual category is null', () => {
      expect(getSystemCategory(null, 'Sprinkler head missing')).toBe('SPRINKLER');
      expect(getSystemCategory(null, 'Smoke detector issue')).toBe('FIRE_ALARM');
    });

    it('should auto-detect when manual category is undefined', () => {
      expect(getSystemCategory(undefined, 'Fire extinguisher expired')).toBe('FIRE_EXTINGUISHER');
      expect(getSystemCategory(undefined, 'Emergency light battery low')).toBe('EMERGENCY_LIGHTING');
    });

    it('should prioritize manual category over auto-detection', () => {
      // Even if title suggests sprinkler, manual category wins
      expect(getSystemCategory('FIRE_ALARM', 'Sprinkler head missing', 'Sprinkler system issue')).toBe('FIRE_ALARM');
    });
  });

  describe('getSystemCategoryLabel', () => {
    it('should return human-readable labels', () => {
      expect(getSystemCategoryLabel('FIRE_ALARM')).toBe('Fire Alarm');
      expect(getSystemCategoryLabel('FIRE_EXTINGUISHER')).toBe('Fire Extinguisher');
      expect(getSystemCategoryLabel('EMERGENCY_LIGHTING')).toBe('Emergency Lighting');
      expect(getSystemCategoryLabel('SPRINKLER')).toBe('Sprinkler');
    });

    it('should return "Uncategorized" for null', () => {
      expect(getSystemCategoryLabel(null)).toBe('Uncategorized');
    });
  });

  describe('getAllSystemCategories', () => {
    it('should return all four categories', () => {
      const categories = getAllSystemCategories();
      expect(categories).toHaveLength(4);
      expect(categories).toContain('FIRE_ALARM');
      expect(categories).toContain('FIRE_EXTINGUISHER');
      expect(categories).toContain('EMERGENCY_LIGHTING');
      expect(categories).toContain('SPRINKLER');
    });
  });
});
