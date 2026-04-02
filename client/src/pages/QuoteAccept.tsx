/**
 * QuoteAccept.tsx
 *
 * Public (no-auth) page reachable at /quote/accept?token=<token>
 * Submits the token to the tRPC quote.accept endpoint and shows the result.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Shield } from "lucide-react";
import { APP_NAME } from "../../../shared/constants";

export default function QuoteAccept() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const acceptMutation = trpc.quote.accept.useMutation();

  useEffect(() => {
    if (token) {
      acceptMutation.mutate({ token });
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPending = acceptMutation.isPending;
  const isSuccess = acceptMutation.isSuccess;
  const isError = acceptMutation.isError;
  const alreadyAccepted = acceptMutation.data?.alreadyAccepted;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Brand header */}
      <div className="flex items-center gap-2 mb-8">
        <Shield className="h-8 w-8 text-primary" />
        <span className="font-bold text-2xl">{APP_NAME}</span>
      </div>

      <Card className="w-full max-w-md">
        <CardContent className="py-12 flex flex-col items-center gap-4 text-center">
          {!token && (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <h1 className="text-xl font-bold">Invalid Link</h1>
              <p className="text-muted-foreground">
                This quote link is missing a token. Please use the link from your email.
              </p>
            </>
          )}

          {token && isPending && (
            <>
              <Loader2 className="h-16 w-16 text-primary animate-spin" />
              <h1 className="text-xl font-bold">Processing…</h1>
              <p className="text-muted-foreground">Please wait while we confirm your acceptance.</p>
            </>
          )}

          {token && isSuccess && (
            <>
              <CheckCircle2 className="h-16 w-16 text-green-600" />
              <h1 className="text-xl font-bold text-green-700">
                {alreadyAccepted ? "Already Accepted" : "Quote Accepted!"}
              </h1>
              <p className="text-muted-foreground">
                {alreadyAccepted
                  ? "This quote was already accepted. Our team will be in touch shortly."
                  : "Thank you — your quote has been accepted. Our team will contact you to schedule the repair work."}
              </p>
            </>
          )}

          {token && isError && (
            <>
              <XCircle className="h-16 w-16 text-destructive" />
              <h1 className="text-xl font-bold">Unable to Accept</h1>
              <p className="text-muted-foreground">
                {acceptMutation.error?.message ?? "Something went wrong. Please try again or contact us."}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
