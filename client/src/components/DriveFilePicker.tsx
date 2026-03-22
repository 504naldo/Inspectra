import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Folder,
  FileSpreadsheet,
  File,
  ArrowLeft,
  Loader2,
  ChevronRight,
  AlertCircle,
  HardDrive,
} from "lucide-react";
import { toast } from "sonner";

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  modifiedTime: string;
  size?: string;
}

interface BreadcrumbEntry {
  id: string | undefined;
  name: string;
}

export interface DriveFileResult {
  fileName: string;
  fileData: string; // base64
  fileUrl: string;
  fileKey: string;
  attachmentId: number | null;
  mimeType: string;
}

interface DriveFilePickerProps {
  open: boolean;
  onClose: () => void;
  siteId?: number;
  companyId?: number;
  onFileSelected: (result: DriveFileResult) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function isSpreadsheet(item: DriveItem) {
  return (
    !item.isFolder &&
    (item.mimeType === "application/vnd.google-apps.spreadsheet" ||
      item.mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      item.mimeType === "application/vnd.ms-excel" ||
      item.name.endsWith(".xlsm") ||
      item.name.endsWith(".csv"))
  );
}

export function DriveFilePicker({
  open,
  onClose,
  siteId,
  companyId,
  onFileSelected,
}: DriveFilePickerProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(
    undefined
  );
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Find "EWF Accounts" folder on open
  const findFolderQuery = trpc.drive.findFolder.useQuery(
    { name: "EWF Accounts" },
    {
      enabled: open && currentFolderId === undefined,
      retry: false,
    }
  );

  // Auto-navigate into EWF Accounts when found
  useEffect(() => {
    if (
      findFolderQuery.data?.folders.length &&
      currentFolderId === undefined
    ) {
      const folder = findFolderQuery.data.folders[0];
      setCurrentFolderId(folder.id);
      setBreadcrumbs([{ id: folder.id, name: folder.name }]);
    }
  }, [findFolderQuery.data, currentFolderId]);

  // List the current folder
  const listQuery = trpc.drive.listFolder.useQuery(
    { folderId: currentFolderId },
    {
      enabled: open && currentFolderId !== undefined,
      retry: false,
    }
  );

  const downloadMutation = trpc.drive.downloadFile.useMutation({
    onSuccess: (data, variables) => {
      setDownloadingId(null);
      onFileSelected({
        fileName: data.fileName,
        fileData: data.fileData,
        fileUrl: data.fileUrl,
        fileKey: data.fileKey,
        attachmentId: data.attachmentId,
        mimeType: data.mimeType,
      });
      onClose();
    },
    onError: (error) => {
      setDownloadingId(null);
      toast.error(error.message || "Failed to download file from Drive");
    },
  });

  const handleNavigate = (item: DriveItem) => {
    setCurrentFolderId(item.id);
    setBreadcrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
  };

  const handleBack = () => {
    if (breadcrumbs.length <= 1) return;
    const newCrumbs = breadcrumbs.slice(0, -1);
    setBreadcrumbs(newCrumbs);
    setCurrentFolderId(newCrumbs[newCrumbs.length - 1].id);
  };

  const handleBreadcrumbClick = (index: number) => {
    const newCrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newCrumbs);
    setCurrentFolderId(newCrumbs[newCrumbs.length - 1].id);
  };

  const handleSelectFile = (item: DriveItem) => {
    setDownloadingId(item.id);
    downloadMutation.mutate({
      fileId: item.id,
      siteId,
      companyId,
    });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
    }
  };

  const isLoading =
    (findFolderQuery.isLoading && currentFolderId === undefined) ||
    listQuery.isLoading;

  const items = listQuery.data?.items ?? [];
  const folders = items.filter((i) => i.isFolder);
  const spreadsheets = items.filter((i) => isSpreadsheet(i));
  const otherFiles = items.filter((i) => !i.isFolder && !isSpreadsheet(i));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Import from Google Drive
          </DialogTitle>

          {/* Breadcrumb */}
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-1 text-muted-foreground"
                onClick={() => {
                  setCurrentFolderId(undefined);
                  setBreadcrumbs([]);
                }}
              >
                Drive
              </Button>
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.id ?? i} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 px-1 ${i === breadcrumbs.length - 1 ? "font-medium" : "text-muted-foreground"}`}
                    onClick={() => handleBreadcrumbClick(i)}
                    disabled={i === breadcrumbs.length - 1}
                  >
                    {crumb.name}
                  </Button>
                </span>
              ))}
            </div>
          )}
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 py-3 border-b bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={breadcrumbs.length <= 1 || isLoading}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            Select a spreadsheet to import
          </span>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 min-h-0">
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          )}

          {!isLoading && findFolderQuery.isError && (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">
                Could not connect to Google Drive. Please log out and log back
                in.
              </p>
            </div>
          )}

          {!isLoading &&
            !findFolderQuery.isError &&
            currentFolderId === undefined &&
            (findFolderQuery.data?.folders.length ?? 0) === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <Folder className="h-8 w-8 text-muted-foreground" />
                <p className="font-medium">
                  &quot;EWF Accounts&quot; folder not found
                </p>
                <p className="text-sm text-muted-foreground">
                  Make sure the folder exists in your Google Drive and you have
                  access.
                </p>
              </div>
            )}

          {!isLoading && items.length === 0 && currentFolderId !== undefined && (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <Folder className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                This folder is empty or contains no spreadsheet files.
              </p>
            </div>
          )}

          {/* Folders */}
          {folders.map((item) => (
            <button
              key={item.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-left transition-colors"
              onClick={() => handleNavigate(item)}
            >
              <Folder className="h-5 w-5 text-yellow-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.name}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}

          {/* Spreadsheets */}
          {spreadsheets.length > 0 && folders.length > 0 && (
            <div className="border-t my-2" />
          )}
          {spreadsheets.map((item) => (
            <button
              key={item.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-green-50 hover:dark:bg-green-900/20 text-left transition-colors group"
              onClick={() => handleSelectFile(item)}
              disabled={downloadingId !== null}
            >
              {downloadingId === item.id ? (
                <Loader2 className="h-5 w-5 animate-spin text-green-600 shrink-0" />
              ) : (
                <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate group-hover:text-green-700">
                  {item.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(item.modifiedTime)}
                </p>
              </div>
              {downloadingId === item.id ? (
                <span className="text-xs text-green-600 shrink-0">
                  Downloading…
                </span>
              ) : (
                <span className="text-xs text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100">
                  Select
                </span>
              )}
            </button>
          ))}

          {/* Other non-spreadsheet files — shown greyed out */}
          {otherFiles.length > 0 && (
            <>
              {(folders.length > 0 || spreadsheets.length > 0) && (
                <div className="border-t my-2" />
              )}
              {otherFiles.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-40 cursor-not-allowed"
                >
                  <File className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(item.modifiedTime)} — not a spreadsheet
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between bg-muted/20">
          <p className="text-xs text-muted-foreground">
            Only Google Sheets and Excel files can be selected
          </p>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
