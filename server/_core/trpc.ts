import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

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

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
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

export const adminOrOfficeProcedure = t.procedure.use(
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

export const officeProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || !['admin', 'office'].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Office or Admin access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const technicianProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || !['admin', 'office', 'technician'].includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Technician access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const customerProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== 'customer') {
      throw new TRPCError({ code: "FORBIDDEN", message: "Customer access required" });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);
