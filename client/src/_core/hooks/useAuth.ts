import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useContext, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearAccountDataCache } from "@/lib/accountCache";
import { SessionBoundaryContext } from "@/components/SessionBoundaryContext";

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

const IS_DEV = import.meta.env.DEV;

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const sessionBoundary = useContext(SessionBoundaryContext);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation();

  const logout = useCallback(async () => {
    // Retire the visible account before yielding. Its in-flight callbacks keep
    // their old transport/cache and cannot publish over a later account.
    if (sessionBoundary && !sessionBoundary.signedOut()) return;
    try { localStorage.removeItem('inspectra-user-info'); } catch { /* Optional debug storage. */ }
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      // Remove account data before publishing signed-out auth to the app.
      await clearAccountDataCache(queryClient);
      await utils.auth.me.cancel();
      utils.auth.me.setData(undefined, null);
      if (!sessionBoundary) await utils.auth.me.invalidate();
      
      if (IS_DEV) {
        console.log('[AUTH] Logout complete - cleared session and localStorage');
      }
    }
  }, [logoutMutation, utils, queryClient, sessionBoundary]);

  const state = useMemo(() => {
    const loading = meQuery.isLoading || logoutMutation.isPending;
    const user = meQuery.data ?? null;
    const isAuthenticated = Boolean(user);
    
    // Determine auth status
    let status: AuthStatus;
    if (loading) {
      status = 'loading';
    } else if (isAuthenticated) {
      status = 'authenticated';
    } else {
      status = 'unauthenticated';
    }
    
    return {
      status,
      user,
      loading,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated,
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    try { localStorage.setItem("inspectra-user-info", JSON.stringify(state.user)); }
    catch { /* Optional debug/offline reference must not interrupt authentication. */ }
    if (IS_DEV) console.log('[AUTH]', { status: state.status, hasSession: state.isAuthenticated,
      role: state.user?.role, path: typeof window !== 'undefined' ? window.location.pathname : 'unknown' });
  }, [state.user, state.status, state.isAuthenticated]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => sessionBoundary ? sessionBoundary.refresh() : meQuery.refetch().then(() => {}),
    logout,
  };
}
