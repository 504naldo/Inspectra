import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Download, FileText, Clock, Send, CheckCircle, XCircle } from "lucide-react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import type { QuoteLineItem } from "../../../../drizzle/schema";
import { getQuoteStatusLabel, getQuoteStatusBadgeClass } from "@/lib/statusLabels";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  partially_approved: FileText,
  approved: CheckCircle,
  accepted: CheckCircle,
  declined: XCircle,
  expired: XCircle,
  converted_to_approved_work: FileText,
  cancelled: XCircle,
};

function StatusBadge({ status }: { status: string }) {
  const Icon = STATUS_ICONS[status] ?? FileText;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1 rounded-full border ${getQuoteStatusBadgeClass(status)}`}>
      <Icon className="h-3.5 w-3.5" />
      {getQuoteStatusLabel(status)}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type BuildingQuoteDetailProps = {
  id: number;
};

export default function BuildingQuoteDetail({ id: quoteId }: BuildingQuoteDetailProps) {
  const [, navigate] = useLocation();

  const { data, isLoading, refetch } = trpc.quote.getBuilding.useQuery(
    { id: quoteId },
    { enabled: quoteId > 0 }
  );

  const downloadMutation = trpc.quote.downloadBuildingPDF.useMutation({
    onSuccess: ({ pdfUrl }) => {
      window.open(pdfUrl, "_blank");
      refetch();
    },
    onError: (err) => toast.error(`PDF failed: ${err.message}`),
  });

  const statusMutation = trpc.quote.updateBuildingStatus.useMutation({
    onSuccess: () => { toast.success("Status updated."); refetch(); },
    onError: (err) => toast.error(`Update failed: ${err.message}`),
  });

  if (!quoteId || isLoading) {
    return (
      <AdminLayout title="Quote">
        <p className="text-sm text-muted-foreground py-10 text-center">
          {isLoading ? "Loading…" : "Quote not found."}
        </p>
      </AdminLayout>
    );
  }

  if (!data) {
    return (
      <AdminLayout title="Quote">
        <p className="text-sm text-muted-foreground py-10 text-center">Quote not found.</p>
      </AdminLayout>
    );
  }

  const { quote, company } = data;
  const info = (quote as any).buildingInfo as {
    buildingName?: string;
    buildingId?: string;
    address?: string;
    city?: string;
    backflowFeeCity?: string;
  } | null ?? {};

  const lineItems = (quote.lineItems ?? []) as QuoteLineItem[];
  const serviceLines = lineItems.filter((i) => (i as any).type === "service" || !(i as any).type);
  const labourLines  = lineItems.filter((i) => (i as any).type === "labour");

  const discountPct    = parseFloat(String((quote as any).discount ?? "0"));
  const discountReason = (quote as any).discountReason as string | undefined;
  const servicesSubtotal = serviceLines.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const labourSubtotal   = labourLines.reduce((s, i) => s + ((i as any).hours ?? 0) * ((i as any).rate ?? i.unitPrice), 0);
  const subtotal         = servicesSubtotal + labourSubtotal;
  const discountAmount   = subtotal * (discountPct / 100);
  const total            = parseFloat(String(quote.total));

  const status = quote.status;
  const isPending = downloadMutation.isPending || statusMutation.isPending;

  return (
    <AdminLayout title="">
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/quotes")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">
                {info.buildingName ?? info.address ?? `Quote #${quote.id}`}
              </h1>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Building Quote · Created {fmtDate(quote.createdAt)}
              {quote.sentAt ? ` · Sent ${fmtDate(quote.sentAt)}` : ""}
              {quote.acceptedAt ? ` · Accepted ${fmtDate(quote.acceptedAt)}` : ""}
            </p>
          </div>
        </div>

        <div className="lg:grid lg:grid-cols-[1fr_280px] lg:gap-6 space-y-4 lg:space-y-0">
          {/* ── Left: details ── */}
          <div className="space-y-4">
            {/* Building Info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Building Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {info.address && (
                    <>
                      <dt className="text-muted-foreground">Address</dt>
                      <dd className="font-medium">{info.address}</dd>
                    </>
                  )}
                  {info.city && (
                    <>
                      <dt className="text-muted-foreground">City</dt>
                      <dd className="font-medium">{info.city}</dd>
                    </>
                  )}
                  {info.backflowFeeCity && (
                    <>
                      <dt className="text-muted-foreground">Backflow Fee City</dt>
                      <dd className="font-medium">{info.backflowFeeCity}</dd>
                    </>
                  )}
                  {info.buildingId && (
                    <>
                      <dt className="text-muted-foreground">Building ID</dt>
                      <dd className="font-medium">{info.buildingId}</dd>
                    </>
                  )}
                  {company?.name && (
                    <>
                      <dt className="text-muted-foreground">Company</dt>
                      <dd className="font-medium">{company.name}</dd>
                    </>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Services table */}
            {serviceLines.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Services</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2 font-medium">Description</th>
                        <th className="text-right px-4 py-2 font-medium w-16">Qty</th>
                        <th className="text-right px-4 py-2 font-medium w-24">Unit Price</th>
                        <th className="text-right px-4 py-2 font-medium w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {serviceLines.map((line, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{line.description}</p>
                            {(line as any).lineNotes && (
                              <p className="text-xs text-muted-foreground">{(line as any).lineNotes}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">{line.qty}</td>
                          <td className="px-4 py-2.5 text-right">{CAD.format(line.unitPrice)}</td>
                          <td className="px-4 py-2.5 text-right font-medium">{CAD.format(line.qty * line.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={3} className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">Services subtotal</td>
                        <td className="px-4 py-2 text-right font-semibold">{CAD.format(servicesSubtotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Labour table */}
            {labourLines.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Labour</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b text-xs text-muted-foreground">
                        <th className="text-left px-4 py-2 font-medium">Type</th>
                        <th className="text-right px-4 py-2 font-medium w-20">Hours</th>
                        <th className="text-right px-4 py-2 font-medium w-24">Rate / hr</th>
                        <th className="text-right px-4 py-2 font-medium w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {labourLines.map((line, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            <p className="font-medium">{line.description}</p>
                            {(line as any).lineNotes && (
                              <p className="text-xs text-muted-foreground">{(line as any).lineNotes}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">{(line as any).hours ?? 0}</td>
                          <td className="px-4 py-2.5 text-right">{CAD.format((line as any).rate ?? line.unitPrice)}</td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {CAD.format(((line as any).hours ?? 0) * ((line as any).rate ?? line.unitPrice))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t bg-muted/30">
                        <td colSpan={3} className="px-4 py-2 text-right text-xs text-muted-foreground font-medium">Labour subtotal</td>
                        <td className="px-4 py-2 text-right font-semibold">{CAD.format(labourSubtotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </CardContent>
              </Card>
            )}

            {/* Comments */}
            {quote.notes && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">Comments</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Right: summary + actions ── */}
          <div className="lg:sticky lg:top-24 lg:self-start space-y-3">
            {/* Totals */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Quote Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Services</span>
                  <span>{CAD.format(servicesSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Labour</span>
                  <span>{CAD.format(labourSubtotal)}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{CAD.format(subtotal)}</span>
                </div>
                {discountPct > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Discount ({discountPct}%{discountReason ? ` — ${discountReason}` : ""})</span>
                    <span>−{CAD.format(discountAmount)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-semibold text-base pt-1">
                  <span>Total</span>
                  <span>{CAD.format(total)}</span>
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">Amounts in CAD, before taxes.</p>
              </CardContent>
            </Card>

            {/* PDF */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">PDF</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {quote.pdfUrl && (
                  <Button variant="outline" size="sm" className="w-full gap-1.5" asChild>
                    <a href={quote.pdfUrl} target="_blank" rel="noreferrer">
                      <FileText className="h-3.5 w-3.5" /> Open Last PDF
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  disabled={isPending}
                  onClick={() => downloadMutation.mutate({ id: quoteId })}
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadMutation.isPending ? "Generating…" : "Generate & Download PDF"}
                </Button>
              </CardContent>
            </Card>

            {/* Status actions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {status !== "sent" && status !== "accepted" && status !== "declined" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5"
                    disabled={isPending}
                    onClick={() => statusMutation.mutate({ id: quoteId, status: "sent" })}
                  >
                    <Send className="h-3.5 w-3.5" /> Mark as Sent
                  </Button>
                )}
                {status !== "accepted" && status !== "declined" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                    disabled={isPending}
                    onClick={() => statusMutation.mutate({ id: quoteId, status: "accepted" })}
                  >
                    <CheckCircle className="h-3.5 w-3.5" /> Mark as Accepted
                  </Button>
                )}
                {status !== "declined" && status !== "accepted" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-1.5 text-red-700 border-red-200 hover:bg-red-50"
                    disabled={isPending}
                    onClick={() => statusMutation.mutate({ id: quoteId, status: "declined" })}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Mark as Declined
                  </Button>
                )}
                {status === "accepted" || status === "declined" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full gap-1.5 text-muted-foreground"
                    disabled={isPending}
                    onClick={() => statusMutation.mutate({ id: quoteId, status: "draft" })}
                  >
                    Revert to Draft
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
