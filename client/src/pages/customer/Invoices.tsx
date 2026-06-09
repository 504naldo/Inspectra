import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Receipt, CheckCircle2, Clock, AlertTriangle, Download, ExternalLink } from "lucide-react";

type Invoice = {
  id: number;
  status: string;
  invoiceDate: Date | string | null;
  dueDate: Date | string | null;
  total: unknown;
  balanceDue: unknown;
  amountPaid: unknown;
  pdfUrl: string | null;
  clientNotes: string | null;
  lineItems: { id: number; description: string; quantity: unknown; unitPrice: unknown; total: unknown }[];
  billToName: string | null;
};

function fmt(n: unknown) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function fmtDate(d: Date | string | null) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "paid":
      return <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>;
    case "partial":
      return <Badge className="bg-blue-100 text-blue-700"><CheckCircle2 className="h-3 w-3 mr-1" />Partially Paid</Badge>;
    case "overdue":
      return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Overdue</Badge>;
    case "sent":
    case "viewed":
      return <Badge className="bg-amber-100 text-amber-700"><Clock className="h-3 w-3 mr-1" />Awaiting Payment</Badge>;
    case "approved":
      return <Badge className="bg-purple-100 text-purple-700"><Clock className="h-3 w-3 mr-1" />Approved</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export default function CustomerInvoices() {
  const { data: invoices, isLoading } = trpc.invoice.listByCustomerOrg.useQuery();

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-muted-foreground">View your invoices and payment history</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !invoices?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No invoices on file</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(invoices as unknown as Invoice[]).map((inv) => {
              const balance = Number(inv.balanceDue ?? 0);
              return (
                <Card key={inv.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Receipt className="h-5 w-5 text-primary shrink-0" />
                          <h3 className="font-semibold">Invoice #{inv.id}</h3>
                          <StatusBadge status={inv.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Issued {fmtDate(inv.invoiceDate)}
                          {inv.dueDate ? ` · Due ${fmtDate(inv.dueDate)}` : ""}
                        </p>
                        <div className="flex items-baseline gap-4 pt-1">
                          <span className="text-lg font-semibold">{fmt(inv.total)}</span>
                          {balance > 0 && inv.status !== "paid" && (
                            <span className="text-sm text-muted-foreground">
                              Balance due: <span className="font-medium text-foreground">{fmt(balance)}</span>
                            </span>
                          )}
                          {Number(inv.amountPaid ?? 0) > 0 && (
                            <span className="text-sm text-green-600">
                              Paid: {fmt(inv.amountPaid)}
                            </span>
                          )}
                        </div>
                        {inv.clientNotes && (
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{inv.clientNotes}</p>
                        )}
                      </div>

                      {inv.pdfUrl && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button variant="outline" size="sm" asChild>
                            <a href={inv.pdfUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View PDF
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a href={inv.pdfUrl} download>
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </a>
                          </Button>
                        </div>
                      )}
                    </div>

                    {inv.lineItems.length > 0 && (
                      <div className="mt-4 rounded-lg border divide-y text-sm">
                        {inv.lineItems.map((li) => (
                          <div key={li.id} className="flex items-start justify-between gap-3 px-4 py-2">
                            <span className="flex-1 text-muted-foreground">{li.description}</span>
                            <span className="shrink-0">
                              {Number(li.quantity) > 1 ? `${Number(li.quantity)} × ${fmt(li.unitPrice)} = ` : ""}
                              {fmt(li.total)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </CustomerLayout>
  );
}
