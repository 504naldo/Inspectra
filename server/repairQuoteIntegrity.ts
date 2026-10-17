import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { quotes, type Quote } from "../drizzle/schema";
import * as db from "./db";
import type { Db } from "./db/client";
import type { TrpcContext } from "./_core/context";
import { callerIsPlatformOperator } from "./_core/actorContext";

/** Serialize content edits and sealing on the parent, using one connection. */
export async function withLockedRepairQuote<T>(
  ctx: TrpcContext,
  procedure: string,
  quoteId: number,
  companyId: number,
  fn: (quote: Quote, tx: Db) => Promise<T>,
): Promise<T> {
  return db.withAudit(ctx, procedure, async tx => {
    // This must be the first read: a preceding consistent read would establish
    // a stale REPEATABLE READ snapshot while waiting for a concurrent seal.
    const [quote] = await tx.select().from(quotes)
      .where(eq(quotes.id, quoteId)).for("update");
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
    if (quote.companyId !== companyId && !callerIsPlatformOperator()) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    if (quote.quoteType !== "repair") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a repair quote." });
    }
    return fn(quote, tx);
  });
}

export function assertRepairQuoteEditable(quote: Quote): void {
  if (quote.status !== "draft") {
    throw new TRPCError({ code: "CONFLICT", message: "Only a draft repair quote can be edited." });
  }
  if (quote.finalizedAt) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This quote is finalized and cannot be edited. Create a revision to make changes.",
    });
  }
}

/** Customer decisions and work orders must refer to a sealed repair scope. */
export function assertRepairQuoteFinalized(quote: Quote): void {
  if (quote.quoteType !== "repair") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a repair quote." });
  }
  if (!quote.finalizedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Finalize the quote before advancing its approval or delivery status." });
  }
}

/** Linked children must belong to the actual quote, even for platform admins. */
export async function assertRepairQuoteItemLinks(
  quote: Pick<Quote, "jobId" | "companyId">,
  input: { deficiencyId?: number | null; partId?: number | null },
) {
  if (input.deficiencyId != null) {
    const deficiency = await db.getDeficiencyById(input.deficiencyId);
    if (!deficiency || deficiency.jobId !== quote.jobId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Deficiency does not belong to this quote's job." });
    }
  }
  if (input.partId != null) {
    const part = await db.getPartsCatalogItemById(input.partId);
    if (!part || part.companyId !== quote.companyId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid part" });
    }
    return part;
  }
  return undefined;
}
