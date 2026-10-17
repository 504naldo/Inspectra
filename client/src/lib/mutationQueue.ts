const QUEUE_KEY = "inspectra_mutation_queue";
export interface QueuedRequest {
  id: string;
  url: string;
  body: string;
  timestamp: number;
}
function inspect(): {
  items: QueuedRequest[];
  blocked: number;
  raw: string | null;
} {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (raw === null) return { items: [], blocked: 0, raw };
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { items: [], blocked: 1, raw };
    const items = parsed.filter(
      (item): item is QueuedRequest =>
        !!item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.url === "string" &&
        typeof item.body === "string" &&
        typeof item.timestamp === "number"
    );
    return { items, blocked: parsed.length, raw };
  } catch {
    return { items: [], blocked: 1, raw: null };
  }
}
/** Legacy requests have no trusted operation/account identity. Export for review only. */
export const mutationQueue = {
  getAll: () => inspect().items,
  count: () => inspect().blocked,
  add(_url: string, _body: string): never {
    throw new Error("Use the typed inspection offline capture to save changes");
  },
  remove(_id: string): never {
    throw new Error("Legacy changes must be recovered before removal");
  },
  clear(): never {
    throw new Error("Legacy changes are preserved for recovery");
  },
};
