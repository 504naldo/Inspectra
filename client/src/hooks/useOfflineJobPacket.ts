import { useState, useEffect, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useOfflineScope } from "./useOfflineScope";
import { offlineScopeKey } from "@/lib/offlineScope";
import {
  loadAndCachePacket,
  getCachedPacket,
  readPacketStore,
  removePacketById,
  savePacketEntry,
  type OfflinePacketStatus,
} from "@/lib/scopedPacketStore";
export {
  getCachedPacket,
  getPacketStatusFromStorage,
  readPacketStore,
  removePacketById,
} from "@/lib/scopedPacketStore";
export type {
  OfflinePacketStatus,
  PacketEntry,
  PacketStore,
} from "@/lib/scopedPacketStore";

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach(listener => listener());
}
function usePacketUpdates() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const update = () => setVersion(version => version + 1);
    listeners.add(update);
    window.addEventListener("storage", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("storage", update);
    };
  }, []);
}
export function useOfflineJobPacket(jobId: number) {
  const scope = useOfflineScope();
  const scopeKey = scope ? offlineScopeKey(scope) : "signed-out";
  const identity = `${scopeKey}:${jobId}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const operationRef = useRef(0);
  const [caching, setCaching] = useState({ identity: "", active: false });
  usePacketUpdates();
  const utils = trpc.useUtils();
  useEffect(
    () => () => {
      operationRef.current++;
    },
    []
  );
  const preload = useCallback(async () => {
    if (!scope) {
      toast.error("Sign in before caching a job");
      return;
    }
    const operation = ++operationRef.current;
    const isCurrent = () =>
      identityRef.current === identity && operationRef.current === operation;
    setCaching({ identity, active: true });
    try {
      const saved = await loadAndCachePacket(
        jobId,
        scope,
        () => utils.job.getOfflineJobPacket.fetch({ jobId }),
        isCurrent
      );
      if (!saved || !isCurrent()) return;
      notify();
      toast.success("Job is now available offline");
    } catch (error) {
      if (!isCurrent()) return;
      try {
        const existing = readPacketStore(scope)[String(jobId)];
        if (existing)
          savePacketEntry(jobId, { ...existing, status: "failed" }, scope);
        notify();
      } catch {
        /* Keep the previous copy intact if recovery/storage failed. */
      }
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to cache job for offline use"
      );
    } finally {
      if (isCurrent()) setCaching({ identity, active: false });
    }
  }, [identity, jobId, scope, utils]);
  const remove = useCallback(() => {
    try {
      removePacketById(jobId, scope);
      notify();
      toast.success("Offline packet removed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Offline packet could not be removed"
      );
    }
  }, [jobId, scope]);
  const checkStale = useCallback(
    (serverUpdatedAt: string | Date | null | undefined) => {
      if (!scope || !serverUpdatedAt) return;
      const entry = readPacketStore(scope)[String(jobId)];
      if (!entry?.packet?.lastUpdatedAt) return;
      if (
        new Date(serverUpdatedAt).getTime() >
          new Date(entry.packet.lastUpdatedAt).getTime() &&
        entry.status !== "stale"
      ) {
        try {
          savePacketEntry(jobId, { ...entry, status: "stale" }, scope);
          notify();
        } catch {
          /* Preserve the existing cached copy. */
        }
      }
    },
    [jobId, scope]
  );
  const entry = getCachedPacket(jobId, scope);
  const isCaching = caching.identity === identity && caching.active;
  const status: OfflinePacketStatus = isCaching
    ? "caching"
    : (entry?.status ?? "not_cached");
  return {
    status,
    cachedAt: entry?.cachedAt ?? null,
    packet: entry?.packet ?? null,
    isCaching,
    preload,
    refresh: preload,
    remove,
    checkStale,
  };
}
export function useAllCachedPackets() {
  const scope = useOfflineScope();
  usePacketUpdates();
  // Read using this render's identity so the previous account never flashes.
  return readPacketStore(scope);
}
