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
  BookmarkCheck,
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
  // undefined = Drive root
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Reset to root whenever the dialog opens
  useEffect(() => {
    if (open) {
      setCurrentFolderId(undefined);
      setBreadcrumbs([]);
      setDownloadingId(null);
    }
  }, [open]);

  // Look up the EWF Accounts shortcut (passive — just for the bookmark button)
  const ewfQuery = trpc.drive.findFolder.useQuery(
    { name: "EWF Accounts" },
    { enabled: open, retry: false, staleTime: Infinity }
  );

  // List the current folder (always enabled when open)
  const listQuery = trpc.drive.listFolder.useQuery(
    { folderId: currentFolderId },
    { enabled: open, retry: false }
  );

  const downloadMutation = trpc.drive.downloadFile.useMutation({
    onSuccess: (data) => {
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
    if (breadcrumbs.length === 0) return;
    const newCrumbs = breadcrumbs.slice(0, -1);
    setBreadcrumbs(newCrumbs);
    setCurrentFolderId(
      newCrumbs.length > 0 ? newCrumbs[newCrumbs.length - 1].id : undefined
    );
  };

  const handleBreadcrumbClick = (index: number) => {
    const newCrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newCrumbs);
    setCurrentFolderId(newCrumbs[newCrumbs.length - 1].id);
  };

  const handleGoToRoot = () => {
    setCurrentFolderId(undefined);
    setBreadcrumbs([]);
  };

  const handleGoToEwf = () => {
    const folder = ewfQuery.data?.folders[0];
    if (!folder) return;
    setCurrentFolderId(folder.id);
    setBreadcrumbs([{ id: folder.id, name: folder.name }]);
  };

  const handleSelectFile = (item: DriveItem) => {
    setDownloadingId(item.id);
    downloadMutation.mutate({ fileId: item.id, siteId, companyId });
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  const isLoading = listQuery.isLoading;
  const items = listQuery.data?.items ?? [];
  const folders = items.filter((i) => i.isFolder);
  const spreadsheets = items.filter((i) => isSpreadsheet(i));
  const otherFiles = items.filter((i) => !i.isFolder && !isSpreadsheet(i));
  const ewfFolder = ewfQuery.data?.folders[0];
  const atRoot = breadcrumbs.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Import from Google Drive
          </DialogTitle>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 flex-wrap mt-2 text-sm">
            <button
              className={`px-1 transition-colors ${atRoot ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={handleGoToRoot}
              disabled={atRoot}
            >
              Drive
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.id ?? i} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <button
                  className={`px-1 transition-colors ${i === breadcrumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => handleBreadcrumbClick(i)}
                  disabled={i === breadcrumbs.length - 1}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={atRoot || isLoading}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>

          {/* EWF Accounts shortcut */}
          {ewfFolder && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5 border-dashed"
              onClick={handleGoToEwf}
              disabled={currentFolderId === ewfFolder.id || isLoading}
            >
              <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
              {ewfFolder.name}
            </Button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
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

          {!isLoading && listQuery.isError && (
            <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">
                Could not connect to Google Drive. Please log out and log back in.
              </p>
            </div>
          )}

          {!isLoading && !listQuery.isError && items.length === 0 && (
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

          {/* Divider */}
          {spreadsheets.length > 0 && folders.length > 0 && (
            <div className="border-t my-2" />
          )}

          {/* Spreadsheets */}
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
                <span className="text-xs text-green-600 shrink-0">Downloading…</span>
              ) : (
                <span className="text-xs text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100">
                  Select
                </span>
              )}
            </button>
          ))}

          {/* Other non-spreadsheet files — greyed out */}
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
