import { lazy as reactLazy, type ComponentType } from "react";

/**
 * A dynamic import ("chunk") can 404 after a deploy: the server rebuilds with
 * new hashed asset filenames (e.g. Jobs-d5WTG6bQ.js), but a tab opened before
 * the deploy still references the old names. Navigating then throws
 * "Failed to fetch dynamically imported module". This helper recovers from that
 * automatically with a one-time full reload (which pulls the fresh index.html
 * + chunk graph), guarded so a genuinely broken chunk can't loop forever.
 */

export function isChunkLoadError(err: unknown): boolean {
  const msg = (err as { message?: string } | null)?.message ?? String(err ?? "");
  return (
    /failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg) ||
    // Some browsers report the MIME when the server serves index.html for a
    // missing .js (SPA fallback) instead of a 404.
    /expected a javascript module|mime type of ('|")?text\/html/i.test(msg)
  );
}

const RELOAD_FLAG_PREFIX = "chunk-reload:";

function reloadGuard(key: string): boolean {
  try {
    if (sessionStorage.getItem(key)) return false; // already tried once this tab
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    // sessionStorage unavailable (private mode quota, etc.) — allow one reload.
    return true;
  }
}

function clearGuard(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Drop-in replacement for React.lazy that survives deploys. Import it as `lazy`.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  const flag = RELOAD_FLAG_PREFIX + factory.toString();
  return reactLazy(async () => {
    try {
      const mod = await factory();
      clearGuard(flag); // recovered — let a future deploy trigger its own reload
      return mod;
    } catch (err) {
      if (isChunkLoadError(err) && reloadGuard(flag)) {
        window.location.reload();
        // Never resolve: keep showing the Suspense fallback until the reload
        // takes over, rather than flashing the error boundary.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
