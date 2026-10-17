import type { TRPCLink, Operation } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import { ACCOUNT_CHANGED_MESSAGE, EXPECTED_ACCOUNT_HEADER, expectedAccount, sameExpectedAccount,
  serializeExpectedAccount, type ExpectedAccount } from "@shared/accountBinding";

const CAPTURED_ACCOUNT = "inspectra.expectedAccount.v1";

export function captureOperationAccount<T extends Pick<Operation, "context">>(op: T, actor: ExpectedAccount | null): T {
  // Retries and delayed forwarding must retain the actor that originally authorized the operation.
  if (Object.prototype.hasOwnProperty.call(op.context, CAPTURED_ACCOUNT)) return op;
  return { ...op, context: { ...op.context, [CAPTURED_ACCOUNT]: actor } };
}

export function expectedAccountLink<TRouter extends AnyRouter>(user: unknown): TRPCLink<TRouter> {
  const actor = expectedAccount(user);
  return () => ({ op, next }) => next(captureOperationAccount(op, actor));
}

export function expectedAccountHeaders(operations: readonly Pick<Operation, "type" | "context">[]): Record<string, string> {
  if (!operations.length) return {};
  const actors = operations.map(op => expectedAccount(op.context[CAPTURED_ACCOUNT]));
  const actor = actors[0];
  if (actors.some(value => !sameExpectedAccount(actor, value))) throw new Error(ACCOUNT_CHANGED_MESSAGE);
  return actor ? { [EXPECTED_ACCOUNT_HEADER]: serializeExpectedAccount(actor) } : {};
}
