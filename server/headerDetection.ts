/**
 * Smart Header Row Detection for Excel Imports
 * 
 * Scans the first N rows to find the actual header row, which may not be row 0.
 */

import { safeToLower, safeTrim } from "./safeStringHelpers";

export interface HeaderDetectionResult {
  headerRowIndex: number;
  headers: string[];
  dataStartIndex: number;
}

/**
 * Detect header row by scanning for keyword matches
 * 
 * @param rows - Array of rows from Excel sheet (each row is an array of cell values)
 * @param importType - Type of import to determine which keywords to look for
 * @param maxScanRows - Maximum number of rows to scan (default: 30)
 * @returns Header detection result with row index and normalized headers
 */
export function detectHeaderRow(
  rows: any[][],
  importType: string,
  maxScanRows: number = 30
): HeaderDetectionResult {
  const keywords = getKeywordsForImportType(importType);
  const scanLimit = Math.min(rows.length, maxScanRows);
  
  let bestMatch: { index: number; score: number; headers: string[] } | null = null;
  
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    // Count how many cells in this row match our keywords
    let matchCount = 0;
    const normalizedRow: string[] = [];
    
    for (const cell of row) {
      if (cell == null || cell === '') {
        normalizedRow.push('');
        continue;
      }
      
      const cellStr = String(cell);
      const normalized = normalizeHeader(cellStr);
      normalizedRow.push(cellStr); // Keep original for mapping
      
      // Check if this cell contains any of our keywords
      for (const keyword of keywords) {
        if (normalized.includes(keyword)) {
          matchCount++;
          break; // Count each cell only once
        }
      }
    }
    
    // If we found at least 2 keyword matches, this might be our header row
    if (matchCount >= 2) {
      const score = matchCount;
      
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          index: i,
          score,
          headers: normalizedRow,
        };
      }
      
      // If we found a very strong match (4+ keywords), use it immediately
      if (matchCount >= 4) {
        break;
      }
    }
  }
  
  // If no header row found, default to row 0
  if (!bestMatch) {
    const firstRow = rows[0] || [];
    return {
      headerRowIndex: 0,
      headers: firstRow.map(cell => cell == null ? '' : String(cell)),
      dataStartIndex: 1,
    };
  }
  
  return {
    headerRowIndex: bestMatch.index,
    headers: bestMatch.headers,
    dataStartIndex: bestMatch.index + 1,
  };
}

/**
 * Normalize header for keyword matching
 */
function normalizeHeader(header: string): string {
  const lower = safeToLower(header);
  const trimmed = safeTrim(lower);
  // Remove punctuation and collapse spaces
  const noPunctuation = trimmed.replace(/[^\w\s]/g, ' ');
  const collapsed = noPunctuation.replace(/\s+/g, ' ').trim();
  return collapsed;
}

/**
 * Get keywords to look for based on import type
 */
function getKeywordsForImportType(importType: string): string[] {
  switch (importType) {
    case 'smokeAlarms':
      return [
        'suite',
        'unit',
        'apt',
        'apartment',
        'location',
        'install',
        'date',
        'manufacturer',
        'make',
        'model',
        'power',
        'battery',
        'type',
      ];
    
    case 'emergencyLights':
      return [
        'unit',
        'location',
        'ladder',
        'supply',
        'voltage',
        'wattage',
        'battery',
        'lamp',
        'passed',
        'comments',
        'type',
      ];

    case 'fireExtinguishers':
      return [
        'location',
        'serial',
        'type',
        'size',
        'mfg',
        'hst',
        'comments',
        'passed',
        'manufacturer',
      ];

    case 'fireAlarmDevices':
    case 'sprinklerDevices':
      return [
        'device',
        'type',
        'location',
        'manufacturer',
        'model',
        'serial',
        'barcode',
        'floor',
      ];
    
    case 'site':
      return [
        'site',
        'building',
        'name',
        'address',
        'city',
        'client',
        'customer',
      ];
    
    default:
      // Generic keywords
      return [
        'name',
        'type',
        'location',
        'date',
        'number',
      ];
  }
}

/**
 * Extract data rows starting from the detected header row
 */
export function extractDataRows(
  rows: any[][],
  headerRowIndex: number
): any[][] {
  const dataStartIndex = headerRowIndex + 1;
  return rows.slice(dataStartIndex);
}
