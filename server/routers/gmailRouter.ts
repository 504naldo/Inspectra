import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminOrOfficeProcedure } from "../_core/trpc";
import * as db from "../db";
import { getValidGoogleToken } from "../_core/googleAuth";
import { storageGet } from "../storage";

/**
 * Build a MIME message with PDF attachment for Gmail API.
 * Gmail API accepts base64url-encoded MIME messages.
 */
function buildMimeMessage(opts: {
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachmentName: string;
  attachmentBase64: string;
}): string {
  const boundary = "inspectra_boundary_" + Date.now();

  const parts: string[] = [];
  parts.push(`From: ${opts.from}`);
  parts.push(`To: ${opts.to}`);
  parts.push(`Subject: ${opts.subject}`);
  parts.push(`MIME-Version: 1.0`);
  parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  parts.push("");

  // Text/HTML body
  parts.push(`--${boundary}`);
  if (opts.bodyHtml) {
    parts.push(`Content-Type: text/html; charset="UTF-8"`);
    parts.push("");
    parts.push(opts.bodyHtml);
  } else {
    parts.push(`Content-Type: text/plain; charset="UTF-8"`);
    parts.push("");
    parts.push(opts.bodyText);
  }

  // PDF attachment
  parts.push(`--${boundary}`);
  parts.push(`Content-Type: application/pdf; name="${opts.attachmentName}"`);
  parts.push(`Content-Disposition: attachment; filename="${opts.attachmentName}"`);
  parts.push(`Content-Transfer-Encoding: base64`);
  parts.push("");
  parts.push(opts.attachmentBase64);

  parts.push(`--${boundary}--`);

  return parts.join("\r\n");
}

/**
 * Convert a standard base64 string to base64url (Gmail API requires this).
 */
function base64ToBase64url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const gmailRouter = router({
  /**
   * Send a report PDF via the admin's Gmail account.
   */
  sendReport: adminOrOfficeProcedure
    .input(z.object({
      jobId: z.number(),
      reportId: z.number(),
      recipientEmail: z.string().email(),
      recipientName: z.string().optional(),
      subject: z.string().min(1),
      body: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      // 1. Get a valid Google token for the current user
      const accessToken = await getValidGoogleToken(ctx.user.id);
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google account not connected or token expired. Please log out and log back in to reconnect your Google account.",
        });
      }

      // 2. Get the report and its PDF URL
      const report = await db.getReportById(input.reportId);
      if (!report) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
      }
      if (!report.fileUrl && !report.fileKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Report has no generated PDF. Generate the report first.",
        });
      }

      // 3. Download the PDF from S3
      let pdfBuffer: Buffer;
      try {
        const pdfUrl = report.fileUrl || (await storageGet(report.fileKey!)).url;
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
        }
        pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      } catch (error) {
        console.error("[Gmail] Failed to download report PDF:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve the report PDF. Try regenerating the report.",
        });
      }

      // 4. Get job and site info for the email
      const job = await db.getJobById(input.jobId);
      const site = job ? await db.getSiteById(job.siteId) : null;

      const fileName = `${site?.name || "Inspection"} - ${report.reportNumber || "Report"}.pdf`;

      // 5. Build HTML email body
      const htmlBody = `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #16324F; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">Inspectra — Inspection Report</h2>
          </div>
          <div style="padding: 24px; border: 1px solid #D7DEE7; border-top: none; border-radius: 0 0 8px 8px;">
            <p>${input.body.replace(/\n/g, "<br>")}</p>
            <hr style="border: none; border-top: 1px solid #D7DEE7; margin: 20px 0;" />
            <table style="font-size: 14px; color: #5B6472;">
              ${site ? `<tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Site:</td><td>${site.name}</td></tr>` : ""}
              ${site?.address ? `<tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Address:</td><td>${site.address}${site.city ? `, ${site.city}` : ""}</td></tr>` : ""}
              ${job?.jobNumber ? `<tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Job #:</td><td>${job.jobNumber}</td></tr>` : ""}
              ${report.reportNumber ? `<tr><td style="padding: 4px 12px 4px 0; font-weight: 600;">Report #:</td><td>${report.reportNumber}</td></tr>` : ""}
            </table>
            <p style="font-size: 13px; color: #5B6472; margin-top: 20px;">
              The inspection report is attached as a PDF. If you have any questions, please reply to this email.
            </p>
          </div>
        </div>
      `;

      // 6. Build MIME message
      const mimeMessage = buildMimeMessage({
        from: ctx.user.email || "noreply@inspectrafire.ca",
        to: input.recipientEmail,
        subject: input.subject,
        bodyText: input.body,
        bodyHtml: htmlBody,
        attachmentName: fileName,
        attachmentBase64: pdfBuffer.toString("base64"),
      });

      // 7. Send via Gmail API
      const encodedMessage = base64ToBase64url(
        Buffer.from(mimeMessage).toString("base64")
      );

      try {
        const gmailResponse = await fetch(
          "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ raw: encodedMessage }),
          }
        );

        if (!gmailResponse.ok) {
          const errorBody = await gmailResponse.text().catch(() => "");
          console.error("[Gmail] Send failed:", gmailResponse.status, errorBody);

          if (gmailResponse.status === 401 || gmailResponse.status === 403) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Gmail permission denied. Please log out and log back in to reconnect your Google account with email permissions.",
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to send email via Gmail. Please try again.",
          });
        }

        const result = (await gmailResponse.json()) as {
          id: string;
          threadId: string;
          labelIds: string[];
        };

        // Mark the report as sent so the status reflects delivery.
        await db.updateReport(input.reportId, { status: "sent" });

        return {
          success: true,
          messageId: result.id,
          threadId: result.threadId,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        console.error("[Gmail] Send error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send email. Please try again.",
        });
      }
    }),

  /**
   * Check if the current user has Gmail connected.
   */
  checkConnection: adminOrOfficeProcedure.query(async ({ ctx }) => {
    const token = await getValidGoogleToken(ctx.user.id);
    return { connected: token !== null };
  }),
});
