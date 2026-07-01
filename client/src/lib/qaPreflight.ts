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
