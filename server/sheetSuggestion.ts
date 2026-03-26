/**
 * Smart Sheet Suggestion for Import
 * 
 * Scores sheets based on header match against expected schema fields
 */

import { safeToLower } from "./safeStringHelpers";
import { ImportType, MAPPING_RULES } from "./autoMapper";
import { detectHeaderRow } from "./headerDetection";

export interface SheetScore {
  sheetName: string;
  score: number;
  matchedFields: string[];
}

/**
 * Score a sheet based on how well its headers match the expected fields
 */
export function scoreSheet(
  sheetName: string,
  headers: string[],
  importType: ImportType
): SheetScore {
  const rules = MAPPING_RULES[importType];
  let score = 0;
  const matchedFields: string[] = [];

  // Normalize headers
  const normalizedHeaders = headers.map(h => safeToLower(h));

  // Check each rule's keywords against headers
  for (const rule of rules) {
    for (const keyword of rule.keywords) {
      const keywordLower = safeToLower(keyword);
      
      // Check if any header contains this keyword
      const hasMatch = normalizedHeaders.some(h => h.includes(keywordLower));
      
      if (hasMatch) {
        // Add points based on priority
        score += rule.priority;
        matchedFields.push(rule.targetField);
        break; // Only count once per rule
      }
    }
  }

  // Bonus points for sheet name relevance
  const sheetNameLower = safeToLower(sheetName);
  const sheetNameBonus = getSheetNameBonus(sheetNameLower, importType);
  score += sheetNameBonus;

  return { sheetName, score, matchedFields };
}

/**
 * Get bonus points based on sheet name relevance to import type
 */
function getSheetNameBonus(sheetNameLower: string, importType: ImportType): number {
  // High-priority exact/contains matches — these are the canonical sheet names
  // for each import type and should always win over header-score noise.
  const priorityNames: Record<ImportType, string[]> = {
    site: [],
    fireAlarmDevices: ['individual device record', 'individual devices'],
    fireExtinguishers: ['fire extinguishers', 'extinguishers'],
    emergencyLights: ['emergency lighting', 'emergency lights'],
    sprinklerDevices: ['sprinkler devices'],
    smokeAlarms: ['smoke alarms', 'smoke alarm'],
  };

  for (const name of priorityNames[importType]) {
    if (sheetNameLower.includes(name)) {
      return 100; // High-priority match — always beats header-score noise
    }
  }

  // General bonus keywords (lower weight)
  const bonusKeywords: Record<ImportType, string[]> = {
    site: ['site', 'building', 'property', 'info', 'information'],
    fireAlarmDevices: [
      'fire alarm',
      'alarm',
      'heat',
      'detector',
      'device',
      'device record',
      'fire alarm device',
    ],
    fireExtinguishers: ['extinguisher', 'fire extinguisher'],
    emergencyLights: ['emergency', 'emergency light', 'exit', 'exit sign', 'lighting'],
    sprinklerDevices: ['sprinkler', 'sprinklers', 'fire sprinkler', 'suppression'],
    smokeAlarms: ['smoke detector', 'suite', 'unit', 'apartment'],
  };

  const keywords = bonusKeywords[importType];

  for (const keyword of keywords) {
    if (sheetNameLower.includes(keyword)) {
      // Higher bonus for more specific matches
      if (keyword.split(' ').length > 1) {
        return 20; // Multi-word match (more specific)
      }
      return 10; // Single-word match
    }
  }

  return 0;
}

/**
 * Get penalty points for sheet names that indicate non-device content
 */
function getExclusionPenalty(sheetNameLower: string): number {
  const exclusionKeywords = [
    'labour',
    'labor',
    'rate',
    'pricing',
    'price',
    'cost',
    'invoice',
    'summary',
    'notes',
    'legend',
    'instructions',
    'parts',
    'all parts',
    'backflow',
    'backflows',
  ];

  for (const keyword of exclusionKeywords) {
    if (sheetNameLower.includes(keyword)) {
      return -50; // Heavy penalty for exclusion keywords
    }
  }

  return 0;
}

/**
 * Suggest the best sheet for the given import type
 * Returns undefined if no good match found (score < threshold)
 */
export function suggestSheet(
  workbook: { SheetNames: string[]; Sheets: Record<string, any> },
  importType: ImportType,
  XLSX: any
): string | undefined {
  const scores: SheetScore[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    
    if (data.length === 0) continue;
    
    // Use smart header detection instead of assuming row 0
    const headerDetection = detectHeaderRow(data, importType, 30);
    const headers = headerDetection.headers;
    const sheetScore = scoreSheet(sheetName, headers, importType);
    
    // Apply exclusion penalty
    const sheetNameLower = safeToLower(sheetName);
    const penalty = getExclusionPenalty(sheetNameLower);
    sheetScore.score += penalty;
    
    scores.push(sheetScore);
  }

  // Sort by score (highest first)
  scores.sort((a, b) => b.score - a.score);

  // Return best match if score is above threshold
  const MIN_SCORE_THRESHOLD = 15;
  const bestMatch = scores[0];
  
  if (bestMatch && bestMatch.score >= MIN_SCORE_THRESHOLD) {
    return bestMatch.sheetName;
  }

  return undefined;
}
