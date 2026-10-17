/** Use the revision delivered with the attributes shown to the technician.
 * Missing revisions are never filled by fetching newer device attributes.
 */
export function displayedDeviceRevision(device: { id: number; deviceRevision?: unknown } | null | undefined, deviceId: number): string {
  if (!device || device.id !== deviceId || typeof device.deviceRevision !== "string" || !device.deviceRevision) {
    throw new Error("Reload this device's inspection details before recording a result.");
  }
  return device.deviceRevision;
}
