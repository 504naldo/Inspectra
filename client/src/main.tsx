import { trpc } from "@/lib/trpc";
import { TRPC_URL } from "@/lib/native";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { mutationQueue } from "@/lib/mutationQueue";
import "./index.css";

// Vite fires this when a <link rel="modulepreload"> chunk fails to load — the
// classic "app was redeployed while a tab was open" case. Reload once (guarded
// against a loop) to pull the fresh index.html + chunk graph.
window.addEventListener("vite:preloadError", (event) => {
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

// Retry mutations up to 2 times for transient network failures (when online)
const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      retry: (failureCount, error) => {
        // Don't retry if offline — the queue handles that
        if (!navigator.onLine) return false;
        // Don't retry auth errors
        if (error instanceof TRPCClientError && error.message === UNAUTHED_ERR_MSG) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
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

// Build a fake tRPC batch success response (null data for N procedures in the batch)
function fakeSuccessResponse(url: string): Response {
  const path = (url as string).split("?")[0];
  const segment = path.split("/api/trpc/")[1] ?? "";
  const count = segment ? segment.split(",").length : 1;
  const payload = JSON.stringify(
    Array.from({ length: count }, () => ({ result: { data: { json: null } } }))
  );
  return new Response(payload, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: TRPC_URL,
      transformer: superjson,
      fetch(input, init) {
        const isPost = !init?.method || init.method === "POST";
        const isTrpcMutation = isPost && typeof input === "string" && input.includes("/api/trpc");

        // When offline, queue the request and return a fake success so the UI
        // doesn't show an error. The queue is flushed when connectivity returns.
        if (!navigator.onLine && isTrpcMutation) {
          mutationQueue.add(input as string, (init?.body as string) ?? "");
          return Promise.resolve(fakeSuccessResponse(input as string));
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
      .then((registration) => {
        console.log("[PWA] Service Worker registered:", registration.scope);
        setInterval(() => registration.update(), 60 * 60 * 1000);
      })
      .catch((error) => {
        console.error("[PWA] Service Worker registration failed:", error);
      });
  });
}
