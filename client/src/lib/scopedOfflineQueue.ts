import { z } from "zod";
import type {
  OfflineInspectionResult,
  OfflineDeficiency,
  OfflineChecklistResponse,
  OfflineTemplateResponse,
} from "@shared/types";
import {
  offlineScopeKey,
  requireOfflineScope,
  type OfflineScope,
} from "./offlineScope";

type Store = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
const id = z.number().int().positive();
const base = {
  localId: z.string().min(1),
  jobId: id,
  synced: z.boolean(),
  queueRevision: z.string().min(1).optional(),
};
const text = z.string().optional();
export const offlineQueueSchemas = {
  results: z
    .object({
      ...base,
      deviceId: id,
      expectedDeviceRevision: z.string().min(1),
      result: z.enum(["pass", "fail", "na", "not_tested"]),
      notes: text,
      testedAt: z.union([z.date(), z.iso.datetime({ offset: true })]),
    })
    .passthrough(),
  deficiencies: z
    .object({
      ...base,
      deviceId: id.optional(),
      expectedDeviceRevision: z.string().min(1).optional(),
      title: z.string().min(1),
      severity: z.enum(["critical", "major", "minor", "observation"]),
      description: text,
      observedIssue: text,
      correctiveAction: text,
      customerExplanation: text,
      codeReference: text,
      systemCategory: z
        .enum([
          "FIRE_ALARM",
          "FIRE_EXTINGUISHER",
          "EMERGENCY_LIGHTING",
          "SPRINKLER",
          "SMOKE_ALARM",
        ])
        .optional(),
      estimatedCost: z.number().finite().nonnegative().optional(),
    })
    .passthrough().refine(value => !value.deviceId || !!value.expectedDeviceRevision),
  checklist: z
    .object({
      ...base,
      sectionNumber: z.string().min(1),
      itemId: z.string().min(1),
      status: z.enum(["PASS", "DEFICIENT", "NA"]),
      comment: text,
    })
    .passthrough(),
  templates: z
    .object({
      ...base,
      templateId: id,
      sectionId: id,
      itemId: id,
      questionRevision: z.string().regex(/^inspection-capture-v1:template-question:[a-f0-9]{64}$/),
      questionContext: z.record(z.string(), z.unknown()).optional(),
      responseValue: z.string().nullable().optional(),
      responseText: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      deficiencyId: id.nullable().optional(),
    })
    .passthrough(),
};
export type QueueTypes = {
  results: OfflineInspectionResult;
  deficiencies: OfflineDeficiency;
  checklist: OfflineChecklistResponse;
  templates: OfflineTemplateResponse;
};
export const LEGACY_OFFLINE_KEYS = [
  "fire_inspect_offline_results",
  "fire_inspect_offline_deficiencies",
  "fire_inspect_offline_checklist_responses",
  "fire_inspect_offline_template_responses",
  "inspectra_mutation_queue",
  "fire_inspect_job_packets",
] as const;
export const OFFLINE_QUEUE_EVENT = "inspectra:offline-queue";
function notify() {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(OFFLINE_QUEUE_EVENT));
}
export class ScopedOfflineQueue<K extends keyof QueueTypes> {
  readonly prefix: string;
  constructor(
    readonly kind: K,
    readonly scope: OfflineScope | null,
    private storage: Store = localStorage
  ) {
    this.prefix = scope
      ? `inspectra_offline_v2:${offlineScopeKey(scope)}:${kind}:`
      : "";
  }
  private keys() {
    if (!this.scope) return [];
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (
        key?.startsWith(this.prefix) &&
        !key.startsWith(`${this.prefix}:ack:`)
      )
        keys.push(key);
    }
    return keys;
  }
  read(): QueueTypes[K][] {
    return this.keys().flatMap(key => {
      try {
        const value = JSON.parse(this.storage.getItem(key)!);
        return offlineQueueSchemas[this.kind].safeParse(value).success &&
          typeof value.queueRevision === "string" &&
          this.storage.getItem(`${this.prefix}:ack:${value.queueRevision}`) !==
            "1" &&
          key === this.prefix + encodeURIComponent(value.localId)
          ? [value as QueueTypes[K]]
          : [];
      } catch {
        return [];
      }
    });
  }
  save(value: QueueTypes[K]) {
    requireOfflineScope(this.scope);
    if (!offlineQueueSchemas[this.kind].safeParse(value).success)
      throw new Error("Offline data is invalid; changes were not saved");
    const key = this.prefix + encodeURIComponent(value.localId);
    const existing = this.storage.getItem(key);
    if (existing !== null) {
      try {
        if (
          !offlineQueueSchemas[this.kind].safeParse(JSON.parse(existing))
            .success
        )
          throw new Error();
      } catch {
        throw new Error(
          "An unreadable offline draft needs recovery before editing"
        );
      }
    }
    this.storage.setItem(
      key,
      JSON.stringify({
        ...value,
        synced: false,
        queueRevision: crypto.randomUUID(),
      })
    );
    notify();
  }
  acknowledge(sent: QueueTypes[K][]) {
    requireOfflineScope(this.scope);
    for (const item of sent) {
      const revision = (item as QueueTypes[K] & { queueRevision?: string })
        .queueRevision;
      if (!revision) throw new Error("Saved draft revision needs recovery");
      // ACK is a separate immutable revision marker. Never read-then-delete the
      // mutable draft key: another tab can save between those operations.
      this.storage.setItem(`${this.prefix}:ack:${revision}`, "1");
    }
    notify();
  }
  clearSynced() {
    this.acknowledge(this.read().filter(item => item.synced));
  }
  recovery() {
    const readyKeys = new Set(
      this.keys().filter(key => {
        try {
          const value = JSON.parse(this.storage.getItem(key)!);
          return (
            offlineQueueSchemas[this.kind].safeParse(value).success &&
            typeof value.queueRevision === "string" &&
            key === this.prefix + encodeURIComponent(value.localId)
          );
        } catch {
          return false;
        }
      })
    );
    return this.keys()
      .filter(key => !readyKeys.has(key))
      .map(key => ({ key, raw: this.storage.getItem(key) }));
  }
}
export function legacyOfflineRecovery(storage: Store = localStorage) {
  return LEGACY_OFFLINE_KEYS.flatMap(key => {
    const raw = storage.getItem(key);
    if (
      !raw ||
      raw === "[]" ||
      (key === "fire_inspect_job_packets" && raw === "{}")
    )
      return [];
    try {
      if (Array.isArray(JSON.parse(raw)) && JSON.parse(raw).length === 0)
        return [];
    } catch {
      /* preserve */
    }
    return [{ key, raw }];
  });
}
