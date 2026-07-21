import { useAuth } from "@/_core/hooks/useAuth";
import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Upload,
  FileImage,
  FileText,
  File,
  Trash2,
  Tag,
  Link2,
  Download,
  X,
  Plus,
  Search,
  Filter,
  Grid,
  List,
  Eye,
  Loader2,
  ArrowLeft,
  HardDrive
} from "lucide-react";
import { DriveFilePicker } from "@/components/DriveFilePicker";
import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type SiteFilesProps = {
  siteId: number;
};

export default function SiteFiles({ siteId }: SiteFilesProps) {
  const { user } = useAuth();

  if (!user || !user.companyId) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-muted-foreground">Loading session...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedFiles, setSelectedFiles] = useState<number[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [selectedFileForEdit, setSelectedFileForEdit] = useState<number | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadTags, setUploadTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const companyId = user.companyId;

  // Queries
  const { data: site } = trpc.site.get.useQuery({ id: siteId }, { enabled: siteId > 0 });
  const { data: files, refetch: refetchFiles } = trpc.attachment.listBySite.useQuery(
    { siteId },
    { enabled: siteId > 0 }
  );
  const { data: tags } = trpc.fileTag.list.useQuery({ companyId });
  const { data: jobs } = trpc.job.listBySite.useQuery({ siteId }, { enabled: siteId > 0 });
  const { data: devices } = trpc.device.listBySite.useQuery({ siteId }, { enabled: siteId > 0 });
  
  // Mutations
  const bulkUploadMutation = trpc.attachment.bulkUpload.useMutation({
    onSuccess: () => {
      toast.success("Files uploaded successfully");
      refetchFiles();
      setIsUploadOpen(false);
      setPendingFiles([]);
      setUploadTags([]);
      setIsUploading(false);
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
      setIsUploading(false);
    },
  });
  
  const updateTagsMutation = trpc.attachment.updateTags.useMutation({
    onSuccess: () => {
      toast.success("Tags updated");
      refetchFiles();
      setIsTagDialogOpen(false);
    },
  });
  
  const linkMutation = trpc.attachment.linkToEntities.useMutation({
    onSuccess: () => {
      toast.success("File linked successfully");
      refetchFiles();
      setIsLinkDialogOpen(false);
    },
  });
  
  const deleteMutation = trpc.attachment.delete.useMutation({
    onSuccess: () => {
      toast.success("File deleted");
      refetchFiles();
    },
  });
  
  const createTagMutation = trpc.fileTag.create.useMutation({
    onSuccess: () => {
      toast.success("Tag created");
    },
  });
  
  // Handlers
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    setPendingFiles(prev => [...prev, ...selectedFiles]);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setPendingFiles(prev => [...prev, ...droppedFiles]);
  }, []);
  
  const handleUpload = async () => {
    if (pendingFiles.length === 0 || !user?.companyId) return;
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Upload files sequentially using FormData (no base64)
      let successCount = 0;
      for (const file of pendingFiles) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("entityType", "site");
        formData.append("entityId", siteId.toString());
        formData.append("companyId", user.companyId.toString());
        formData.append("siteId", siteId.toString());
        formData.append("userId", user.id.toString());
        
        // Add tags if provided
        if (uploadTags.length > 0) {
          formData.append("tags", JSON.stringify(uploadTags));
        }

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("Upload error for", file.name, ":", error);
          toast.error(`Failed to upload ${file.name}: ${error.error || "Unknown error"}`);
          continue;
        }

        successCount++;
        setUploadProgress(Math.round((successCount / pendingFiles.length) * 100));
      }

      // Refresh file list
      await refetchFiles();
      
      if (successCount === pendingFiles.length) {
        toast.success(`Successfully uploaded ${successCount} file(s)`);
      } else {
        toast.warning(`Uploaded ${successCount} of ${pendingFiles.length} file(s)`);
      }
      
      // Clear pending files and tags
      setPendingFiles([]);
      setUploadTags([]);
    } catch (error: unknown) {
      console.error("Upload error:", error);
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };
  
  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  const addTag = () => {
    if (newTag && !uploadTags.includes(newTag)) {
      setUploadTags([...uploadTags, newTag]);
      setNewTag("");
    }
  };
  
  const removeTag = (tag: string) => {
    setUploadTags(uploadTags.filter(t => t !== tag));
  };
  
  const getFileIcon = (mimeType: string | null | undefined) => {
    if (!mimeType) return <File className="h-8 w-8 text-muted-foreground" />;
    if (mimeType.startsWith('image/')) return <FileImage className="h-8 w-8 text-accent" />;
    if (mimeType.includes('pdf')) return <FileText className="h-8 w-8 text-destructive" />;
    return <File className="h-8 w-8 text-muted-foreground" />;
  };
  
  const formatFileSize = (bytes: number | null | undefined) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  
  const filteredFiles = (files?.filter(file => 
    (file.fileName as string).toLowerCase().includes(searchQuery.toLowerCase()) ||
    (file.caption as string | null)?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []) as Array<{
    id: number;
    fileName: string;
    fileUrl: string;
    fileKey: string;
    mimeType: string | null;
    fileSize: number | null;
    caption: string | null;
    tags: string[] | null;
    createdAt: Date;
  }>;
  
  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href={`/admin/sites`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Site Files</h1>
            <p className="text-muted-foreground">{site?.name || 'Loading...'}</p>
          </div>
          <Button variant="outline" onClick={() => setShowDrivePicker(true)}>
            <HardDrive className="h-4 w-4 mr-2" />
            Import from Drive
          </Button>
          <Button onClick={() => setIsUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Files
          </Button>
        </div>
        
        {/* Toolbar */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={viewMode === "grid" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setViewMode("grid")}
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "outline"}
                  size="icon"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Files Grid/List */}
        {filteredFiles.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileImage className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No files yet</h3>
              <p className="text-muted-foreground mb-4">Upload files to this site to get started</p>
              <Button onClick={() => setIsUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Files
              </Button>
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredFiles.map((file) => (
              <Card key={file.id} className="group relative overflow-hidden">
                <CardContent className="p-4">
                  {/* Thumbnail */}
                  <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                    {file.mimeType?.startsWith('image/') ? (
                      <img
                        src={file.fileUrl}
                        alt={file.fileName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getFileIcon(file.mimeType)
                    )}
                  </div>
                  
                  {/* File Info */}
                  <p className="font-medium text-sm truncate" title={file.fileName ?? ''}>
                    {file.fileName ?? ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.fileSize)}
                  </p>
                  
                  {/* Tags */}
                  {file.tags && (file.tags as string[]).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(file.tags as string[]).slice(0, 2).map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {String(tag)}
                        </Badge>
                      ))}
                      {(file.tags as string[]).length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{(file.tags as string[]).length - 2}
                        </Badge>
                      )}
                    </div>
                  )}
                  
                  {/* Actions */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      onClick={() => window.open(file.fileUrl, '_blank')}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      onClick={() => {
                        setSelectedFileForEdit(file.id);
                        setIsTagDialogOpen(true);
                      }}
                    >
                      <Tag className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-8 w-8"
                      onClick={() => {
                        if (confirm('Delete this file?')) {
                          deleteMutation.mutate({ id: file.id });
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="border-b">
                  <tr>
                    <th className="text-left p-4 font-medium">File</th>
                    <th className="text-left p-4 font-medium">Size</th>
                    <th className="text-left p-4 font-medium">Tags</th>
                    <th className="text-left p-4 font-medium">Uploaded</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr key={file.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.mimeType)}
                          <div>
                            <p className="font-medium">{String(file.fileName)}</p>
                            {file.caption && (
                              <p className="text-sm text-muted-foreground">{String(file.caption)}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {formatFileSize(file.fileSize)}
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1">
                          {file.tags && Array.isArray(file.tags) && file.tags.map((tag, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {tag as string}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(file.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => window.open(file.fileUrl, '_blank')}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setSelectedFileForEdit(file.id);
                              setIsTagDialogOpen(true);
                            }}
                          >
                            <Tag className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setSelectedFileForEdit(file.id);
                              setIsLinkDialogOpen(true);
                            }}
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              if (confirm('Delete this file?')) {
                                deleteMutation.mutate({ id: file.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
        
        {/* Upload Dialog */}
        <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Upload Files</DialogTitle>
              <DialogDescription>
                Upload multiple files to this site. You can add tags to organize them.
              </DialogDescription>
            </DialogHeader>
            
            {/* Drop Zone */}
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-1">Drop files here or click to browse</p>
              <p className="text-sm text-muted-foreground">
                Supports images, PDFs, and documents
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept=".xlsx,.xlsm,.xls,.csv,.pdf,.jpg,.jpeg,.png"
              />
            </div>
            
            {/* Pending Files */}
            {pendingFiles.length > 0 && (
              <div className="space-y-2">
                <Label>Selected Files ({pendingFiles.length})</Label>
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {pendingFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-muted rounded-lg p-2">
                      <div className="flex items-center gap-2">
                        {getFileIcon(file.type)}
                        <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => removePendingFile(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags (optional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a tag..."
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button type="button" variant="outline" onClick={addTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {uploadTags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {uploadTags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => removeTag(tag)}
                      />
                    </Badge>
                  ))}
                </div>
              )}
              {tags && tags.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1">Quick add:</p>
                  <div className="flex flex-wrap gap-1">
                    {tags.filter(t => !uploadTags.includes(t.name)).slice(0, 5).map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => setUploadTags([...uploadTags, tag.name])}
                      >
                        + {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                disabled={pendingFiles.length === 0 || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {pendingFiles.length} file{pendingFiles.length !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Tag Edit Dialog */}
        <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Tags</DialogTitle>
              <DialogDescription>
                Add or remove tags from this file.
              </DialogDescription>
            </DialogHeader>
            <TagEditor
              fileId={selectedFileForEdit}
              existingTags={files?.find(f => f.id === selectedFileForEdit)?.tags as string[] || []}
              availableTags={tags || []}
              onSave={(tags) => {
                if (selectedFileForEdit) {
                  updateTagsMutation.mutate({ id: selectedFileForEdit, tags });
                }
              }}
            />
          </DialogContent>
        </Dialog>
        
        {/* Link Dialog */}
        <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Link to Entity</DialogTitle>
              <DialogDescription>
                Link this file to a job or device for easy reference.
              </DialogDescription>
            </DialogHeader>
            <LinkEditor
              fileId={selectedFileForEdit}
              jobs={jobs || []}
              devices={devices || []}
              onSave={(links) => {
                if (selectedFileForEdit) {
                  linkMutation.mutate({ id: selectedFileForEdit, ...links });
                }
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Google Drive File Picker */}
        <DriveFilePicker
          open={showDrivePicker}
          onClose={() => setShowDrivePicker(false)}
          siteId={siteId}
          companyId={companyId}
          onFileSelected={async () => {
            // Attachment was created server-side; just refresh the file list
            await refetchFiles();
            toast.success("File imported from Google Drive");
          }}
        />
      </div>
    </AdminLayout>
  );
}

// Tag Editor Component
function TagEditor({
  fileId,
  existingTags,
  availableTags,
  onSave,
}: {
  fileId: number | null;
  existingTags: string[];
  availableTags: { id: number; name: string; color: string | null }[];
  onSave: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[]>(existingTags);
  const [newTag, setNewTag] = useState("");
  
  const addTag = () => {
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setNewTag("");
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Add a tag..."
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
        />
        <Button type="button" variant="outline" onClick={addTag}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <X
              className="h-3 w-3 cursor-pointer"
              onClick={() => setTags(tags.filter(t => t !== tag))}
            />
          </Badge>
        ))}
      </div>
      
      {availableTags.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Available tags:</p>
          <div className="flex flex-wrap gap-1">
            {availableTags.filter(t => !tags.includes(t.name)).map((tag) => (
              <Badge
                key={tag.id}
                variant="outline"
                className="cursor-pointer hover:bg-muted"
                onClick={() => setTags([...tags, tag.name])}
              >
                + {tag.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
      
      <DialogFooter>
        <Button onClick={() => onSave(tags)}>Save Tags</Button>
      </DialogFooter>
    </div>
  );
}

// Link Editor Component
function LinkEditor({
  fileId,
  jobs,
  devices,
  onSave,
}: {
  fileId: number | null;
  jobs: { id: number; title: string; jobNumber: string }[];
  devices: { id: number; deviceType: string; location: string | null }[];
  onSave: (links: { jobId?: number; deviceId?: number }) => void;
}) {
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Link to Job</Label>
        <Select value={selectedJob} onValueChange={setSelectedJob}>
          <SelectTrigger>
            <SelectValue placeholder="Select a job..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {jobs.map((job) => (
              <SelectItem key={job.id} value={job.id.toString()}>
                {job.jobNumber} - {job.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <Label>Link to Device</Label>
        <Select value={selectedDevice} onValueChange={setSelectedDevice}>
          <SelectTrigger>
            <SelectValue placeholder="Select a device..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {devices.map((device) => (
              <SelectItem key={device.id} value={device.id.toString()}>
                {device.deviceType} - {device.location || 'No location'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <DialogFooter>
        <Button
          onClick={() => onSave({
            jobId: selectedJob && selectedJob !== "none" ? parseInt(selectedJob) : undefined,
            deviceId: selectedDevice && selectedDevice !== "none" ? parseInt(selectedDevice) : undefined,
          })}
        >
          Save Links
        </Button>
      </DialogFooter>
    </div>
  );
}
