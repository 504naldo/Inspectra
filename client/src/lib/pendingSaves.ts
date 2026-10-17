type DraftStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
type Entry = {
  timer?: ReturnType<typeof setTimeout>;
  save: () => unknown;
  payload?: unknown;
  revision: string;
  generation: number;
};
type Persistence = {
  key: string;
  storage: DraftStorage;
  send: (key: string, payload: any) => Promise<unknown>;
  validate?: (key: string, payload: unknown) => boolean;
  onError?: (error: Error) => void;
  onChange?: () => void;
};
type DraftRecord = {
  schema: 1;
  key: string;
  revision: string;
  generation: number;
  payload: unknown;
  acknowledged: boolean;
};
const fallbackLocks = new WeakMap<object, Map<string, Promise<unknown>>>();
function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function fingerprint(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++)
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return (value >>> 0).toString(36);
}
function journalPrefix(key: string) {
  return `${key}:journal:`;
}
function storedKeys(storage: DraftStorage, prefix: string) {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  return keys;
}
function readLegacy(
  storage: DraftStorage,
  key: string
): Record<string, unknown> {
  const raw = storage.getItem(key);
  if (raw === null) return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Stored drafts need recovery before editing");
  }
  if (
    !plainObject(value) ||
    Object.values(value).some(payload => !plainObject(payload))
  )
    throw new Error("Stored drafts need recovery before editing");
  return value;
}
function readRecords(
  storage: DraftStorage,
  key: string
): { storageKey: string; record: DraftRecord; raw: string }[] {
  return storedKeys(storage, journalPrefix(key)).map(storageKey => {
    const raw = storage.getItem(storageKey)!;
    const record = JSON.parse(raw) as DraftRecord;
    if (
      !plainObject(record) ||
      record.schema !== 1 ||
      typeof record.key !== "string" ||
      !record.key ||
      typeof record.revision !== "string" ||
      !record.revision ||
      !Number.isSafeInteger(record.generation) ||
      record.generation < 0 ||
      typeof record.acknowledged !== "boolean" ||
      !plainObject(record.payload) ||
      storageKey !==
        `${journalPrefix(key)}${encodeURIComponent(record.key)}:${record.revision}`
    )
      throw new Error("Stored drafts need recovery before editing");
    return { storageKey, record, raw };
  });
}
/** Append-only row revisions persist before dispatch. Accepted revisions remain as
 * tombstones, so another tab cannot resurrect an older draft after acknowledgement. */
export class PendingSaves {
  private pending = new Map<string, Entry>();
  private callbacks = new Map<string, Entry>();
  private running = new Map<string, Promise<void>>();
  private closed = false;
  private lastError: Error | null = null;
  constructor(private persistence?: Persistence) {}
  private validate(key: string, payload: unknown) {
    if (
      !key ||
      !plainObject(payload) ||
      this.persistence?.validate?.(key, payload) === false
    )
      throw new Error(
        "Saved draft type or scope needs recovery before editing"
      );
  }
  private state() {
    if (!this.persistence) return this.pending;
    const { storage, key } = this.persistence;
    const legacy = readLegacy(storage, key);
    const records = readRecords(storage, key);
    const byKey = new Map<string, DraftRecord[]>();
    for (const [entryKey, payload] of Object.entries(legacy)) {
      this.validate(entryKey, payload);
      byKey.set(entryKey, [
        {
          schema: 1,
          key: entryKey,
          revision: `legacy-${fingerprint(JSON.stringify(legacy) + entryKey)}`,
          generation: 0,
          payload,
          acknowledged: false,
        },
      ]);
    }
    for (const { record } of records) {
      this.validate(record.key, record.payload);
      const existing = byKey.get(record.key) ?? [];
      if (!existing.length || record.generation > existing[0].generation)
        byKey.set(record.key, [record]);
      else if (
        record.generation === existing[0].generation &&
        !existing.some(item => item.revision === record.revision)
      )
        existing.push(record);
    }
    const state = new Map<string, Entry>();
    for (const [entryKey, candidates] of Array.from(byKey.entries())) {
      // Concurrent tabs that captured different values at the same generation
      // require review; never guess which field value is authoritative.
      if (
        candidates.some(
          item =>
            JSON.stringify(item.payload) !==
            JSON.stringify(candidates[0].payload)
        )
      )
        throw new Error(
          "Conflicting saved drafts need recovery before editing"
        );
      if (candidates.some(item => item.acknowledged)) continue;
      const record = candidates[0];
      state.set(
        entryKey,
        this.callbacks.get(record.revision) ?? {
          payload: record.payload,
          revision: record.revision,
          generation: record.generation,
          save: () => this.persistence!.send(entryKey, record.payload),
        }
      );
    }
    return state;
  }
  schedule(key: string, save: () => unknown, delay: number, payload?: unknown) {
    if (this.closed)
      throw new Error(
        "Draft queue is closed; reopen the inspection before editing"
      );
    let generation = (this.pending.get(key)?.generation ?? 0) + 1;
    const revision = crypto.randomUUID();
    if (this.persistence) {
      this.validate(key, payload);
      const state = this.state(); // Reject corrupt storage without changing memory.
      const allRecords = readRecords(
        this.persistence.storage,
        this.persistence.key
      ).filter(item => item.record.key === key);
      generation =
        Math.max(
          0,
          state.get(key)?.generation ?? 0,
          ...allRecords.map(item => item.record.generation)
        ) + 1;
      const record: DraftRecord = {
        schema: 1,
        key,
        revision,
        generation,
        payload,
        acknowledged: false,
      };
      this.persistence.storage.setItem(
        this.recordKey(record),
        JSON.stringify(record)
      );
    }
    // Only a completed durable write may replace or cancel an older entry.
    const previous = this.pending.get(key);
    if (previous?.timer) clearTimeout(previous.timer);
    if (previous) this.callbacks.delete(previous.revision);
    const durablePayload = this.persistence
      ? JSON.parse(
          this.persistence.storage.getItem(
            this.recordKey({ key, revision } as DraftRecord)
          )!
        ).payload
      : payload;
    const entry: Entry = {
      save: this.persistence
        ? () => this.persistence!.send(key, durablePayload)
        : save,
      payload: durablePayload,
      revision,
      generation,
    };
    this.pending.set(key, entry);
    this.callbacks.set(revision, entry);
    this.lastError = null;
    entry.timer = setTimeout(() => {
      void this.flushKey(key);
    }, delay);
    this.notify();
  }
  schedulePersisted(key: string, payload: unknown, delay: number) {
    if (!this.persistence)
      throw new Error("A durable draft queue is required before editing");
    this.schedule(
      key,
      () => this.persistence!.send(key, payload),
      delay,
      payload
    );
  }
  private recordKey(record: DraftRecord) {
    return `${journalPrefix(this.persistence!.key)}${encodeURIComponent(record.key)}:${record.revision}`;
  }
  private notify() {
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("inspectra:field-drafts"));
    if (!this.closed) this.persistence?.onChange?.();
  }
  private report(error: unknown) {
    this.lastError =
      error instanceof Error ? error : new Error("Draft recovery failed");
    if (!this.closed) this.persistence?.onError?.(this.lastError);
  }
  private async exclusive(action: () => Promise<void>) {
    if (!this.persistence) return action();
    const lock = `inspectra:drafts:${this.persistence.key}`;
    if (typeof navigator !== "undefined" && navigator.locks)
      return navigator.locks.request(lock, action);
    if (typeof window !== "undefined")
      throw new Error(
        "This browser cannot safely coordinate inspection saves. Saved drafts were preserved."
      );
    // Node-only equivalent used by focused concurrency tests.
    let locks = fallbackLocks.get(this.persistence.storage);
    if (!locks) {
      locks = new Map();
      fallbackLocks.set(this.persistence.storage, locks);
    }
    const prior = locks.get(lock) ?? Promise.resolve();
    const operation = prior.catch(() => {}).then(action);
    locks.set(lock, operation);
    try {
      await operation;
    } finally {
      if (locks.get(lock) === operation) locks.delete(lock);
    }
  }
  private migrateLegacy() {
    if (!this.persistence) return;
    const { storage, key } = this.persistence;
    const legacy = readLegacy(storage, key);
    if (Object.keys(legacy).length === 0) return;
    this.state(); // Validate every legacy row before copying anything.
    const raw = storage.getItem(key)!;
    const archiveKey = `${key}:legacy-source:${fingerprint(raw)}`;
    const priorArchive = storage.getItem(archiveKey);
    if (priorArchive !== null && priorArchive !== raw)
      throw new Error("Legacy draft archive needs recovery");
    storage.setItem(archiveKey, raw);
    const records = readRecords(storage, key);
    for (const [entryKey, payload] of Object.entries(legacy)) {
      if (records.some(item => item.record.key === entryKey)) continue;
      const record: DraftRecord = {
        schema: 1,
        key: entryKey,
        revision: `legacy-${fingerprint(JSON.stringify(legacy) + entryKey)}`,
        generation: 0,
        payload,
        acknowledged: false,
      };
      storage.setItem(this.recordKey(record), JSON.stringify(record));
    }
    // Preserve the entire original source before retiring its replay path.
    if (storage.getItem(key) !== raw)
      throw new Error("Older drafts changed during recovery; retry");
    storage.removeItem(key);
  }
  async flushKey(key: string) {
    if (this.closed) return;
    if (this.running.has(key)) return this.running.get(key);
    const operation = this.exclusive(async () => {
      if (this.closed) return;
      this.migrateLegacy();
      while (!this.closed) {
        const entry = this.state().get(key);
        if (!entry) break;
        if (entry.timer) clearTimeout(entry.timer);
        await entry.save();
        if (this.persistence) {
          const sameGeneration = readRecords(
            this.persistence.storage,
            this.persistence.key
          ).filter(
            item =>
              item.record.key === key &&
              item.record.generation === entry.generation
          );
          for (const item of sameGeneration) {
            if (
              JSON.stringify(item.record.payload) !==
              JSON.stringify(entry.payload)
            )
              throw new Error("Conflicting saved drafts need recovery");
            // Acknowledge only the submitted generation; newly appended rows remain.
            this.persistence.storage.setItem(
              item.storageKey,
              JSON.stringify({ ...item.record, acknowledged: true })
            );
          }
          // The accepted generation proves that earlier versions of this same
          // row have been superseded. Keep its tombstone to prevent replay,
          // and leave every newer/conflicting/unreadable record untouched.
          try {
            for (const prior of readRecords(
              this.persistence.storage,
              this.persistence.key
            )) {
              if (
                prior.record.key === key &&
                prior.record.generation < entry.generation
              )
                this.persistence.storage.removeItem(prior.storageKey);
            }
          } catch {
            /* Optional compaction must not erase the accepted receipt. */
          }
        } else if (this.pending.get(key)?.revision === entry.revision)
          this.pending.delete(key);
        if (this.pending.get(key)?.revision === entry.revision)
          this.pending.delete(key);
        this.callbacks.delete(entry.revision);
        this.lastError = null;
        this.notify();
      }
    })
      .catch(error => {
        this.report(error);
      })
      .finally(() => {
        this.running.delete(key);
      });
    this.running.set(key, operation);
    return operation;
  }
  close() {
    this.closed = true;
    for (const entry of Array.from(this.pending.values()))
      if (entry.timer) clearTimeout(entry.timer);
  }
  payload(key: string): any {
    try {
      return this.state().get(key)?.payload;
    } catch (error) {
      this.report(error);
      return undefined;
    }
  }
  entries() {
    try {
      return Array.from(this.state().entries()).map(
        ([key, entry]) => [key, entry.payload] as const
      );
    } catch (error) {
      this.report(error);
      return [];
    }
  }
  async flush() {
    try {
      await Promise.all(
        Array.from(this.state().keys()).map(key => this.flushKey(key))
      );
    } catch (error) {
      this.report(error);
    }
  }
  count() {
    try {
      return this.state().size;
    } catch {
      return 1;
    }
  }
  error() {
    return this.lastError;
  }
  exportSaved() {
    if (!this.persistence) return {};
    const { storage, key } = this.persistence;
    const keys = [key, ...storedKeys(storage, `${key}:`)];
    return Object.fromEntries(
      keys.flatMap(sourceKey => {
        const raw = storage.getItem(sourceKey);
        return raw === null ? [] : [[sourceKey, raw]];
      })
    );
  }
}
export function fireAlarmDraftKey(
  userId: number,
  companyId: number | null,
  jobId: number
) {
  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    (companyId !== null &&
      (!Number.isSafeInteger(companyId) || companyId <= 0)) ||
    !Number.isSafeInteger(jobId) ||
    jobId <= 0
  )
    throw new Error("Draft account, company and job must be resolved");
  return `inspectra_fire_alarm_drafts:${userId}:${companyId ?? "none"}:${jobId}`;
}
export function pendingFireAlarmDraftCount(
  key: string,
  storage: DraftStorage = localStorage
) {
  return new PendingSaves({ key, storage, send: async () => {} }).count();
}
