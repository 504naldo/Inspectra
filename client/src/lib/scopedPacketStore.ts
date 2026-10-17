import { z } from "zod";
import {
  offlineScopeKey,
  requireOfflineScope,
  type OfflineScope,
} from "./offlineScope";

export type OfflinePacketStatus =
  | "not_cached"
  | "caching"
  | "cached"
  | "stale"
  | "failed";
export interface PacketEntry {
  packet: any;
  cachedAt: string;
  cacheVersion: string;
  status: "cached" | "stale" | "failed";
}
export type PacketStore = Record<string, PacketEntry>;
type Store = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
const record = z.object({ id: z.number().int().positive() }).passthrough();
const packetSchema = z
  .object({
    job: record.extend({ companyId: z.number().int().positive() }),
    site: record.nullable(),
    devices: z.array(record),
    deficiencies: z.array(record),
    cacheVersion: z.string(),
  })
  .passthrough();
const entrySchema = z
  .object({
    packet: packetSchema.nullable(),
    cachedAt: z.iso.datetime({ offset: true }),
    cacheVersion: z.string(),
    status: z.enum(["cached", "stale", "failed"]),
  })
  .refine(entry => entry.packet !== null || entry.status === "failed");

function prefix(scope: OfflineScope) {
  return `inspectra_job_packets_v2:${offlineScopeKey(scope)}:`;
}
function validEntry(value: unknown, jobId: number): value is PacketEntry {
  const result = entrySchema.safeParse(value);
  return (
    result.success &&
    (!result.data.packet ||
      (result.data.packet.job.id === jobId &&
        result.data.packet.cacheVersion === result.data.cacheVersion))
  );
}
function entries(
  scope: OfflineScope | null,
  storage: Store
): Array<{ key: string; jobId: number; raw: string | null }> {
  if (!scope) return [];
  const result = [];
  const start = prefix(scope);
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(start)) continue;
    const id = key.slice(start.length);
    const jobId = Number(id);
    result.push({
      key,
      jobId:
        /^[1-9][0-9]*$/.test(id) && Number.isSafeInteger(jobId) ? jobId : 0,
      raw: storage.getItem(key),
    });
  }
  return result;
}
export function readPacketStore(
  scope: OfflineScope | null,
  storage: Store = localStorage
): PacketStore {
  const result: PacketStore = {};
  for (const { jobId, raw } of entries(scope, storage)) {
    try {
      const value: unknown = JSON.parse(raw!);
      if (jobId && validEntry(value, jobId)) result[String(jobId)] = value;
    } catch {
      /* Preserve malformed copies for recovery. */
    }
  }
  return result;
}
export function getCachedPacket(
  jobId: number,
  scope: OfflineScope | null
): PacketEntry | null {
  return readPacketStore(scope)[String(jobId)] ?? null;
}
export function getPacketStatusFromStorage(
  jobId: number,
  scope: OfflineScope | null
): OfflinePacketStatus {
  return getCachedPacket(jobId, scope)?.status ?? "not_cached";
}
export function readScopedPacketRecovery(
  scope: OfflineScope | null,
  storage: Store = localStorage
) {
  return entries(scope, storage)
    .filter(({ jobId, raw }) => {
      try {
        return !jobId || !validEntry(JSON.parse(raw!), jobId);
      } catch {
        return true;
      }
    })
    .map(({ key, raw }) => ({ key, raw }));
}
export function savePacketEntry(
  jobId: number,
  entry: PacketEntry,
  scope: OfflineScope | null,
  storage: Store = localStorage
) {
  requireOfflineScope(scope);
  if (!Number.isSafeInteger(jobId) || jobId <= 0 || !validEntry(entry, jobId))
    throw new Error("The offline job packet is invalid");
  const key = prefix(scope!) + jobId;
  const previous = storage.getItem(key);
  if (previous !== null) {
    try {
      if (!validEntry(JSON.parse(previous), jobId)) throw new Error();
    } catch {
      throw new Error(
        "An unreadable job packet needs recovery before replacement"
      );
    }
  }
  // One key per job avoids overwriting another tab's unrelated packet.
  // Storage errors propagate before the UI reports success.
  storage.setItem(key, JSON.stringify(entry));
}
export function removePacketById(
  jobId: number,
  scope: OfflineScope | null,
  storage: Store = localStorage
) {
  requireOfflineScope(scope);
  const key = prefix(scope!) + jobId;
  const current = storage.getItem(key);
  if (current === null) return;
  try {
    if (!validEntry(JSON.parse(current), jobId)) throw new Error();
  } catch {
    throw new Error("An unreadable job packet must be exported before removal");
  }
  storage.removeItem(key);
}
export async function loadAndCachePacket(
  jobId: number,
  scope: OfflineScope | null,
  fetchPacket: () => Promise<unknown>,
  isCurrent: () => boolean,
  storage: Store = localStorage
): Promise<PacketEntry | undefined> {
  requireOfflineScope(scope);
  if (!isCurrent()) return;
  const packet = await fetchPacket();
  if (!isCurrent()) return;
  const parsed = packetSchema.parse(packet);
  if (parsed.job.id !== jobId)
    throw new Error("The returned job packet belongs to a different job");
  const entry: PacketEntry = {
    packet,
    cachedAt: new Date().toISOString(),
    cacheVersion: parsed.cacheVersion,
    status: "cached",
  };
  savePacketEntry(jobId, entry, scope, storage);
  return entry;
}
