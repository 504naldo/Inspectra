import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
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
  HelpCircle, Tag, ChevronDown, ChevronUp,
} from "lucide-react";

type DeficiencyTrigger = {
  onValues: string[];
  severity: "critical" | "major" | "minor" | "observation";
  defaultTitle?: string;
};

type Item = {
  id: number;
  sectionId: number;
  itemCode: string | null;
  questionText: string;
  helpText: string | null;
  responseType: string;
  isRequired: number;
  deficiencyTrigger: unknown;
  options: unknown;
  codeReference: string | null;
};

type ResponseState = {
  responseValue: string;
  responseText: string;
  notes: string;
};

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
  onLinked,
  onSkip,
}: {
  open: boolean;
  jobId: number;
  defaultTitle: string;
  defaultSeverity: "critical" | "major" | "minor" | "observation";
  questionText: string;
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
            disabled={createMutation.isPending}
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
}: {
  item: Item;
  response: ResponseState;
  onChange: (partial: Partial<ResponseState>) => void;
  onDeficiencyLinked: (deficiencyId: number) => void;
  jobId: number;
  readOnly: boolean;
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
      return <p className="text-sm text-muted-foreground italic">{response.responseValue || response.responseText || "—"}</p>;
    }

    const opts = item.options as string[] | null;

    switch (item.responseType) {
      case "pass_fail_na":
        return <PassFailNa value={response.responseValue} onChange={handleValueChange} />;
      case "yes_no_na":
        return <YesNoNa value={response.responseValue} onChange={handleValueChange} />;
      case "text":
        return <Textarea value={response.responseText} onChange={(e) => onChange({ responseText: e.target.value })} rows={2} placeholder="Enter response…" />;
      case "number":
      case "pressure_reading":
        return <Input type="number" value={response.responseValue} onChange={(e) => onChange({ responseValue: e.target.value })} className="max-w-[160px]" />;
      case "date":
        return <Input type="date" value={response.responseValue} onChange={(e) => onChange({ responseValue: e.target.value })} className="max-w-[180px]" />;
      case "time_duration":
        return <Input value={response.responseValue} onChange={(e) => onChange({ responseValue: e.target.value })} placeholder="e.g. 45 min" className="max-w-[160px]" />;
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
              {(opts ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
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
        return <Input value={response.responseValue} onChange={(e) => onChange({ responseValue: e.target.value })} />;
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
          onLinked={(id) => { setShowDefPrompt(false); onDeficiencyLinked(id); }}
          onSkip={() => setShowDefPrompt(false)}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TemplateFormRenderer() {
  const { jobId, templateId } = useParams<{ jobId: string; templateId: string }>();
  const [, setLocation] = useLocation();

  const jId = parseInt(jobId!);
  const tId = parseInt(templateId!);

  const [responses, setResponses] = useState<Record<number, ResponseState & { deficiencyId?: number }>>({});
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = trpc.inspectionTemplate.getTemplateWithResponses.useQuery(
    { templateId: tId, jobId: jId },
    { enabled: !!tId && !!jId }
  );

  const saveResponse = trpc.inspectionTemplate.saveResponse.useMutation();

  // Pre-fill from existing responses
  useEffect(() => {
    if (!data?.responses) return;
    const init: typeof responses = {};
    for (const r of data.responses) {
      init[r.itemId] = {
        responseValue: r.responseValue ?? "",
        responseText: r.responseText ?? "",
        notes: r.notes ?? "",
        deficiencyId: r.deficiencyId ?? undefined,
      };
    }
    setResponses(init);
    // Expand all sections initially
    if (data.sections) {
      setExpandedSections(new Set(data.sections.map((s: any) => s.id)));
    }
  }, [data]);

  const handleChange = (itemId: number, partial: Partial<ResponseState>) => {
    setResponses((prev) => ({
      ...prev,
      [itemId]: { ...{ responseValue: "", responseText: "", notes: "" }, ...prev[itemId], ...partial },
    }));
  };

  const handleDeficiencyLinked = (itemId: number, deficiencyId: number) => {
    setResponses((prev) => ({ ...prev, [itemId]: { ...prev[itemId], deficiencyId } }));
  };

  const saveAll = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const items = data.items;
      await Promise.all(
        items.map((item: any) => {
          const r = responses[item.id];
          if (!r) return Promise.resolve();
          return saveResponse.mutateAsync({
            jobId: jId,
            templateId: tId,
            sectionId: item.sectionId,
            itemId: item.id,
            responseValue: r.responseValue || null,
            responseText: r.responseText || null,
            notes: r.notes || null,
            deficiencyId: r.deficiencyId ?? null,
          });
        })
      );
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center py-16 text-muted-foreground">Loading form…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center py-16 text-muted-foreground">Template not found.</div>
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
      <div className="sticky top-0 z-10 bg-card border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation(`/tech/jobs/${jId}`)} className="p-1">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{template.name}</p>
          <p className="text-xs text-muted-foreground">{answered}/{total} answered</p>
        </div>
        <Button size="sm" onClick={saveAll} disabled={saving}>
          {saving ? "Saving…" : "Save & Done"}
        </Button>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">
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
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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
                          readOnly={false}
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
          <Button className="w-full" onClick={saveAll} disabled={saving} size="lg">
            {saving ? "Saving…" : "Save & Done"}
          </Button>
        </div>
      </div>
    </div>
  );
}
