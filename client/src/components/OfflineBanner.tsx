import { useEffect, useRef, useState } from "react";
import { WifiOff, RefreshCw, CheckCircle } from "lucide-react";
import { mutationQueue } from "@/lib/mutationQueue";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";

type SyncState = "idle" | "syncing" | "done" | "error";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [pending, setPending] = useState(() => mutationQueue.count());
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const syncingRef = useRef(false);

  // Refresh pending count every 2 seconds
  useEffect(() => {
    const id = setInterval(() => setPending(mutationQueue.count()), 2000);
    return () => clearInterval(id);
  }, []);

  // Auto-flush when coming back online
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
    setPending(mutationQueue.count());
    setSyncState(failed === 0 ? "done" : "error");
  };

  const isVisible = !isOnline || pending > 0 || syncState === "syncing" || syncState === "done" || syncState === "error";
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
        isOnline && pending > 0 ? "bg-amber-500 text-white" : "bg-gray-800 text-white"
      )}
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      {!isOnline ? (
        <span>
          No connection — {pending > 0 ? `${pending} change${pending !== 1 ? "s" : ""} saved locally` : "changes will be saved locally"}
        </span>
      ) : (
        <span>
          Back online —{" "}
          <button className="underline font-medium" onClick={handleSync}>
            sync {pending} pending change{pending !== 1 ? "s" : ""}
          </button>
          {syncState === "error" && " (some failed — tap to retry)"}
        </span>
      )}
    </div>
  );
}
