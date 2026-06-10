import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  MessageSquare, AlertTriangle, CheckCircle2, Clock, Smartphone, FileText, Loader2,
} from "lucide-react";
import type { FEEDBACK_STATUSES, FEEDBACK_TYPES, FEEDBACK_PRIORITIES } from "../../../../drizzle/schema";

// ── Label / color maps ────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug",
  feature_request: "Feature Request",
  confusing_workflow: "Confusing Workflow",
  data_issue: "Data Issue",
  report_output_issue: "Report Output",
  mobile_issue: "Mobile",
  performance_issue: "Performance",
  other: "Other",
};

const STATUS_CLASS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  reviewed: "bg-purple-100 text-purple-800",
  in_progress: "bg-amber-100 text-amber-800",
  resolved: "bg-green-100 text-green-800",
  closed: "bg-gray-100 text-gray-600",
  wont_fix: "bg-red-100 text-red-700",
};

const PRIORITY_CLASS: Record<string, string> = {
  urgent: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

type FeedbackStatus = typeof FEEDBACK_STATUSES[number];
type FeedbackType = typeof FEEDBACK_TYPES[number];
type FeedbackPriority = typeof FEEDBACK_PRIORITIES[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString([], { month: "short", day: "numeric", year: "2-digit" });
}

function isThisWeek(d: Date | string | null | undefined): boolean {
  if (!d) return false;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 7);
  return new Date(d) >= start;
}

// ── Detail Sheet ──────────────────────────────────────────────────────────────

function FeedbackDetailSheet({
  id,
  open,
  onClose,
}: {
  id: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const [adminNotes, setAdminNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  const utils = trpc.useUtils();

  const { data: item, isLoading } = trpc.feedback.get.useQuery(
    { id: id! },
    {
      enabled: !!id && open,
      onSuccess: (data: any) => {
        setAdminNotes(data.adminNotes ?? "");
        setNotesDirty(false);
      },
    } as any,
  );

  const updateStatus = trpc.feedback.updateStatus.useMutation({
    onSuccess: () => {
      utils.feedback.list.invalidate();
      utils.feedback.get.invalidate({ id: id! });
      toast.success("Status updated");
    },
  });

  const updatePriority = trpc.feedback.updatePriority.useMutation({
    onSuccess: () => {
      utils.feedback.list.invalidate();
      utils.feedback.get.invalidate({ id: id! });
      toast.success("Priority updated");
    },
  });

  const saveNotes = trpc.feedback.addAdminNote.useMutation({
    onSuccess: () => {
      utils.feedback.list.invalidate();
      utils.feedback.get.invalidate({ id: id! });
      setNotesDirty(false);
      toast.success("Notes saved");
    },
  });

  const close = trpc.feedback.close.useMutation({
    onSuccess: () => {
      utils.feedback.list.invalidate();
      onClose();
      toast.success("Feedback closed");
    },
  });

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {isLoading || !item ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader className="mb-4">
              <SheetTitle className="leading-snug pr-6">{item.title}</SheetTitle>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <Badge className={STATUS_CLASS[item.status] ?? ""}>
                  {item.status.replace(/_/g, " ")}
                </Badge>
                <Badge className={PRIORITY_CLASS[item.priority] ?? ""}>
                  {item.priority}
                </Badge>
                <Badge variant="outline">{TYPE_LABELS[item.type] ?? item.type}</Badge>
              </div>
            </SheetHeader>

            <div className="space-y-5 px-4 pb-6">
              {/* Submitter */}
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p><strong className="text-foreground">Submitted by:</strong> {item.submitterName ?? "Unknown"} ({item.submitterEmail ?? "—"})</p>
                <p><strong className="text-foreground">Date:</strong> {formatDate(item.createdAt)}</p>
                {item.resolvedAt && (
                  <p><strong className="text-foreground">Resolved:</strong> {formatDate(item.resolvedAt)}</p>
                )}
              </div>

              {/* Description */}
              {item.description && (
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Description</Label>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{item.description}</p>
                </div>
              )}

              {/* Page / context */}
              {item.pageUrl && (
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Page</Label>
                  <p className="mt-1 text-sm font-mono text-muted-foreground break-all">{item.pageUrl}</p>
                </div>
              )}

              {/* Browser / device */}
              {(item.browserInfo || item.deviceInfo) && (
                <div>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Environment</Label>
                  {item.deviceInfo && <p className="mt-1 text-xs text-muted-foreground">{item.deviceInfo}</p>}
                  {item.browserInfo && <p className="text-xs text-muted-foreground break-all">{item.browserInfo}</p>}
                </div>
              )}

              {/* Status selector */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={item.status}
                  onValueChange={(v) => updateStatus.mutate({ id: item.id, status: v as FeedbackStatus })}
                  disabled={updateStatus.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="wont_fix">Won't Fix</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Priority selector */}
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select
                  value={item.priority}
                  onValueChange={(v) => updatePriority.mutate({ id: item.id, priority: v as FeedbackPriority })}
                  disabled={updatePriority.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="urgent">Urgent</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Admin notes */}
              <div className="space-y-1.5">
                <Label>Admin Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => { setAdminNotes(e.target.value); setNotesDirty(true); }}
                  rows={4}
                  placeholder="Internal notes, resolution details, follow-up steps…"
                  maxLength={5000}
                />
                {notesDirty && (
                  <Button
                    size="sm"
                    onClick={() => saveNotes.mutate({ id: item.id, adminNotes })}
                    disabled={saveNotes.isPending}
                  >
                    {saveNotes.isPending ? "Saving…" : "Save Notes"}
                  </Button>
                )}
              </div>

              {/* Close button */}
              {item.status !== "closed" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => close.mutate({ id: item.id })}
                  disabled={close.isPending}
                >
                  {close.isPending ? "Closing…" : "Close Feedback"}
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FeedbackCenter() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterPriority, setFilterPriority] = useState<string>("");

  const { data: items = [], isLoading } = trpc.feedback.list.useQuery({
    status: (filterStatus || undefined) as FeedbackStatus | undefined,
    type: (filterType || undefined) as FeedbackType | undefined,
    priority: (filterPriority || undefined) as FeedbackPriority | undefined,
    limit: 200,
  });

  // Compute stats client-side
  const newCount = items.filter(i => i.status === "new").length;
  const inProgressCount = items.filter(i => i.status === "in_progress").length;
  const urgentCount = items.filter(i => i.priority === "urgent" && i.status !== "closed" && i.status !== "resolved" && i.status !== "wont_fix").length;
  const resolvedThisWeek = items.filter(i => (i.status === "resolved" || i.status === "closed") && isThisWeek(i.resolvedAt)).length;
  const mobileCount = items.filter(i => i.type === "mobile_issue" && i.status !== "closed" && i.status !== "resolved" && i.status !== "wont_fix").length;
  const reportCount = items.filter(i => i.type === "report_output_issue" && i.status !== "closed" && i.status !== "resolved" && i.status !== "wont_fix").length;

  function openDetail(id: number) {
    setSelectedId(id);
    setSheetOpen(true);
  }

  return (
    <AdminLayout title="Feedback Center">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> New
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-bold">{newCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> In Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-bold">{inProgressCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Urgent
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className={`text-2xl font-bold ${urgentCount > 0 ? "text-red-600" : ""}`}>{urgentCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> Resolved (7d)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-bold text-green-600">{resolvedThisWeek}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Smartphone className="h-3.5 w-3.5" /> Mobile Open
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-bold">{mobileCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" /> Report Open
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <p className="text-2xl font-bold">{reportCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="wont_fix">Won't Fix</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterType || "all"} onValueChange={(v) => setFilterType(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="feature_request">Feature Request</SelectItem>
            <SelectItem value="confusing_workflow">Confusing Workflow</SelectItem>
            <SelectItem value="data_issue">Data Issue</SelectItem>
            <SelectItem value="report_output_issue">Report Output</SelectItem>
            <SelectItem value="mobile_issue">Mobile</SelectItem>
            <SelectItem value="performance_issue">Performance</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPriority || "all"} onValueChange={(v) => setFilterPriority(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>

        {(filterStatus || filterType || filterPriority) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setFilterStatus(""); setFilterType(""); setFilterPriority(""); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No feedback items found.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted by</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-accent/40"
                  onClick={() => openDetail(item.id)}
                >
                  <TableCell className="font-medium max-w-xs truncate">{item.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {TYPE_LABELS[item.type] ?? item.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${PRIORITY_CLASS[item.priority] ?? ""}`}>
                      {item.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-xs ${STATUS_CLASS[item.status] ?? ""}`}>
                      {item.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground truncate max-w-[140px]">
                    {item.submitterName ?? item.submitterEmail ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail Sheet */}
      <FeedbackDetailSheet
        id={selectedId}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </AdminLayout>
  );
}
