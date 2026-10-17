import { describe, expect, it, vi } from "vitest";
import { buildTemplateDraft, mergeTemplateAnswers, type TemplateQuestionView } from "./templateDrafts";
import { ScopedOfflineQueue } from "./scopedOfflineQueue";

class MemoryStorage {
  values = new Map<string, string>();
  get length() { return this.values.size; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const question: TemplateQuestionView = {
  id: 30, sectionId: 20, questionRevision: `inspection-capture-v1:template-question:${"a".repeat(64)}`,
  itemCode: "A", questionText: "Original question", helpText: "Original help", responseType: "pass_fail_na",
  isRequired: 1, options: ["pass", "fail", "na"], deficiencyTrigger: null, codeReference: "Original code",
  capturedTemplateName: "Original template", capturedTemplateVersion: 1,
  capturedSectionTitle: "Original section", capturedSectionDescription: "Original instructions",
};
const answer = { responseValue: "fail", responseText: "", notes: "Entered before Save & Done", questionRevision: question.questionRevision };
const scope = { userId: 1, companyId: 7 };

describe("Durable generic template edits", () => {
  it("keeps each edit over a background server refetch before explicit form submission", () => {
    const storage = new MemoryStorage();
    const queue = new ScopedOfflineQueue("templates", scope, storage);
    queue.save(buildTemplateDraft(1, 10, question, answer));
    const refetched = [{ itemId: 30, responseValue: "pass", notes: "Old server response" }];
    expect(mergeTemplateAnswers([question], refetched, queue.read()).answers[30]).toMatchObject(answer);
    const remountedQueue = new ScopedOfflineQueue("templates", scope, storage);
    expect(mergeTemplateAnswers([question], refetched, remountedQueue.read()).answers[30].responseValue).toBe("fail");
  });

  it("persists an intentional clear over a previously saved answer", () => {
    const storage = new MemoryStorage();
    const queue = new ScopedOfflineQueue("templates", scope, storage);
    queue.save(buildTemplateDraft(1, 10, question, { ...answer, responseValue: "", notes: "" }));
    expect(queue.read()[0].responseValue).toBeNull();
    expect(mergeTemplateAnswers([question], [{ itemId: 30, responseValue: "pass" }], queue.read()).answers[30]).toMatchObject({ responseValue: "", notes: "" });
  });

  it("preserves stale drafts and original displayed context without showing the old answer under a replacement question", () => {
    const storage = new MemoryStorage();
    const queue = new ScopedOfflineQueue("templates", scope, storage);
    queue.save(buildTemplateDraft(1, 10, question, answer));
    const replacement = { ...question, questionText: "Replacement question", questionRevision: `inspection-capture-v1:template-question:${"b".repeat(64)}` };
    const view = mergeTemplateAnswers([replacement], [], queue.read());
    expect(view.answers).toEqual({});
    expect(view.staleDrafts).toHaveLength(1);
    expect(view.staleDrafts[0].questionContext).toMatchObject({ questionText: "Original question", capturedTemplateName: "Original template", capturedTemplateVersion: 1, capturedSectionTitle: "Original section", capturedSectionDescription: "Original instructions", options: ["pass", "fail", "na"] });
    expect(() => buildTemplateDraft(1, 10, replacement, answer)).toThrow(/different displayed/);
    expect(queue.read()[0].responseValue).toBe("fail");
  });

  it("retains removed questions for export instead of silently dropping their pending answers", () => {
    const draft = buildTemplateDraft(1, 10, question, answer);
    expect(mergeTemplateAnswers([], [], [draft]).staleDrafts).toEqual([draft]);
  });

  it("propagates a failed durable write while retaining the previously committed draft", () => {
    const storage = new MemoryStorage();
    const queue = new ScopedOfflineQueue("templates", scope, storage);
    queue.save(buildTemplateDraft(1, 10, question, answer));
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    expect(() => queue.save(buildTemplateDraft(1, 10, question, { ...answer, responseValue: "pass" }))).toThrow("Quota exceeded");
    expect(queue.read()[0].responseValue).toBe("fail");
  });
});
