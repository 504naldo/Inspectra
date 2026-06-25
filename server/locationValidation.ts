/**
 * Location Validation Module
 * 
 * Enforces that all devices and deficiencies have valid locations
 * before generating Annual or Deficiency reports.
 */

export interface MissingLocationDevice {
  id: number;
  type: string;
  deviceType?: string;
  identification?: string;
}

export interface MissingLocationDeficiency {
  id: number;
  description: string;
  severity: string;
}

export interface LocationValidationResult {
  isValid: boolean;
  missingDevices: MissingLocationDevice[];
  missingDeficiencies: MissingLocationDeficiency[];
  totalMissing: number;
}

/**
 * Device-type classifiers for the Annual report's device tables.
 *
 * These are allow-lists, not a power-supply blocklist: a device only lands in a
 * table if its deviceType matches one of these category keywords. Power supplies,
 * control panels, and any other non-listed device type are excluded by omission —
 * they still drive the Power Supply / Emergency Power Supply checklist sections
 * (22.4 / 22.5), independent of these device tables.
 */
export function isFireAlarmDeviceType(deviceType: string | null | undefined): boolean {
  const t = deviceType?.toLowerCase() ?? '';
  return t.includes('smoke') || t.includes('heat') || t.includes('pull') || t.includes('horn') || t.includes('strobe');
}

export function isFireExtinguisherType(deviceType: string | null | undefined): boolean {
  return (deviceType?.toLowerCase() ?? '').includes('extinguisher');
}

export function isEmergencyLightType(deviceType: string | null | undefined): boolean {
  const t = deviceType?.toLowerCase() ?? '';
  return t.includes('emergency') || t.includes('exit');
}

/**
 * Validate that all Fire Alarm devices have locations
 */
export function validateFireAlarmDeviceLocations(
  devices: Array<{ id: number; deviceType: string; location: string | null; identification: string | null }>
): { isValid: boolean; missing: MissingLocationDevice[] } {
  const missing: MissingLocationDevice[] = [];
  
  for (const device of devices) {
    if (!device.location || device.location.trim() === '') {
      missing.push({
        id: device.id,
        type: 'Fire Alarm Device',
        deviceType: device.deviceType,
        identification: device.identification || undefined,
      });
    }
  }
  
  return {
    isValid: missing.length === 0,
    missing,
  };
}

/**
 * Validate that all Fire Extinguishers have locations
 */
export function validateFireExtinguisherLocations(
  extinguishers: Array<{ id: number; location: string | null; serialNumber: string | null }>
): { isValid: boolean; missing: MissingLocationDevice[] } {
  const missing: MissingLocationDevice[] = [];
  
  for (const extinguisher of extinguishers) {
    if (!extinguisher.location || extinguisher.location.trim() === '') {
      missing.push({
        id: extinguisher.id,
        type: 'Fire Extinguisher',
        identification: extinguisher.serialNumber || undefined,
      });
    }
  }
  
  return {
    isValid: missing.length === 0,
    missing,
  };
}

/**
 * Validate that all Emergency Lights have locations
 */
export function validateEmergencyLightLocations(
  lights: Array<{ id: number; location: string | null; identification: string | null }>
): { isValid: boolean; missing: MissingLocationDevice[] } {
  const missing: MissingLocationDevice[] = [];
  
  for (const light of lights) {
    if (!light.location || light.location.trim() === '') {
      missing.push({
        id: light.id,
        type: 'Emergency Light',
        identification: light.identification || undefined,
      });
    }
  }
  
  return {
    isValid: missing.length === 0,
    missing,
  };
}

/**
 * Validate that all deficiencies have locations
 */
export function validateDeficiencyLocations(
  deficiencies: Array<{ id: number; description: string; severity: string; location: string | null }>
): { isValid: boolean; missing: MissingLocationDeficiency[] } {
  const missing: MissingLocationDeficiency[] = [];
  
  for (const deficiency of deficiencies) {
    if (!deficiency.location || deficiency.location.trim() === '') {
      missing.push({
        id: deficiency.id,
        description: deficiency.description,
        severity: deficiency.severity,
      });
    }
  }
  
  return {
    isValid: missing.length === 0,
    missing,
  };
}

/**
 * Comprehensive location validation for Annual Inspection Report
 * Validates all devices across all systems
 */
export function validateAnnualReportLocations(data: {
  fireAlarmDevices: Array<{ id: number; deviceType: string; location: string | null; identification: string | null }>;
  fireExtinguishers: Array<{ id: number; location: string | null; serialNumber: string | null }>;
  emergencyLights: Array<{ id: number; location: string | null; identification: string | null }>;
}): LocationValidationResult {
  const fireAlarmValidation = validateFireAlarmDeviceLocations(data.fireAlarmDevices);
  const extinguisherValidation = validateFireExtinguisherLocations(data.fireExtinguishers);
  const lightsValidation = validateEmergencyLightLocations(data.emergencyLights);
  
  const allMissing = [
    ...fireAlarmValidation.missing,
    ...extinguisherValidation.missing,
    ...lightsValidation.missing,
  ];
  
  return {
    isValid: allMissing.length === 0,
    missingDevices: allMissing,
    missingDeficiencies: [],
    totalMissing: allMissing.length,
  };
}

/**
 * Comprehensive location validation for Deficiency Report
 * Validates deficiencies only
 * 
 * @param deficiencies - Array of deficiencies to validate
 * @param allowMissingLocations - If true, allows generation with missing locations (admin override)
 * @returns LocationValidationResult with validation status and missing items
 */
export function validateDeficiencyReportLocations(
  deficiencies: Array<{ id: number; description: string; severity: string; location: string | null }>,
  allowMissingLocations: boolean = false
): LocationValidationResult {
  const validation = validateDeficiencyLocations(deficiencies);
  
  // If override is enabled, always return valid but include missing items for warnings
  if (allowMissingLocations) {
    return {
      isValid: true, // Allow generation in override mode
      missingDevices: [],
      missingDeficiencies: validation.missing,
      totalMissing: validation.missing.length,
    };
  }
  
  // Default strict mode: block if any locations missing
  return {
    isValid: validation.isValid,
    missingDevices: [],
    missingDeficiencies: validation.missing,
    totalMissing: validation.missing.length,
  };
}
