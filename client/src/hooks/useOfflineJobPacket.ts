import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

export type OfflinePacketStatus = "not_cached" | "caching" | "cached" | "stale" | "failed";

export interface PacketEntry {
  packet: any;
  cachedAt: string;
  cacheVersion: string;
  status: "cached" | "stale" | "failed";
}

export type PacketStore = Record<string, PacketEntry>;

// ── Storage constants ─────────────────────────────────────────────────────────

const PACKET_KEY = "fire_inspect_job_packets";

// ── Module-level event bus (same-tab updates) ─────────────────────────────────

const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

// ── Pure storage helpers (no React) ──────────────────────────────────────────

export function readPacketStore(): PacketStore {
  try {
    return JSON.parse(localStorage.getItem(PACKET_KEY) || "{}");
  } catch {
    return {};
  }
}

function writePacketStore(store: PacketStore) {
  try {
    localStorage.setItem(PACKET_KEY, JSON.stringify(store));
  } catch (e: any) {
    if (e?.name === "QuotaExceededError") {
      toast.error("Not enough storage space to cache this job. Clear old packets first.");
    }
  }
}

export function getCachedPacket(jobId: number): PacketEntry | null {
  const store = readPacketStore();
  return store[String(jobId)] ?? null;
}

export function getPacketStatusFromStorage(jobId: number): OfflinePacketStatus {
  const entry = getCachedPacket(jobId);
  if (!entry) return "not_cached";
  return entry.status === "stale" ? "stale" : "cached";
}

function saveEntry(jobId: number, entry: PacketEntry) {
  const store = readPacketStore();
  store[String(jobId)] = entry;
  writePacketStore(store);
  notifyListeners();
}

function deleteEntry(jobId: number) {
  const store = readPacketStore();
  delete store[String(jobId)];
  writePacketStore(store);
  notifyListeners();
}

export function removePacketById(jobId: number) {
  deleteEntry(jobId);
}

function markEntryStale(jobId: number) {
  const store = readPacketStore();
  if (store[String(jobId)]) {
    store[String(jobId)] = { ...store[String(jobId)], status: "stale" };
    writePacketStore(store);
    notifyListeners();
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useOfflineJobPacket(jobId: number) {
  const [isCaching, setIsCaching] = useState(false);
  const [, setVersion] = useState(0);

  // Subscribe to module-level store changes so UI updates when preload completes
  useEffect(() => {
    const update = () => setVersion((v) => v + 1);
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  const utils = trpc.useUtils();

  const preload = useCallback(async () => {
    setIsCaching(true);
    try {
      const data = await utils.job.getOfflineJobPacket.fetch({ jobId });
      saveEntry(jobId, {
        packet: data,
        cachedAt: new Date().toISOString(),
        cacheVersion: data.cacheVersion,
        status: "cached",
      });
      toast.success("Job is now available offline");
    } catch (err: any) {
      // Save failed marker only if there was a previous entry to preserve it
      const existing = getCachedPacket(jobId);
      if (existing) {
        saveEntry(jobId, { ...existing, status: "failed" });
      } else {
        const store = readPacketStore();
        store[String(jobId)] = { packet: null, cachedAt: new Date().toISOString(), cacheVersion: "", status: "failed" };
        writePacketStore(store);
        notifyListeners();
      }
      toast.error(err?.message ?? "Failed to cache job for offline use");
    } finally {
      setIsCaching(false);
    }
  }, [jobId, utils]);

  const refresh = preload;

  const remove = useCallback(() => {
    deleteEntry(jobId);
    toast.success("Offline packet removed");
  }, [jobId]);

  // Mark as stale if the server has newer data (call with server's job.updatedAt)
  const checkStale = useCallback((serverUpdatedAt: string | Date | null | undefined) => {
    if (!serverUpdatedAt) return;
    const entry = getCachedPacket(jobId);
    if (!entry?.packet?.lastUpdatedAt) return;
    const serverTime = new Date(serverUpdatedAt).getTime();
    const cachedTime = new Date(entry.packet.lastUpdatedAt).getTime();
    if (serverTime > cachedTime) {
      markEntryStale(jobId);
    }
  }, [jobId]);

  const entry = getCachedPacket(jobId);
  const status: OfflinePacketStatus = isCaching ? "caching" : (entry?.status ?? "not_cached");

  return {
    status,
    cachedAt: entry?.cachedAt ?? null,
    packet: entry?.packet ?? null,
    isCaching,
    preload,
    refresh,
    remove,
    checkStale,
  };
}

// ── All cached packets (for SyncScreen) ──────────────────────────────────────

export function useAllCachedPackets() {
  const [store, setStore] = useState<PacketStore>(readPacketStore);
  const [, setVersion] = useState(0);

  useEffect(() => {
    const update = () => {
      setStore(readPacketStore());
      setVersion((v) => v + 1);
    };
    listeners.add(update);
    return () => { listeners.delete(update); };
  }, []);

  return store;
}
