/**
 * compliance/hash.ts
 *
 * Finalization hash utilities for tamper-evident job sealing.
 *
 * Hash scope (per spec):
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
import { eq, inArray } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../drizzle/schema";

// ============================================================
// Types
// ============================================================

export type FinalizationPayload = {
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
  const serialized = serializeForHash(payload);
  return createHash("sha256").update(serialized, "utf8").digest("hex");
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
  db: MySql2Database<typeof schema>
): Promise<FinalizationPayload> {
  // 1. Job immutable business fields
  const jobRows = await db
    .select({
      id: schema.jobs.id,
      jobNumber: schema.jobs.jobNumber,
      siteId: schema.jobs.siteId,
      customerOrgId: schema.jobs.customerOrgId,
      leadTechnicianId: schema.jobs.leadTechnicianId,
      jobType: schema.jobs.jobType,
    })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId));

  if (jobRows.length === 0) {
    throw new Error(`Job ${jobId} not found`);
  }
  const job = jobRows[0];

  // 2. inspection_results
  const inspectionResults = await db
    .select()
    .from(schema.inspectionResults)
    .where(eq(schema.inspectionResults.jobId, jobId));

  // 3. fire_alarm_inspection_results
  const fireAlarmInspectionResults = await db
    .select()
    .from(schema.fireAlarmInspectionResults)
    .where(eq(schema.fireAlarmInspectionResults.jobId, jobId));

  // 4. deficiencies
  const deficiencies = await db
    .select()
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
    })
    .from(schema.attachments)
    .where(eq(schema.attachments.jobId, jobId));

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
          })
          .from(schema.attachments)
          .where(inArray(schema.attachments.entityId, deficiencyIds))
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
          })
          .from(schema.attachments)
          .where(inArray(schema.attachments.entityId, repairIds))
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
  const attachments = Array.from(attachmentMap.values());

  return {
    job,
    inspectionResults: inspectionResults as schema.InspectionResult[],
    fireAlarmInspectionResults:
      fireAlarmInspectionResults as schema.FireAlarmInspectionResult[],
    deficiencies: deficiencies as schema.Deficiency[],
    repairs: repairs as schema.Repair[],
    attachments,
  };
}
