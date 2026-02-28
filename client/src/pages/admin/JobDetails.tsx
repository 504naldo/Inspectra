import { useState } from "react";
import { useParams, Link } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import FinalizeJobDialog from "@/components/FinalizeJobDialog";
import { 
  ArrowLeft, 
  Upload, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon,
  Download,
  Eye,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  ShieldX
} from "lucide-react";
import { toast } from "sonner";
// S3 upload is handled server-side via tRPC

export default function AdminJobDetails() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const utils = trpc.useUtils();

  const verifyHashQuery = trpc.compliance.verifyJobHash.useQuery(
    { jobId: parseInt(jobId!) },
    { enabled: false }
  );

  const handleVerifyHash = async () => {
    setVerifyDialogOpen(true);
    setVerifyResult(null);
    try {
      const result = await utils.compliance.verifyJobHash.fetch({ jobId: parseInt(jobId!) });
      setVerifyResult(result);
    } catch (err: any) {
      setVerifyResult({ error: err.message || 'Verification failed' });
    }
  };

  const { data: job, isLoading: jobLoading } = trpc.job.get.useQuery(
    { id: parseInt(jobId!) },
    { enabled: !!jobId }
  );

  const { data: files, isLoading: filesLoading } = trpc.files.listByJob.useQuery(
    { jobId: parseInt(jobId!) },
    { enabled: !!jobId }
  );

  const uploadMutation = trpc.files.create.useMutation({
    onSuccess: () => {
      toast.success("File uploaded successfully");
      utils.files.listByJob.invalidate();
      setSelectedFile(null);
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  const previewImportMutation = trpc.files.previewImportExcel.useMutation({
    onSuccess: (data) => {
      setPreviewData(data);
      // Set default to first device sheet
      if (data.selectedSheet) {
        setSelectedSheets([data.selectedSheet]);
      }
      const deviceSheets = data.availableSheets?.filter((s: any) => s.isDevice).length || 0;
      toast.success(`Preview ready: ${deviceSheets} device sheets found, ${data.totalRows} total rows`);
    },
    onError: (error) => {
      toast.error(`Preview failed: ${error.message}`);
    },
  });

  const importMutation = trpc.files.importExcelDevices.useMutation({
    onSuccess: (data) => {
      const summary = `Imported ${data.imported.fireAlarm || 0} fire alarm devices, ${data.imported.extinguishers || 0} extinguishers, ${data.imported.emergencyLights || 0} emergency lights`;
      toast.success(summary);
      utils.files.listByJob.invalidate();
      // Clear preview data after successful import
      setPreviewData(null);
      setSelectedSheets([]);
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("Selected file:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File size must be less than 50MB");
      return;
    }

    setSelectedFile(file);
    toast.success(`Selected: ${file.name}`);
  };

  const uploadToS3Mutation = trpc.files.uploadToS3.useMutation();

  const handleUpload = async () => {
    if (!selectedFile || !job || !user || !user.companyId) return;

    setIsUploading(true);
    try {
      // Use FormData for multipart upload (no base64 encoding)
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("entityType", "job");
      formData.append("entityId", job.id.toString());
      formData.append("companyId", user.companyId.toString());
      formData.append("jobId", job.id.toString());
      formData.append("siteId", job.siteId.toString());
      formData.append("userId", user.id.toString());

      // Upload via multipart API endpoint
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload failed");
      }

      const result = await response.json();
      
      // Refresh file list
      await utils.files.listByJob.invalidate();
      toast.success("File uploaded successfully");
      setSelectedFile(null);
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return <FileText className="h-5 w-5" />;
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("macroEnabled")) {
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    }
    if (mimeType.includes("image")) {
      return <ImageIcon className="h-5 w-5 text-blue-600" />;
    }
    return <FileText className="h-5 w-5" />;
  };

  const isExcelFile = (mimeType: string | null, fileName?: string | null) => {
    // Check MIME type first
    if (mimeType) {
      const excelMimeTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel.sheet.macroEnabled.12", // .xlsm
        "application/vnd.ms-excel", // .xls
        "application/vnd.openxmlformats-officedocument.spreadsheetml.template", // .xltx
      ];
      const mimeMatch = excelMimeTypes.some(type => mimeType.includes(type)) || 
                        mimeType.includes("spreadsheet") || 
                        mimeType.includes("excel");
      if (mimeMatch) return true;
    }

    // Fallback to extension check (critical for Chrome mobile/desktop with empty/generic MIME)
    if (fileName) {
      const ext = fileName.toLowerCase().split(".").pop();
      return ext === "xlsx" || ext === "xlsm" || ext === "xls" || ext === "csv";
    }

    return false;
  };

  const getImportStatusBadge = (status: string) => {
    switch (status) {
      case "imported":
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Imported</Badge>;
      case "previewed":
        return <Badge variant="secondary"><Eye className="h-3 w-3 mr-1" />Previewed</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      default:
        return null;
    }
  };



  if (jobLoading) {
    return (
      <AdminLayout title="Job Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (!job) {
    return (
      <AdminLayout title="Job Not Found">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg text-muted-foreground">Job not found</p>
          <Link href="/admin/jobs">
            <Button variant="link" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Jobs
            </Button>
          </Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={`Job #${job.id}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/jobs">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">Job #{job.id}</h1>
              <p className="text-sm text-muted-foreground">{job.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{job.status}</Badge>
            {user?.role === "admin" && job.finalizedAt && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                onClick={handleVerifyHash}
              >
                <ShieldCheck className="h-4 w-4" />
                Verify Integrity
              </Button>
            )}
            {(user?.role === "admin" || user?.role === "office") && (
              <FinalizeJobDialog
                jobId={job.id}
                jobNumber={job.jobNumber ?? undefined}
                isFinalized={!!job.finalizedAt}
                finalizedAt={job.finalizedAt}
                finalizationHash={job.finalizationHash}
                onFinalized={() => utils.job.get.invalidate({ id: job.id })}
              />
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="files" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            {job.finalizedAt && (
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Record Sealed — Immutable</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Finalized on {new Date(job.finalizedAt).toLocaleString()}. No further edits are permitted.
                    {job.finalizationHash && (
                      <span className="block mt-1 font-mono text-[10px] break-all text-green-600">
                        SHA-256: {job.finalizationHash}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Job Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Type</p>
                    <p className="text-sm text-muted-foreground">{job.jobType}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Status</p>
                    <p className="text-sm text-muted-foreground">{job.status}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Scheduled Date</p>
                    <p className="text-sm text-muted-foreground">
                      {job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString() : "Not scheduled"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Priority</p>
                    <p className="text-sm text-muted-foreground">{job.priority}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                    accept=".xlsx,.xlsm,.xls,.csv,.pdf,.jpg,.jpeg,.png"
                  />
                  <div className="flex flex-col gap-1">
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                        <Upload className="h-4 w-4 mr-2" />
                        Choose File
                      </div>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Accepted: .xlsx, .xlsm, .xls, .csv, .pdf, .jpg, .jpeg, .png
                    </p>
                  </div>
                  {selectedFile && (
                    <>
                      <span className="text-sm text-muted-foreground">{selectedFile.name}</span>
                      <Button 
                        onClick={handleUpload} 
                        disabled={isUploading}
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          "Upload"
                        )}
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Accepted formats: Excel (.xlsx, .xlsm, .csv), PDF, Images (JPG, PNG). Max size: 50MB
                </p>
              </CardContent>
            </Card>

            {/* Files List */}
            <Card>
              <CardHeader>
                <CardTitle>Uploaded Files</CardTitle>
              </CardHeader>
              <CardContent>
                {filesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : files && files.length > 0 ? (
                  <div className="space-y-2">
                    {files.map((file: any) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.mimeType)}
                          <div>
                            <p className="text-sm font-medium">{file.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              Uploaded {new Date(file.createdAt).toLocaleDateString()} by User #{file.uploadedById}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getImportStatusBadge(file.importStatus)}
                          {isExcelFile(file.mimeType, file.fileName) && file.importStatus === "none" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => previewImportMutation.mutate({ fileId: file.id })}
                                disabled={previewImportMutation.isPending}
                              >
                                {previewImportMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <Eye className="h-4 w-4 mr-1" />
                                    Preview Import
                                  </>
                                )}
                              </Button>
                              {previewData && previewData.availableSheets && (
                                <div className="flex items-center gap-2">
                                  <select
                                    className="text-sm border rounded px-2 py-1"
                                    value={selectedSheets[0] || ""}
                                    onChange={(e) => {
                                      const newSheet = e.target.value;
                                      setSelectedSheets([newSheet]);
                                      // Refresh preview with new sheet
                                      previewImportMutation.mutate({ fileId: file.id, sheetName: newSheet });
                                    }}
                                  >
                                    {previewData.availableSheets.map((sheet: any) => (
                                      <option key={sheet.name} value={sheet.name}>
                                        {sheet.name} {sheet.isDevice ? "✓" : "(excluded)"} ({sheet.rowCount} rows)
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => importMutation.mutate({ 
                                  fileId: file.id,
                                  siteId: job.siteId,
                                  jobId: job.id,
                                  selectedSheets: selectedSheets.length > 0 ? selectedSheets : undefined
                                })}
                                disabled={importMutation.isPending}
                              >
                                {importMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Import Devices"
                                )}
                              </Button>
                            </>
                          )}
                          <a href={file.fileUrl} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No files uploaded yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {/* Hash Verify Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Record Integrity Verification
            </DialogTitle>
            <DialogDescription>
              Recomputes the SHA-256 finalization hash and compares it to the stored value.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {!verifyResult ? (
              <div className="flex items-center justify-center py-8 gap-3 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Verifying record integrity...</span>
              </div>
            ) : verifyResult.error ? (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <ShieldX className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-red-800">Verification Error</p>
                  <p className="text-sm text-red-700 mt-1">{verifyResult.error}</p>
                </div>
              </div>
            ) : verifyResult.hashMatch ? (
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-green-800">Integrity Confirmed</p>
                  <p className="text-sm text-green-700 mt-1">{verifyResult.message}</p>
                  <p className="text-xs text-green-600 mt-2 font-mono break-all">{verifyResult.storedHash}</p>
                  {verifyResult.finalizedAt && (
                    <p className="text-xs text-green-600 mt-1">Sealed: {new Date(verifyResult.finalizedAt).toLocaleString()}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
                  <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-red-800">Hash Mismatch — Record May Be Tampered</p>
                    <p className="text-sm text-red-700 mt-1">{verifyResult.message}</p>
                  </div>
                </div>
                <div className="rounded-lg border p-3 space-y-2 text-xs font-mono">
                  <div>
                    <p className="text-muted-foreground font-sans font-medium">Stored hash:</p>
                    <p className="break-all text-foreground">{verifyResult.storedHash}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground font-sans font-medium">Recomputed hash:</p>
                    <p className="break-all text-red-600">{verifyResult.recomputedHash}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
