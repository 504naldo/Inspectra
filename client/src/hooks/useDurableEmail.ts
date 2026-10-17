import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { createPaymentJournal } from "@/lib/paymentJournal";
import {
  DeliveryOperation, type DeliveryInput, type DeliveryPayload, type DeliveryReceipt,
  type DeliveryScope, type SavedDelivery,
} from "@/lib/deliveryOperation";

/** Restoring a dialog reads its journal; only deliberate user actions can send. */
export function useDurableEmail<P extends DeliveryPayload>({ open, scope, onSend, lookup, onAccepted }: {
  open: boolean;
  scope: DeliveryScope | null;
  onSend: (input: DeliveryInput<P>) => Promise<{ acceptance: "accepted" }>;
  lookup: (requestId: string) => Promise<DeliveryReceipt | null>;
  onAccepted: () => void;
}) {
  const operation = useMemo(() => scope ? new DeliveryOperation<P>(scope, createPaymentJournal()) : null,
    [scope?.accountId, scope?.accountCompanyId, scope?.companyId, scope?.route, scope?.entityId]);
  const active = useRef(operation);
  const generation = useRef(0);
  const running = useRef<{ operation: DeliveryOperation<P>; generation: number } | null>(null);
  const [saved, setSaved] = useState<SavedDelivery<P> | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useLayoutEffect(() => {
    generation.current++;
    active.current = open ? operation : null;
    running.current = null;
    return () => { generation.current++; active.current = null; };
  }, [open, operation]);
  useEffect(() => {
    let current = true;
    setSaved(null); setError(null); setRestoring(true); setBusy(false);
    if (!open) return () => { current = false; };
    if (!operation) {
      setError("Sign in before sending an email."); setRestoring(false);
      return () => { current = false; };
    }
    operation.restore().then(value => {
      if (current) setSaved(value);
    }).catch(reason => {
      if (current) setError(reason instanceof Error ? reason.message : "Unable to recover the saved email.");
    }).finally(() => { if (current) setRestoring(false); });
    return () => { current = false; };
  }, [open, operation]);

  const run = async (action: (current: DeliveryOperation<P>, assertCurrent: () => void) => Promise<void>) => {
    if (!operation || restoring || running.current || active.current !== operation) return;
    const current = { operation, generation: generation.current };
    const isCurrent = () => active.current === operation && generation.current === current.generation;
    const assertCurrent = () => {
      if (!isCurrent()) throw new Error("The account, document, or email dialog changed. Reopen its email dialog.");
    };
    running.current = current; setBusy(true); setError(null);
    try { await action(operation, assertCurrent); }
    catch (reason) {
      if (isCurrent()) setError(reason instanceof Error ? reason.message : "Unable to confirm this email.");
    } finally {
      try {
        const value = await operation.restore();
        if (isCurrent()) setSaved(value);
      } catch (reason) {
        if (isCurrent()) setError(reason instanceof Error ? reason.message : "Unable to recover the saved email.");
      }
      if (running.current === current) running.current = null;
      if (isCurrent()) setBusy(false);
    }
  };
  const send = (payload: P) => run(async (current, assertCurrent) => {
    await current.submit(saved?.input ?? payload, input => { assertCurrent(); return onSend(input); }, saved?.input.requestId);
    assertCurrent(); onAccepted(); toast.success("Email provider accepted this email");
  });
  const checkStatus = () => run(async (current, assertCurrent) => {
    const value = await current.reconcile(async requestId => {
      assertCurrent(); const receipt = await lookup(requestId); assertCurrent(); return receipt;
    }, input => { assertCurrent(); return onSend(input); });
    if (value?.status === "accepted") { assertCurrent(); onAccepted(); }
  });
  const startAnother = () => run(async (current, assertCurrent) => {
    if (!saved) return;
    await current.startAnother(saved.input.requestId, async requestId => {
      assertCurrent(); const receipt = await lookup(requestId); assertCurrent(); return receipt;
    });
  });
  return { saved, restoring, working: busy || restoring, error, ready: !!operation,
    accepted: saved?.status === "accepted",
    canStartAnother: saved?.status === "accepted" || saved?.status === "rejected",
    send, checkStatus, startAnother };
}
