import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { cacheCurrentJobDownload } from "./offlineDownload";

function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach(client => client.clear()));

describe("offline job download account boundary", () => {
  it("does not write a new account's deduplicated query response into an unmounted account's store", async () => {
    const client = new QueryClient(); clients.push(client);
    const response = deferred<{ owner: string }>();
    const queryKey = [["sync", "getJobDataForOffline"], { input: { jobId: 7 } }];
    const currentAccountQuery = client.fetchQuery({ queryKey, queryFn: () => response.promise });
    const oldTransport = vi.fn(async () => ({ owner: "Old account" }));
    const oldCache = vi.fn();
    let mounted = true;
    const oldDownload = cacheCurrentJobDownload(
      () => client.fetchQuery({ queryKey, queryFn: oldTransport }), oldCache, () => mounted,
    );
    mounted = false;
    response.resolve({ owner: "New account" });
    expect(await currentAccountQuery).toEqual({ owner: "New account" });
    expect(await oldDownload).toBe(false);
    expect(oldTransport).not.toHaveBeenCalled(); // QueryClient supplied the other request's response.
    expect(oldCache).not.toHaveBeenCalled();
  });

  it("preserves a current account's successful download", async () => {
    const cache = vi.fn();
    expect(await cacheCurrentJobDownload(async () => ({ job: 7 }), cache, () => true)).toBe(true);
    expect(cache).toHaveBeenCalledWith({ job: 7 });
  });

  it("stops a stale continuation before it starts another download", async () => {
    const fetch = vi.fn(), cache = vi.fn();
    expect(await cacheCurrentJobDownload(fetch, cache, () => false)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(cache).not.toHaveBeenCalled();
  });
});
