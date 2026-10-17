import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { emailOutbox, quotes, type Quote } from "../drizzle/schema";
import * as db from "./db";
import type { Db } from "./db/client";
import type { TrpcContext } from "./_core/context";

/** The parent lock must precede the first consistent read in the transaction. */
export async function withLockedStandardQuote<T>(
  ctx: TrpcContext,
  procedure: string,
  quoteId: number,
  companyId: number,
  fn: (quote: Quote, tx: Db) => Promise<T>,
): Promise<T> {
  return db.withAudit(ctx, procedure, async tx => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
    // companyId is the actual company returned by the route's tenant guard.
    if (quote.companyId !== companyId) throw new TRPCError({ code: "FORBIDDEN" });
    if (quote.quoteType === "repair") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Use the repair quote workflow." });
    }
    return fn(quote, tx);
  });
}

export async function assertStandardQuoteEditable(quote: Quote, tx: Db): Promise<void> {
  if (quote.status !== "draft") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft quotes can be edited." });
  }
  // sentAt also protects legacy rows whose status was reset to draft.
  if (quote.finalizedAt || quote.sentAt || quote.acceptedAt || quote.approvedAt) {
    throw new TRPCError({ code: "CONFLICT", message: "This quote's content is sealed. Create a new quote to change the scope." });
  }
  // Legacy sends may have been accepted while the final status write failed,
  // before standard quotes acquired a durable finalizedAt seal.
  const [attempt] = await tx.select({ id: emailOutbox.id }).from(emailOutbox).where(and(
    eq(emailOutbox.entityType, "quote"),
    eq(emailOutbox.entityId, quote.id),
    eq(emailOutbox.companyId, quote.companyId),
    inArray(emailOutbox.status, ["sending", "unknown", "accepted"]),
  )).limit(1);
  if (attempt) {
    throw new TRPCError({ code: "CONFLICT", message: "This quote has a delivery attempt and its content cannot be changed. Reconcile the existing delivery first." });
  }
}

export function assertStandardQuoteStatusTransition(quote: Quote, next: "draft" | "sent" | "accepted" | "declined"): void {
  if (quote.quoteType !== "building") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This is not a building quote." });
  }
  if (next === quote.status) return;
  const allowed = quote.status === "draft"
    ? ["sent"]
    : quote.status === "sent" || quote.status === "viewed"
      ? ["accepted", "declined"]
      : [];
  if (!allowed.includes(next)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This quote status cannot be changed through this workflow. Create a new quote for a revised scope." });
  }
}

/** Serialize competing customer decisions with content/status changes. */
export async function withLockedQuoteDecision<T>(
  quoteId: number,
  fn: (quote: Quote, tx: Pick<Db, "select" | "update">) => Promise<T>,
): Promise<T> {
  const database = await db.getDb();
  if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return database.transaction(async tx => {
    const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for("update");
    if (!quote) throw new TRPCError({ code: "NOT_FOUND", message: "Quote not found" });
    return fn(quote, tx);
  });
}

export async function assertQuoteAvailableForDecision(quote: Quote, tx: Pick<Db, "select">): Promise<void> {
  if (quote.quoteType === "repair" && !quote.finalizedAt) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Finalize the repair quote before customer approval." });
  }
  if (["sent", "viewed"].includes(quote.status)) return;
  // A customer can follow an already emailed link even when the final sent
  // status write failed. Only a durable, well-formed accepted receipt proves it.
  if (quote.quoteType !== "repair" && quote.status === "draft" && quote.finalizedAt) {
    const attempts = await tx.select({ providerMessageId: emailOutbox.providerMessageId }).from(emailOutbox).where(and(
      eq(emailOutbox.entityType, "quote"), eq(emailOutbox.entityId, quote.id),
      eq(emailOutbox.companyId, quote.companyId), eq(emailOutbox.status, "accepted"),
    ));
    if (attempts.some(attempt => typeof attempt.providerMessageId === "string" && attempt.providerMessageId.trim())) return;
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "This quote is not available for a customer decision." });
}
