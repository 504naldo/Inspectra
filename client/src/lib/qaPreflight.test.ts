import { describe, it, expect } from "vitest";
import { pendingSyncItemCount, isQaSubmitBlocked } from "./qaPreflight";

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
