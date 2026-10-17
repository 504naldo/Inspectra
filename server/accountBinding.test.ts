import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { User } from "../drizzle/schema";
import { ACCOUNT_CHANGED_MESSAGE, EXPECTED_ACCOUNT_HEADER, expectedAccount, serializeExpectedAccount } from "../shared/accountBinding";
import { createContext, type TrpcContext } from "./_core/context";
import { assertAccountBinding } from "./_core/accountBinding";
import { router, protectedProcedure, adminProcedure, adminOrOfficeProcedure, officeProcedure, technicianProcedure, customerProcedure, publicProcedure } from "./_core/trpc";

const authentication = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn(async () => authentication.user) } }));

const user = { id: 1, companyId: 2, customerOrgId: null, role: "office", sessionVersion: 4 } as User;
let writes = 0;
const routes = router({
  write: protectedProcedure.mutation(() => ++writes),
  admin: adminProcedure.mutation(() => ++writes),
  adminOrOffice: adminOrOfficeProcedure.mutation(() => ++writes),
  office: officeProcedure.mutation(() => ++writes),
  technician: technicianProcedure.mutation(() => ++writes),
  customer: customerProcedure.mutation(() => ++writes),
  read: protectedProcedure.query(() => "read"),
  me: publicProcedure.query(({ ctx }) => { assertAccountBinding(ctx, false); return ctx.user?.id ?? null; }),
  token: publicProcedure.mutation(() => "public token"),
  logout: publicProcedure.mutation(({ ctx }) => { assertAccountBinding(ctx, false); return ++writes; }),
});

async function http(path: string, header?: string, method = "POST") {
  const request = new Request(`https://inspectra.example/trpc/${path}`, {
    method, headers: { "content-type": "application/json", ...(header === undefined ? {} : { [EXPECTED_ACCOUNT_HEADER]: header }) },
    ...(method === "POST" ? { body: JSON.stringify({ json: null }) } : {}),
  });
  return fetchRequestHandler({ endpoint: "/trpc", req: request, router: routes, createContext: () => createContext({
    req: { headers: Object.fromEntries(request.headers), socket: {} } as any,
    res: { setHeader: vi.fn() } as any,
    info: {} as any,
  }) });
}

beforeEach(() => { writes = 0; authentication.user = { ...user }; });
describe("HTTP expected account binding", () => {
  it("accepts an exact UI actor and marks HTTP contexts as requiring the guard", async () => {
    const header = serializeExpectedAccount(expectedAccount(user)!);
    const context = await createContext({ req: { headers: { [EXPECTED_ACCOUNT_HEADER]: header }, socket: {} } as any, res: {} as any, info: {} as any });
    expect(context).toMatchObject({ requireAccountBinding: true, expectedAccount: expectedAccount(user) });
    expect((await http("write", header)).status).toBe(200);
    expect(writes).toBe(1);
  });

  it.each([undefined, "", "not JSON", "{}", '[1]', JSON.stringify({ version: 2, ...expectedAccount(user) })])(
    "rejects a missing or malformed expected actor before a protected write: %s", async header => {
      const response = await http("write", header);
      expect(response.status).toBe(412);
      expect(await response.text()).toContain(ACCOUNT_CHANGED_MESSAGE);
      expect(writes).toBe(0);
    },
  );

  it.each([{ id: 9 }, { companyId: 9 }, { role: "technician" }, { customerOrgId: 9 }, { sessionVersion: 5 }])(
    "rejects a changed cookie account/authorization before the write: %o", async changed => {
      const original = serializeExpectedAccount(expectedAccount(user)!);
      authentication.user = { ...user, ...changed } as User;
      expect((await http("write", original)).status).toBe(412);
      expect(writes).toBe(0);
    },
  );

  it.each(["admin", "adminOrOffice", "office", "technician", "customer"])("guards every authenticated procedure family: %s", async path => {
    authentication.user = { ...user, role: path === "customer" ? "customer" : "admin" };
    expect((await http(path)).status).toBe(412);
    expect(writes).toBe(0);
  });

  it("leaves public session/token recovery and reads available without binding", async () => {
    expect((await http("me", undefined, "GET")).status).toBe(200);
    expect((await http("read", undefined, "GET")).status).toBe(200);
    expect((await http("token")).status).toBe(200);
    expect((await http("logout")).status).toBe(200);
    authentication.user = null;
    expect((await http("token", "malformed")).status).toBe(200);
    expect((await http("write")).status).toBe(401);
    expect(writes).toBe(1);
  });

  it("rejects an old bound client's query rather than returning the new cookie account's data", async () => {
    authentication.user = { ...user, id: 9 };
    expect((await http("read", serializeExpectedAccount(expectedAccount(user)!), "GET")).status).toBe(412);
    expect((await http("me", serializeExpectedAccount(expectedAccount(user)!), "GET")).status).toBe(412);
    expect((await http("me", undefined, "GET")).status).toBe(200);
  });

  it("rejects supplied stale or malformed logout identity before clearing or revoking the current session", async () => {
    authentication.user = { ...user, id: 9 };
    expect((await http("logout", serializeExpectedAccount(expectedAccount(user)!))).status).toBe(412);
    expect((await http("logout", "malformed")).status).toBe(412);
    expect(writes).toBe(0);
    expect((await http("logout")).status).toBe(200);
    authentication.user = null;
    expect((await http("logout", "malformed")).status).toBe(200);
    expect(writes).toBe(2);
  });

  it("keeps direct internal callers compatible unless the server marked the context as HTTP", async () => {
    const context = { user } as TrpcContext;
    expect(await routes.createCaller(context).write()).toBe(1);
    await expect(routes.createCaller({ ...context, requireAccountBinding: true }).write()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(writes).toBe(1);
  });
});
