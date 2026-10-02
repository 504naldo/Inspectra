type Entry = {
  timer?: ReturnType<typeof setTimeout>;
  save: () => unknown;
  payload?: unknown;
  version: number;
};
type Persistence = {
  key: string;
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  send: (key: string, payload: any) => Promise<unknown>;
};
/** Per-record saves persist before dispatch and survive unmount, reload and errors. */
export class PendingSaves {
  private pending = new Map<string, Entry>();
  private version = 0;
  private running = new Map<string, Promise<void>>();
  private closed = false;
  private corrupt = false;
  constructor(private persistence?: Persistence) {
    if (!persistence) return;
    try {
      const stored = JSON.parse(
        persistence.storage.getItem(persistence.key) ?? "{}"
      );
      for (const [key, payload] of Object.entries(stored))
        this.pending.set(key, {
          save: () => persistence.send(key, payload),
          payload,
          version: ++this.version,
        });
    } catch {
      this.corrupt = true; /* Keep unreadable data for recovery. */
    }
  }
  schedule(key: string, save: () => unknown, delay: number, payload?: unknown) {
    const previous = this.pending.get(key);
    if (previous?.timer) clearTimeout(previous.timer);
    const entry = { save, payload, version: ++this.version } as Entry;
    this.pending.set(key, entry);
    this.persist(); // A quota/storage error reaches the UI before any request.
    entry.timer = setTimeout(() => {
      void this.flushKey(key);
    }, delay);
  }
  private persist() {
    if (!this.persistence) return;
    if (this.corrupt)
      throw new Error("Stored drafts need recovery before editing");
    const data = Object.fromEntries(
      Array.from(this.pending.entries())
        .filter(([, entry]) => entry.payload !== undefined)
        .map(([key, entry]) => [key, entry.payload])
    );
    this.persistence.storage.setItem(
      this.persistence.key,
      JSON.stringify(data)
    );
    if (typeof window !== "undefined")
      window.dispatchEvent(new Event("inspectra:field-drafts"));
  }
  async flushKey(key: string) {
    if (this.closed) return;
    if (this.running.has(key)) return this.running.get(key);
    const entry = this.pending.get(key);
    if (!entry) return;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    const operation = Promise.resolve()
      .then(() => entry.save())
      .then(() => {
        if (this.pending.get(key)?.version === entry.version) {
          this.pending.delete(key);
          this.persist();
        }
      })
      .catch(() => {
        /* Retain payload; mutation callbacks display the error. */
      })
      .finally(() => {
        this.running.delete(key);
        if (
          !this.closed &&
          this.pending.has(key) &&
          this.pending.get(key)?.version !== entry.version
        )
          void this.flushKey(key);
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
    return this.pending.get(key)?.payload;
  }
  entries() {
    return Array.from(this.pending.entries()).map(
      ([key, entry]) => [key, entry.payload] as const
    );
  }
  async flush() {
    await Promise.all(
      Array.from(this.pending.keys()).map(key => this.flushKey(key))
    );
  }
  count() {
    return this.pending.size;
  }
}
export function fireAlarmDraftKey(
  userId: number,
  companyId: number | null,
  jobId: number
) {
  return `inspectra_fire_alarm_drafts:${userId}:${companyId ?? "none"}:${jobId}`;
}
export function pendingFireAlarmDraftCount(
  key: string,
  storage: Pick<Storage, "getItem"> = localStorage
) {
  try {
    return Object.keys(JSON.parse(storage.getItem(key) ?? "{}")).length;
  } catch {
    return 1;
  }
}
