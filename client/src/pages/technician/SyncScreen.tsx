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
  Trash2
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function SyncScreen() {
  const { 
    isOnline, 
    syncStatus, 
    getOfflineResults, 
    markResultsSynced,
    clearSyncedResults,
    setLastSyncTime,
    clearAllOfflineData
  } = useOfflineStorage();
  
  const [isSyncing, setIsSyncing] = useState(false);

  const syncBatch = trpc.inspectionResult.syncBatch.useMutation({
    onSuccess: (data) => {
      toast.success(`Synced ${data.synced} inspection results`);
      clearSyncedResults();
      setLastSyncTime();
    },
    onError: () => {
      toast.error('Sync failed - will retry later');
    }
  });

  const handleSync = async () => {
    if (!isOnline) {
      toast.error('Cannot sync while offline');
      return;
    }

    setIsSyncing(true);
    
    try {
      const offlineResults = getOfflineResults().filter(r => !r.synced);
      
      if (offlineResults.length > 0) {
        await syncBatch.mutateAsync({
          results: offlineResults.map(r => ({
            jobId: r.jobId,
            deviceId: r.deviceId,
            result: r.result,
            notes: r.notes,
            testedAt: r.testedAt,
          }))
        });
      } else {
        toast.info('Nothing to sync');
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all offline data? This cannot be undone.')) {
      clearAllOfflineData();
      toast.success('Offline data cleared');
    }
  };

  const offlineResults = getOfflineResults();
  const pendingResults = offlineResults.filter(r => !r.synced);
  const syncedResults = offlineResults.filter(r => r.synced);

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
        <Card className={isOnline ? 'border-[var(--success)]/50 bg-[var(--success)]/5' : 'border-[var(--warning)]/50 bg-[var(--warning)]/5'}>
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
              <p className="text-2xl font-bold">{pendingResults.length}</p>
              <p className="text-sm text-muted-foreground">Pending Upload</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-[var(--success)] mb-2" />
              <p className="text-2xl font-bold">{syncedResults.length}</p>
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

        {/* Pending Items */}
        {pendingResults.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pending Uploads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {pendingResults.slice(0, 10).map((result, index) => (
                <div key={result.localId || index} className="flex items-center justify-between p-2 bg-muted rounded">
                  <div>
                    <p className="text-sm font-medium">
                      Job #{result.jobId} - Device #{result.deviceId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {result.result.toUpperCase()} - {new Date(result.testedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    result.result === 'pass' ? 'status-pass' :
                    result.result === 'fail' ? 'status-fail' :
                    'status-na'
                  }`}>
                    {result.result}
                  </span>
                </div>
              ))}
              {pendingResults.length > 10 && (
                <p className="text-sm text-muted-foreground text-center">
                  +{pendingResults.length - 10} more items
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
            disabled={!isOnline || isSyncing || pendingResults.length === 0}
          >
            {isSyncing ? (
              <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
            ) : (
              <Upload className="h-5 w-5 mr-2" />
            )}
            {isSyncing ? 'Syncing...' : `Sync ${pendingResults.length} Items`}
          </Button>

          {offlineResults.length > 0 && (
            <Button 
              variant="outline"
              className="w-full"
              onClick={handleClearAll}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All Offline Data
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
