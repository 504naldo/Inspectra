import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePortalPreview } from "@/contexts/PortalPreviewContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import CustomerLayout from "@/components/CustomerLayout";
import { trpc } from "@/lib/trpc";
import { FileText, CheckCircle2, Clock, Download, Eye, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CustomerReports() {
  const { user } = useAuth();
  const { previewOrg } = usePortalPreview();
  const customerOrgId = previewOrg?.id ?? user?.customerOrgId!;
  const [_selectedReport, setSelectedReport] = useState<any>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  async function handleDownload(reportId: number) {
    setDownloadingId(reportId);
    try {
      const url = await utils.report.getDownloadUrl.fetch({ id: reportId });
      window.open(url, "_blank");
    } catch {
      toast.error("Could not get download link — please try again");
    } finally {
      setDownloadingId(null);
    }
  }

  const { data: reports, isLoading, refetch } = trpc.report.listByCustomerOrg.useQuery(
    { customerOrgId },
    { enabled: !!customerOrgId }
  );

  const approveReport = trpc.report.approve.useMutation({
    onSuccess: () => {
      toast.success("Report approved");
      setSelectedReport(null);
      refetch();
    },
    onError: () => toast.error("Failed to approve report"),
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case "sent":
        return <Badge className="bg-blue-100 text-blue-700"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case "generated":
        return <Badge variant="outline">Generated</Badge>;
      default:
        return <Badge variant="secondary">Draft</Badge>;
    }
  };

  return (
    <CustomerLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Inspection Reports</h1>
          <p className="text-muted-foreground">View and approve your inspection reports</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !reports?.length ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No reports available yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {reports.map((report: any) => (
              <Card key={report.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <FileText className="h-5 w-5 text-primary shrink-0" />
                        <h3 className="font-semibold">{report.title}</h3>
                        {getStatusBadge(report.status)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Report #{report.reportNumber} · Generated{" "}
                        {new Date(report.createdAt).toLocaleDateString()}
                      </p>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <span>Devices: {report.deviceCount ?? "—"}</span>
                        <span className="text-green-600">Pass: {report.passCount ?? "—"}</span>
                        <span className="text-red-600">Fail: {report.failCount ?? "—"}</span>
                        <span className="text-amber-600">Deficiencies: {report.deficiencyCount ?? "—"}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => setSelectedReport(report)}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>{report.title}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 py-2">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground text-xs uppercase tracking-wide">Report Number</p>
                                <p className="font-medium">{report.reportNumber}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs uppercase tracking-wide">Status</p>
                                <div className="mt-0.5">{getStatusBadge(report.status)}</div>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs uppercase tracking-wide">Generated</p>
                                <p className="font-medium">{new Date(report.createdAt).toLocaleDateString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs uppercase tracking-wide">Devices Tested</p>
                                <p className="font-medium">{report.deviceCount ?? "—"}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg text-center">
                              <div>
                                <p className="text-2xl font-bold text-green-600">{report.passCount ?? 0}</p>
                                <p className="text-sm text-muted-foreground">Passed</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-red-600">{report.failCount ?? 0}</p>
                                <p className="text-sm text-muted-foreground">Failed</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-amber-600">{report.deficiencyCount ?? 0}</p>
                                <p className="text-sm text-muted-foreground">Deficiencies</p>
                              </div>
                            </div>

                            {report.executiveSummary && (
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Executive Summary</p>
                                <p className="text-sm whitespace-pre-wrap">{report.executiveSummary}</p>
                              </div>
                            )}

                            <div className="flex gap-2">
                              {report.fileKey && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                  disabled={downloadingId === report.id}
                                  onClick={() => handleDownload(report.id)}
                                >
                                  {downloadingId === report.id
                                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    : <Download className="h-4 w-4 mr-2" />}
                                  Download PDF
                                </Button>
                              )}
                              {report.status === "sent" && (
                                <Button
                                  className="flex-1"
                                  onClick={() => approveReport.mutate({ id: report.id })}
                                  disabled={approveReport.isPending}
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-2" />
                                  {approveReport.isPending ? "Approving…" : "Approve Report"}
                                </Button>
                              )}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {report.fileKey && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadingId === report.id}
                          onClick={() => handleDownload(report.id)}
                        >
                          {downloadingId === report.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Download className="h-4 w-4 mr-1" />}
                          {downloadingId === report.id ? "" : "PDF"}
                        </Button>
                      )}
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
