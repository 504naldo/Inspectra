/**
 * Device helper functions for sorting and filtering
 */

export interface DeviceWithWalkOrder {
  id: number;
  location?: string | null;
  deviceType?: string | null;
  walkOrder?: number | null;
  /** Imported source order (row order in the workbook's device tab). */
  sortOrder?: number | null;
  suiteNumber?: string | null;
  category?: string | null;
  [key: string]: any;
}

/**
 * Sorts devices by walk order, then imported source order (sortOrder), then
 * location, then device type. Walk-order and sort-order nulls are placed last.
 *
 * The sortOrder tiebreak makes freshly imported devices (which have no walk
 * order yet) appear in the exact row order of the source workbook's device tab,
 * rather than falling back to alphabetical location.
 */
export function sortByWalkOrderThenLocation<T extends DeviceWithWalkOrder>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Sort by walkOrder first (nulls last) — an in-progress walk wins.
    const aWalkOrder = a.walkOrder ?? Number.MAX_SAFE_INTEGER;
    const bWalkOrder = b.walkOrder ?? Number.MAX_SAFE_INTEGER;

    if (aWalkOrder !== bWalkOrder) {
      return aWalkOrder - bWalkOrder;
    }

    // Then by imported source order (nulls last) — replicates the workbook tab.
    const aSortOrder = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const bSortOrder = b.sortOrder ?? Number.MAX_SAFE_INTEGER;

    if (aSortOrder !== bSortOrder) {
      return aSortOrder - bSortOrder;
    }

    // Then by location (nulls last)
    const aLocation = a.location ?? '';
    const bLocation = b.location ?? '';

    if (aLocation !== bLocation) {
      return aLocation.localeCompare(bLocation);
    }

    // Finally by device type
    const aType = a.deviceType ?? '';
    const bType = b.deviceType ?? '';

    return aType.localeCompare(bType);
  });
}

/**
 * Sorts smoke alarms by suite number in descending order (highest to lowest)
 * Handles numeric suite numbers correctly (631 > 101)
 * Nulls are placed last
 */
export function sortBySuiteNumberDescending<T extends DeviceWithWalkOrder>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aSuite = a.suiteNumber;
    const bSuite = b.suiteNumber;
    
    // Handle nulls - place them last
    if (!aSuite && !bSuite) return 0;
    if (!aSuite) return 1;
    if (!bSuite) return -1;
    
    // Try to parse as numbers for numeric comparison
    const aNum = parseInt(aSuite, 10);
    const bNum = parseInt(bSuite, 10);
    
    // If both are valid numbers, compare numerically (descending)
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return bNum - aNum; // Descending order
    }
    
    // Otherwise, compare as strings (descending)
    return bSuite.localeCompare(aSuite);
  });
}

/**
 * Finds the first untested device in a sorted list
 * Returns the device or undefined if all are tested
 */
export function findFirstUntestedDevice<T extends DeviceWithWalkOrder>(
  devices: T[],
  testedDeviceIds: Set<number>
): T | undefined {
  return devices.find(device => !testedDeviceIds.has(device.id));
}
