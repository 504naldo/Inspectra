/**
 * Deterministic Auto-Mapping for Import Columns
 * 
 * Normalizes headers and maps them to target fields using keyword matching.
 */

import { safeToLower, safeTrim } from "./safeStringHelpers";

export type ImportType = 'site' | 'fireAlarmDevices' | 'fireExtinguishers' | 'emergencyLights' | 'sprinklerDevices';

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
    { targetField: 'deviceType', keywords: ['device type', 'type', 'device', 'asset type', 'extinguisher type', 'class'], priority: 10 },
    { targetField: 'manufacturer', keywords: ['manufacturer', 'mfr', 'make', 'brand'], priority: 9 },
    { targetField: 'model', keywords: ['model', 'model number', 'model #'], priority: 9 },
    { targetField: 'serialNumber', keywords: ['serial', 'serial number', 'serial #', 's n', 'sn'], priority: 8 },
    { targetField: 'location', keywords: ['location', 'room', 'area', 'suite', 'unit', 'zone'], priority: 10 },
    { targetField: 'floor', keywords: ['floor', 'level', 'storey'], priority: 8 },
    { targetField: 'barcode', keywords: ['barcode', 'tag', 'asset tag', 'id'], priority: 7 },
    { targetField: 'notes', keywords: ['notes', 'comments', 'remarks', 'description'], priority: 5 },
    { targetField: 'quantity', keywords: ['qty', 'quantity', 'count'], priority: 6 },
  ],
  emergencyLights: [
    { targetField: 'deviceType', keywords: ['device type', 'type', 'device', 'asset type', 'light type', 'unit type'], priority: 10 },
    { targetField: 'manufacturer', keywords: ['manufacturer', 'mfr', 'make', 'brand'], priority: 9 },
    { targetField: 'model', keywords: ['model', 'model number', 'model #'], priority: 9 },
    { targetField: 'serialNumber', keywords: ['serial', 'serial number', 'serial #', 's n', 'sn'], priority: 8 },
    { targetField: 'location', keywords: ['location', 'room', 'area', 'suite', 'unit', 'zone'], priority: 10 },
    { targetField: 'floor', keywords: ['floor', 'level', 'storey'], priority: 8 },
    { targetField: 'barcode', keywords: ['barcode', 'tag', 'asset tag', 'id'], priority: 7 },
    { targetField: 'notes', keywords: ['notes', 'comments', 'remarks', 'description'], priority: 5 },
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

  // Normalize all headers
  const normalizedHeaders = headers.map(h => ({
    original: h,
    normalized: normalizeHeader(h),
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
