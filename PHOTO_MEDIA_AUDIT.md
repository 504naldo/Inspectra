# Photo / Media — Pre-Implementation Audit

## Existing File Upload Support

### Upload Infrastructure
- **Server-side handler**: `server/_core/upload.ts` — multipart form parser using `formidable`, 50 MB limit
- **tRPC upload**: `filesRouter.uploadToS3` — accepts base64-encoded file data, uploads to S3/R2 via `storagePut`, returns `{ fileKey, fileUrl }`
- **Storage layer**: `server/storage.ts` — S3/Cloudflare R2 via AWS SDK, `storagePut` (PutObject), presigned GET URLs (7-day expiry)
- **File key pattern**: `${companyId}/jobs/${jobId}/${fileName}-${randomSuffix}`

### Supported MIME types (pre-existing)
- `image/jpeg`, `image/png`
- `application/pdf`
- `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `text/csv`

## Existing Deficiency Attachment/Photo Fields

### Deficiency table (`drizzle/schema.ts` lines 341-376)
**No photo columns** on the deficiency table itself. Attachments are stored in a separate `attachments` table via `entityType="deficiency"` + `entityId=deficiency.id`.

### Attachments table (`drizzle/schema.ts` lines 403-435)
Full multi-entity attachment storage:
- `entityType`, `entityId` — primary entity link
- `siteId`, `jobId`, `deviceId` — cross-reference links (already present)
- `uploadedById` — uploader tracking (already present)
- `fileName`, `fileKey`, `fileUrl`, `mimeType`, `fileSize`
- `caption`, `aiCaption`, `tags` — metadata
- `uploadStatus` (pending/uploading/completed/failed), `uploadProgress`, `retryCount`
- `importStatus`, `importSummary` — Excel import tracking
- `createdAt`, `updatedAt`

**Missing photo-specific fields** (added in this feature):
- `locationNote` — "where in the building" note
- `isCustomerFacing` — controls PDF/report inclusion
- `sortOrder` — ordering within a deficiency

### deficiencyRouter.get (server/routers/deficiencyRouter.ts lines 20-37)
Already fetches `attachments` via `db.getAttachmentsByEntity('deficiency', id)` and returns them in `{ deficiency, attachments, repairs }`. No UI consumed this yet.

## Existing Site Files Behavior

### Site Files / Document Center
- `documentCenterRouter.ts` — aggregates reports, attachments (by site/job), quotes, knowledge base files
- Returns unified document list with `documentType` discriminator
- Existing entity types: `report`, `attachment`, `repair_quote`, `kb_article`
- Attachments appear in Document Center if linked to a site via `siteId`
- **No separate "deficiency_photo" document type** — photos appear as generic attachments

## Existing Report PDF Photo Support

### fetchImageBuffer utility (`server/pdfSharedStyles.ts` line 948)
- Fetches a URL and returns a `Buffer` — handles auth failures gracefully (returns undefined)
- Used for: company logo, tech signature

### doc.image() support
PDFKit (used by all generators) supports `doc.image(buffer, x, y, { fit: [w, h] })`.

### Current deficiency rendering (pdfGeneratorFirePro.ts lines 877-933)
- Fixed-height table rows (54px per deficiency)
- Columns: id/severity, location+description, system/device, cost
- **No photo rendering** in the deficiency table rows

### Pre-fetch pattern (pdfGeneratorFirePro.ts lines 721-724)
```ts
const sigOpts: any = {};
if (data.techSignatureUrl) {
  sigOpts.techSignatureBuffer = await fetchImageBuffer(data.techSignatureUrl);
}
```
Pattern is: pre-fetch all async resources BEFORE entering the synchronous `new Promise` PDFKit callback.

## Existing Offline Photo Support

### Upload Queue table (`drizzle/schema.ts` lines 504-536)
Full offline upload queue infrastructure:
- `localFileId`, `entityType`, `entityId`, `fileName`, `mimeType`, `fileSize`
- `uploadStatus` (queued/uploading/paused/completed/failed)
- `retryCount`, `maxRetries`, `progress`
- `fileKey`, `fileUrl` (populated after upload)
- `tags`, `caption`

### Current offline photo implementation
**None in the UI.** The `uploadQueue` table exists in the schema but no frontend hooks/components use it. No blob storage or local queue is wired up.

## Storage Limitations

- Files are stored in S3/R2 with direct `PutObject` (no server-side multipart for large files)
- 50 MB server limit on `upload.ts` handler (not used for tRPC base64 path)
- Base64 encoding adds ~33% overhead vs raw binary — 15 MB source file → ~20 MB base64 string in tRPC request
- No image resizing/compression server-side (could add sharp/jimp later)
- No thumbnail generation (full URL used everywhere)
- S3 URLs are direct (public or signed) — no CDN

## Recommended Minimal Implementation

1. **Schema**: Add `locationNote`, `isCustomerFacing`, `sortOrder` to `attachments` table (migration 0064)
2. **Backend**: New `mediaRouter.ts` — typed procedures for image-only attachments, company-scoped
3. **DeficiencyEditor**: Photo capture section with camera + gallery inputs, pending queue for new deficiencies, immediate upload for edit mode
4. **QACheck**: Photo gallery per deficiency with customer-facing indicator, lightbox
5. **RepairQuoteDetail**: Show customer-facing photos for linked deficiencies, toggle customer-facing
6. **PDF**: Pre-fetch customer-facing photo buffers in reportRouter, add photo appendix pages after deficiency table in pdfGeneratorFirePro
7. **Offline**: Show clear warning that photo upload requires connection; do NOT attempt offline blob sync (infrastructure incomplete)
8. **Document Center**: Existing attachment aggregation already shows photos; no separate type needed for v1
