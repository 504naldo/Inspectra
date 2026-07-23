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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Folder,
  File,
  FileText,
  FileSpreadsheet,
  ArrowLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  HardDrive,
  CheckCircle2,
  Users,
  FolderOpen,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface DriveItem {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  isSpreadsheet: boolean;
  modifiedTime: string | null;
  size?: string | null;
}

// Special virtual section IDs
const SHARED_WITH_ME_ID = "__shared_with_me__";

interface Breadcrumb {
  id: string | undefined;
  name: string;
  isVirtual?: boolean;
}

export interface DriveImportResult {
  siteId: number;
  siteName: string;
  customerOrgId: number;
  sheetNames: string[];
  /** True when the site was created via AI PDF extraction rather than spreadsheet parsing. */
  isPdfImport?: boolean;
  devicesCreated?: number;
}

interface DriveImportPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: number;
  onImportComplete: (result: DriveImportResult) => void;
  /** When set, the picker opens directly inside this Drive folder instead of
   *  showing the full Drive root (My Drive / Shared with me / Shared Drives). */
  initialFolderId?: string;
  /** Label shown in the breadcrumb for the initial folder. Defaults to "Customer Records". */
  initialFolderName?: string;
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
  initialFolderId,
  initialFolderName = "Customer Records",
}: DriveImportPickerProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(initialFolderId);
  const [isSharedWithMe, setIsSharedWithMe] = useState(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>(
    initialFolderId ? [{ id: initialFolderId, name: initialFolderName }] : []
  );
  const [selectedFile, setSelectedFile] = useState<DriveItem | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  // Type-ahead filter over the current folder's contents (client-side, name match).
  const [search, setSearch] = useState("");

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      if (initialFolderId) {
        setCurrentFolderId(initialFolderId);
        setIsSharedWithMe(false);
        setBreadcrumbs([{ id: initialFolderId, name: initialFolderName }]);
      } else {
        setCurrentFolderId(undefined);
        setIsSharedWithMe(false);
        setBreadcrumbs([]);
      }
      setSelectedFile(null);
      setIsImporting(false);
      setSearch("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear the filter whenever we move to a different folder so the box doesn't
  // silently hide items in the newly-opened location.
  useEffect(() => {
    setSearch("");
  }, [currentFolderId, isSharedWithMe]);

  // atRoot: true when we're at the full Drive root (no initialFolderId) or at the
  // initial folder boundary (initialFolderId set + only one breadcrumb remaining).
  const atRoot = initialFolderId
    ? breadcrumbs.length <= 1
    : breadcrumbs.length === 0;

  // List shared drives
  const sharedDrivesQuery = trpc.drive.listSharedDrives.useQuery(undefined, {
    enabled: open,
    retry: false,
    staleTime: Infinity,
  });

  // List current folder contents — enabled whenever we have a folder ID to browse.
  // allFiles: true so users can see every file in the folder, not just spreadsheets.
  const listQuery = trpc.drive.listFolder.useQuery(
    { folderId: currentFolderId, sharedWithMe: isSharedWithMe, allFiles: true },
    { enabled: open && (!!currentFolderId || isSharedWithMe), retry: false }
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
      const isDriveError = error.message?.toLowerCase().includes("drive") || error.message?.toLowerCase().includes("google");
      toast.error(isDriveError ? error.message : "Import failed — please try again or contact support");
    },
  });

  const importPdfMutation = trpc.drive.importPdfFromDrive.useMutation({
    onSuccess: (data) => {
      setIsImporting(false);
      const msg = data.devicesCreated
        ? `Site "${data.siteName}" created — ${data.devicesCreated} device(s) extracted`
        : `Site "${data.siteName}" created from PDF`;
      toast.success(msg);
      onImportComplete({
        siteId: data.siteId,
        siteName: data.siteName,
        customerOrgId: data.customerOrgId,
        sheetNames: [],
        isPdfImport: true,
        devicesCreated: data.devicesCreated,
      });
      onOpenChange(false);
    },
    onError: (error) => {
      setIsImporting(false);
      const isDriveError = error.message?.toLowerCase().includes("drive") || error.message?.toLowerCase().includes("google");
      toast.error(isDriveError ? error.message : "Import failed — please try again or contact support");
    },
  });

  const handleNavigateToFolder = (id: string, name: string) => {
    setCurrentFolderId(id);
    setIsSharedWithMe(false);
    setBreadcrumbs((prev) => [...prev, { id, name }]);
    setSelectedFile(null);
  };

  const handleNavigateToSharedWithMe = () => {
    setCurrentFolderId(undefined);
    setIsSharedWithMe(true);
    setBreadcrumbs([{ id: SHARED_WITH_ME_ID, name: "Shared with me", isVirtual: true }]);
    setSelectedFile(null);
  };

  const handleNavigateToMyDrive = () => {
    setCurrentFolderId(undefined);
    setIsSharedWithMe(false);
    setBreadcrumbs([{ id: undefined, name: "My Drive" }]);
    setSelectedFile(null);
  };

  const handleBack = () => {
    if (breadcrumbs.length === 0) return;
    const newCrumbs = breadcrumbs.slice(0, -1);
    setBreadcrumbs(newCrumbs);
    if (newCrumbs.length === 0) {
      setCurrentFolderId(undefined);
      setIsSharedWithMe(false);
    } else {
      const last = newCrumbs[newCrumbs.length - 1];
      if (last.id === SHARED_WITH_ME_ID) {
        setCurrentFolderId(undefined);
        setIsSharedWithMe(true);
      } else {
        setCurrentFolderId(last.id);
        setIsSharedWithMe(false);
      }
    }
    setSelectedFile(null);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === breadcrumbs.length - 1) return;
    const newCrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newCrumbs);
    const crumb = newCrumbs[newCrumbs.length - 1];
    if (crumb.id === SHARED_WITH_ME_ID) {
      setCurrentFolderId(undefined);
      setIsSharedWithMe(true);
    } else {
      setCurrentFolderId(crumb.id);
      setIsSharedWithMe(false);
    }
    setSelectedFile(null);
  };

  const handleConfirmImport = () => {
    if (!selectedFile) return;
    setIsImporting(true);
    if (selectedFile.mimeType === "application/pdf") {
      importPdfMutation.mutate({
        fileId: selectedFile.id,
        fileName: selectedFile.name,
        companyId,
      });
    } else {
      importMutation.mutate({
        fileId: selectedFile.id,
        fileName: selectedFile.name,
        mimeType: selectedFile.mimeType,
        companyId,
      });
    }
  };

  const isLoading = (!!currentFolderId || isSharedWithMe) && listQuery.isLoading;
  const allItems = listQuery.data?.items ?? [];
  const query = search.trim().toLowerCase();
  const items = query
    ? allItems.filter((i) => i.name.toLowerCase().includes(query))
    : allItems;
  const folders     = items.filter((i) => i.isFolder);
  const spreadsheets = items.filter((i) => !i.isFolder && i.isSpreadsheet);
  const pdfFiles    = items.filter((i) => !i.isFolder && !i.isSpreadsheet && i.mimeType === "application/pdf");
  // Other files (Word, images, etc.) are visible but not selectable
  const otherFiles  = items.filter((i) => !i.isFolder && !i.isSpreadsheet && i.mimeType !== "application/pdf");
  const sharedDrives = sharedDrivesQuery.data?.drives ?? [];
  // Search box is only meaningful once we're inside a folder listing.
  const showSearch = !!currentFolderId || isSharedWithMe;

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
                if (initialFolderId) {
                  // Go back to the initial folder, not the full Drive root
                  setCurrentFolderId(initialFolderId);
                  setBreadcrumbs([{ id: initialFolderId, name: initialFolderName }]);
                } else {
                  setCurrentFolderId(undefined);
                  setIsSharedWithMe(false);
                  setBreadcrumbs([]);
                }
                setSelectedFile(null);
              }}
              disabled={atRoot}
            >
              {initialFolderId ? initialFolderName : "Drive"}
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

          {showSearch && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search this folder…"
                disabled={isImporting}
                className="h-8 pl-8 pr-8 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {atRoot ? "Select a location" : (() => {
              const parts = [];
              if (spreadsheets.length) parts.push(`${spreadsheets.length} spreadsheet${spreadsheets.length !== 1 ? "s" : ""}`);
              if (pdfFiles.length) parts.push(`${pdfFiles.length} PDF${pdfFiles.length !== 1 ? "s" : ""}`);
              if (parts.length) return parts.join(", ") + " importable";
              if (query) return "No matches";
              return allItems.length > 0 ? "No importable files" : "Empty folder";
            })()}
          </span>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 min-h-0">
          {/* Root view — show My Drive, Shared Drives, Shared with me.
              Hidden when initialFolderId is set (picker always starts in a folder). */}
          {atRoot && !initialFolderId && (
            <div className="space-y-1">
              {/* My Drive */}
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-left transition-colors"
                onClick={handleNavigateToMyDrive}
                disabled={isImporting}
              >
                <HardDrive className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">My Drive</p>
                  <p className="text-xs text-muted-foreground">Your personal Drive files and folders</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>

              {/* Shared with me */}
              <button
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-left transition-colors"
                onClick={handleNavigateToSharedWithMe}
                disabled={isImporting}
              >
                <Users className="h-5 w-5 text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Shared with me</p>
                  <p className="text-xs text-muted-foreground">Files and folders others have shared with you</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>

              {/* Shared Drives */}
              {sharedDrives.length > 0 && (
                <>
                  <div className="border-t my-2" />
                  <p className="text-xs font-medium text-muted-foreground px-3 pb-1">Shared drives</p>
                  {sharedDrives.map((drive) => (
                    <button
                      key={drive.id}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-left transition-colors"
                      onClick={() => handleNavigateToFolder(drive.id, drive.name)}
                      disabled={isImporting}
                    >
                      <FolderOpen className="h-5 w-5 text-purple-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{drive.name}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          )}

          {/* Error */}
          {!isLoading && listQuery.isError && (() => {
            const isAuthError =
              (listQuery.error as any)?.data?.code === "PRECONDITION_FAILED";
            const errorMsg = (listQuery.error as any)?.message || "";
            return (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
                {isAuthError ? (
                  <>
                    <p className="font-medium text-sm">Google Drive not connected</p>
                    <Button
                      size="sm"
                      onClick={() => {
                        window.location.href = getLoginUrl(window.location.pathname);
                      }}
                    >
                      Reconnect Google Drive
                    </Button>
                    {errorMsg && (
                      <p className="text-xs text-muted-foreground max-w-sm font-mono bg-muted px-2 py-1 rounded">
                        {errorMsg}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Could not load Drive files. {errorMsg || "Please try again."}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Empty folder / no matches */}
          {(!!currentFolderId || isSharedWithMe) && !isLoading && !listQuery.isError && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Folder className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {query
                  ? `No files or folders match "${search.trim()}".`
                  : isSharedWithMe
                    ? "No files or folders shared with you."
                    : "This folder is empty."}
              </p>
              {query && (
                <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              )}
            </div>
          )}

          {/* Folders */}
          {(!!currentFolderId || isSharedWithMe) && folders.map((item) => (
            <button
              key={item.id}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-left transition-colors"
              onClick={() => handleNavigateToFolder(item.id, item.name)}
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
          {(!!currentFolderId || isSharedWithMe) && folders.length > 0 && spreadsheets.length > 0 && (
            <div className="border-t my-1" />
          )}

          {/* Spreadsheet files */}
          {(!!currentFolderId || isSharedWithMe) && spreadsheets.map((item) => {
            const isSelected = selectedFile?.id === item.id;
            return (
              <button
                key={item.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isSelected
                    ? "bg-primary/10 border border-primary/30 ring-1 ring-primary/20"
                    : "hover:bg-green-50 hover:dark:bg-green-900/20"
                }`}
                onClick={() => setSelectedFile(isSelected ? null : item)}
                disabled={isImporting}
              >
                <FileSpreadsheet
                  className={`h-5 w-5 shrink-0 ${isSelected ? "text-primary" : "text-green-600"}`}
                />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate text-sm ${isSelected ? "text-primary" : ""}`}>
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

          {/* PDF files — selectable, imported via AI extraction */}
          {(!!currentFolderId || isSharedWithMe) && pdfFiles.map((item) => {
            const isSelected = selectedFile?.id === item.id;
            return (
              <button
                key={item.id}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isSelected
                    ? "bg-orange-50 border border-orange-300 ring-1 ring-orange-200 dark:bg-orange-900/20"
                    : "hover:bg-orange-50 hover:dark:bg-orange-900/10"
                }`}
                onClick={() => setSelectedFile(isSelected ? null : item)}
                disabled={isImporting}
              >
                <FileText
                  className={`h-5 w-5 shrink-0 ${isSelected ? "text-orange-600" : "text-orange-500"}`}
                />
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate text-sm ${isSelected ? "text-orange-700" : ""}`}>
                    {item.name}
                  </p>
                  {item.modifiedTime && (
                    <p className="text-xs text-muted-foreground">{formatDate(item.modifiedTime)}</p>
                  )}
                </div>
                {isSelected && <CheckCircle2 className="h-4 w-4 text-orange-600 shrink-0" />}
              </button>
            );
          })}

          {/* Non-importable files — visible but not selectable */}
          {(!!currentFolderId || isSharedWithMe) && otherFiles.length > 0 && (
            <>
              {(folders.length > 0 || spreadsheets.length > 0 || pdfFiles.length > 0) && (
                <div className="border-t my-1" />
              )}
              {otherFiles.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg opacity-50 cursor-not-allowed"
                  title="This file type cannot be imported as a site. Use spreadsheet (.xlsx / Google Sheets) files."
                >
                  <File className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-muted-foreground">{item.name}</p>
                    {item.modifiedTime && (
                      <p className="text-xs text-muted-foreground">{formatDate(item.modifiedTime)}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap">
                    {item.mimeType === "application/pdf" ? "PDF — use Import from PDF" : "Not importable"}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Selected file confirmation + footer */}
        <div className="px-6 py-4 border-t bg-muted/20 shrink-0 space-y-3">
          {selectedFile && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <FileSpreadsheet className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedFile?.mimeType === "application/pdf"
                    ? "AI will extract site info and devices from this PDF report"
                    : "Inspectra will parse site info and create the site automatically"}
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {selectedFile?.mimeType === "application/pdf"
                ? "PDF import uses AI — may take 10–20 seconds"
                : "Google Sheets are exported as .xlsx before import"}
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
