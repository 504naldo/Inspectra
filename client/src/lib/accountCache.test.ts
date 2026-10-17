import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { accountCacheNamespace, clearAccountDataCache, createAccountDataCache, isSessionQuery, isCurrentCacheEntry } from "./accountCache";
const authKey = [["auth", "me"], { type: "query" }] as const;
const jobKey = [["job", "get"], { input: { id: 10 }, type: "query" }] as const;
const account = { id: 1, companyId: 2, role: "office", customerOrgId: null };
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
const clients: QueryClient[] = [];
function client() {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(value); return value;
}
afterEach(() => { clients.splice(0).forEach(value => value.clear()); vi.restoreAllMocks(); });

describe("account query-cache isolation", () => {
  it("clears all account queries and mutations while retaining the resolved auth.me value", async () => {
    const cache = client();
    cache.setQueryData(authKey, account);
    cache.setQueryData(jobKey, { name: "Old customer's job" });
    cache.setQueryData([["auth", "profile"]], { staff: "Private" });
    cache.getMutationCache().build(cache, { mutationKey: ["invoice.send"], mutationFn: async () => "old" });
    await clearAccountDataCache(cache);
    expect(cache.getQueryData(authKey)).toEqual(account);
    expect(cache.getQueryData(jobKey)).toBeUndefined();
    expect(cache.getQueryCache().getAll()).toHaveLength(1);
    expect(cache.getMutationCache().getAll()).toHaveLength(0);
    expect(isSessionQuery({ queryKey: [["auth", "me", "extra"]] })).toBe(false);
  });

  it("ignores an old account query response even when its request ignores AbortSignal", async () => {
    const cache = client(), response = deferred<{ owner: string }>(), started = deferred<void>();
    cache.setQueryData(authKey, account);
    const old = cache.fetchQuery({ queryKey: jobKey, queryFn: async () => { started.resolve(); return response.promise; } }).catch(() => undefined);
    await started.promise;
    await clearAccountDataCache(cache);
    cache.setQueryData(authKey, { ...account, id: 9 });
    await cache.fetchQuery({ queryKey: jobKey, queryFn: async () => ({ owner: "New account" }) });
    response.resolve({ owner: "Old account" });
    await old;
    await Promise.resolve();
    expect(cache.getQueryData(jobKey)).toEqual({ owner: "New account" });
    expect(cache.getQueryData(authKey)).toMatchObject({ id: 9 });
  });

  it("prevents a delayed old mutation callback from restoring another account's cached data", async () => {
    const cache = client(), response = deferred<{ owner: string }>(), started = deferred<void>();
    const onSuccess = vi.fn(data => { cache.setQueryData(jobKey, data); });
    const onSettled = vi.fn();
    const mutation = cache.getMutationCache().build(cache, { mutationFn: async () => { started.resolve(); return response.promise; }, onSuccess, onSettled });
    const sending = mutation.execute(undefined);
    await started.promise;
    await clearAccountDataCache(cache);
    cache.setQueryData(jobKey, { owner: "New account" });
    response.resolve({ owner: "Old account" });
    await sending;
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    expect(cache.getQueryData(jobKey)).toEqual({ owner: "New account" });
  });

  it("a slow older reset cannot remove queries prepared by a later account", async () => {
    const cache = client(), release = deferred<void>();
    const originalCancel = cache.cancelQueries.bind(cache);
    let calls = 0;
    vi.spyOn(cache, "cancelQueries").mockImplementation(async (...args) => {
      await originalCancel(...args);
      if (++calls === 1) await release.promise;
    });
    cache.setQueryData(authKey, account);
    cache.setQueryData(jobKey, { owner: "Old account" });
    const first = clearAccountDataCache(cache);
    await vi.waitFor(() => expect(calls).toBe(1));
    await clearAccountDataCache(cache);
    cache.setQueryData(jobKey, { owner: "Latest account" });
    release.resolve(); await first;
    expect(cache.getQueryData(jobKey)).toEqual({ owner: "Latest account" });
  });

  it("ignores a removed old mutation's delayed unauthorized rejection in global error handlers", async () => {
    const cache = client(), started = deferred<void>();
    let reject!: (reason: Error) => void;
    const response = new Promise((_resolve, fail) => { reject = fail; });
    const redirect = vi.fn();
    cache.getMutationCache().subscribe(event => {
      if (event.type === "updated" && event.action.type === "error" && isCurrentCacheEntry(cache.getMutationCache(), event.mutation)) redirect(event.mutation.state.error);
    });
    const old = cache.getMutationCache().build(cache, { mutationFn: () => { started.resolve(); return response; } });
    const sending = old.execute(undefined).catch(() => undefined);
    await started.promise;
    await clearAccountDataCache(cache);
    cache.setQueryData(authKey, { ...account, id: 9 });
    reject(new Error("Please login (10001)"));
    await sending;
    expect(redirect).not.toHaveBeenCalled();
    const active = cache.getMutationCache().build(cache, { mutationFn: async () => { throw new Error("current"); } });
    await active.execute(undefined).catch(() => undefined);
    expect(redirect).toHaveBeenCalledOnce();
  });

  it("isolates identical query keys so an old continuation cannot deduplicate against a new account", async () => {
    const old = createAccountDataCache(vi.fn()), current = createAccountDataCache(vi.fn());
    clients.push(old.client, current.client);
    const response = deferred<{ owner: string }>();
    const currentRequest = current.client.fetchQuery({ queryKey: jobKey, queryFn: () => response.promise });
    await old.retire();
    const oldTransport = vi.fn(async () => ({ owner: "Old account" }));
    const oldRequest = old.client.fetchQuery({ queryKey: jobKey, queryFn: oldTransport });
    response.resolve({ owner: "New account" });
    expect(await oldRequest).toEqual({ owner: "Old account" });
    expect(await currentRequest).toEqual({ owner: "New account" });
    expect(oldTransport).toHaveBeenCalledOnce();
    old.client.setQueryData(jobKey, { owner: "Old continuation" });
    expect(current.client.getQueryData(jobKey)).toEqual({ owner: "New account" });
  });

  it("refreshes the active outer session on unauthorized errors and silences retired cache errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const refresh = vi.fn(), cache = createAccountDataCache(refresh);
    clients.push(cache.client);
    const unauthorized = () => new TRPCClientError("Please login (10001)");
    const active = cache.client.getMutationCache().build(cache.client, { mutationFn: async () => { throw unauthorized(); } });
    await active.execute(undefined).catch(() => undefined);
    expect(refresh).toHaveBeenCalledOnce();
    await cache.retire();
    const stale = cache.client.getMutationCache().build(cache.client, { mutationFn: async () => { throw unauthorized(); } });
    await stale.execute(undefined).catch(() => undefined);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it.each([{ id: 9 }, { companyId: 9 }, { role: "customer" }, { customerOrgId: 9 }, { sessionVersion: 9 }])(
    "changes the cache namespace when an authorization identity field changes: %o", changed => {
      expect(accountCacheNamespace({ ...account, ...changed })).not.toBe(accountCacheNamespace(account));
      expect(accountCacheNamespace(null)).not.toBe(accountCacheNamespace(account));
    },
  );
});
