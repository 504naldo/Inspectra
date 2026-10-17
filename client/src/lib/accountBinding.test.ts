import { afterEach, describe, expect, it, vi } from "vitest";
import { createTRPCUntypedClient, httpBatchLink, type Operation } from "@trpc/client";
import { expectedAccount, EXPECTED_ACCOUNT_HEADER, parseExpectedAccountHeader, serializeExpectedAccount } from "@shared/accountBinding";
import { captureOperationAccount, expectedAccountHeaders, expectedAccountLink } from "./accountBinding";
import { createScopedTrpcClient } from "./createScopedTrpcClient";

vi.mock("./native", () => ({ TRPC_URL: "https://inspectra.example/api/trpc" }));
const actorA = { id: 1, companyId: 2, role: "office", customerOrgId: null, sessionVersion: 4 };
const actorB = { ...actorA, id: 9 };
const mutation = () => ({ type: "mutation", context: {} }) as Pick<Operation, "type" | "context">;
const response = () => new Response(JSON.stringify([{ result: { data: { json: { success: true } } } }]), { headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("immutable operation account binding", () => {
  it("copies and freezes all authorization fields and rejects malformed/duplicate headers", () => {
    const source = { ...actorA };
    const actor = expectedAccount(source)!;
    source.companyId = 99;
    expect(Object.isFrozen(actor)).toBe(true);
    expect(parseExpectedAccountHeader(serializeExpectedAccount(actor))).toEqual(actorA);
    expect(parseExpectedAccountHeader([serializeExpectedAccount(actor), serializeExpectedAccount(actor)])).toBeNull();
    expect(parseExpectedAccountHeader(JSON.stringify({ version: 1, ...actorA, extra: true }))).toBeNull();
    expect(parseExpectedAccountHeader(JSON.stringify({ version: 1, ...actorA, sessionVersion: "4" }))).toBeNull();
    expect(expectedAccount({ ...actorA, sessionVersion: undefined })).toBeNull();
  });

  it("never replaces the original actor when forwarding or retrying a captured operation", () => {
    const old = captureOperationAccount(mutation(), expectedAccount(actorA));
    const forwarded = captureOperationAccount(old, expectedAccount(actorB));
    expect(forwarded).toBe(old);
    expect(parseExpectedAccountHeader(expectedAccountHeaders([forwarded])[EXPECTED_ACCOUNT_HEADER])).toEqual(actorA);
  });

  it("rejects mixed bound actors and bound/unbound mutations before a batch can be sent", () => {
    const old = captureOperationAccount(mutation(), expectedAccount(actorA));
    const current = captureOperationAccount(mutation(), expectedAccount(actorB));
    expect(() => expectedAccountHeaders([old, current])).toThrow("account or session changed");
    expect(() => expectedAccountHeaders([old, mutation()])).toThrow("account or session changed");
    expect(expectedAccountHeaders([mutation()])).toEqual({});
    expect(expectedAccountHeaders([{ type: "query", context: {} }])).toEqual({});
    const query = captureOperationAccount({ type: "query" as const, context: {} }, expectedAccount(actorA));
    expect(parseExpectedAccountHeader(expectedAccountHeaders([query])[EXPECTED_ACCOUNT_HEADER])).toEqual(actorA);
  });

  it("captures before batching, including a mutable source identity changing before fetch", async () => {
    const source = { ...actorA };
    const fetch = vi.fn(async () => response());
    const client = createTRPCUntypedClient({ links: [expectedAccountLink(source), httpBatchLink({ url: "https://inspectra.example/api/trpc", headers: ({ opList }) => expectedAccountHeaders(opList), fetch })] });
    const sending = client.mutation("write");
    source.id = actorB.id;
    await sending;
    const headers = new Headers(fetch.mock.calls[0][1]?.headers);
    expect(parseExpectedAccountHeader(headers.get(EXPECTED_ACCOUNT_HEADER) ?? undefined)).toEqual(actorA);
  });

  it("rejects an actual mixed-actor httpBatchLink batch without invoking fetch", async () => {
    let actor = expectedAccount(actorA);
    const fetch = vi.fn(async () => response());
    const client = createTRPCUntypedClient({ links: [() => ({ op, next }) => next(captureOperationAccount(op, actor)), httpBatchLink({ url: "https://inspectra.example/api/trpc", headers: ({ opList }) => expectedAccountHeaders(opList), fetch })] });
    const old = client.mutation("write");
    actor = expectedAccount(actorB);
    const current = client.mutation("write");
    const settled = await Promise.allSettled([old, current]);
    expect(settled.map(result => result.status)).toEqual(["rejected", "rejected"]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps the old account client bound after a new account mounts, including later async follow-up calls", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const sent: (ReturnType<typeof expectedAccount>)[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_input, init) => {
      sent.push(parseExpectedAccountHeader(new Headers(init?.headers).get(EXPECTED_ACCOUNT_HEADER) ?? undefined));
      return response();
    }));
    const oldClient = createScopedTrpcClient(actorA);
    const oldContinuation = async () => { await Promise.resolve(); return oldClient.company.create.mutate({ name: "Old workflow" }); };
    const currentClient = createScopedTrpcClient(actorB);
    await currentClient.company.create.mutate({ name: "Current workflow" });
    await oldContinuation();
    expect(sent).toEqual([actorB, actorA]);
  });
});
