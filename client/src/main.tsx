import { trpc } from "@/lib/trpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AccountCacheBoundary } from "./components/AccountCacheBoundary";
import { createScopedTrpcClient } from "./lib/createScopedTrpcClient";
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

// Bootstrap transport resolves auth.me only. AccountCacheBoundary supplies an
// immutable account transport before mounting any application workflows.
const trpcClient = createScopedTrpcClient(null);

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <AccountCacheBoundary><App /></AccountCacheBoundary>
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
