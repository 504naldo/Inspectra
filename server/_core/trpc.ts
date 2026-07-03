import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";
import { runWithActor } from "./actorContext";

const GENERIC_SERVER_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * Extracts only the non-standard fields from an error's `cause` — e.g. the
 * `{ code, details }` payload importRouter.ts attaches for client-facing
 * diagnostics — while dropping `message`/`stack`/`name`. This lets deliberate
 * structured payloads through without ever forwarding a raw internal Error's
 * stack or driver-specific message (DB/SQL errors, file paths, etc).
 */
export function safeErrorCause(cause: unknown): Record<string, unknown> | undefined {
  if (!cause || typeof cause !== "object") return undefined;
  const { message, stack, name, ...rest } = cause as Record<string, unknown>;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

type ErrorShapeInput = {
  shape: { message: string; data: { code: string; [key: string]: unknown } };
  error: { cause?: unknown };
  isProduction: boolean;
};

/**
 * Sanitizes the error shape sent to clients. Unexpected (INTERNAL_SERVER_ERROR)
 * exceptions get a generic message in production instead of the raw internal
 * error text — tRPC's default formatter otherwise forwards `error.message`
 * verbatim, which can be a raw SQL/driver error. Deliberate TRPCErrors (any
 * other code) keep their developer-authored message and may forward a safe
 * structured `cause`.
 */
export function formatErrorForClient({ shape, error, isProduction }: ErrorShapeInput) {
  const isInternal = shape.data.code === "INTERNAL_SERVER_ERROR";
  const safeCause = isInternal ? undefined : safeErrorCause(error.cause);

  return {
    ...shape,
    message: isInternal && isProduction ? GENERIC_SERVER_ERROR_MESSAGE : shape.message,
    data: {
      ...shape.data,
      ...(safeCause ? { cause: safeCause } : {}),
    },
  };
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter: ({ shape, error }) =>
    formatErrorForClient({ shape, error, isProduction: ENV.isProduction }),
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Binds the caller's role + companyId to the async-local actor context for the
 * duration of the request, so the tenant guards can grant the `admin`
 * cross-company bypass without every call site passing the role. No-op when
 * there is no authenticated user (guards then fail closed). Prepended to every
 * authenticated procedure below.
 */
const actorScope = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) return next();
  return runWithActor(
    { role: ctx.user.role, companyId: ctx.user.companyId ?? null },
    () => next(),
  );
});

const authed = t.procedure.use(actorScope);

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = authed.use(requireUser);

export const adminProcedure = authed.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const adminOrOfficeProcedure = authed.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'office')) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin or office role required"
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

export const officeProcedure = authed.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || !['admin', 'office'].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Office or Admin access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const technicianProcedure = authed.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || !['admin', 'office', 'technician'].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Technician access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const customerProcedure = authed.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== 'customer') {
      throw new TRPCError({ code: "FORBIDDEN", message: "Customer access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
