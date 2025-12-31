# PDF Generator Audit Report

## Current State (Before Refactor)

### Active PDF Generators

1. **pdfGeneratorFirePro.ts** (`generateInspectionReportPDF`)
   - Used by: `trpc.report.generatePDF` endpoint
   - Purpose: Deficiency/quote-style report with pricing
   - Features:
     - Cover page with cityscape background
     - Letter-style summary page
     - Device tables grouped by category
     - Deficiency pricing table with costs
     - Terms & conditions with total amount
   - Status: **ACTIVE** - Currently used for "Deficiency Report" type

2. **pdfGeneratorCompliance.ts** (`generateComplianceReportPDF`)
   - Used by: `trpc.report.generateCompliancePDF` endpoint
   - Purpose: CAN/ULC-S536 compliance inspection form
   - Features:
     - Form-style layout with repeating headers
     - Table of contents with system checkboxes
     - CAN/ULC checklist sections (122 items, 15 sections)
     - Device inspection tables
     - Deficiencies summary (NO pricing)
     - Technician sign-off
   - Status: **ACTIVE** - Currently used for "Compliance Report" type

3. **pdfGenerator.ts** (if exists)
   - Status: **DEPRECATED** or **UNUSED** - Need to verify

### Current Endpoints

Located in `server/routers.ts`:

1. **`generatePDF`** (line 877)
   - Input: `{ jobId, summary? }`
   - Generator: `generateInspectionReportPDF` from `pdfGeneratorFirePro.ts`
   - Output: S3 URL with pattern `reports/{companyId}/{jobNumber}-{timestamp}.pdf`
   - Purpose: Deficiency report with pricing

2. **`generateCompliancePDF`** (line 1014)
   - Input: `{ jobId }`
   - Generator: `generateComplianceReportPDF` from `pdfGeneratorCompliance.ts`
   - Output: S3 URL with pattern `reports/{companyId}/{jobNumber}-compliance-{timestamp}.pdf`
   - Purpose: Annual inspection compliance report

### Current UI Implementation

Located in `client/src/pages/admin/Reports.tsx`:

- Single "Generate Report" dialog with radio button selector
- Two report types:
  - "Deficiency Report (Quote)" → calls `generatePDF`
  - "CAN/ULC-S536 Compliance Report" → calls `generateCompliancePDF`
- Conditional UI: Executive Summary field only shows for deficiency reports

### Issues Identified

1. **Enum Mismatch**: 
   - Database likely uses: `pass`, `fail`, `na`, `not_tested`
   - Compliance generator expects: `PASS`, `DEFICIENT`, `N/A`
   - Need to verify actual DB schema and standardize

2. **No Location Enforcement**:
   - Annual report doesn't block on missing device locations
   - Deficiency report doesn't block on missing deficiency locations

3. **No Checklist Completeness Enforcement**:
   - Annual report has validation but may not block properly
   - Need to verify blocking behavior

4. **Power Supply Inclusion**:
   - Need to verify if power supplies are incorrectly included in device tables

5. **Naming Confusion**:
   - `generatePDF` is ambiguous (should be `generateDeficiencyPDF`)
   - `generateCompliancePDF` is clear but should be `generateAnnualPDF` for consistency

## Refactor Plan

### Phase 1: Fix Enum Mismatch
- Update DB schema enum values
- Migrate existing data
- Update all code references

### Phase 2: Add Location Enforcement
- Validate device locations before Annual report
- Validate deficiency locations before Deficiency report
- Return detailed error responses

### Phase 3: Exclude Power Supplies
- Add device type filter
- Verify exclusion in device tables

### Phase 4: Create New Endpoints
- Create `generateAnnualReport` (replaces `generateCompliancePDF`)
- Create `generateDeficiencyReport` (replaces `generatePDF`)
- Add backward compatibility with deprecation warnings

### Phase 5: Update UI
- Rename buttons for clarity
- Add error modals for validation failures
- Wire to new endpoints

## Backward Compatibility Strategy

Keep old endpoints temporarily:
- `generatePDF` → redirects to `generateDeficiencyReport` with warning log
- `generateCompliancePDF` → redirects to `generateAnnualReport` with warning log

Remove after 1-2 releases when all clients updated.
