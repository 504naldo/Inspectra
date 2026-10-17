import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, XCircle, Minus, AlertTriangle,
  HelpCircle, Tag, ChevronDown, ChevronUp, WifiOff,
} from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useOfflineJobPacket } from "@/hooks/useOfflineJobPacket";
import { useOfflineScope } from "@/hooks/useOfflineScope";
import { offlineScopeKey } from "@/lib/offlineScope";
import { buildTemplateDraft, mergeTemplateAnswers, type TemplateQuestionView, type TemplateAnswer } from "@/lib/templateDrafts";

type DeficiencyTrigger = {
  onValues: string[];
  severity: "critical" | "major" | "minor" | "observation";
  defaultTitle?: string;
};

type Item = TemplateQuestionView;
type ResponseState = TemplateAnswer;

// ─── Pass/Fail/NA control ─────────────────────────────────────────────────────

function PassFailNa({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {(["pass", "fail", "na"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
            value === opt
              ? opt === "pass"
                ? "bg-[var(--success)] text-white border-[var(--success)]"
                : opt === "fail"
                ? "bg-destructive text-white border-destructive"
                : "bg-muted border-border text-muted-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          {opt === "pass" && <CheckCircle2 className="h-3.5 w-3.5" />}
          {opt === "fail" && <XCircle className="h-3.5 w-3.5" />}
          {opt === "na" && <Minus className="h-3.5 w-3.5" />}
          {opt === "pass" ? "Pass" : opt === "fail" ? "Fail" : "N/A"}
        </button>
      ))}
    </div>
  );
}

function YesNoNa({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {(["yes", "no", "na"] as const).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={`px-3 py-1.5 rounded-md border text-sm font-medium transition-colors capitalize ${
            value === opt
              ? opt === "yes"
                ? "bg-[var(--success)] text-white border-[var(--success)]"
                : opt === "no"
                ? "bg-destructive text-white border-destructive"
                : "bg-muted border-border text-muted-foreground"
              : "border-border hover:bg-muted"
          }`}
        >
          {opt === "yes" ? "Yes" : opt === "no" ? "No" : "N/A"}
        </button>
      ))}
    </div>
  );
}

// ─── Deficiency prompt dialog ──────────────────────────────────────────────────

function DeficiencyPrompt({
  open,
  jobId,
  defaultTitle,
  defaultSeverity,
  questionText,
  isOnline,
  onLinked,
  onSkip,
}: {
  open: boolean;
  jobId: number;
  defaultTitle: string;
  defaultSeverity: "critical" | "major" | "minor" | "observation";
  questionText: string;
  isOnline: boolean;
  onLinked: (deficiencyId: number) => void;
  onSkip: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle || questionText.slice(0, 100));
  const [severity, setSeverity] = useState<"critical" | "major" | "minor" | "observation">(defaultSeverity);
  const [description, setDescription] = useState("");

  const createMutation = trpc.deficiency.create.useMutation({
    onSuccess: (data) => {
      toast.success("Deficiency logged");
      onLinked(data.id);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Log a Deficiency?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This response may indicate a deficiency. Review and log it if needed.
        </p>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Severity</Label>
            <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
                <SelectItem value="observation">Observation</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Notes (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Additional details…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSkip}>Skip</Button>
          <Button
            variant="destructive"
            onClick={() => createMutation.mutate({ jobId, title, severity, description: description || undefined })}
            disabled={createMutation.isPending || !isOnline}
            title={!isOnline ? "Connect to the internet to log a deficiency" : undefined}
          >
            {createMutation.isPending ? "Logging…" : "Log Deficiency"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Single item renderer ─────────────────────────────────────────────────────

function ItemRenderer({
  item,
  response,
  onChange,
  onDeficiencyLinked,
  jobId,
  readOnly,
  isOnline,
}: {
  item: Item;
  response: ResponseState;
  onChange: (partial: Partial<ResponseState>) => void;
  onDeficiencyLinked: (deficiencyId: number) => void;
  jobId: number;
  readOnly: boolean;
  isOnline: boolean;
}) {
  const [showDefPrompt, setShowDefPrompt] = useState(false);
  const trigger = item.deficiencyTrigger as DeficiencyTrigger | null;

  const handleValueChange = (val: string) => {
    onChange({ responseValue: val });
    if (trigger && trigger.onValues.includes(val) && !readOnly) {
      setShowDefPrompt(true);
    }
  };

  const renderControl = () => {
    if (readOnly) {
      return (
        <p className="text-sm text-muted-foreground italic">{response.responseValue || response.responseText || "—"}</p>
      );
    }

    const opts = item.options as string[] | null;

    switch (item.responseType) {
      case "pass_fail_na":
        return (
          <PassFailNa value={response.responseValue} onChange={handleValueChange} />
        );
      case "yes_no_na":
        return (
          <YesNoNa value={response.responseValue} onChange={handleValueChange} />
        );
      case "text":
        return (
          <Textarea value={response.responseText} onChange={(e) => onChange({ responseText: e.target.value })} rows={2} placeholder="Enter response…" />
        );
      case "number":
      case "pressure_reading":
        return (
          <Input type="number" value={response.responseValue} onChange={(e) => onChange({ responseValue: e.target.value })} className="max-w-[160px]" />
        );
      case "date":
        return (
          <Input type="date" value={response.responseValue} onChange={(e) => onChange({ responseValue: e.target.value })} className="max-w-[180px]" />
        );
      case "time_duration":
        return (
          <Input value={response.responseValue} onChange={(e) => onChange({ responseValue: e.target.value })} placeholder="e.g. 45 min" className="max-w-[160px]" />
        );
      case "checkbox":
        return (
          <button
            type="button"
            onClick={() => handleValueChange(response.responseValue === "checked" ? "" : "checked")}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ${
              response.responseValue === "checked"
                ? "bg-[var(--success)] text-white border-[var(--success)]"
                : "border-border hover:bg-muted"
            }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            {response.responseValue === "checked" ? "Checked" : "Mark as checked"}
          </button>
        );
      case "select":
        return (
          <Select value={response.responseValue} onValueChange={handleValueChange}>
            <SelectTrigger className="max-w-[240px]"><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {(opts ?? []).map((o) => (
                <SelectItem key={o} value={o}>{o}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "multi_select":
        return (
          <div className="flex flex-wrap gap-2">
            {(opts ?? []).map((o) => {
              const selected = (response.responseValue ?? "").split(",").map((s) => s.trim()).filter(Boolean);
              const isOn = selected.includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => {
                    const next = isOn ? selected.filter((s) => s !== o) : [...selected, o];
                    onChange({ responseValue: next.join(",") });
                  }}
                  className={`px-2 py-1 rounded border text-xs font-medium transition-colors ${
                    isOn ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
                  }`}
                >
                  {o}
                </button>
              );
            })}
          </div>
        );
      default:
        return (
          <Input value={response.responseValue} onChange={(e) => onChange({ responseValue: e.target.value })} />
        );
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground font-mono mt-0.5 w-10 shrink-0">{item.itemCode ?? ""}</span>
        <div className="flex-1">
          <div className="flex items-start gap-2 flex-wrap">
            <p className="text-sm font-medium flex-1">{item.questionText}</p>
            {item.isRequired === 1 && (
              <span className="text-xs text-destructive shrink-0">*</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{item.capturedTemplateName} · Version {item.capturedTemplateVersion} · {item.capturedSectionTitle}</p>
          {item.capturedSectionDescription && <p className="text-xs text-muted-foreground">{item.capturedSectionDescription}</p>}
          {item.helpText && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <HelpCircle className="h-3 w-3" />
              {item.helpText}
            </p>
          )}
          {item.codeReference && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Tag className="h-3 w-3" />
              {item.codeReference}
            </p>
          )}
        </div>
      </div>

      <div className="pl-12 space-y-2">
        {renderControl()}

        {/* Notes input */}
        {!readOnly && response.responseValue && (
          <Input
            value={response.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Notes (optional)"
            className="text-xs h-8"
          />
        )}
      </div>

      {showDefPrompt && trigger && (
        <DeficiencyPrompt
          open={showDefPrompt}
          jobId={jobId}
          defaultTitle={trigger.defaultTitle ?? ""}
          defaultSeverity={trigger.severity}
          questionText={item.questionText}
          isOnline={isOnline}
          onLinked={(id) => { setShowDefPrompt(false); onDeficiencyLinked(id); }}
          onSkip={() => setShowDefPrompt(false)}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type TemplateFormRendererProps = {
  jobId: number;
  templateId: number;
};

export default function TemplateFormRenderer({ jobId, templateId }: TemplateFormRendererProps) {
  const [, setLocation] = useLocation();

  const jId = jobId;
  const tId = templateId;

  const isOnline = useOnlineStatus();
  const scope = useOfflineScope();
  const identity = `${scope ? offlineScopeKey(scope) : "signed-out"}:${jId}:${tId}`;
  const {
    getTemplateResponsesForJob,
    saveOfflineTemplateResponse,
    markTemplateResponsesSynced,
    clearSyncedTemplateResponses,
  } = useOfflineStorage();

  const [responseState, setResponseState] = useState<{ identity: string; values: Record<number, ResponseState> }>({ identity, values: {} });
  const responses = responseState.identity === identity ? responseState.values : {};
  const responsesRef = useRef({ identity, values: responses });
  responsesRef.current = { identity, values: responses };
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: liveData, isLoading, error: formError } = trpc.inspectionTemplate.getTemplateWithResponses.useQuery(
    { templateId: tId, jobId: jId },
    { enabled: !!tId && !!jId, retry: isOnline ? 2 : 0 }
  );
  const [failedDrafts, setFailedDrafts] = useState<{ identity: string; data: NonNullable<typeof liveData>; itemIds: number[]; error: string } | null>(null);
  const frozenForm = failedDrafts?.identity === identity ? failedDrafts : null;
  const { packet } = useOfflineJobPacket(jId);
  const cachedPacketKey = packet ? JSON.stringify(packet) : "";
  const cachedForm = useMemo((): NonNullable<typeof liveData> | undefined => {
    if (!cachedPacketKey) return undefined;
    const cached = JSON.parse(cachedPacketKey);
    const template = cached.templates?.find((template: any) => template.id === tId);
    if (!template || !Array.isArray(cached.templateItems) || !Array.isArray(cached.templateSections)) return undefined;
    const items = cached.templateItems.filter((item: any) => item.templateId === tId);
    if (items.some((item: any) => !/^inspection-capture-v1:template-question:[a-f0-9]{64}$/.test(item.questionRevision ?? ""))) return undefined;
    return { template, items, sections: cached.templateSections.filter((section: any) => section.templateId === tId),
      responses: (cached.templateResponses ?? []).filter((response: any) => response.templateId === tId), finalized: !!cached.job?.finalizedAt };
  }, [cachedPacketKey, tId]);
  const data = frozenForm?.data ?? liveData ?? (!isOnline || formError ? cachedForm : undefined);

  const saveResponse = trpc.inspectionTemplate.saveResponse.useMutation();
  const draftKey = JSON.stringify(getTemplateResponsesForJob(jId, tId));
  const draftView = useMemo(() => data ? mergeTemplateAnswers(data.items, data.responses, JSON.parse(draftKey)) : { answers: {}, staleDrafts: [] }, [data, draftKey]);
  const hasStaleOfflineAnswers = draftView.staleDrafts.length > 0;

  // Pre-fill from existing responses, then overlay any unsynced offline edits
  // for this job/template — those haven't reached the server yet, so they win.
  useEffect(() => {
    // A failed durable write keeps this exact form and the visible edits in
    // memory. Refetching must not erase them or relabel them with newer wording.
    if (!data || frozenForm) return;
    responsesRef.current = { identity, values: draftView.answers };
    setResponseState({ identity, values: draftView.answers });
  }, [data, identity, draftView, frozenForm]);
  useEffect(() => {
    if (data) setExpandedSections(new Set(data.sections.map(section => section.id)));
  }, [data, identity]);

  const handleChange = (itemId: number, partial: Partial<ResponseState>) => {
    if (!data || data.finalized || hasStaleOfflineAnswers) return;
    const item = data.items.find(item => item.id === itemId);
    if (!item) return;
    const previous = responsesRef.current.identity === identity ? responsesRef.current.values : {};
    const answer = { ...(previous[itemId] ?? { responseValue: "", responseText: "", notes: "", questionRevision: item.questionRevision }), ...partial };
    try {
      saveOfflineTemplateResponse(buildTemplateDraft(jId, tId, item, answer));
      setFailedDrafts(failed => {
        if (failed?.identity !== identity) return null;
        const itemIds = failed.itemIds.filter(id => id !== itemId);
        return itemIds.length ? { ...failed, itemIds } : null;
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The response could not be saved on this device.";
      setFailedDrafts(failed => ({ identity, data: failed?.identity === identity ? failed.data : data, itemIds: Array.from(new Set([...(failed?.identity === identity ? failed.itemIds : []), itemId])), error: message }));
      toast.error(message);
    }
    const values = { ...previous, [itemId]: answer };
    responsesRef.current = { identity, values };
    setResponseState({ identity, values });
  };

  const handleDeficiencyLinked = (itemId: number, deficiencyId: number) => {
    handleChange(itemId, { deficiencyId });
  };

  const exportUnpersistedChanges = () => {
    if (!data || !frozenForm) return;
    const drafts = frozenForm.itemIds.flatMap(itemId => {
      const item = data.items.find(item => item.id === itemId);
      const answer = responses[itemId];
      return item && answer ? [buildTemplateDraft(jId, tId, item, answer)] : [];
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify({ scope, jobId: jId, templateId: tId, reviewRequired: true, drafts }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `template-unsaved-${jId}-${tId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveAll = async () => {
    if (!data || data.finalized) return;
    if (hasStaleOfflineAnswers) {
      toast.error("Saved offline answers use a different form version. Export and review them before saving.");
      return;
    }
    setSaving(true);
    try {
      const items = data.items;

      // Persist the exact displayed question identity and answer before any
      // network call. A failed online save remains recoverable after reload.
      const submittedIds = new Set<string>();
      items.forEach((item) => {
        const r = responses[item.id];
        if (!r) return;
        const localId = `${jId}-${tId}-${item.id}`;
        submittedIds.add(localId);
        saveOfflineTemplateResponse(buildTemplateDraft(jId, tId, item, r));
      });
      setFailedDrafts(null);
      if (!isOnline) {
        toast.success("Responses saved offline — will sync when you're back online");
        setLocation(`/tech/jobs/${jId}`);
        return;
      }
      const sentDrafts = getTemplateResponsesForJob(jId, tId).filter(draft => submittedIds.has(draft.localId));
      await Promise.all(sentDrafts.map(async draft => {
        await saveResponse.mutateAsync({
          jobId: draft.jobId, templateId: draft.templateId, sectionId: draft.sectionId,
          itemId: draft.itemId, questionRevision: draft.questionRevision,
          responseValue: draft.responseValue, responseText: draft.responseText,
          notes: draft.notes, deficiencyId: draft.deficiencyId,
        });
        markTemplateResponsesSynced([draft]);
      }));
      clearSyncedTemplateResponses();
      toast.success("Responses saved");
      setLocation(`/tech/jobs/${jId}`);
    } catch {
      toast.error("Failed to save some responses");
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (id: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (isLoading && !data) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center py-16 text-muted-foreground">Loading form…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div role="alert" className="text-center py-16 text-muted-foreground">{formError?.message ?? "Template not found."}</div>
      </div>
    );
  }

  const { template, sections, items } = data;
  const sortedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const itemsBySectionId = items.reduce<Record<number, typeof items>>((acc: any, i: any) => {
    if (!acc[i.sectionId]) acc[i.sectionId] = [];
    acc[i.sectionId].push(i);
    return acc;
  }, {});

  const answered = Object.values(responses).filter((r) => r.responseValue || r.responseText).length;
  const total = items.length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-card border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation(`/tech/jobs/${jId}`)} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{template.name}</p>
          <p className="text-xs text-muted-foreground">{answered}/{total} answered</p>
        </div>
        <Button size="sm" onClick={saveAll} disabled={saving || data.finalized || hasStaleOfflineAnswers}>
          {saving ? "Saving…" : "Save & Done"}
        </Button>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
        {frozenForm && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm space-y-2"><p>Changes are still visible here but could not be saved on this device. Keep this form open and retry Save &amp; Done. {frozenForm.error}</p><Button variant="outline" size="sm" onClick={exportUnpersistedChanges}>Export unsaved changes</Button></div>}
        {hasStaleOfflineAnswers && (
          <div role="alert" className="rounded-lg border border-amber-300 p-3 space-y-2 text-sm">
            <p>Saved offline answers belong to a different version of this form and are preserved for review.</p>
            <Button variant="outline" size="sm" onClick={() => setLocation("/tech/sync")}>Review saved data</Button>
          </div>
        )}
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
            <WifiOff className="h-4 w-4 shrink-0" />
            You are offline. Responses are saved locally and will sync once you reconnect.
          </div>
        )}

        {sortedSections.map((section) => {
          const sectionItems = (itemsBySectionId[section.id] ?? []).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
          const sectionAnswered = sectionItems.filter((i: any) => responses[i.id]?.responseValue || responses[i.id]?.responseText).length;
          const isExpanded = expandedSections.has(section.id);

          return (
            <Card key={section.id}>
              <button
                className="w-full text-left"
                onClick={() => toggleSection(section.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base flex-1">{section.title}</CardTitle>
                    <Badge variant="outline" className="text-xs shrink-0">
                      {sectionAnswered}/{sectionItems.length}
                    </Badge>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  {section.description && (
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  )}
                </CardHeader>
              </button>

              {isExpanded && (
                <CardContent className="pt-0 space-y-4">
                  {sectionItems.map((item: any, idx: any) => (
                    <div key={item.id}>
                      {idx > 0 && <Separator />}
                      <div className="pt-3">
                        <ItemRenderer
                          item={item}
                          response={responses[item.id] ?? { responseValue: "", responseText: "", notes: "" }}
                          onChange={(partial) => handleChange(item.id, partial)}
                          onDeficiencyLinked={(defId) => handleDeficiencyLinked(item.id, defId)}
                          jobId={jId}
                          readOnly={data.finalized || saving || hasStaleOfflineAnswers}
                          isOnline={isOnline}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}

        {/* Bottom save */}
        <div className="py-4">
          <Button className="w-full" onClick={saveAll} disabled={saving || data.finalized || hasStaleOfflineAnswers} size="lg">
            {saving ? "Saving…" : "Save & Done"}
          </Button>
        </div>
      </div>
    </div>
  );
}
