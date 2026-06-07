import { useEffect, useRef, useState } from "react";
import { WifiOff, RefreshCw, CheckCircle } from "lucide-react";
import { mutationQueue } from "@/lib/mutationQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOfflineStorage } from "@/hooks/useOfflineStorage";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

type SyncState = "idle" | "syncing" | "done" | "error";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const { syncStatus } = useOfflineStorage();
  const [mqPending, setMqPending] = useState(() => mutationQueue.count());
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const syncingRef = useRef(false);

  const offlineStorePending = syncStatus.pendingResults + syncStatus.pendingDeficiencies + syncStatus.pendingAttachments;
  const totalPending = mqPending + offlineStorePending;

  // Refresh mutationQueue count every 2 seconds
  useEffect(() => {
    const id = setInterval(() => setMqPending(mutationQueue.count()), 2000);
    return () => clearInterval(id);
  }, []);

  // Auto-flush mutationQueue when coming back online
  useEffect(() => {
    if (isOnline && mutationQueue.count() > 0 && !syncingRef.current) {
      handleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Auto-dismiss "done" state after 3 seconds
  useEffect(() => {
    if (syncState === "done") {
      const id = setTimeout(() => setSyncState("idle"), 3000);
      return () => clearTimeout(id);
    }
  }, [syncState]);

  const handleSync = async () => {
    if (syncingRef.current || !isOnline) return;
    syncingRef.current = true;
    setSyncState("syncing");

    const queue = mutationQueue.getAll();
    let failed = 0;

    for (const item of queue) {
      try {
        const res = await fetch(item.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: item.body,
        });
        if (res.ok) {
          mutationQueue.remove(item.id);
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    syncingRef.current = false;
    setMqPending(mutationQueue.count());
    setSyncState(failed === 0 ? "done" : "error");
  };

  const isVisible =
    !isOnline ||
    totalPending > 0 ||
    syncState === "syncing" ||
    syncState === "done" ||
    syncState === "error";

  if (!isVisible) return null;

  if (syncState === "done") {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-green-600 text-white text-xs px-4 py-2 shadow-lg">
        <CheckCircle className="h-3.5 w-3.5" />
        All changes synced
      </div>
    );
  }

  if (syncState === "syncing") {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 bg-blue-600 text-white text-xs px-4 py-2.5 flex items-center justify-center gap-2">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        Syncing changes…
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-0 inset-x-0 z-50 text-xs px-4 py-2.5 flex items-center justify-center gap-2",
        isOnline && totalPending > 0 ? "bg-amber-500 text-white" : "bg-gray-800 text-white"
      )}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      {!isOnline ? (
        <span>
          No connection —{" "}
          {totalPending > 0
            ? `${totalPending} item${totalPending !== 1 ? "s" : ""} saved locally`
            : "changes will be saved locally"}
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          Back online —{" "}
          {mqPending > 0 ? (
            <button className="underline font-medium" onClick={handleSync}>
              sync {mqPending} pending change{mqPending !== 1 ? "s" : ""}
            </button>
          ) : null}
          {offlineStorePending > 0 && (
            <Link href="/tech/sync" className="underline font-medium">
              {mqPending > 0 ? `+ ${offlineStorePending} in sync queue` : `${offlineStorePending} item${offlineStorePending !== 1 ? "s" : ""} ready to sync →`}
            </Link>
          )}
          {syncState === "error" && " (some failed — tap to retry)"}
        </span>
      )}
      {syncStatus.lastSyncAt && !totalPending && isOnline && (
        <span className="text-white/60 ml-1">
          · last synced {new Date(syncStatus.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
    </div>
  );
}
