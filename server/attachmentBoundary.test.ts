import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import formidable from "formidable";
import type { Request, Response } from "express";
import { sites, customerOrgs, type Attachment } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import { callerIsPlatformOperator } from "./_core/actorContext";
import {
  assertAttachmentDestination,
  withAttachmentWrite,
} from "./attachmentAccess";
import {
  attachmentRouter,
  uploadQueueRouter,
} from "./routers/attachmentRouters";
import { mediaRouter } from "./routers/mediaRouter";
import { filesRouter } from "./routers/filesRouter";
import { documentCenterRouter } from "./routers/documentCenterRouter";
import { storagePut } from "./storage";
import { handleMultipartUpload } from "./_core/upload";
import { sdk } from "./_core/sdk";
import { EXPECTED_ACCOUNT_HEADER, expectedAccount, serializeExpectedAccount } from "../shared/accountBinding";

const form = vi.hoisted(() => ({ parse: vi.fn(), on: vi.fn() }));
vi.mock("formidable", () => ({ default: vi.fn(() => form) }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));
vi.mock("./storage", () => ({ storagePut: vi.fn(), storageGet: vi.fn() }));
vi.mock("./activityLogger", () => ({ logActivity: vi.fn() }));
vi.mock("./db", () => ({
  withAudit: vi.fn(),
  getDb: vi.fn(),
  assertJobNotFinalized: vi.fn(),
  assertJobCompany: vi.fn(),
  getJobById: vi.fn(),
  getSiteById: vi.fn(),
  getCustomerOrgById: vi.fn(),
  getDeviceById: vi.fn(),
  getInspectionResultById: vi.fn(),
  getDeficiencyById: vi.fn(),
  getRepairById: vi.fn(),
  getAttachmentById: vi.fn(),
  getAttachmentsByEntity: vi.fn(),
  getAttachmentsByJob: vi.fn(),
  getAttachmentsBySite: vi.fn(),
  getAttachmentsByDevice: vi.fn(),
  getAttachmentByIdempotencyKey: vi.fn(),
  createAttachment: vi.fn(),
  updateAttachment: vi.fn(),
  updateAttachmentTags: vi.fn(),
  deleteAttachment: vi.fn(),
  getUploadQueueItemById: vi.fn(),
  getUploadQueueItemByLocalId: vi.fn(),
  createUploadQueueItem: vi.fn(),
  updateUploadQueueItem: vi.fn(),
  getUploadQueueByUser: vi.fn(),
  getPendingUploads: vi.fn(),
}));

const ctx = {
  user: { id: 7, role: "office", companyId: 1, customerOrgId: null, sessionVersion: 1 },
  req: { headers: {} },
  res: {},
} as unknown as TrpcContext;
const caller = attachmentRouter.createCaller(ctx);
const queue = uploadQueueRouter.createCaller(ctx);
const media = mediaRouter.createCaller(ctx);
const files = filesRouter.createCaller(ctx);
const documents = documentCenterRouter.createCaller(ctx);
const upload = {
  entityType: "job" as const,
  entityId: 1,
  fileName: "photo.jpg",
  fileData: "aGVsbG8=",
  mimeType: "image/jpeg",
};
const queueItem = {
  id: 88,
  userId: 7,
  entityType: "job",
  entityId: 1,
  localFileId: "local-1",
  fileName: "photo.jpg",
  retryCount: 0,
};
const jobRows = [
  { id: 1, companyId: 1, siteId: 10, customerOrgId: 100 },
  { id: 2, companyId: 1, siteId: 20, customerOrgId: 100 },
  { id: 3, companyId: 3, siteId: 30, customerOrgId: 300 },
  { id: 4, companyId: 1, siteId: 10, customerOrgId: 100 },
];
const siteRows = [
  { id: 10, companyId: 1, customerOrgId: 100 },
  { id: 20, companyId: 1, customerOrgId: 100 },
  { id: 30, companyId: 3, customerOrgId: 300 },
];
let records: Attachment[];
let inTransaction: boolean;
let sealed: boolean;
let events: string[];
let tempDirectory: string;
let tempFile: string;
let beginFile: ((name: string, file: { filepath: string }) => void) | undefined;
const insertValues = vi.fn();
const rawUpdate = vi.fn();
const parentLock = vi.fn();
const tx = {
  select: () => ({
    from: (table: unknown) => ({
      where: () => ({ for: () => parentLock(table) }),
    }),
  }),
  insert: () => ({ values: insertValues }),
  update: () => ({
    set: (data: unknown) => ({ where: () => rawUpdate(data) }),
  }),
} as unknown as Parameters<Parameters<typeof db.withAudit>[2]>[0];

function stored(overrides: Record<string, unknown> = {}): Attachment {
  return {
    id: 50,
    entityType: "job",
    entityId: 1,
    jobId: 1,
    siteId: 10,
    deviceId: null,
    companyId: 1,
    uploadedById: 7,
    fileName: "photo.jpg",
    fileKey: "1/jobs/1/proven-photo",
    fileUrl: "https://storage.example/proven",
    uploadStatus: "completed",
    ...overrides,
  } as Attachment;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(formidable).mockReturnValue(form as any);
  records = [];
  inTransaction = false;
  sealed = false;
  events = [];
  tempDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "inspectra-upload-boundary-")
  );
  tempFile = path.join(tempDirectory, "photo.jpg");
  fs.writeFileSync(tempFile, "hello");
  vi.mocked(db.withAudit).mockImplementation(async (_ctx, _name, operation) => {
    inTransaction = true;
    try {
      return await operation(tx);
    } finally {
      inTransaction = false;
    }
  });
  vi.mocked(db.getDb).mockResolvedValue(tx as any);
  vi.mocked(db.assertJobNotFinalized).mockImplementation(
    async (id, connection) => {
      expect(inTransaction).toBe(true);
      expect(connection).toBe(tx);
      events.push(`lock:${id}`);
      if (sealed)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "JOB_FINALIZED_IMMUTABLE",
        });
    }
  );
  vi.mocked(db.getJobById).mockImplementation(async id => {
    if (inTransaction) events.push(`job:${id}`);
    return jobRows.find(row => row.id === id) as any;
  });
  vi.mocked(db.getSiteById).mockImplementation(async id => {
    if (inTransaction) events.push(`site:${id}`);
    return siteRows.find(row => row.id === id) as any;
  });
  vi.mocked(db.getCustomerOrgById).mockImplementation(
    async id => ({ id, companyId: id === 300 ? 3 : 1 }) as any
  );
  vi.mocked(db.getDeficiencyById).mockImplementation(
    async id => ({ id, jobId: id === 51 ? 3 : 1 }) as any
  );
  vi.mocked(db.getRepairById).mockResolvedValue({
    id: 60,
    deficiencyId: 50,
  } as any);
  vi.mocked(db.getDeviceById).mockImplementation(
    async id =>
      ({ id, siteId: id === 31 ? 30 : 10, companyId: id === 31 ? 3 : 1 }) as any
  );
  vi.mocked(db.assertJobCompany).mockImplementation(async (id, companyId) => {
    const job = jobRows.find(row => row.id === id);
    if (!job) throw new TRPCError({ code: "NOT_FOUND" });
    if (job.companyId !== companyId && !callerIsPlatformOperator())
      throw new TRPCError({ code: "FORBIDDEN" });
    return job as any;
  });
  vi.mocked(db.getAttachmentById).mockImplementation(async id =>
    records.find(row => row.id === id)
  );
  vi.mocked(db.getAttachmentsByEntity).mockImplementation(async (type, id) =>
    records.filter(row => row.entityType === type && row.entityId === id)
  );
  vi.mocked(db.getAttachmentsByJob).mockImplementation(async () => records);
  vi.mocked(db.getAttachmentsBySite).mockImplementation(async () => records);
  vi.mocked(db.getAttachmentsByDevice).mockImplementation(async () => records);
  vi.mocked(db.getAttachmentByIdempotencyKey).mockImplementation(
    async (key, type, id) => {
      if (inTransaction) events.push("idempotency");
      return records.find(
        row =>
          row.idempotencyKey === key &&
          row.entityType === type &&
          row.entityId === id
      );
    }
  );
  vi.mocked(db.createAttachment).mockImplementation(async data => {
    expect(inTransaction).toBe(true);
    events.push("create");
    const row = stored({ ...data, id: records.length + 100 });
    records.push(row);
    return row;
  });
  vi.mocked(db.getUploadQueueItemById).mockResolvedValue(queueItem as any);
  vi.mocked(db.getUploadQueueItemByLocalId).mockResolvedValue(undefined);
  vi.mocked(db.createUploadQueueItem).mockImplementation(
    async data => ({ id: 88, ...data }) as any
  );
  vi.mocked(storagePut).mockResolvedValue({
    key: "server-key",
    url: "https://storage.example/upload",
  });
  parentLock.mockResolvedValue([{ id: 1 }]);
  insertValues.mockImplementation(async () => {
    expect(inTransaction).toBe(true);
    events.push("insert");
    return [{ insertId: 92 }];
  });
  rawUpdate.mockResolvedValue(undefined);
  vi.mocked(sdk.authenticateRequest).mockResolvedValue(ctx.user!);
  form.on.mockImplementation((_event, callback) => {
    beginFile = callback;
    return form;
  });
  form.parse.mockImplementation(async () => {
    beginFile?.("file", { filepath: tempFile });
    return [
      {
        entityType: ["job"],
        entityId: ["1"],
        companyId: ["999"],
        userId: ["999"],
      },
      {
        file: [
          {
            filepath: tempFile,
            originalFilename: "photo.jpg",
            mimetype: "image/jpeg",
            size: 999,
          },
        ],
      },
    ];
  });
});
afterEach(() => {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("Attachment canonical provenance and finalization boundaries", () => {
  it("rejects malformed job/site ancestry pointing at another company's customer organization", async () => {
    vi.mocked(db.getCustomerOrgById).mockResolvedValue({
      id: 100,
      companyId: 3,
    } as any);
    const customer = attachmentRouter.createCaller({
      ...ctx,
      user: { ...ctx.user!, role: "customer", customerOrgId: 100 },
    } as TrpcContext);
    const admin = attachmentRouter.createCaller({
      ...ctx,
      user: { ...ctx.user!, role: "admin" },
    } as TrpcContext);
    await expect(customer.listByJob({ jobId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller.upload(upload)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(admin.upload(upload)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(storagePut).not.toHaveBeenCalled();
    expect(db.createAttachment).not.toHaveBeenCalled();
  });
  it("does not expose a foreign canonical parent through a contradictory optional job link", async () => {
    records.push(
      stored({ isCustomerFacing: 1 }),
      stored({ id: 51, entityId: 3, companyId: 3, isCustomerFacing: 1 }),
      stored({ id: 52, isCustomerFacing: 0 }),
      stored({ id: 53, jobId: 2, siteId: 20, isCustomerFacing: 1 })
    );
    expect((await caller.listByJob({ jobId: 1 })).map(row => row.id)).toEqual([
      50, 52,
    ]);
    expect(
      (await caller.listBySite({ siteId: 10 })).map(row => row.id)
    ).toEqual([50, 52]);
    const customer = attachmentRouter.createCaller({
      ...ctx,
      user: { ...ctx.user!, role: "customer", customerOrgId: 100 },
    } as TrpcContext);
    const visible = await customer.listByJob({ jobId: 1 });
    expect(visible.map(row => row.id)).toEqual([50]);
    expect(visible[0]).not.toHaveProperty("fileKey");
  });
  it("rejects mutually contradictory optional links on an organization attachment", async () => {
    await expect(
      assertAttachmentDestination(
        { entityType: "customer_org", entityId: 100, jobId: 1, siteId: 20 },
        ctx.user!
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const parent = await assertAttachmentDestination(
      { entityType: "customer_org", entityId: 100, jobId: 1 },
      ctx.user!
    );
    expect(parent).toMatchObject({ jobId: 1, siteId: 10, companyId: 1 });
  });

  it("locks every parent before snapshot reads, in job ID order", async () => {
    await withAttachmentWrite(
      ctx,
      "test",
      [
        { entityType: "job", entityId: 4 },
        { entityType: "job", entityId: 1 },
      ],
      async () => undefined
    );
    expect(events.slice(0, 2)).toEqual(["lock:1", "lock:4"]);
  });

  it.each([
    ["site" as const, 10, sites],
    ["device" as const, 8, sites],
    ["customer_org" as const, 100, customerOrgs],
  ])(
    "serializes concurrent %s uploads with differently enriched optional job links",
    async (entityType, entityId, sharedTable) => {
      const tails = new Map<unknown, Promise<void>>();
      let committedId: number | undefined;
      let created = 0;
      vi.mocked(db.assertJobNotFinalized).mockResolvedValue(undefined);
      vi.mocked(db.withAudit).mockImplementation(
        async (_ctx, _name, operation) => {
          const releases: Array<() => void> = [];
          const connection = {
            select: () => ({
              from: (table: unknown) => ({
                where: () => ({
                  for: async () => {
                    const prior = tails.get(table) ?? Promise.resolve();
                    let release!: () => void;
                    tails.set(
                      table,
                      new Promise<void>(resolve => {
                        release = resolve;
                      })
                    );
                    await prior;
                    releases.push(release);
                    return [{ id: 1 }];
                  },
                }),
              }),
            }),
          } as unknown as typeof tx;
          try {
            const result = await operation(connection);
            committedId = result as number;
            return result;
          } finally {
            releases.reverse().forEach(release => release());
          }
        }
      );
      const insertOrReplay = async () => {
        const existing = committedId;
        if (existing) return existing;
        // An uncommitted first upload is invisible to a second transaction.
        await Promise.resolve();
        return ++created;
      };
      const results = await Promise.all([
        withAttachmentWrite(
          ctx,
          "test",
          [{ entityType, entityId }],
          insertOrReplay
        ),
        withAttachmentWrite(
          ctx,
          "test",
          [{ entityType, entityId, jobId: 1 }],
          insertOrReplay
        ),
      ]);
      expect(tails.has(sharedTable)).toBe(true);
      expect(results).toEqual([1, 1]);
      expect(created).toBe(1);
    }
  );

  it.each([
    ["attachment upload", () => caller.upload(upload), db.createAttachment],
    [
      "bulk upload",
      () =>
        caller.bulkUpload({
          entityType: "job",
          entityId: 1,
          files: [{ fileName: "p", fileData: "aA==", mimeType: "text/plain" }],
        }),
      db.createAttachment,
    ],
    [
      "metadata update",
      () => caller.update({ id: 50, caption: "changed" }),
      db.updateAttachment,
    ],
    [
      "tag update",
      () => caller.updateTags({ id: 50, tags: ["x"] }),
      db.updateAttachmentTags,
    ],
    [
      "link update",
      () => caller.linkToEntities({ id: 50, jobId: 1 }),
      db.updateAttachment,
    ],
    ["attachment delete", () => caller.delete({ id: 50 }), db.deleteAttachment],
    [
      "document-center delete",
      () => documents.remove({ id: "attachment_50" }),
      db.deleteAttachment,
    ],
    [
      "photo upload",
      () =>
        media.uploadDeficiencyMedia({
          deficiencyId: 50,
          fileName: "p.jpg",
          fileData: "aA==",
          mimeType: "image/jpeg",
          fileSize: 1,
        }),
      db.createAttachment,
    ],
    [
      "photo metadata",
      () => media.updateDeficiencyMedia({ id: 50, caption: "changed" }),
      rawUpdate,
    ],
    ["photo delete", () => media.deleteDeficiencyMedia({ id: 50 }), rawUpdate],
    [
      "photo ordering",
      () =>
        media.reorderDeficiencyMedia({ deficiencyId: 50, orderedIds: [50] }),
      rawUpdate,
    ],
    [
      "photo visibility",
      () => media.markCustomerFacing({ id: 50, isCustomerFacing: false }),
      rawUpdate,
    ],
    [
      "legacy split upload",
      () =>
        files.uploadToS3({
          fileName: "p",
          fileSize: 1,
          mimeType: "image/jpeg",
          companyId: 1,
          jobId: 1,
          fileData: "aA==",
        }),
      db.createAttachment,
    ],
  ] as const)(
    "%s cannot write after finalization wins the parent lock",
    async (_name, action, write) => {
      records.push(
        stored({ entityType: "deficiency", entityId: 50, jobId: null })
      );
      sealed = true;
      await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(write).not.toHaveBeenCalled();
      expect(storagePut).not.toHaveBeenCalled();
      expect(events).toEqual(["lock:1"]);
    }
  );

  it("revalidates canonical ancestors after acquiring the job lock", async () => {
    vi.mocked(db.getDeficiencyById)
      .mockResolvedValueOnce({ id: 50, jobId: 1 } as any)
      .mockResolvedValueOnce({ id: 50, jobId: 4 } as any);
    await expect(
      media.uploadDeficiencyMedia({
        deficiencyId: 50,
        fileName: "p",
        fileData: "aA==",
        mimeType: "image/jpeg",
        fileSize: 1,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("sees an idempotent upload committed while it waited for the parent lock", async () => {
    vi.mocked(db.assertJobNotFinalized).mockImplementation(async () => {
      events.push("lock:1");
      records.push(stored({ idempotencyKey: "stable-photo" }));
    });
    const result = await caller.upload({
      ...upload,
      idempotencyKey: "stable-photo",
    });
    expect(result.id).toBe(50);
    expect(events.indexOf("idempotency")).toBeGreaterThan(
      events.indexOf("lock:1")
    );
    expect(storagePut).not.toHaveBeenCalled();
    expect(db.createAttachment).not.toHaveBeenCalled();
  });

  it("recovers a completed upload response after seal through a read-only replay", async () => {
    records.push(stored({ idempotencyKey: "completed-before-seal" }));
    sealed = true;
    expect(
      await caller.upload({
        ...upload,
        idempotencyKey: "completed-before-seal",
      })
    ).toMatchObject({ id: 50 });
    expect(db.withAudit).not.toHaveBeenCalled();
    expect(storagePut).not.toHaveBeenCalled();
    expect(db.createAttachment).not.toHaveBeenCalled();
  });

  it("persists canonical photo ownership and measures the decoded bytes", async () => {
    const result = await media.uploadDeficiencyMedia({
      deficiencyId: 50,
      fileName: "p.jpg",
      fileData: "aGVsbG8=",
      mimeType: "image/jpeg",
      fileSize: 1,
    });
    expect(result).toMatchObject({
      id: 100,
      companyId: 1,
      jobId: 1,
      siteId: 10,
      fileSize: 5,
    });
    expect(events[0]).toBe("lock:1");
  });

  it("attributes a platform operator's cross-company upload to the actual parent", async () => {
    const admin = attachmentRouter.createCaller({
      ...ctx,
      user: { ...ctx.user!, role: "admin" },
    } as TrpcContext);
    expect(await admin.upload({ ...upload, entityId: 3 })).toMatchObject({
      companyId: 3,
      jobId: 3,
      siteId: 30,
      uploadedById: 7,
    });
  });

  it("rejects oversized decoded photo data even when the declared size is small", async () => {
    await expect(
      media.uploadDeficiencyMedia({
        deficiencyId: 50,
        fileName: "p.jpg",
        fileData: Buffer.alloc(15 * 1024 * 1024 + 1).toString("base64"),
        mimeType: "image/jpeg",
        fileSize: 1,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(storagePut).not.toHaveBeenCalled();
  });

  it("persists the legacy split upload before exposing its storage key", async () => {
    const result = await files.uploadToS3({
      fileName: "p",
      fileSize: 99,
      mimeType: "image/jpeg",
      companyId: 999,
      jobId: 1,
      fileData: "aA==",
    });
    expect(result).toMatchObject({
      id: 100,
      companyId: 1,
      jobId: 1,
      siteId: 10,
      uploadedById: 7,
      fileSize: 1,
    });
    expect(result.fileKey).toMatch(/^1\/jobs\/1\//);
  });

  it("rejects a foreign or unproven object through file registration", async () => {
    for (const record of [
      undefined,
      stored({ uploadedById: 999 }),
      stored({ entityId: 3, jobId: 3, siteId: 30, companyId: 3 }),
    ]) {
      records = record ? [record] : [];
      await expect(
        files.create({
          entityType: "job",
          entityId: 1,
          fileName: "x",
          fileKey: "1/jobs/1/proven-photo",
          fileUrl: "https://attacker.example/object",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(db.createAttachment).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("replays registration after seal without changing stored metadata", async () => {
    records.push(stored());
    sealed = true;
    const result = await files.create({
      entityType: "job",
      entityId: 1,
      fileName: "forged",
      fileKey: records[0].fileKey,
      fileUrl: "https://attacker.example/object",
      fileSize: 123,
    });
    expect(result).toMatchObject({
      id: 50,
      insertId: 50,
      fileName: "photo.jpg",
      fileUrl: "https://storage.example/proven",
    });
    expect(db.createAttachment).not.toHaveBeenCalled();
  });
});

describe("Upload queue completion", () => {
  it("completion is idempotent and uses the persisted upload URL", async () => {
    records.push(stored());
    const input = {
      id: 88,
      fileKey: records[0].fileKey,
      fileUrl: "https://attacker.example/object",
    };
    const first = await queue.complete(input);
    const replay = await queue.complete(input);
    expect(first.attachment.id).toBe(50);
    expect(replay.attachment.id).toBe(50);
    expect(db.createAttachment).not.toHaveBeenCalled();
    expect(db.updateUploadQueueItem).toHaveBeenCalledWith(
      88,
      expect.objectContaining({
        fileUrl: records[0].fileUrl,
        fileKey: records[0].fileKey,
        status: "completed",
      })
    );
  });

  it("rejects another user's queue, a reassigned tenant and unproven keys", async () => {
    records.push(stored());
    for (const item of [
      { ...queueItem, userId: 999 },
      { ...queueItem, entityId: 3 },
      queueItem,
    ]) {
      vi.mocked(db.getUploadQueueItemById).mockResolvedValue(item as any);
      await expect(
        queue.complete({
          id: 88,
          fileKey: "unproven",
          fileUrl: "https://attacker.example/x",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(db.createAttachment).not.toHaveBeenCalled();
    expect(db.updateUploadQueueItem).not.toHaveBeenCalled();
  });

  it("cannot bypass proof of upload through updateStatus", async () => {
    await expect(
      queue.updateStatus({
        id: 88,
        status: "completed",
        fileKey: "unproven",
        fileUrl: "https://attacker.example/x",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.updateUploadQueueItem).not.toHaveBeenCalled();
  });

  it("rejects a stable local file ID reused for another destination", async () => {
    vi.mocked(db.getUploadQueueItemByLocalId).mockResolvedValue({
      ...queueItem,
      entityId: 4,
    } as any);
    await expect(
      queue.add({
        localFileId: "local-1",
        fileName: "p",
        entityType: "job",
        entityId: 1,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.createUploadQueueItem).not.toHaveBeenCalled();
  });

  it("does not expose another tenant's pending queue after account reassignment", async () => {
    vi.mocked(db.getPendingUploads).mockResolvedValue([
      queueItem,
      { ...queueItem, id: 89, entityId: 3 },
    ] as any);
    expect(await queue.pending()).toHaveLength(1);
  });
});

async function invokeMultipart(header: string | string[] | undefined = serializeExpectedAccount(expectedAccount(ctx.user)!)) {
  const req = { headers: { [EXPECTED_ACCOUNT_HEADER]: header }, ip: "127.0.0.1" } as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  await handleMultipartUpload(req, res as unknown as Response);
  return res;
}

describe("Direct multipart HTTP handler without opening a socket", () => {
  it("fails closed before parsing unauthenticated and customer requests", async () => {
    vi.mocked(sdk.authenticateRequest).mockRejectedValueOnce(
      new Error("no session")
    );
    expect((await invokeMultipart()).status).toHaveBeenCalledWith(401);
    vi.mocked(sdk.authenticateRequest).mockResolvedValueOnce({
      ...ctx.user,
      role: "customer",
    } as any);
    expect((await invokeMultipart()).status).toHaveBeenCalledWith(403);
    expect(form.parse).not.toHaveBeenCalled();
    expect(storagePut).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", ""],
    ["malformed", "{bad json"],
    ["duplicate", ["one", "two"]],
    ["different user", serializeExpectedAccount(expectedAccount({ ...ctx.user, id: 8 })!)],
    ["different company", serializeExpectedAccount(expectedAccount({ ...ctx.user, companyId: 2 })!)],
    ["different session", serializeExpectedAccount(expectedAccount({ ...ctx.user, sessionVersion: 2 })!)],
  ])("rejects a %s displayed account before parsing or object writes", async (_name, header) => {
    expect((await invokeMultipart(header)).status).toHaveBeenCalledWith(409);
    expect(form.parse).not.toHaveBeenCalled();
    expect(storagePut).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("does not submit the next selected file under a newly signed-in account", async () => {
    const originalHeader = serializeExpectedAccount(expectedAccount(ctx.user)!);
    await invokeMultipart(originalHeader);
    expect(form.parse).toHaveBeenCalledTimes(1);
    vi.mocked(sdk.authenticateRequest).mockResolvedValueOnce({ ...ctx.user, id: 8 } as any);
    expect((await invokeMultipart(originalHeader)).status).toHaveBeenCalledWith(409);
    expect(form.parse).toHaveBeenCalledTimes(1);
    expect(storagePut).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["foreign job", { entityType: ["job"], entityId: ["3"] }, 403],
    [
      "conflicting site",
      { entityType: ["job"], entityId: ["1"], siteId: ["20"] },
      403,
    ],
    [
      "conflicting device",
      { entityType: ["job"], entityId: ["1"], deviceId: ["31"] },
      403,
    ],
    ["invalid ID", { entityType: ["job"], entityId: ["1oops"] }, 400],
    ["unsupported parent", { entityType: ["invoice"], entityId: ["1"] }, 400],
  ])(
    "denies %s before object storage and removes its temporary file",
    async (_name, fields, status) => {
      form.parse.mockResolvedValueOnce([
        fields,
        { file: [{ filepath: tempFile, originalFilename: "p.jpg" }] },
      ]);
      const res = await invokeMultipart();
      expect(res.status).toHaveBeenCalledWith(status);
      expect(storagePut).not.toHaveBeenCalled();
      expect(insertValues).not.toHaveBeenCalled();
      expect(fs.existsSync(tempFile)).toBe(false);
    }
  );

  it("checks the final seal under its transaction before storage", async () => {
    sealed = true;
    const res = await invokeMultipart();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(events).toEqual(["lock:1"]);
    expect(storagePut).not.toHaveBeenCalled();
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  it("records server identity, canonical parents and actual bytes in one transaction", async () => {
    const res = await invokeMultipart();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, attachmentId: 92 })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 1,
        uploadedById: 7,
        entityId: 1,
        jobId: 1,
        siteId: 10,
        fileSize: 5,
      })
    );
    expect(events[0]).toBe("lock:1");
    expect(fs.existsSync(tempFile)).toBe(false);
  });

  it("also cleans a temporary file left by a failed multipart parse", async () => {
    form.parse.mockImplementationOnce(async () => {
      beginFile?.("file", { filepath: tempFile });
      throw new Error("interrupted upload");
    });
    expect((await invokeMultipart()).status).toHaveBeenCalledWith(500);
    expect(fs.existsSync(tempFile)).toBe(false);
    expect(storagePut).not.toHaveBeenCalled();
  });
});
