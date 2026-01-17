/**
 * Deterministic template-based narrative generator for fire inspection deficiencies
 * Uses predefined templates based on device type, severity, and failure reason
 */

export interface NarrativeInput {
  deviceType: string;
  location: string;
  observedIssue: string;
  severity?: 'critical' | 'major' | 'minor';
  codeReference?: string;
  testOutcome?: string;
}

export interface NarrativeOutput {
  description: string;
  correctiveAction: string;
  customerExplanation: string;
}

/**
 * Validates required fields for narrative generation
 */
export function validateNarrativeInput(input: NarrativeInput): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  
  if (!input.location || input.location.trim() === '' || input.location === 'Unknown location') {
    missingFields.push('location');
  }
  
  if (!input.observedIssue || input.observedIssue.trim() === '') {
    missingFields.push('observed issue');
  }
  
  if (!input.deviceType || input.deviceType.trim() === '') {
    missingFields.push('device type');
  }
  
  return {
    valid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Determines severity level from observed issue keywords
 */
function inferSeverity(observedIssue: string, deviceType: string): 'critical' | 'major' | 'minor' {
  const issue = observedIssue.toLowerCase();
  const device = deviceType.toLowerCase();
  
  // Critical conditions
  if (
    issue.includes('no response') ||
    issue.includes('not functioning') ||
    issue.includes('failed test') ||
    issue.includes('inoperative') ||
    issue.includes('missing') ||
    issue.includes('disconnected') ||
    (device.includes('smoke') && issue.includes('fail'))
  ) {
    return 'critical';
  }
  
  // Major conditions
  if (
    issue.includes('delayed') ||
    issue.includes('weak signal') ||
    issue.includes('intermittent') ||
    issue.includes('overdue') ||
    issue.includes('expired') ||
    issue.includes('damaged') ||
    issue.includes('corroded')
  ) {
    return 'major';
  }
  
  // Default to minor
  return 'minor';
}

/**
 * Determines applicable standard based on device type and location context
 */
function getApplicableStandard(deviceType: string, codeReference?: string): string {
  if (codeReference) return codeReference;
  
  const device = deviceType.toLowerCase();
  
  if (device.includes('smoke') || device.includes('heat') || device.includes('pull') || 
      device.includes('horn') || device.includes('strobe') || device.includes('alarm')) {
    return 'CAN/ULC-S536';
  }
  
  if (device.includes('extinguisher')) {
    return 'NFPA 10';
  }
  
  if (device.includes('sprinkler')) {
    return 'NFPA 25';
  }
  
  if (device.includes('emergency') || device.includes('exit')) {
    return 'NFPA 101 / Vancouver Fire By-law';
  }
  
  return 'CAN/ULC-S536 / Vancouver Fire By-law';
}

/**
 * Generates technical description based on device type and issue
 */
function generateDescription(input: NarrativeInput, severity: string, standard: string): string {
  const { deviceType, location, observedIssue } = input;
  
  const severityPrefix = severity === 'critical' 
    ? 'Critical deficiency identified:'
    : severity === 'major'
    ? 'Major deficiency observed:'
    : 'Minor deficiency noted:';
  
  return `${severityPrefix} The ${deviceType} located at ${location} ${observedIssue.toLowerCase()}. ` +
    `This condition does not meet the requirements of ${standard}. ` +
    `During routine testing, the device exhibited non-compliant behavior that requires immediate attention to ensure life safety system integrity.`;
}

/**
 * Generates corrective action based on severity and device type
 */
function generateCorrectiveAction(input: NarrativeInput, severity: string): string {
  const { deviceType, observedIssue } = input;
  const issue = observedIssue.toLowerCase();
  const device = deviceType.toLowerCase();
  
  // Specific actions based on issue type
  if (issue.includes('battery') || issue.includes('power')) {
    return `Replace battery backup system in ${deviceType}. Test device operation after battery replacement to verify full functionality. Document test results and battery installation date.`;
  }
  
  if (issue.includes('missing') || issue.includes('disconnected')) {
    return `Install replacement ${deviceType} at the specified location. Ensure proper wiring and connection to the fire alarm control panel. Conduct functional testing to verify integration with the system.`;
  }
  
  if (issue.includes('failed test') || issue.includes('no response') || issue.includes('not functioning')) {
    return `Troubleshoot and repair ${deviceType}. If repair is not feasible, replace the device with an approved equivalent. Conduct comprehensive testing including sensitivity testing (if applicable) and verify proper operation.`;
  }
  
  if (issue.includes('overdue') || issue.includes('expired')) {
    return `Schedule and complete required maintenance for ${deviceType} in accordance with manufacturer specifications and applicable codes. Update maintenance records and apply service tag with completion date.`;
  }
  
  if (issue.includes('damaged') || issue.includes('corroded')) {
    return `Replace damaged ${deviceType} with new approved device. Inspect surrounding devices for similar conditions. Test replacement device to ensure proper operation and system integration.`;
  }
  
  // Generic action based on severity
  if (severity === 'critical') {
    return `Immediate repair or replacement of ${deviceType} required. Qualified fire alarm technician must troubleshoot, repair, or replace the device. Conduct full functional testing upon completion and provide documentation of corrective work.`;
  } else if (severity === 'major') {
    return `Schedule repair or replacement of ${deviceType} within 30 days. Qualified technician should inspect, diagnose root cause, and implement appropriate corrective measures. Verify proper operation through functional testing.`;
  } else {
    return `Address ${deviceType} deficiency during next scheduled maintenance visit. Technician should evaluate condition, perform necessary adjustments or repairs, and document corrective action taken.`;
  }
}

/**
 * Generates customer-friendly explanation
 */
function generateCustomerExplanation(input: NarrativeInput, severity: string): string {
  const { deviceType, location } = input;
  const device = deviceType.toLowerCase();
  
  let devicePurpose = 'fire protection device';
  if (device.includes('smoke')) {
    devicePurpose = 'smoke detector';
  } else if (device.includes('heat')) {
    devicePurpose = 'heat detector';
  } else if (device.includes('pull')) {
    devicePurpose = 'manual pull station';
  } else if (device.includes('extinguisher')) {
    devicePurpose = 'fire extinguisher';
  } else if (device.includes('emergency') || device.includes('exit')) {
    devicePurpose = 'emergency lighting unit';
  } else if (device.includes('sprinkler')) {
    devicePurpose = 'sprinkler system component';
  }
  
  const urgency = severity === 'critical'
    ? 'This is a critical safety issue that requires immediate attention.'
    : severity === 'major'
    ? 'This issue should be addressed promptly to maintain proper fire safety protection.'
    : 'This is a minor issue that should be corrected during routine maintenance.';
  
  return `The ${devicePurpose} at ${location} is not working properly. ${urgency} ` +
    `We recommend having a qualified technician repair or replace this device to ensure your fire protection system is fully operational and meets safety code requirements.`;
}

/**
 * Main narrative generation function
 */
export function generateNarrative(input: NarrativeInput): NarrativeOutput {
  // Validate input
  const validation = validateNarrativeInput(input);
  if (!validation.valid) {
    throw new Error(`Missing required fields: ${validation.missingFields.join(', ')}`);
  }
  
  // Infer severity if not provided
  const severity = input.severity || inferSeverity(input.observedIssue, input.deviceType);
  
  // Get applicable standard
  const standard = getApplicableStandard(input.deviceType, input.codeReference);
  
  // Generate narrative components
  const description = generateDescription(input, severity, standard);
  const correctiveAction = generateCorrectiveAction(input, severity);
  const customerExplanation = generateCustomerExplanation(input, severity);
  
  return {
    description,
    correctiveAction,
    customerExplanation
  };
}
