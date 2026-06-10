import { useLocation } from "wouter";
import { Plus, FileText, CheckCircle, Send, Clock, XCircle, Wrench, Package } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import type { Quote } from "../../../../drizzle/schema";
import { getQuoteStatusLabel, getQuoteStatusBadgeClass } from "@/lib/statusLabels";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CAD = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

const STATUS_ICONS: Record<string, React.ElementType> = {
  draft: Clock,
  ready_to_send: Clock,
  sent: Send,
  viewed: Send,
  partially_approved: Wrench,
  approved: CheckCircle,
  accepted: CheckCircle,
  declined: XCircle,
  expired: XCircle,
  converted_to_approved_work: Package,
  cancelled: XCircle,
};

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] ?? FileText;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${getQuoteStatusBadgeClass(status)}`}>
      <Icon className="h-3 w-3" />
      {getQuoteStatusLabel(status)}
    </span>
  );
}

function quoteLabel(q: Quote) {
  const info = (q as any).buildingInfo as Record<string, string> | null | undefined;
  if (info?.buildingName) return info.buildingName;
  if (info?.address) return info.address;
  return `Quote #${q.id}`;
}

function quoteSubLabel(q: Quote) {
  const info = (q as any).buildingInfo as Record<string, string> | null | undefined;
  const type = (q as any).quoteType === "building" ? "Building Quote" : "Deficiency Quote";
  if (info?.address && info?.buildingName) return `${type} · ${info.address}`;
  return type;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminQuotes() {
  const [, navigate] = useLocation();
  const { data: quotes = [], isLoading } = trpc.quote.listByCompany.useQuery();
  const { data: repairQuotes = [], isLoading: rqLoading } = trpc.repairQuote.listByCompany.useQuery();

  const buildingQuotes = quotes.filter((q) => (q as any).quoteType === "building");
  const deficiencyQuotes = quotes.filter((q) => (q as any).quoteType !== "building" && (q as any).quoteType !== "repair");

  const totalCount = quotes.length + repairQuotes.length;

  return (
    <AdminLayout title="Quotes">
      <div className="space-y-6">
        {/* Actions bar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">
            {totalCount} quote{totalCount !== 1 ? "s" : ""} total
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/parts-catalog")} className="gap-1.5">
              <Package className="h-4 w-4" /> Parts Catalog
            </Button>
            <Button variant="outline" onClick={() => navigate("/admin/repair-quotes/new")} className="gap-1.5">
              <Wrench className="h-4 w-4" /> New Repair Quote
            </Button>
            <Button onClick={() => navigate("/admin/quotes/new")} className="gap-1.5">
              <Plus className="h-4 w-4" /> New Building Quote
            </Button>
          </div>
        </div>

        {/* Building quotes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Building Quotes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
            ) : buildingQuotes.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <FileText className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No building quotes yet.</p>
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/quotes/new")} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Create First Quote
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {buildingQuotes.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between py-3 gap-3 cursor-pointer hover:bg-muted/40 -mx-4 px-4 rounded transition-colors"
                    onClick={() => navigate(`/admin/quotes/${q.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{quoteLabel(q)}</p>
                      <p className="text-xs text-muted-foreground">{quoteSubLabel(q)} · {fmtDate(q.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium">{CAD.format(parseFloat(String(q.total)))}</span>
                      <StatusBadge status={q.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Repair Quotes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              Repair Quotes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rqLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
            ) : repairQuotes.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <Wrench className="h-8 w-8 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No repair quotes yet.</p>
                <Button variant="outline" size="sm" onClick={() => navigate("/admin/repair-quotes/new")} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Create First Repair Quote
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {repairQuotes.map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between py-3 gap-3 cursor-pointer hover:bg-muted/40 -mx-4 px-4 rounded transition-colors"
                    onClick={() => navigate(`/admin/repair-quotes/${q.id}`)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{(q as any).quoteNumber ?? `Quote #${q.id}`}</p>
                      <p className="text-xs text-muted-foreground">Repair Quote · {fmtDate(q.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium">{CAD.format(parseFloat(String(q.total)))}</span>
                      <StatusBadge status={q.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deficiency quotes (existing flow) */}
        {deficiencyQuotes.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Deficiency Repair Quotes (Legacy)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {deficiencyQuotes.map((q) => (
                  <div key={q.id} className="flex items-center justify-between py-3 gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Quote #{q.id}</p>
                      <p className="text-xs text-muted-foreground">Deficiency Repair · {fmtDate(q.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-medium">{CAD.format(parseFloat(String(q.total)))}</span>
                      <StatusBadge status={q.status} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
