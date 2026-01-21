/**
 * Auto-mapping utility for Excel import column mapping
 * Uses fuzzy matching with synonyms to automatically map Excel columns to device fields
 */

export interface FieldDefinition {
  key: string;
  label: string;
  required: boolean;
}

export interface AutoMappingResult {
  mapping: Record<string, string>; // { fieldKey: excelColumnName }
  confidence: Record<string, number>; // { fieldKey: confidenceScore }
  totalMapped: number;
  totalFields: number;
}

/**
 * Normalize a string for comparison: lowercase, trim, remove punctuation
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Field synonyms mapping
 * Key: target field key
 * Value: array of possible column names (will be normalized during matching)
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  deviceType: [
    'device type',
    'device',
    'type',
    'category',
    'device category',
    'equipment type',
    'asset type',
  ],
  manufacturer: [
    'manufacturer',
    'mfr',
    'make',
    'brand',
    'mfg',
    'maker',
  ],
  model: [
    'model',
    'model #',
    'model number',
    'model no',
    'product model',
  ],
  serialNumber: [
    'serial',
    'serial #',
    'serial number',
    'serial no',
    's/n',
    'sn',
    'serial num',
  ],
  location: [
    'location',
    'area',
    'room',
    'suite',
    'floor',
    'zone',
    'position',
    'place',
    'device location',
  ],
  barcode: [
    'barcode',
    'tag',
    'asset tag',
    'tag #',
    'tag number',
    'id',
    'asset id',
  ],
  notes: [
    'notes',
    'comments',
    'remarks',
    'description',
    'note',
    'comment',
    'remark',
    'details',
  ],
  installDate: [
    'install date',
    'installation date',
    'date installed',
    'installed',
    'install',
    'date',
  ],
  lastInspectionDate: [
    'last inspection',
    'last inspected',
    'inspection date',
    'inspected',
    'last service',
  ],
  status: [
    'status',
    'condition',
    'state',
    'device status',
  ],
};

/**
 * Calculate similarity score between two normalized strings
 * Returns 0-100 score
 */
function calculateSimilarity(str1: string, str2: string): number {
  const norm1 = normalize(str1);
  const norm2 = normalize(str2);
  
  // Exact match
  if (norm1 === norm2) return 100;
  
  // Contains match
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 80;
  
  // Word overlap
  const words1 = norm1.split(' ');
  const words2 = norm2.split(' ');
  const commonWords = words1.filter(w => words2.includes(w));
  
  if (commonWords.length > 0) {
    const overlapRatio = commonWords.length / Math.max(words1.length, words2.length);
    return Math.floor(overlapRatio * 60);
  }
  
  // Levenshtein distance for fuzzy matching
  const distance = levenshteinDistance(norm1, norm2);
  const maxLen = Math.max(norm1.length, norm2.length);
  const similarity = (1 - distance / maxLen) * 50;
  
  return Math.floor(Math.max(0, similarity));
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Auto-map Excel columns to device fields
 * @param excelHeaders Array of column names from Excel file
 * @param fields Array of target field definitions
 * @param minConfidence Minimum confidence score (0-100) to accept a mapping
 * @returns AutoMappingResult with mapping and confidence scores
 */
export function autoMapColumns(
  excelHeaders: string[],
  fields: FieldDefinition[],
  minConfidence: number = 60
): AutoMappingResult {
  const mapping: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const usedHeaders = new Set<string>();
  
  // For each field, find the best matching Excel column
  for (const field of fields) {
    const synonyms = FIELD_SYNONYMS[field.key] || [field.label];
    let bestMatch: { header: string; score: number } | null = null;
    
    for (const excelHeader of excelHeaders) {
      // Skip if this header is already used
      if (usedHeaders.has(excelHeader)) continue;
      
      // Calculate best score against all synonyms
      let maxScore = 0;
      for (const synonym of synonyms) {
        const score = calculateSimilarity(excelHeader, synonym);
        maxScore = Math.max(maxScore, score);
      }
      
      // Update best match if this is better
      if (maxScore > (bestMatch?.score || 0)) {
        bestMatch = { header: excelHeader, score: maxScore };
      }
    }
    
    // Accept mapping if confidence is above threshold
    if (bestMatch && bestMatch.score >= minConfidence) {
      mapping[field.key] = bestMatch.header;
      confidence[field.key] = bestMatch.score;
      usedHeaders.add(bestMatch.header);
    }
  }
  
  return {
    mapping,
    confidence,
    totalMapped: Object.keys(mapping).length,
    totalFields: fields.length,
  };
}
