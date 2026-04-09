/**
 * Deterministic Auto-Mapping for Import Columns
 * 
 * Normalizes headers and maps them to target fields using keyword matching.
 */

import { safeToLower, safeTrim } from "./safeStringHelpers";

export type ImportType = 'site' | 'fireAlarmDevices' | 'fireExtinguishers' | 'emergencyLights' | 'sprinklerDevices' | 'smokeAlarms';

export interface MappingRule {
  targetField: string;
  keywords: string[];
  priority: number; // Higher priority wins if multiple matches
}

/**
 * Normalize header: lowercase, trim, remove punctuation, collapse spaces
 */
export function normalizeHeader(header: string): string {
  const lower = safeToLower(header);
  const trimmed = safeTrim(lower);
  // Remove punctuation and collapse spaces
  const noPunctuation = trimmed.replace(/[^\w\s]/g, ' ');
  const collapsed = noPunctuation.replace(/\s+/g, ' ').trim();
  return collapsed;
}

/**
 * Mapping rules by import type
 */
export const MAPPING_RULES: Record<ImportType, MappingRule[]> = {
  site: [
    { targetField: 'siteName', keywords: ['site name', 'building name', 'property name', 'name'], priority: 10 },
    { targetField: 'address', keywords: ['address', 'street', 'location'], priority: 10 },
    { targetField: 'city', keywords: ['city', 'municipality'], priority: 10 },
    { targetField: 'clientName', keywords: ['client', 'customer', 'owner'], priority: 10 },
    { targetField: 'notes', keywords: ['notes', 'comments', 'remarks'], priority: 5 },
  ],
  fireAlarmDevices: [
    { targetField: 'deviceType', keywords: ['device type', 'type', 'device', 'asset type', 'category'], priority: 10 },
    { targetField: 'manufacturer', keywords: ['manufacturer', 'mfr', 'make', 'brand'], priority: 9 },
    { targetField: 'model', keywords: ['model', 'model number', 'model #'], priority: 9 },
    { targetField: 'serialNumber', keywords: ['serial', 'serial number', 'serial #', 's n', 'sn'], priority: 8 },
    { targetField: 'location', keywords: ['location', 'room', 'area', 'suite', 'unit', 'zone'], priority: 10 },
    { targetField: 'floor', keywords: ['floor', 'level', 'storey'], priority: 8 },
    { targetField: 'barcode', keywords: ['barcode', 'tag', 'asset tag', 'id'], priority: 7 },
    { targetField: 'notes', keywords: ['notes', 'comments', 'remarks', 'description'], priority: 5 },
  ],
  fireExtinguishers: [
    { targetField: 'location',      keywords: ['location', 'room', 'area', 'zone', 'suite', 'unit'], priority: 10 },
    { targetField: 'model',         keywords: ['type/size', 'type size', 'size', 'model', 'model number', 'model #'], priority: 9 },
    { targetField: 'serialNumber',  keywords: ['serial #', 'serial number', 'serial', 's n', 'sn'], priority: 8 },
    { targetField: 'mfgDate',       keywords: ['mfg date', 'mfg yr', 'mfg year', 'manufacture date', 'manufactured', 'mfg'], priority: 9 },
    { targetField: 'lastHST',       keywords: ['last hst', 'hst date', 'hst', 'hydrostatic', 'hydro'], priority: 9 },
    { targetField: 'last6yr',       keywords: ['last 6yr', 'last 6 yr', '6 year', '6yr', '6 yr service', '6 yr'], priority: 9 },
    { targetField: 'notes',         keywords: ['comments', 'notes', 'remarks', 'description'], priority: 5 },
    { targetField: 'deviceType',    keywords: ['device type', 'type', 'class', 'extinguisher type', 'asset type'], priority: 7 },
    { targetField: 'manufacturer',  keywords: ['manufacturer', 'mfr', 'make', 'brand'], priority: 7 },
    { targetField: 'floor',         keywords: ['floor', 'level', 'storey'], priority: 8 },
    { targetField: 'barcode',       keywords: ['barcode', 'tag', 'asset tag'], priority: 6 },
    { targetField: 'quantity',      keywords: ['qty', 'quantity', 'count', 'amount'], priority: 5 },
  ],
  emergencyLights: [
    { targetField: 'location',      keywords: ['location', 'room', 'area', 'unit #', 'unit number', 'unit', 'zone'], priority: 10 },
    { targetField: 'ladderHeight',  keywords: ['ladder height', 'ladder ht', 'ladder'], priority: 10 },
    { targetField: 'supplyVoltage', keywords: ['supply voltage', 'supply v', 'supply volt', 'voltage', 'supply'], priority: 10 },
    { targetField: 'modelWattage',  keywords: ['model wattage', 'wattage', 'watts', 'watt'], priority: 10 },
    { targetField: 'batteryYear',   keywords: ['battery year', 'battery yr', 'batt year', 'batt yr'], priority: 10 },
    { targetField: 'batterySize',   keywords: ['battery size', 'batt size', 'battery type'], priority: 10 },
    { targetField: 'batteryCount',  keywords: ['# of batteries', '# batteries', 'number of batteries', 'battery count', 'battery qty', 'batteries'], priority: 10 },
    { targetField: 'lampCount',     keywords: ['lamp count', '# of lamps', 'lamp qty', 'lamps', 'lamp'], priority: 10 },
    { targetField: 'notes',         keywords: ['comments', 'notes', 'remarks', 'description'], priority: 5 },
    { targetField: 'deviceType',    keywords: ['device type', 'type', 'unit type', 'light type', 'asset type'], priority: 7 },
    { targetField: 'floor',         keywords: ['floor', 'level', 'storey'], priority: 8 },
    { targetField: 'barcode',       keywords: ['barcode', 'tag', 'asset tag'], priority: 6 },
  ],
  sprinklerDevices: [
    { targetField: 'deviceType', keywords: ['device type', 'type', 'device', 'asset type', 'component'], priority: 10 },
    { targetField: 'manufacturer', keywords: ['manufacturer', 'mfr', 'make', 'brand'], priority: 9 },
    { targetField: 'model', keywords: ['model', 'model number', 'model #'], priority: 9 },
    { targetField: 'serialNumber', keywords: ['serial', 'serial number', 'serial #', 's n', 'sn'], priority: 8 },
    { targetField: 'location', keywords: ['location', 'room', 'area', 'suite', 'unit', 'zone'], priority: 10 },
    { targetField: 'floor', keywords: ['floor', 'level', 'storey'], priority: 8 },
    { targetField: 'notes', keywords: ['notes', 'comments', 'remarks', 'description'], priority: 5 },
  ],
  smokeAlarms: [
    { targetField: 'suiteNumber', keywords: ['suite', 'suite number', 'suite #', 'unit', 'unit number', 'unit #', 'apt', 'apartment', 'room'], priority: 10 },
    // Power-related fields (ordered by specificity)
    { targetField: 'powerType', keywords: ['power type', 'power source', 'power', 'battery', 'hardwired'], priority: 10 },
    // Model/Type field (for device codes like SA/CO-1)
    { targetField: 'model', keywords: ['type', 'model', 'model number', 'model #', 'device type', 'device model'], priority: 9 },
    // Other fields
    { targetField: 'location', keywords: ['location', 'room', 'area', 'position'], priority: 9 },
    { targetField: 'installDate', keywords: ['install date', 'installation date', 'installed', 'date installed', 'install', 'date', 'in service date'], priority: 9 },
    { targetField: 'manufacturer', keywords: ['manufacturer', 'mfr', 'make', 'brand'], priority: 7 },
    { targetField: 'notes', keywords: ['notes', 'comments', 'remarks', 'description'], priority: 5 },
  ],
};

/**
 * Auto-map headers to target fields using deterministic keyword matching
 */
export function autoMapColumns(
  headers: string[],
  importType: ImportType
): Record<string, string> {
  const rules = MAPPING_RULES[importType];
  const mapping: Record<string, string> = {};
  const usedHeaders = new Set<string>();

  // Normalize all headers, filtering out null/undefined
  const normalizedHeaders = headers
    .filter(h => h != null && h !== '') // Skip null, undefined, and empty strings
    .map(h => ({
      original: String(h), // Ensure it's a string
      normalized: normalizeHeader(String(h)),
    }));

  // Sort rules by priority (highest first)
  const sortedRules = [...rules].sort((a, b) => b.priority - a.priority);

  // For each rule, find the best matching header
  for (const rule of sortedRules) {
    let bestMatch: { original: string; score: number } | null = null;

    for (const { original, normalized } of normalizedHeaders) {
      // Skip if already used
      if (usedHeaders.has(original)) continue;

      // Check if any keyword matches
      for (const keyword of rule.keywords) {
        if (normalized.includes(keyword)) {
          // Score based on how well it matches
          // Exact match = 100, contains = 50
          const score = normalized === keyword ? 100 : 50;
          
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { original, score };
          }
        }
      }
    }

    // If we found a match, add it to mapping
    if (bestMatch) {
      mapping[rule.targetField] = bestMatch.original;
      usedHeaders.add(bestMatch.original);
    }
  }

  return mapping;
}

/**
 * Count how many fields were successfully mapped
 */
export function getMappingStats(
  mapping: Record<string, string>,
  importType: ImportType
): { mapped: number; total: number } {
  const rules = MAPPING_RULES[importType];
  const mapped = Object.keys(mapping).length;
  const total = rules.length;
  
  return { mapped, total };
}
