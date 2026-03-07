/**
 * emailService.ts
 * Sends report notifications via the Manus notification channel.
 * Uses notifyOwner() which dispatches to the app owner (reports@ewandf.ca).
 * Set REPORT_NOTIFICATIONS=true in environment to activate.
 */
import { notifyOwner } from "./_core/notification";

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
    // Log but do not throw — notification failure must not break report generation
    console.error("[emailService] Failed to send report notification:", err);
  }
}
