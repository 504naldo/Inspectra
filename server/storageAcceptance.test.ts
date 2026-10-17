import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { GetObjectCommand, ListObjectsV2Command, S3Client, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { eq, inArray } from "drizzle-orm";
import superjson from "superjson";
import { assertDisposableS3Environment } from "../scripts/disposableS3Config.mjs";
import { companies, customerOrgs, users, sites, jobs, attachments, reports, uploadQueue, type User } from "../drizzle/schema";
import { COOKIE_NAME } from "../shared/const";
import { EXPECTED_ACCOUNT_HEADER, expectedAccount, serializeExpectedAccount } from "../shared/accountBinding";
import { appRouter, type AppRouter } from "./routers";
import { createContext } from "./_core/context";
import { handleMultipartUpload } from "./_core/upload";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { storageGet, storagePut } from "./storage";

// No storage/DB/HTTP mocks. CI provides a private, disposable MinIO + MySQL pair.
describe.skipIf(process.env.DISPOSABLE_S3_ACCEPTANCE !== "true")("Disposable S3 and authenticated HTTP acceptance", () => {
  const runId = randomUUID();
  const companyIds: number[] = [], userIds: number[] = [], jobIds: number[] = [], objectKeys = new Set<string>();
  let server: Server | undefined;
  let origin: string;
  let s3: S3Client;
  let owner: User, colleague: User, foreign: User;
  let ownSiteId: number, ownJobId: number, sealedJobId: number, foreignJobId: number;
  let ownClient: ReturnType<typeof createTRPCClient<AppRouter>>;
  let colleagueClient: ReturnType<typeof createTRPCClient<AppRouter>>;
  let foreignClient: ReturnType<typeof createTRPCClient<AppRouter>>;
  const auth = new Map<number, Record<string, string>>();

  async function headers(user: User) {
    let value = auth.get(user.id);
    if (!value) {
      const token = await sdk.createSessionToken(user.openId, { name: user.name!, sessionVersion: user.sessionVersion });
      value = { Cookie: `${COOKIE_NAME}=${token}`, [EXPECTED_ACCOUNT_HEADER]: serializeExpectedAccount(expectedAccount(user)!) };
      auth.set(user.id, value);
    }
    return value;
  }
  function client(user: User) {
    return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${origin}/api/trpc`, transformer: superjson, headers: () => headers(user) })] });
  }
  async function keys(prefix: string) {
    const result = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: prefix }));
    return (result.Contents ?? []).map(object => object.Key!).sort();
  }
  async function multipart(user: User, jobId: number) {
    const form = new FormData();
    form.set("entityType", "job"); form.set("entityId", String(jobId));
    form.set("jobId", String(jobId));
    form.set("file", new Blob(["synthetic multipart evidence"], { type: "text/plain" }), "field-note.txt");
    return fetch(`${origin}/api/upload`, { method: "POST", headers: await headers(user), body: form });
  }

  beforeAll(async () => {
    assertDisposableS3Environment();
    const database = await getDb();
    if (!database) throw new Error("Disposable MySQL is required for HTTP storage acceptance");
    s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: process.env.S3_REGION, forcePathStyle: true,
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID!, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY! } });
    async function tenant(label: string) {
      const [company] = await database!.insert(companies).values({ name: `Storage acceptance ${label} ${runId}` }).$returningId();
      companyIds.push(company.id);
      const [org] = await database!.insert(customerOrgs).values({ companyId: company.id, name: `Synthetic customer ${label}` }).$returningId();
      const [site] = await database!.insert(sites).values({ companyId: company.id, customerOrgId: org.id, name: `Synthetic site ${label}`, address: "123 Test Street" }).$returningId();
      const [job] = await database!.insert(jobs).values({ companyId: company.id, customerOrgId: org.id, siteId: site.id, title: "Storage acceptance", jobNumber: `S3-${label}-${runId}`, jobType: "annual", status: "pending" }).$returningId();
      jobIds.push(job.id);
      const [person] = await database!.insert(users).values({ openId: `s3-${label}-${runId}`, name: `Synthetic ${label}`, companyId: company.id, role: "office", sessionVersion: 1 }).$returningId();
      userIds.push(person.id);
      const [user] = await database!.select().from(users).where(eq(users.id, person.id));
      return { company, org, site, job, user };
    }
    const own = await tenant("owner"), other = await tenant("foreign");
    owner = own.user; foreign = other.user; ownJobId = own.job.id; ownSiteId = own.site.id; foreignJobId = other.job.id;
    const [second] = await database.insert(users).values({ openId: `s3-colleague-${runId}`, name: "Synthetic colleague", companyId: own.company.id, role: "office", sessionVersion: 1 }).$returningId();
    userIds.push(second.id);
    [colleague] = await database.select().from(users).where(eq(users.id, second.id));
    const [sealedJob] = await database.insert(jobs).values({ companyId: own.company.id, customerOrgId: own.org.id, siteId: own.site.id, title: "Seal acceptance", jobNumber: `S3-seal-${runId}`, jobType: "annual", status: "pending" }).$returningId();
    sealedJobId = sealedJob.id; jobIds.push(sealedJob.id);

    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.post("/api/upload", handleMultipartUpload);
    app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
    server = createServer(app);
    await new Promise<void>((resolve, reject) => { server!.once("error", reject); server!.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Acceptance HTTP server has no TCP address");
    origin = `http://127.0.0.1:${address.port}`;
    ownClient = client(owner); colleagueClient = client(colleague); foreignClient = client(foreign);
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (s3) {
      if (objectKeys.size) await s3.send(new DeleteObjectsCommand({ Bucket: process.env.S3_BUCKET, Delete: { Objects: [...objectKeys].map(Key => ({ Key })) } }));
      s3.destroy();
    }
    if (!companyIds.length) return;
    const database = await getDb();
    if (!database) return;
    if (jobIds.length) {
      await database.delete(reports).where(inArray(reports.jobId, jobIds));
      await database.delete(attachments).where(inArray(attachments.jobId, jobIds));
      await database.delete(uploadQueue).where(inArray(uploadQueue.userId, userIds));
      await database.delete(jobs).where(inArray(jobs.id, jobIds));
    }
    await database.delete(users).where(inArray(users.id, userIds));
    await database.delete(sites).where(inArray(sites.companyId, companyIds));
    await database.delete(customerOrgs).where(inArray(customerOrgs.companyId, companyIds));
    await database.delete(companies).where(inArray(companies.id, companyIds));
  }, 30000);

  it("rejects a genuinely expired S3 URL and refreshes the report's durable key over authenticated HTTP", async () => {
    const bytes = Buffer.from("%PDF-1.4\nSynthetic acceptance report\n%%EOF");
    const object = await storagePut(`acceptance/${runId}/report.pdf`, bytes, "application/pdf"); objectKeys.add(object.key);
    const expired = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: object.key }),
      { expiresIn: 7 * 24 * 60 * 60, signingDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
    const staleResponse = await fetch(expired);
    expect(staleResponse.status).toBe(403);
    expect(await staleResponse.text()).toMatch(/expir/i);
    const unsigned = new URL(object.url); unsigned.search = "";
    expect((await fetch(unsigned)).status).toBe(403);

    const database = (await getDb())!;
    const [report] = await database.insert(reports).values({ jobId: ownJobId, generatedById: owner.id, reportNumber: `S3-${runId}`, title: "Synthetic storage report", fileKey: object.key, fileUrl: expired }).$returningId();
    const current = await ownClient.report.get.query({ id: report.id });
    expect(current!.fileUrl).not.toBe(expired);
    const restored = await fetch(current!.fileUrl!);
    expect(restored.status).toBe(200);
    expect(Buffer.from(await restored.arrayBuffer())).toEqual(bytes);
    const download = await fetch(await ownClient.report.getDownloadUrl.query({ id: report.id }));
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment;");
    await expect(foreignClient.report.get.query({ id: report.id })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
  }, 30000);

  it("persists real uploads before registration and rejects foreign object/actor provenance over HTTP", async () => {
    const bytes = Buffer.from("Synthetic file provenance");
    const uploaded = await ownClient.files.uploadToS3.mutate({ companyId: foreign.companyId!, jobId: ownJobId, fileName: "proof.txt", fileSize: bytes.length, mimeType: "text/plain", fileData: bytes.toString("base64") });
    objectKeys.add(uploaded.fileKey);
    expect(uploaded.companyId).toBe(owner.companyId);
    expect(uploaded.uploadedById).toBe(owner.id);
    expect(Buffer.from(await (await fetch(uploaded.fileUrl)).arrayBuffer())).toEqual(bytes);
    const input = { entityType: "job" as const, entityId: ownJobId, jobId: ownJobId, siteId: ownSiteId,
      fileName: "forged-name.txt", fileKey: uploaded.fileKey, fileUrl: "https://forged.example/object" };
    const existing = await ownClient.files.create.mutate(input);
    expect(existing.id).toBe(uploaded.id);
    expect(existing.fileUrl).toBe(uploaded.fileUrl);
    await expect(colleagueClient.files.create.mutate(input)).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(foreignClient.files.create.mutate({ ...input, entityId: foreignJobId, jobId: foreignJobId, siteId: undefined })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    const [stored] = await (await getDb())!.select().from(attachments).where(eq(attachments.id, uploaded.id));
    expect(stored).toMatchObject({ entityId: ownJobId, companyId: owner.companyId, uploadedById: owner.id, fileKey: uploaded.fileKey });
  }, 30000);

  it("enforces canonical multipart parents and finalization before writing MinIO objects", async () => {
    const allowed = await multipart(owner, ownJobId);
    expect(allowed.status).toBe(200);
    const uploaded = await allowed.json(); objectKeys.add(uploaded.fileKey);
    expect(await (await fetch(uploaded.fileUrl)).text()).toBe("synthetic multipart evidence");
    const [stored] = await (await getDb())!.select().from(attachments).where(eq(attachments.id, uploaded.attachmentId));
    expect(stored).toMatchObject({ entityId: ownJobId, jobId: ownJobId, siteId: ownSiteId, companyId: owner.companyId, uploadedById: owner.id });
    const prefix = `${foreign.companyId}/jobs/${foreignJobId}/`;
    const before = await keys(prefix);
    expect((await multipart(owner, foreignJobId)).status).toBe(403);
    expect(await keys(prefix)).toEqual(before);
  }, 30000);

  it("replays only the completed upload after seal and rejects new multipart/object writes", async () => {
    const input = { entityType: "job" as const, entityId: sealedJobId, jobId: sealedJobId, siteId: ownSiteId,
      fileName: "before-seal.txt", fileData: Buffer.from("Completed evidence").toString("base64"), mimeType: "text/plain", idempotencyKey: runId };
    const uploaded = await ownClient.attachment.upload.mutate(input); objectKeys.add(uploaded.fileKey);
    await (await getDb())!.update(jobs).set({ finalizedAt: new Date() }).where(eq(jobs.id, sealedJobId));
    const replay = await ownClient.attachment.upload.mutate(input);
    expect(replay.id).toBe(uploaded.id);
    expect(replay.fileKey).toBe(uploaded.fileKey);
    const multipartPrefix = `${owner.companyId}/jobs/${sealedJobId}/`;
    const attachmentPrefix = `attachments/job/${sealedJobId}/`;
    const before = [...await keys(multipartPrefix), ...await keys(attachmentPrefix)].sort();
    expect((await multipart(owner, sealedJobId)).status).toBe(403);
    await expect(ownClient.attachment.upload.mutate({ ...input, idempotencyKey: randomUUID() })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    expect([...await keys(multipartPrefix), ...await keys(attachmentPrefix)].sort()).toEqual(before);
  }, 30000);

  it("persists real signature keys and recovers their bytes after the original URL expires", async () => {
    const bytes = readFileSync(new URL("../assets/ewf-logo.png", import.meta.url));
    const input = { jobId: ownJobId, techSignatureBase64: bytes.toString("base64"),
      contactSignatureBase64: bytes.toString("base64"), contactName: "Synthetic contact" };
    await ownClient.job.saveSignatures.mutate(input);
    const [stored] = await (await getDb())!.select().from(jobs).where(eq(jobs.id, ownJobId));
    expect(stored.techSignatureKey).toMatch(/^signatures\/.+\.png$/);
    expect(stored.contactSignatureKey).toMatch(/^signatures\/.+\.png$/);
    expect(stored.contactSignatureKey).not.toBe(stored.techSignatureKey);
    for (const key of [stored.techSignatureKey!, stored.contactSignatureKey!]) {
      objectKeys.add(key);
      const expired = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
        { expiresIn: 7 * 24 * 60 * 60, signingDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) });
      expect((await fetch(expired)).status).toBe(403);
      const fresh = await storageGet(key);
      const response = await fetch(fresh.url);
      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    }
    const before = await keys("signatures/");
    await expect(foreignClient.job.saveSignatures.mutate(input)).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    await expect(ownClient.job.saveSignatures.mutate({ ...input, jobId: sealedJobId })).rejects.toMatchObject({ data: { code: "FORBIDDEN" } });
    expect(await keys("signatures/")).toEqual(before);
    const [after] = await (await getDb())!.select().from(jobs).where(eq(jobs.id, ownJobId));
    expect(after).toEqual(stored);
  }, 30000);
});
