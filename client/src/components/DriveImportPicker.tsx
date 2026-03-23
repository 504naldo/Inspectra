import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
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
  ArrowLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  HardDrive,
  CheckCircle2,
  BookmarkCheck,
} from "lucide-react";
import { toast } from "sonner";

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  isSpreadsheet: boolean;
  modifiedTime: string | null;
  size: string | null;
}

interface Breadcrumb {
  id: string | undefined;
  name: string;
}

export interface DriveImportResult {
  siteId: number;
  siteName: string;
  customerOrgId: number;
  sheetNames: string[];
}

interface DriveImportPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: number;
  onImportComplete: (result: DriveImportResult) => void;
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function DriveImportPicker({
  open,
  onOpenChange,
  companyId,
  onImportComplete,
}: DriveImportPickerProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(
    undefined
  );
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [selectedFile, setSelectedFile] = useState<DriveItem | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentFolderId(undefined);
      setBreadcrumbs([]);
      setSelectedFile(null);
      setIsImporting(false);
    }
  }, [open]);

  // Look up EWF Accounts passively for the shortcut button only
  const ewfQuery = trpc.drive.findFolder.useQuery(
    { name: "EWF Accounts" },
    { enabled: open, retry: false, staleTime: Infinity }
  );

  // List current folder (always enabled when open — starts at root)
  const listQuery = trpc.drive.listFolder.useQuery(
    { folderId: currentFolderId },
    { enabled: open, retry: false }
  );

  const importMutation = trpc.drive.importFromDrive.useMutation({
    onSuccess: (data) => {
      setIsImporting(false);
      toast.success(`Site "${data.siteName}" created from Drive`);
      onImportComplete({
        siteId: data.siteId,
        siteName: data.siteName,
        customerOrgId: data.customerOrgId,
        sheetNames: data.sheetNames,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      setIsImporting(false);
      toast.error(error.message || "Failed to import from Drive");
    },
  });

  const handleNavigate = (item: DriveItem) => {
    setCurrentFolderId(item.id);
    setBreadcrumbs((prev) => [...prev, { id: item.id, name: item.name }]);
    setSelectedFile(null);
  };

  const handleBack = () => {
    if (breadcrumbs.length === 0) return;
    const newCrumbs = breadcrumbs.slice(0, -1);
    setBreadcrumbs(newCrumbs);
    setCurrentFolderId(
      newCrumbs.length > 0 ? newCrumbs[newCrumbs.length - 1].id : undefined
    );
    setSelectedFile(null);
  };

  const handleGoToEwf = () => {
    const folder = ewfQuery.data?.folders[0];
    if (!folder) return;
    setCurrentFolderId(folder.id);
    setBreadcrumbs([{ id: folder.id, name: folder.name }]);
    setSelectedFile(null);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === breadcrumbs.length - 1) return;
    const newCrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newCrumbs);
    setCurrentFolderId(newCrumbs[newCrumbs.length - 1].id);
    setSelectedFile(null);
  };

  const handleConfirmImport = () => {
    if (!selectedFile) return;
    setIsImporting(true);
    importMutation.mutate({
      fileId: selectedFile.id,
      fileName: selectedFile.name,
      mimeType: selectedFile.mimeType,
      companyId,
    });
  };

  const isLoading = listQuery.isLoading;
  const ewfFolder = ewfQuery.data?.folders[0];
  const atRoot = breadcrumbs.length === 0;

  const items = listQuery.data?.items ?? [];
  const folders = items.filter((i) => i.isFolder);
  const spreadsheets = items.filter((i) => !i.isFolder && i.isSpreadsheet);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Import from Google Drive
          </DialogTitle>

          {/* Breadcrumb */}
          <nav className="flex items-center flex-wrap gap-1 mt-2 text-sm">
            <button
              className={`transition-colors ${atRoot ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => {
                setCurrentFolderId(undefined);
                setBreadcrumbs([]);
                setSelectedFile(null);
              }}
              disabled={atRoot}
            >
              Drive
            </button>
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.id ?? i} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <button
                  className={`transition-colors ${
                    i === breadcrumbs.length - 1
                      ? "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => handleBreadcrumbClick(i)}
                  disabled={i === breadcrumbs.length - 1}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </nav>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-6 py-2.5 border-b bg-muted/30 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            disabled={atRoot || isLoading || isImporting}
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
              disabled={currentFolderId === ewfFolder.id || isLoading || isImporting}
            >
              <BookmarkCheck className="h-3.5 w-3.5 text-primary" />
              {ewfFolder.name}
            </Button>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {spreadsheets.length > 0
              ? `${spreadsheets.length} spreadsheet${spreadsheets.length !== 1 ? "s" : ""} found`
              : "Select a spreadsheet to import"}
          </span>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 min-h-0">
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && listQuery.isError && (() => {
            const isAuthError =
              (listQuery.error as any)?.data?.code === "PRECONDITION_FAILED";
            return (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                {isAuthError ? (
                  <>
                    <p className="font-medium text-sm">
                      Google Drive not connected
                    </p>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Your account needs to be reconnected to Google Drive.
                      Click below to sign in again — you'll be brought right
                      back.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        window.location.href = getLoginUrl(
                          window.location.pathname
                        );
                      }}
                    >
                      Reconnect Google Drive
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Could not load Drive files.{" "}
                    {(listQuery.error as any)?.message || "Please try again."}
                  </p>
                )}
              </div>
            );
          })()}

          {!isLoading && !listQuery.isError && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
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
              disabled={isImporting}
            >
              <Folder className="h-5 w-5 text-yellow-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-sm">{item.name}</p>
                {item.modifiedTime && (
                  <p className="text-xs text-muted-foreground">
                    {formatDate(item.modifiedTime)}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}

          {/* Divider between folders and files */}
          {folders.length > 0 && spreadsheets.length > 0 && (
            <div className="border-t my-1" />
          )}

          {/* Spreadsheet files */}
          {spreadsheets.map((item) => {
            const isSelected = selectedFile?.id === item.id;
            return (
              <button
                key={item.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isSelected
                    ? "bg-primary/10 border border-primary/30 ring-1 ring-primary/20"
                    : "hover:bg-green-50 hover:dark:bg-green-900/20"
                }`}
                onClick={() =>
                  setSelectedFile(isSelected ? null : item)
                }
                disabled={isImporting}
              >
                <FileSpreadsheet
                  className={`h-5 w-5 shrink-0 ${isSelected ? "text-primary" : "text-green-600"}`}
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium truncate text-sm ${isSelected ? "text-primary" : ""}`}
                  >
                    {item.name}
                  </p>
                  {item.modifiedTime && (
                    <p className="text-xs text-muted-foreground">
                      {formatDate(item.modifiedTime)}
                    </p>
                  )}
                </div>
                {isSelected && (
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected file confirmation + footer */}
        <div className="px-6 py-4 border-t bg-muted/20 shrink-0 space-y-3">
          {selectedFile && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Inspectra will parse site info and create the site
                  automatically
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Google Sheets are exported as .xlsx before import
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={isImporting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!selectedFile || isImporting}
                onClick={handleConfirmImport}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <HardDrive className="h-4 w-4 mr-2" />
                    Import Site
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
