/**
 * emailService.ts
 * Transactional email functions for Inspectra.
 *
 * All customer-facing emails go through sendEmail() which uses Resend's REST API
 * and requires RESEND_API_KEY to be set.  Functions fail silently when the key
 * is absent so they are safe to call in all environments.
 *
 * Owner-notification emails (report generated → reports@ewandf.ca) use
 * notifyOwner() from _core/notification and are gated by REPORT_NOTIFICATIONS=true.
 */
import { notifyOwner } from "./_core/notification";
import { ENV } from "./_core/env";

// ─── Internal helper ──────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!ENV.resendApiKey) {
    if (!ENV.isProduction) console.log("[email] RESEND_API_KEY not set, skipping:", subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Inspectra <noreply@inspectrafire.ca>",
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      console.warn(`[email] Send failed (${res.status}):`, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[email] Error:", err);
    return false;
  }
}

// ─── Owner notifications ──────────────────────────────────────────────────────

export interface ReportEmailOptions {
  siteName: string;
  jobNumber: string;
  reportType: "annual" | "compliance";
  pdfUrl: string;
}

export async function sendReportEmail(opts: ReportEmailOptions): Promise<void> {
  if (process.env.REPORT_NOTIFICATIONS !== "true") return;

  const title =
    opts.reportType === "annual"
      ? `Annual Inspection Report Ready: ${opts.siteName} (${opts.jobNumber})`
      : `Compliance/Deficiency Report Ready: ${opts.siteName} (${opts.jobNumber})`;

  const content = [
    `A new ${opts.reportType === "annual" ? "Annual Inspection" : "Compliance/Deficiency"} report has been generated.`,
    ``,
    `Site:       ${opts.siteName}`,
    `Job Number: ${opts.jobNumber}`,
    ``,
    `Download PDF: ${opts.pdfUrl}`,
  ].join("\n");

  try {
    await notifyOwner({ title, content });
  } catch (err) {
    console.error("[emailService] Failed to send report notification:", err);
  }
}

// ─── Customer-facing emails ───────────────────────────────────────────────────

export async function sendPortalInvite(opts: {
  email: string;
  name: string;
  portalUrl: string;
}): Promise<void> {
  const { email, name, portalUrl } = opts;
  const subject = "You've been invited to the Inspectra Customer Portal";
  const text = [
    `Hi ${name},`,
    ``,
    `You now have access to the Inspectra Customer Portal, where you can view inspection reports, track deficiencies, and monitor upcoming inspections at your sites.`,
    ``,
    `Portal: ${portalUrl}`,
    ``,
    `Sign in using your Google account (${email}).`,
    ``,
    `If you have any questions, please contact your inspection provider.`,
    ``,
    `— Inspectra`,
  ].join("\n");

  try {
    await sendEmail(email, subject, text);
  } catch (err) {
    console.error("[emailService] Failed to send portal invite:", err);
  }
}

export async function sendReportReadyEmail(opts: {
  to: string;
  customerName: string;
  siteName: string;
  jobNumber: string;
  reportType: "annual" | "compliance";
  portalUrl: string;
}): Promise<void> {
  const { to, customerName, siteName, jobNumber, reportType, portalUrl } = opts;
  const label = reportType === "annual" ? "Annual Inspection" : "Compliance/Deficiency";
  const subject = `${label} Report Ready: ${siteName} (${jobNumber})`;
  const text = [
    `Hi ${customerName},`,
    ``,
    `A new ${label} report is ready for your review.`,
    ``,
    `Site:       ${siteName}`,
    `Job Number: ${jobNumber}`,
    ``,
    `View your report in the customer portal:`,
    `${portalUrl}/reports`,
    ``,
    `— Inspectra`,
  ].join("\n");

  try {
    await sendEmail(to, subject, text);
  } catch (err) {
    console.error("[emailService] Failed to send report ready email:", err);
  }
}

export async function sendQuoteApprovedNotification(opts: {
  quoteNumber: string;
  siteName: string;
  total: number | string;
  approvedByName: string;
  approvedByEmail: string;
}): Promise<void> {
  const { quoteNumber, siteName, total, approvedByName, approvedByEmail } = opts;
  const title = `Quote Approved via Portal: ${siteName} (${quoteNumber})`;
  const content = [
    `A customer has approved a quote through the portal.`,
    ``,
    `Quote:       ${quoteNumber}`,
    `Site:        ${siteName}`,
    `Total:       $${Number(total).toFixed(2)}`,
    `Approved by: ${approvedByName} <${approvedByEmail}>`,
    `Approved at: ${new Date().toLocaleString("en-CA")}`,
  ].join("\n");

  try {
    await notifyOwner({ title, content });
  } catch (err) {
    console.error("[emailService] Failed to send quote approved notification:", err);
  }
}

export async function sendReportApprovedNotification(opts: {
  reportNumber: string;
  reportTitle: string;
  siteName: string;
  jobNumber: string;
  approvedByName: string;
  approvedByEmail: string;
}): Promise<void> {
  const { reportNumber, reportTitle, siteName, jobNumber, approvedByName, approvedByEmail } = opts;
  const title = `Report Approved by Customer: ${siteName} (${jobNumber})`;
  const content = [
    `A customer has approved an inspection report in the portal.`,
    ``,
    `Report:     ${reportTitle} (${reportNumber})`,
    `Site:       ${siteName}`,
    `Job Number: ${jobNumber}`,
    `Approved by: ${approvedByName} <${approvedByEmail}>`,
    `Approved at: ${new Date().toLocaleString("en-CA")}`,
  ].join("\n");

  try {
    await notifyOwner({ title, content });
  } catch (err) {
    console.error("[emailService] Failed to send report approved notification:", err);
  }
}

export async function sendJobScheduledEmail(opts: {
  to: string;
  customerName: string;
  siteName: string;
  jobNumber: string;
  scheduledDate: Date;
  portalUrl: string;
}): Promise<void> {
  const { to, customerName, siteName, jobNumber, scheduledDate, portalUrl } = opts;
  const dateStr = scheduledDate.toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const subject = `Inspection Scheduled: ${siteName} — ${dateStr}`;
  const text = [
    `Hi ${customerName},`,
    ``,
    `An inspection has been scheduled at one of your sites.`,
    ``,
    `Site:       ${siteName}`,
    `Date:       ${dateStr}`,
    `Job Number: ${jobNumber}`,
    ``,
    `You can track this inspection in your customer portal:`,
    `${portalUrl}`,
    ``,
    `— Inspectra`,
  ].join("\n");

  try {
    await sendEmail(to, subject, text);
  } catch (err) {
    console.error("[emailService] Failed to send job scheduled email:", err);
  }
}
