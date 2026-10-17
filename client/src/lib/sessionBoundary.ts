import type { QueryClient } from "@tanstack/react-query";
import { AUTH_ME_QUERY_KEY } from "./accountCache";

/** Retain the generation check in every async closure instead of publishing
 * session transitions through whichever account happens to be mounted later.
 */
export function createSessionBoundaryActions(client: QueryClient, isCurrent: () => boolean, refetch: () => Promise<unknown>) {
  let signedOut = false;
  return {
    refresh: async (): Promise<void> => { if (!signedOut && isCurrent()) await refetch(); },
    signedOut: (): boolean => {
      if (signedOut || !isCurrent()) return false;
      signedOut = true;
      void client.cancelQueries({ queryKey: AUTH_ME_QUERY_KEY }, { silent: true });
      client.setQueryData(AUTH_ME_QUERY_KEY, null);
      return true;
    },
  };
}
