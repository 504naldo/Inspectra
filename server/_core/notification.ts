// Email notifications via Resend — replaces Manus notification proxy
//
// Env: RESEND_API_KEY, NOTIFICATION_EMAIL
//
// If RESEND_API_KEY is not set, notifications are silently skipped
// (same graceful degradation as the Manus version).

import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Send an email notification to the configured recipient.
 *
 * Returns `true` if the email was accepted, `false` if the service is
 * unavailable or not configured. Validation errors bubble up as TRPCErrors.
 *
 * Drop-in replacement for the Manus notifyOwner() — same signature, same behavior.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.resendApiKey) {
    // Not configured — skip silently (same as Manus version when forge URL was missing)
    if (!ENV.isProduction) {
      console.log("[Notification] RESEND_API_KEY not set, skipping notification:", title);
    }
    return false;
  }

  const to = ENV.notificationEmail;
  if (!to) {
    console.warn("[Notification] NOTIFICATION_EMAIL not set, cannot send");
    return false;
  }

  try {
    // Use Resend's REST API directly to avoid adding a heavy SDK
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Inspectra <noreply@inspectrafire.ca>",
        to: [to],
        subject: title,
        text: content,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Email send failed (${response.status} ${response.statusText})${
          detail ? `: ${detail}` : ""
        }`
      );
      return false;
    }

    return true;
  } catch (error) {
    console.warn("[Notification] Error sending email:", error);
    return false;
  }
}
