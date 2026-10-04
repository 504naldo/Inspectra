import { beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import * as db from "./db";
import { emailOutbox } from "../drizzle/schema";
import { EmailProviderRejected, sendEmailOnce } from "./emailOutbox";

describe("Durable manual delivery tracking (disposable MySQL, fake providers)", () => {
  let companyId: number;
  beforeAll(async () => {
    companyId = (await db.createCompany({ name: "Outbox fixture" })).id;
  });
  function operation(send: () => Promise<{ id: string }>) {
    return {
      requestId: crypto.randomUUID(),
      companyId,
      userId: 1,
      entityType: "invoice",
      entityId: 1,
      provider: "fixture",
      payload: { to: "recipient@example.test" },
      send,
    };
  }
  it("records acceptance and returns it on retry without sending again after application-state failure", async () => {
    const send = vi.fn(async () => ({ id: "accepted-message" })),
      input = operation(send);
    await expect(
      (async () => {
        await sendEmailOnce(input);
        throw new Error("application state update failed");
      })()
    ).rejects.toThrow("application state update failed");
    expect(await sendEmailOnce(input)).toEqual({
      id: "accepted-message",
      acceptance: "accepted",
    });
    expect(send).toHaveBeenCalledTimes(1);
    const [row] = await (await db.getDb())!
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.requestId, input.requestId));
    expect(row).toMatchObject({
      status: "accepted",
      providerMessageId: "accepted-message",
    });
  });
  it.each([401, 429])(
    "confirmed HTTP %i rejection is tracked without automatic resend",
    async status => {
      const send = vi.fn(async () => {
          throw new EmailProviderRejected(`HTTP ${status}`);
        }),
        input = operation(send);
      await expect(sendEmailOnce(input)).rejects.toThrow(`HTTP ${status}`);
      await expect(sendEmailOnce(input)).rejects.toThrow(/rejected/);
      expect(send).toHaveBeenCalledTimes(1);
    }
  );
  it("HTTP 500/network ambiguity blocks retry until reconciliation", async () => {
    const send = vi.fn(async () => {
        throw new Error("HTTP 500");
      }),
      input = operation(send);
    await expect(sendEmailOnce(input)).rejects.toThrow("HTTP 500");
    await expect(sendEmailOnce(input)).rejects.toThrow(/reconciliation/);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("request IDs cannot be reused for different payloads or accounts", async () => {
    const input = operation(vi.fn(async () => ({ id: "accepted" })));
    await sendEmailOnce(input);
    await expect(
      sendEmailOnce({ ...input, payload: { to: "another@example.test" } })
    ).rejects.toThrow(/different input/);
    await expect(sendEmailOnce({ ...input, userId: 2 })).rejects.toThrow(
      /different input/
    );
  });
  it("simultaneous calls reserve one provider attempt", async () => {
    const send = vi.fn(async () => ({ id: "once" })),
      input = operation(send);
    const outcomes = await Promise.allSettled([
      sendEmailOnce(input),
      sendEmailOnce(input),
    ]);
    expect(outcomes.some(result => result.status === "fulfilled")).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("an outbox database failure after provider acceptance leaves an ambiguous operation that cannot resend", async () => {
    const database = (await db.getDb())!,
      send = vi.fn(async () => ({ id: "accepted-but-not-recorded" })),
      input = operation(send);
    await database.execute(
      sql.raw(
        `CREATE TRIGGER audit_outbox_test_failure BEFORE UPDATE ON email_outbox FOR EACH ROW BEGIN IF NEW.requestId = '${input.requestId}' AND NEW.status = 'accepted' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fixture database failure'; END IF; END`
      )
    );
    try {
      await expect(sendEmailOnce(input)).rejects.toThrow();
      await expect(sendEmailOnce(input)).rejects.toThrow(/reconciliation/);
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      await database.execute(sql.raw("DROP TRIGGER audit_outbox_test_failure"));
    }
  });
});
