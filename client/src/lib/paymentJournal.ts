export type PaymentJournal = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
/** A strict IndexedDB commit must finish before a financial request is sent. */
export function createPaymentJournal(): PaymentJournal {
  let opening: Promise<IDBDatabase> | undefined;
  const open = () => opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("inspectra-payment-journal", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("operations");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Payment journal unavailable"));
    request.onblocked = () => reject(new Error("Payment journal upgrade is blocked"));
  });
  async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const database = await open();
    return new Promise((resolve, reject) => {
      const tx = database.transaction("operations", mode, { durability: "strict" });
      const request = action(tx.objectStore("operations"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error("Payment journal commit failed"));
      tx.onerror = () => reject(tx.error ?? new Error("Payment journal write failed"));
    });
  }
  return {
    getItem: async key => await transaction("readonly", store => store.get(key)) ?? null,
    setItem: async (key, value) => { await transaction("readwrite", store => store.put(value, key)); },
    removeItem: async key => { await transaction("readwrite", store => store.delete(key)); },
  };
}
