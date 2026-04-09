/**
 * Centralized device categorization helpers
 * Used consistently across cards, lists, and reports
 */

export type DeviceCategory = 'smoke' | 'fire_alarm' | 'extinguisher' | 'emergency' | 'other';

/**
 * Determines if a device is a smoke alarm
 * Checks deviceType, deviceCategory, category, model, and description fields
 */
export function isSmokeAlarm(device: {
  deviceType?: string | null;
  deviceCategory?: string | null;
  category?: string | null;
  model?: string | null;
  description?: string | null;
}): boolean {
  // If the DB category enum is set, use it authoritatively
  if (device.category) return device.category === 'SMOKE_ALARM';

  const searchFields = [
    device.deviceType,
    device.deviceCategory,
    device.model,
    device.description,
  ]
    .filter(Boolean)
    .map(f => f!.toLowerCase());

  // Device must mention "smoke" in at least one field
  const hasSmoke = searchFields.some(field => field.includes('smoke'));

  // Exclude devices that are clearly not smoke alarms even if they mention smoke
  const isExcluded = searchFields.some(field =>
    field.includes('extinguisher') ||
    field.includes('pull') ||
    field.includes('horn') ||
    field.includes('strobe') ||
    field.includes('bell')
  );

  return hasSmoke && !isExcluded;
}

/**
 * Categorizes a device into one of the predefined categories
 */
export function categorizeDevice(device: {
  deviceType?: string | null;
  category?: string | null;
  model?: string | null;
  description?: string | null;
}): DeviceCategory {
  // First check the database category field directly
  if (device.category) {
    const cat = device.category.toLowerCase();
    if (cat.includes('smoke_alarm')) return 'smoke'; // Check smoke_alarm BEFORE fire_alarm
    if (cat.includes('fire_extinguisher')) return 'extinguisher';
    if (cat.includes('emergency_light')) return 'emergency';
    if (cat.includes('fire_alarm')) return 'fire_alarm';
  }
  // Check smoke alarms first (most specific)
  if (isSmokeAlarm(device)) {
    return 'smoke';
  }

  const searchFields = [
    device.deviceType,
    device.category,
    device.model,
    device.description,
  ]
    .filter(Boolean)
    .map(f => f!.toLowerCase());

  // Check for extinguishers
  if (searchFields.some(field => field.includes('extinguisher'))) {
    return 'extinguisher';
  }

  // Check for emergency lights
  if (searchFields.some(field => 
    field.includes('emergency') || 
    field.includes('exit')
  )) {
    return 'emergency';
  }

  // Check for other fire alarm devices
  if (searchFields.some(field =>
    field.includes('pull') ||
    field.includes('heat') ||
    field.includes('horn') ||
    field.includes('strobe') ||
    field.includes('module') ||
    field.includes('bell') ||
    field.includes('detector') ||
    field.includes('alarm')
  )) {
    return 'fire_alarm';
  }

  return 'other';
}

/**
 * Gets a human-readable label for a category
 */
export function getCategoryLabel(category: DeviceCategory): string {
  switch (category) {
    case 'smoke':
      return 'Smoke Alarms';
    case 'fire_alarm':
      return 'Fire Alarm Devices';
    case 'extinguisher':
      return 'Fire Extinguishers';
    case 'emergency':
      return 'Emergency Lights';
    default:
      return 'Other Devices';
  }
}
