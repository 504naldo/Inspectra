import { useState } from "react";
import { useParams, Link } from "wouter";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
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
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
// S3 upload is handled server-side via tRPC

export default function AdminJobDetails() {
  const { jobId } = useParams<{ jobId: string }>();
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const utils = trpc.useUtils();

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
      toast.success(`Preview ready: ${data.totalRows} rows found`);
      // TODO: Show preview dialog
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
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      toast.error("File size must be less than 50MB");
      return;
    }

    setSelectedFile(file);
  };

  const uploadToS3Mutation = trpc.files.uploadToS3.useMutation();

  const handleUpload = async () => {
    if (!selectedFile || !job || !user || !user.companyId) return;

    setIsUploading(true);
    try {
      // Read file as base64
      const buffer = await selectedFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      // Upload to S3 via server
      const { fileKey, fileUrl } = await uploadToS3Mutation.mutateAsync({
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type,
        companyId: user.companyId,
        jobId: job.id,
        fileData: base64,
      });

      // Create attachment record
      await uploadMutation.mutateAsync({
        entityType: "job",
        entityId: job.id,
        siteId: job.siteId,
        jobId: job.id,
        fileName: selectedFile.name,
        fileKey,
        fileUrl,
        mimeType: selectedFile.type,
        fileSize: selectedFile.size,
      });
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = (mimeType: string | null) => {
    if (!mimeType) return <FileText className="h-5 w-5" />;
    if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    }
    if (mimeType.includes("image")) {
      return <ImageIcon className="h-5 w-5 text-blue-600" />;
    }
    return <FileText className="h-5 w-5" />;
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

  const isExcelFile = (mimeType: string | null) => {
    return mimeType?.includes("spreadsheet") || mimeType?.includes("excel") || mimeType?.includes("csv");
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
          <Badge>{job.status}</Badge>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="files" className="w-full">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="files">Files</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
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
                    accept=".xlsx,.xlsm,.csv,.pdf,.jpg,.jpeg,.png"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
                      <Upload className="h-4 w-4 mr-2" />
                      Choose File
                    </div>
                  </label>
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
                          {isExcelFile(file.mimeType) && file.importStatus === "none" && (
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
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => importMutation.mutate({ 
                                  fileId: file.id,
                                  siteId: job.siteId,
                                  jobId: job.id
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
    </AdminLayout>
  );
}
