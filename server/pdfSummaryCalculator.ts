/**
 * PDF Summary Statistics Calculator
 * 
 * Calculates system coverage, inspection totals, deficiency breakdown,
 * and cost summary for embedding in Site Information page
 */

interface DeviceSummary {
  deviceType: string;
  total: number;
  passed: number;
  failed: number;
  na: number;
}

interface Deficiency {
  id: number;
  title: string;
  severity: string;
  status: string;
  estimatedCost?: number;
  systemCategory?: 'FIRE_ALARM' | 'SMOKE_ALARM' | 'FIRE_EXTINGUISHER' | 'EMERGENCY_LIGHTING' | 'SPRINKLER' | null;
}

interface InspectionResult {
  deviceId: number;
  deviceType: string;
  location?: string | null;
  result: string;
}

export interface SystemCoverage {
  fireAlarmSystem: boolean;
  sprinklerITM: boolean;
  fireExtinguishers: boolean;
  emergencyLighting: boolean;
  smokeAlarms: boolean;
}

export interface InspectionTotals {
  fireAlarmDevices: number;
  sprinklerComponents: number;
  smokeAlarms: number;
  fireExtinguishers: number;
  emergencyLights: number;
}

export interface DeficiencyBreakdown {
  total: number;
  critical: number;
  major: number;
  minor: number;
}

export interface CostSummary {
  labourSubtotal: number;
  materialsSubtotal: number;
  subtotal: number;
  tax: number;
  taxRate: number;
  grandTotal: number;
  byCategory?: {
    fireAlarm: number;
    sprinkler: number;
    extinguishers: number;
    emergencyLights: number;
    smokeAlarms: number;
  };
}

export interface PDFSummary {
  systemCoverage: SystemCoverage;
  inspectionTotals: InspectionTotals;
  deficiencyBreakdown: DeficiencyBreakdown;
  costSummary: CostSummary;
}

/**
 * Calculate system coverage based on device summaries and inspection results
 */
export function calculateSystemCoverage(
  deviceSummaries: DeviceSummary[],
  inspectionResults: InspectionResult[]
): SystemCoverage {
  const deviceTypes = deviceSummaries.map(d => d.deviceType.toLowerCase());
  const resultTypes = inspectionResults.map(r => r.deviceType.toLowerCase());
  const allTypes = [...deviceTypes, ...resultTypes];
  
  // Fire Alarm System: any fire alarm devices (excludes smoke alarms)
  const fireAlarmKeywords = ['smoke detector', 'heat detector', 'pull station', 'horn', 'strobe', 'panel', 'annunciator'];
  const hasFireAlarm = allTypes.some(type => 
    !type.includes('smoke alarm') && fireAlarmKeywords.some(kw => type.includes(kw))
  );
  
  // Sprinkler ITM: any sprinkler components
  const sprinklerKeywords = ['sprinkler', 'valve', 'riser', 'standpipe', 'hose', 'siamese'];
  const hasSprinkler = allTypes.some(type => 
    sprinklerKeywords.some(kw => type.includes(kw))
  );
  
  // Fire Extinguishers
  const hasExtinguishers = allTypes.some(type => 
    type.includes('extinguisher')
  );
  
  // Emergency Lighting
  const emergencyKeywords = ['emergency light', 'exit sign', 'egress'];
  const hasEmergencyLighting = allTypes.some(type => 
    emergencyKeywords.some(kw => type.includes(kw))
  );
  
  // Smoke Alarms (in-suite)
  const hasSmokeAlarms = allTypes.some(type => 
    type.includes('smoke alarm')
  );
  
  return {
    fireAlarmSystem: hasFireAlarm,
    sprinklerITM: hasSprinkler,
    fireExtinguishers: hasExtinguishers,
    emergencyLighting: hasEmergencyLighting,
    smokeAlarms: hasSmokeAlarms,
  };
}

/**
 * Calculate inspection totals by category
 */
export function calculateInspectionTotals(
  deviceSummaries: DeviceSummary[]
): InspectionTotals {
  let fireAlarmDevices = 0;
  let sprinklerComponents = 0;
  let smokeAlarms = 0;
  let fireExtinguishers = 0;
  let emergencyLights = 0;
  
  deviceSummaries.forEach(summary => {
    const type = summary.deviceType.toLowerCase();
    
    // Smoke Alarms (check first to exclude from fire alarm devices)
    if (type.includes('smoke alarm')) {
      smokeAlarms += summary.total;
      return; // Skip other categories
    }
    
    // Fire Alarm Devices (system devices only, excludes smoke alarms)
    const fireAlarmKeywords = ['smoke detector', 'heat detector', 'pull station', 'horn', 'strobe', 'panel', 'annunciator'];
    if (fireAlarmKeywords.some(kw => type.includes(kw))) {
      fireAlarmDevices += summary.total;
    }
    
    // Sprinkler Components
    const sprinklerKeywords = ['sprinkler', 'valve', 'riser', 'standpipe', 'hose', 'siamese'];
    if (sprinklerKeywords.some(kw => type.includes(kw))) {
      sprinklerComponents += summary.total;
    }
    
    // Fire Extinguishers
    if (type.includes('extinguisher')) {
      fireExtinguishers += summary.total;
    }
    
    // Emergency Lights
    const emergencyKeywords = ['emergency light', 'exit sign', 'egress'];
    if (emergencyKeywords.some(kw => type.includes(kw))) {
      emergencyLights += summary.total;
    }
  });
  
  return {
    fireAlarmDevices,
    sprinklerComponents,
    smokeAlarms,
    fireExtinguishers,
    emergencyLights,
  };
}

/**
 * Calculate deficiency breakdown by severity
 */
export function calculateDeficiencyBreakdown(
  deficiencies: Deficiency[]
): DeficiencyBreakdown {
  const openDeficiencies = deficiencies.filter(d => d.status !== 'RESOLVED' && d.status !== 'CLOSED');
  
  return {
    total: openDeficiencies.length,
    critical: openDeficiencies.filter(d => d.severity === 'CRITICAL').length,
    major: openDeficiencies.filter(d => d.severity === 'MAJOR').length,
    minor: openDeficiencies.filter(d => d.severity === 'MINOR').length,
  };
}

/**
 * Calculate cost summary from deficiencies
 */
export function calculateCostSummary(
  deficiencies: Deficiency[],
  taxRate: number = 0.12 // Default 12% tax (BC HST)
): CostSummary {
  const openDeficiencies = deficiencies.filter(d => d.status !== 'RESOLVED' && d.status !== 'CLOSED');
  
  // For now, assume 60% labour, 40% materials split
  // In future, this should come from actual pricing breakdown
  const totalCost = openDeficiencies.reduce((sum, d) => sum + (d.estimatedCost || 0), 0);
  const labourSubtotal = totalCost * 0.6;
  const materialsSubtotal = totalCost * 0.4;
  const subtotal = labourSubtotal + materialsSubtotal;
  const tax = subtotal * taxRate;
  const grandTotal = subtotal + tax;
  
  // Calculate by category
  const byCategory = {
    fireAlarm: openDeficiencies
      .filter(d => d.systemCategory === 'FIRE_ALARM')
      .reduce((sum, d) => sum + (d.estimatedCost || 0), 0),
    sprinkler: openDeficiencies
      .filter(d => d.systemCategory === 'SPRINKLER')
      .reduce((sum, d) => sum + (d.estimatedCost || 0), 0),
    extinguishers: openDeficiencies
      .filter(d => d.systemCategory === 'FIRE_EXTINGUISHER')
      .reduce((sum, d) => sum + (d.estimatedCost || 0), 0),
    emergencyLights: openDeficiencies
      .filter(d => d.systemCategory === 'EMERGENCY_LIGHTING')
      .reduce((sum, d) => sum + (d.estimatedCost || 0), 0),
    smokeAlarms: openDeficiencies
      .filter(d => d.systemCategory === 'SMOKE_ALARM')
      .reduce((sum, d) => sum + (d.estimatedCost || 0), 0),
  };
  
  return {
    labourSubtotal,
    materialsSubtotal,
    subtotal,
    tax,
    taxRate,
    grandTotal,
    byCategory,
  };
}

/**
 * Calculate complete PDF summary
 */
export function calculatePDFSummary(
  deviceSummaries: DeviceSummary[],
  inspectionResults: InspectionResult[],
  deficiencies: Deficiency[],
  taxRate?: number
): PDFSummary {
  return {
    systemCoverage: calculateSystemCoverage(deviceSummaries, inspectionResults),
    inspectionTotals: calculateInspectionTotals(deviceSummaries),
    deficiencyBreakdown: calculateDeficiencyBreakdown(deficiencies),
    costSummary: calculateCostSummary(deficiencies, taxRate),
  };
}
