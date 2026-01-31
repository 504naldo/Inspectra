/**
 * Power Type Normalization for Smoke Alarm Imports
 * 
 * Translates real-world power type values from Excel into system enum values.
 */

import { safeToLower, safeTrim } from "./safeStringHelpers";

export type PowerType = 'hardwired' | 'battery' | 'sealed' | 'unknown';

/**
 * Normalize power type value from Excel import
 * 
 * @param rawValue - Raw cell value from Excel (string, number, or null)
 * @returns Normalized power type enum value
 */
export function normalizePowerType(rawValue: any): PowerType {
  // Handle null/undefined
  if (rawValue == null || rawValue === '') {
    return 'unknown';
  }
  
  // Convert to string and normalize
  const str = String(rawValue);
  const normalized = normalizeString(str);
  
  // Check for hardwired indicators
  if (
    normalized.includes('hard') ||
    normalized.includes('ac') ||
    normalized.includes('wired') ||
    normalized.includes('du') ||
    normalized.includes('dual')
  ) {
    return 'hardwired';
  }
  
  // Check for sealed battery indicators
  if (
    normalized.includes('sealed') ||
    normalized.includes('10yr') ||
    normalized.includes('10 yr') ||
    normalized.includes('10year') ||
    normalized.includes('10 year') ||
    normalized.includes('10ib') // Fire-Pro code for 10-year integrated battery
  ) {
    return 'sealed';
  }
  
  // Check for battery indicators
  if (
    normalized.includes('battery') ||
    normalized.includes('bat')
  ) {
    return 'battery';
  }
  
  // Default to unknown
  return 'unknown';
}

/**
 * Normalize string for comparison
 * - Convert to lowercase
 * - Trim whitespace
 * - Remove punctuation (/, (, ), -, etc.)
 * - Collapse multiple spaces
 */
function normalizeString(str: string): string {
  const lower = safeToLower(str);
  const trimmed = safeTrim(lower);
  // Remove punctuation but keep spaces
  const noPunctuation = trimmed.replace(/[^\w\s]/g, ' ');
  // Collapse multiple spaces
  const collapsed = noPunctuation.replace(/\s+/g, ' ').trim();
  return collapsed;
}

/**
 * Check if a power type value is valid (one of the enum values)
 */
export function isValidPowerType(value: any): value is PowerType {
  return ['hardwired', 'battery', 'sealed', 'unknown'].includes(value);
}

/**
 * Get a human-readable description of a power type
 */
export function getPowerTypeDescription(powerType: PowerType): string {
  switch (powerType) {
    case 'hardwired':
      return 'Hardwired / AC / Dual Power';
    case 'battery':
      return 'Battery Powered';
    case 'sealed':
      return 'Sealed 10-Year Battery';
    case 'unknown':
      return 'Unknown / Not Specified';
  }
}

/**
 * Get examples of values that would normalize to each power type
 */
export function getPowerTypeExamples(): Record<PowerType, string[]> {
  return {
    hardwired: ['Hardwired', 'AC', 'Wired', 'DU', 'Dual', '(DU) Dual battery / AC power'],
    battery: ['Battery', 'Bat', '9V Battery', 'AA Battery'],
    sealed: ['Sealed', '10yr', '10-year', '(10IB) 10 Year integrated battery'],
    unknown: ['', 'N/A', 'Unknown'],
  };
}

/**
 * Extract device model/code from a value that might contain smoke alarm codes
 * 
 * Examples:
 * - "SA/CO-1" -> "SA/CO-1"
 * - "hardwired SA-P" -> "SA-P"
 * - "battery" -> null
 * 
 * @param value - Raw value that might contain a device code
 * @returns Device code if found, null otherwise
 */
export function extractDeviceCode(value: any): string | null {
  if (!value) return null;
  
  const str = String(value).trim();
  
  // Pattern for smoke alarm codes (SA, CO, VP, P, DC, AC followed by - or /)
  const codePattern = /\b(SA|CO|VP|P|DC|AC)[-/][A-Z0-9]+\b/i;
  const match = str.match(codePattern);
  
  return match ? match[0] : null;
}
