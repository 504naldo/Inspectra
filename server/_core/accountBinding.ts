import { TRPCError } from "@trpc/server";
import { ACCOUNT_CHANGED_MESSAGE, expectedAccount, sameExpectedAccount } from "../../shared/accountBinding";
import type { TrpcContext } from "./context";

/** HTTP mutations require an actor; supplied query/logout actors must also match.
 * Internal jobs and direct callers have no HTTP marker and retain their own auth flow.
 */
export function assertAccountBinding(ctx: TrpcContext, required: boolean): void {
  if (!ctx.user || !ctx.requireAccountBinding || (!required && !ctx.expectedAccountProvided)) return;
  if (!ctx.expectedAccount || !sameExpectedAccount(ctx.expectedAccount, expectedAccount(ctx.user))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: ACCOUNT_CHANGED_MESSAGE });
  }
}
