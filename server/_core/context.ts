import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { randomUUID } from "crypto";
import { EXPECTED_ACCOUNT_HEADER, parseExpectedAccountHeader, type ExpectedAccount } from "../../shared/accountBinding";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  // Compliance: per-request audit metadata
  requestId: string;
  ipAddress: string;
  userAgent: string;
  /** Set by the HTTP adapter, never by procedure input. Internal callers omit it. */
  requireAccountBinding?: boolean;
  expectedAccount?: ExpectedAccount | null;
  expectedAccountProvided?: boolean;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const requestId = randomUUID();
  const ipAddress =
    (opts.req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    opts.req.socket?.remoteAddress ||
    "unknown";
  const userAgent = opts.req.headers["user-agent"] || "unknown";

  return {
    req: opts.req,
    res: opts.res,
    user,
    requestId,
    ipAddress,
    userAgent,
    requireAccountBinding: true,
    expectedAccount: parseExpectedAccountHeader(opts.req.headers[EXPECTED_ACCOUNT_HEADER]),
    expectedAccountProvided: opts.req.headers[EXPECTED_ACCOUNT_HEADER] !== undefined,
  };
}
