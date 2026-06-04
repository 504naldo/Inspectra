import { useState } from "react";
import CustomerLayout from "@/components/CustomerLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FileText, CheckCircle2, Clock, Eye, XCircle, ThumbsDown } from "lucide-react";

type Quote = {
  id: number;
  quoteNumber: string | null;
  status: string;
  total: unknown;
  lineItems: unknown;
  notes: string | null;
  createdAt: Date | string;
  acceptedAt: Date | string | null;
  declinedAt: Date | string | null;
  declinedReason: string | null;
  siteName: string | null;
  jobNumber: string | null;
};

function fmt(n: unknown) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "accepted":
      return <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Accepted</Badge>;
    case "sent":
    case "viewed":
      return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />Awaiting Approval</Badge>;
    case "declined":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Declined</Badge>;
    case "expired":
      return <Badge variant="secondary">Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function CustomerQuotes() {
  const utils = trpc.useUtils();
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [decliningId, setDecliningId] = useState<number | null>(null);
  const [declineReason, setDeclineReason] = useState("");

  const { data: quotes, isLoading } = trpc.quote.listByCustomerOrg.useQuery();

  const approveQuote = trpc.quote.approveFromPortal.useMutation({
    onSuccess: (res) => {
      if (res.alreadyAccepted) {
        toast.info("Quote was already accepted");
      } else {
        toast.success("Quote approved");
      }
      setApprovingId(null);
      void utils.quote.listByCustomerOrg.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to approve quote"),
  });

  const declineQuote = trpc.quote.declineFromPortal.useMutation({
    onSuccess: () => {
      toast.success("Quote declined");
      setDecliningId(null);
      setDeclineReason("");
      void utils.quote.listByCustomerOrg.invalidate();
    },
    onError: (e) => toast.error(e.message || "Failed to decline quote"),
  });

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Quotes</h1>
          <p className="text-muted-foreground">Review and approve repair quotes</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !quotes?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No quotes available</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(quotes as unknown as Quote[]).map((q) => (
              <Card key={q.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <h3 className="font-semibold">{q.siteName ?? "—"}</h3>
                        <StatusBadge status={q.status} />
                      </div>
                      <p className="text-sm text-muted-foreground mb-1">
                        {q.quoteNumber ?? `Quote #${q.id}`}
                        {q.jobNumber ? ` · Job ${q.jobNumber}` : ""}
                        {" · "}
                        {new Date(q.createdAt).toLocaleDateString()}
                      </p>
                      <p className="text-lg font-semibold">{fmt(q.total)}</p>
                      {q.declinedAt && q.declinedReason && (
                        <p className="text-xs text-red-600 mt-1">
                          Declined: {q.declinedReason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>
                              {q.quoteNumber ?? `Quote #${q.id}`} — {q.siteName}
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-2">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={q.status} />
                              {q.acceptedAt && (
                                <span className="text-xs text-muted-foreground">
                                  Accepted {new Date(q.acceptedAt).toLocaleDateString()}
                                </span>
                              )}
                              {q.declinedAt && (
                                <span className="text-xs text-muted-foreground">
                                  Declined {new Date(q.declinedAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>

                            {q.declinedReason && (
                              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-1">Reason for Declining</p>
                                <p className="text-sm text-red-900 dark:text-red-200">{q.declinedReason}</p>
                              </div>
                            )}

                            {/* Line items */}
                            {Array.isArray(q.lineItems) && q.lineItems.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                                  Line Items
                                </p>
                                <div className="rounded-lg border divide-y text-sm">
                                  {(q.lineItems as any[]).map((li, i) => (
                                    <div key={i} className="flex items-start justify-between gap-3 px-4 py-2">
                                      <span className="flex-1">{li.description}</span>
                                      <span className="shrink-0 text-muted-foreground">
                                        {li.qty > 1 ? `${li.qty} × ` : ""}{fmt(li.unitPrice)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-1 border-t font-semibold">
                              <span>Total</span>
                              <span>{fmt(q.total)}</span>
                            </div>

                            {q.notes && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{q.notes}</p>
                              </div>
                            )}

                            {(q.status === "sent" || q.status === "viewed") && (
                              <div className="space-y-3 pt-2 border-t">
                                <Button
                                  className="w-full"
                                  disabled={approveQuote.isPending && approvingId === q.id}
                                  onClick={() => {
                                    setApprovingId(q.id);
                                    approveQuote.mutate({ id: q.id });
                                  }}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  {approveQuote.isPending && approvingId === q.id ? "Approving…" : "Approve Quote"}
                                </Button>

                                {decliningId === q.id ? (
                                  <div className="space-y-2">
                                    <Textarea
                                      placeholder="Reason for declining (optional but helpful)"
                                      value={declineReason}
                                      onChange={(e) => setDeclineReason(e.target.value)}
                                      rows={3}
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        variant="destructive"
                                        className="flex-1"
                                        disabled={declineQuote.isPending}
                                        onClick={() => declineQuote.mutate({ quoteId: q.id, reason: declineReason || undefined })}
                                      >
                                        {declineQuote.isPending ? "Declining…" : "Confirm Decline"}
                                      </Button>
                                      <Button variant="outline" onClick={() => { setDecliningId(null); setDeclineReason(""); }}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <Button
                                    variant="outline"
                                    className="w-full text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => setDecliningId(q.id)}
                                  >
                                    <ThumbsDown className="h-4 w-4 mr-2" />
                                    Decline Quote
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
