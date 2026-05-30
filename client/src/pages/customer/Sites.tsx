import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import CustomerLayout from "@/components/CustomerLayout";
import { trpc } from "@/lib/trpc";
import { Building2, MapPin, Phone, CheckCircle2, AlertTriangle } from "lucide-react";

export default function CustomerSites() {
  const { user } = useAuth();
  const customerOrgId = user?.customerOrgId!;

  const { data: sites, isLoading } = trpc.site.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  const { data: jobs } = trpc.job.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  const { data: deficiencies } = trpc.deficiency.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  // Compute per-site stats from already-fetched data
  const lastJobBySite = new Map<number, any>();
  const openDefBySite = new Map<number, number>();

  if (jobs) {
    for (const job of jobs as any[]) {
      const prev = lastJobBySite.get(job.siteId);
      if (!prev || (job.scheduledDate && (!prev.scheduledDate || new Date(job.scheduledDate) > new Date(prev.scheduledDate)))) {
        lastJobBySite.set(job.siteId, job);
      }
    }
  }

  if (deficiencies && jobs) {
    const jobSiteMap = new Map(jobs.map((j: any) => [j.id, j.siteId]));
    for (const def of deficiencies) {
      if (def.status === "open" || def.status === "in_progress") {
        const siteId = jobSiteMap.get(def.jobId);
        if (siteId) openDefBySite.set(siteId, (openDefBySite.get(siteId) ?? 0) + 1);
      }
    }
  }

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Your Sites</h1>
          <p className="text-muted-foreground">All properties under your account</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !sites?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No sites found for your account</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sites.map((site: any) => {
              const lastJob = lastJobBySite.get(site.id);
              const openDefs = openDefBySite.get(site.id) ?? 0;
              const address = [site.address, site.city, site.state, site.postalCode]
                .filter(Boolean)
                .join(", ");

              return (
                <Card key={site.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Building2 className="h-5 w-5 text-primary shrink-0" />
                        <h3 className="font-semibold truncate">{site.name}</h3>
                      </div>
                      {openDefs > 0 ? (
                        <Badge className="bg-amber-100 text-amber-700 shrink-0">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {openDefs} open
                        </Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-700 shrink-0">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Compliant
                        </Badge>
                      )}
                    </div>

                    {address && (
                      <p className="text-sm text-muted-foreground flex items-start gap-1.5 mb-2">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        {address}
                      </p>
                    )}

                    {site.contactPhone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1.5 mb-3">
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {site.contactPhone}
                      </p>
                    )}

                    <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                      {lastJob ? (
                        <>
                          <p>
                            Last inspection:{" "}
                            <span className="font-medium text-foreground">
                              {lastJob.scheduledDate
                                ? new Date(lastJob.scheduledDate).toLocaleDateString("en-CA", {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  })
                                : "—"}
                            </span>
                          </p>
                          <p>
                            Status:{" "}
                            <span className="font-medium text-foreground capitalize">
                              {lastJob.status.replace(/_/g, " ")}
                            </span>
                          </p>
                        </>
                      ) : (
                        <p>No inspections on record</p>
                      )}
                      {site.fileNumber && <p>File #{site.fileNumber}</p>}
                    </div>
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
