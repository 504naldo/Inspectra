/**
 * Duplicate-device detection for the admin Devices page.
 *
 * Mapping/import can create several device rows that represent the same
 * physical device. This groups active devices that share a duplicate signature
 * so the office can remove the extras, keeping one (the most complete) per group.
 *
 * Pure + framework-free so it can be unit-tested without the DB or React.
 */

export interface DeviceLike {
  id: number;
  deviceType?: string | null;
  location?: string | null;
  floor?: string | null;
  label?: string | null;
  serialNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  notes?: string | null;
  externalRef?: string | null;
  isActive?: boolean | null;
}

export interface DuplicateGroup {
  signature: string;
  /** Suggested device to keep (most complete; oldest id breaks ties). */
  keeperId: number;
  /** All members of the group, keeper first. */
  devices: DeviceLike[];
}

const norm = (v: unknown): string => (v ?? "").toString().trim().toLowerCase();

/**
 * A signature two devices share iff they are considered duplicates. Devices with
 * the same non-empty import key (externalRef) always match. Otherwise they must
 * share device type AND at least one locator (location/floor/label/serial) so we
 * never lump every blank "Smoke Detector" together. Returns null when the device
 * has too little data to safely call a duplicate.
 */
export function duplicateSignature(d: DeviceLike): string | null {
  const ref = norm(d.externalRef);
  if (ref) return `ref:${ref}`;

  const type = norm(d.deviceType);
  if (!type) return null;

  const locators = [norm(d.location), norm(d.floor), norm(d.label), norm(d.serialNumber)];
  if (locators.every((x) => x === "")) return null;

  return `sig:${type}|${locators.join("|")}`;
}

/** How much identifying data a device carries — used to pick the keeper. */
function completeness(d: DeviceLike): number {
  return [d.location, d.floor, d.label, d.serialNumber, d.manufacturer, d.model, d.notes].filter(
    (v) => norm(v) !== "",
  ).length;
}

/**
 * Group active devices into duplicate sets (2+ members). Groups are returned in
 * order of first appearance; within a group the keeper (most complete, then
 * lowest id) is first.
 */
export function findDuplicateGroups(devices: DeviceLike[]): DuplicateGroup[] {
  const bySig = new Map<string, DeviceLike[]>();
  const order: string[] = [];

  for (const d of devices) {
    if (d.isActive === false) continue; // already removed — ignore
    const sig = duplicateSignature(d);
    if (!sig) continue;
    if (!bySig.has(sig)) {
      bySig.set(sig, []);
      order.push(sig);
    }
    bySig.get(sig)!.push(d);
  }

  const groups: DuplicateGroup[] = [];
  for (const sig of order) {
    const members = bySig.get(sig)!;
    if (members.length < 2) continue;
    const sorted = [...members].sort((a, b) => completeness(b) - completeness(a) || a.id - b.id);
    groups.push({ signature: sig, keeperId: sorted[0].id, devices: sorted });
  }
  return groups;
}

/** Ids of every device that could be removed (all non-keepers across all groups). */
export function removableDuplicateIds(groups: DuplicateGroup[]): number[] {
  return groups.flatMap((g) => g.devices.filter((d) => d.id !== g.keeperId).map((d) => d.id));
}
