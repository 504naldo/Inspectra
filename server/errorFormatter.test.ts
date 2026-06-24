/**
 * errorFormatter.test.ts
 *
 * Regression coverage for the P2 H6 finding: tRPC's default error formatter
 * forwards an unexpected exception's raw `.message` (and would forward any
 * `cause` field) straight to the client — which can be a raw SQL/driver
 * error. formatErrorForClient() in server/_core/trpc.ts replaces that
 * message with a generic one in production for INTERNAL_SERVER_ERROR, while
 * preserving deliberate TRPCErrors' developer-authored messages and safely
 * forwarding their structured `cause` (e.g. importRouter.ts's
 * `{code, details}` diagnostics) with internal fields stripped.
 */
import { describe, expect, it } from "vitest";

import { formatErrorForClient, safeErrorCause } from "./_core/trpc";

describe("safeErrorCause", () => {
  it("returns undefined for a non-object cause", () => {
    expect(safeErrorCause("just a string")).toBeUndefined();
    expect(safeErrorCause(undefined)).toBeUndefined();
    expect(safeErrorCause(null)).toBeUndefined();
  });

  it("strips message/stack/name from a plain Error-like cause", () => {
    const cause = { message: "boom", stack: "at foo.js:1", name: "Error" };
    expect(safeErrorCause(cause)).toBeUndefined();
  });

  it("forwards a deliberate structured payload's extra fields", () => {
    const cause = { message: "Parse failed", code: "PARSE_FAILED", details: { row: 3 } };
    expect(safeErrorCause(cause)).toEqual({ code: "PARSE_FAILED", details: { row: 3 } });
  });
});

describe("formatErrorForClient — H6 guard", () => {
  it("replaces an INTERNAL_SERVER_ERROR message with a generic one in production, dropping a raw DB error's cause", () => {
    const shape = { message: "ER_DUP_ENTRY: Duplicate entry 'x' for key 'users.email'", data: { code: "INTERNAL_SERVER_ERROR" } };
    const error = { cause: { message: "...", sqlMessage: "Duplicate entry", errno: 1062, sql: "INSERT INTO users ..." } };

    const result = formatErrorForClient({ shape, error, isProduction: true });

    expect(result.message).toBe("Something went wrong. Please try again.");
    expect(result.data.cause).toBeUndefined();
  });

  it("preserves the original message for an INTERNAL_SERVER_ERROR outside production (dev visibility)", () => {
    const shape = { message: "ER_DUP_ENTRY: Duplicate entry 'x' for key 'users.email'", data: { code: "INTERNAL_SERVER_ERROR" } };
    const error = { cause: undefined };

    const result = formatErrorForClient({ shape, error, isProduction: false });

    expect(result.message).toBe(shape.message);
  });

  it("forwards a deliberate non-internal error's structured cause and keeps its message", () => {
    const shape = { message: "Could not parse the uploaded file", data: { code: "BAD_REQUEST" } };
    const error = { cause: { code: "PARSE_FAILED", details: { row: 3, column: "Date" } } };

    const result = formatErrorForClient({ shape, error, isProduction: true });

    expect(result.message).toBe("Could not parse the uploaded file");
    expect(result.data.cause).toEqual({ code: "PARSE_FAILED", details: { row: 3, column: "Date" } });
  });

  it("does not add a cause field for a non-internal error with only message/stack/name", () => {
    const shape = { message: "Not found", data: { code: "NOT_FOUND" } };
    const error = { cause: new Error("underlying") };

    const result = formatErrorForClient({ shape, error, isProduction: true });

    expect(result.data.cause).toBeUndefined();
  });

  it("does not alter unrelated shape.data fields", () => {
    const shape = { message: "Forbidden", data: { code: "FORBIDDEN", httpStatus: 403, path: "users.delete" } };
    const error = { cause: undefined };

    const result = formatErrorForClient({ shape, error, isProduction: true });

    expect(result.data.httpStatus).toBe(403);
    expect(result.data.path).toBe("users.delete");
  });
});
