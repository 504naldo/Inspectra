import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link } from "wouter";
import { toast } from "sonner";
import { Plus, Search, FileText, Building2, DollarSign, Calendar, ChevronRight } from "lucide-react";
import { INVOICE_STATUSES, type InvoiceStatus } from "../../../../drizzle/schema";
import { formatCurrency } from "@/lib/utils";
import { getInvoiceStatusLabel, getInvoiceStatusBadgeClass } from "@/lib/statusLabels";
import { Skeleton } from "@/components/ui/skeleton";

const TABS = [
  { label: "All", value: "" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Approved", value: "approved" },
  { label: "Paid", value: "paid" },
  { label: "Overdue", value: "overdue" },
  { label: "Void", value: "void" },
];

function fmt(amount: string | number | null | undefined) {
  return formatCurrency(amount);
}

export default function AdminInvoices() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? 0;

  const [tab, setTab] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sageFilter, setSageFilter] = useState("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    customerOrgId: "",
    siteId: "",
    billToName: "",
    invoiceDate: new Date().toISOString().split("T")[0],
    dueDate: "",
    internalNotes: "",
    clientNotes: "",
    sageCustomerCode: "",
  });

  const { data: invoices = [], isLoading, refetch } = trpc.invoice.list.useQuery(
    { status: tab || undefined, sageExportStatus: sageFilter === "all" ? undefined : (sageFilter as any) },
    { enabled: !!companyId }
  );
  const { data: customers } = trpc.customerOrg.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );
  const { data: sites } = trpc.site.listByCompany.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const createInvoice = trpc.invoice.create.useMutation({
    onSuccess: () => {
      toast.success("Invoice created");
      setIsCreateOpen(false);
      setNewInvoice({
        customerOrgId: "",
        siteId: "",
        billToName: "",
        invoiceDate: new Date().toISOString().split("T")[0],
        dueDate: "",
        internalNotes: "",
        clientNotes: "",
        sageCustomerCode: "",
      });
      refetch();
    },
    onError: () => toast.error("Failed to create invoice"),
  });

  const filtered = invoices.filter((inv: any) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      inv.billToName?.toLowerCase().includes(q) ||
      inv.customerOrgName?.toLowerCase().includes(q)
    );
  });

  const statusCounts = INVOICE_STATUSES.reduce((acc, s) => {
    acc[s] = invoices.filter((i: any) => i.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const totalUnpaid = invoices
    .filter((i: any) => !["paid", "void", "draft"].includes(i.status))
    .reduce((sum: number, i: any) => sum + parseFloat(String(i.balanceDue ?? "0")), 0);

  return (
    <AdminLayout title="Invoices">
      <div className="space-y-6">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              <p className="text-2xl font-bold text-primary">{fmt(totalUnpaid)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Sent</p>
              <p className="text-2xl font-bold">{statusCounts.sent ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold text-red-600">{statusCounts.overdue ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Paid (this set)</p>
              <p className="text-2xl font-bold text-green-600">{statusCounts.paid ?? 0}</p>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoices..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sageFilter} onValueChange={setSageFilter}>
            <SelectTrigger className="w-auto min-w-[160px]">
              <SelectValue placeholder="Sage status: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sage statuses</SelectItem>
              <SelectItem value="pending">Ready for export</SelectItem>
              <SelectItem value="exported">Exported to Sage</SelectItem>
              <SelectItem value="error">Export error</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Invoice</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select
                    value={newInvoice.customerOrgId}
                    onValueChange={(v) => setNewInvoice({ ...newInvoice, customerOrgId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers?.map((c: any) => (
                        <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Site <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Select
                    value={newInvoice.siteId}
                    onValueChange={(v) => setNewInvoice({ ...newInvoice, siteId: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites?.filter((s: any) =>
                        !newInvoice.customerOrgId || s.customerOrgId === parseInt(newInvoice.customerOrgId)
                      ).map((s: any) => (
                        <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bill To Name</Label>
                  <Input
                    value={newInvoice.billToName}
                    onChange={(e) => setNewInvoice({ ...newInvoice, billToName: e.target.value })}
                    placeholder="Company or person name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Invoice Date</Label>
                    <Input
                      type="date"
                      value={newInvoice.invoiceDate}
                      onChange={(e) => setNewInvoice({ ...newInvoice, invoiceDate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Due Date</Label>
                    <Input
                      type="date"
                      value={newInvoice.dueDate}
                      onChange={(e) => setNewInvoice({ ...newInvoice, dueDate: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Sage Customer Code <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input
                    value={newInvoice.sageCustomerCode}
                    onChange={(e) => setNewInvoice({ ...newInvoice, sageCustomerCode: e.target.value })}
                    placeholder="e.g. CUST001"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Internal Notes</Label>
                  <Textarea
                    value={newInvoice.internalNotes}
                    onChange={(e) => setNewInvoice({ ...newInvoice, internalNotes: e.target.value })}
                    rows={2}
                    placeholder="Internal use only"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={createInvoice.isPending}
                    onClick={() => createInvoice.mutate({
                      customerOrgId: newInvoice.customerOrgId ? parseInt(newInvoice.customerOrgId) : undefined,
                      siteId: newInvoice.siteId ? parseInt(newInvoice.siteId) : undefined,
                      billToName: newInvoice.billToName || undefined,
                      invoiceDate: newInvoice.invoiceDate || undefined,
                      dueDate: newInvoice.dueDate || undefined,
                      sageCustomerCode: newInvoice.sageCustomerCode || undefined,
                      internalNotes: newInvoice.internalNotes || undefined,
                    })}
                  >
                    {createInvoice.isPending ? "Creating..." : "Create Invoice"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 flex-wrap border-b">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-3 py-2 text-sm font-medium rounded-t transition-colors ${
                tab === t.value
                  ? "text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.value && statusCounts[t.value] ? (
                <span className="ml-1.5 text-xs bg-muted rounded-full px-1.5 py-0.5">
                  {statusCounts[t.value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Invoice list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No invoices found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((inv: any) => (
              <Link key={inv.id} href={`/admin/invoices/${inv.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold font-mono text-sm">{inv.invoiceNumber}</span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${getInvoiceStatusBadgeClass(inv.status)}`}>
                            {getInvoiceStatusLabel(inv.status)}
                          </span>
                          {inv.sageExportStatus === "exported" && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                              Sage Exported
                            </span>
                          )}
                          {inv.sageExportStatus === "pending" && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                              Ready for Export
                            </span>
                          )}
                          {inv.sageExportStatus === "error" && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                              Export Error
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {(inv.customerOrgName || inv.billToName) && (
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {inv.customerOrgName ?? inv.billToName}
                            </span>
                          )}
                          {inv.invoiceDate && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(inv.invoiceDate).toLocaleDateString()}
                            </span>
                          )}
                          {inv.dueDate && (
                            <span className={`text-xs flex items-center gap-1 ${
                              new Date(inv.dueDate) < new Date() && !["paid", "void"].includes(inv.status)
                                ? "text-red-600 font-medium"
                                : "text-muted-foreground"
                            }`}>
                              Due {new Date(inv.dueDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-lg">{fmt(inv.total)}</p>
                        {parseFloat(String(inv.balanceDue ?? "0")) > 0 && inv.status !== "paid" && (
                          <p className="text-xs text-muted-foreground">
                            Balance: {fmt(inv.balanceDue)}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
