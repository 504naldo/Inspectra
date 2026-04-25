const QUEUE_KEY = "inspectra_mutation_queue";

export interface QueuedRequest {
  id: string;
  url: string;
  body: string;
  timestamp: number;
}

function load(): QueuedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(items: QueuedRequest[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export const mutationQueue = {
  getAll(): QueuedRequest[] {
    return load();
  },

  count(): number {
    return load().length;
  },

  add(url: string, body: string): void {
    const items = load();
    items.push({ id: crypto.randomUUID(), url, body, timestamp: Date.now() });
    save(items);
  },

  remove(id: string): void {
    save(load().filter((item) => item.id !== id));
  },

  clear(): void {
    localStorage.removeItem(QUEUE_KEY);
  },
};
