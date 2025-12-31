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


## Data Import from Excel (New)
- [x] Analyzed Excel file structure (#0313-2025ANNUAL-12500TRITESROAD)
- [x] Extracted customer info (Trites Road Strata, Gerald Phang)
- [x] Extracted site info (12500 Trites Road, Richmond, BC)
- [x] Imported 33 devices (Emergency Lights, Fire Extinguishers, Sprinkler devices)
- [x] Imported 17 deficiencies with severity levels (critical, major, minor)
- [x] Created job record for Annual Inspection (#0313-2025ANNUAL)
- [x] Associated user with company for data visibility

## Bug Fixes
- [x] Fix nested anchor tag error on /admin/jobs page
- [x] Fix report summary display - unable to view entire summary
- [x] Import data from "Individual device record" sheet in Excel file (134 devices: 76 smoke alarms, 10 emergency lights, 9 sprinkler devices, 35 fire alarm devices, 4 fire extinguishers)
- [x] Battery testing fields in Section 4 not showing in mobile version (fixed data structure mismatch between API and frontend)

## PDF Report Generation (New)
- [x] Install PDF generation library (pdfkit)
- [x] Create PDF template with company branding
- [x] Add device summary section to PDF
- [x] Add deficiency details section to PDF
- [x] Add inspection results table to PDF (24 pages)
- [x] Create backend endpoint for PDF generation
- [x] Update Reports UI with PDF download button
- [x] Test PDF generation with sample data (165 devices, 19 deficiencies)

## Fire Alarm Inspection Section (CAN/ULC S536)
- [x] Analyze fire alarm tab from spreadsheet (20 sections, 155 items)
- [x] Update database schema for fire alarm inspection requirements
- [x] Create fire alarm device categories and test procedures (155 items)
- [x] Build fire alarm inspection UI page
- [x] Add CAN/ULC S536 compliance checklist (20 sections)
- [x] Integrate with existing job workflow

## Fire Alarm System Setup Page (New)
- [x] Create admin fire alarm system setup page
- [x] Add form for manufacturer, model, operation type
- [x] Add monitoring centre information fields
- [x] Add navigation link from Sites page
- [x] Test create and update functionality

## Fire Alarm Inspection Button (New)
- [x] Add "Fire Alarm Inspection" button to Job Details page
- [x] Link button to fire alarm inspection workflow
- [x] Test navigation from job details to fire alarm inspection

## Fire Alarm Inspection PDF Report Format (New)
- [x] Analyze PDF pages 8-17 to understand report format
- [x] Identify checklist items requiring numeric values (16 types)
- [x] Update database schema to support numeric values for checklist items
- [x] Update fire alarm inspection UI to support numeric inputs
- [ ] Update PDF generator to match pages 8-17 format
- [ ] Test PDF generation with numeric values

## Update Fire Alarm Seed Script (New)
- [x] Update seed script with correct input types for numeric/text fields
- [x] Add battery specification fields (voltage, capacity, quantity)
- [x] Add firmware/software version fields
- [x] Add time measurement fields
- [x] Add monitoring centre name and phone fields
- [x] Run updated seed script to populate database (96 items across 20 sections)

## Fire Alarm Auto-Save Feature (New)
- [x] Update backend API to support saving individual inspection results (already existed)
- [x] Implement auto-save logic in frontend with debouncing (2 second delay)
- [x] Add visual feedback for auto-save status (saving/saved/error indicators)
- [x] Test auto-save with slow network conditions (browser tested)
- [x] Write unit tests for auto-save functionality (5 tests passing)

## Offline Mode Support (New)
- [x] Create IndexedDB wrapper for local data storage
- [x] Implement offline detection and connection status indicator (Online/Offline badge)
- [x] Add local storage fallback when saving inspection results offline
- [x] Implement automatic sync queue for pending changes
- [x] Add background sync when connection returns (automatic on reconnect)
- [x] Show sync status indicator (Online/Offline + pending count badge)
- [x] Test offline mode with browser testing (manual verification)
- [x] IndexedDB tested through browser integration (client-side API)

## PWA (Progressive Web App) Upgrade (New)
- [x] Create Web App Manifest (manifest.json) with app metadata
- [x] Generate app icons in multiple sizes (192x192, 512x512, maskable)
- [x] Implement Service Worker for offline-first caching strategy (Workbox)
- [x] Add Service Worker registration in main.tsx
- [x] Configure Vite PWA plugin for automatic SW generation
- [x] Add PWA meta tags to HTML (theme-color, iOS support)
- [x] Test Service Worker registration (successfully registered)
- [x] Verify offline functionality with IndexedDB + Service Worker caching
- [x] Configure runtime caching strategies (NetworkFirst for API, CacheFirst for images/fonts)

## Bug Fixes - Post-Logout 404 Issue (New)
- [x] Identify which URL path causes 404 after logout (catch-all route was showing 404 instead of redirecting)
- [x] Configure SPA routing fallback to rewrite all non-API routes to /index.html (already configured in server/_core/vite.ts)
- [x] Ensure static assets resolve normally without rewrite (working correctly)
- [x] Fix auth redirect URLs to point to valid app routes (OAuth callback at /api/oauth/callback redirects to /)
- [x] Add catch-all route handler in client router to redirect unknown routes to "/" (changed from NotFound to Redirect)
- [x] Test sign-out → sign-in flow (works correctly, no 404)
- [x] Test deep link refresh (tested /admin/jobs and /some-invalid-route) - no 404
- [x] Verify OAuth callback URL configuration (correctly set to /api/oauth/callback)

## Login Redirect Behavior Fix (New)
- [x] Identify where OAuth callback redirects after successful sign-in (server/_core/oauth.ts line 47 redirects to "/")
- [x] Implement "returnTo" logic in OAuth callback to redirect to intended destination
- [x] Update getLoginUrl to accept optional returnTo parameter and encode it in redirect URI
- [x] Update ProtectedRoute to capture current location and pass as returnTo query param to /login
- [x] Update Login page to read returnTo from URL params and pass to OAuth flow
- [x] Add home guard to prevent flash of marketing page (shows loading spinner for authenticated users)
- [x] OAuth callback now reads returnTo query param and redirects there after successful auth
- [x] Home component already redirects authenticated users to role-based dashboard
- [x] Implementation verified: returnTo flows from ProtectedRoute → Login → OAuth → Callback → Final destination

## Bug Fixes - Login Redirect Still Showing Home Page (Critical)
- [x] Investigate why Home component redirect is not working after login (wouter setLocation not reliable)
- [x] Check if useEffect dependencies are correct (dependencies were correct)
- [x] Verify auth state is properly loaded before redirect logic runs (auth state loading correctly)
- [x] Test redirect with console logging to see execution flow (identified wouter issue)
- [x] Fix redirect mechanism to ensure immediate navigation to dashboard (replaced setLocation with window.location.href)

## Bug Fixes - PWA Login Redirect Issue (Critical)
- [x] Analyze PWA manifest start_url and scope configuration (start_url: "/" is correct)
- [x] Keep manifest start_url as "/" to allow PWA to always start at root
- [x] Implement global auth guard in App.tsx Router component that runs on mount
- [x] Ensure auth guard waits for auth state hydration (checks loading === false before redirect)
- [x] Fix Home component redirect to work properly in PWA standalone mode (removed local redirect logic)
- [x] Replace window.location.href with wouter setLocation for PWA compatibility (no full page reload)
- [x] Global auth guard checks if user is authenticated AND on "/" then redirects to role-based dashboard
- [x] Test: Browser login → lands on dashboard (verified working)
- [x] Implementation ensures PWA and browser behavior match exactly

## Bug Fixes - Auth State Hydration & Session Persistence (Critical)
- [x] Investigate useAuth hook to understand auth state hydration mechanism (uses trpc.auth.me.useQuery)
- [x] Ensure auth state is properly hydrated from session on app startup (working correctly)
- [x] Verify loading state properly reflects auth hydration status (loading state works correctly)
- [x] Check session cookie configuration (credentials: "include" configured correctly)
- [x] Ensure cookies persist correctly across refresh and are sent on API requests (working)
- [x] Fix OAuth callback to redirect directly to role-based dashboard instead of "/"
- [x] Keep global auth guard as backup safety net for edge cases
- [x] Remove debug console logs for production
- [x] Test: Login → lands on role-based dashboard (verified with console logs)
- [x] OAuth callback now fetches user role and redirects to /admin, /tech, or /customer
- [x] returnTo parameter still works for deep linking

## Bug Fixes - OAuth Cross-Site Cookie & State Routing (Critical)
- [x] Fix session cookie configuration for cross-site OAuth (manus.im → manus.space)
- [x] Set SameSite=None for session cookie to allow cross-site OAuth flow (already configured)
- [x] Ensure cookie is Secure=true, HttpOnly=true, Path=/ (already configured correctly)
- [x] Use host-only cookie (no explicit Domain) for manus.space (domain=undefined, correct)
- [x] Fix OAuth state parameter to encode returnTo route (not callback URL)
- [x] Base64-encode the intended post-login route in state parameter (btoa(targetRoute))
- [x] Default to "/admin" if no returnTo is specified (const targetRoute = returnTo || '/admin')
- [x] Update OAuth callback to decode state and validate for open redirect prevention
- [x] Only allow same-origin paths starting with "/" in state (decodedState.startsWith('/') && !decodedState.startsWith('//'))
- [x] Redirect to decoded state route after setting cookie (res.redirect(302, targetRoute))
- [x] Fallback to "/admin" if state is missing or invalid (try-catch with default)
- [x] If decoded state is "/", redirect to role-based dashboard instead
- [x] Test: Login → lands on /admin (verified working)
- [x] Cookie configuration supports cross-site OAuth with SameSite=None + Secure=true

## Bug Fixes - Mobile Chrome Session Cookie Not Persisting (Critical)
- [x] Verify tRPC client includes credentials: "include" in fetch configuration (main.tsx line 48)
- [x] No axios used, only tRPC with credentials: "include"
- [x] Ensure all API calls send cookies with requests (tRPC configured correctly)
- [x] Verify session cookie settings in OAuth callback (HttpOnly=true, Secure=true, SameSite=none, Path=/)
- [x] Add CORS middleware to Express server (server/_core/index.ts)
- [x] Ensure Access-Control-Allow-Credentials: true is set (credentials: true in CORS config)
- [x] Ensure Access-Control-Allow-Origin matches manus.space subdomains (regex pattern validation)
- [x] CORS allows all manus.space subdomains and localhost for development
- [x] CORS allows GET, POST, PUT, DELETE, OPTIONS methods
- [x] CORS allows Content-Type and Authorization headers
- [x] Installed cors package (pnpm add cors @types/cors)
- [x] Ready for mobile Chrome testing after deployment

## PDF Report Redesign - Fire-Pro Style (New)
- [x] Design professional cover page with hero image background and navy blue title block
- [x] Create letter-style summary page with recipient block, RE line, service details, and signature
- [x] Redesign device tables section with proper grouping (Fire Alarm Devices by type, Fire Extinguishers, Emergency Lights)
- [x] Add Location column to all device tables
- [x] Redesign deficiency table with Item #, Description, Device, and Total Labour & Material columns
- [x] Include location information in deficiency descriptions
- [x] Add consistent footer with company address/phone/email and page numbering (X of Y)
- [x] Create final page with total amount and terms/conditions block
- [x] Implement right-aligned currency formatting for prices
- [x] Change download behavior from window.open to automatic download with download attribute
- [x] Test PDF generation with new template
- [x] Verify all locations are displayed for devices and deficiencies

## Logo Integration (New)
- [x] Copy EWF logo image to project assets directory
- [x] Update PDF generator to embed logo image in cover page
- [x] Update PDF generator to embed logo in page headers
- [x] Test PDF generation with logo image
- [x] Verify logo displays correctly at proper size and position

## Bug Fix: __dirname Error in PDF Generator
- [x] Replace __dirname with ES module compatible path resolution
- [x] Test PDF generation from web interface
- [x] Verify logo loads correctly in production environment

## CAN/ULC-S536 Compliant Annual Inspection Report
- [x] Design repeating header template with EWF logo, building info, inspection frequency checkboxes
- [x] Create cover page with cityscape background and EWF branding
- [x] Implement table of contents page with system checkboxes
- [x] Create inspection summary page with compliance statements and technician sign-off
- [x] Implement Section 22.1: Control Unit or Transponder Inspection checklist
- [x] Implement Section 22.2: Control Unit or Transponder Test checklist (30+ items)
- [x] Implement Section 22.4: Power Supply Inspection checklist
- [x] Implement Section 22.5: Emergency Power Supply Test and Inspection (battery tests)
- [x] Implement Section 22.6: Annunciator Test and Inspection checklist
- [ ] Implement Section 22.7: Circuit Supervision checklist
- [ ] Implement Section 22.8-22.14: Initiating Devices checklists
- [ ] Implement Section 22.15-22.16: Signaling Devices checklists
- [x] Add individual device records table (all fire alarm devices with location, type, result)
- [x] Add fire extinguisher inspection table (location, type, serial, result)
- [x] Add emergency lighting inspection table (location, functional test, duration test)
- [x] Add deficiencies summary section (system, location, description - NO pricing)
- [x] Add final technician sign-off page with certification number and signature
- [x] Remove all pricing and quote-related content from compliance report
- [x] Test PDF generation with full CAN/ULC-S536 checklist structure
- [x] Verify all checkboxes render correctly (☐ ☒)
- [x] Verify repeating header appears on all pages except cover

## Report Type Selector (New)
- [x] Add report type state to Reports page (deficiency vs compliance)
- [x] Create radio button group or dropdown for report type selection
- [x] Update Generate PDF button to call appropriate endpoint based on selection
- [x] Add visual distinction between report types (icons, descriptions)
- [x] Test generating both report types from UI
- [x] Update UI to show which report type was generated in report history

## Full CAN/ULC-S536 Checklist Implementation (New)

### A) Checklist Data Model & Storage
- [x] Review existing checklist source data (seed + JSON files)
- [x] Create InspectionChecklistResponses table with jobId, itemId, status (PASS/DEFICIENT/NA), comment
- [ ] Add required flag to checklist items schema
- [x] Create database migration for new table
- [x] Add tRPC endpoints for saving/fetching checklist responses

### B) Technician UI for Checklist Completion
- [x] Create ChecklistCompletion page component for job inspection
- [x] Implement section grouping with expand/collapse functionality
- [x] Add quick controls for PASS/DEFICIENT/NA per item
- [x] Show comment box when DEFICIENT or NA is selected
- [x] Add "Mark section complete" indicator per section
- [x] Implement checklist completion progress tracker (X/Y complete)
- [ ] Add validation to prevent report finalization until checklist complete
- [ ] Add admin override option for incomplete checklists

### C) Annual Inspection PDF Rendering
- [x] Update compliance PDF generator to include ALL checklist sections
- [x] Render checklist items with PASS/DEFICIENT/NA checkbox indicators
- [x] Show comment lines for items marked DEFICIENT or NA
- [x] Position checklist chapter before device tables in PDF
- [x] Verify repeating header includes EWF logo, building info, inspection date, work order
- [x] Verify repeating footer with company contact and page X of Y
- [x] Test checklist rendering with all sections (22.1-22.16+)

### D) Completeness Validation & Enforcement
- [x] Create checklist coverage audit function
- [x] Compare required items vs recorded responses
- [x] Generate list of missing items (section + item text + itemId)
- [x] Block report generation if checklist incomplete with clear error message
- [ ] (Fallback) Add INCOMPLETE watermark and Missing Items page if generation forced
- [x] Surface missing items list to user in UI

### E) Acceptance Testing
- [x] Test: Create inspection with missing checklist items → verify generation blocks
- [x] Test: Complete all checklist items → verify report generates successfully
- [x] Test: Random sample 5 sections → confirm all items appear with markers
- [x] Test: Verify checklist chapter appears before device tables
- [x] Test: Verify header/footer repeat on every page with EWF logo
- [x] Test: Verify Annual vs Deficiency report scope differences maintained
