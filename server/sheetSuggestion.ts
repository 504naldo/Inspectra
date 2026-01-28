/**
 * Smart Sheet Suggestion for Import
 * 
 * Scores sheets based on header match against expected schema fields
 */

import { safeToLower } from "./safeStringHelpers";
import { ImportType, MAPPING_RULES } from "./autoMapper";

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
  const bonusKeywords: Record<ImportType, string[]> = {
    site: ['site', 'building', 'property', 'info', 'information'],
    fireAlarmDevices: [
      'fire alarm',
      'alarm',
      'smoke',
      'heat',
      'detector',
      'device',
      'individual device',
      'device record',
      'fire alarm device',
    ],
    fireExtinguishers: ['extinguisher', 'fire extinguisher', 'extinguishers'],
    emergencyLights: ['emergency', 'emergency light', 'exit', 'exit sign', 'lighting'],
    sprinklerDevices: ['sprinkler', 'sprinklers', 'fire sprinkler', 'suppression'],
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
    
    const headers = (data[0] as any[]).map(h => String(h || ''));
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
