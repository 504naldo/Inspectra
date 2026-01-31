import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo } from "react";

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

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
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
      // Clear auth state
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      
      // Clear localStorage auth keys
      localStorage.removeItem('manus-runtime-user-info');
      
      if (IS_DEV) {
        console.log('[AUTH] Logout complete - cleared session and localStorage');
      }
    }
  }, [logoutMutation, utils]);

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
    
    // Store user info in localStorage
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(user)
    );
    
    // Debug logging in dev mode
    if (IS_DEV) {
      console.log('[AUTH]', {
        status,
        hasSession: isAuthenticated,
        role: user?.role,
        path: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      });
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
    refresh: () => meQuery.refetch(),
    logout,
  };
}
