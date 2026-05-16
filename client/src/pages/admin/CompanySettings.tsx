import { useState, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Settings, DollarSign, FileText, Building2, BarChart3, User } from "lucide-react";

const TABS = [
  { id: "profile",  label: "Company Profile", icon: User        },
  { id: "tax",      label: "Tax",             icon: DollarSign  },
  { id: "labour",   label: "Labour & Quotes", icon: Settings    },
  { id: "invoice",  label: "Invoices",        icon: FileText    },
  { id: "sage",     label: "Sage Export",     icon: Building2   },
  { id: "reports",  label: "Reports",         icon: BarChart3   },
] as const;
type TabId = (typeof TABS)[number]["id"];

function pct(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return (parseFloat(String(v)) * 100).toFixed(4).replace(/\.?0+$/, "");
}
function pctToDecimal(s: string): number {
  return parseFloat(s) / 100;
}

export default function CompanySettings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<TabId>("profile");

  const { data: settings, isLoading, refetch } = trpc.companySettings.get.useQuery(undefined, {
    enabled: !!user?.companyId,
  });

  const updateMut = trpc.companySettings.update.useMutation({
    onSuccess: () => { toast.success("Settings saved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  // ── Company Profile ───────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // ── Tax ───────────────────────────────────────────────────────────────────────
  const [gstRate, setGstRate] = useState("");
  const [pstRate, setPstRate] = useState("");

  // ── Labour & Quotes ───────────────────────────────────────────────────────────
  const [techRate, setTechRate] = useState("");
  const [fitterRate, setFitterRate] = useState("");
  const [fuelCharge, setFuelCharge] = useState("");
  const [validDays, setValidDays] = useState("");
  const [quoteTerms, setQuoteTerms] = useState("");

  // ── Invoices ──────────────────────────────────────────────────────────────────
  const [dueDays, setDueDays] = useState("");
  const [invoiceTerms, setInvoiceTerms] = useState("");
  const [invPrefix, setInvPrefix] = useState("");

  // ── Sage ──────────────────────────────────────────────────────────────────────
  const [rqPrefix, setRqPrefix] = useState("");
  const [sageGl, setSageGl] = useState("");
  const [sageDept, setSageDept] = useState("");
  const [sageCustomerCode, setSageCustomerCode] = useState("");
  const [sageTaxCode, setSageTaxCode] = useState("");

  // ── Reports ───────────────────────────────────────────────────────────────────
  const [reportFooter, setReportFooter] = useState("");

  useEffect(() => {
    if (!settings) return;
    setDisplayName(settings.companyDisplayName ?? "");
    setLogoUrl(settings.logoUrl ?? "");
    setGstRate(pct(settings.gstRate));
    setPstRate(pct(settings.pstRate));
    setTechRate(parseFloat(String(settings.technicianLabourRate ?? "75")).toFixed(2));
    setFitterRate(parseFloat(String(settings.fitterLabourRate ?? "65")).toFixed(2));
    setFuelCharge(parseFloat(String(settings.defaultFuelCharge ?? "0")).toFixed(2));
    setValidDays(String(settings.quoteValidityDays ?? 30));
    setQuoteTerms(settings.defaultQuoteTerms ?? "");
    setDueDays(String(settings.invoiceDueDays ?? 30));
    setInvoiceTerms(settings.defaultInvoiceTerms ?? "");
    setInvPrefix(settings.invoiceNumberPrefix ?? "INV");
    setRqPrefix(settings.repairQuoteNumberPrefix ?? "RQ");
    setSageGl(settings.sageDefaultGlCode ?? "");
    setSageDept(settings.sageDefaultDepartment ?? "");
    setSageCustomerCode(settings.sageCustomerCodeDefault ?? "");
    setSageTaxCode(settings.sageTaxCodeDefault ?? "");
    setReportFooter(settings.reportFooterText ?? "");
  }, [settings]);

  function saveProfile() {
    const logo = logoUrl.trim();
    if (logo && !logo.startsWith("http://") && !logo.startsWith("https://")) {
      toast.error("Logo URL must start with http:// or https://");
      return;
    }
    updateMut.mutate({
      companyDisplayName: displayName.trim() || null,
      logoUrl: logo || null,
    });
  }

  function saveTax() {
    const g = pctToDecimal(gstRate);
    const p = pctToDecimal(pstRate);
    if (isNaN(g) || isNaN(p)) { toast.error("Enter valid percentages"); return; }
    updateMut.mutate({ gstRate: g, pstRate: p });
  }

  function saveLabour() {
    const t = parseFloat(techRate);
    const f = parseFloat(fitterRate);
    const fc = parseFloat(fuelCharge);
    const v = parseInt(validDays);
    if (isNaN(t) || isNaN(f) || isNaN(fc) || isNaN(v) || v < 1) { toast.error("Enter valid values"); return; }
    updateMut.mutate({ technicianLabourRate: t, fitterLabourRate: f, defaultFuelCharge: fc, quoteValidityDays: v, defaultQuoteTerms: quoteTerms.trim() || null });
  }

  function saveInvoice() {
    const d = parseInt(dueDays);
    if (isNaN(d) || d < 0) { toast.error("Enter a valid number of days"); return; }
    if (!invPrefix.trim()) { toast.error("Invoice prefix cannot be empty"); return; }
    updateMut.mutate({ invoiceDueDays: d, defaultInvoiceTerms: invoiceTerms.trim() || null, invoiceNumberPrefix: invPrefix.trim() });
  }

  function saveSage() {
    if (!rqPrefix.trim()) { toast.error("Quote prefix cannot be empty"); return; }
    updateMut.mutate({
      repairQuoteNumberPrefix: rqPrefix.trim(),
      sageDefaultGlCode: sageGl.trim() || null,
      sageDefaultDepartment: sageDept.trim() || null,
      sageCustomerCodeDefault: sageCustomerCode.trim() || null,
      sageTaxCodeDefault: sageTaxCode.trim() || null,
    });
  }

  function saveReports() {
    updateMut.mutate({ reportFooterText: reportFooter.trim() || null });
  }

  const isSaving = updateMut.isPending;
  const readOnly = !isAdmin;

  if (isLoading) {
    return (
      <AdminLayout title="Company Settings">
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Company Settings">
      <div className="max-w-3xl space-y-6">
        {readOnly && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You have read-only access to these settings. Contact an admin to make changes.
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 flex-wrap border-b">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm font-medium rounded-t transition-colors flex items-center gap-1.5 ${
                tab === t.id ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Company Profile ─────────────────────────────────────────────────── */}
        {tab === "profile" && (
          <Card>
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
              <CardDescription>Display name and logo used in generated documents and reports.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Company Display Name</Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={readOnly}
                  placeholder="Acme Fire Protection Ltd."
                  maxLength={255}
                />
                <p className="text-xs text-muted-foreground">Used on reports, invoices, and PDF headers. Leave blank to use the system account name.</p>
              </div>
              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  disabled={readOnly}
                  placeholder="https://example.com/logo.png"
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">HTTPS URL to a PNG or JPG logo. Displayed on generated reports.</p>
                {logoUrl && logoUrl.startsWith("https://") && (
                  <img src={logoUrl} alt="Logo preview" className="h-12 object-contain border rounded p-1" onError={(e) => (e.currentTarget.style.display = "none")} />
                )}
              </div>
              {!readOnly && (
                <Button onClick={saveProfile} disabled={isSaving}>{isSaving ? "Saving…" : "Save Profile"}</Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Tax ─────────────────────────────────────────────────────────────── */}
        {tab === "tax" && (
          <Card>
            <CardHeader>
              <CardTitle>Tax Rates</CardTitle>
              <CardDescription>Default rates applied to new invoices and repair quote line items. Existing records are not affected.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>GST Rate (%)</Label>
                  <Input value={gstRate} onChange={(e) => setGstRate(e.target.value)} disabled={readOnly} placeholder="5" />
                  <p className="text-xs text-muted-foreground">Federal goods and services tax</p>
                </div>
                <div className="space-y-2">
                  <Label>PST Rate (%)</Label>
                  <Input value={pstRate} onChange={(e) => setPstRate(e.target.value)} disabled={readOnly} placeholder="7" />
                  <p className="text-xs text-muted-foreground">Provincial sales tax (parts only)</p>
                </div>
              </div>
              {!readOnly && (
                <Button onClick={saveTax} disabled={isSaving}>{isSaving ? "Saving…" : "Save Tax Rates"}</Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Labour & Quotes ──────────────────────────────────────────────────── */}
        {tab === "labour" && (
          <Card>
            <CardHeader>
              <CardTitle>Labour &amp; Quote Defaults</CardTitle>
              <CardDescription>Default rates pre-populated when creating a new repair quote. Already-created quotes are not changed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Technician Labour Rate ($/hr)</Label>
                  <Input value={techRate} onChange={(e) => setTechRate(e.target.value)} disabled={readOnly} placeholder="75.00" />
                </div>
                <div className="space-y-2">
                  <Label>Fitter Labour Rate ($/hr)</Label>
                  <Input value={fitterRate} onChange={(e) => setFitterRate(e.target.value)} disabled={readOnly} placeholder="65.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default Fuel Charge ($ per item)</Label>
                  <Input value={fuelCharge} onChange={(e) => setFuelCharge(e.target.value)} disabled={readOnly} placeholder="0.00" />
                  <p className="text-xs text-muted-foreground">Applied to each line item seeded from deficiencies</p>
                </div>
                <div className="space-y-2">
                  <Label>Quote Validity (days)</Label>
                  <Input value={validDays} onChange={(e) => setValidDays(e.target.value)} disabled={readOnly} placeholder="30" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Default Quote Terms</Label>
                <Textarea value={quoteTerms} onChange={(e) => setQuoteTerms(e.target.value)} disabled={readOnly} rows={3} placeholder="Payment due within 30 days of invoice…" />
              </div>
              {!readOnly && (
                <Button onClick={saveLabour} disabled={isSaving}>{isSaving ? "Saving…" : "Save Labour Settings"}</Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Invoices ─────────────────────────────────────────────────────────── */}
        {tab === "invoice" && (
          <Card>
            <CardHeader>
              <CardTitle>Invoice Defaults</CardTitle>
              <CardDescription>Applied to new invoices only. Existing invoices are not changed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Invoice Number Prefix</Label>
                  <Input value={invPrefix} onChange={(e) => setInvPrefix(e.target.value.toUpperCase())} disabled={readOnly} placeholder="INV" className="font-mono" maxLength={20} />
                  <p className="text-xs text-muted-foreground">e.g. INV → INV-2026-A1B2</p>
                </div>
                <div className="space-y-2">
                  <Label>Payment Due (days after invoice date)</Label>
                  <Input value={dueDays} onChange={(e) => setDueDays(e.target.value)} disabled={readOnly} placeholder="30" />
                  <p className="text-xs text-muted-foreground">Used when creating a new invoice with no due date specified</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Default Invoice Terms / Footer</Label>
                <Textarea value={invoiceTerms} onChange={(e) => setInvoiceTerms(e.target.value)} disabled={readOnly} rows={3} placeholder="Payment due within 30 days. Late payments subject to 2% monthly interest." />
              </div>
              {!readOnly && (
                <Button onClick={saveInvoice} disabled={isSaving}>{isSaving ? "Saving…" : "Save Invoice Settings"}</Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Sage ─────────────────────────────────────────────────────────────── */}
        {tab === "sage" && (
          <Card>
            <CardHeader>
              <CardTitle>Sage Export Defaults</CardTitle>
              <CardDescription>Default values pre-filled on new invoices. Can be overridden per invoice.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Repair Quote Number Prefix</Label>
                <Input value={rqPrefix} onChange={(e) => setRqPrefix(e.target.value.toUpperCase())} disabled={readOnly} placeholder="RQ" className="font-mono" maxLength={20} />
                <p className="text-xs text-muted-foreground">e.g. RQ → RQ-2026-001</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default GL Code</Label>
                  <Input value={sageGl} onChange={(e) => setSageGl(e.target.value)} disabled={readOnly} placeholder="4000" className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>Default Department</Label>
                  <Input value={sageDept} onChange={(e) => setSageDept(e.target.value)} disabled={readOnly} placeholder="SERVICE" className="font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default Customer Code</Label>
                  <Input value={sageCustomerCode} onChange={(e) => setSageCustomerCode(e.target.value)} disabled={readOnly} placeholder="CUST001" className="font-mono" />
                  <p className="text-xs text-muted-foreground">Sage customer account code applied to new invoices</p>
                </div>
                <div className="space-y-2">
                  <Label>Default Tax Code</Label>
                  <Input value={sageTaxCode} onChange={(e) => setSageTaxCode(e.target.value)} disabled={readOnly} placeholder="GST" className="font-mono" />
                  <p className="text-xs text-muted-foreground">Sage tax code for export</p>
                </div>
              </div>
              {!readOnly && (
                <Button onClick={saveSage} disabled={isSaving}>{isSaving ? "Saving…" : "Save Sage Settings"}</Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Reports ──────────────────────────────────────────────────────────── */}
        {tab === "reports" && (
          <Card>
            <CardHeader>
              <CardTitle>Report Defaults</CardTitle>
              <CardDescription>Text appended to the footer of generated inspection reports.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Report Footer Text</Label>
                <Textarea value={reportFooter} onChange={(e) => setReportFooter(e.target.value)} disabled={readOnly} rows={4} placeholder="This report was prepared by…" />
              </div>
              {!readOnly && (
                <Button onClick={saveReports} disabled={isSaving}>{isSaving ? "Saving…" : "Save Report Settings"}</Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
