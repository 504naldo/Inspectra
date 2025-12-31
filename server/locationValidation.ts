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
 */
export function validateDeficiencyReportLocations(
  deficiencies: Array<{ id: number; description: string; severity: string; location: string | null }>
): LocationValidationResult {
  const validation = validateDeficiencyLocations(deficiencies);
  
  return {
    isValid: validation.isValid,
    missingDevices: [],
    missingDeficiencies: validation.missing,
    totalMissing: validation.missing.length,
  };
}
