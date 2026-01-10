import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { 
  Shield, 
  LogOut,
  FileText,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  ArrowLeft
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

export default function CustomerReports() {
  const { user, logout } = useAuth();
  const customerOrgId = user?.customerOrgId || 1;
  const [selectedReport, setSelectedReport] = useState<any>(null);

  const { data: reports, isLoading, refetch } = trpc.report.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  const approveReport = trpc.report.approve.useMutation({
    onSuccess: () => {
      toast.success('Report approved');
      setSelectedReport(null);
      refetch();
    },
    onError: () => {
      toast.error('Failed to approve report');
    }
  });

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const handleApprove = (reportId: number) => {
    approveReport.mutate({ id: reportId });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="status-pass flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</span>;
      case 'sent':
        return <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs flex items-center gap-1"><Clock className="h-3 w-3" /> Pending Review</span>;
      case 'generated':
        return <span className="status-pending">Generated</span>;
      default:
        return <span className="status-na">Draft</span>;
    }
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
                <Button variant="secondary" size="sm">Reports</Button>
              </Link>
              <Link href="/customer/deficiencies">
                <Button variant="ghost" size="sm">Deficiencies</Button>
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
            <h1 className="text-2xl font-bold">Inspection Reports</h1>
            <p className="text-muted-foreground">View and approve your inspection reports</p>
          </div>
        </div>

        {/* Reports List */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !reports || reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No reports available</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((report: any) => (
              <Card key={report.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <FileText className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold">{report.title}</h3>
                        {getStatusBadge(report.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Report #{report.reportNumber} • Generated {new Date(report.createdAt).toLocaleDateString()}
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span>Devices: {report.deviceCount}</span>
                        <span className="text-green-600">Pass: {report.passCount}</span>
                        <span className="text-red-600">Fail: {report.failCount}</span>
                        <span className="text-amber-600">Deficiencies: {report.deficiencyCount}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedReport(report)}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>{report.title}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Report Number:</span>
                                <p className="font-medium">{report.reportNumber}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Status:</span>
                                <p>{getStatusBadge(report.status)}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Generated:</span>
                                <p className="font-medium">{new Date(report.createdAt).toLocaleDateString()}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Devices Tested:</span>
                                <p className="font-medium">{report.deviceCount}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                              <div className="text-center">
                                <p className="text-2xl font-bold text-green-600">{report.passCount}</p>
                                <p className="text-sm text-muted-foreground">Passed</p>
                              </div>
                              <div className="text-center">
                                <p className="text-2xl font-bold text-red-600">{report.failCount}</p>
                                <p className="text-sm text-muted-foreground">Failed</p>
                              </div>
                              <div className="text-center">
                                <p className="text-2xl font-bold text-amber-600">{report.deficiencyCount}</p>
                                <p className="text-sm text-muted-foreground">Deficiencies</p>
                              </div>
                            </div>

                            {report.executiveSummary && (
                              <div>
                                <h4 className="font-medium mb-2">Executive Summary</h4>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                  {report.executiveSummary}
                                </p>
                              </div>
                            )}

                            {report.status === 'sent' && (
                              <Button 
                                className="w-full"
                                onClick={() => handleApprove(report.id)}
                                disabled={approveReport.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                {approveReport.isPending ? 'Approving...' : 'Approve Report'}
                              </Button>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                      
                      {report.fileUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={report.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
