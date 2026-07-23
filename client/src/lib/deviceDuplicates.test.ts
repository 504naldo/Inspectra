import { describe, it, expect } from "vitest";
import {
  duplicateSignature,
  findDuplicateGroups,
  removableDuplicateIds,
  type DeviceLike,
} from "./deviceDuplicates";

const d = (p: Partial<DeviceLike> & { id: number }): DeviceLike => ({ isActive: true, ...p });

describe("duplicateSignature", () => {
  it("uses externalRef when present (case/space-insensitive)", () => {
    expect(duplicateSignature(d({ id: 1, externalRef: " TAG-001 " }))).toBe("ref:tag-001");
  });
  it("requires deviceType + at least one locator otherwise", () => {
    expect(duplicateSignature(d({ id: 1, deviceType: "Smoke Detector" }))).toBeNull();
    expect(duplicateSignature(d({ id: 1, deviceType: "Smoke Detector", location: "Unit 204" }))).toBe(
      "sig:smoke detector|unit 204|||",
    );
  });
  it("returns null with no type", () => {
    expect(duplicateSignature(d({ id: 1, location: "Unit 204" }))).toBeNull();
  });
});

describe("findDuplicateGroups", () => {
  it("groups identical devices and keeps the most complete (older id breaks ties)", () => {
    const devices = [
      d({ id: 10, deviceType: "Pull Station", location: "Lobby", floor: "1" }),
      // same signature fields (type/location/floor/label/serial), richer metadata
      d({ id: 11, deviceType: "Pull Station", location: "Lobby", floor: "1", manufacturer: "X", notes: "n" }),
      d({ id: 12, deviceType: "Smoke Detector", location: "Unit 204" }),
    ];
    const groups = findDuplicateGroups(devices);
    expect(groups).toHaveLength(1);
    // 11 is richer, so it's the keeper even though 10 is older
    expect(groups[0].keeperId).toBe(11);
    expect(groups[0].devices.map((x) => x.id)).toEqual([11, 10]);
    expect(removableDuplicateIds(groups)).toEqual([10]);
  });

  it("treats a differing serial number as a DISTINCT device (precise, safe matching)", () => {
    const devices = [
      d({ id: 1, deviceType: "Pull Station", location: "Lobby", floor: "1", serialNumber: "S1" }),
      d({ id: 2, deviceType: "Pull Station", location: "Lobby", floor: "1", serialNumber: "S2" }),
    ];
    expect(findDuplicateGroups(devices)).toHaveLength(0);
  });

  it("matches on externalRef even when other fields differ", () => {
    const devices = [
      d({ id: 1, deviceType: "Horn", externalRef: "R9" }),
      d({ id: 2, deviceType: "Strobe", externalRef: "R9" }),
    ];
    const groups = findDuplicateGroups(devices);
    expect(groups).toHaveLength(1);
    expect(groups[0].devices.map((x) => x.id).sort()).toEqual([1, 2]);
  });

  it("ignores already-removed (inactive) devices and singletons", () => {
    const devices = [
      d({ id: 1, deviceType: "Pull Station", location: "Lobby" }),
      d({ id: 2, deviceType: "Pull Station", location: "Lobby", isActive: false }),
      d({ id: 3, deviceType: "Exit Sign", location: "Stair A" }),
    ];
    // only one active "Pull Station|Lobby" → not a duplicate group
    expect(findDuplicateGroups(devices)).toHaveLength(0);
  });

  it("does not lump together devices that are only the same type with no locator", () => {
    const devices = [
      d({ id: 1, deviceType: "Smoke Detector" }),
      d({ id: 2, deviceType: "Smoke Detector" }),
    ];
    expect(findDuplicateGroups(devices)).toHaveLength(0);
  });

  it("handles three copies — keeps one, removes two", () => {
    const devices = [
      d({ id: 1, deviceType: "Heat Detector", location: "Boiler", floor: "B1" }),
      d({ id: 2, deviceType: "Heat Detector", location: "Boiler", floor: "B1" }),
      d({ id: 3, deviceType: "Heat Detector", location: "Boiler", floor: "B1" }),
    ];
    const groups = findDuplicateGroups(devices);
    expect(groups).toHaveLength(1);
    expect(removableDuplicateIds(groups)).toHaveLength(2);
    expect(groups[0].devices).toHaveLength(3);
  });
});
