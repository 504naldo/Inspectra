import { useRef, useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Upload, Package, CheckCircle2, AlertTriangle, RefreshCw, ChevronDown, ChevronRight,
  FileSpreadsheet, Calendar, Info,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportStep = "idle" | "parsing" | "preview" | "confirming" | "done" | "error";

interface PartRow {
  category: string;
  productName: string;
  unitPrice: number;
  defaultLabourHours: number;
  description: string | null;
  taxableGst: boolean;
  taxablePst: boolean;
  _rowIndex: number;
  _dupWithin: boolean;
}

interface ParseResult {
  sheetUsed: string;
  totalScanned: number;
  parsed: PartRow[];
  dupWithinCount: number;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip data URL prefix
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-green-50 text-green-700 border-green-200",
    failed:    "bg-red-50 text-red-700 border-red-200",
    partial:   "bg-amber-50 text-amber-700 border-amber-200",
    pending:   "bg-blue-50 text-blue-700 border-blue-200",
    importing: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ── Import type card (non-wired types) ────────────────────────────────────────

function ScriptBackedCard({
  title, icon: Icon, description, scriptNote,
}: {
  title: string;
  icon: React.ElementType;
  description: string;
  scriptNote: string;
}) {
  return (
    <Card className="opacity-80">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>{description}</p>
        <div className="rounded bg-muted p-2 text-xs font-mono">{scriptNote}</div>
        <p className="text-xs italic">Run the script above on the server, then refresh Data Quality to verify.</p>
      </CardContent>
    </Card>
  );
}

// ── Parts Catalog import ──────────────────────────────────────────────────────

function PartsCatalogImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<ImportStep>("idle");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [previewData, setPreviewData] = useState<{ toCreate: number; toUpdate: number; skipped: number } | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [pendingRows, setPendingRows] = useState<PartRow[]>([]);
  const [showPreviewRows, setShowPreviewRows] = useState(false);

  const parseMutation     = trpc.importCenter.parsePartsCatalogFile.useMutation();
  const previewMutation   = trpc.partsCatalog.importPreview.useMutation();
  const executeMutation   = trpc.partsCatalog.importExecute.useMutation();

  async function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Please select an .xlsx or .xls file.");
      return;
    }
    setStep("parsing");
    setParseResult(null);
    setPreviewData(null);
    setImportResult(null);
    try {
      const fileData = await toBase64(file);
      const result = await parseMutation.mutateAsync({ fileData, fileName: file.name });
      setParseResult(result as ParseResult);

      // Immediately run preview with the parsed rows
      const validRows = (result as ParseResult).parsed.filter((r) => !r._dupWithin);
      setPendingRows(validRows);
      const prev = await previewMutation.mutateAsync({ rows: validRows, updateExisting });
      setPreviewData(prev);
      setStep("preview");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to parse file.");
      setStep("error");
    }
  }

  async function handleExecute() {
    setStep("confirming");
    try {
      const result = await executeMutation.mutateAsync({ rows: pendingRows, updateExisting });
      setImportResult(result);
      setStep("done");
    } catch (err: any) {
      toast.error(err.message ?? "Import failed.");
      setStep("error");
    }
  }

  function handleReset() {
    setStep("idle");
    setParseResult(null);
    setPreviewData(null);
    setImportResult(null);
    setPendingRows([]);
    setShowPreviewRows(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const isBusy = step === "parsing" || step === "confirming";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-primary" />
          Parts Catalog
          {step === "done" && <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "idle" && (
          <>
            <p className="text-sm text-muted-foreground">
              Upload a Parts List workbook (.xlsx). Expected sheet: <span className="font-mono text-xs bg-muted px-1 rounded">Parts List</span>, data starts at row 5.
            </p>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                <Button asChild variant="outline" size="sm" disabled={isBusy}>
                  <span><Upload className="h-3.5 w-3.5 mr-1.5" /> Choose File</span>
                </Button>
              </label>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(e) => setUpdateExisting(e.target.checked)}
                  className="rounded"
                />
                Update existing items
              </label>
            </div>
          </>
        )}

        {step === "parsing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Parsing file…
          </div>
        )}

        {(step === "preview" || step === "confirming") && parseResult && previewData && (
          <div className="space-y-3">
            <div className="rounded border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex gap-4 flex-wrap">
                <span className="text-muted-foreground">Sheet: <span className="text-foreground font-mono text-xs">{parseResult.sheetUsed}</span></span>
                <span className="text-muted-foreground">Scanned: <span className="text-foreground font-semibold">{parseResult.totalScanned}</span> rows</span>
                <span className="text-muted-foreground">Valid parts: <span className="text-foreground font-semibold">{parseResult.parsed.length}</span></span>
                {parseResult.dupWithinCount > 0 && (
                  <span className="text-amber-600">Intra-file dupes skipped: {parseResult.dupWithinCount}</span>
                )}
              </div>
              <div className="flex gap-4 flex-wrap pt-1 border-t mt-1">
                <span className="text-green-700 font-medium">To create: {previewData.toCreate}</span>
                <span className="text-blue-700 font-medium">To update: {previewData.toUpdate}</span>
                <span className="text-muted-foreground">Skipped (dupes): {previewData.skipped}</span>
              </div>
            </div>

            {parseResult.parsed.length > 0 && (
              <button
                className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground"
                onClick={() => setShowPreviewRows((v) => !v)}
              >
                {showPreviewRows ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {showPreviewRows ? "Hide" : "Show"} parsed rows ({parseResult.parsed.length})
              </button>
            )}
            {showPreviewRows && (
              <div className="max-h-56 overflow-y-auto rounded border text-xs">
                <table className="w-full">
                  <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Row</th>
                      <th className="px-2 py-1 text-left font-medium">Category</th>
                      <th className="px-2 py-1 text-left font-medium">Product Name</th>
                      <th className="px-2 py-1 text-right font-medium">Price</th>
                      <th className="px-2 py-1 text-left font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.parsed.map((r) => (
                      <tr key={r._rowIndex} className={`border-t ${r._dupWithin ? "opacity-40" : ""}`}>
                        <td className="px-2 py-0.5 text-muted-foreground">{r._rowIndex}</td>
                        <td className="px-2 py-0.5">{r.category}</td>
                        <td className="px-2 py-0.5">{r.productName}</td>
                        <td className="px-2 py-0.5 text-right">${r.unitPrice.toFixed(2)}</td>
                        <td className="px-2 py-0.5 text-amber-600">{r._dupWithin ? "dup" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {previewData.toCreate === 0 && previewData.toUpdate === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                Nothing to import — all rows already exist in the catalog.
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleExecute}
                  disabled={step === "confirming"}
                >
                  {step === "confirming" ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Importing…</>
                  ) : (
                    <>Confirm Import ({previewData.toCreate + previewData.toUpdate} items)</>
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleReset} disabled={step === "confirming"}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "done" && importResult && (
          <div className="space-y-3">
            <div className="rounded border bg-green-50 p-3 text-sm space-y-1">
              <p className="font-medium text-green-700">Import complete</p>
              <div className="flex gap-4">
                <span className="text-green-700">Created: {importResult.created}</span>
                <span className="text-blue-700">Updated: {importResult.updated}</span>
                <span className="text-muted-foreground">Skipped: {importResult.skipped}</span>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleReset}>Import another file</Button>
          </div>
        )}

        {step === "error" && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleReset}>Try again</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Monthly Tracking import ───────────────────────────────────────────────────

type TrackingStep = "idle" | "parsing" | "preview" | "confirming" | "done" | "error";

function MonthlyTrackingImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<TrackingStep>("idle");
  const [trackingMonth, setTrackingMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [skipUnmatched, setSkipUnmatched] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ name: string; data: string } | null>(null);
  const [previewData, setPreviewData] = useState<{
    previewRows: any[];
    matched: number;
    unmatched: number;
    totalRows: number;
    trackingMonth: string;
  } | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number; errors: number } | null>(null);

  const utils = trpc.useUtils();
  const previewMutation = trpc.serviceSchedule.importPreview.useMutation();
  const executeMutation = trpc.serviceSchedule.importExecute.useMutation();
  const { data: me } = trpc.auth.me.useQuery();

  async function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("Please select an .xlsx or .xls file.");
      return;
    }
    setStep("parsing");
    setPreviewData(null);
    setImportResult(null);
    try {
      const fileData = await toBase64(file);
      setPendingFile({ name: file.name, data: fileData });
      const result = await previewMutation.mutateAsync({
        companyId: me!.companyId!,
        trackingMonth,
        fileName: file.name,
        fileData,
      });
      setPreviewData(result as any);
      setStep("preview");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to parse file.");
      setStep("error");
    }
  }

  async function handleExecute() {
    if (!pendingFile || !me) return;
    setStep("confirming");
    try {
      const result = await executeMutation.mutateAsync({
        companyId: me.companyId!,
        trackingMonth,
        fileName: pendingFile.name,
        fileData: pendingFile.data,
        skipUnmatched,
        updateExisting,
        manualMappings: [],
      });
      setImportResult(result as any);
      setStep("done");
    } catch (err: any) {
      toast.error(err.message ?? "Import failed.");
      setStep("error");
    }
  }

  function handleReset() {
    setStep("idle");
    setPreviewData(null);
    setImportResult(null);
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const isBusy = step === "parsing" || step === "confirming";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4 text-primary" />
          Monthly Service Tracking
          {step === "done" && <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === "idle" && (
          <>
            <p className="text-sm text-muted-foreground">
              Upload a monthly service schedule spreadsheet. Rows are matched to sites by Building ID or site name.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">Month:</label>
                <input
                  type="month"
                  value={trackingMonth}
                  onChange={(e) => setTrackingMonth(e.target.value)}
                  className="rounded border px-2 py-1 text-sm bg-background"
                />
              </div>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={skipUnmatched} onChange={(e) => setSkipUnmatched(e.target.checked)} className="rounded" />
                Skip unmatched rows
              </label>
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="rounded" />
                Update existing
              </label>
            </div>
            <label className="cursor-pointer inline-block">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              <Button asChild variant="outline" size="sm" disabled={isBusy}>
                <span><Upload className="h-3.5 w-3.5 mr-1.5" /> Choose File</span>
              </Button>
            </label>
          </>
        )}

        {step === "parsing" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Parsing file…
          </div>
        )}

        {(step === "preview" || step === "confirming") && previewData && (
          <div className="space-y-3">
            <div className="rounded border bg-muted/30 p-3 text-sm space-y-1">
              <div className="flex gap-4 flex-wrap">
                <span className="text-muted-foreground">Month: <span className="text-foreground font-semibold">{previewData.trackingMonth}</span></span>
                <span className="text-muted-foreground">Rows: <span className="text-foreground font-semibold">{previewData.totalRows}</span></span>
                <span className="text-green-700 font-medium">Matched: {previewData.matched}</span>
                {previewData.unmatched > 0 && (
                  <span className="text-amber-600 font-medium">Unmatched: {previewData.unmatched}</span>
                )}
              </div>
            </div>
            {previewData.totalRows === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                No data rows found in file.
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleExecute} disabled={step === "confirming"}>
                  {step === "confirming" ? (
                    <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Importing…</>
                  ) : (
                    <>Confirm Import ({previewData.matched} sites)</>
                  )}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleReset} disabled={step === "confirming"}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "done" && importResult && (
          <div className="space-y-3">
            <div className="rounded border bg-green-50 p-3 text-sm space-y-1">
              <p className="font-medium text-green-700">Import complete</p>
              <div className="flex gap-4 flex-wrap">
                <span className="text-green-700">Created: {importResult.created}</span>
                <span className="text-blue-700">Updated: {importResult.updated}</span>
                <span className="text-muted-foreground">Skipped: {importResult.skipped}</span>
                {importResult.errors > 0 && <span className="text-red-600">Errors: {importResult.errors}</span>}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleReset}>Import another file</Button>
          </div>
        )}

        {step === "error" && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleReset}>Try again</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Recent import logs ─────────────────────────────────────────────────────────

function RecentLogs() {
  const [open, setOpen] = useState(false);
  const { data: logs, isLoading } = trpc.importCenter.getRecentLogs.useQuery({ limit: 20 });

  if (!open) {
    return (
      <button
        className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
        View recent import history
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <button
        className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground"
        onClick={() => setOpen(false)}
      >
        <ChevronDown className="h-3.5 w-3.5" />
        Hide import history
      </button>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : !logs || logs.length === 0 ? (
        <div className="text-sm text-muted-foreground">No import logs yet.</div>
      ) : (
        <div className="rounded border text-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Type</th>
                <th className="px-3 py-1.5 text-left font-medium">File</th>
                <th className="px-3 py-1.5 text-left font-medium">Status</th>
                <th className="px-3 py-1.5 text-right font-medium">Rows</th>
                <th className="px-3 py-1.5 text-right font-medium">OK</th>
                <th className="px-3 py-1.5 text-right font-medium">Errs</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => (
                <tr key={log.id} className="border-t">
                  <td className="px-3 py-1.5 font-medium">{log.importType}</td>
                  <td className="px-3 py-1.5 text-muted-foreground truncate max-w-[160px]">{log.fileName ?? "—"}</td>
                  <td className="px-3 py-1.5"><StatusBadge status={log.status} /></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{log.totalRows ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-green-700">{log.successCount ?? "—"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-red-600">{log.errorCount || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ImportCenter() {
  const { data: overview } = trpc.importCenter.getOverview.useQuery(undefined, {
    staleTime: 30_000,
  });

  return (
    <AdminLayout title="Import Center">
      <div className="space-y-6">
        {/* Intro */}
        <div className="text-sm text-muted-foreground max-w-prose">
          Import data into Inspectra from external spreadsheets. Always review the preview before confirming.
          Imports never delete existing records.
        </div>

        {/* Overview chips */}
        {overview && (
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5 rounded border bg-card px-3 py-1.5 text-sm">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Parts catalog:</span>
              <span className="font-semibold">{overview.partsCatalog.count} items</span>
            </div>
          </div>
        )}

        {/* Fully wired imports */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            File-based Imports
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <PartsCatalogImport />
            <MonthlyTrackingImport />
          </div>
        </div>

        {/* Script-backed imports */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Script-backed Imports
            <Badge variant="outline" className="text-xs ml-1">Run on server</Badge>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ScriptBackedCard
              title="Devices"
              icon={Package}
              description="Import fire alarm devices, smoke alarms, or sprinkler components from a site asset spreadsheet."
              scriptNote="Use Asset Import: /admin/sites/:id/import"
            />
            <ScriptBackedCard
              title="Sites"
              icon={Package}
              description="Bulk-create sites from a customer building list spreadsheet."
              scriptNote="pnpm tsx scripts/seedSites.ts <file>"
            />
            <ScriptBackedCard
              title="Customers"
              icon={Package}
              description="Import customer organisations from an external CRM export."
              scriptNote="pnpm tsx scripts/seedCustomers.ts <file>"
            />
          </div>
        </div>

        {/* Recent logs */}
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Import History</h2>
          <RecentLogs />
        </div>
      </div>
    </AdminLayout>
  );
}
