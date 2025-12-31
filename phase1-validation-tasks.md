# Phase 1: Hard Validation + Enforcement (Existing Endpoints)

## Tasks

### Checklist Completeness Validation (generateCompliancePDF)
- [x] Checklist audit already exists in checklistValidation.ts
- [ ] Verify checklist audit blocks generation properly
- [ ] Ensure error response includes missing items list with section + itemId + description
- [ ] Test with incomplete checklist data

### Location Validation (generateCompliancePDF - Annual Report)
- [ ] Import validateAnnualReportLocations from locationValidation.ts
- [ ] Fetch all devices before filtering (fire alarm, extinguishers, emergency lights)
- [ ] Run location validation before PDF generation
- [ ] Block generation if any device missing location
- [ ] Return error with missing device list (id, type, identification)
- [ ] Test with devices missing locations

### Location Validation (generatePDF - Deficiency Report)
- [ ] Import validateDeficiencyReportLocations from locationValidation.ts
- [ ] Fetch all deficiencies for the job
- [ ] Run location validation before PDF generation
- [ ] Block generation if any deficiency missing location
- [ ] Return error with missing deficiency list (id, description, severity)
- [ ] Test with deficiencies missing locations

### Error Response Payloads
- [ ] Document exact error response for missing checklist items
- [ ] Document exact error response for missing device locations
- [ ] Document exact error response for missing deficiency locations

### Acceptance Testing
- [ ] Test: generateCompliancePDF blocks on incomplete checklist
- [ ] Test: generateCompliancePDF blocks on missing device locations
- [ ] Test: generatePDF blocks on missing deficiency locations
- [ ] Test: generateCompliancePDF succeeds with complete data
- [ ] Test: generatePDF succeeds with complete data
