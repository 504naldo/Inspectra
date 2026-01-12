/**
 * Device helper functions for sorting and filtering
 */

export interface DeviceWithWalkOrder {
  id: number;
  location?: string | null;
  deviceType?: string | null;
  walkOrder?: number | null;
  [key: string]: any;
}

/**
 * Sorts devices by walk order, then location, then device type
 * Walk order nulls are placed last
 */
export function sortByWalkOrderThenLocation<T extends DeviceWithWalkOrder>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Sort by walkOrder first (nulls last)
    const aWalkOrder = a.walkOrder ?? Number.MAX_SAFE_INTEGER;
    const bWalkOrder = b.walkOrder ?? Number.MAX_SAFE_INTEGER;
    
    if (aWalkOrder !== bWalkOrder) {
      return aWalkOrder - bWalkOrder;
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
 * Finds the first untested device in a sorted list
 * Returns the device or undefined if all are tested
 */
export function findFirstUntestedDevice<T extends DeviceWithWalkOrder>(
  devices: T[],
  testedDeviceIds: Set<number>
): T | undefined {
  return devices.find(device => !testedDeviceIds.has(device.id));
}
