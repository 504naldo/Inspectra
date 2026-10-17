import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { AUTH_ME_QUERY_KEY, accountCacheNamespace, clearAccountDataCache, createAccountDataCache } from "@/lib/accountCache";
import { createScopedTrpcClient } from "@/lib/createScopedTrpcClient";
import { SessionBoundaryContext, type SessionBoundaryActions } from "./SessionBoundaryContext";
import { createSessionBoundaryActions } from "@/lib/sessionBoundary";

type PreparedAccount = {
  namespace: string;
  transport: ReturnType<typeof createScopedTrpcClient>;
  cache: ReturnType<typeof createAccountDataCache>;
  actions: SessionBoundaryActions;
};

/** Gate the whole account subtree in the render that observes an identity change. */
export function AccountCacheBoundary({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const session = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: true });
  const namespace = session.data === undefined ? undefined : accountCacheNamespace(session.data);
  const [prepared, setPrepared] = useState<PreparedAccount | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    if (namespace === undefined) return;
    let retired = false;
    let accountCache: ReturnType<typeof createAccountDataCache> | undefined;
    const isCurrent = () => !retired && generation.current === current
      && accountCacheNamespace(client.getQueryData<typeof session.data>(AUTH_ME_QUERY_KEY) ?? null) === namespace;
    const actions = createSessionBoundaryActions(client, isCurrent, () => session.refetch());
    setError("");
    void clearAccountDataCache(client).then(() => {
      if (isCurrent()) {
        accountCache = createAccountDataCache(() => { void actions.refresh(); });
        accountCache.client.setQueryData(AUTH_ME_QUERY_KEY, session.data);
        setPrepared({ namespace, transport: createScopedTrpcClient(session.data), cache: accountCache, actions });
      }
    }).catch(() => {
      if (generation.current === current) setError("Session data could not be reset. Reload Inspectra to continue.");
    });
    return () => {
      retired = true;
      generation.current++;
      if (accountCache) void accountCache.retire();
    };
  }, [client, namespace]);
  if (namespace === undefined || prepared?.namespace !== namespace) {
    return <div className="min-h-screen flex items-center justify-center p-6">
      {error || session.isError ? <div role="alert" className="space-y-3 text-center">
        <p>{error || "Your session could not be verified. Reconnect and try again."}</p>
        <button className="underline" onClick={() => { void session.refetch(); }}>Check session</button>
      </div> : <p role="status">Loading your session…</p>}
    </div>;
  }
  return <Fragment key={namespace}><SessionBoundaryContext.Provider value={prepared.actions}>
    <trpc.Provider client={prepared.transport} queryClient={prepared.cache.client}>
      <QueryClientProvider client={prepared.cache.client}>{children}</QueryClientProvider>
    </trpc.Provider>
  </SessionBoundaryContext.Provider></Fragment>;
}
