import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { useAllCachedPackets, removePacketById } from "@/hooks/useOfflineJobPacket";
import { usePendingFireAlarmResults } from "@/hooks/usePendingFireAlarmResults";
import { usePendingSmokeAlarmTests } from "@/hooks/usePendingSmokeAlarmTests";
import { offlineStorage } from "@/lib/offlineStorage";
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
  CloudOff,
  ChevronRight,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function SyncScreen() {
  const {
    isOnline,
    syncStatus,
    getOfflineResults,
    getOfflineDeficiencies,
    getOfflineChecklistResponses,
    getOfflineTemplateResponses,
    markResultsSynced,
    markDeficienciesSynced,
    markChecklistResponsesSynced,
    markTemplateResponsesSynced,
    clearSyncedResults,
    clearSyncedDeficiencies,
    clearSyncedChecklistResponses,
    clearSyncedTemplateResponses,
    setLastSyncTime,
    clearAllOfflineData,
  } = useOfflineStorage();

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isClearAllOpen, setIsClearAllOpen] = useState(false);
  const cachedPackets = useAllCachedPackets();
  const pendingPhotoCount = syncStatus.pendingAttachments;
  const pendingFireAlarmResults = usePendingFireAlarmResults();
  const pendingSmokeTests = usePendingSmokeAlarmTests();

  const syncBatch = trpc.inspectionResult.syncBatch.useMutation();
  const createDeficiency = trpc.deficiency.create.useMutation();
  const uploadMedia = trpc.media.uploadDeficiencyMedia.useMutation();
  const bulkSaveChecklistResponses = trpc.checklist.bulkSaveResponses.useMutation();
  const saveTemplateResponse = trpc.inspectionTemplate.saveResponse.useMutation();
  const saveFireAlarmResult = trpc.fireAlarm.saveInspectionResult.useMutation();
  const recordSmokeTest = trpc.smokeAlarm.recordTest.useMutation();

  const handleSync = async () => {
    if (!isOnline) {
      toast.error("Cannot sync while offline");
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    let resultsFailed = 0;
    let defsFailed = 0;
    let checklistFailed = 0;
    let templateFailed = 0;
    let fireAlarmFailed = 0;
    let smokeFailed = 0;
    let resultsSynced = 0;
    let defsSynced = 0;
    let checklistSynced = 0;
    let templateSynced = 0;
    let fireAlarmSynced = 0;
    let smokeSynced = 0;

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
          const uniqueJobIds = Array.from(new Set(pendingResults.map((r) => r.jobId)));
          for (const jId of uniqueJobIds) markResultsSynced(jId);
          clearSyncedResults();
        } catch {
          resultsFailed = pendingResults.length;
        }
      }

      // Sync offline deficiencies one by one, recording each one's server-side id so
      // any photos queued alongside it can be uploaded (now or on a later retry)
      const pendingDefs = getOfflineDeficiencies().filter((d) => !d.synced);
      const syncedLocalIds: string[] = [];
      for (const def of pendingDefs) {
        try {
          const created = await createDeficiency.mutateAsync({
            jobId: def.jobId,
            deviceId: def.deviceId,
            title: def.title,
            severity: def.severity,
            description: def.description,
            observedIssue: def.observedIssue,
            correctiveAction: def.correctiveAction,
            customerExplanation: def.customerExplanation,
            codeReference: def.codeReference,
            systemCategory: def.systemCategory,
            estimatedCost: def.estimatedCost,
          });
          syncedLocalIds.push(def.localId);
          defsSynced++;

          const queuedPhotos = await offlineStorage.getPendingPhotosForDeficiency(def.localId);
          for (const photo of queuedPhotos) {
            await offlineStorage.setPhotoResolvedDeficiencyId(photo.id, created.id);
          }
        } catch {
          defsFailed++;
        }
      }
      if (syncedLocalIds.length > 0) {
        markDeficienciesSynced(syncedLocalIds);
        clearSyncedDeficiencies();
      }

      // Sync offline checklist (inspection template) responses in one batch
      const pendingChecklist = getOfflineChecklistResponses().filter((r) => !r.synced);
      if (pendingChecklist.length > 0) {
        try {
          await bulkSaveChecklistResponses.mutateAsync({
            responses: pendingChecklist.map((r) => ({
              jobId: r.jobId,
              sectionNumber: r.sectionNumber,
              itemId: r.itemId,
              status: r.status,
              comment: r.comment,
            })),
          });
          checklistSynced = pendingChecklist.length;
          markChecklistResponsesSynced(pendingChecklist.map((r) => r.localId));
          clearSyncedChecklistResponses();
        } catch {
          checklistFailed = pendingChecklist.length;
        }
      }

      // Sync offline inspection-template responses one by one (no bulk endpoint)
      const pendingTemplate = getOfflineTemplateResponses().filter((r) => !r.synced);
      const syncedTemplateLocalIds: string[] = [];
      for (const r of pendingTemplate) {
        try {
          await saveTemplateResponse.mutateAsync({
            jobId: r.jobId,
            templateId: r.templateId,
            sectionId: r.sectionId,
            itemId: r.itemId,
            responseValue: r.responseValue,
            responseText: r.responseText,
            notes: r.notes,
            deficiencyId: r.deficiencyId,
          });
          syncedTemplateLocalIds.push(r.localId);
          templateSynced++;
        } catch {
          templateFailed++;
        }
      }
      if (syncedTemplateLocalIds.length > 0) {
        markTemplateResponsesSynced(syncedTemplateLocalIds);
        clearSyncedTemplateResponses();
      }

      // Sync offline fire-alarm checklist results one by one (no bulk endpoint;
      // these live in IndexedDB via offlineStorage.ts, not localStorage)
      for (const item of pendingFireAlarmResults) {
        try {
          await saveFireAlarmResult.mutateAsync({
            jobId: item.jobId,
            fireAlarmSystemId: item.fireAlarmSystemId,
            checklistItemId: item.checklistItemId,
            result: item.result,
            notes: item.notes,
            numericValue: item.numericValue,
            textValue: item.textValue,
          });
          await offlineStorage.markAsSynced(item.id);
          await offlineStorage.deleteSyncedResult(item.id);
          fireAlarmSynced++;
        } catch {
          fireAlarmFailed++;
        }
      }

      // Sync offline smoke-alarm test results one by one (no bulk endpoint;
      // these live in their own IndexedDB store, keyed by alarm device id)
      for (const test of pendingSmokeTests) {
        try {
          await recordSmokeTest.mutateAsync({
            id: test.alarmId,
            testResult: test.testResult,
            notes: test.notes,
          });
          await offlineStorage.deleteSmokeTest(test.id);
          smokeSynced++;
        } catch {
          smokeFailed++;
        }
      }

      // Upload any queued photos whose parent deficiency has a known server id —
      // covers both freshly-synced deficiencies and ones left over from a failed retry
      let photosFailed = 0;
      const photosToUpload = await offlineStorage.getPhotosReadyToUpload();
      for (const photo of photosToUpload) {
        try {
          await uploadMedia.mutateAsync({
            deficiencyId: photo.resolvedDeficiencyId!,
            fileName: photo.fileName,
            mimeType: photo.mimeType,
            fileSize: photo.fileSize,
            fileData: photo.fileData,
            caption: photo.caption,
            locationNote: photo.locationNote,
          });
          await offlineStorage.deletePendingPhoto(photo.id);
        } catch {
          photosFailed++;
        }
      }

      const totalSynced = resultsSynced + defsSynced + checklistSynced + templateSynced + fireAlarmSynced + smokeSynced;
      const totalFailed = resultsFailed + defsFailed + checklistFailed + templateFailed + fireAlarmFailed + smokeFailed;

      if (photosFailed > 0) {
        toast.warning(`${photosFailed} photo${photosFailed !== 1 ? "s" : ""} failed to upload — they'll retry on the next sync`);
      }

      if (totalSynced === 0 && totalFailed === 0) {
        toast.info(photosFailed > 0 ? "Synced deficiencies — some photos still pending" : "Nothing to sync");
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
    clearAllOfflineData();
    offlineStorage.clearAllResults().catch(() => {});
    offlineStorage.clearAllSmokeTests().catch(() => {});
    toast.success("Offline data cleared");
  };

  const offlineResults = getOfflineResults();
  const offlineDeficiencies = getOfflineDeficiencies();
  const offlineChecklistResponses = getOfflineChecklistResponses();
  const offlineTemplateResponses = getOfflineTemplateResponses();
  const pendingResults = offlineResults.filter((r) => !r.synced);
  const syncedResults = offlineResults.filter((r) => r.synced);
  const pendingDefs = offlineDeficiencies.filter((d) => !d.synced);
  const syncedDefs = offlineDeficiencies.filter((d) => d.synced);
  const pendingChecklist = offlineChecklistResponses.filter((r) => !r.synced);
  const syncedChecklist = offlineChecklistResponses.filter((r) => r.synced);
  const pendingTemplate = offlineTemplateResponses.filter((r) => !r.synced);
  const syncedTemplate = offlineTemplateResponses.filter((r) => r.synced);

  const totalPending = pendingResults.length + pendingDefs.length + pendingChecklist.length + pendingTemplate.length + pendingFireAlarmResults.length + pendingSmokeTests.length + pendingPhotoCount;
  const totalSynced = syncedResults.length + syncedDefs.length + syncedChecklist.length + syncedTemplate.length;

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
              {(pendingResults.length > 0 ? 1 : 0) + (pendingDefs.length > 0 ? 1 : 0) + (pendingChecklist.length > 0 ? 1 : 0) + (pendingTemplate.length > 0 ? 1 : 0) + (pendingFireAlarmResults.length > 0 ? 1 : 0) + (pendingSmokeTests.length > 0 ? 1 : 0) + (pendingPhotoCount > 0 ? 1 : 0) > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {[
                    pendingResults.length > 0 ? `${pendingResults.length} test${pendingResults.length !== 1 ? "s" : ""}` : null,
                    pendingDefs.length > 0 ? `${pendingDefs.length} def.` : null,
                    pendingChecklist.length > 0 ? `${pendingChecklist.length} checklist` : null,
                    pendingTemplate.length > 0 ? `${pendingTemplate.length} template` : null,
                    pendingFireAlarmResults.length > 0 ? `${pendingFireAlarmResults.length} fire alarm` : null,
                    pendingSmokeTests.length > 0 ? `${pendingSmokeTests.length} smoke alarm` : null,
                    pendingPhotoCount > 0 ? `${pendingPhotoCount} photo${pendingPhotoCount !== 1 ? "s" : ""}` : null,
                  ].filter(Boolean).join(" · ")}
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
              {Array.from(new Set(pendingChecklist.map((r) => r.jobId))).slice(0, 8).map((jId) => {
                const count = pendingChecklist.filter((r) => r.jobId === jId).length;
                return (
                  <div key={`checklist-${jId}`} className="flex items-center justify-between p-2 bg-muted rounded">
                    <p className="text-sm font-medium">
                      Checklist · Job #{jId}
                    </p>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                      {count} item{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
              {Array.from(new Set(pendingTemplate.map((r) => r.jobId))).slice(0, 8).map((jId) => {
                const count = pendingTemplate.filter((r) => r.jobId === jId).length;
                return (
                  <div key={`template-${jId}`} className="flex items-center justify-between p-2 bg-muted rounded">
                    <p className="text-sm font-medium">
                      Template · Job #{jId}
                    </p>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                      {count} item{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
              {Array.from(new Set(pendingFireAlarmResults.map((r) => r.jobId))).slice(0, 8).map((jId) => {
                const count = pendingFireAlarmResults.filter((r) => r.jobId === jId).length;
                return (
                  <div key={`firealarm-${jId}`} className="flex items-center justify-between p-2 bg-muted rounded">
                    <p className="text-sm font-medium">
                      Fire Alarm Checklist · Job #{jId}
                    </p>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                      {count} item{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
              {Array.from(new Set(pendingSmokeTests.map((t) => t.jobId))).slice(0, 8).map((jId) => {
                const count = pendingSmokeTests.filter((t) => t.jobId === jId).length;
                return (
                  <div key={`smoke-${jId}`} className="flex items-center justify-between p-2 bg-muted rounded">
                    <p className="text-sm font-medium">
                      Smoke Alarm Tests · Job #{jId}
                    </p>
                    <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                      {count} test{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
              {pendingPhotoCount > 0 && (
                <div className="flex items-center justify-between p-2 bg-muted rounded">
                  <p className="text-sm font-medium">
                    {pendingPhotoCount} deficiency photo{pendingPhotoCount !== 1 ? "s" : ""} queued
                  </p>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
                    on this device
                  </span>
                </div>
              )}
              {pendingResults.length + pendingDefs.length + pendingChecklist.length + pendingTemplate.length + pendingFireAlarmResults.length + pendingSmokeTests.length > 16 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{pendingResults.length + pendingDefs.length + pendingChecklist.length + pendingTemplate.length + pendingFireAlarmResults.length + pendingSmokeTests.length - 16} more items
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Cached Offline Packets */}
        {Object.keys(cachedPackets).length > 0 && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <CloudOff className="h-4 w-4 text-muted-foreground" />
                Offline Job Packets
                <Badge className="ml-1 text-[10px] px-1.5 py-0 bg-muted text-muted-foreground">
                  {Object.keys(cachedPackets).length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {Object.entries(cachedPackets).map(([jobIdStr, entry]) => {
                const jobId = Number(jobIdStr);
                const jobTitle = entry.packet?.job?.title ?? `Job #${jobIdStr}`;
                const cachedDate = new Date(entry.cachedAt).toLocaleDateString([], { month: "short", day: "numeric" });
                return (
                  <div key={jobIdStr} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{jobTitle}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Cached {cachedDate}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.status === "cached" && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Ready</Badge>
                      )}
                      {entry.status === "stale" && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Stale</Badge>
                      )}
                      {entry.status === "failed" && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Failed</Badge>
                      )}
                      <Link href={`/tech/jobs/${jobId}`}>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          removePacketById(jobId);
                          toast.success("Packet removed");
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
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

          {(offlineResults.length > 0 || offlineDeficiencies.length > 0 || offlineChecklistResponses.length > 0 || offlineTemplateResponses.length > 0 || pendingFireAlarmResults.length > 0 || pendingSmokeTests.length > 0) && (
            <Button variant="outline" className="w-full" onClick={() => setIsClearAllOpen(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Offline Data
            </Button>
          )}
        </div>
      </main>

      <AlertDialog open={isClearAllOpen} onOpenChange={setIsClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all offline data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all unsynced inspection results, deficiencies, checklist/template responses, and queued photos on this device. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearAll}>Clear Data</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
