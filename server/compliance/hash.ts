/**
 * compliance/hash.ts
 *
 * Finalization hash utilities for tamper-evident job sealing.
 *
 * Version 1 remains byte-for-byte compatible with existing seals. Version 2
 * captures the remaining job evidence and uses typed attachment ownership.
 * Never rebuild a historical v1 seal as v2.
 *
 * Version 1 hash scope:
 *   - jobs: immutable business fields only (id, jobNumber, siteId, customerOrgId, leadTechnicianId, jobType)
 *   - inspection_results: all columns
 *   - fire_alarm_inspection_results: all columns (including itemSnapshot)
 *   - deficiencies: all columns
 *   - repairs: all columns
 *   - attachments: metadata only, resolved by direct jobId AND via deficiency/repair ownership
 *
 * Excluded from hash:
 *   - inspection_checklist_responses
 *   - reports
 *   - sync_logs
 */

import { createHash } from "crypto";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import type { SelectedFields } from "drizzle-orm/mysql-core";
import * as schema from "../../drizzle/schema";

// Freeze the exact pre-device-snapshot columns used by existing version 1 seals.
export const legacyInspectionResultColumns = {
  id: schema.inspectionResults.id,
  jobId: schema.inspectionResults.jobId,
  deviceId: schema.inspectionResults.deviceId,
  technicianId: schema.inspectionResults.technicianId,
  result: schema.inspectionResults.result,
  notes: schema.inspectionResults.notes,
  testedAt: schema.inspectionResults.testedAt,
  syncedAt: schema.inspectionResults.syncedAt,
  walkOrder: schema.inspectionResults.walkOrder,
  createdAt: schema.inspectionResults.createdAt,
  updatedAt: schema.inspectionResults.updatedAt,
  technicianCertificationSnapshot: schema.inspectionResults.technicianCertificationSnapshot,
  carriedForward: schema.inspectionResults.carriedForward,
  companyId: schema.inspectionResults.companyId,
};

export const legacyDeficiencyColumns = {
  id: schema.deficiencies.id,
  jobId: schema.deficiencies.jobId,
  deviceId: schema.deficiencies.deviceId,
  inspectionResultId: schema.deficiencies.inspectionResultId,
  reportedById: schema.deficiencies.reportedById,
  status: schema.deficiencies.status,
  severity: schema.deficiencies.severity,
  systemCategory: schema.deficiencies.systemCategory,
  title: schema.deficiencies.title,
  description: schema.deficiencies.description,
  observedIssue: schema.deficiencies.observedIssue,
  correctiveAction: schema.deficiencies.correctiveAction,
  customerExplanation: schema.deficiencies.customerExplanation,
  codeReference: schema.deficiencies.codeReference,
  estimatedCost: schema.deficiencies.estimatedCost,
  aiGeneratedAt: schema.deficiencies.aiGeneratedAt,
  aiModelId: schema.deficiencies.aiModelId,
  aiPromptHash: schema.deficiencies.aiPromptHash,
  aiContext: schema.deficiencies.aiContext,
  resolvedAt: schema.deficiencies.resolvedAt,
  resolvedById: schema.deficiencies.resolvedById,
  resolutionNotes: schema.deficiencies.resolutionNotes,
  customerSignedOffAt: schema.deficiencies.customerSignedOffAt,
  customerSignedOffByName: schema.deficiencies.customerSignedOffByName,
  workOrderId: schema.deficiencies.workOrderId,
  idempotencyKey: schema.deficiencies.idempotencyKey,
  createdAt: schema.deficiencies.createdAt,
  updatedAt: schema.deficiencies.updatedAt,
};

// ============================================================
// Types
// ============================================================

export type FinalizationPayloadV1 = {
  job: {
    id: number;
    jobNumber: string;
    siteId: number;
    customerOrgId: number;
    leadTechnicianId: number | null;
    jobType: string;
  };
  inspectionResults: schema.InspectionResult[];
  fireAlarmInspectionResults: schema.FireAlarmInspectionResult[];
  deficiencies: schema.Deficiency[];
  repairs: schema.Repair[];
  attachments: AttachmentMetadata[];
};

export type FinalizationPayloadV2 = FinalizationPayloadV1 & {
  payloadVersion: 2;
  job: FinalizationPayloadV1["job"] & {
    companyId: number;
    title: string;
    description: string | null;
    notes: string | null;
    technicianNotes: string | null;
    officeNotes: string | null;
    techSignatureUrl: string | null;
    contactSignatureUrl: string | null;
    techSignatureKey: string | null;
    contactSignatureKey: string | null;
    contactName: string | null;
    techSignedAt: Date | null;
    contactSignedAt: Date | null;
  };
  templateResponses: schema.InspectionTemplateResponse[];
  checklistResponses: schema.InspectionChecklistResponse[];
  fireAlarmFormHeaders: schema.FireAlarmFormHeader[];
  fireAlarmAttendance: schema.FireAlarmAttendanceLog[];
  fireAlarmAncillaryCircuits: schema.FireAlarmAncillaryCircuit[];
  sprinklerInspections: schema.SprinklerInspection[];
  sprinklerSystems: schema.SprinklerSystem[];
  sprinklerChecklistItems: schema.SprinklerChecklistItem[];
  sprinklerDevices: schema.SprinklerDevice[];
};
export type FinalizationPayload = FinalizationPayloadV1 | FinalizationPayloadV2;

export type AttachmentMetadata = {
  id: number;
  entityType: string | null;
  entityId: number | null;
  jobId: number | null;
  fileKey: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: Date;
};

// ============================================================
// serializeForHash
// ============================================================

/**
 * Deterministically serialize a payload for hashing.
 * - Sorts object keys recursively (alphabetical)
 * - Sorts row arrays by primary key (id) ascending
 * - Converts Date objects to ISO strings for stable representation
 */
export function serializeForHash(payload: unknown): string {
  return JSON.stringify(normalizeValue(payload));
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    // Sort arrays of objects by id if they have one; otherwise preserve order
    const sorted = [...value].sort((a, b) => {
      if (
        typeof a === "object" &&
        a !== null &&
        "id" in a &&
        typeof b === "object" &&
        b !== null &&
        "id" in b
      ) {
        return (a as { id: number }).id - (b as { id: number }).id;
      }
      return 0;
    });
    return sorted.map(normalizeValue);
  }
  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      sorted[key] = normalizeValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

// ============================================================
// computeFinalizationHash
// ============================================================

/**
 * Compute SHA-256 hash of the serialized finalization payload.
 * Returns lowercase hex string.
 */
export function computeFinalizationHash(payload: FinalizationPayload): string {
  const serialized = "payloadVersion" in payload && payload.payloadVersion === 2
    ? serializeVersionTwo(payload)
    : serializeForHash(payload);
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}

// Database row order is irrelevant; the order inside a captured definition is
// evidence (for example, its displayed options or fire-alarm sub-items).
// Keep the legacy recursive array sorting above untouched for historical v1.
const versionTwoRowCollections = new Set([
  "inspectionResults", "fireAlarmInspectionResults", "deficiencies", "repairs", "attachments",
  "templateResponses", "checklistResponses", "fireAlarmFormHeaders", "fireAlarmAttendance",
  "fireAlarmAncillaryCircuits", "sprinklerInspections", "sprinklerSystems",
  "sprinklerChecklistItems", "sprinklerDevices",
]);
function serializeVersionTwo(payload: FinalizationPayloadV2): string {
  function capturedValue(value: unknown, sortRows = false): unknown {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      const values = [...value];
      if (sortRows) values.sort((a, b) => a.id - b.id);
      return values.map(entry => capturedValue(entry));
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, capturedValue((value as Record<string, unknown>)[key])]));
    }
    return value;
  }
  return JSON.stringify(Object.fromEntries(Object.keys(payload).sort().map(key => [key,
    capturedValue((payload as unknown as Record<string, unknown>)[key], versionTwoRowCollections.has(key)),
  ])));
}

// ============================================================
// buildFinalizationPayload
// ============================================================

/**
 * Build the finalization payload for a given jobId using the provided DB transaction.
 * Resolves attachments via direct jobId AND via deficiency/repair ownership joins.
 */
export async function buildFinalizationPayload(
  jobId: number,
  db: MySql2Database<typeof schema>,
  version: number = 1,
): Promise<FinalizationPayload> {
  if (version !== 1 && version !== 2) throw new Error(`Unsupported finalization hash version: ${version}`);
  // 1. Job immutable business fields
  const jobRows = await db
    .select({
      id: schema.jobs.id,
      jobNumber: schema.jobs.jobNumber,
      siteId: schema.jobs.siteId,
      customerOrgId: schema.jobs.customerOrgId,
      leadTechnicianId: schema.jobs.leadTechnicianId,
      jobType: schema.jobs.jobType,
      ...(version === 2 ? {
        companyId: schema.jobs.companyId,
        title: schema.jobs.title,
        description: schema.jobs.description,
        notes: schema.jobs.notes,
        technicianNotes: schema.jobs.technicianNotes,
        officeNotes: schema.jobs.officeNotes,
        techSignatureUrl: schema.jobs.techSignatureUrl,
        contactSignatureUrl: schema.jobs.contactSignatureUrl,
        techSignatureKey: schema.jobs.techSignatureKey,
        contactSignatureKey: schema.jobs.contactSignatureKey,
        contactName: schema.jobs.contactName,
        techSignedAt: schema.jobs.techSignedAt,
        contactSignedAt: schema.jobs.contactSignedAt,
      } : {}),
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));

  if (jobRows.length === 0) {
    throw new Error(`Job ${jobId} not found`);
  }
  const job = jobRows[0];

  // 2. inspection_results
  const inspectionResults = await db
    .select({ ...legacyInspectionResultColumns, ...(version === 2 ? { deviceSnapshot: schema.inspectionResults.deviceSnapshot } : {}) })
    .from(schema.inspectionResults)
    .where(eq(schema.inspectionResults.jobId, jobId));

  // 3. fire_alarm_inspection_results
  const fireAlarmInspectionResults = await db
    .select()
    .from(schema.fireAlarmInspectionResults)
    .where(eq(schema.fireAlarmInspectionResults.jobId, jobId));

  // 4. deficiencies
  const deficiencies = await db
    .select({ ...legacyDeficiencyColumns, ...(version === 2 ? { deviceSnapshot: schema.deficiencies.deviceSnapshot } : {}) })
    .from(schema.deficiencies)
    .where(eq(schema.deficiencies.jobId, jobId));

  // 5. repairs (via deficiency ownership)
  const deficiencyIds = deficiencies.map((d) => d.id);
  const repairs =
    deficiencyIds.length > 0
      ? await db
          .select()
          .from(schema.repairs)
          .where(inArray(schema.repairs.deficiencyId, deficiencyIds))
      : [];

  // 6. Attachments — resolve via direct jobId AND via entity joins
  const repairIds = repairs.map((r) => r.id);
  const additionalAttachmentFields: SelectedFields = version === 2 ? {
    companyId: schema.attachments.companyId,
    siteId: schema.attachments.siteId,
    deviceId: schema.attachments.deviceId,
    uploadedById: schema.attachments.uploadedById,
    caption: schema.attachments.caption,
    aiCaption: schema.attachments.aiCaption,
    tags: schema.attachments.tags,
    locationNote: schema.attachments.locationNote,
    isCustomerFacing: schema.attachments.isCustomerFacing,
    sortOrder: schema.attachments.sortOrder,
  } : {};

  // Direct jobId attachments
  const directAttachments = await db
    .select({
      id: schema.attachments.id,
      entityType: schema.attachments.entityType,
      entityId: schema.attachments.entityId,
      jobId: schema.attachments.jobId,
      fileKey: schema.attachments.fileKey,
      fileName: schema.attachments.fileName,
      fileSize: schema.attachments.fileSize,
      mimeType: schema.attachments.mimeType,
      createdAt: schema.attachments.createdAt,
      ...additionalAttachmentFields,
    })
    .from(schema.attachments)
    .where(version === 1 ? eq(schema.attachments.jobId, jobId) : and(
      or(eq(schema.attachments.jobId, jobId), and(eq(schema.attachments.entityType, "job"), eq(schema.attachments.entityId, jobId))),
      or(isNull(schema.attachments.companyId), eq(schema.attachments.companyId, job.companyId!)),
    ));

  // Deficiency-linked attachments (entityType='deficiency', entityId in deficiencyIds)
  const deficiencyAttachments =
    deficiencyIds.length > 0
      ? await db
          .select({
            id: schema.attachments.id,
            entityType: schema.attachments.entityType,
            entityId: schema.attachments.entityId,
            jobId: schema.attachments.jobId,
            fileKey: schema.attachments.fileKey,
            fileName: schema.attachments.fileName,
            fileSize: schema.attachments.fileSize,
            mimeType: schema.attachments.mimeType,
            createdAt: schema.attachments.createdAt,
            ...additionalAttachmentFields,
          })
          .from(schema.attachments)
          .where(version === 1 ? inArray(schema.attachments.entityId, deficiencyIds) : and(
            eq(schema.attachments.entityType, "deficiency"), inArray(schema.attachments.entityId, deficiencyIds),
            or(isNull(schema.attachments.jobId), eq(schema.attachments.jobId, jobId)),
            or(isNull(schema.attachments.companyId), eq(schema.attachments.companyId, job.companyId!)),
          ))
      : [];

  // Repair-linked attachments (entityType='repair', entityId in repairIds)
  const repairAttachments =
    repairIds.length > 0
      ? await db
          .select({
            id: schema.attachments.id,
            entityType: schema.attachments.entityType,
            entityId: schema.attachments.entityId,
            jobId: schema.attachments.jobId,
            fileKey: schema.attachments.fileKey,
            fileName: schema.attachments.fileName,
            fileSize: schema.attachments.fileSize,
            mimeType: schema.attachments.mimeType,
            createdAt: schema.attachments.createdAt,
            ...additionalAttachmentFields,
          })
          .from(schema.attachments)
          .where(version === 1 ? inArray(schema.attachments.entityId, repairIds) : and(
            eq(schema.attachments.entityType, "repair"), inArray(schema.attachments.entityId, repairIds),
            or(isNull(schema.attachments.jobId), eq(schema.attachments.jobId, jobId)),
            or(isNull(schema.attachments.companyId), eq(schema.attachments.companyId, job.companyId!)),
          ))
      : [];

  // Deduplicate attachments by id
  const attachmentMap = new Map<number, AttachmentMetadata>();
  for (const a of [
    ...directAttachments,
    ...deficiencyAttachments,
    ...repairAttachments,
  ]) {
    attachmentMap.set(a.id, a as AttachmentMetadata);
  }
  if (version === 2 && inspectionResults.length) {
    const inspectionAttachments = await db.select({
      id: schema.attachments.id, entityType: schema.attachments.entityType,
      entityId: schema.attachments.entityId, jobId: schema.attachments.jobId,
      fileKey: schema.attachments.fileKey, fileName: schema.attachments.fileName,
      fileSize: schema.attachments.fileSize, mimeType: schema.attachments.mimeType,
      createdAt: schema.attachments.createdAt,
      ...additionalAttachmentFields,
    }).from(schema.attachments).where(and(
      eq(schema.attachments.entityType, "inspection_result"),
      inArray(schema.attachments.entityId, inspectionResults.map(row => row.id)),
      or(isNull(schema.attachments.jobId), eq(schema.attachments.jobId, jobId)),
      or(isNull(schema.attachments.companyId), eq(schema.attachments.companyId, job.companyId!)),
    ));
    for (const attachment of inspectionAttachments) attachmentMap.set(attachment.id, attachment);
  }
  const attachments = Array.from(attachmentMap.values());

  const legacy: FinalizationPayloadV1 = {
    job,
    inspectionResults: inspectionResults as schema.InspectionResult[],
    fireAlarmInspectionResults:
      fireAlarmInspectionResults as schema.FireAlarmInspectionResult[],
    deficiencies: deficiencies as schema.Deficiency[],
    repairs: repairs as schema.Repair[],
    attachments,
  };
  if (version === 1) return legacy;

  const templateResponses = await db.select().from(schema.inspectionTemplateResponses).where(eq(schema.inspectionTemplateResponses.jobId, jobId));
  const checklistResponses = await db.select().from(schema.inspectionChecklistResponses).where(eq(schema.inspectionChecklistResponses.jobId, jobId));
  const fireAlarmFormHeaders = await db.select().from(schema.fireAlarmFormHeader).where(eq(schema.fireAlarmFormHeader.jobId, jobId));
  const fireAlarmAttendance = await db.select().from(schema.fireAlarmAttendanceLog).where(eq(schema.fireAlarmAttendanceLog.jobId, jobId));
  const fireAlarmAncillaryCircuits = await db.select().from(schema.fireAlarmAncillaryCircuits).where(eq(schema.fireAlarmAncillaryCircuits.jobId, jobId));
  const sprinklerInspections = await db.select().from(schema.sprinklerInspections).where(eq(schema.sprinklerInspections.jobId, jobId));
  const sprinklerIds = sprinklerInspections.map(row => row.id);
  const sprinklerSystems = sprinklerIds.length ? await db.select().from(schema.sprinklerSystems).where(inArray(schema.sprinklerSystems.inspectionId, sprinklerIds)) : [];
  const sprinklerChecklistItems = sprinklerIds.length ? await db.select().from(schema.sprinklerChecklistItems).where(inArray(schema.sprinklerChecklistItems.inspectionId, sprinklerIds)) : [];
  const sprinklerDevices = sprinklerIds.length ? await db.select().from(schema.sprinklerDevices).where(inArray(schema.sprinklerDevices.inspectionId, sprinklerIds)) : [];
  return {
    ...legacy,
    payloadVersion: 2,
    job: job as FinalizationPayloadV2["job"],
    templateResponses, checklistResponses, fireAlarmFormHeaders,
    fireAlarmAttendance, fireAlarmAncillaryCircuits, sprinklerInspections,
    sprinklerSystems, sprinklerChecklistItems, sprinklerDevices,
  };
}
