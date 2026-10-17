import type { OfflineTemplateResponse } from "@shared/types";

export type TemplateQuestionView = {
  id: number; sectionId: number; questionRevision: string;
  itemCode: string | null; questionText: string; helpText: string | null;
  responseType: string; isRequired: number; sortOrder?: number;
  deficiencyTrigger: unknown; options: unknown; codeReference: string | null;
  capturedTemplateName: string; capturedTemplateVersion: number;
  capturedSectionTitle: string; capturedSectionDescription: string | null;
};
export type TemplateAnswer = {
  responseValue: string; responseText: string; notes: string;
  questionRevision?: string; deficiencyId?: number;
};

/** Persist the identity and context of what was shown, including explicit clears. */
export function buildTemplateDraft(jobId: number, templateId: number, item: TemplateQuestionView, answer: TemplateAnswer): OfflineTemplateResponse {
  if (!item.questionRevision || answer.questionRevision && answer.questionRevision !== item.questionRevision)
    throw new Error("The answer belongs to a different displayed question version. Review its saved data before editing.");
  return {
    localId: `${jobId}-${templateId}-${item.id}`, jobId, templateId, sectionId: item.sectionId, itemId: item.id,
    questionRevision: item.questionRevision,
    questionContext: { ...item, jobId, templateId },
    responseValue: answer.responseValue || null, responseText: answer.responseText || null,
    notes: answer.notes || null, deficiencyId: answer.deficiencyId ?? null, synced: false,
  };
}

/** A refetch may update the form, but can only overlay drafts of that exact revision. */
export function mergeTemplateAnswers(
  items: readonly TemplateQuestionView[],
  saved: readonly { itemId: number; responseValue?: string | null; responseText?: string | null; notes?: string | null; deficiencyId?: number | null }[],
  drafts: readonly OfflineTemplateResponse[],
) {
  const displayed = new Map(items.map(item => [item.id, item]));
  const answers: Record<number, TemplateAnswer> = {};
  for (const response of saved) {
    const item = displayed.get(response.itemId);
    if (!item) continue;
    answers[item.id] = { responseValue: response.responseValue ?? "", responseText: response.responseText ?? "", notes: response.notes ?? "", deficiencyId: response.deficiencyId ?? undefined, questionRevision: item.questionRevision };
  }
  const staleDrafts: OfflineTemplateResponse[] = [];
  for (const draft of drafts) {
    if (draft.synced) continue;
    const item = displayed.get(draft.itemId);
    if (!item || item.questionRevision !== draft.questionRevision) { staleDrafts.push(draft); continue; }
    answers[item.id] = { responseValue: draft.responseValue ?? "", responseText: draft.responseText ?? "", notes: draft.notes ?? "", deficiencyId: draft.deficiencyId ?? undefined, questionRevision: draft.questionRevision };
  }
  return { answers, staleDrafts };
}
