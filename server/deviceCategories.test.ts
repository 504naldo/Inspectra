import { describe, it, expect } from 'vitest';
import { categorizeDevice, isSmokeAlarm, isFireAlarmGridDevice } from '../shared/deviceCategories';

describe('isFireAlarmGridDevice (grid = pull stations, heat detectors, horns, strobes)', () => {
  const fa = (deviceType: string, category: string | null = 'FIRE_ALARM_DEVICE') =>
    ({ deviceType, category, model: null, description: null });

  it('includes pull stations, heat detectors, horns, strobes, and horn/strobe combos', () => {
    expect(isFireAlarmGridDevice(fa('Pull Station'))).toBe(true);
    expect(isFireAlarmGridDevice(fa('Heat Detector'))).toBe(true);
    expect(isFireAlarmGridDevice(fa('Horn'))).toBe(true);
    expect(isFireAlarmGridDevice(fa('Strobe'))).toBe(true);
    expect(isFireAlarmGridDevice(fa('Horn/Strobe'))).toBe(true);
  });

  it('excludes smoke detectors and other fire-alarm device types', () => {
    expect(isFireAlarmGridDevice(fa('Smoke Detector'))).toBe(false);
    expect(isFireAlarmGridDevice(fa('Duct Detector'))).toBe(false);
    expect(isFireAlarmGridDevice(fa('Control Module'))).toBe(false);
    expect(isFireAlarmGridDevice(fa('Flow Switch'))).toBe(false);
    expect(isFireAlarmGridDevice(fa('Unknown'))).toBe(false);
  });

  it('excludes devices from other categories even if the type keyword matches', () => {
    // An extinguisher/emergency/smoke device never belongs in the fire-alarm grid
    expect(isFireAlarmGridDevice({ deviceType: 'Heat', category: 'FIRE_EXTINGUISHER', model: null, description: null })).toBe(false);
    expect(isFireAlarmGridDevice({ deviceType: 'Smoke Detector', category: 'SMOKE_ALARM', model: null, description: null })).toBe(false);
  });
});

describe('Device Categorization', () => {
  it('should categorize fire extinguishers by category field', () => {
    const device = {
      category: 'FIRE_EXTINGUISHER',
      deviceType: 'ABC 10lb',
      model: null,
      description: null,
    };

    const result = categorizeDevice(device);
    expect(result).toBe('extinguisher');
  });

  it('should categorize emergency lights by category field', () => {
    const device = {
      category: 'EMERGENCY_LIGHT',
      deviceType: 'Emergency Light LED',
      model: null,
      description: null,
    };

    const result = categorizeDevice(device);
    expect(result).toBe('emergency');
  });

  it('should categorize fire alarm devices by category field', () => {
    const device = {
      category: 'FIRE_ALARM_DEVICE',
      deviceType: 'Smoke Detector',
      model: null,
      description: null,
    };

    const result = categorizeDevice(device);
    expect(result).toBe('fire_alarm');
  });

  it('should categorize smoke alarms by category field', () => {
    const device = {
      category: 'SMOKE_ALARM',
      deviceType: 'Smoke Detector',
      model: null,
      description: null,
    };

    const result = categorizeDevice(device);
    expect(result).toBe('smoke');
  });

  it('should fallback to deviceType matching for extinguishers', () => {
    const device = {
      category: null,
      deviceType: 'Fire Extinguisher ABC',
      model: null,
      description: null,
    };

    const result = categorizeDevice(device);
    expect(result).toBe('extinguisher');
  });

  it('should fallback to deviceType matching for emergency lights', () => {
    const device = {
      category: null,
      deviceType: 'Emergency Exit Sign',
      model: null,
      description: null,
    };

    const result = categorizeDevice(device);
    expect(result).toBe('emergency');
  });

  it('should identify smoke alarms correctly', () => {
    const device = {
      category: 'SMOKE_ALARM',
      deviceType: 'Smoke Detector',
      model: null,
      description: null,
    };

    expect(isSmokeAlarm(device)).toBe(true);
  });

  it('should not identify extinguishers as smoke alarms', () => {
    const device = {
      category: 'FIRE_EXTINGUISHER',
      deviceType: 'Fire Extinguisher',
      model: null,
      description: null,
    };

    expect(isSmokeAlarm(device)).toBe(false);
  });

  it('should handle null category gracefully', () => {
    const device = {
      category: null,
      deviceType: null,
      model: null,
      description: null,
    };

    const result = categorizeDevice(device);
    expect(result).toBe('other');
  });
});
