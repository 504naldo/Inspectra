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
