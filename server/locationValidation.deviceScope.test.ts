import { describe, it, expect } from 'vitest';
import { isFireAlarmDeviceType, isFireExtinguisherType, isEmergencyLightType } from './locationValidation';

describe('Annual Report Device Scope - Power Supply Exclusion', () => {
  const powerSupplyTypes = [
    'Power Supply',
    'Battery Backup',
    'Control Panel',
    'Fire Alarm Control Unit',
  ];

  it('excludes power supply / control panel device types from the Fire Alarm device table', () => {
    for (const t of powerSupplyTypes) {
      expect(isFireAlarmDeviceType(t)).toBe(false);
    }
  });

  it('excludes power supply device types from the Fire Extinguisher device table', () => {
    for (const t of powerSupplyTypes) {
      expect(isFireExtinguisherType(t)).toBe(false);
    }
  });

  it('excludes power supply device types from the Emergency Light device table', () => {
    for (const t of powerSupplyTypes) {
      expect(isEmergencyLightType(t)).toBe(false);
    }
  });

  it('still recognizes genuine Fire Alarm device types', () => {
    expect(isFireAlarmDeviceType('Smoke Detector')).toBe(true);
    expect(isFireAlarmDeviceType('Heat Detector')).toBe(true);
    expect(isFireAlarmDeviceType('Manual Pull Station')).toBe(true);
    expect(isFireAlarmDeviceType('Horn/Strobe')).toBe(true);
  });

  it('still recognizes genuine Fire Extinguisher and Emergency Light types', () => {
    expect(isFireExtinguisherType('ABC Extinguisher')).toBe(true);
    expect(isEmergencyLightType('Exit Sign')).toBe(true);
    expect(isEmergencyLightType('Emergency Light')).toBe(true);
  });

  it('handles null/undefined deviceType without throwing', () => {
    expect(isFireAlarmDeviceType(null)).toBe(false);
    expect(isFireAlarmDeviceType(undefined)).toBe(false);
  });
});
