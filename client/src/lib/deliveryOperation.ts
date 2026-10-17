import type { PaymentJournal } from "./paymentJournal";
import { z } from "zod";

export type DeliveryScope = {
  accountId: number;
  accountCompanyId: number | null;
  companyId: number;
  route: "repairQuote.send" | "quote.send" | "invoice.send" | "gmail.sendReport";
  entityId: number;
};
export type DeliveryPayload = { id: number; to: string[] };
export type ReportDeliveryPayload = DeliveryPayload & {
  jobId: number;
  reportId: number;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  body: string;
};
export type DeliveryInput<P extends DeliveryPayload = DeliveryPayload> = P & { requestId: string };
export type DeliveryReceipt = {
  requestId: string;
  status: "sending" | "accepted" | "rejected" | "unknown";
  providerMessageId: string | null;
};
export type SavedDelivery<P extends DeliveryPayload = DeliveryPayload> = {
  version: 1;
  scope: string;
  input: DeliveryInput<P>;
  status: "pending" | DeliveryReceipt["status"];
};
type AcceptedDelivery = { acceptance: "accepted" };
type Lookup = (requestId: string) => Promise<DeliveryReceipt | null>;
export type DeliveryLock = <T>(key: string, action: () => Promise<T>) => Promise<T>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailAddress = z.string().email();
const payloadFields = (payload: DeliveryPayload) => Object.fromEntries(
  Object.entries(payload).filter(([key]) => key !== "requestId").sort(([a], [b]) => a.localeCompare(b)),
);
const samePayload = (a: DeliveryPayload, b: DeliveryPayload) =>
  JSON.stringify(payloadFields(a)) === JSON.stringify(payloadFields(b));
const copyPayload = <P extends DeliveryPayload>(payload: P): P => structuredClone(payloadFields(payload)) as P;

async function browserLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks)
    return Promise.reject(new Error("This browser cannot safely coordinate email sends. Use a browser with Web Locks support."));
  return await navigator.locks.request(key, action);
}

/** The strict journal commit and cross-tab lock precede every email request. */
export class DeliveryOperation<P extends DeliveryPayload = DeliveryPayload> {
  readonly key: string;
  private flight?: { payload: P; requestId?: string; promise: Promise<AcceptedDelivery> };

  constructor(
    private scope: DeliveryScope,
    private journal: PaymentJournal,
    private exclusive: DeliveryLock = browserLock,
  ) {
    this.key = `inspectra-email-delivery:v1:${scope.accountId}:${scope.accountCompanyId ?? "platform"}:${scope.companyId}:${scope.route}:${scope.entityId}`;
  }

  private validPayload(input: DeliveryPayload): boolean {
    if (!input || input.id !== this.scope.entityId || !Array.isArray(input.to) || input.to.length === 0 ||
      !input.to.every(to => emailAddress.safeParse(to).success)) return false;
    const keys = Object.keys(input).filter(key => key !== "requestId");
    if (this.scope.route !== "gmail.sendReport") return keys.every(key => ["id", "to"].includes(key));
    const report = input as ReportDeliveryPayload;
    return keys.every(key => ["id", "to", "jobId", "reportId", "recipientEmail", "recipientName", "subject", "body"].includes(key)) &&
      Number.isInteger(report.jobId) && report.jobId > 0 && report.reportId === this.scope.entityId &&
      report.to.length === 1 && report.recipientEmail === report.to[0] &&
      (report.recipientName === undefined || (typeof report.recipientName === "string" && !/[\r\n]/.test(report.recipientName))) &&
      typeof report.subject === "string" && report.subject.length > 0 && !/[\r\n]/.test(report.subject) &&
      typeof report.body === "string" && report.body.length > 0;
  }

  private async load(): Promise<SavedDelivery<P> | null> {
    const raw = await this.journal.getItem(this.key);
    if (raw === null) return null;
    const value = JSON.parse(raw) as SavedDelivery<P>;
    if (value?.version !== 1 || value.scope !== this.key || !this.validPayload(value.input) ||
      !UUID.test(value.input?.requestId ?? "") ||
      !["pending", "sending", "accepted", "rejected", "unknown"].includes(value.status))
      throw new Error("Saved email needs reconciliation before sending another email.");
    return value;
  }

  private async persist(operation: SavedDelivery<P>) {
    await this.journal.setItem(this.key, JSON.stringify(operation));
  }

  restore(): Promise<SavedDelivery<P> | null> {
    return this.exclusive(this.key, () => this.load());
  }

  async reconcile(lookup: Lookup, applyAccepted?: (input: DeliveryInput<P>) => Promise<AcceptedDelivery>): Promise<SavedDelivery<P> | null> {
    return this.exclusive(this.key, async () => {
      const previous = await this.load();
      if (!previous) return null;
      const receipt = await lookup(previous.input.requestId);
      if (!receipt) return previous;
      if (receipt.requestId !== previous.input.requestId)
        throw new Error("The email status does not match the saved request.");
      const current = { ...previous, status: receipt.status };
      await this.persist(current);
      // The same identity lets the server finish a failed quote-state update
      // from its accepted receipt without contacting the email provider again.
      if (receipt.status === "accepted" && applyAccepted) {
        const result = await applyAccepted(structuredClone(current.input));
        if (result.acceptance !== "accepted")
          throw new Error("The provider accepted the email, but the document status could not be confirmed. Check email status again.");
      }
      return current;
    });
  }

  /** Clearing an identity is always deliberate and requires fresh server evidence. */
  async startAnother(requestId: string, lookup: Lookup): Promise<void> {
    return this.exclusive(this.key, async () => {
      const previous = await this.load();
      if (!previous || previous.input.requestId !== requestId)
        throw new Error("The saved email changed. Reopen the send dialog before continuing.");
      const receipt = await lookup(requestId);
      if (receipt?.requestId !== requestId || !["accepted", "rejected"].includes(receipt.status))
        throw new Error("Check the original email status before starting another email. Its outcome is still unconfirmed.");
      await this.journal.removeItem(this.key);
    });
  }

  submit(payload: P, send: (input: DeliveryInput<P>) => Promise<AcceptedDelivery>, expectedRequestId?: string): Promise<AcceptedDelivery> {
    if (this.flight) {
      if (!samePayload(this.flight.payload, payload) || this.flight.requestId !== expectedRequestId)
        return Promise.reject(new Error("Retry the original saved recipients before starting another email."));
      return this.flight.promise;
    }
    // Copy before yielding so recipient edits cannot change the payload being committed.
    const immutable = copyPayload(payload);
    const promise = this.exclusive(this.key, async () => {
      if (!this.validPayload(immutable))
        throw new Error("Review this email's recipients and content before sending.");
      const previous = await this.load();
      if (expectedRequestId !== undefined && previous?.input.requestId !== expectedRequestId)
        throw new Error("The saved email changed. Reopen the send dialog before retrying.");
      if (expectedRequestId === undefined && previous)
        throw new Error("An email is already saved. Reopen the dialog to retry the original saved recipients or explicitly start another email.");
      if (previous && !samePayload(previous.input, immutable))
        throw new Error("Retry the original saved recipients before starting another email.");
      if (previous?.status === "accepted" || previous?.status === "rejected")
        throw new Error("Start another email explicitly before creating a new send.");
      const operation: SavedDelivery<P> = previous ?? {
        version: 1,
        scope: this.key,
        input: { ...immutable, requestId: crypto.randomUUID() },
        status: "pending",
      };
      await this.persist(operation);
      const result = await send(structuredClone(operation.input));
      if (result.acceptance !== "accepted")
        throw new Error("Email acceptance was not confirmed. Check the original email status.");
      await this.persist({ ...operation, status: "accepted" });
      return result;
    }).finally(() => { this.flight = undefined; });
    this.flight = { payload: immutable, requestId: expectedRequestId, promise };
    return promise;
  }
}
