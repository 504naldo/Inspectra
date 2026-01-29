import { describe, it, expect } from 'vitest';
import { normalizePowerType, isValidPowerType, getPowerTypeDescription } from './powerTypeNormalization';

describe('Power Type Normalization', () => {
  describe('normalizePowerType', () => {
    it('should normalize hardwired values', () => {
      expect(normalizePowerType('Hardwired')).toBe('hardwired');
      expect(normalizePowerType('HARDWIRED')).toBe('hardwired');
      expect(normalizePowerType('hard')).toBe('hardwired');
      expect(normalizePowerType('AC')).toBe('hardwired');
      expect(normalizePowerType('ac')).toBe('hardwired');
      expect(normalizePowerType('Wired')).toBe('hardwired');
      expect(normalizePowerType('DU')).toBe('hardwired');
      expect(normalizePowerType('Dual')).toBe('hardwired');
      expect(normalizePowerType('(DU) Dual battery / AC power')).toBe('hardwired');
    });

    it('should normalize battery values', () => {
      expect(normalizePowerType('Battery')).toBe('battery');
      expect(normalizePowerType('BATTERY')).toBe('battery');
      expect(normalizePowerType('bat')).toBe('battery');
      expect(normalizePowerType('9V Battery')).toBe('battery');
      expect(normalizePowerType('AA Battery')).toBe('battery');
    });

    it('should normalize sealed battery values', () => {
      expect(normalizePowerType('Sealed')).toBe('sealed');
      expect(normalizePowerType('SEALED')).toBe('sealed');
      expect(normalizePowerType('10yr')).toBe('sealed');
      expect(normalizePowerType('10-year')).toBe('sealed');
      expect(normalizePowerType('(10IB) 10 Year integrated battery')).toBe('sealed');
      expect(normalizePowerType('10 year')).toBe('sealed');
    });

    it('should normalize unknown/empty values', () => {
      expect(normalizePowerType('')).toBe('unknown');
      expect(normalizePowerType(null)).toBe('unknown');
      expect(normalizePowerType(undefined)).toBe('unknown');
      expect(normalizePowerType('N/A')).toBe('unknown');
      expect(normalizePowerType('Unknown')).toBe('unknown');
    });

    it('should normalize Fire-Pro specific values', () => {
      // These are actual values from the user's Fire-Pro template
      expect(normalizePowerType('SA/CO-I')).toBe('unknown'); // Type code, not power type
      expect(normalizePowerType('SA-P')).toBe('unknown'); // Type code, not power type
      expect(normalizePowerType('(DU)')).toBe('hardwired'); // Dual power
      expect(normalizePowerType('(10IB)')).toBe('sealed'); // 10-year integrated battery
    });

    it('should handle punctuation and whitespace', () => {
      expect(normalizePowerType('  Hardwired  ')).toBe('hardwired');
      expect(normalizePowerType('Hard-wired')).toBe('hardwired');
      expect(normalizePowerType('Hard/wired')).toBe('hardwired');
      expect(normalizePowerType('(Hardwired)')).toBe('hardwired');
      expect(normalizePowerType('Battery  (9V)')).toBe('battery');
    });

    it('should handle numeric values', () => {
      expect(normalizePowerType(123)).toBe('unknown');
      expect(normalizePowerType(0)).toBe('unknown');
    });

    it('should prioritize hardwired over battery for dual power', () => {
      // "Dual battery / AC" should be hardwired, not battery
      expect(normalizePowerType('Dual battery / AC power')).toBe('hardwired');
      expect(normalizePowerType('Battery backup with AC')).toBe('hardwired');
    });

    it('should prioritize sealed over battery for 10-year', () => {
      // "10-year battery" should be sealed, not battery
      expect(normalizePowerType('10-year battery')).toBe('sealed');
      expect(normalizePowerType('Sealed battery')).toBe('sealed');
    });
  });

  describe('isValidPowerType', () => {
    it('should validate enum values', () => {
      expect(isValidPowerType('hardwired')).toBe(true);
      expect(isValidPowerType('battery')).toBe(true);
      expect(isValidPowerType('sealed')).toBe(true);
      expect(isValidPowerType('unknown')).toBe(true);
    });

    it('should reject invalid values', () => {
      expect(isValidPowerType('invalid')).toBe(false);
      expect(isValidPowerType('HARDWIRED')).toBe(false); // Must be lowercase
      expect(isValidPowerType('')).toBe(false);
      expect(isValidPowerType(null)).toBe(false);
      expect(isValidPowerType(undefined)).toBe(false);
    });
  });

  describe('getPowerTypeDescription', () => {
    it('should return human-readable descriptions', () => {
      expect(getPowerTypeDescription('hardwired')).toBe('Hardwired / AC / Dual Power');
      expect(getPowerTypeDescription('battery')).toBe('Battery Powered');
      expect(getPowerTypeDescription('sealed')).toBe('Sealed 10-Year Battery');
      expect(getPowerTypeDescription('unknown')).toBe('Unknown / Not Specified');
    });
  });

  describe('Real-world import scenarios', () => {
    it('should handle empty power type column', () => {
      const values = ['', null, undefined, '   '];
      values.forEach(val => {
        expect(normalizePowerType(val)).toBe('unknown');
      });
    });

    it('should handle mixed case and formatting', () => {
      const hardwiredVariants = [
        'HARDWIRED',
        'Hardwired',
        'hardwired',
        'Hard Wired',
        'hard-wired',
        '(Hardwired)',
        'AC Power',
        'Dual Power',
        'DU',
      ];
      
      hardwiredVariants.forEach(val => {
        expect(normalizePowerType(val)).toBe('hardwired');
      });
    });

    it('should handle battery variants', () => {
      const batteryVariants = [
        'Battery',
        'BATTERY',
        'Bat',
        '9V Battery',
        'AA Battery',
        'Battery Powered',
      ];
      
      batteryVariants.forEach(val => {
        expect(normalizePowerType(val)).toBe('battery');
      });
    });

    it('should handle sealed battery variants', () => {
      const sealedVariants = [
        'Sealed',
        'SEALED',
        '10yr',
        '10-year',
        '10 year',
        'Sealed Battery',
        '10-year integrated battery',
        '(10IB)',
      ];
      
      sealedVariants.forEach(val => {
        expect(normalizePowerType(val)).toBe('sealed');
      });
    });
  });
});
