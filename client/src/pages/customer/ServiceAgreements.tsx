import { useState } from "react";
import CustomerLayout from "@/components/CustomerLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { FileText, CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp, MapPin } from "lucide-react";

type Agreement = {
  id: number;
  agreementNumber: string | null;
  name: string;
  status: string;
  startDate: string | Date | null;
  endDate: string | Date | null;
  renewalDate: string | Date | null;
  billingCycle: string | null;
  includedServicesJson: string[] | null;
  excludedServicesJson: string[] | null;
  sites: {
    siteId: number;
    siteName: string | null;
    siteAddress: string | null;
    siteCity: string | null;
    siteState: string | null;
    includedServicesJson: string[] | null;
    siteSpecificNotes: string | null;
  }[];
};

const BILLING_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-Annual",
  annual: "Annual",
  per_service: "Per Service",
  custom: "Custom",
};

function fmtDate(d: string | Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Active</Badge>;
    case "expiring_soon":
      return <Badge className="bg-amber-100 text-amber-700"><AlertTriangle className="h-3 w-3 mr-1" />Expiring Soon</Badge>;
    case "expired":
      return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Expired</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function ServiceList({ label, items }: { label: string; items: string[] | null }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((s) => (
          <span key={s} className="text-xs bg-muted px-2 py-0.5 rounded-full">{s}</span>
        ))}
      </div>
    </div>
  );
}

export default function CustomerServiceAgreements() {
  const { data: agreements, isLoading } = trpc.serviceAgreement.listByCustomerOrg.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Service Agreements</h1>
          <p className="text-muted-foreground">Your active service contracts and coverage details</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !agreements?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No service agreements on file</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {(agreements as unknown as Agreement[]).map((a) => {
              const expanded = expandedId === a.id;
              return (
                <Card key={a.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <FileText className="h-5 w-5 text-primary shrink-0" />
                          <h3 className="font-semibold">{a.name}</h3>
                          <StatusBadge status={a.status} />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {a.agreementNumber ? `${a.agreementNumber} · ` : ""}
                          {BILLING_LABELS[a.billingCycle ?? ""] ?? a.billingCycle ?? ""}
                          {" · "}
                          {fmtDate(a.startDate)} – {fmtDate(a.endDate)}
                        </p>
                        {a.renewalDate && a.status !== "expired" && (
                          <p className="text-xs text-muted-foreground">
                            Renewal: {fmtDate(a.renewalDate)}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {a.sites.length} covered {a.sites.length === 1 ? "site" : "sites"}
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedId(expanded ? null : a.id)}
                      >
                        {expanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
                        {expanded ? "Less" : "Details"}
                      </Button>
                    </div>

                    {expanded && (
                      <div className="mt-5 space-y-5 border-t pt-5">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <ServiceList label="Included Services" items={a.includedServicesJson} />
                          <ServiceList label="Excluded Services" items={a.excludedServicesJson} />
                        </div>

                        {a.sites.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                              Covered Sites
                            </p>
                            <div className="rounded-lg border divide-y text-sm">
                              {a.sites.map((s) => (
                                <div key={s.siteId} className="px-4 py-3 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-medium">{s.siteName ?? `Site #${s.siteId}`}</span>
                                  </div>
                                  {(s.siteAddress || s.siteCity) && (
                                    <p className="text-muted-foreground text-xs pl-5">
                                      {[s.siteAddress, s.siteCity, s.siteState].filter(Boolean).join(", ")}
                                    </p>
                                  )}
                                  {s.includedServicesJson && s.includedServicesJson.length > 0 && (
                                    <div className="pl-5 flex flex-wrap gap-1 mt-1">
                                      {s.includedServicesJson.map((sv) => (
                                        <span key={sv} className="text-xs bg-muted px-2 py-0.5 rounded-full">{sv}</span>
                                      ))}
                                    </div>
                                  )}
                                  {s.siteSpecificNotes && (
                                    <p className="text-xs text-muted-foreground pl-5">{s.siteSpecificNotes}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
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
