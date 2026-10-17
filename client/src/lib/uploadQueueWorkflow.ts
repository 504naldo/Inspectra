type EntityType =
  | "inspection_result"
  | "deficiency"
  | "repair"
  | "device"
  | "job"
  | "site"
  | "customer_org";
type QueueMetadata = {
  entityType: EntityType;
  entityId: number;
  fileName: string;
  mimeType: string;
  tags?: string[];
  caption?: string;
};
type UploadedFile = { fileKey: string; fileUrl: string };

/** Stop between every async stage when the captured account or queue is gone. */
export async function uploadQueuedFile<T extends UploadedFile>(
  input: QueueMetadata & {
    localFileId: string;
    file: Pick<File, "arrayBuffer" | "size">;
  },
  api: {
    register: (
      input: QueueMetadata & { localFileId: string; fileSize: number }
    ) => Promise<{ id: number }>;
    upload: (
      input: QueueMetadata & { fileData: string; idempotencyKey: string }
    ) => Promise<T>;
    complete: (input: UploadedFile & { id: number }) => Promise<unknown>;
  },
  isCurrent: () => boolean,
  onUploading: () => void
): Promise<T | undefined> {
  if (!isCurrent()) return;
  const { file, localFileId, ...metadata } = input;
  const queue = await api.register({
    ...metadata,
    localFileId,
    fileSize: file.size,
  });
  if (!isCurrent()) return;
  const buffer = await file.arrayBuffer();
  if (!isCurrent()) return;
  const fileData = btoa(
    new Uint8Array(buffer).reduce(
      (data, byte) => data + String.fromCharCode(byte),
      ""
    )
  );
  onUploading();
  const uploaded = await api.upload({
    ...metadata,
    mimeType: metadata.mimeType || "application/octet-stream",
    fileData,
    idempotencyKey: localFileId,
  });
  if (!isCurrent()) return;
  // The attachment ID returned by upload is unrelated to its server queue ID.
  await api.complete({
    id: queue.id,
    fileKey: uploaded.fileKey,
    fileUrl: uploaded.fileUrl,
  });
  return isCurrent() ? uploaded : undefined;
}
