import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { LEGACY_OFFLINE_KEYS } from "@/lib/scopedOfflineQueue";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useOfflineRecovery } from "@/hooks/useOfflineRecovery";
import { offlineStorage } from "@/lib/offlineStorage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, AlertTriangle } from "lucide-react";

export function OfflineRecoveryCard() {
  const { user } = useAuth();
  const includeUnowned = user?.role === "admin";
  const {
    scope,
    recoveryRecords,
    criticalRecoveryCount,
    getOfflineResults,
    getOfflineDeficiencies,
    getOfflineChecklistResponses,
    getOfflineTemplateResponses,
  } = useOfflineStorage();
  const { summary, error } = useOfflineRecovery();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const generation = useRef(0);
  useLayoutEffect(() => {
    generation.current++;
    return () => { generation.current++; };
  }, [scope?.userId, scope?.companyId, includeUnowned]);
  const preserved = recoveryRecords.length + summary.legacy + summary.invalid;
  const exportData = async () => {
    if (!scope) return;
    const current = generation.current;
    setExporting(true);
    setExportError("");
    try {
      const indexedDB = await offlineStorage.exportRecovery(scope, includeUnowned);
      if (generation.current !== current) return;
      const contents = JSON.stringify(
        {
          version: 1,
          exportedAt: new Date().toISOString(),
          scope,
          reviewRequired: true,
          localStorage: {
            results: getOfflineResults(),
            deficiencies: getOfflineDeficiencies(),
            checklist: getOfflineChecklistResponses(),
            templates: getOfflineTemplateResponses(),
            preserved: recoveryRecords.filter(record => includeUnowned || !(LEGACY_OFFLINE_KEYS as readonly string[]).includes(record.key)),
          },
          indexedDB,
        },
        null,
        2
      );
      const url = URL.createObjectURL(
        new Blob([contents], { type: "application/json" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `inspectra-offline-recovery-${Date.now()}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (generation.current === current) setExportError("Export failed. Saved data remains on this device.");
    } finally {
      if (generation.current === current) setExporting(false);
    }
  };
  return (
    <Card className={preserved || error ? "border-amber-500" : undefined}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" /> Saved data recovery
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {error && <p role="alert">{error}</p>}
        {preserved > 0 && (
          <p>
            {preserved} older or unreadable record source
            {preserved === 1 ? "" : "s"} need review. These records are
            preserved and are never sent automatically.{" "}
            {criticalRecoveryCount + summary.legacy + summary.invalid > 0
              ? "QA submission stays blocked until recovery is resolved."
              : "Cached job copies can be refreshed from the original account."}
          </p>
        )}
        {summary.foreign > 0 && (
          <p>
            Other accounts have saved data on this device. Sign in to the
            account that captured it to sync or export it.
          </p>
        )}
        {!includeUnowned && (summary.legacy > 0 || recoveryRecords.some(record => (LEGACY_OFFLINE_KEYS as readonly string[]).includes(record.key))) && (
          <p>Older records with no verified account owner are preserved. An administrator must review those records on this device; your export contains your own account’s saved data.</p>
        )}
        <p>
          Export saved changes and photos before device cleanup. For older
          records, review the export with office staff, reopen the original job,
          and enter the verified results or attach the saved photos. The export
          does not upload, mark synced, or remove anything.
        </p>
        {exportError && (
          <p role="alert" className="text-destructive">
            {exportError}
          </p>
        )}
        <Button
          variant="outline"
          onClick={exportData}
          disabled={!scope || exporting}
        >
          <Download className="h-4 w-4 mr-2" />
          {exporting ? "Preparing export…" : "Export saved data"}
        </Button>
      </CardContent>
    </Card>
  );
}
