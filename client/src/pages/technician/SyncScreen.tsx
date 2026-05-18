import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import {
  ArrowLeft,
  RefreshCw,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  Upload,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function SyncScreen() {
  const {
    isOnline,
    syncStatus,
    getOfflineResults,
    getOfflineDeficiencies,
    markResultsSynced,
    markDeficienciesSynced,
    clearSyncedResults,
    clearSyncedDeficiencies,
    setLastSyncTime,
    clearAllOfflineData,
  } = useOfflineStorage();

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncBatch = trpc.inspectionResult.syncBatch.useMutation();
  const createDeficiency = trpc.deficiency.create.useMutation();

  const handleSync = async () => {
    if (!isOnline) {
      toast.error("Cannot sync while offline");
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    let resultsFailed = 0;
    let defsFailed = 0;
    let resultsSynced = 0;
    let defsSynced = 0;

    try {
      // Sync inspection results (batch)
      const pendingResults = getOfflineResults().filter((r) => !r.synced);
      if (pendingResults.length > 0) {
        try {
          const data = await syncBatch.mutateAsync({
            results: pendingResults.map((r) => ({
              jobId: r.jobId,
              deviceId: r.deviceId,
              result: r.result,
              notes: r.notes,
              testedAt: r.testedAt,
            })),
          });
          resultsSynced = data.synced;
          // Mark all pending results as synced (by unique job ID), then clear
          const uniqueJobIds = [...new Set(pendingResults.map((r) => r.jobId))];
          for (const jId of uniqueJobIds) markResultsSynced(jId);
          clearSyncedResults();
        } catch {
          resultsFailed = pendingResults.length;
        }
      }

      // Sync offline deficiencies (one by one)
      const pendingDefs = getOfflineDeficiencies().filter((d) => !d.synced);
      const syncedLocalIds: string[] = [];
      for (const def of pendingDefs) {
        try {
          await createDeficiency.mutateAsync({
            jobId: def.jobId,
            deviceId: def.deviceId,
            title: def.title,
            severity: def.severity,
            description: def.description,
            observedIssue: def.observedIssue,
          });
          syncedLocalIds.push(def.localId);
          defsSynced++;
        } catch {
          defsFailed++;
        }
      }
      if (syncedLocalIds.length > 0) {
        markDeficienciesSynced(syncedLocalIds);
        clearSyncedDeficiencies();
      }

      const totalSynced = resultsSynced + defsSynced;
      const totalFailed = resultsFailed + defsFailed;

      if (totalSynced === 0 && totalFailed === 0) {
        toast.info("Nothing to sync");
      } else if (totalFailed === 0) {
        toast.success(`Synced ${totalSynced} item${totalSynced !== 1 ? "s" : ""}`);
        setLastSyncTime();
      } else if (totalSynced > 0) {
        toast.warning(`Synced ${totalSynced}, failed ${totalFailed} — tap retry`);
        setSyncError(`${totalFailed} item${totalFailed !== 1 ? "s" : ""} failed to sync`);
      } else {
        toast.error("Sync failed — will retry later");
        setSyncError("All items failed to sync");
      }
    } catch (error) {
      console.error("Sync error:", error);
      setSyncError("Sync failed unexpectedly");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear all offline data? This cannot be undone.")) {
      clearAllOfflineData();
      toast.success("Offline data cleared");
    }
  };

  const offlineResults = getOfflineResults();
  const offlineDeficiencies = getOfflineDeficiencies();
  const pendingResults = offlineResults.filter((r) => !r.synced);
  const syncedResults = offlineResults.filter((r) => r.synced);
  const pendingDefs = offlineDeficiencies.filter((d) => !d.synced);
  const syncedDefs = offlineDeficiencies.filter((d) => d.synced);

  const totalPending = pendingResults.length + pendingDefs.length;
  const totalSynced = syncedResults.length + syncedDefs.length;

  return (
    <div className="min-h-screen bg-background safe-top safe-bottom">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/tech">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="font-bold text-lg flex-1">Sync Data</h1>
          {isOnline ? (
            <span className="online-badge flex items-center gap-1">
              <Wifi className="h-3 w-3" /> Online
            </span>
          ) : (
            <span className="offline-badge flex items-center gap-1">
              <WifiOff className="h-3 w-3" /> Offline
            </span>
          )}
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Connection Status */}
        <Card
          className={
            isOnline
              ? "border-[var(--success)]/50 bg-[var(--success)]/5"
              : "border-[var(--warning)]/50 bg-[var(--warning)]/5"
          }
        >
          <CardContent className="flex items-center gap-4 p-4">
            {isOnline ? (
              <>
                <Wifi className="h-8 w-8 text-[var(--success)]" />
                <div>
                  <p className="font-semibold text-[var(--success)]">Connected</p>
                  <p className="text-sm text-[var(--success)]">Ready to sync data</p>
                </div>
              </>
            ) : (
              <>
                <WifiOff className="h-8 w-8 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-800">Offline</p>
                  <p className="text-sm text-amber-700">Data will be saved locally</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Sync Status */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <Clock className="h-8 w-8 mx-auto text-amber-500 mb-2" />
              <p className="text-2xl font-bold">{totalPending}</p>
              <p className="text-sm text-muted-foreground">Pending Upload</p>
              {pendingResults.length > 0 && pendingDefs.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {pendingResults.length} test{pendingResults.length !== 1 ? "s" : ""} · {pendingDefs.length} def.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-[var(--success)] mb-2" />
              <p className="text-2xl font-bold">{totalSynced}</p>
              <p className="text-sm text-muted-foreground">Synced</p>
            </CardContent>
          </Card>
        </div>

        {/* Last Sync */}
        {syncStatus.lastSyncAt && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Last sync: {new Date(syncStatus.lastSyncAt).toLocaleString()}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Sync error */}
        {syncError && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">{syncError}</p>
            </CardContent>
          </Card>
        )}

        {/* Pending Items */}
        {totalPending > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pending Uploads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingResults.slice(0, 8).map((result, index) => (
                <div
                  key={result.localId || index}
                  className="flex items-center justify-between p-2 bg-muted rounded"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Device Test · Job #{result.jobId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Device #{result.deviceId} · {new Date(result.testedAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      result.result === "pass"
                        ? "status-pass"
                        : result.result === "fail"
                        ? "status-fail"
                        : "status-na"
                    }`}
                  >
                    {result.result}
                  </span>
                </div>
              ))}
              {pendingDefs.slice(0, 8).map((def, index) => (
                <div
                  key={def.localId || index}
                  className="flex items-center justify-between p-2 bg-muted rounded"
                >
                  <div>
                    <p className="text-sm font-medium">
                      Deficiency · Job #{def.jobId}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {def.title}
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                    {def.severity}
                  </span>
                </div>
              ))}
              {totalPending > 16 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{totalPending - 16} more items
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-3">
          <Button
            className="w-full h-14"
            onClick={handleSync}
            disabled={!isOnline || isSyncing || totalPending === 0}
          >
            {isSyncing ? (
              <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Upload className="h-5 w-5 mr-2" />
            )}
            {isSyncing ? "Syncing…" : `Sync ${totalPending} Item${totalPending !== 1 ? "s" : ""}`}
          </Button>

          {syncError && totalPending > 0 && isOnline && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Failed Items
            </Button>
          )}

          {(offlineResults.length > 0 || offlineDeficiencies.length > 0) && (
            <Button variant="outline" className="w-full" onClick={handleClearAll}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Offline Data
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
