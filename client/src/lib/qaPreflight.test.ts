import { describe, it, expect } from "vitest";
import { pendingSyncItemCount, isQaSubmitBlocked, countUnsyncedForJob, pendingSyncCountsForJob } from "./qaPreflight";

describe("QA submit preflight", () => {
  it("counts all pending critical types", () => {
    expect(pendingSyncItemCount({ pendingResults: 2, pendingDeficiencies: 1, pendingChecklistResponses: 3, pendingTemplateResponses: 4 })).toBe(10);
    expect(pendingSyncItemCount({ pendingResults: 0, pendingDeficiencies: 0 })).toBe(0);
    // optional counts default to 0
    expect(pendingSyncItemCount({ pendingResults: 1, pendingDeficiencies: 0 })).toBe(1);
  });

  it("does not block when everything is synced", () => {
    expect(isQaSubmitBlocked({ pendingResults: 0, pendingDeficiencies: 0 }, false)).toBe(false);
  });

  it("blocks when there is unsynced data and no override", () => {
    expect(isQaSubmitBlocked({ pendingResults: 0, pendingDeficiencies: 1 }, false)).toBe(true);
    expect(isQaSubmitBlocked({ pendingResults: 0, pendingDeficiencies: 0, pendingChecklistResponses: 2 }, false)).toBe(true);
    expect(isQaSubmitBlocked({ pendingResults: 0, pendingDeficiencies: 0, pendingTemplateResponses: 1 }, false)).toBe(true);
  });

  it("allows submission when the technician explicitly overrides", () => {
    expect(isQaSubmitBlocked({ pendingResults: 5, pendingDeficiencies: 2 }, true)).toBe(false);
  });
});

describe("Per-job scoping", () => {
  it("countUnsyncedForJob only counts this job's unsynced records", () => {
    const items = [
      { jobId: 1, synced: false },
      { jobId: 1, synced: true }, // already synced → excluded
      { jobId: 2, synced: false }, // other job → excluded
    ];
    expect(countUnsyncedForJob(items, 1)).toBe(1);
    expect(countUnsyncedForJob(items, 2)).toBe(1);
    expect(countUnsyncedForJob(items, 3)).toBe(0);
    expect(countUnsyncedForJob(undefined, 1)).toBe(0);
  });

  it("pendingSyncCountsForJob isolates each job's stores", () => {
    const stores = {
      results: [{ jobId: 1, synced: false }, { jobId: 2, synced: false }],
      deficiencies: [{ jobId: 1, synced: false }, { jobId: 1, synced: false }],
      checklistResponses: [{ jobId: 2, synced: false }],
      templateResponses: [{ jobId: 1, synced: true }],
    };
    const job1 = pendingSyncCountsForJob(stores, 1);
    expect(job1).toEqual({ pendingResults: 1, pendingDeficiencies: 2, pendingChecklistResponses: 0, pendingTemplateResponses: 0 });
    expect(pendingSyncItemCount(job1)).toBe(3);

    const job2 = pendingSyncCountsForJob(stores, 2);
    expect(job2).toEqual({ pendingResults: 1, pendingDeficiencies: 0, pendingChecklistResponses: 1, pendingTemplateResponses: 0 });
  });

  it("job A's submit is not blocked by job B's unsynced data", () => {
    const stores = { deficiencies: [{ jobId: 2, synced: false }] };
    // Nothing unsynced for job 1 → not blocked, even though job 2 has pending data.
    expect(isQaSubmitBlocked(pendingSyncCountsForJob(stores, 1), false)).toBe(false);
    // Job 2 itself is still blocked.
    expect(isQaSubmitBlocked(pendingSyncCountsForJob(stores, 2), false)).toBe(true);
  });
});
