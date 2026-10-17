import { afterEach, expect, it, vi } from "vitest";
import { DeliveryOperation, type DeliveryLock, type DeliveryScope, type DeliveryInput, type ReportDeliveryPayload } from "./deliveryOperation";
import type { PaymentJournal } from "./paymentJournal";

const scope: DeliveryScope = { accountId: 1, accountCompanyId: 2, companyId: 2, route: "repairQuote.send", entityId: 3 };
const input = { id: 3, to: ["first@example.com", "second@example.com"] };
const accepted = { acceptance: "accepted" as const };
function journal() {
  const records = new Map<string, string>();
  return {
    records,
    getItem: async (key: string) => records.get(key) ?? null,
    setItem: async (key: string, value: string) => { records.set(key, value); },
    removeItem: async (key: string) => { records.delete(key); },
  };
}
function locks(): DeliveryLock {
  const tails = new Map<string, Promise<unknown>>();
  return (key, action) => {
    const next = (tails.get(key) ?? Promise.resolve()).then(action);
    tails.set(key, next.catch(() => {}));
    return next;
  };
}
const receipt = (requestId: string, status: "accepted" | "rejected" | "sending" | "unknown" = "accepted") =>
  ({ requestId, status, providerMessageId: status === "accepted" ? "provider-id" : null });
afterEach(() => vi.unstubAllGlobals());

it("retains the exact recipients and UUID after response loss and reload", async () => {
  const disk = journal(), lock = locks(), first = new DeliveryOperation(scope, disk, lock);
  let dispatched!: DeliveryInput;
  await expect(first.submit(input, async value => { dispatched = value; throw Error("lost response"); })).rejects.toThrow("lost response");
  const reopened = new DeliveryOperation(scope, disk, lock);
  expect((await reopened.restore())?.input).toEqual(dispatched);
  const changed = vi.fn();
  await expect(reopened.submit({ ...input, to: ["other@example.com"] }, changed)).rejects.toThrow(/original saved recipients/);
  await expect(reopened.submit({ ...input, to: [...input.to].reverse() }, changed)).rejects.toThrow(/original saved recipients/);
  expect(changed).not.toHaveBeenCalled();
  const retry = vi.fn(async value => { expect(value).toEqual(dispatched); return accepted; });
  await reopened.submit(input, retry, dispatched.requestId);
  expect((await reopened.restore())?.status).toBe("accepted");
});

it("commits before dispatch, coalesces duplicate clicks, and rejects a different concurrent payload", async () => {
  const disk = journal(), lock = locks();
  let commit!: () => void;
  const strict: PaymentJournal = { ...disk, setItem: async (key, value) => { await new Promise<void>(resolve => { commit = resolve; }); await disk.setItem(key, value); } };
  const operation = new DeliveryOperation(scope, strict, lock);
  const send = vi.fn(async () => { throw Error("offline"); });
  const first = operation.submit(input, send);
  const second = operation.submit(input, send);
  expect(first).toBe(second);
  await expect(operation.submit({ ...input, to: ["changed@example.com"] }, send)).rejects.toThrow(/original/);
  await vi.waitFor(() => expect(commit).toBeTypeOf("function"));
  expect(send).not.toHaveBeenCalled();
  const outcome = expect(first).rejects.toThrow("offline");
  commit();
  await outcome;
  expect(send).toHaveBeenCalledTimes(1);
});

it("copies recipients before awaiting storage so edits cannot alter the saved request", async () => {
  const disk = journal(), operation = new DeliveryOperation(scope, disk, locks()), mutable = { ...input, to: [...input.to] };
  const result = operation.submit(mutable, async value => { expect(value.to).toEqual(input.to); throw Error("lost"); });
  mutable.to.push("later@example.com");
  await expect(result).rejects.toThrow("lost");
  expect((await operation.restore())?.input.to).toEqual(input.to);
});

it("coordinates separate tabs and keeps provider acceptance saved until an explicit new email", async () => {
  const disk = journal(), lock = locks(), a = new DeliveryOperation(scope, disk, lock), b = new DeliveryOperation(scope, disk, lock);
  const send = vi.fn(async () => accepted);
  const results = await Promise.allSettled([a.submit(input, send), b.submit(input, send)]);
  expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
  expect(send).toHaveBeenCalledTimes(1);
  const saved = (await b.restore())!;
  expect(saved.status).toBe("accepted");
  await expect(b.submit(input, send)).rejects.toThrow(/explicitly/);
  await b.startAnother(saved.input.requestId, async requestId => receipt(requestId));
  await b.submit(input, send);
  expect((await b.restore())?.input.requestId).not.toBe(saved.input.requestId);
});

it("reconciles an accepted lost response without dispatching another provider request", async () => {
  const disk = journal(), operation = new DeliveryOperation(scope, disk, locks()), send = vi.fn(async () => { throw Error("lost"); });
  await expect(operation.submit(input, send)).rejects.toThrow();
  const saved = (await operation.restore())!;
  expect((await operation.reconcile(async requestId => receipt(requestId)))?.status).toBe("accepted");
  expect((await operation.restore())?.input.requestId).toBe(saved.input.requestId);
  expect(send).toHaveBeenCalledTimes(1);
});

it("replays the original accepted identity for quote-state recovery and preserves acceptance if recovery fails", async () => {
  const disk = journal(), operation = new DeliveryOperation(scope, disk, locks());
  await expect(operation.submit(input, async () => { throw Error("state write failed after acceptance"); })).rejects.toThrow();
  const original = (await operation.restore())!;
  const lookup = async (requestId: string) => receipt(requestId);
  const failedApply = vi.fn(async value => {
    expect(value).toEqual(original.input);
    // Inspect durable storage without taking the lock already held by reconcile.
    expect(JSON.parse(disk.records.get(operation.key)!).status).toBe("accepted");
    throw Error("quote state unavailable");
  });
  await expect(operation.reconcile(lookup, failedApply)).rejects.toThrow("quote state unavailable");
  expect((await operation.restore())?.status).toBe("accepted");
  const apply = vi.fn(async value => { expect(value).toEqual(original.input); return accepted; });
  await operation.reconcile(lookup, apply);
  expect(apply).toHaveBeenCalledTimes(1);
  expect((await operation.restore())?.input).toEqual(original.input);
});

it.each(["sending", "unknown", null] as const)("does not clear an unconfirmed %s operation", async status => {
  const disk = journal(), operation = new DeliveryOperation(scope, disk, locks());
  await expect(operation.submit(input, async () => { throw Error("lost"); })).rejects.toThrow();
  const original = (await operation.restore())!;
  const lookup = async (requestId: string) => status ? receipt(requestId, status) : null;
  await operation.reconcile(lookup);
  await expect(operation.startAnother(original.input.requestId, lookup)).rejects.toThrow(/unconfirmed/);
  expect((await operation.restore())?.input).toEqual(original.input);
});

it("requires fresh server evidence even after a locally saved acceptance", async () => {
  const disk = journal(), operation = new DeliveryOperation(scope, disk, locks());
  await operation.submit(input, async () => accepted);
  const original = (await operation.restore())!;
  await expect(operation.startAnother(original.input.requestId, async () => null)).rejects.toThrow(/unconfirmed/);
  expect((await operation.restore())?.input).toEqual(original.input);
});

it("permits a deliberate new email after a confirmed rejection", async () => {
  const disk = journal(), operation = new DeliveryOperation(scope, disk, locks());
  await expect(operation.submit(input, async () => { throw Error("rejected"); })).rejects.toThrow();
  const original = (await operation.restore())!;
  const rejected = async (requestId: string) => receipt(requestId, "rejected");
  expect((await operation.reconcile(rejected))?.status).toBe("rejected");
  await expect(operation.submit(input, vi.fn())).rejects.toThrow(/explicitly/);
  await operation.startAnother(original.input.requestId, rejected);
  expect(await operation.restore()).toBeNull();
});

it("a stale tab cannot clear the newer email identity", async () => {
  const disk = journal(), lock = locks(), a = new DeliveryOperation(scope, disk, lock), b = new DeliveryOperation(scope, disk, lock);
  await a.submit(input, async () => accepted);
  const original = (await a.restore())!;
  await b.startAnother(original.input.requestId, async requestId => receipt(requestId));
  await b.submit(input, async () => accepted);
  const next = await b.restore();
  await expect(a.startAnother(original.input.requestId, vi.fn())).rejects.toThrow(/changed/);
  expect(await b.restore()).toEqual(next);
});

it("a stale retry cannot allocate a new identity after another tab clears or replaces its email", async () => {
  const disk = journal(), lock = locks(), stale = new DeliveryOperation(scope, disk, lock), other = new DeliveryOperation(scope, disk, lock);
  await expect(stale.submit(input, async () => { throw Error("lost"); })).rejects.toThrow();
  const original = (await stale.restore())!;
  await other.reconcile(async requestId => receipt(requestId));
  await other.startAnother(original.input.requestId, async requestId => receipt(requestId));
  const send = vi.fn(async () => accepted);
  await expect(stale.submit(input, send, original.input.requestId)).rejects.toThrow(/saved email changed/);
  expect(await other.restore()).toBeNull();
  await other.submit(input, async () => accepted);
  const next = await other.restore();
  await expect(stale.submit(input, send, original.input.requestId)).rejects.toThrow(/saved email changed/);
  expect(send).not.toHaveBeenCalled();
  expect(await other.restore()).toEqual(next);
});

it("a fresh dialog does not adopt another tab's pending identity before explicitly recovering it", async () => {
  const disk = journal(), lock = locks(), first = new DeliveryOperation(scope, disk, lock), other = new DeliveryOperation(scope, disk, lock);
  await expect(first.submit(input, async () => { throw Error("lost"); })).rejects.toThrow();
  const original = (await first.restore())!;
  const send = vi.fn(async () => accepted);
  await expect(other.submit(input, send)).rejects.toThrow(/already saved/);
  expect(send).not.toHaveBeenCalled();
  await other.submit(input, send, original.input.requestId);
  expect((await other.restore())?.input).toEqual(original.input);
});

it("storage read and commit failures block dispatch and preserve the original record", async () => {
  const disk = journal(), lock = locks(), send = vi.fn(async () => accepted);
  const readFailure = new DeliveryOperation(scope, { ...disk, getItem: async () => { throw Error("disk read"); } }, lock);
  await expect(readFailure.submit(input, send)).rejects.toThrow("disk read");
  const writeFailure = new DeliveryOperation(scope, { ...disk, setItem: async () => { throw Error("strict commit"); } }, lock);
  await expect(writeFailure.submit(input, send)).rejects.toThrow("strict commit");
  expect(send).not.toHaveBeenCalled();
  const operation = new DeliveryOperation(scope, disk, lock);
  disk.records.set(operation.key, "corrupt");
  await expect(operation.restore()).rejects.toThrow();
  await expect(operation.submit(input, send)).rejects.toThrow();
  expect(disk.records.get(operation.key)).toBe("corrupt");
  expect(send).not.toHaveBeenCalled();
});

it("fails closed when Web Locks are unavailable", async () => {
  vi.stubGlobal("navigator", {});
  const send = vi.fn();
  await expect(new DeliveryOperation(scope, journal()).submit(input, send)).rejects.toThrow(/Web Locks/);
  expect(send).not.toHaveBeenCalled();
});

it.each([
  { accountId: 7 }, { accountCompanyId: 7 }, { companyId: 7 }, { route: "quote.send" as const }, { entityId: 7 },
])("isolates the journal by authenticated account, account company, quote company, route and entity (%o)", async changed => {
  const disk = journal(), lock = locks(), operation = new DeliveryOperation(scope, disk, lock);
  await expect(operation.submit(input, async () => { throw Error("lost"); })).rejects.toThrow();
  const other = new DeliveryOperation({ ...scope, ...changed }, disk, lock);
  expect(await other.restore()).toBeNull();
  disk.records.set(other.key, disk.records.get(operation.key)!);
  await expect(other.restore()).rejects.toThrow(/reconciliation/);
});

it("does not acknowledge or clear a mismatched server receipt", async () => {
  const disk = journal(), operation = new DeliveryOperation(scope, disk, locks());
  await expect(operation.submit(input, async () => { throw Error("lost"); })).rejects.toThrow();
  const original = await operation.restore();
  await expect(operation.reconcile(async () => receipt(crypto.randomUUID()))).rejects.toThrow(/does not match/);
  await expect(operation.startAnother(original!.input.requestId, async () => receipt(crypto.randomUUID()))).rejects.toThrow(/unconfirmed/);
  expect(await operation.restore()).toEqual(original);
});

const reportScope: DeliveryScope = { ...scope, route: "gmail.sendReport" };
const reportPayload: ReportDeliveryPayload = { id: 3, to: ["client@example.com"], reportId: 3, jobId: 9,
  recipientEmail: "client@example.com", recipientName: "Client", subject: "Inspection report", body: "The complete original message.\nSecond line." };

it("persists the complete Gmail message and replays accepted metadata recovery after reload", async () => {
  const disk = journal(), lock = locks();
  let dispatched!: DeliveryInput<ReportDeliveryPayload>;
  await expect(new DeliveryOperation<ReportDeliveryPayload>(reportScope, disk, lock).submit(reportPayload, async input => {
    dispatched = input; throw Error("Report status write failed");
  })).rejects.toThrow();
  const reopened = new DeliveryOperation<ReportDeliveryPayload>(reportScope, disk, lock);
  expect((await reopened.restore())?.input).toEqual(dispatched);
  const apply = vi.fn(async input => { expect(input).toEqual(dispatched); return accepted; });
  await reopened.reconcile(async requestId => receipt(requestId), apply);
  expect(apply).toHaveBeenCalledTimes(1);
  expect((await reopened.restore())?.input).toEqual(dispatched);
  expect((await reopened.restore())?.status).toBe("accepted");
});

it.each([
  { subject: "Changed subject" }, { body: "Changed body" }, { jobId: 10 },
  { recipientName: "Another client" },
  { to: ["other@example.com"], recipientEmail: "other@example.com" },
])("does not reuse a Gmail identity for a changed full payload (%o)", async changed => {
  const operation = new DeliveryOperation<ReportDeliveryPayload>(reportScope, journal(), locks());
  await expect(operation.submit(reportPayload, async () => { throw Error("lost response"); })).rejects.toThrow();
  const saved = (await operation.restore())!;
  const send = vi.fn(async () => accepted);
  await expect(operation.submit({ ...reportPayload, ...changed }, send, saved.input.requestId)).rejects.toThrow(/original/);
  expect(send).not.toHaveBeenCalled();
  expect((await operation.restore())?.input).toEqual(saved.input);
});

it("copies all Gmail payload fields before dispatch and guards against callback mutation", async () => {
  const operation = new DeliveryOperation<ReportDeliveryPayload>(reportScope, journal(), locks());
  const mutable = structuredClone(reportPayload);
  const submitting = operation.submit(mutable, async input => {
    input.body = "Provider callback changed this"; input.to.push("extra@example.com"); throw Error("lost");
  });
  mutable.subject = "Caller edited this";
  await expect(submitting).rejects.toThrow();
  const saved = (await operation.restore())!;
  const { requestId: _requestId, ...payload } = saved.input;
  expect(payload).toEqual(reportPayload);
});

it("rejects an incomplete or mismatched persisted Gmail document without replacing it", async () => {
  const disk = journal(), operation = new DeliveryOperation<ReportDeliveryPayload>(reportScope, disk, locks());
  await expect(operation.submit(reportPayload, async () => { throw Error("lost"); })).rejects.toThrow();
  const saved = JSON.parse(disk.records.get(operation.key)!);
  saved.input.reportId = 999;
  const corrupt = JSON.stringify(saved);
  disk.records.set(operation.key, corrupt);
  await expect(operation.restore()).rejects.toThrow(/reconciliation/);
  const send = vi.fn();
  await expect(operation.submit(reportPayload, send)).rejects.toThrow(/reconciliation/);
  expect(send).not.toHaveBeenCalled();
  expect(disk.records.get(operation.key)).toBe(corrupt);
});

it("keeps invoice attempts across reload and requires fresh proof before a new email", async () => {
  const invoiceScope: DeliveryScope = { ...scope, route: "invoice.send" };
  const disk = journal(), lock = locks(), first = new DeliveryOperation(invoiceScope, disk, lock);
  await expect(first.submit(input, async () => { throw Error("lost response"); })).rejects.toThrow();
  const reopened = new DeliveryOperation(invoiceScope, disk, lock), saved = (await reopened.restore())!;
  await reopened.reconcile(async requestId => receipt(requestId));
  await expect(reopened.startAnother(saved.input.requestId, async () => null)).rejects.toThrow(/unconfirmed/);
  expect((await reopened.restore())?.input).toEqual(saved.input);
  expect(await new DeliveryOperation({ ...invoiceScope, accountId: 99 }, disk, lock).restore()).toBeNull();
});

it.each([
  { to: ["invalid"], recipientEmail: "invalid" }, { subject: "Header\r\nInjected: value" },
  { recipientName: "Client\nInjected" }, { body: "" },
])("does not allocate an unrecoverable identity for invalid Gmail input (%o)", async changed => {
  const disk = journal(), operation = new DeliveryOperation<ReportDeliveryPayload>(reportScope, disk, locks());
  const send = vi.fn();
  await expect(operation.submit({ ...reportPayload, ...changed }, send)).rejects.toThrow(/Review/);
  expect(send).not.toHaveBeenCalled();
  expect(await operation.restore()).toBeNull();
});
