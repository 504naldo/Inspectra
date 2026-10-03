export type PaymentInput = { id: number; requestId: string; amountPaid: number; paidAt?: string };
/** Persist before dispatch. Only a matching server receipt releases the next operation. */
export class PaymentOperation {
  private flight?: Promise<unknown>;
  constructor(private key: string, private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}
  pending(): PaymentInput | null {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || !Number.isInteger(value.id) || typeof value.requestId !== 'string' || !Number.isFinite(value.amountPaid) || value.amountPaid <= 0)
      throw new Error('Saved payment needs manual reconciliation');
    return value;
  }
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks)
      return navigator.locks.request(this.key, fn);
    if (typeof window !== 'undefined') throw new Error('This browser cannot safely coordinate payments. Use a supported browser.');
    return fn(); // Node test runner; production browsers require Web Locks.
  }
  private acknowledge(requestId: string) {
    const current = this.pending();
    if (current?.requestId === requestId) this.storage.setItem(this.key, JSON.stringify({ ...current, acknowledged: true }));
  }
  async beginNext(lookup: (input: PaymentInput) => Promise<unknown | null>) {
    return this.exclusive(async () => {
      const previous = this.pending();
      if (previous && !await lookup(previous)) throw new Error('Previous payment must be reconciled before another operation');
      if (previous && this.pending()?.requestId === previous.requestId) this.storage.removeItem(this.key);
    });
  }
  async reconcile(lookup: (input: PaymentInput) => Promise<unknown | null>) {
    return this.exclusive(async () => {
      const operation = this.pending();
      if (!operation) return null;
      const receipt = await lookup(operation);
      if (receipt) this.acknowledge(operation.requestId);
      return receipt;
    });
  }

  submit(input: Omit<PaymentInput, 'requestId'>, send: (input: PaymentInput) => Promise<unknown>): Promise<unknown> {
    if (this.flight) return this.flight;
    this.flight = this.exclusive(async () => {
      const pending = this.pending();
      if (pending && (pending.id !== input.id || pending.amountPaid !== input.amountPaid || pending.paidAt !== input.paidAt))
        throw new Error('Reconcile the pending payment before recording another');
      const operation = pending ?? { ...input, requestId: crypto.randomUUID() };
      this.storage.setItem(this.key, JSON.stringify(operation));
      const result = await send(operation);
      this.acknowledge(operation.requestId);
      return result;
    }).finally(() => { this.flight = undefined; });
    return this.flight;
  }
}
