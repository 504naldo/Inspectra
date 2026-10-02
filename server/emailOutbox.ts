import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { emailOutbox } from "../drizzle/schema";
import { getDb } from "./db";
export class EmailProviderRejected extends Error {}
/** Reserve durably before sending. Ambiguous attempts require reconciliation, never replay. */
export async function sendEmailOnce(operation: {
  requestId: string;
  companyId: number;
  userId: number;
  entityType: string;
  entityId: number;
  provider: string;
  payload: unknown;
  send: () => Promise<{ id: string }>;
}) {
  const database = await getDb();
  if (!database)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Delivery tracking unavailable",
    });
  const { send, payload, ...identity } = operation;
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ ...identity, payload }))
    .digest("hex");
  let reserved = false;
  try {
    await database.insert(emailOutbox).values({ ...identity, payloadHash });
    reserved = true;
  } catch (error) {
    const cause = error as { cause?: { code?: string }; code?: string };
    if ((cause.cause?.code ?? cause.code) !== "ER_DUP_ENTRY") throw error;
  }
  const [row] = await database
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.requestId, operation.requestId))
    .limit(1);
  if (
    !row ||
    row.payloadHash !== payloadHash ||
    row.userId !== identity.userId ||
    row.companyId !== identity.companyId
  )
    throw new TRPCError({
      code: "CONFLICT",
      message: "Send operation ID belongs to different input or account",
    });
  if (!reserved) {
    if (row.status === "accepted" && row.providerMessageId)
      return { id: row.providerMessageId, acceptance: "accepted" as const };
    throw new TRPCError({
      code: "CONFLICT",
      message:
        row.status === "rejected"
          ? "Provider rejected this attempt. Start a new explicit send after fixing the problem."
          : "Delivery outcome needs reconciliation. This operation will not be sent again.",
    });
  }
  try {
    const response = await send();
    if (!response.id) throw new Error("Provider response has no message ID");
    await database
      .update(emailOutbox)
      .set({ status: "accepted", providerMessageId: response.id })
      .where(eq(emailOutbox.id, row.id));
    return { id: response.id, acceptance: "accepted" as const };
  } catch (error) {
    await database
      .update(emailOutbox)
      .set({
        status: error instanceof EmailProviderRejected ? "rejected" : "unknown",
      })
      .where(eq(emailOutbox.id, row.id))
      .catch(() => {});
    throw error;
  }
}
