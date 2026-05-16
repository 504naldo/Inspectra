import AdminLayout from "@/components/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link } from "wouter";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  XCircle,
  Archive,
  StickyNote,
  Info,
  Calendar,
  User,
  Bot,
  Copy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type QaFilter = "all" | "generated" | "corrections_required" | "approved" | "sent" | "archived" | "field_complete";

type QueueItem = {
  reportId: number | null;
  jobId: number;
  jobNumber: string;
  jobType: string | null;
  reportNumber: string | null;
  siteName: string | null;
  customerName: string | null;
  technicianName: string | null;
  completedAt: Date | string | null;
  generatedAt: Date | string | null;
  status: string;
  deficiencyCount: number;
  openDeficiencyCount: number;
  fileUrl: string | null;
  qaNote: string | null;
  approvedAt: Date | string | null;
  lastUpdated: Date | string;
  href: string;
  qaHref: string;
  jobHref: string;
};

type DialogMode = "corrections" | "approve" | "sent" | "archive" | "note";

// ── Status helpers ─────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "generated":           return <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">Needs Review</Badge>;
    case "corrections_required": return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Corrections Required</Badge>;
    case "approved":             return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Approved</Badge>;
    case "sent":                 return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Sent</Badge>;
    case "archived":             return <Badge className="bg-muted text-muted-foreground text-xs">Archived</Badge>;
    case "field_complete":       return <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">No Report</Badge>;
    case "draft":                return <Badge className="bg-muted text-muted-foreground text-xs">Draft</Badge>;
    default:                     return <Badge className="text-xs">{status}</Badge>;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "generated":            return <FileText className="h-4 w-4 text-blue-500" />;
    case "corrections_required": return <XCircle className="h-4 w-4 text-red-500" />;
    case "approved":             return <ShieldCheck className="h-4 w-4 text-green-500" />;
    case "sent":                 return <Send className="h-4 w-4 text-emerald-500" />;
    case "archived":             return <Archive className="h-4 w-4 text-muted-foreground" />;
    case "field_complete":       return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    default:                     return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

function jobTypeLabel(t: string | null): string {
  if (!t) return "Inspection";
  const map: Record<string, string> = {
    annual: "Annual", semi_annual: "Semi-Annual", quarterly: "Quarterly",
    monthly: "Monthly", service_call: "Service Call", repair: "Repair",
  };
  return map[t] ?? t;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-CA");
}

function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS: { value: QaFilter; label: string; countKey: string }[] = [
  { value: "generated",           label: "Needs Review",        countKey: "generated" },
  { value: "corrections_required", label: "Corrections",         countKey: "corrections_required" },
  { value: "approved",            label: "Approved",            countKey: "approved" },
  { value: "sent",                label: "Sent",                countKey: "sent" },
  { value: "field_complete",      label: "No Report",           countKey: "field_complete" },
  { value: "archived",            label: "Archived",            countKey: "archived" },
  { value: "all",                 label: "All",                 countKey: "all" },
];

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  count,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`cursor-pointer hover:shadow-md transition-shadow ${count > 0 ? "" : "opacity-60"}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className={`p-2 rounded-lg w-fit ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-2xl font-bold mt-3">{count}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}

// ── Dialog modes ──────────────────────────────────────────────────────────────

const DIALOG_CONFIG: Record<DialogMode, { title: string; description: string; noteLabel: string; noteRequired: boolean; submitLabel: string; submitVariant?: "destructive" }> = {
  corrections: {
    title: "Request Corrections",
    description: "Describe what needs to be corrected before this report can be approved.",
    noteLabel: "Correction notes (required)",
    noteRequired: true,
    submitLabel: "Request Corrections",
    submitVariant: "destructive",
  },
  approve: {
    title: "Approve Report",
    description: "Approve this report. It will be ready to send to the customer.",
    noteLabel: "Approval note (optional)",
    noteRequired: false,
    submitLabel: "Approve Report",
  },
  sent: {
    title: "Mark as Sent",
    description: "Mark this report as sent to the customer.",
    noteLabel: "Sending note (optional — e.g. email address sent to)",
    noteRequired: false,
    submitLabel: "Mark Sent",
  },
  archive: {
    title: "Archive Report",
    description: "Archive this report. It will no longer appear in the active queue.",
    noteLabel: "Archive reason (optional)",
    noteRequired: false,
    submitLabel: "Archive",
  },
  note: {
    title: "Add QA Note",
    description: "Add or update a note on this report.",
    noteLabel: "Note",
    noteRequired: true,
    submitLabel: "Save Note",
  },
};

// ── Queue item card ────────────────────────────────────────────────────────────

function QueueCard({
  item,
  onAction,
}: {
  item: QueueItem;
  onAction: (mode: DialogMode, item: QueueItem) => void;
}) {
  const isFieldComplete = item.status === "field_complete";
  const hasReport = item.reportId != null;
  const [aiOpen, setAiOpen] = useState(false);
  const [aiContent, setAiContent] = useState("");
  const aiAsk = trpc.aiAssistant.ask.useMutation({
    onSuccess: (d) => { setAiContent(d.answer); setAiOpen(true); },
    onError: (e) => toast.error(e.message || "AI request failed"),
  });

  return (
    <Card className={`border ${item.status === "corrections_required" ? "border-red-200" : item.status === "generated" ? "border-blue-200" : ""}`}>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          {/* Left: icon + status */}
          <div className="flex items-center gap-2 sm:flex-col sm:items-center sm:w-12 shrink-0">
            {statusIcon(item.status)}
            <div className="sm:hidden">{statusBadge(item.status)}</div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-sm">{item.jobNumber}</span>
              {item.reportNumber && (
                <span className="text-xs text-muted-foreground">· {item.reportNumber}</span>
              )}
              <div className="hidden sm:block">{statusBadge(item.status)}</div>
              {item.openDeficiencyCount > 0 && (
                <Badge className="bg-orange-100 text-orange-700 border-orange-200 text-xs">
                  <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                  {item.openDeficiencyCount} open def.
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground mb-2">
              {item.siteName && (
                <span className="truncate">{item.siteName}</span>
              )}
              {item.customerName && (
                <span className="truncate">{item.customerName}</span>
              )}
              {item.technicianName && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {item.technicianName}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {item.completedAt ? `Completed ${fmtDate(item.completedAt)}` : "Not completed"}
                {item.generatedAt && ` · Generated ${timeAgo(item.generatedAt)}`}
              </span>
              {item.jobType && (
                <span>{jobTypeLabel(item.jobType)}</span>
              )}
              {item.deficiencyCount > 0 && (
                <span>{item.deficiencyCount} deficienc{item.deficiencyCount === 1 ? "y" : "ies"}</span>
              )}
            </div>

            {/* QA note */}
            {item.qaNote && (
              <div className="mt-1 px-2 py-1.5 bg-amber-50 border border-amber-100 rounded text-xs text-amber-800 flex items-start gap-1.5">
                <StickyNote className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{item.qaNote}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-1.5 sm:flex-col sm:items-end shrink-0">
            {/* Navigation actions */}
            <Link href={item.qaHref}>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <ClipboardCheck className="h-3 w-3 mr-1" />
                QA Check
              </Button>
            </Link>
            {hasReport && item.fileUrl && (
              <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  <FileText className="h-3 w-3 mr-1" />
                  PDF
                  <ExternalLink className="h-2.5 w-2.5 ml-1" />
                </Button>
              </a>
            )}
            <Link href={item.jobHref}>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                <ExternalLink className="h-3 w-3 mr-1" />
                Job
              </Button>
            </Link>
            {hasReport && item.reportId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary hover:bg-primary/10"
                disabled={aiAsk.isPending}
                onClick={() => aiAsk.mutate({
                  message: "Summarize this report's key issues and draft a correction note I could share with the technician.",
                  mode: "report_qa",
                  contextType: "report",
                  contextId: item.reportId!,
                })}
              >
                {aiAsk.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Bot className="h-3 w-3 mr-1" />}
                Ask AI
              </Button>
            )}

            {/* Status mutations (only for reports, not field_complete) */}
            {!isFieldComplete && hasReport && (
              <div className="flex flex-wrap gap-1.5 sm:flex-col sm:items-end border-t sm:border-t-0 sm:border-l sm:pl-2 pt-1.5 sm:pt-0 mt-1.5 sm:mt-0 w-full sm:w-auto">
                {item.status !== "approved" && item.status !== "sent" && item.status !== "archived" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => onAction("approve", item)}
                  >
                    <ShieldCheck className="h-3 w-3 mr-1" />
                    Approve
                  </Button>
                )}
                {item.status !== "corrections_required" && item.status !== "sent" && item.status !== "archived" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                    onClick={() => onAction("corrections", item)}
                  >
                    <ShieldAlert className="h-3 w-3 mr-1" />
                    Corrections
                  </Button>
                )}
                {item.status === "approved" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => onAction("sent", item)}
                  >
                    <Send className="h-3 w-3 mr-1" />
                    Mark Sent
                  </Button>
                )}
                {item.status !== "archived" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => onAction("note", item)}
                  >
                    <StickyNote className="h-3 w-3 mr-1" />
                    Note
                  </Button>
                )}
                {item.status !== "archived" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => onAction("archive", item)}
                  >
                    <Archive className="h-3 w-3 mr-1" />
                    Archive
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" /> AI Draft — Report QA
            </DialogTitle>
            <DialogDescription>Review before use. AI suggestions are drafts only.</DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm max-h-72 overflow-y-auto border rounded-md p-3 bg-muted/30">
            {aiContent}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { navigator.clipboard.writeText(aiContent); toast.success("Copied to clipboard"); }}
            >
              <Copy className="h-3.5 w-3.5 mr-1" /> Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAiOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ReportQA() {
  const [filter, setFilter] = useState<QaFilter>("generated");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("corrections");
  const [activeItem, setActiveItem] = useState<QueueItem | null>(null);
  const [noteText, setNoteText] = useState("");

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.reportQa.listQueue.useQuery(
    { filter, limit: 100 },
    { staleTime: 30_000 },
  );

  const items = data?.items ?? [];
  const counts = data?.counts ?? {};

  const invalidate = () => {
    utils.reportQa.listQueue.invalidate();
  };

  const approveReport = trpc.reportQa.approveReport.useMutation({
    onSuccess: () => { toast.success("Report approved"); setDialogOpen(false); invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to approve"),
  });

  const requestCorrections = trpc.reportQa.requestCorrections.useMutation({
    onSuccess: () => { toast.success("Corrections requested"); setDialogOpen(false); invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to request corrections"),
  });

  const markSent = trpc.reportQa.markSent.useMutation({
    onSuccess: () => { toast.success("Report marked as sent"); setDialogOpen(false); invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to update"),
  });

  const archiveReport = trpc.reportQa.archiveReport.useMutation({
    onSuccess: () => { toast.success("Report archived"); setDialogOpen(false); invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to archive"),
  });

  const addQaNote = trpc.reportQa.addQaNote.useMutation({
    onSuccess: () => { toast.success("Note saved"); setDialogOpen(false); invalidate(); },
    onError: (e) => toast.error(e.message || "Failed to save note"),
  });

  const openDialog = (mode: DialogMode, item: QueueItem) => {
    setDialogMode(mode);
    setActiveItem(item);
    setNoteText(mode === "note" ? (item.qaNote ?? "") : "");
    setDialogOpen(true);
  };

  const handleDialogSubmit = () => {
    if (!activeItem?.reportId) return;
    const id = activeItem.reportId;
    const cfg = DIALOG_CONFIG[dialogMode];
    if (cfg.noteRequired && !noteText.trim()) {
      toast.error("Please add a note");
      return;
    }
    const note = noteText.trim() || undefined;
    switch (dialogMode) {
      case "approve":      approveReport.mutate({ reportId: id, note }); break;
      case "corrections":  requestCorrections.mutate({ reportId: id, note: noteText.trim() }); break;
      case "sent":         markSent.mutate({ reportId: id, note }); break;
      case "archive":      archiveReport.mutate({ reportId: id, note }); break;
      case "note":         addQaNote.mutate({ reportId: id, note: noteText.trim() }); break;
    }
  };

  const isPending =
    approveReport.isPending ||
    requestCorrections.isPending ||
    markSent.isPending ||
    archiveReport.isPending ||
    addQaNote.isPending;

  const dlgCfg = DIALOG_CONFIG[dialogMode];

  return (
    <AdminLayout title="Report QA Queue">
      <div className="space-y-5">

        {/* ── Overview cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard icon={FileText}    label="Needs Review"    count={counts.generated ?? 0}            color="bg-blue-100 text-blue-600"    onClick={() => setFilter("generated")} />
          <StatCard icon={ShieldAlert} label="Corrections Req" count={counts.corrections_required ?? 0} color="bg-red-100 text-red-600"      onClick={() => setFilter("corrections_required")} />
          <StatCard icon={ShieldCheck} label="Approved"        count={counts.approved ?? 0}             color="bg-green-100 text-green-600"  onClick={() => setFilter("approved")} />
          <StatCard icon={Send}        label="Sent"            count={counts.sent ?? 0}                 color="bg-emerald-100 text-emerald-600" onClick={() => setFilter("sent")} />
          <StatCard icon={AlertTriangle} label="No Report"    count={counts.field_complete ?? 0}       color="bg-amber-100 text-amber-600"  onClick={() => setFilter("field_complete")} />
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Tab bar */}
          <div className="flex flex-wrap gap-1">
            {TABS.map((tab) => {
              const cnt = counts[tab.countKey] ?? 0;
              return (
                <Button
                  key={tab.value}
                  variant={filter === tab.value ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setFilter(tab.value)}
                >
                  {tab.label}
                  {cnt > 0 && (
                    <span className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none ${
                      tab.value === "generated" ? "bg-blue-500 text-white" :
                      tab.value === "corrections_required" ? "bg-red-500 text-white" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {cnt}
                    </span>
                  )}
                </Button>
              );
            })}
          </div>

          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* ── Queue ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium text-muted-foreground">
                {filter === "generated" ? "No reports awaiting review" :
                 filter === "corrections_required" ? "No reports with pending corrections" :
                 filter === "approved" ? "No approved reports" :
                 filter === "sent" ? "No sent reports" :
                 filter === "field_complete" ? "All completed jobs have reports" :
                 "No reports in this queue"}
              </p>
              {filter === "generated" && (
                <p className="text-sm text-muted-foreground">
                  Reports move here when a PDF is generated from the{" "}
                  <Link href="/admin/reports">
                    <span className="text-primary underline cursor-pointer">Reports</span>
                  </Link>{" "}
                  page.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{items.length} item{items.length !== 1 ? "s" : ""}</p>
            {(items as QueueItem[]).map((item, i) => (
              <QueueCard
                key={item.reportId ?? `job-${item.jobId}-${i}`}
                item={item}
                onAction={openDialog}
              />
            ))}
          </div>
        )}

        {/* ── Info banner ── */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Workflow:</strong> Generate PDF on the <Link href="/admin/reports"><span className="text-primary underline cursor-pointer">Reports page</span></Link> → report appears here as "Needs Review" → run QA Check → Approve or Request Corrections → Mark Sent.</p>
              <p><strong>Field Complete</strong> = job marked complete but no PDF generated yet. Use QA Check to review the inspection data, then generate a PDF.</p>
              <p><strong>Existing QA Check</strong> at <code>/admin/qa/:jobId</code> still works and is linked from each queue item.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Action dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{dlgCfg.title}</DialogTitle>
            <DialogDescription>{dlgCfg.description}</DialogDescription>
          </DialogHeader>

          {activeItem && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded px-3 py-2">
              <span className="font-medium">{activeItem.jobNumber}</span>
              {activeItem.reportNumber && <span> · {activeItem.reportNumber}</span>}
              {activeItem.siteName && <span> · {activeItem.siteName}</span>}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">{dlgCfg.noteLabel}</label>
            <Textarea
              placeholder={dlgCfg.noteRequired ? "Required…" : "Optional…"}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant={dlgCfg.submitVariant ?? "default"}
              onClick={handleDialogSubmit}
              disabled={isPending}
            >
              {isPending ? "Saving…" : dlgCfg.submitLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
