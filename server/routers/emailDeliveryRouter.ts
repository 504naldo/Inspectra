import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { emailOutbox } from "../../drizzle/schema";
import { getDb } from "../db";
import { officeProcedure, router } from "../_core/trpc";

/** Provider acceptance is evidence of an attempt, not recipient delivery. */
export const emailDeliveryRouter = router({
  lookup: officeProcedure
    .input(z.object({ requestId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const database = await getDb();
      if (!database) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Delivery tracking unavailable" });
      }
      // Always restrict by the actual sender. Platform operators may have sent
      // for a foreign company; other roles must still belong to the row's tenant.
      const senderScope = and(
        eq(emailOutbox.requestId, input.requestId),
        eq(emailOutbox.userId, ctx.user.id),
        ctx.user.role === "admin"
          ? undefined
          : eq(emailOutbox.companyId, ctx.user.companyId ?? -1),
      );
      const [receipt] = await database.select({
        requestId: emailOutbox.requestId,
        status: emailOutbox.status,
        providerMessageId: emailOutbox.providerMessageId,
      }).from(emailOutbox).where(senderScope).limit(1);
      if (!receipt) return null;
      return {
        requestId: receipt.requestId,
        status: receipt.status === "accepted" && !receipt.providerMessageId?.trim()
          ? "unknown" as const
          : receipt.status,
        providerMessageId: receipt.providerMessageId,
      };
    }),
});
