import { useState } from "react";
import { useParams, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowLeft, Plus, Pencil, Trash2, ChevronUp, ChevronDown, CheckCircle2,
  Circle, HelpCircle, AlertTriangle, Tag,
} from "lucide-react";
import {
  TEMPLATE_SYSTEM_TYPES,
  TEMPLATE_INSPECTION_TYPES,
  TEMPLATE_FREQUENCIES,
  TEMPLATE_RESPONSE_TYPES,
  type TemplateStatus,
  type TemplateResponseType,
} from "../../../../drizzle/schema";

// ─── Label maps ───────────────────────────────────────────────────────────────

const SYSTEM_LABELS: Record<string, string> = {
  fire_alarm: "Fire Alarm", sprinkler: "Sprinkler", emergency_lighting: "Emergency Lighting",
  fire_extinguisher: "Fire Extinguisher", backflow: "Backflow", smoke_alarm: "Smoke Alarm",
  smoke_control: "Smoke Control", fire_pump: "Fire Pump", standpipe: "Standpipe", general: "General",
};

const INSPECTION_TYPE_LABELS: Record<string, string> = {
  annual: "Annual", semi_annual: "Semi-Annual", quarterly: "Quarterly",
  monthly: "Monthly", service: "Service", verification: "Verification", custom: "Custom",
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly", quarterly: "Quarterly", semi_annual: "Semi-Annual", annual: "Annual", other: "Other",
};

const RESPONSE_TYPE_LABELS: Record<string, string> = {
  pass_fail_na: "Pass / Fail / N/A",
  yes_no_na: "Yes / No / N/A",
  text: "Text (free form)",
  number: "Number",
  date: "Date",
  select: "Single Select",
  multi_select: "Multi Select",
  checkbox: "Checkbox",
  pressure_reading: "Pressure Reading",
  time_duration: "Time / Duration",
};

const STATUS_COLORS: Record<TemplateStatus, string> = {
  draft: "secondary", active: "default", archived: "outline",
};

// ─── Add/Edit Section Dialog ───────────────────────────────────────────────────

function SectionDialog({
  templateId,
  existing,
  onClose,
  onSaved,
}: {
  templateId: number;
  existing?: { id: number; title: string; description: string | null; isRequired: number };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [isRequired, setIsRequired] = useState(existing ? existing.isRequired === 1 : true);

  const addMutation = trpc.inspectionTemplate.addSection.useMutation({
    onSuccess: () => { toast.success("Section added"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.inspectionTemplate.updateSection.useMutation({
    onSuccess: () => { toast.success("Section updated"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending = addMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (existing) {
      updateMutation.mutate({ id: existing.id, title: title.trim(), description: description || undefined, isRequired });
    } else {
      addMutation.mutate({ templateId, title: title.trim(), description: description || undefined, isRequired });
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Section" : "Add Section"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Control Panel Inspection" autoFocus />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional guidance for this section" rows={2} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="req-section">Required section</Label>
            <Switch id="req-section" checked={isRequired} onCheckedChange={setIsRequired} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add/Edit Item Dialog ─────────────────────────────────────────────────────

function ItemDialog({
  templateId,
  sectionId,
  existing,
  onClose,
  onSaved,
}: {
  templateId: number;
  sectionId: number;
  existing?: {
    id: number;
    itemCode: string | null;
    questionText: string;
    helpText: string | null;
    responseType: string;
    isRequired: number;
    deficiencyTrigger: unknown;
    options: unknown;
    codeReference: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [questionText, setQuestionText] = useState(existing?.questionText ?? "");
  const [helpText, setHelpText] = useState(existing?.helpText ?? "");
  const [itemCode, setItemCode] = useState(existing?.itemCode ?? "");
  const [responseType, setResponseType] = useState(existing?.responseType ?? "pass_fail_na");
  const [isRequired, setIsRequired] = useState(existing ? existing.isRequired === 1 : true);
  const [codeReference, setCodeReference] = useState(existing?.codeReference ?? "");
  const [optionsText, setOptionsText] = useState(() => {
    const opts = existing?.options as string[] | null;
    return opts ? opts.join("\n") : "";
  });
  const [enableTrigger, setEnableTrigger] = useState(() => !!existing?.deficiencyTrigger);
  const [triggerValues, setTriggerValues] = useState(() => {
    const dt = existing?.deficiencyTrigger as { onValues?: string[]; severity?: string; defaultTitle?: string } | null;
    return dt?.onValues?.join(",") ?? "fail";
  });
  const [triggerSeverity, setTriggerSeverity] = useState(() => {
    const dt = existing?.deficiencyTrigger as { onValues?: string[]; severity?: string } | null;
    return dt?.severity ?? "major";
  });
  const [triggerTitle, setTriggerTitle] = useState(() => {
    const dt = existing?.deficiencyTrigger as { defaultTitle?: string } | null;
    return dt?.defaultTitle ?? "";
  });

  const addMutation = trpc.inspectionTemplate.addItem.useMutation({
    onSuccess: () => { toast.success("Item added"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.inspectionTemplate.updateItem.useMutation({
    onSuccess: () => { toast.success("Item updated"); onSaved(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending = addMutation.isPending || updateMutation.isPending;
  const showOptions = ["select", "multi_select"].includes(responseType);

  const buildPayload = () => ({
    itemCode: itemCode.trim() || undefined,
    questionText: questionText.trim(),
    helpText: helpText.trim() || undefined,
    responseType,
    isRequired,
    codeReference: codeReference.trim() || undefined,
    options: showOptions && optionsText.trim()
      ? optionsText.split("\n").map((s) => s.trim()).filter(Boolean)
      : undefined,
    deficiencyTrigger: enableTrigger
      ? {
          onValues: triggerValues.split(",").map((s) => s.trim()).filter(Boolean),
          severity: triggerSeverity as "critical" | "major" | "minor" | "observation",
          defaultTitle: triggerTitle.trim() || undefined,
        }
      : undefined,
  });

  const handleSave = () => {
    if (!questionText.trim()) { toast.error("Question text is required"); return; }
    if (existing) {
      updateMutation.mutate({ id: existing.id, ...buildPayload() });
    } else {
      addMutation.mutate({ templateId, sectionId, ...buildPayload() });
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Item" : "Add Item"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <Label>Question / Check *</Label>
            <Textarea value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="e.g. Is the control panel free of faults?" rows={2} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Item Code</Label>
              <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="e.g. FA-1.1" />
            </div>
            <div className="space-y-1">
              <Label>Response Type</Label>
              <Select value={responseType} onValueChange={setResponseType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_RESPONSE_TYPES.map((r) => (
                    <SelectItem key={r} value={r}>{RESPONSE_TYPE_LABELS[r] ?? r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {showOptions && (
            <div className="space-y-1">
              <Label>Options (one per line)</Label>
              <Textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={"Option A\nOption B\nOption C"}
                rows={3}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label>Help Text</Label>
            <Input value={helpText} onChange={(e) => setHelpText(e.target.value)} placeholder="Optional guidance shown to technician" />
          </div>
          <div className="space-y-1">
            <Label>Code Reference</Label>
            <Input value={codeReference} onChange={(e) => setCodeReference(e.target.value)} placeholder="e.g. NFPA 72 §14.2.1" />
          </div>
          <div className="flex items-center justify-between">
            <Label>Required item</Label>
            <Switch checked={isRequired} onCheckedChange={setIsRequired} />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label>Deficiency trigger</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Prompt technician to log a deficiency on specific responses</p>
              </div>
              <Switch checked={enableTrigger} onCheckedChange={setEnableTrigger} />
            </div>
            {enableTrigger && (
              <div className="pl-3 border-l border-border/50 space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Trigger on values (comma-separated)</Label>
                  <Input value={triggerValues} onChange={(e) => setTriggerValues(e.target.value)} placeholder="fail,no" />
                  <p className="text-xs text-muted-foreground">e.g. "fail" for pass/fail, "no" for yes/no</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Default severity</Label>
                  <Select value={triggerSeverity} onValueChange={setTriggerSeverity}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                      <SelectItem value="observation">Observation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Default deficiency title (optional)</Label>
                  <Input value={triggerTitle} onChange={(e) => setTriggerTitle(e.target.value)} placeholder="e.g. Control panel fault detected" />
                </div>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function InspectionTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const templateId = parseInt(id!);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [sectionDialog, setSectionDialog] = useState<"add" | number | null>(null);
  const [itemDialog, setItemDialog] = useState<{ sectionId: number; itemId?: number } | null>(null);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaName, setMetaName] = useState("");
  const [metaDesc, setMetaDesc] = useState("");
  const [metaStatus, setMetaStatus] = useState<TemplateStatus>("draft");

  const utils = trpc.useUtils();
  const refetch = () => utils.inspectionTemplate.get.invalidate({ id: templateId });

  const { data, isLoading } = trpc.inspectionTemplate.get.useQuery(
    { id: templateId },
    { enabled: !!templateId && !!user?.companyId }
  );

  const updateMutation = trpc.inspectionTemplate.update.useMutation({
    onSuccess: () => { toast.success("Template updated"); setEditingMeta(false); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteSectionMutation = trpc.inspectionTemplate.deleteSection.useMutation({
    onSuccess: () => { toast.success("Section deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteItemMutation = trpc.inspectionTemplate.deleteItem.useMutation({
    onSuccess: () => { toast.success("Item deleted"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const reorderSectionsMutation = trpc.inspectionTemplate.reorderSections.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  const reorderItemsMutation = trpc.inspectionTemplate.reorderItems.useMutation({
    onSuccess: () => refetch(),
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <AdminLayout title="Loading…"><div className="py-16 text-center text-muted-foreground">Loading template…</div></AdminLayout>;
  }

  if (!data) {
    return <AdminLayout title="Not Found"><div className="py-16 text-center text-muted-foreground">Template not found.</div></AdminLayout>;
  }

  const { template, sections, items } = data;

  const itemsBySectionId = items.reduce<Record<number, typeof items>>((acc: any, item: any) => {
    if (!acc[item.sectionId]) acc[item.sectionId] = [];
    acc[item.sectionId].push(item);
    return acc;
  }, {});

  const moveSection = (idx: number, dir: -1 | 1) => {
    const ordered = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
    const target = ordered[idx + dir];
    if (!target) return;
    const current = ordered[idx];
    const newOrder = ordered.map((s) => s.id);
    newOrder.splice(idx, 1);
    newOrder.splice(idx + dir, 0, current.id);
    reorderSectionsMutation.mutate({ templateId, orderedIds: newOrder });
  };

  const moveItem = (sectionId: number, idx: number, dir: -1 | 1) => {
    const sectionItems = (itemsBySectionId[sectionId] ?? []).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    if (!sectionItems[idx + dir]) return;
    const newOrder = sectionItems.map((i: any) => i.id);
    const [moved] = newOrder.splice(idx, 1);
    newOrder.splice(idx + dir, 0, moved);
    reorderItemsMutation.mutate({ sectionId, orderedIds: newOrder });
  };

  const sortedSections = [...sections].sort((a, b) => a.sortOrder - b.sortOrder);
  const totalItems = items.length;

  const openEditMeta = () => {
    setMetaName(template.name);
    setMetaDesc(template.description ?? "");
    setMetaStatus(template.status);
    setEditingMeta(true);
  };

  const editingSection = sectionDialog !== "add" && sectionDialog !== null
    ? sections.find((s: any) => s.id === sectionDialog)
    : undefined;
  const editingItem = itemDialog?.itemId != null
    ? items.find((i: any) => i.id === itemDialog!.itemId)
    : undefined;

  return (
    <AdminLayout title="">
      <div className="space-y-6 max-w-4xl">
        {/* Back + header */}
        <div className="flex items-start gap-3">
          <Link href="/admin/inspection-templates">
            <Button variant="ghost" size="icon" className="shrink-0 mt-0.5">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold truncate">{template.name}</h1>
              <Badge
                variant={(STATUS_COLORS as any)[template.status] as "default" | "secondary" | "outline"}
                className="capitalize"
              >
                {template.status}
              </Badge>
            </div>
            <div className="flex gap-2 flex-wrap mt-1">
              <span className="text-xs text-muted-foreground">{SYSTEM_LABELS[template.systemType] ?? template.systemType}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{INSPECTION_TYPE_LABELS[template.inspectionType] ?? template.inspectionType}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{FREQUENCY_LABELS[template.frequency] ?? template.frequency}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">{sections.length} sections, {totalItems} items</span>
            </div>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={openEditMeta}>
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit Info
              </Button>
              {template.status === "draft" && (
                <Button
                  size="sm"
                  onClick={() => updateMutation.mutate({ id: templateId, status: "active" })}
                  disabled={updateMutation.isPending}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Activate
                </Button>
              )}
              {template.status === "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateMutation.mutate({ id: templateId, status: "draft" })}
                  disabled={updateMutation.isPending}
                >
                  Revert to Draft
                </Button>
              )}
            </div>
          )}
        </div>

        {template.description && (
          <p className="text-sm text-muted-foreground">{template.description}</p>
        )}

        {/* Sections */}
        {sortedSections.map((section, sIdx) => {
          const sectionItems = (itemsBySectionId[section.id] ?? []).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
          return (
            <Card key={section.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      {section.isRequired === 1 ? (
                        <Circle className="h-3 w-3 text-primary fill-primary shrink-0" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground shrink-0" />
                      )}
                      {section.title}
                    </CardTitle>
                    {section.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 pl-5">{section.description}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={sIdx === 0}
                        onClick={() => moveSection(sIdx, -1)}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={sIdx === sortedSections.length - 1}
                        onClick={() => moveSection(sIdx, 1)}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setSectionDialog(section.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`Delete section "${section.title}" and all its items?`)) {
                            deleteSectionMutation.mutate({ id: section.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {sectionItems.length === 0 && (
                  <p className="text-sm text-muted-foreground pl-5 py-2 italic">No items yet.</p>
                )}
                <div className="space-y-1">
                  {sectionItems.map((item: any, iIdx: any) => {
                    const hasTrigger = !!item.deficiencyTrigger;
                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 py-2 px-2 rounded-md hover:bg-muted/40 group"
                      >
                        <span className="text-xs text-muted-foreground font-mono mt-0.5 w-8 shrink-0">
                          {item.itemCode ?? `${sIdx + 1}.${iIdx + 1}`}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{item.questionText}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {RESPONSE_TYPE_LABELS[item.responseType] ?? item.responseType}
                            </span>
                            {item.isRequired === 0 && (
                              <span className="text-xs text-muted-foreground">optional</span>
                            )}
                            {hasTrigger && (
                              <span className="text-xs text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                deficiency trigger
                              </span>
                            )}
                            {item.helpText && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <HelpCircle className="h-3 w-3" />
                                {item.helpText}
                              </span>
                            )}
                            {item.codeReference && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                {item.codeReference}
                              </span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              disabled={iIdx === 0}
                              onClick={() => moveItem(section.id, iIdx, -1)}
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              disabled={iIdx === sectionItems.length - 1}
                              onClick={() => moveItem(section.id, iIdx, 1)}
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setItemDialog({ sectionId: section.id, itemId: item.id })}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Delete this item?")) {
                                  deleteItemMutation.mutate({ id: item.id });
                                }
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 ml-1 text-xs h-7"
                    onClick={() => setItemDialog({ sectionId: section.id })}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Item
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* Add Section */}
        {isAdmin && (
          <Button
            variant="outline"
            onClick={() => setSectionDialog("add")}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Section
          </Button>
        )}

        {/* Empty state */}
        {sections.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No sections yet. Add a section to start building this template.
          </div>
        )}
      </div>

      {/* Edit Meta Dialog */}
      {editingMeta && (
        <Dialog open onOpenChange={(v) => { if (!v) setEditingMeta(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Edit Template Info</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input value={metaName} onChange={(e) => setMetaName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea value={metaDesc} onChange={(e) => setMetaDesc(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={metaStatus} onValueChange={(v) => setMetaStatus(v as TemplateStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingMeta(false)}>Cancel</Button>
              <Button
                onClick={() => updateMutation.mutate({ id: templateId, name: metaName, description: metaDesc || undefined, status: metaStatus })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Section Dialog */}
      {sectionDialog !== null && (
        <SectionDialog
          templateId={templateId}
          existing={editingSection}
          onClose={() => setSectionDialog(null)}
          onSaved={() => { setSectionDialog(null); refetch(); }}
        />
      )}

      {/* Item Dialog */}
      {itemDialog !== null && (
        <ItemDialog
          templateId={templateId}
          sectionId={itemDialog.sectionId}
          existing={editingItem}
          onClose={() => setItemDialog(null)}
          onSaved={() => { setItemDialog(null); refetch(); }}
        />
      )}
    </AdminLayout>
  );
}
