import { describe, expect, it } from "vitest";
import type { Device } from "../drizzle/schema";
import {
  assertDeviceEvidenceForReport, assertDeviceRevision, buildCapturedDeviceSnapshot,
  getDeviceRevision, readCapturedDevice, requireCapturedDevice,
} from "./canonicalDeviceEvidence";

const job = { id: 1, companyId: 10, siteId: 20 };
const capturedAt = new Date("2026-10-01T15:00:00Z");
function device(): Device {
  return {
    id: 30, companyId: 10, siteId: 20, category: null, deviceType: "Captured type",
    location: "Original location", serialNumber: "SER-ORIGINAL", manufacturer: "Original maker",
    model: "Original model", label: "Original label", floor: "2", suiteNumber: "201",
    barcode: "BAR-ORIGINAL", installDate: new Date("2020-01-02T00:00:00Z"),
    circuitAddress: "Original circuit", zone: "Original zone", notes: "Original notes",
    powerType: "hardwired", mfgDate: "2020-01", lastHST: "2025-01", last6yr: "2024-01",
    ladderHeight: "6 ft", supplyVoltage: "120 V", modelWattage: "12 W", batteryYear: "2020",
    batterySize: "12 V", batteryCount: 2, batteryReplaced: "No", maintenanceRequired: "Recorded maintenance",
    lampCount: 2, isActive: true, testResult: "not_tested", lastInspectionDate: null,
  } as Device;
}
function evidence() {
  return { jobId: job.id, deviceId: 30, companyId: job.companyId,
    deviceSnapshot: buildCapturedDeviceSnapshot(device(), job, 7, capturedAt) };
}

describe("Captured device evidence preserves historical identity", () => {
  it("captures authorized scalar attributes and retains an unknown category", () => {
    expect(evidence().deviceSnapshot).toMatchObject({
      captureProvenance: "captured", capturedAt: capturedAt.toISOString(), capturedById: 7,
      jobId: 1, companyId: 10, siteId: 20, deviceId: 30, category: null,
      location: "Original location", serialNumber: "SER-ORIGINAL", manufacturer: "Original maker",
      installDate: "2020-01-02T00:00:00.000Z", powerType: "hardwired", batteryCount: 2,
    });
  });

  it("later master edits, deactivation, moves and deleted attributes cannot rewrite a recorded inspection", () => {
    const master = device();
    const row = { jobId: 1, deviceId: 30, companyId: 10, deviceSnapshot: buildCapturedDeviceSnapshot(master, job, 7, capturedAt) };
    Object.assign(master, {
      companyId: 99, siteId: 999, category: "SPRINKLER", location: "Moved location",
      manufacturer: "Current maker", model: null, label: "Changed", serialNumber: "CURRENT",
      installDate: new Date("2026-10-16T00:00:00Z"), isActive: false,
    });
    expect(requireCapturedDevice(row, job)).toMatchObject({
      companyId: 10, siteId: 20, category: null, location: "Original location", manufacturer: "Original maker",
      model: "Original model", label: "Original label", serialNumber: "SER-ORIGINAL", isActive: true,
    });
    expect(() => assertDeviceEvidenceForReport(job, [row], [])).not.toThrow();
  });

  it.each([
    { companyId: 99 }, { siteId: 999 },
  ])("refuses to capture a device outside the actual inspection ancestry (%o)", changed => {
    expect(() => buildCapturedDeviceSnapshot({ ...device(), ...changed }, job, 7, capturedAt)).toThrow(/does not belong/);
  });

  it.each([0, -1])("refuses to fabricate capture provenance for invalid actor %s", actor => {
    expect(() => buildCapturedDeviceSnapshot(device(), job, actor, capturedAt)).toThrow();
  });

  it.each([
    undefined, null, {}, { captureProvenance: "legacy" },
  ])("missing or legacy evidence %j remains unresolved", deviceSnapshot => {
    const row = { jobId: 1, deviceId: 30, companyId: 10, deviceSnapshot };
    expect(readCapturedDevice(row, job)).toBeUndefined();
    expect(() => requireCapturedDevice(row, job)).toThrow(/missing or unverified/);
  });

  it.each([
    { capturedAt: "not-a-timestamp" }, { capturedById: 0 }, { deviceType: "" },
    { category: 42 }, { batteryCount: "two" }, { isActive: "true" },
  ])("invalid captured attributes fail closed (%o)", changed => {
    const row = evidence();
    expect(readCapturedDevice({ ...row, deviceSnapshot: { ...row.deviceSnapshot, ...changed } }, job)).toBeUndefined();
  });

  it.each([
    { jobId: 2 }, { deviceId: 31 }, { deviceId: null }, { companyId: 11 },
  ])("a row cannot relabel another captured identity (%o)", changed => {
    expect(readCapturedDevice({ ...evidence(), ...changed }, job)).toBeUndefined();
  });

  it.each([
    { id: 2 }, { companyId: 11 }, { siteId: 21 },
  ])("report ancestry must match every captured identity field (%o)", changed => {
    expect(() => requireCapturedDevice(evidence(), { ...job, ...changed })).toThrow(/missing or unverified/);
  });

  it("checks result evidence and device-linked deficiencies while allowing explicitly unlinked deficiencies", () => {
    const valid = evidence();
    expect(() => assertDeviceEvidenceForReport(job, [valid], [{ jobId: 1, deviceId: null }])).not.toThrow();
    expect(() => assertDeviceEvidenceForReport(job, [valid], [{ jobId: 1, deviceId: 30 }])).toThrow(/missing or unverified/);
    expect(() => assertDeviceEvidenceForReport(job, [{ jobId: 1, deviceId: null }], [])).toThrow(/missing or unverified/);
  });
});

describe("Displayed device revision protocol", () => {
  it("requires the exact displayed revision before capturing current evidence", () => {
    const master = device(), displayed = getDeviceRevision(master);
    expect(() => assertDeviceRevision(master, displayed)).not.toThrow();
    expect(() => assertDeviceRevision(master, undefined)).toThrow(/displayed revision is missing/);
    expect(() => assertDeviceRevision(master, "different-revision")).toThrow(/information changed/);
    master.location = "Changed after it was displayed";
    expect(() => assertDeviceRevision(master, displayed)).toThrow(/information changed/);
  });

  it.each([
    { manufacturer: "New maker" }, { serialNumber: "NEW-SERIAL" }, { label: "New label" },
    { category: "SPRINKLER" }, { siteId: 21 }, { companyId: 11 }, { batteryCount: 3 }, { isActive: false },
  ])("definition changes invalidate the displayed revision (%o)", changed => {
    const master = device(), displayed = getDeviceRevision(master);
    expect(getDeviceRevision({ ...master, ...changed } as Device)).not.toBe(displayed);
  });

  it("inspection outcome and last-inspection bookkeeping do not change the displayed definition revision", () => {
    const master = device(), displayed = getDeviceRevision(master);
    master.testResult = "pass";
    master.lastInspectionDate = new Date("2026-10-15T00:00:00Z");
    expect(getDeviceRevision(master)).toBe(displayed);
    expect(() => assertDeviceRevision(master, displayed)).not.toThrow();
  });
});
