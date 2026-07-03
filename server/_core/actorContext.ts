/**
 * actorContext.ts — request-scoped "who is calling" context.
 *
 * The tenant guards (server/tenantGuards.ts) and db.assert*Company enforce that
 * a record belongs to a given companyId. Per docs/ROLE_TRUST_MODEL.md, `admin`
 * is a cross-company platform operator, so those checks must be skipped for an
 * admin caller — but the guards are plain functions called as `(id, companyId)`
 * from ~140 sites, with no access to the request's user.
 *
 * Rather than thread the caller's role through every call site (churn + easy to
 * miss one), we stash the actor in an AsyncLocalStorage that a tRPC middleware
 * populates for every authenticated request. The guards read it via
 * `callerIsPlatformOperator()`. AsyncLocalStorage propagates across awaits, so
 * the value is correct for the whole resolver, including nested guard calls.
 *
 * If no actor is set (e.g. a background job or a code path outside a request),
 * `callerIsPlatformOperator()` returns false — i.e. it fails CLOSED, never
 * granting a cross-company bypass by default.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface Actor {
  role: string;
  companyId: number | null;
}

const actorStorage = new AsyncLocalStorage<Actor>();

/** Run `fn` with the given actor bound to the async context. */
export function runWithActor<T>(actor: Actor, fn: () => T): T {
  return actorStorage.run(actor, fn);
}

/** The actor bound to the current async context, if any. */
export function getActor(): Actor | undefined {
  return actorStorage.getStore();
}

/**
 * True when the current caller is the cross-company platform operator (`admin`).
 * Guards use this to skip the company-ownership check. Fails closed: returns
 * false when there is no bound actor.
 */
export function callerIsPlatformOperator(): boolean {
  return actorStorage.getStore()?.role === "admin";
}
