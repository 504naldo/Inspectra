import { describe, it, expect } from 'vitest';
import {
  calculateSmokeAlarmExpiry,
  getExpiryStatusLabel,
  getExpiryStatusColor,
  formatExpiryDate,
} from '../shared/smokeAlarmExpiry';

describe('Smoke Alarm Expiry Calculation', () => {
  describe('calculateSmokeAlarmExpiry', () => {
    it('should return ok status for non-sealed power types', () => {
      const result = calculateSmokeAlarmExpiry(new Date('2020-01-01'), 'hardwired');
      expect(result.status).toBe('ok');
      expect(result.expiryDate).toBeNull();
      expect(result.daysRemaining).toBeNull();
    });

    it('should return unknown status when no install date provided', () => {
      const result = calculateSmokeAlarmExpiry(null, 'sealed');
      expect(result.status).toBe('unknown');
      expect(result.warningMessage).toBe('Install date required to calculate expiry');
    });

    it('should return unknown status for invalid install date', () => {
      const result = calculateSmokeAlarmExpiry('invalid-date', 'sealed');
      expect(result.status).toBe('unknown');
      expect(result.warningMessage).toBe('Invalid install date');
    });

    it('should calculate expired status for sealed battery past 10 years', () => {
      // Install date 11 years ago
      const installDate = new Date();
      installDate.setFullYear(installDate.getFullYear() - 11);
      
      const result = calculateSmokeAlarmExpiry(installDate, 'sealed');
      expect(result.status).toBe('expired');
      expect(result.daysRemaining).toBeLessThan(0);
      expect(result.warningMessage).toContain('Expired');
      expect(result.warningMessage).toContain('ago');
    });

    it('should calculate expiring_soon status for sealed battery within 1 year', () => {
      // Install date 9.5 years ago (6 months until expiry)
      const installDate = new Date();
      installDate.setFullYear(installDate.getFullYear() - 9);
      installDate.setMonth(installDate.getMonth() - 6);
      
      const result = calculateSmokeAlarmExpiry(installDate, 'sealed');
      expect(result.status).toBe('expiring_soon');
      expect(result.daysRemaining).toBeGreaterThan(0);
      expect(result.daysRemaining).toBeLessThan(365);
      expect(result.warningMessage).toContain('Expires in');
    });

    it('should calculate ok status for sealed battery with plenty of time', () => {
      // Install date 2 years ago (8 years until expiry)
      const installDate = new Date();
      installDate.setFullYear(installDate.getFullYear() - 2);
      
      const result = calculateSmokeAlarmExpiry(installDate, 'sealed');
      expect(result.status).toBe('ok');
      expect(result.daysRemaining).toBeGreaterThan(365);
      expect(result.warningMessage).toBeNull();
    });

    it('should calculate expiry date correctly (10 years from install)', () => {
      const installDate = new Date('2020-01-15');
      const result = calculateSmokeAlarmExpiry(installDate, 'sealed');
      
      expect(result.expiryDate).toEqual(new Date('2030-01-15'));
    });

    it('should handle string install dates', () => {
      const result = calculateSmokeAlarmExpiry('2020-01-15', 'sealed');
      expect(result.expiryDate).toEqual(new Date('2030-01-15'));
    });

    it('should use custom warning threshold', () => {
      // Install date 9 years ago (1 year until expiry)
      const installDate = new Date();
      installDate.setFullYear(installDate.getFullYear() - 9);
      
      // With default threshold (365 days), should be expiring_soon
      const result1 = calculateSmokeAlarmExpiry(installDate, 'sealed');
      expect(result1.status).toBe('expiring_soon');
      
      // With 30-day threshold, should be ok
      const result2 = calculateSmokeAlarmExpiry(installDate, 'sealed', 30);
      expect(result2.status).toBe('ok');
    });

    it('should show days for expiry within 30 days', () => {
      // Install date 9 years 11 months 15 days ago (15 days until expiry)
      const installDate = new Date();
      installDate.setFullYear(installDate.getFullYear() - 10);
      installDate.setDate(installDate.getDate() + 15);
      
      const result = calculateSmokeAlarmExpiry(installDate, 'sealed');
      expect(result.status).toBe('expiring_soon');
      expect(result.warningMessage).toContain('day');
    });

    it('should show months for expiry between 30 days and 1 year', () => {
      // Install date 9 years 6 months ago (6 months until expiry)
      const installDate = new Date();
      installDate.setFullYear(installDate.getFullYear() - 9);
      installDate.setMonth(installDate.getMonth() - 6);
      
      const result = calculateSmokeAlarmExpiry(installDate, 'sealed');
      expect(result.status).toBe('expiring_soon');
      expect(result.warningMessage).toContain('month');
    });
  });

  describe('getExpiryStatusLabel', () => {
    it('should return correct labels for each status', () => {
      expect(getExpiryStatusLabel('expired')).toBe('Expired');
      expect(getExpiryStatusLabel('expiring_soon')).toBe('Expiring Soon');
      expect(getExpiryStatusLabel('ok')).toBe('OK');
      expect(getExpiryStatusLabel('unknown')).toBe('Unknown');
    });
  });

  describe('getExpiryStatusColor', () => {
    it('should return correct colors for each status', () => {
      expect(getExpiryStatusColor('expired')).toBe('destructive');
      expect(getExpiryStatusColor('expiring_soon')).toBe('warning');
      expect(getExpiryStatusColor('ok')).toBe('success');
      expect(getExpiryStatusColor('unknown')).toBe('secondary');
    });
  });

  describe('formatExpiryDate', () => {
    it('should format dates correctly', () => {
      const date = new Date('2030-01-15');
      const formatted = formatExpiryDate(date);
      expect(formatted).toContain('2030');
      expect(formatted).toContain('Jan');
    });

    it('should return Unknown for null dates', () => {
      expect(formatExpiryDate(null)).toBe('Unknown');
    });
  });
});
