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
import { Badge } from "@/components/ui/badge";
import {
  Folder,
  FileSpreadsheet,
  FileText,
  ArrowLeft,
  Loader2,
  ChevronRight,
  AlertCircle,
  HardDrive,
  BookmarkCheck,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Cpu,
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

export interface PdfImportResult {
  siteId: number;
  siteName: string;
  customerOrgId: number;
  devicesCreated: number;
  summary: {
    totalDevices: number;
    categories: Record<string, number>;
    confidence: "high" | "medium" | "low";
    warnings: string[];
  };
  siteInfo: {
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    customerOrgName: string | null;
  };
}

interface DriveFilePickerProps {
  open: boolean;
  onClose: () => void;
  siteId?: number;
  companyId?: number;
  onFileSelected: (result: DriveFileResult) => void;
  /** If provided, PDF files become importable (AI extraction flow) */
  onPdfImportComplete?: (result: PdfImportResult) => void;
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
      item.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      item.mimeType === "application/vnd.ms-excel" ||
      item.name.endsWith(".xlsm") ||
      item.name.endsWith(".csv"))
  );
}

function isPdf(item: DriveItem) {
  return !item.isFolder && item.mimeType === "application/pdf";
}

const CONFIDENCE_COLORS = {
  high: "text-green-600 bg-green-50 border-green-200",
  medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
  low: "text-red-600 bg-red-50 border-red-200",
} as const;

const CATEGORY_LABELS: Record<string, string> = {
  FIRE_ALARM_DEVICE: "Fire Alarm",
  SMOKE_ALARM: "Smoke Alarm",
  FIRE_EXTINGUISHER: "Extinguisher",
  EMERGENCY_LIGHT: "Emergency Light",
  SPRINKLER: "Sprinkler",
};

export function DriveFilePicker({
  open,
  onClose,
  siteId,
  companyId,
  onFileSelected,
  onPdfImportComplete,
}: DriveFilePickerProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbEntry[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<PdfImportResult | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCurrentFolderId(undefined);
      setBreadcrumbs([]);
      setDownloadingId(null);
      setPdfPreview(null);
      setExtractingId(null);
    }
  }, [open]);

  const ewfQuery = trpc.drive.findFolder.useQuery(
    { name: "EWF Accounts" },
    { enabled: open, retry: false, staleTime: Infinity }
  );

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

  const pdfImportMutation = trpc.drive.importPdfFromDrive.useMutation({
    onSuccess: (data) => {
      setExtractingId(null);
      setPdfPreview(data as PdfImportResult);
    },
    onError: (error) => {
      setExtractingId(null);
      toast.error(error.message || "Failed to extract data from PDF");
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
    setCurrentFolderId(newCrumbs.length > 0 ? newCrumbs[newCrumbs.length - 1].id : undefined);
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

  const handleSelectPdf = (item: DriveItem) => {
    if (!companyId || !onPdfImportComplete) {
      // Fallback: download as raw file
      handleSelectFile(item);
      return;
    }
    setExtractingId(item.id);
    pdfImportMutation.mutate({ fileId: item.id, fileName: item.name, companyId });
  };

  const handleConfirmPdfImport = () => {
    if (!pdfPreview || !onPdfImportComplete) return;
    onPdfImportComplete(pdfPreview);
    onClose();
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) onClose();
  };

  const isLoading = listQuery.isLoading;
  const items = listQuery.data?.items ?? [];
  const folders = items.filter((i) => i.isFolder);
  const spreadsheets = items.filter((i) => isSpreadsheet(i));
  const pdfs = items.filter((i) => isPdf(i));
  const otherFiles = items.filter((i) => !i.isFolder && !isSpreadsheet(i) && !isPdf(i));
  const ewfFolder = ewfQuery.data?.folders[0];
  const atRoot = breadcrumbs.length === 0;
  const isBusy = downloadingId !== null || extractingId !== null;

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
            {onPdfImportComplete
              ? "Select a spreadsheet or PDF inspection report"
              : "Select a file to import"}
          </span>
        </div>

        {/* PDF extraction preview */}
        {pdfPreview && (
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Extraction complete
              </p>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded border ${CONFIDENCE_COLORS[pdfPreview.summary.confidence]}`}
              >
                {pdfPreview.summary.confidence} confidence
              </span>
            </div>

            {/* Site info */}
            <div className="rounded-lg border p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Site
              </p>
              <p className="font-semibold">{pdfPreview.siteInfo.name || pdfPreview.siteName}</p>
              {(pdfPreview.siteInfo.address || pdfPreview.siteInfo.city) && (
                <p className="text-sm text-muted-foreground">
                  {[pdfPreview.siteInfo.address, pdfPreview.siteInfo.city, pdfPreview.siteInfo.state]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {pdfPreview.siteInfo.contactName && (
                <p className="text-sm text-muted-foreground">
                  Contact: {pdfPreview.siteInfo.contactName}
                  {pdfPreview.siteInfo.contactPhone && ` · ${pdfPreview.siteInfo.contactPhone}`}
                </p>
              )}
              {pdfPreview.siteInfo.customerOrgName && (
                <p className="text-sm text-muted-foreground">
                  Customer: {pdfPreview.siteInfo.customerOrgName}
                </p>
              )}
            </div>

            {/* Device summary */}
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Cpu className="h-3 w-3" /> Devices found: {pdfPreview.summary.totalDevices}
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(pdfPreview.summary.categories)
                  .filter(([, count]) => count > 0)
                  .map(([cat, count]) => (
                    <Badge key={cat} variant="secondary" className="text-xs">
                      {CATEGORY_LABELS[cat] ?? cat}: {count}
                    </Badge>
                  ))}
              </div>
            </div>

            {/* Warnings */}
            {pdfPreview.summary.warnings.length > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 space-y-1">
                <p className="text-xs font-medium text-yellow-700 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Warnings
                </p>
                {pdfPreview.summary.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-yellow-600">{w}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Extracting loading state */}
        {extractingId && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 gap-3 text-center px-6 min-h-0">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-medium text-sm">AI is extracting site data from this report…</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              This typically takes 5–15 seconds. We're identifying site info, devices, and locations.
            </p>
          </div>
        )}

        {/* File list */}
        {!pdfPreview && !extractingId && (
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
                  This folder is empty or contains no supported files.
                </p>
              </div>
            )}

            {/* Folders */}
            {folders.map((item) => (
              <button
                key={item.id}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-left transition-colors"
                onClick={() => handleNavigate(item)}
                disabled={isBusy}
              >
                <Folder className="h-5 w-5 text-yellow-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.name}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}

            {/* Spreadsheets */}
            {spreadsheets.length > 0 && folders.length > 0 && <div className="border-t my-2" />}
            {spreadsheets.map((item) => (
              <button
                key={item.id}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-green-50 hover:dark:bg-green-900/20 text-left transition-colors group"
                onClick={() => handleSelectFile(item)}
                disabled={isBusy}
              >
                {downloadingId === item.id ? (
                  <Loader2 className="h-5 w-5 animate-spin text-green-600 shrink-0" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate group-hover:text-green-700">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(item.modifiedTime)}</p>
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

            {/* PDFs */}
            {pdfs.length > 0 && (spreadsheets.length > 0 || folders.length > 0) && (
              <div className="border-t my-2" />
            )}
            {pdfs.length > 0 && onPdfImportComplete && (
              <p className="text-xs font-medium text-muted-foreground px-3 pb-1">
                Inspection reports (PDF)
              </p>
            )}
            {pdfs.map((item) => {
              const canImport = !!onPdfImportComplete && !!companyId;
              return (
                <button
                  key={item.id}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group ${
                    canImport
                      ? "hover:bg-blue-50 hover:dark:bg-blue-900/20"
                      : "hover:bg-muted/60"
                  }`}
                  onClick={() => (canImport ? handleSelectPdf(item) : handleSelectFile(item))}
                  disabled={isBusy}
                >
                  {extractingId === item.id ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600 shrink-0" />
                  ) : (
                    <FileText className={`h-5 w-5 shrink-0 ${canImport ? "text-blue-600" : "text-muted-foreground"}`} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${canImport ? "group-hover:text-blue-700" : ""}`}>
                      {item.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(item.modifiedTime)}
                      {canImport ? " · PDF report" : ""}
                    </p>
                  </div>
                  {extractingId === item.id ? (
                    <span className="text-xs text-blue-600 shrink-0">Extracting…</span>
                  ) : canImport ? (
                    <span className="text-xs text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100">
                      Import
                    </span>
                  ) : null}
                </button>
              );
            })}

            {/* Other non-importable files — greyed out */}
            {otherFiles.length > 0 && (
              <>
                {(folders.length > 0 || spreadsheets.length > 0 || pdfs.length > 0) && (
                  <div className="border-t my-2" />
                )}
                {otherFiles.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg opacity-40 cursor-not-allowed"
                  >
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.modifiedTime)} — unsupported
                      </p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {onPdfImportComplete
              ? "Spreadsheets and PDF inspection reports supported"
              : "Google Sheets and Excel files supported"}
          </p>
          <div className="flex items-center gap-2">
            {pdfPreview && (
              <Button size="sm" onClick={handleConfirmPdfImport}>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Confirm Import
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={pdfPreview ? () => setPdfPreview(null) : onClose}>
              {pdfPreview ? "Back" : "Cancel"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
