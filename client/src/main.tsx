import { trpc } from "@/lib/trpc";
import { TRPC_URL } from "@/lib/native";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

// Vite fires this when a <link rel="modulepreload"> chunk fails to load — the
// classic "app was redeployed while a tab was open" case. Reload once (guarded
// against a loop) to pull the fresh index.html + chunk graph.
window.addEventListener("vite:preloadError",event => {
  const KEY = "chunk-reload:preload";
  try {
    if (sessionStorage.getItem(KEY)) return; // already reloaded once this tab
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* sessionStorage unavailable — fall through and reload anyway */
  }
  event.preventDefault();
  window.location.reload();
});

// Never globally retry non-idempotent sends, payments or finalization.
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: false
      }
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (error.message === UNAUTHED_ERR_MSG) {
    window.location.href = getLoginUrl();
  }
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: TRPC_URL,
      transformer: superjson,
      fetch(input, init) {
        const isPost = !init?.method || init.method === "POST";
        const isTrpcMutation = isPost && typeof input === "string" && input.includes("/api/trpc");

        // Field workflows own typed durable queues. Never fabricate success.
        if (!navigator.onLine && isTrpcMutation) {
          return Promise.reject(
            new Error(
              "This action needs a connection. Your input has not been submitted."));
        }

        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const swPath = import.meta.env.DEV ? "/dev-dist/sw.js" : "/sw.js";
    navigator.serviceWorker
      .register(swPath, { type: "module" })
      .then(registration => {
        console.log("[PWA] Service Worker registered:", registration.scope);
        setInterval(() => registration.update(), 60 * 60 * 1000);
      })
      .catch(error => {
        console.error("[PWA] Service Worker registration failed:", error);
      });
  });
}
