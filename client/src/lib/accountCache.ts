import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { UNAUTHED_ERR_MSG } from "@shared/const";

export const AUTH_ME_QUERY_KEY = [["auth", "me"], { type: "query" }] as const;

type AccountIdentity = { id: number; companyId: number | null; role: string; customerOrgId?: number | null; sessionVersion?: number };
export function accountCacheNamespace(user: AccountIdentity | null): string {
  return user === null ? "signed-out" : JSON.stringify([user.id, user.companyId, user.role, user.customerOrgId ?? null, user.sessionVersion ?? null]);
}

/** Removed requests can still settle; their global error events belong to the old account. */
export function isCurrentCacheEntry<T>(cache: { getAll(): T[] }, entry: T): boolean {
  return cache.getAll().includes(entry);
}

/** Each mounted identity owns a cache. Retired async closures can only touch
 * their own cache and cannot deduplicate against the next account's requests.
 */
export function createAccountDataCache(onUnauthenticated: () => void) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let active = true;
  function report(error: unknown) {
    if (!active) return;
    if (error instanceof TRPCClientError && (error.message === UNAUTHED_ERR_MSG || error.data?.code === "UNAUTHORIZED")) {
      onUnauthenticated();
    }
    console.error("[API Error]", error);
  }
  const unsubscribeQuery = client.getQueryCache().subscribe(event => {
    if (event.type === "updated" && event.action.type === "error" && isCurrentCacheEntry(client.getQueryCache(), event.query)) report(event.query.state.error);
  });
  const unsubscribeMutation = client.getMutationCache().subscribe(event => {
    if (event.type === "updated" && event.action.type === "error" && isCurrentCacheEntry(client.getMutationCache(), event.mutation)) report(event.mutation.state.error);
  });
  return { client, retire: () => {
    active = false;
    unsubscribeQuery();
    unsubscribeMutation();
    return clearAccountDataCache(client);
  } };
}
export function isSessionQuery(query: { queryKey: QueryKey }): boolean {
  const path = query.queryKey[0];
  return Array.isArray(path) && path.length === 2 && path[0] === "auth" && path[1] === "me";
}

/** Stop old observers/results before mounting another account. Durable offline
 * journals are independent of QueryClient and are never removed here.
 */
export async function clearAccountDataCache(client: QueryClient): Promise<void> {
  const predicate = (query: { queryKey: QueryKey }) => !isSessionQuery(query);
  const cancelled = client.cancelQueries({ predicate }, { silent: true });
  // Do all destructive work before yielding: an older reset finishing later
  // must not remove queries mounted by a newer prepared account.
  client.removeQueries({ predicate });
  const mutations = client.getMutationCache();
  for (const mutation of mutations.getAll()) {
    // A running request cannot be unsent. Its old component callbacks must not
    // repopulate shared cache after an account switch or logout.
    mutation.setOptions({ ...mutation.options, onSuccess: undefined, onError: undefined, onSettled: undefined });
  }
  mutations.clear();
  await cancelled;
}
