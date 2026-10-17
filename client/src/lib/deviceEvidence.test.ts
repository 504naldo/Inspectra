import { describe, expect, it } from "vitest";
import { displayedDeviceRevision } from "./deviceEvidence";
describe("displayed device evidence", () => {
  it("passes through the revision attached to the device the technician is viewing", () => {
    expect(displayedDeviceRevision({ id: 7, deviceRevision: "original-display" }, 7)).toBe("original-display");
  });
  it.each([undefined, { id: 7 }, { id: 7, deviceRevision: "" }, { id: 8, deviceRevision: "different-device" }])(
    "does not invent evidence for an unresolved, old, or different device: %o", device => {
      expect(() => displayedDeviceRevision(device, 7)).toThrow(/Reload/);
    },
  );
});
