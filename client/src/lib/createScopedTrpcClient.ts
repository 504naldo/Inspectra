import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { trpc } from "./trpc";
import { TRPC_URL } from "./native";
import { expectedAccountHeaders, expectedAccountLink } from "./accountBinding";

/** A mounted account owns its transport. Old async closures keep their original
 * client and actor even after the next account has mounted.
 */
export function createScopedTrpcClient(user: unknown) {
  return trpc.createClient({
    links: [
      expectedAccountLink(user),
      httpBatchLink({
        url: TRPC_URL,
        transformer: superjson,
        headers: ({ opList }) => expectedAccountHeaders(opList),
        fetch(input, init) {
          const isPost = !init?.method || init.method === "POST";
          const isTrpcMutation = isPost && typeof input === "string" && input.includes("/api/trpc");
          if (!navigator.onLine && isTrpcMutation) {
            return Promise.reject(new Error("This action needs a connection. Your input has not been submitted."));
          }
          return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
        },
      }),
    ],
  });
}
