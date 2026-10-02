import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function setup(enabled: string | undefined) {
  vi.resetModules();
  vi.stubEnv("EMAIL_AUTOMATION_ENABLED", enabled);
  vi.stubEnv("REPORT_NOTIFICATIONS", "true");
  // Fake configured credentials ensure the safety pause, not missing keys,
  // prevents delivery. No test ever contacts an email provider.
  vi.stubEnv("RESEND_API_KEY", "test-key-not-a-credential");
  vi.stubEnv("NOTIFICATION_EMAIL", "owner@example.com");
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  const service = await import("./emailService");
  return { service, fetchMock };
}

async function triggerAutomation(service: typeof import("./emailService")) {
  await service.sendPortalInvite({ email: "customer@example.com", name: "Customer", portalUrl: "https://example.com" });
  await service.sendJobScheduledEmail({ to: "customer@example.com", customerName: "Customer", siteName: "Site",
    jobNumber: "J-1", scheduledDate: new Date("2026-01-01T00:00:00Z"), portalUrl: "https://example.com" });
  await service.sendReportReadyEmail({ to: "customer@example.com", customerName: "Customer", siteName: "Site",
    jobNumber: "J-1", reportType: "annual", portalUrl: "https://example.com" });
  await service.sendReportEmail({ siteName: "Site", jobNumber: "J-1", reportType: "annual", pdfUrl: "https://example.com/report.pdf" });
  await service.sendQuoteApprovedNotification({ quoteNumber: "Q-1", siteName: "Site", total: 100,
    approvedByName: "Customer", approvedByEmail: "customer@example.com" });
  await service.sendReportApprovedNotification({ reportNumber: "R-1", reportTitle: "Annual", siteName: "Site",
    jobNumber: "J-1", approvedByName: "Customer", approvedByEmail: "customer@example.com" });
}

describe("Email automation safety pause", () => {
  it.each([undefined, "false", "TRUE", "1", "", " true "])("suppresses all automatic sends when opt-in is %s", async enabled => {
    const { service, fetchMock } = await setup(enabled);
    await expect(triggerAutomation(service)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows all six automation paths only after an explicit true opt-in", async () => {
    const { service, fetchMock } = await setup("true");
    await triggerAutomation(service);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    for (const [url, options] of fetchMock.mock.calls) {
      expect(url).toBe("https://api.resend.com/emails");
      expect(options.method).toBe("POST");
    }
  });

  it("does not override the report-notification opt-out when automation is enabled", async () => {
    const { service, fetchMock } = await setup("true");
    vi.stubEnv("REPORT_NOTIFICATIONS", "false");
    await service.sendReportEmail({ siteName: "Site", jobNumber: "J-1", reportType: "annual", pdfUrl: "https://example.com/report.pdf" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves explicitly initiated owner notifications while automation is paused", async () => {
    const { fetchMock } = await setup("false");
    const { notifyOwner } = await import("./_core/notification");
    await expect(notifyOwner({ title: "Manual notification", content: "Sent deliberately" })).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
