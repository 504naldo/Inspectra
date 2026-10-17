import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { AUTH_ME_QUERY_KEY, accountCacheNamespace } from "./accountCache";
import { createSessionBoundaryActions } from "./sessionBoundary";

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach(client => client.clear()));
const user = { id: 1, companyId: 2, customerOrgId: null, role: "office", sessionVersion: 1 };
function setup() {
  const client = new QueryClient(); clients.push(client);
  client.setQueryData(AUTH_ME_QUERY_KEY, user);
  const namespace = accountCacheNamespace(user);
  const refetch = vi.fn(async () => undefined);
  const actions = createSessionBoundaryActions(client, () => accountCacheNamespace(client.getQueryData(AUTH_ME_QUERY_KEY) as typeof user | null) === namespace, refetch);
  return { client, actions, refetch };
}

describe("account session transition ownership", () => {
  it("publishes logout synchronously before the caller can await an HTTP logout request", async () => {
    const { client, actions, refetch } = setup();
    expect(actions.signedOut()).toBe(true);
    expect(client.getQueryData(AUTH_ME_QUERY_KEY)).toBeNull();
    expect(actions.signedOut()).toBe(false);
    await actions.refresh();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("prevents an old logout/refresh continuation from changing a newer account's outer session", async () => {
    const { client, actions, refetch } = setup();
    const current = { ...user, id: 9 };
    client.setQueryData(AUTH_ME_QUERY_KEY, current);
    expect(actions.signedOut()).toBe(false);
    await actions.refresh();
    expect(refetch).not.toHaveBeenCalled();
    expect(client.getQueryData(AUTH_ME_QUERY_KEY)).toEqual(current);
  });

  it("forwards an active account refresh to the bootstrap session query", async () => {
    const { actions, refetch } = setup();
    await actions.refresh();
    expect(refetch).toHaveBeenCalledOnce();
  });
});
