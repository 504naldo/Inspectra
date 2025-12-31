/**
 * System Category Auto-Detection Helper
 * 
 * Provides keyword-based categorization for deficiencies based on title and description.
 * Does NOT override manual categories - only suggests when category is not set.
 */

export type SystemCategory = 'FIRE_ALARM' | 'FIRE_EXTINGUISHER' | 'EMERGENCY_LIGHTING' | 'SPRINKLER';

// Keyword patterns for each category (case-insensitive)
const CATEGORY_KEYWORDS: Record<SystemCategory, string[]> = {
  SPRINKLER: [
    'sprinkler',
    'sprinkler head',
    'heads',
    'spare heads',
    'fdc',
    'fire department connection',
    'standpipe',
    'siamese',
    'siamese connection',
    'hydrostatic',
    'hydrostatic test',
    'riser',
    'riser room',
    'zone valve',
    'flow switch',
    'tamper',
    'tamper switch',
    'backflow',
    'backflow preventer',
    'sprinkler room',
    'dry system',
    'wet system',
    'antifreeze',
    'alarm valve',
    'deluge',
    'pre-action',
    'end-of-line',
    'eol test',
    'water supply',
    'main drain',
  ],
  FIRE_ALARM: [
    'fire alarm',
    'smoke detector',
    'smoke alarm',
    'heat detector',
    'pull station',
    'manual pull',
    'horn',
    'strobe',
    'horn/strobe',
    'notification device',
    'control panel',
    'facp',
    'fire alarm control panel',
    'annunciator',
    'duct detector',
    'beam detector',
    'addressable',
    'conventional',
    'initiating device',
    'zone',
    'fire alarm system',
  ],
  FIRE_EXTINGUISHER: [
    'fire extinguisher',
    'extinguisher',
    'portable extinguisher',
    'abc extinguisher',
    'co2 extinguisher',
    'k class',
    'extinguisher tag',
    'extinguisher inspection',
    'extinguisher mount',
    'extinguisher cabinet',
  ],
  EMERGENCY_LIGHTING: [
    'emergency light',
    'emergency lighting',
    'exit sign',
    'exit light',
    'egress lighting',
    'battery backup',
    'emergency battery',
    'exit path',
    'illuminated exit',
    'emergency illumination',
  ],
};

/**
 * Detect system category based on keywords in title and description
 * Returns suggested category or null if no clear match
 */
export function detectSystemCategory(title: string, description?: string | null): SystemCategory | null {
  const searchText = `${title} ${description || ''}`.toLowerCase();
  
  // Check each category for keyword matches
  const categoryScores: Record<SystemCategory, number> = {
    SPRINKLER: 0,
    FIRE_ALARM: 0,
    FIRE_EXTINGUISHER: 0,
    EMERGENCY_LIGHTING: 0,
  };
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [SystemCategory, string[]][]) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        categoryScores[category]++;
      }
    }
  }
  
  // Find category with highest score
  const maxScore = Math.max(...Object.values(categoryScores));
  
  // Only return a category if we have at least one keyword match
  if (maxScore === 0) {
    return null;
  }
  
  // Return the category with the highest score
  const detectedCategory = (Object.keys(categoryScores) as SystemCategory[]).find(
    (cat) => categoryScores[cat] === maxScore
  );
  
  return detectedCategory || null;
}

/**
 * Get or suggest system category for a deficiency
 * If manual category is set, always use it
 * Otherwise, attempt auto-detection
 */
export function getSystemCategory(
  manualCategory: SystemCategory | null | undefined,
  title: string,
  description?: string | null
): SystemCategory | null {
  // Manual category takes precedence
  if (manualCategory) {
    return manualCategory;
  }
  
  // Attempt auto-detection
  return detectSystemCategory(title, description);
}

/**
 * Get human-readable label for system category
 */
export function getSystemCategoryLabel(category: SystemCategory | null): string {
  if (!category) return 'Uncategorized';
  
  const labels: Record<SystemCategory, string> = {
    FIRE_ALARM: 'Fire Alarm',
    FIRE_EXTINGUISHER: 'Fire Extinguisher',
    EMERGENCY_LIGHTING: 'Emergency Lighting',
    SPRINKLER: 'Sprinkler',
  };
  
  return labels[category];
}

/**
 * Get all available system categories
 */
export function getAllSystemCategories(): SystemCategory[] {
  return ['FIRE_ALARM', 'FIRE_EXTINGUISHER', 'EMERGENCY_LIGHTING', 'SPRINKLER'];
}
