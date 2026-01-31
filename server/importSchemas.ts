/**
 * Category-Specific Import Schemas
 * 
 * Defines required fields and validation rules for each import type
 */

import { ImportType } from "./autoMapper";
import { normalizePowerType, isValidPowerType, extractDeviceCode } from "./powerTypeNormalization";

export interface ImportSchema {
  requiredFields: string[];
  optionalFields: string[];
  category?: 'FIRE_ALARM_DEVICE' | 'FIRE_EXTINGUISHER' | 'EMERGENCY_LIGHT' | 'SPRINKLER' | 'SMOKE_ALARM';
  validateRow: (row: Record<string, any>) => { valid: boolean; errors: string[] };
}

/**
 * Site import schema
 */
const siteSchema: ImportSchema = {
  requiredFields: ['siteName'],
  optionalFields: ['address', 'city', 'clientName', 'notes'],
  validateRow: (row) => {
    const errors: string[] = [];
    
    if (!row.siteName || String(row.siteName).trim() === '') {
      errors.push('Site name is required');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

/**
 * Fire Alarm Devices import schema
 */
const fireAlarmDevicesSchema: ImportSchema = {
  requiredFields: [], // At least deviceType OR (model + manufacturer)
  optionalFields: ['deviceType', 'manufacturer', 'model', 'serialNumber', 'barcode', 'location', 'floor', 'notes'],
  category: 'FIRE_ALARM_DEVICE',
  validateRow: (row) => {
    const errors: string[] = [];
    
    const hasDeviceType = row.deviceType && String(row.deviceType).trim() !== '';
    const hasModel = row.model && String(row.model).trim() !== '';
    const hasManufacturer = row.manufacturer && String(row.manufacturer).trim() !== '';
    
    // Must have deviceType OR (model + manufacturer)
    if (!hasDeviceType && !(hasModel && hasManufacturer)) {
      errors.push('Must have deviceType OR (model + manufacturer)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

/**
 * Fire Extinguishers import schema
 */
const fireExtinguishersSchema: ImportSchema = {
  requiredFields: ['deviceType'],
  optionalFields: ['location', 'floor', 'serialNumber', 'barcode', 'notes', 'manufacturer', 'model', 'quantity'],
  category: 'FIRE_EXTINGUISHER',
  validateRow: (row) => {
    const errors: string[] = [];
    
    if (!row.deviceType || String(row.deviceType).trim() === '') {
      errors.push('Device type is required (e.g., ABC, CO2, K)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

/**
 * Emergency Lights import schema
 */
const emergencyLightsSchema: ImportSchema = {
  requiredFields: ['deviceType'],
  optionalFields: ['location', 'floor', 'barcode', 'notes', 'manufacturer', 'model'],
  category: 'EMERGENCY_LIGHT',
  validateRow: (row) => {
    const errors: string[] = [];
    
    if (!row.deviceType || String(row.deviceType).trim() === '') {
      errors.push('Device type is required (e.g., battery unit, exit sign, combo)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

/**
 * Sprinkler Devices import schema
 */
const sprinklerDevicesSchema: ImportSchema = {
  requiredFields: ['deviceType'],
  optionalFields: ['location', 'floor', 'notes', 'manufacturer', 'model', 'serialNumber'],
  category: 'SPRINKLER',
  validateRow: (row) => {
    const errors: string[] = [];
    
    if (!row.deviceType || String(row.deviceType).trim() === '') {
      errors.push('Device type is required (e.g., valve, switch, gauge, test connection)');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

/**
 * Smoke Alarms import schema
 */
const smokeAlarmsSchema: ImportSchema = {
  requiredFields: ['suiteNumber'],
  optionalFields: ['location', 'powerType', 'installDate', 'manufacturer', 'model', 'notes'],
  category: 'SMOKE_ALARM',
  validateRow: (row) => {
    const errors: string[] = [];
    
    // Normalize suite number: strip leading # (e.g., #0816 → 0816)
    if (row.suiteNumber) {
      const suiteStr = String(row.suiteNumber).trim();
      if (suiteStr.startsWith('#')) {
        row.suiteNumber = suiteStr.substring(1);
      }
    }
    
    if (!row.suiteNumber || String(row.suiteNumber).trim() === '') {
      errors.push('Suite number is required');
    }
    
    // Extract device code if present (e.g., SA/CO-1, SA-P)
    const deviceCode = extractDeviceCode(row.powerType);
    if (deviceCode && !row.model) {
      // If powerType contains a device code and model is empty, move it to model
      row.model = deviceCode;
    }
    
    // Normalize power type before validation
    if (row.powerType) {
      const originalValue = row.powerType;
      const normalized = normalizePowerType(originalValue);
      
      // Replace with normalized value
      row.powerType = normalized;
      
      // Validation should always pass now since normalization guarantees valid enum
      if (!isValidPowerType(normalized)) {
        errors.push(`Unrecognized power type value: "${originalValue}"`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};

/**
 * Get schema for import type
 */
export function getImportSchema(importType: ImportType): ImportSchema {
  const schemas: Record<ImportType, ImportSchema> = {
    site: siteSchema,
    fireAlarmDevices: fireAlarmDevicesSchema,
    fireExtinguishers: fireExtinguishersSchema,
    emergencyLights: emergencyLightsSchema,
    sprinklerDevices: sprinklerDevicesSchema,
    smokeAlarms: smokeAlarmsSchema,
  };
  
  return schemas[importType];
}

/**
 * Check if a row should be skipped (heading/note row or pricing table)
 */
export function shouldSkipRow(row: any[], headers: string[]): boolean {
  // Skip if all cells are empty
  const allEmpty = row.every(cell => !cell || String(cell).trim() === '');
  if (allEmpty) return true;
  
  // Skip if only one cell is filled and it's short (likely a heading)
  const filledCells = row.filter(cell => cell && String(cell).trim() !== '');
  if (filledCells.length === 1 && String(filledCells[0]).length < 50) {
    return true;
  }
  
  // Skip if it looks like a pricing table (has "rate", "price", "cost", etc.)
  const firstCell = String(row[0] || '').toLowerCase();
  const pricingKeywords = ['rate', 'price', 'cost', 'labour', 'labor', 'all parts', 'parts'];
  if (pricingKeywords.some(kw => firstCell.includes(kw))) {
    return true;
  }
  
  // Skip if less than 2 meaningful columns are present
  if (filledCells.length < 2) {
    return true;
  }
  
  return false;
}
