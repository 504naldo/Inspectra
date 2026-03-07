import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { 
  Shield, 
  LogOut,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  XCircle,
  Wrench,
  FileCheck
} from "lucide-react";
import { Link } from "wouter";

export default function CustomerDeficiencies() {
  const { user, logout } = useAuth();
  const customerOrgId = user?.customerOrgId || 1;
  const [selectedDeficiency, setSelectedDeficiency] = useState<any>(null);

  const { data: deficiencies, isLoading } = trpc.deficiency.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return <Badge variant="destructive">Critical</Badge>;
      case 'major': return <Badge className="bg-amber-500 text-white">Major</Badge>;
      case 'minor': return <Badge variant="secondary">Minor</Badge>;
      default: return <Badge variant="outline">Observation</Badge>;
    }
  };

  const getTimelineStep = (status: string) => {
    switch (status) {
      case 'open': return 0;
      case 'in_progress': return 1;
      case 'resolved': return 2;
      case 'closed': return 3;
      default: return 0;
    }
  };

  const timelineSteps = [
    { label: 'Reported', icon: AlertTriangle },
    { label: 'Repair In Progress', icon: Wrench },
    { label: 'Resolved', icon: CheckCircle2 },
    { label: 'Closed', icon: FileCheck },
  ];

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'open': return 'Reported';
      case 'in_progress': return 'Repair In Progress';
      case 'resolved': return 'Resolved';
      case 'closed': return 'Closed';
      default: return status;
    }
  };

  const getWhatThisMeans = (status: string, severity: string) => {
    if (status === 'open') {
      if (severity === 'critical') return 'This is a critical fire safety issue requiring immediate attention. Our team has been notified and will be in contact shortly.';
      if (severity === 'major') return 'This issue requires repair within 30 days per fire code requirements. Our team will schedule a follow-up visit.';
      return 'This minor issue should be addressed at the next scheduled maintenance visit.';
    }
    if (status === 'in_progress') return 'Our technicians are actively working on repairing this deficiency. You will be notified when the repair is complete.';
    if (status === 'resolved') return 'The repair has been completed and is pending final verification and sign-off.';
    if (status === 'closed') return 'This deficiency has been fully resolved and verified. No further action is required.';
    return '';
  };

  const openDeficiencies = deficiencies?.filter((d: any) => d.status === 'open' || d.status === 'in_progress') || [];
  const resolvedDeficiencies = deficiencies?.filter((d: any) => d.status === 'resolved' || d.status === 'closed') || [];

  const DeficiencyCard = ({ def }: { def: any }) => {
    const step = getTimelineStep(def.status);
    return (
      <Card
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => setSelectedDeficiency(def)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {getSeverityBadge(def.severity)}
                <Badge variant="outline" className="text-xs">{getStatusLabel(def.status)}</Badge>
              </div>
              <p className="text-sm font-medium mt-1 line-clamp-2">{def.description || def.title}</p>
              {def.location && <p className="text-xs text-muted-foreground mt-1">Location: {def.location}</p>}
              {def.codeReference && <p className="text-xs text-muted-foreground">Code: {def.codeReference}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Reported {new Date(def.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Mini timeline */}
          <div className="flex items-center gap-0 mt-3">
            {timelineSteps.map((s, i) => {
              const Icon = s.icon;
              const isComplete = i <= step;
              const isCurrent = i === step;
              return (
                <React.Fragment key={i}>
                  <div className={`flex flex-col items-center ${isCurrent ? 'scale-110' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                      isComplete
                        ? 'bg-primary border-primary'
                        : 'bg-muted border-muted-foreground/30'
                    }`}>
                      <Icon className={`h-3 w-3 ${isComplete ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                    </div>
                    <span className={`text-[9px] mt-0.5 text-center leading-tight max-w-[44px] ${
                      isCurrent ? 'font-semibold text-primary' : 'text-muted-foreground'
                    }`}>{s.label}</span>
                  </div>
                  {i < timelineSteps.length - 1 && (
                    <div className={`flex-1 h-0.5 mb-4 ${i < step ? 'bg-primary' : 'bg-muted-foreground/20'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            <span className="font-bold text-lg">Inspectra</span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/customer">
                <Button variant="ghost" size="sm">Dashboard</Button>
              </Link>
              <Link href="/customer/reports">
                <Button variant="ghost" size="sm">Reports</Button>
              </Link>
              <Link href="/customer/deficiencies">
                <Button variant="secondary" size="sm">Deficiencies</Button>
              </Link>
            </nav>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-4">
          <Link href="/customer">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Deficiencies</h1>
            <p className="text-muted-foreground">Track issues found during inspections</p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-red-700">{openDeficiencies.length}</p>
              <p className="text-sm text-red-600">Open Issues</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-amber-700">
                {deficiencies?.filter((d: any) => d.status === 'in_progress').length || 0}
              </p>
              <p className="text-sm text-amber-600">In Progress</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-green-700">{resolvedDeficiencies.length}</p>
              <p className="text-sm text-green-600">Resolved</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {openDeficiencies.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  Open Issues ({openDeficiencies.length})
                </h2>
                {openDeficiencies.map((def: any) => (
                  <DeficiencyCard key={def.id} def={def} />
                ))}
              </div>
            )}

            {resolvedDeficiencies.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Resolved Issues ({resolvedDeficiencies.length})
                </h2>
                {resolvedDeficiencies.map((def: any) => (
                  <DeficiencyCard key={def.id} def={def} />
                ))}
              </div>
            )}

            {(!deficiencies || deficiencies.length === 0) && (
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
      </main>

      {/* Detail Dialog */}
      <Dialog open={!!selectedDeficiency} onOpenChange={(open) => !open && setSelectedDeficiency(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Deficiency Detail
            </DialogTitle>
          </DialogHeader>
          {selectedDeficiency && (() => {
            const def = selectedDeficiency;
            const step = getTimelineStep(def.status);
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {getSeverityBadge(def.severity)}
                  <Badge variant="outline">{getStatusLabel(def.status)}</Badge>
                </div>

                <p className="text-sm">{def.description || def.title}</p>

                {def.location && (
                  <div className="text-sm"><span className="font-medium">Location:</span> {def.location}</div>
                )}
                {def.codeReference && (
                  <div className="text-sm"><span className="font-medium">Code Reference:</span> {def.codeReference}</div>
                )}
                {def.estimatedRepairCost && (
                  <div className="text-sm"><span className="font-medium">Estimated Repair Cost:</span> ${def.estimatedRepairCost}</div>
                )}

                {/* Full Timeline */}
                <div className="border rounded-lg p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status Timeline</p>
                  {timelineSteps.map((s, i) => {
                    const Icon = s.icon;
                    const isComplete = i <= step;
                    const isCurrent = i === step;
                    return (
                      <div key={i} className={`flex items-start gap-3 ${!isComplete ? 'opacity-40' : ''}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 flex-shrink-0 mt-0.5 ${
                          isCurrent ? 'bg-primary border-primary' : isComplete ? 'bg-primary/20 border-primary/40' : 'bg-muted border-muted-foreground/20'
                        }`}>
                          <Icon className={`h-3.5 w-3.5 ${isCurrent ? 'text-primary-foreground' : isComplete ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${isCurrent ? 'text-primary' : ''}`}>{s.label}</p>
                          {isCurrent && (
                            <p className="text-xs text-muted-foreground mt-0.5">{getWhatThisMeans(def.status, def.severity)}</p>
                          )}
                          {i === 0 && def.createdAt && (
                            <p className="text-xs text-muted-foreground">{new Date(def.createdAt).toLocaleDateString()}</p>
                          )}
                          {i === 2 && def.resolvedAt && (
                            <p className="text-xs text-muted-foreground">{new Date(def.resolvedAt).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(def.resolutionNotes || def.correctiveAction) && (
                  <div className="border rounded-lg p-3 bg-blue-50 dark:bg-blue-950/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 mb-1">Recommended Action</p>
                    <p className="text-sm text-blue-900 dark:text-blue-200">{def.correctiveAction || def.resolutionNotes}</p>
                  </div>
                )}

                {def.customerExplanation && (
                  <div className="border rounded-lg p-3 bg-muted/50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">What This Means</p>
                    <p className="text-sm">{def.customerExplanation}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
