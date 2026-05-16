import { useState, useDeferredValue } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  BookOpen,
  Plus,
  Search,
  Pencil,
  PowerOff,
  Power,
  AlertTriangle,
  Tag,
  Eye,
  Bot,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES: { value: string; label: string }[] = [
  { value: "sop",                label: "SOP"                       },
  { value: "code_reference",     label: "Code Reference"            },
  { value: "inspection_guidance",label: "Inspection Guidance"       },
  { value: "deficiency_wording", label: "Deficiency Wording"        },
  { value: "quote_template",     label: "Quote Template"            },
  { value: "report_template",    label: "Report Template"           },
  { value: "customer_message",   label: "Customer Message"          },
  { value: "manufacturer_manual",label: "Manufacturer Manual"       },
  { value: "site_note",          label: "Site Note"                 },
  { value: "training_note",      label: "Training Note"             },
  { value: "other",              label: "Other"                     },
];

const SYSTEM_TYPES: { value: string; label: string }[] = [
  { value: "fire_alarm",          label: "Fire Alarm"           },
  { value: "sprinkler",           label: "Sprinkler"            },
  { value: "emergency_lighting",  label: "Emergency Lighting"   },
  { value: "fire_extinguisher",   label: "Fire Extinguisher"    },
  { value: "backflow",            label: "Backflow"             },
  { value: "smoke_alarm",         label: "Smoke Alarm"          },
  { value: "general",             label: "General"              },
];

const VISIBILITY_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: "admin_office", label: "Admin / Office", description: "Visible to admin and office users" },
  { value: "technician",   label: "Technicians",    description: "Also visible to technicians in the field" },
  { value: "ai_only",      label: "AI Only",        description: "Used by AI assistant only, not shown to users" },
];

const CATEGORY_COLORS: Record<string, string> = {
  sop:                 "bg-blue-100 text-blue-700",
  code_reference:      "bg-purple-100 text-purple-700",
  inspection_guidance: "bg-green-100 text-green-700",
  deficiency_wording:  "bg-orange-100 text-orange-700",
  quote_template:      "bg-yellow-100 text-yellow-700",
  report_template:     "bg-cyan-100 text-cyan-700",
  customer_message:    "bg-pink-100 text-pink-700",
  manufacturer_manual: "bg-gray-100 text-gray-700",
  site_note:           "bg-teal-100 text-teal-700",
  training_note:       "bg-indigo-100 text-indigo-700",
  other:               "bg-muted text-muted-foreground",
};

function categoryLabel(cat: string): string {
  return CATEGORIES.find(c => c.value === cat)?.label ?? cat;
}

function systemTypeLabel(st: string | null): string | null {
  if (!st) return null;
  return SYSTEM_TYPES.find(s => s.value === st)?.label ?? st;
}

function visibilityLabel(v: string): string {
  return VISIBILITY_OPTIONS.find(o => o.value === v)?.label ?? v;
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

// ── Item type ─────────────────────────────────────────────────────────────────

type KbItem = {
  id: number;
  title: string;
  category: string;
  content: string | null;
  systemType?: string | null;
  tagsJson?: string[] | null;
  visibility: string;
  isActive: boolean;
  updatedAt: Date | string;
  uploadedById: number;
};

// ── Form dialog ───────────────────────────────────────────────────────────────

interface FormDialogProps {
  existing?: KbItem;
  onClose: () => void;
  onSaved: () => void;
}

function FormDialog({ existing, onClose, onSaved }: FormDialogProps) {
  const isEditing = !!existing;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [category, setCategory] = useState(existing?.category ?? "other");
  const [systemType, setSystemType] = useState(existing?.systemType ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [tagsRaw, setTagsRaw] = useState((existing?.tagsJson ?? []).join(", "));
  const [visibility, setVisibility] = useState(existing?.visibility ?? "admin_office");

  const utils = trpc.useUtils();
  const invalidate = () => utils.knowledgeBase.list.invalidate();

  const create = trpc.knowledgeBase.create.useMutation({
    onSuccess: () => { toast.success("Knowledge item created"); invalidate(); onSaved(); },
    onError: (e) => toast.error(e.message || "Failed to create"),
  });

  const update = trpc.knowledgeBase.update.useMutation({
    onSuccess: () => { toast.success("Knowledge item updated"); invalidate(); onSaved(); },
    onError: (e) => toast.error(e.message || "Failed to update"),
  });

  const isPending = create.isPending || update.isPending;

  function parseTags(): string[] {
    return tagsRaw.split(",").map(t => t.trim()).filter(Boolean);
  }

  function handleSave() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    if (!content.trim()) { toast.error("Content is required"); return; }

    const payload = {
      title: title.trim(),
      category,
      content: content.trim(),
      systemType: systemType || undefined,
      tagsJson: parseTags(),
      visibility: visibility as "admin_office" | "technician" | "ai_only",
      sourceType: "manual" as const,
      isActive: true,
    };

    if (isEditing && existing) {
      update.mutate({ id: existing.id, ...payload });
    } else {
      create.mutate(payload);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Knowledge Item" : "New Knowledge Item"}</DialogTitle>
          <DialogDescription>
            Knowledge items are used by the AI assistant as internal reference material.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              placeholder="e.g. ULC S536 Smoke Detector Spacing Requirements"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>System Type</Label>
              <Select value={systemType || "_none"} onValueChange={v => setSystemType(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All systems" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">All systems</SelectItem>
                  {SYSTEM_TYPES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Content *</Label>
            <Textarea
              placeholder="Paste or type the reference material here. The AI will use this as context when answering related questions."
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">{content.length.toLocaleString()} characters</p>
          </div>

          <div className="space-y-1.5">
            <Label>Tags</Label>
            <Input
              placeholder="comma-separated tags, e.g. ufc, smoke detector, spacing"
              value={tagsRaw}
              onChange={e => setTagsRaw(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Separate tags with commas</p>
          </div>

          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select value={visibility} onValueChange={setVisibility}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    <div>
                      <p>{o.label}</p>
                      <p className="text-xs text-muted-foreground">{o.description}</p>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : isEditing ? "Save Changes" : "Create Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Item card ──────────────────────────────────────────────────────────────────

function ItemCard({ item, onEdit, onToggle }: {
  item: KbItem;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const tags = (item.tagsJson ?? []) as string[];
  const stLabel = systemTypeLabel(item.systemType ?? null);

  return (
    <Card className={`border ${!item.isActive ? "opacity-60 bg-muted/30" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[item.category] ?? CATEGORY_COLORS.other}`}>
                {categoryLabel(item.category)}
              </span>
              {stLabel && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {stLabel}
                </span>
              )}
              {!item.isActive && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                  Inactive
                </span>
              )}
            </div>

            <p className="font-semibold text-sm leading-snug">{item.title}</p>

            {item.content && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {item.content.slice(0, 160)}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.slice(0, 5).map(t => (
                    <span key={t} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      <Tag className="h-2.5 w-2.5" /> {t}
                    </span>
                  ))}
                  {tags.length > 5 && (
                    <span className="text-[10px] text-muted-foreground">+{tags.length - 5} more</span>
                  )}
                </div>
              )}

              <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                <Eye className="h-3 w-3" />
                {visibilityLabel(item.visibility)}
                <span className="mx-1">·</span>
                {fmtDate(item.updatedAt)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onEdit}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-xs ${item.isActive ? "text-red-500 hover:bg-red-50" : "text-green-600 hover:bg-green-50"}`}
              onClick={onToggle}
            >
              {item.isActive
                ? <><PowerOff className="h-3 w-3 mr-1" /> Deactivate</>
                : <><Power className="h-3 w-3 mr-1" /> Activate</>
              }
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function KnowledgeBase() {
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSystemType, setFilterSystemType] = useState("");
  const [filterVisibility, setFilterVisibility] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<KbItem | undefined>();

  const deferredSearch = useDeferredValue(search);

  const utils = trpc.useUtils();
  const { data: items = [], isLoading } = trpc.knowledgeBase.list.useQuery({
    search: deferredSearch || undefined,
    category: filterCategory || undefined,
    systemType: filterSystemType || undefined,
    visibility: (filterVisibility as any) || undefined,
    includeInactive: showInactive,
    limit: 200,
  });

  const toggleActive = trpc.knowledgeBase.deactivate.useMutation({
    onSuccess: () => { toast.success("Updated"); utils.knowledgeBase.list.invalidate(); },
    onError: (e) => toast.error(e.message || "Failed"),
  });

  function openCreate() {
    setEditItem(undefined);
    setDialogOpen(true);
  }

  function openEdit(item: KbItem) {
    setEditItem(item);
    setDialogOpen(true);
  }

  const activeCount = items.filter(i => i.isActive).length;
  const inactiveCount = items.filter(i => !i.isActive).length;

  return (
    <AdminLayout title="AI Knowledge Base">
      <div className="space-y-5">

        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
          <Bot className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Knowledge Base content is internal reference material used by the AI assistant.
            Review AI output before using it in reports, quotes, or customer communication.
          </span>
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-semibold">
                {activeCount} active item{activeCount !== 1 ? "s" : ""}
              </span>
              {inactiveCount > 0 && (
                <span className="text-xs text-muted-foreground">· {inactiveCount} inactive</span>
              )}
            </div>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New Item
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search title or content…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm"
                />
              </div>

              <Select value={filterCategory || "_all"} onValueChange={v => setFilterCategory(v === "_all" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All categories</SelectItem>
                  {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterSystemType || "_all"} onValueChange={v => setFilterSystemType(v === "_all" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All systems" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All systems</SelectItem>
                  {SYSTEM_TYPES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="flex gap-2">
                <Select value={filterVisibility || "_all"} onValueChange={v => setFilterVisibility(v === "_all" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm flex-1"><SelectValue placeholder="All visibility" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_all">All visibility</SelectItem>
                    {VISIBILITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  variant={showInactive ? "secondary" : "outline"}
                  size="sm"
                  className="h-9 px-3 text-xs whitespace-nowrap"
                  onClick={() => setShowInactive(v => !v)}
                >
                  {showInactive ? "All" : "+ Inactive"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items list */}
        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground text-sm">
              {search || filterCategory || filterSystemType || filterVisibility
                ? "No items match your filters."
                : "No knowledge items yet. Click \"New Item\" to add the first one."
              }
            </p>
            {!search && !filterCategory && !filterSystemType && !filterVisibility && (
              <Button onClick={openCreate} variant="outline" className="mt-4 gap-2">
                <Plus className="h-4 w-4" /> New Item
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => (
              <ItemCard
                key={item.id}
                item={item as KbItem}
                onEdit={() => openEdit(item as KbItem)}
                onToggle={() => toggleActive.mutate({
                  id: item.id,
                  reactivate: !item.isActive,
                })}
              />
            ))}
          </div>
        )}

        {/* Quick-start guide (shown when empty) */}
        {!isLoading && items.length === 0 && !search && !filterCategory && (
          <Card className="border-dashed">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                What to add to the Knowledge Base
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>• <strong>SOPs</strong> — Standard operating procedures for inspections, reporting, billing</p>
              <p>• <strong>Code references</strong> — ULC S536, S537, NFPA 72 relevant sections</p>
              <p>• <strong>Deficiency wording</strong> — Standard phrasing for common fire alarm issues</p>
              <p>• <strong>Inspection guidance</strong> — Checklists, device-specific tips</p>
              <p>• <strong>Quote templates</strong> — Scope wording for common repair jobs</p>
              <p>• <strong>Customer message templates</strong> — Email templates for reports, invoices</p>
              <p>• <strong>Manufacturer notes</strong> — Device manuals, part compatibility</p>
            </CardContent>
          </Card>
        )}
      </div>

      {dialogOpen && (
        <FormDialog
          existing={editItem}
          onClose={() => { setDialogOpen(false); setEditItem(undefined); }}
          onSaved={() => { setDialogOpen(false); setEditItem(undefined); }}
        />
      )}
    </AdminLayout>
  );
}
