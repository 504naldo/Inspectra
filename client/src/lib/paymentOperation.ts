import type { PaymentJournal } from "./paymentJournal";
export type PaymentInput = { id: number; requestId: string; amountPaid: number; paidAt?: string };
/** Persist before dispatch. Only a matching server receipt releases the next operation. */
export class PaymentOperation {
  private flight?: Promise<unknown>;
  constructor(private key: string, private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, private journal?: PaymentJournal) {}
  pending(): PaymentInput | null {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || !Number.isInteger(value.id) || typeof value.requestId !== 'string' || !Number.isFinite(value.amountPaid) || value.amountPaid <= 0)
      throw new Error('Saved payment needs manual reconciliation');
    return value;
  }
  async restore() {
    return this.exclusive(() => this.load());
  }
  private async load() {
    if (!this.journal) return;
    const durable = await this.journal.getItem(this.key);
    if (durable != null) this.storage.setItem(this.key, durable);
    else {
      const legacy = this.storage.getItem(this.key);
      if (legacy != null) {
        this.pending(); // Preserve invalid legacy data; do not send it.
        await this.journal.setItem(this.key, legacy);
      }
    }
  }
  private async persist(value: string) {
    if (this.journal) await this.journal.setItem(this.key, value);
    this.storage.setItem(this.key, value);
  }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks)
      return navigator.locks.request(this.key, fn);
    if (typeof window !== 'undefined') throw new Error('This browser cannot safely coordinate payments. Use a supported browser.');
    return fn(); // Node test runner; production browsers require Web Locks.
  }
  private async acknowledge(requestId: string) {
    const current = this.pending();
    if (current?.requestId === requestId) await this.persist(JSON.stringify({ ...current, acknowledged: true }));
  }
  async beginNext(lookup: (input: PaymentInput) => Promise<unknown | null>) {
    return this.exclusive(async () => {
      await this.load();
      const previous = this.pending();
      if (previous && !await lookup(previous)) throw new Error('Previous payment must be reconciled before another operation');
      if (previous && this.pending()?.requestId === previous.requestId) {
        if (this.journal) await this.journal.removeItem(this.key);
        this.storage.removeItem(this.key);
      }
    });
  }
  async reconcile(lookup: (input: PaymentInput) => Promise<unknown | null>) {
    return this.exclusive(async () => {
      await this.load();
      const operation = this.pending();
      if (!operation) return null;
      const receipt = await lookup(operation);
      if (receipt) await this.acknowledge(operation.requestId);
      return receipt;
    });
  }

  submit(input: Omit<PaymentInput, 'requestId'>, send: (input: PaymentInput) => Promise<unknown>): Promise<unknown> {
    if (this.flight) return this.flight;
    this.flight = this.exclusive(async () => {
      await this.load();
      const pending = this.pending();
      if (pending && (pending.id !== input.id || pending.amountPaid !== input.amountPaid || pending.paidAt !== input.paidAt))
        throw new Error('Reconcile the pending payment before recording another');
      const operation = pending ?? { ...input, requestId: crypto.randomUUID() };
      await this.persist(JSON.stringify(operation));
      const result = await send(operation);
      await this.acknowledge(operation.requestId);
      return result;
    }).finally(() => { this.flight = undefined; });
    return this.flight;
  }
}
