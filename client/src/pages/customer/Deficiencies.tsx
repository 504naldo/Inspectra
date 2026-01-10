import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { 
  Shield, 
  LogOut,
  AlertTriangle,
  ArrowLeft,
  Eye,
  CheckCircle2,
  Clock,
  XCircle
} from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";

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
      case 'critical':
        return <Badge variant="destructive">Critical</Badge>;
      case 'major':
        return <Badge className="bg-amber-500">Major</Badge>;
      case 'minor':
        return <Badge variant="secondary">Minor</Badge>;
      default:
        return <Badge variant="outline">Observation</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved':
      case 'closed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-amber-500" />;
      case 'open':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const openDeficiencies = deficiencies?.filter((d: any) => d.status === 'open' || d.status === 'in_progress') || [];
  const resolvedDeficiencies = deficiencies?.filter((d: any) => d.status === 'resolved' || d.status === 'closed') || [];

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
        {/* Header */}
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
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-red-700">{openDeficiencies.length}</p>
              <p className="text-sm text-red-600">Open Issues</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-amber-700">
                {deficiencies?.filter((d: any) => d.status === 'in_progress').length || 0}
              </p>
              <p className="text-sm text-amber-600">In Progress</p>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-green-700">{resolvedDeficiencies.length}</p>
              <p className="text-sm text-green-600">Resolved</p>
            </CardContent>
          </Card>
        </div>

        {/* Deficiencies List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !deficiencies || deficiencies.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <p className="text-muted-foreground">No deficiencies found - great news!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Open Deficiencies */}
            {openDeficiencies.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Open Deficiencies ({openDeficiencies.length})
                </h2>
                <div className="space-y-3">
                  {openDeficiencies.map((def: any) => (
                    <DeficiencyCard 
                      key={def.id} 
                      deficiency={def} 
                      getSeverityBadge={getSeverityBadge}
                      getStatusIcon={getStatusIcon}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Resolved Deficiencies */}
            {resolvedDeficiencies.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Resolved ({resolvedDeficiencies.length})
                </h2>
                <div className="space-y-3">
                  {resolvedDeficiencies.map((def: any) => (
                    <DeficiencyCard 
                      key={def.id} 
                      deficiency={def} 
                      getSeverityBadge={getSeverityBadge}
                      getStatusIcon={getStatusIcon}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function DeficiencyCard({ 
  deficiency, 
  getSeverityBadge, 
  getStatusIcon 
}: { 
  deficiency: any; 
  getSeverityBadge: (s: string) => React.ReactNode;
  getStatusIcon: (s: string) => React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Card className="hover:shadow-md transition-shadow cursor-pointer">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {getStatusIcon(deficiency.status)}
                  <h3 className="font-semibold">{deficiency.title}</h3>
                  {getSeverityBadge(deficiency.severity)}
                </div>
                {deficiency.customerExplanation && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {deficiency.customerExplanation}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Reported {new Date(deficiency.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button variant="ghost" size="sm">
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {deficiency.title}
            {getSeverityBadge(deficiency.severity)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center gap-2">
            {getStatusIcon(deficiency.status)}
            <span className="capitalize">{deficiency.status.replace('_', ' ')}</span>
          </div>

          {deficiency.customerExplanation && (
            <div>
              <h4 className="font-medium mb-1">What This Means</h4>
              <p className="text-sm text-muted-foreground">
                {deficiency.customerExplanation}
              </p>
            </div>
          )}

          {deficiency.correctiveAction && (
            <div>
              <h4 className="font-medium mb-1">Recommended Action</h4>
              <p className="text-sm text-muted-foreground">
                {deficiency.correctiveAction}
              </p>
            </div>
          )}

          {deficiency.codeReference && (
            <div>
              <h4 className="font-medium mb-1">Code Reference</h4>
              <p className="text-sm text-muted-foreground">
                {deficiency.codeReference}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t">
            <div>
              <span className="text-muted-foreground">Reported:</span>
              <p>{new Date(deficiency.createdAt).toLocaleDateString()}</p>
            </div>
            {deficiency.resolvedAt && (
              <div>
                <span className="text-muted-foreground">Resolved:</span>
                <p>{new Date(deficiency.resolvedAt).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
