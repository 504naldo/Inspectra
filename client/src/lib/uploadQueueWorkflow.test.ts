import { beforeEach, describe, expect, it, vi } from "vitest";
import { uploadQueuedFile } from "./uploadQueueWorkflow";

const file = {
  size: 5,
  arrayBuffer: vi.fn(
    async () => new Uint8Array([104, 101, 108, 108, 111]).buffer
  ),
};
const input = {
  file,
  localFileId: "local-upload-1",
  entityType: "job" as const,
  entityId: 4,
  fileName: "photo.jpg",
  mimeType: "image/jpeg",
};
const uploaded = {
  id: 900,
  fileKey: "proven-photo",
  fileUrl: "https://storage.example/photo",
};
const api = { register: vi.fn(), upload: vi.fn(), complete: vi.fn() };
let active: boolean;
beforeEach(() => {
  vi.clearAllMocks();
  active = true;
  api.register.mockResolvedValue({ id: 88 });
  api.upload.mockResolvedValue(uploaded);
  api.complete.mockResolvedValue({ success: true });
});

describe("Background upload account and completion boundary", () => {
  it("completes the queue ID and preserves a stable upload key across retries", async () => {
    for (let retry = 0; retry < 2; retry++)
      expect(await uploadQueuedFile(input, api, () => active, vi.fn())).toEqual(
        uploaded
      );
    expect(api.complete).toHaveBeenCalledTimes(2);
    expect(api.complete).toHaveBeenCalledWith({
      id: 88,
      fileKey: uploaded.fileKey,
      fileUrl: uploaded.fileUrl,
    });
    expect(api.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: input.localFileId,
        fileData: "aGVsbG8=",
      })
    );
  });

  it("does not start work under a different account", async () => {
    active = false;
    expect(
      await uploadQueuedFile(input, api, () => active, vi.fn())
    ).toBeUndefined();
    expect(api.register).not.toHaveBeenCalled();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("stops before reading bytes if the account changes during registration", async () => {
    api.register.mockImplementationOnce(async () => {
      active = false;
      return { id: 88 };
    });
    expect(
      await uploadQueuedFile(input, api, () => active, vi.fn())
    ).toBeUndefined();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it("stops before sending bytes if the account changes during file reading", async () => {
    file.arrayBuffer.mockImplementationOnce(async () => {
      active = false;
      return new ArrayBuffer(0);
    });
    expect(
      await uploadQueuedFile(input, api, () => active, vi.fn())
    ).toBeUndefined();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it("does not complete a prior account's queue after its upload returns", async () => {
    api.upload.mockImplementationOnce(async () => {
      active = false;
      return uploaded;
    });
    expect(
      await uploadQueuedFile(input, api, () => active, vi.fn())
    ).toBeUndefined();
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("does not report completion if the account changes during completion", async () => {
    api.complete.mockImplementationOnce(async () => {
      active = false;
    });
    expect(
      await uploadQueuedFile(input, api, () => active, vi.fn())
    ).toBeUndefined();
  });

  it("propagates completion failures so the stable upload can be retried", async () => {
    api.complete.mockRejectedValueOnce(new Error("lost completion response"));
    await expect(
      uploadQueuedFile(input, api, () => active, vi.fn())
    ).rejects.toThrow("lost completion response");
    expect(await uploadQueuedFile(input, api, () => active, vi.fn())).toEqual(
      uploaded
    );
    expect(
      api.upload.mock.calls.map(([request]) => request.idempotencyKey)
    ).toEqual([input.localFileId, input.localFileId]);
  });
});
