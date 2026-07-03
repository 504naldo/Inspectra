/**
 * QA submission preflight rule.
 *
 * A technician must not submit a job for QA while critical field data is still
 * only stored locally (unsynced) — that would silently omit device tests,
 * deficiencies, or checklist/template responses from the generated report.
 * Submission is blocked while there is unsynced data unless the technician
 * explicitly overrides.
 */
export interface QaSyncCounts {
  pendingResults: number;
  pendingDeficiencies: number;
  pendingChecklistResponses?: number;
  pendingTemplateResponses?: number;
}

/** Total unsynced critical items across the offline stores. */
export function pendingSyncItemCount(s: QaSyncCounts): number {
  return (
    (s.pendingResults || 0) +
    (s.pendingDeficiencies || 0) +
    (s.pendingChecklistResponses ?? 0) +
    (s.pendingTemplateResponses ?? 0)
  );
}

/** True when QA submission should be blocked (unsynced data and no override). */
export function isQaSubmitBlocked(s: QaSyncCounts, override: boolean): boolean {
  return pendingSyncItemCount(s) > 0 && !override;
}

/** An offline-store record that belongs to a job and may already be synced. */
export interface JobScopedItem {
  jobId: number;
  synced?: boolean;
}

/** Count records for a specific job that are not yet synced. */
export function countUnsyncedForJob(items: JobScopedItem[] | undefined, jobId: number): number {
  return (items ?? []).filter((i) => i.jobId === jobId && !i.synced).length;
}

/**
 * Pending unsynced counts scoped to a single job. The QA preflight for job A
 * must not be blocked (or reassured) by unsynced field data belonging to some
 * other job the technician also worked offline — only this job's data can be
 * omitted from this job's report.
 */
export function pendingSyncCountsForJob(
  stores: {
    results?: JobScopedItem[];
    deficiencies?: JobScopedItem[];
    checklistResponses?: JobScopedItem[];
    templateResponses?: JobScopedItem[];
  },
  jobId: number,
): QaSyncCounts {
  return {
    pendingResults: countUnsyncedForJob(stores.results, jobId),
    pendingDeficiencies: countUnsyncedForJob(stores.deficiencies, jobId),
    pendingChecklistResponses: countUnsyncedForJob(stores.checklistResponses, jobId),
    pendingTemplateResponses: countUnsyncedForJob(stores.templateResponses, jobId),
  };
}
