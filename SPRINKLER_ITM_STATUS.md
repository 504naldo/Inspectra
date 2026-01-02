# Sprinkler ITM Module - Implementation Status

## ✅ Completed (MVP Foundation)

### Database Schema
- **4 new tables created** (migration 0007_rapid_ultron.sql):
  - `sprinkler_inspections`: Main inspection record with draft/finalized status
  - `sprinkler_systems`: System summary grid (up to 6 systems per inspection)
  - `sprinkler_checklist_items`: Checklist questions with YES/NO/NA responses
  - `sprinkler_devices`: Device list with required location field

### Backend (Complete)
- **Database helpers** (`server/db.sprinkler.ts`):
  - Full CRUD operations for all 4 tables
  - Validation helpers (location required, NO responses need comments)
  - Deficiency extraction logic
  - Upsert operations for bulk updates

- **tRPC Router** (`server/sprinklerRouter.ts`):
  - 20+ procedures covering all operations
  - Role-based access control (technician/admin)
  - Finalize workflow with validation
  - Deficiency retrieval

### Frontend (Scaffolding)
- **Route added**: `/tech/jobs/:jobId/sprinkler-itm`
- **Main page created**: `client/src/pages/technician/SprinklerITM.tsx`
  - Tab navigation (Systems, Checklist, Devices)
  - Auto-create inspection on first visit
  - Finalize and Export PDF buttons (placeholders)
  - Mobile-friendly layout structure

## 🚧 Remaining Implementation

### 1. Systems Tab UI
**Priority: High**

Implement editable grid for 6 systems with fields:
- System type checkboxes (Wet, Dry Pipe, Deluge, Preaction, Other)
- Date pickers (Last Full Flow Test, Last 5 Year Internal)
- Text inputs (Area, Size, Manufacturer, Model)
- Pressure fields (System Water, Supply Water, Residual, System Air, Low Air Switch, Trip)

**Implementation approach**:
```tsx
// Use shadcn/ui Card components for each system
// Save on blur or "Save All" button
// Call trpc.sprinkler.upsertSystems.mutate()
```

### 2. Checklist Tab UI
**Priority: High**

Implement grouped checklist with 7 sections:
- General (11 questions)
- Dry Systems (14 questions + number/date fields)
- Control Valves (4 questions)
- Water Supplies (2 questions)
- Wet System (11 questions + antifreeze temps)
- Alarms (8 questions)
- Sprinkler Piping (3 questions)

**Implementation approach**:
```tsx
// Use shadcn/ui RadioGroup for YES/NO/NA
// Show textarea when NO selected (required comment)
// Special inputs for number/date/temp fields
// Call trpc.sprinkler.updateChecklistItem.mutate() on change
```

**Default questions** are documented in `sprinkler-itm-schema.md`

### 3. Devices Tab UI
**Priority: High**

Implement editable table with columns:
- Location (required, text input)
- Label/LCD text
- Device Type (TS, FS, FPS, LA, etc.)
- Address
- Zone
- Checks A-F (checkboxes)
- Remarks (textarea)

**Implementation approach**:
```tsx
// Use shadcn/ui Table component
// Inline editing or modal for each row
// Add/Delete buttons
// Highlight missing locations in red
// Call trpc.sprinkler.upsertDevices.mutate()
```

### 4. PDF Generator
**Priority: Critical**

Create `server/pdfGeneratorSprinklerITM.ts` matching Excel template:

**Page structure**:
1. Header (all pages): EWF logo, site info, building ID, date, technician
2. Section 1: Systems summary table (6 systems)
3. Section 2: Checklist (grouped by section, show responses + comments)
4. Section 3: Devices table (all devices with checks)
5. Section 4: Deficiencies summary (NO responses + failed device checks)
6. Footer (all pages): Company info, page numbers, compliance statement

**Compliance wording**:
> "Inspection, testing, and maintenance performed in alignment with NFPA 25 and applicable City of Vancouver Fire By-law requirements."

**Reference existing generators**:
- `server/pdfGeneratorFirePro.ts` (deficiency report structure)
- `server/pdfGeneratorCompliance.ts` (checklist formatting)

### 5. Validation & Finalize
**Priority: High**

Wire up finalize button:
```tsx
const finalize = trpc.sprinkler.finalizeInspection.useMutation({
  onSuccess: () => {
    toast.success("Inspection finalized");
    // Lock UI for editing
  },
  onError: (error) => {
    toast.error(error.message); // Shows validation errors
  }
});
```

Validation rules (already implemented in backend):
- All devices must have location
- All NO responses must have comments

### 6. Export PDF Button
**Priority: Critical**

Add tRPC procedure:
```typescript
exportPDF: technicianProcedure.input(z.object({
  inspectionId: z.number(),
})).mutation(async ({ input }) => {
  // Get all data
  const inspection = await sprinklerDb.getSprinklerInspectionById(input.inspectionId);
  const systems = await sprinklerDb.getSprinklerSystemsByInspectionId(input.inspectionId);
  const checklist = await sprinklerDb.getSprinklerChecklistItemsByInspectionId(input.inspectionId);
  const devices = await sprinklerDb.getSprinklerDevicesByInspectionId(input.inspectionId);
  
  // Generate PDF
  const pdfBuffer = await generateSprinklerITMPDF({
    inspection,
    systems,
    checklist,
    devices,
  });
  
  // Upload to S3
  const { url } = await storagePut(
    `sprinkler-itm/${inspection.id}-${Date.now()}.pdf`,
    pdfBuffer,
    'application/pdf'
  );
  
  return { url };
});
```

### 7. Testing
**Priority: Medium**

Create test file `server/sprinklerITM.test.ts`:
- Test validation rules
- Test deficiency extraction
- Test PDF generation with sample data
- Test finalize workflow

## 📋 Quick Start for Completion

1. **Start with PDF generator** (most critical):
   - Copy structure from `pdfGeneratorFirePro.ts`
   - Implement 4 sections matching Excel template
   - Test with mock data

2. **Implement Devices tab** (simplest UI):
   - Basic table with inline editing
   - Location validation
   - Add/delete rows

3. **Implement Checklist tab**:
   - Load default questions from schema doc
   - YES/NO/NA radio groups
   - Conditional comment fields

4. **Implement Systems tab**:
   - 6 system cards
   - All input fields from schema
   - Save all button

5. **Wire up buttons**:
   - Finalize with validation
   - Export PDF with download

## 🎯 Estimated Time to Complete

- PDF Generator: 3-4 hours
- Devices Tab UI: 2-3 hours
- Checklist Tab UI: 3-4 hours (includes loading default questions)
- Systems Tab UI: 2-3 hours
- Testing & Polish: 2 hours

**Total: 12-16 hours** for full implementation

## 📚 Reference Files

- Schema design: `sprinkler-itm-schema.md`
- Excel template: `inspection_data.xlsm` (tabs: Sprinkler Systems, Sprinkler Report, Sprinkler Devices)
- Database helpers: `server/db.sprinkler.ts`
- tRPC router: `server/sprinklerRouter.ts`
- UI scaffolding: `client/src/pages/technician/SprinklerITM.tsx`

## 🔗 Integration Points

To access Sprinkler ITM from job details page, add button:
```tsx
<Link href={`/tech/jobs/${jobId}/sprinkler-itm`}>
  <Button variant="outline">
    <FileText className="h-4 w-4 mr-2" />
    Sprinkler ITM
  </Button>
</Link>
```

## ✨ Future Enhancements

- Auto-populate devices from site device inventory
- Pre-fill checklist with previous inspection responses
- Email PDF to customer on finalize
- Deficiency auto-creation from NO responses
- Mobile camera integration for device photos
- Offline mode with sync
