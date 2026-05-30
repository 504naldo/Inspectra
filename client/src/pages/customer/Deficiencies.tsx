import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePortalPreview } from "@/contexts/PortalPreviewContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CustomerLayout from "@/components/CustomerLayout";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wrench,
  FileCheck,
} from "lucide-react";

const SEVERITY_BADGE: Record<string, React.ReactNode> = {
  critical: <Badge variant="destructive">Critical</Badge>,
  major: <Badge className="bg-amber-500 text-white">Major</Badge>,
  minor: <Badge variant="secondary">Minor</Badge>,
  observation: <Badge variant="outline">Observation</Badge>,
};

const TIMELINE = [
  { label: "Reported",           icon: AlertTriangle },
  { label: "Repair In Progress", icon: Wrench        },
  { label: "Resolved",           icon: CheckCircle2  },
  { label: "Closed",             icon: FileCheck     },
];

function statusStep(status: string) {
  return ["open", "in_progress", "resolved", "closed"].indexOf(status);
}

function statusLabel(status: string) {
  return { open: "Reported", in_progress: "Repair In Progress", resolved: "Resolved", closed: "Closed" }[status] ?? status;
}

function statusExplanation(status: string, severity: string) {
  if (status === "open") {
    if (severity === "critical") return "This is a critical fire safety issue requiring immediate attention. Our team has been notified and will be in contact shortly.";
    if (severity === "major")   return "This issue requires repair within 30 days per fire code requirements. Our team will schedule a follow-up visit.";
    return "This minor issue should be addressed at the next scheduled maintenance visit.";
  }
  if (status === "in_progress") return "Our technicians are actively working on repairing this deficiency. You will be notified when the repair is complete.";
  if (status === "resolved")    return "The repair has been completed and is pending final verification and sign-off.";
  if (status === "closed")      return "This deficiency has been fully resolved and verified. No further action is required.";
  return "";
}

function DeficiencyCard({ def, onClick }: { def: any; onClick: () => void }) {
  const step = statusStep(def.status);
  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {SEVERITY_BADGE[def.severity] ?? <Badge variant="outline">{def.severity}</Badge>}
              <Badge variant="outline" className="text-xs">{statusLabel(def.status)}</Badge>
            </div>
            <p className="text-sm font-medium mt-1 line-clamp-2">{def.description || def.title}</p>
            {def.location && <p className="text-xs text-muted-foreground mt-1">Location: {def.location}</p>}
            <p className="text-xs text-muted-foreground mt-1">
              Reported {new Date(def.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        {/* Mini timeline */}
        <div className="flex items-center mt-3">
          {TIMELINE.map((s, i) => {
            const Icon = s.icon;
            const done = i <= step;
            const current = i === step;
            return (
              <React.Fragment key={i}>
                <div className={`flex flex-col items-center ${current ? "scale-110" : ""}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${done ? "bg-primary border-primary" : "bg-muted border-muted-foreground/30"}`}>
                    <Icon className={`h-3 w-3 ${done ? "text-primary-foreground" : "text-muted-foreground"}`} />
                  </div>
                  <span className={`text-[9px] mt-0.5 text-center leading-tight max-w-[44px] ${current ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {s.label}
                  </span>
                </div>
                {i < TIMELINE.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-4 ${i < step ? "bg-primary" : "bg-muted-foreground/20"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CustomerDeficiencies() {
  const { user } = useAuth();
  const { previewOrg } = usePortalPreview();
  const customerOrgId = previewOrg?.id ?? user?.customerOrgId!;
  const [selected, setSelected] = useState<any>(null);

  const { data: deficiencies, isLoading } = trpc.deficiency.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  const open     = deficiencies?.filter((d: any) => d.status === "open" || d.status === "in_progress") ?? [];
  const resolved = deficiencies?.filter((d: any) => d.status === "resolved" || d.status === "closed") ?? [];

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Deficiencies</h1>
          <p className="text-muted-foreground">Track issues found during inspections</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-red-700">{open.length}</p>
              <p className="text-sm text-red-600">Open Issues</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-amber-700">
                {deficiencies?.filter((d: any) => d.status === "in_progress").length ?? 0}
              </p>
              <p className="text-sm text-amber-600">In Progress</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-green-700">{resolved.length}</p>
              <p className="text-sm text-green-600">Resolved</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {open.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  Open Issues ({open.length})
                </h2>
                {open.map((d: any) => (
                  <DeficiencyCard key={d.id} def={d} onClick={() => setSelected(d)} />
                ))}
              </div>
            )}

            {resolved.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Resolved Issues ({resolved.length})
                </h2>
                {resolved.map((d: any) => (
                  <DeficiencyCard key={d.id} def={d} onClick={() => setSelected(d)} />
                ))}
              </div>
            )}

            {!deficiencies?.length && (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <p className="font-semibold text-lg">No deficiencies found</p>
                  <p className="text-muted-foreground">All systems are in compliance.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Deficiency Detail
            </DialogTitle>
          </DialogHeader>
          {selected && (() => {
            const step = statusStep(selected.status);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {SEVERITY_BADGE[selected.severity] ?? <Badge variant="outline">{selected.severity}</Badge>}
                  <Badge variant="outline">{statusLabel(selected.status)}</Badge>
                </div>

                <p className="text-sm">{selected.description || selected.title}</p>

                {selected.location && (
                  <p className="text-sm"><span className="font-medium">Location:</span> {selected.location}</p>
                )}
                {selected.codeReference && (
                  <p className="text-sm"><span className="font-medium">Code Reference:</span> {selected.codeReference}</p>
                )}
                {selected.estimatedRepairCost && (
                  <p className="text-sm"><span className="font-medium">Estimated Repair Cost:</span> ${selected.estimatedRepairCost}</p>
                )}

                {/* Full timeline */}
                <div className="border rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status Timeline</p>
                  {TIMELINE.map((s, i) => {
                    const Icon = s.icon;
                    const done = i <= step;
                    const current = i === step;
                    return (
                      <div key={i} className={`flex items-start gap-3 ${!done ? "opacity-40" : ""}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 flex-shrink-0 mt-0.5 ${current ? "bg-primary border-primary" : done ? "bg-primary/20 border-primary/40" : "bg-muted border-muted-foreground/20"}`}>
                          <Icon className={`h-3.5 w-3.5 ${current ? "text-primary-foreground" : done ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${current ? "text-primary" : ""}`}>{s.label}</p>
                          {current && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {statusExplanation(selected.status, selected.severity)}
                            </p>
                          )}
                          {i === 0 && selected.createdAt && (
                            <p className="text-xs text-muted-foreground">{new Date(selected.createdAt).toLocaleDateString()}</p>
                          )}
                          {i === 2 && selected.resolvedAt && (
                            <p className="text-xs text-muted-foreground">{new Date(selected.resolvedAt).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(selected.resolutionNotes || selected.correctiveAction) && (
                  <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">Recommended Action</p>
                    <p className="text-sm text-blue-900 dark:text-blue-200">
                      {selected.correctiveAction || selected.resolutionNotes}
                    </p>
                  </div>
                )}

                {selected.customerExplanation && (
                  <div className="border rounded-lg p-3 bg-muted/50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">What This Means</p>
                    <p className="text-sm">{selected.customerExplanation}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </CustomerLayout>
  );
}
