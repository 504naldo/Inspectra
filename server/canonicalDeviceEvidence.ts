import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Device } from "../drizzle/schema";
import { createCaptureRevision } from "./captureRevision";

const deviceSnapshotSchema = z.object({
  captureProvenance: z.literal("captured"),
  capturedAt: z.string().datetime(),
  capturedById: z.number().int().positive(),
  jobId: z.number().int().positive(),
  companyId: z.number().int().positive(),
  siteId: z.number().int().positive(),
  deviceId: z.number().int().positive(),
  category: z.string().nullable(),
  deviceType: z.string().min(1),
  location: z.string().nullable(),
  serialNumber: z.string().nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  label: z.string().nullable(),
  floor: z.string().nullable(),
  suiteNumber: z.string().nullable(),
  barcode: z.string().nullable(),
  installDate: z.string().nullable(),
  circuitAddress: z.string().nullable(),
  zone: z.string().nullable(),
  notes: z.string().nullable(),
  powerType: z.string().nullable(),
  mfgDate: z.string().nullable(),
  lastHST: z.string().nullable(),
  last6yr: z.string().nullable(),
  ladderHeight: z.string().nullable(),
  supplyVoltage: z.string().nullable(),
  modelWattage: z.string().nullable(),
  batteryYear: z.string().nullable(),
  batterySize: z.string().nullable(),
  batteryCount: z.number().nullable(),
  batteryReplaced: z.string().nullable(),
  maintenanceRequired: z.string().nullable(),
  lampCount: z.number().nullable(),
  isActive: z.boolean(),
});
export type CapturedDeviceSnapshot = z.infer<typeof deviceSnapshotSchema>;
type JobIdentity = { id: number; companyId: number; siteId: number };
type DeviceEvidenceRow = {
  jobId: number;
  deviceId: number | null;
  deviceSnapshot?: unknown;
  companyId?: number | null;
};

function deviceAttributes(device: Device) {
  return {
    deviceId: device.id,
    companyId: device.companyId,
    siteId: device.siteId,
    category: device.category ?? null,
    deviceType: device.deviceType,
    location: device.location ?? null,
    serialNumber: device.serialNumber ?? null,
    manufacturer: device.manufacturer ?? null,
    model: device.model ?? null,
    label: device.label ?? null,
    floor: device.floor ?? null,
    suiteNumber: device.suiteNumber ?? null,
    barcode: device.barcode ?? null,
    installDate: device.installDate?.toISOString() ?? null,
    circuitAddress: device.circuitAddress ?? null,
    zone: device.zone ?? null,
    notes: device.notes ?? null,
    powerType: device.powerType ?? null,
    mfgDate: device.mfgDate ?? null,
    lastHST: device.lastHST ?? null,
    last6yr: device.last6yr ?? null,
    ladderHeight: device.ladderHeight ?? null,
    supplyVoltage: device.supplyVoltage ?? null,
    modelWattage: device.modelWattage ?? null,
    batteryYear: device.batteryYear ?? null,
    batterySize: device.batterySize ?? null,
    batteryCount: device.batteryCount ?? null,
    batteryReplaced: device.batteryReplaced ?? null,
    maintenanceRequired: device.maintenanceRequired ?? null,
    lampCount: device.lampCount ?? null,
    isActive: device.isActive,
  };
}

export function getDeviceRevision(device: Device): string {
  return createCaptureRevision("device", deviceAttributes(device));
}

export function assertDeviceRevision(
  device: Device,
  expectedRevision: string | undefined
): void {
  if (!expectedRevision || expectedRevision !== getDeviceRevision(device))
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Device information changed or its displayed revision is missing. Review the device before saving this inspection evidence.",
    });
}

/** Capture server-verified device attributes at this authorized save, not by backfill. */
export function buildCapturedDeviceSnapshot(
  device: Device,
  job: JobIdentity,
  actorId: number,
  capturedAt = new Date()
): CapturedDeviceSnapshot {
  if (device.companyId !== job.companyId || device.siteId !== job.siteId)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Device does not belong to this inspection job.",
    });
  return deviceSnapshotSchema.parse({
    captureProvenance: "captured",
    capturedAt: capturedAt.toISOString(),
    capturedById: actorId,
    jobId: job.id,
    ...deviceAttributes(device),
  });
}

export function readCapturedDevice(
  row: DeviceEvidenceRow,
  job?: JobIdentity
): CapturedDeviceSnapshot | undefined {
  const parsed = deviceSnapshotSchema.safeParse(row.deviceSnapshot);
  if (!parsed.success) return undefined;
  const snapshot = parsed.data;
  if (
    snapshot.jobId !== row.jobId ||
    snapshot.deviceId !== row.deviceId ||
    (row.companyId != null && snapshot.companyId !== row.companyId) ||
    (job &&
      (snapshot.jobId !== job.id ||
        snapshot.companyId !== job.companyId ||
        snapshot.siteId !== job.siteId))
  )
    return undefined;
  return snapshot;
}

export function requireCapturedDevice(
  row: DeviceEvidenceRow,
  job: JobIdentity
): CapturedDeviceSnapshot {
  const captured = readCapturedDevice(row, job);
  if (!captured)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Device identity/location evidence is missing or unverified. Review the original inspection evidence before generating this report.",
    });
  return captured;
}

/** Never substitute the current equipment master for historical report evidence. */
export function assertDeviceEvidenceForReport(
  job: JobIdentity,
  results: DeviceEvidenceRow[],
  deficiencies: DeviceEvidenceRow[]
) {
  for (const result of results) requireCapturedDevice(result, job);
  for (const deficiency of deficiencies)
    if (deficiency.deviceId != null) requireCapturedDevice(deficiency, job);
}
