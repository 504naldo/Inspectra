import { expect, it } from "vitest";
import { buildExternalRef } from "./services/workbookImport";
it("identical hallway labels on different floors retain different identities", () => {
  const ref = (floor: string) =>
    buildExternalRef(
      "fireAlarmDevices",
      { floor, location: "Hallway", deviceType: "Smoke Detector" },
      10,
      "FIRE_ALARM_DEVICE"
    );
  expect(ref("1")).not.toBe(ref("2"));
  expect(ref(" 1 ")).toBe(ref("1"));
});
it("stable serial identity survives location and floor changes", () => {
  expect(
    buildExternalRef(
      "fireAlarmDevices",
      { serialNumber: " SN-42 ", floor: "1", location: "Hall" },
      10,
      "FIRE_ALARM_DEVICE"
    )
  ).toBe(
    buildExternalRef(
      "fireAlarmDevices",
      { serialNumber: "sn-42", floor: "2", location: "Office" },
      10,
      "FIRE_ALARM_DEVICE"
    )
  );
});

it("stable barcode identity survives a move when no serial number is present", () => {
  const identity = (barcode: string, floor: string, location: string) =>
    buildExternalRef("emergencyLights", { barcode, floor, location }, 10, "EMERGENCY_LIGHT");
  expect(identity(" EL-9 ", "1", "Hallway")).toBe(identity("el-9", "3", "Lobby"));
});
it("serial numbers keep precedence over barcodes", () => {
  expect(buildExternalRef("fireAlarmDevices", { serialNumber: "SN-1", barcode: "OLD" }, 10, "FIRE_ALARM_DEVICE"))
    .toBe(buildExternalRef("fireAlarmDevices", { serialNumber: "sn-1", barcode: "NEW" }, 10, "FIRE_ALARM_DEVICE"));
});
it("smoke alarms in different rooms of the same suite retain different identities", () => {
  const identity = (location: string) =>
    buildExternalRef("smokeAlarms", { suiteNumber: "101", location }, 10, "SMOKE_ALARM");
  expect(identity("Bedroom")).not.toBe(identity("Hallway"));
});
