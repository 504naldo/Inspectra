# Fire Inspect Pro - TODO

## Database & Schema
- [x] Company table with tenant isolation
- [x] Extended User table with roles (Admin, Office, Technician, Customer)
- [x] CustomerOrg table for customer organizations
- [x] Site table for inspection locations
- [x] Area table for site areas/zones
- [x] Asset/Device table for fire alarm devices
- [x] Job/Inspection table for inspection jobs
- [x] InspectionResult table for device test results
- [x] Deficiency table with status tracking
- [x] Repair table for repair records
- [x] Attachment table for photos
- [x] Report table for generated PDFs
- [x] KnowledgeBase table for RAG documents

## Authentication & Authorization
- [x] Role-based access control (Admin, Office, Technician, Customer)
- [x] Protected routes based on user role
- [x] Tenant isolation across all queries
- [x] Customer portal access restrictions

## Backend API Routes
- [x] Company management CRUD
- [x] User management with role assignment
- [x] Customer organization CRUD
- [x] Site management CRUD
- [x] Area management CRUD
- [x] Device/Asset management CRUD
- [x] Job/Inspection management CRUD
- [x] Inspection results recording
- [x] Deficiency CRUD with status updates
- [x] Repair records management
- [x] Photo attachment upload/retrieval
- [x] Report generation and storage

## AI-Powered Features
- [x] Deficiency narrative generator (description, corrective action, customer explanation)
- [x] Smart repair recommendations (troubleshooting, parts/tools, checklist)
- [x] Inspection report summary writer (executive summary, counts, priorities)
- [x] Photo note helper (caption generation)
- [x] QA check scanner (missing data detection)

## Mobile-First Technician Interface
- [x] Jobs list with search and filters
- [x] Job details with site info and device list
- [x] Device test screen (PASS/FAIL/NA buttons)
- [x] Notes and photo capture
- [x] Deficiency list view (Open/Closed)
- [x] Deficiency editor with photos
- [x] Offline-first data caching
- [x] Sync screen with pending uploads

## Admin Dashboard
- [x] Job oversight and management
- [x] User management interface
- [x] QA check functionality
- [x] Company settings
- [x] Analytics and reporting

## Customer Portal
- [x] Report viewing
- [x] Deficiency status tracking
- [x] Approval workflows
- [x] Access controls (own data only)

## Report Generation
- [x] Report creation with AI summary
- [x] Device summary section (counts)
- [x] Deficiency counts and details
- [x] Executive summary integration
- [ ] PDF export (future enhancement)

## UI/UX
- [x] Clean, professional design
- [x] Mobile-first responsive layout
- [x] Large tap targets for field use
- [x] Fast workflow with minimal typing
- [x] Loading states and error handling


## File Management Features (New)
- [x] Enhanced Attachment table with tags, linked entities, and metadata
- [x] Import logs table for tracking CSV/XLSX imports
- [x] S3 storage integration for file uploads
- [x] Bulk file upload API endpoint
- [x] File tagging system (add/remove tags)
- [x] Link files to Site/Inspection/Asset
- [x] Customer → Site → Files admin page
- [x] File preview and download functionality

## Asset Import Features (New)
- [x] CSV/XLSX file parsing on backend
- [x] Column mapping screen UI
- [x] Validation preview with error highlighting
- [x] Duplicate detection and handling options
- [x] Import execution with progress tracking
- [x] Import results log with success/error counts
- [x] Site → Assets → Import admin page

## Mobile Upload Features (New)
- [x] Camera capture integration
- [x] File picker for gallery/documents
- [x] Upload queue management
- [x] Retry failed uploads
- [x] Background/resumable uploads
- [x] Upload progress indicators
- [x] Offline queue with sync on reconnect

