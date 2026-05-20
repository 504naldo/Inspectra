# Photo Capture + Deficiency Media Management v1 — Notes

## Storage Approach

Photos are stored in the existing S3/Cloudflare R2 bucket using the same infrastructure as all other file uploads.

- **Upload path**: Client reads file as base64 → `media.uploadDeficiencyMedia` tRPC mutation → server decodes base64 → `storagePut(fileKey, buffer, mimeType)` → direct S3 PutObject
- **File key pattern**: `${companyId}/deficiencies/${deficiencyId}/${randomSuffix}.{ext}`
- **File size limit**: 15 MB per photo (server-enforced)
- **Supported types**: `image/jpeg`, `image/png`, `image/webp` only (server validates MIME type via enum)
- **Filename sanitisation**: All non-alphanumeric characters replaced with `_` before storage — prevents path traversal
- **URL access**: Direct S3 URL returned on upload; no presigned-URL refresh implemented in v1

## Database Changes

Migration: `drizzle/migrations/0064_attachments_photo_columns.sql`

Three new columns added to the existing `attachments` table (no new table created — the `attachments` table already supports `entityType="deficiency"`):

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `locationNote` | varchar(255) | NULL | "where in the building" free-text |
| `isCustomerFacing` | tinyint(1) | 1 | Controls PDF and quote output inclusion |
| `sortOrder` | int | 0 | Display ordering within a deficiency |

New index: `att_photo_media_idx ON attachments (entityType, entityId, isCustomerFacing, sortOrder)`

**Run manually on Railway production after deploy** — PlanetScale does not support ALTER TABLE in transactions.

## Backend Methods Added

Router: `server/routers/mediaRouter.ts` — registered as `media.*` in `server/routers.ts`

| Procedure | Auth | Description |
|-----------|------|-------------|
| `listDeficiencyMedia` | technicianProcedure | List completed (non-deleted) photos for a deficiency |
| `uploadDeficiencyMedia` | technicianProcedure | Upload image: validates type/size, stores to S3, creates attachment record |
| `updateDeficiencyMedia` | technicianProcedure | Edit caption, locationNote, isCustomerFacing, sortOrder |
| `deleteDeficiencyMedia` | technicianProcedure | Soft delete: sets `uploadStatus = "failed"` |
| `reorderDeficiencyMedia` | adminOrOfficeProcedure | Bulk sortOrder update |
| `markCustomerFacing` | adminOrOfficeProcedure | Toggle isCustomerFacing for a single photo |
| `getMediaForJob` | adminOrOfficeProcedure | All deficiency photos for a job (office/admin view) |
| `getMediaForReport` | adminOrOfficeProcedure | Customer-facing only photos for a job |

**Security rules enforced in every procedure:**
- Company scoping: deficiency → job → `job.companyId === ctx.user.companyId`
- Finalized job guard: `job.finalizedAt` check in upload path
- MIME type whitelist: only jpeg/png/webp accepted
- File size cap: 15 MB
- Filename sanitisation: path traversal characters stripped
- Never trust client-supplied companyId

## Technician Photo Capture Behavior (DeficiencyEditor)

### Edit mode (existing deficiency)
- Photo section appears after the form fields
- Shows thumbnail grid of existing photos with caption/location note inputs
- "Camera" button: `<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment">` — opens rear camera on mobile
- "Gallery" button: `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>` — opens file picker / photo library
- Photos upload immediately on selection via `media.uploadDeficiencyMedia`
- Lightbox on thumbnail click
- Remove button (soft delete via `media.deleteDeficiencyMedia`)
- Caption and location note editable inline (on-blur update)
- Customer-facing badge visible (toggle is admin-only)

### Create mode (new deficiency)
- Same photo section appears
- Photos are queued locally (thumbnail grid with "Queued" badge)
- Caption and location note editable before save
- Remove pending photo before save
- After `deficiency.create` succeeds, photos upload sequentially with the new deficiency ID
- If a photo upload fails, toast error shown; others continue
- "Photos will upload automatically when you save this deficiency." hint shown when no photos queued

### Offline behavior
- When offline: amber warning banner shown — "Photo upload requires a connection. Photos will not be saved while offline."
- Camera/Gallery buttons hidden when offline
- Deficiency text can still be saved offline (existing behavior)
- **No offline photo queue**: photos are NOT queued for later sync. The Upload Queue table exists in the schema but is not wired up in v1. A future version could use it.

## Report QA Integration (QACheck)

- `media.getMediaForJob` called once for the job
- Photos are mapped to deficiencies by `entityId`
- Each deficiency row shows: text (existing), + photo thumbnail strip below
- Green `Eye` icon = customer-facing; gray `EyeOff` = internal only
- Critical deficiency with zero photos shows amber "No photo" warning
- Lightbox on thumbnail click

## Repair Quote Integration (RepairQuoteDetail)

- `media.getMediaForJob` fetches all deficiency photos for the linked job
- "Deficiency Photos" card appears after the line items, only if photos exist
- Photos are grouped by linked deficiency ID (via `item.deficiencyId`)
- Toggle button: `Eye` (customer-facing) ↔ `EyeOff` (internal) — calls `media.markCustomerFacing`
- Only items with a `deficiencyId` and associated photos are shown
- Lightbox on thumbnail click

## PDF / Report Behavior

### Implementation
- `server/routers/reportRouter.ts` — in the `generatePDF` procedure's deficiency mapping, after device info is fetched, customer-facing photos for each deficiency are pre-fetched using `fetchImageBuffer(row.fileUrl)` (same utility used for company logo and tech signature)
- Pre-fetch is parallel per deficiency, best-effort (failures logged, not fatal)
- `Deficiency` interface in `pdfGeneratorFirePro.ts` gains optional `photos` field
- If any deficiency has photos, a **"Deficiency Photos" appendix** is added after the deficiency table
- Layout: 2 columns, up to 230×160px per image, caption + location note below each image
- Only `isCustomerFacing = 1` photos appear in the PDF
- `isCustomerFacing = 0` (internal-only) photos are completely excluded from PDF output

### Limitations
- No image resizing server-side — large images are fit within the 230×160 box by PDFKit
- Photo appendix is a separate section (not inline with each deficiency row) — inline photos deferred to v2 due to complex fixed-height table layout
- `pdfGeneratorCompliance.ts` does not include photos in v1 (compliance reports are a different format)

## Document Center Behavior

The existing `documentCenterRouter.ts` already aggregates attachments by site/job. Deficiency photos added via this feature appear automatically in Document Center as `attachment` type items — no additional integration needed.

A dedicated `deficiency_photo` document type is not added in v1 because:
- The existing aggregation already works
- Adding a new type requires Document Center UI changes that are out of scope
- Photos are already linked to deficiency → job → site for drill-down

## Safety Limits (Enforced)

- ✅ File type validation: server rejects anything not jpeg/png/webp
- ✅ File size validation: 15 MB hard limit server-side
- ✅ Company scoping: every procedure verifies company ownership via job chain
- ✅ No cross-company access: companyId always from `ctx.user`, never from client input
- ✅ Internal-only photos excluded from PDF and report output
- ✅ No permanent delete: `deleteDeficiencyMedia` sets `uploadStatus = "failed"` (reversible)
- ✅ No customer portal: these endpoints are not exposed to customers (technicianProcedure / adminOrOfficeProcedure)
- ✅ No video support: MIME type enum only accepts image/jpeg, image/png, image/webp
- ✅ No heavy image editing dependencies added
- ✅ Filename sanitisation prevents path traversal

## Manual Test Checklist

### 1. Migration
- [ ] Run `0064_attachments_photo_columns.sql` on Railway production DB
- [ ] Verify: `DESCRIBE attachments;` shows `locationNote`, `isCustomerFacing`, `sortOrder` columns

### 2. Technician — create deficiency with photos
- [ ] Log in as technician, open an active (non-finalized) job
- [ ] Navigate to New Deficiency
- [ ] Type a title
- [ ] Click "Camera" button → camera opens (mobile) or file picker with camera option
- [ ] Select a JPEG or PNG photo
- [ ] Thumbnail appears with "Queued" badge
- [ ] Add optional caption and location note
- [ ] Click "Save Deficiency"
- [ ] Toast: "Deficiency created"
- [ ] Photo is uploaded (no error toast)
- [ ] Navigate back to deficiency edit — photo appears in the gallery

### 3. Technician — add photo to existing deficiency
- [ ] Open an existing deficiency (edit mode)
- [ ] Photo section shows existing photos (if any)
- [ ] Click "Gallery" → select a PNG image
- [ ] Photo uploads immediately, thumbnail appears
- [ ] Add caption in text field → blur → caption saved
- [ ] Add location note → blur → saved

### 4. Technician — remove photo
- [ ] In edit mode, click X on a photo thumbnail
- [ ] Photo disappears from gallery
- [ ] No permanent delete from S3 (soft delete only)

### 5. Technician — offline
- [ ] Disable network on device
- [ ] Open DeficiencyEditor
- [ ] Amber warning shows: "Photo upload requires a connection"
- [ ] Camera/Gallery buttons hidden
- [ ] Can still save deficiency text (existing offline behavior)

### 6. Unsupported file type rejection
- [ ] Attempt to upload a PDF or MP4
- [ ] Toast: "only JPEG, PNG, and WebP photos are supported"
- [ ] No upload proceeds

### 7. File size rejection
- [ ] Attempt to upload an image larger than 15 MB
- [ ] Toast: "file exceeds 15 MB limit"

### 8. Office — Report QA photo gallery
- [ ] Log in as admin/office
- [ ] Navigate to Report QA → open a job that has deficiencies with photos
- [ ] Deficiency rows show photo thumbnails below text
- [ ] Green Eye icon = customer-facing; gray EyeOff = internal
- [ ] Critical deficiency with no photos shows amber "No photo" warning
- [ ] Click thumbnail → lightbox opens
- [ ] Click outside lightbox → closes

### 9. Office — Repair Quote deficiency photos
- [ ] Open a repair quote linked to a job with deficiency photos
- [ ] "Deficiency Photos" card appears below line items
- [ ] Photos grouped by deficiency/item
- [ ] Click Eye/EyeOff toggle → customer-facing flag updates immediately
- [ ] Click thumbnail → lightbox opens

### 10. Report PDF includes photos
- [ ] Add at least one customer-facing photo to a deficiency
- [ ] Generate the deficiency report PDF for that job
- [ ] PDF downloads/opens
- [ ] "DEFICIENCY PHOTOS" appendix section appears after deficiency table
- [ ] Photo shown with caption and location note
- [ ] Mark photo as internal (isCustomerFacing=0) → regenerate PDF
- [ ] Photo no longer appears in PDF

### 11. Cross-company access blocked
- [ ] Log in as technician from Company A
- [ ] Attempt to call `media.listDeficiencyMedia` with a deficiency ID from Company B
- [ ] Server returns FORBIDDEN (403)

### 12. Finalized job blocks photo upload
- [ ] Finalize a job
- [ ] Attempt `media.uploadDeficiencyMedia` for a deficiency on that job
- [ ] Server returns FORBIDDEN with "Job is finalized" message
