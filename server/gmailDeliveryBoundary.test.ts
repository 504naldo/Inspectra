import { beforeEach, expect, it, vi } from "vitest";
import { gmailRouter, buildMimeMessage } from "./routers/gmailRouter";
import * as db from "./db";
import { getJobForCompany } from "./tenantGuards";
import { getValidGoogleToken } from "./_core/googleAuth";
import { resolveDocumentUrl } from "./documentUrl";
import { sendEmailOnce } from "./emailOutbox";
import type { TrpcContext } from "./_core/context";
import { TRPCError } from "@trpc/server";

vi.mock("./db", () => ({ getReportById: vi.fn(), getSiteById: vi.fn(), getDb: vi.fn() }));
vi.mock("./tenantGuards", () => ({ getJobForCompany: vi.fn() }));
vi.mock("./_core/googleAuth", () => ({ getValidGoogleToken: vi.fn() }));
vi.mock("./documentUrl", () => ({ resolveDocumentUrl: vi.fn() }));
vi.mock("./_core/ssrfGuard", () => ({ assertPublicHttpUrl: vi.fn() }));
vi.mock("./emailOutbox", () => ({ sendEmailOnce: vi.fn(), EmailProviderRejected: class extends Error {} }));
const input = { requestId: "123e4567-e89b-42d3-a456-426614174000", jobId: 20, reportId: 30, recipientEmail: "customer@example.com", subject: "Captured report", body: "<img src=x onerror=bad()>\n& text" };
const ctx = { user: { id: 7, companyId: 10, role: "office", email: "office@example.com" }, req: { headers: {} }, res: {} } as unknown as TrpcContext;
let metadata: ReturnType<typeof vi.fn>, fetchMock: ReturnType<typeof vi.fn>;
let events: string[];
function caller() { return gmailRouter.createCaller(ctx); }
beforeEach(() => {
  vi.resetAllMocks(); events = [];
  vi.mocked(db.getReportById).mockResolvedValue({ id: 30, jobId: 20, fileKey: "report/key", reportNumber: "R-1" } as any);
  vi.mocked(getJobForCompany).mockImplementation(async () => { events.push("scope"); return { id: 20, companyId: 10, siteId: 40, jobNumber: "J-1" } as any; });
  vi.mocked(db.getSiteById).mockResolvedValue({ name: "<Site>", address: "A & B" } as any);
  vi.mocked(getValidGoogleToken).mockImplementation(async () => { events.push("token"); return "token"; });
  vi.mocked(resolveDocumentUrl).mockResolvedValue("https://storage.example/report.pdf");
  metadata = vi.fn().mockResolvedValue(undefined);
  vi.mocked(db.getDb).mockResolvedValue({ update: () => ({ set: () => ({ where: metadata }) }) } as any);
  fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Buffer.from("pdf") }).mockResolvedValueOnce({ ok: true, json: async () => ({ id: "provider-1" }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(sendEmailOnce).mockImplementation(async operation => { events.push("reserve"); const result = await operation.send(); return { ...result, acceptance: "accepted" }; });
});
it("denies foreign report parents before OAuth, storage, reservation or provider work", async () => {
  vi.mocked(getJobForCompany).mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
  await expect(caller().sendReport(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(getValidGoogleToken).not.toHaveBeenCalled(); expect(sendEmailOnce).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects mismatched declared and actual jobs before reservation or provider work", async () => {
  await expect(caller().sendReport({ ...input, jobId: 21 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(getValidGoogleToken).not.toHaveBeenCalled(); expect(sendEmailOnce).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled();
});
it("replays accepted receipts without OAuth, PDF, storage or provider availability", async () => {
  vi.mocked(db.getReportById).mockResolvedValue({ id: 30, jobId: 20, fileKey: null, fileUrl: null } as any);
  vi.mocked(sendEmailOnce).mockResolvedValue({ id: "already-accepted", acceptance: "accepted" });
  expect(await caller().sendReport(input)).toMatchObject({ messageId: "already-accepted", acceptance: "accepted" });
  expect(getValidGoogleToken).not.toHaveBeenCalled(); expect(resolveDocumentUrl).not.toHaveBeenCalled(); expect(fetchMock).not.toHaveBeenCalled(); expect(metadata).toHaveBeenCalledOnce();
});
it("reserves before preparation and escapes recorded plain text in the MIME HTML", async () => {
  expect(await caller().sendReport(input)).toMatchObject({ messageId: "provider-1" });
  expect(events).toEqual(["scope", "reserve", "token"]);
  const raw = JSON.parse(fetchMock.mock.calls[1][1].body).raw;
  const mime = Buffer.from(raw, "base64url").toString();
  expect(mime).toContain("&lt;img src=x onerror=bad()&gt;<br>&amp; text");
  expect(mime).toContain("&lt;Site&gt;"); expect(mime).not.toContain("<img src=x");
  expect(sendEmailOnce).toHaveBeenCalledWith(expect.objectContaining({ companyId: 10, entityId: 30, payload: input }));
});
it("records acceptance only for draft/generated rows so later QA/archival decisions survive replay", async () => {
  vi.mocked(sendEmailOnce).mockResolvedValue({ id: "already-accepted", acceptance: "accepted" });
  await caller().sendReport(input);
  const { MySqlDialect } = await import("drizzle-orm/mysql-core");
  const sql = new MySqlDialect().sqlToQuery(metadata.mock.calls[0][0]);
  expect(sql.sql).toContain("jobId"); expect(sql.params).toEqual([30, 20, "draft", "generated"]);
});
it("keeps a receipt recoverable when the following metadata write fails", async () => {
  vi.mocked(sendEmailOnce).mockResolvedValue({ id: "already-accepted", acceptance: "accepted" });
  metadata.mockRejectedValueOnce(new Error("lost metadata response"));
  await expect(caller().sendReport(input)).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  await expect(caller().sendReport(input)).resolves.toMatchObject({ messageId: "already-accepted" });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not allow a quoted filename to create another MIME parameter", () => {
  const mime = buildMimeMessage({ from: "office@example.com", to: "customer@example.com", subject: "Report", bodyText: "Report", attachmentName: 'report"; filename="other.pdf', attachmentBase64: "AAAA" });
  expect(mime).toContain('filename="report_; filename=_other.pdf"');
});
