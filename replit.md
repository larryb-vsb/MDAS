# Merchant Datawarehouse and Automation System (MDAS)

## Overview

The Merchant Datawarehouse and Automation System (MDAS) is a comprehensive merchant data warehouse for Vermont State Bank. Its primary purpose is to integrate mainframe data processing, merchant management, and financial reporting. Key capabilities include processing TSYS mainframe TDDF files, ensuring merchant ACH deposit compliance, providing API integrations, and delivering real-time analytics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript (Vite build tool).
**UI Component Library**: Radix UI primitives with Tailwind CSS (shadcn/ui design system).
**State Management**: React hooks and context, with real-time updates via WebSockets.
**Key Design Patterns**: Component-based, real-time data visualization using pre-aggregated backend data, performance-optimized rendering, manual refresh controls with cooldowns.

### Backend Architecture

**Runtime**: Node.js with Express.js (TypeScript/ESModules).
**Database ORM**: Drizzle ORM for type-safe operations.
**File Processing Pipeline**: Multi-phase system (Upload, Validation, Parsing, Processing, Aggregation/Caching) with automatic status tracking.
**Key Design Decisions**: Dual environment support (`dev_*` tables), watcher service for autonomous processing, database-level concurrency control, automatic recovery.

### Data Storage Solutions

**Primary Database**: PostgreSQL via Neon serverless (connection pooling configured).
**Object Storage**: Replit Object Storage for file persistence with environment-specific prefixes.
**Hybrid Storage Strategy**: Raw file lines in object storage, processed records in PostgreSQL, pre-aggregated summary tables for dashboards.
**Caching Layer**: Dashboard cache tables for expensive queries, updated by watcher services.

### Authentication and Authorization

**Session Management**: Express-session with PostgreSQL session store.
**API Authentication**: API key-based for external integrations.
**Multi-Factor Authentication**: Duo Security and Azure MSAL integrations.

### Schema Version Management

**SchemaWatch Auto-Tracking System**: Utilizes PostgreSQL event triggers and materialized views to automatically detect and log all database schema changes in development, ensuring an accurate audit trail and versioning. Production schema updates are managed manually.

## External Dependencies

### Third-Party Services

**Database**: Neon PostgreSQL serverless.
**Object Storage**: Replit Object Storage, AWS S3, Google Cloud Storage.
**Authentication Providers**: Duo Security, Azure MSAL.

### APIs and Integrations

**TDDF API**: External API for automated file uploads.
**Processing APIs**: Internal APIs for real-time processing stats, file management, merchant data queries, and transaction reporting.
**Payment Processing**: TSYS merchant processing system.
**File Format Support**: TDDF, TSYSO, CSV/TSV, Excel files.

## Recent Changes

### December 18, 2025 - Fixed Timing Display and File Size Issues
**Change**: Restored missing timing endpoint and fixed production display issues for "Unknown" file size and "no timing data".

**Files Modified**:
- `server/routes.ts`: Added `/api/uploader/:id/timing` endpoint (restored from backup)
- `client/src/pages/TddfApiDataPage.tsx`: Updated file display to gracefully handle null fileSize and uploadedAt fields

**Technical Details**:
- Timing endpoint queries `processing_timing_logs` table first, falls back to `uploader_uploads.encoding_time_ms`
- Returns formatted duration (e.g., "5 min 23 sec", "45 sec", "230 ms")
- Frontend now conditionally displays file size only when available (no "Unknown" label)
- Added proper fallback for missing uploadedAt dates
- Changed default line count from hardcoded "9,155" to "calculating"

### December 18, 2025 - Reset Status Button for Stuck Files
**Change**: Added ability to reset files from ANY stuck status (encoding, error, failed, etc.) back to "uploaded" for reprocessing. Renamed "Reset Errors" button to "Reset Status" to reflect broader functionality.

**Files Modified**:
- `server/routes.ts`: Added new `/api/uploader/reset-status` endpoint
- `client/src/pages/TddfApiDataPage.tsx`: Added `resetStatusMutation`, updated button to use new endpoint

**Technical Details**:
- Backend endpoint resets files with any status except 'uploaded' and 'completed'
- Uses database transaction with race condition handling
- Frontend button filters selectedUploads to only include resettable files
- Clears processing_errors, failed_at, and retry_count on reset

### December 18, 2025 - MDAS Batch Uploader v1.3.0
**Change**: Updated Python batch uploader script with MDAS branding and server wake-up functionality.

**Files Modified**:
- `tools/batch-uploader.py`: Version 1.3.0

**Technical Details**:
- Renamed all "MMS" references to "MDAS"
- Added server wake-up loop that sends authenticated pings until server confirms API key is validated
- Wake-up requires `keyStatus == 'valid'` before proceeding with uploads
- Configurable max attempts (30) and retry interval (5s)

### December 4, 2025 - TypeScript Bug Fixes (31 LSP Errors Resolved)
**Change**: Fixed 31 TypeScript type safety issues across backend route files identified by static code analysis.

**Files Modified**:
- `server/routes.ts`: 27 fixes applied
- `server/routes/tddf-files.routes.ts`: 4 fixes applied

**Technical Details**:
- **Type Safety**: Added `Record<string, any>` type assertions for dynamic object property access (extractedFields, merchantAccountNumber, merchantName)
- **Buffer Handling**: Added `Buffer.isBuffer()` guards before calling `toString()` on ReplitStorageService responses
- **Error Handling**: Added proper type guards (`error instanceof Error ? error.message : String(error)`) for unknown error types in catch blocks
- **File Path Types**: Added explicit type assertions for storage_path when used with fs.existsSync/readFileSync
- **Implicit Any**: Added explicit `: string` type annotations for filter/callback parameters
- **Strict Mode**: Converted function declaration to arrow function for formatCSV helper
- **Property Access**: Changed `upload.createdAt` to `upload.startTime` with fallback for date calculations

### December 4, 2025 - SQL Injection False Positive Fix
**Change**: Refactored SQL query construction to use direct parameterized placeholders (`$1`) instead of interpolated placeholder variables.

**Files Modified**:
- `server/routes/tddf-files.routes.ts`: Lines 928, 945, 951

**Technical Details**:
- Removed unnecessary `const placeholders = '$1';` variable
- Replaced `${placeholders}` with direct `$1` in parameterized queries
- Code was not actually exploitable (hardcoded placeholder) but violated best practices

### December 3, 2025 - DT Field Search on TDDF API Raw Data Tab
**Change**: Added advanced field-based search capability for DT records on the Raw Data tab. Users can now select a specific DT field (e.g., Merchant Account Number, Transaction Amount, Reference Number) and search for values within that field position in the raw TDDF data.

**Files Created/Modified**:
- `shared/dtFields.ts`: **Created** - Complete DT field definitions with 90+ fields, including positions, lengths, formats, and descriptions
- `client/src/pages/TddfApiDataPage.tsx`: Added DT Field dropdown and Search Value input with auto-force to DT record type
- `server/routes/tddf-records.routes.ts`: Added field-based search using SUBSTRING extraction on raw_line data

**Technical Details**:
- Field positions defined in shared constants ensure consistency between frontend and backend
- Search uses PostgreSQL SUBSTRING(raw_line FROM start FOR length) for precise field extraction
- When field search is active, record type is automatically set to DT for safety
- Query parameters: `fieldKey` (field name), `fieldValue` (search value)
- Parameterized queries prevent SQL injection

### December 3, 2025 - Navigation Updates
**Change**: Renamed "MMS Uploader" to "MDAS Uploader" in Legacy submenu for consistency with system name.

**Files Modified**:
- `client/src/components/layout/MainLayout.tsx`: Updated submenu label

### December 3, 2025 - Accessibility and TypeScript Bug Fixes
**Change**: Fixed DOM nesting errors, TypeScript type safety issues, and accessibility warnings across multiple components.

**Files Modified**:
- `client/src/pages/ProcessingPage.tsx`: 
  - Fixed AlertDialogDescription DOM nesting error by using `asChild` with `<div>` wrapper (prevents `<ul>` inside `<p>`)
  - Added `ResetStuckFilesResponse` interface for proper mutation typing
- `client/src/components/ui/sheet.tsx`:
  - Added `accessibleTitle` prop for screen reader-accessible titles
  - Added `hideDefaultTitle` prop for cases where consumers provide their own SheetTitle
  - Imports `VisuallyHidden` from `@radix-ui/react-visually-hidden`
- `client/src/components/layout/MainLayout.tsx`: Added `accessibleTitle="Navigation Menu"` to mobile nav SheetContent
- `client/src/components/ui/sidebar.tsx`: Added `hideDefaultTitle` to avoid duplicate hidden titles

### December 3, 2025 - Removed TDDF Records Page Entirely
**Change**: Completely removed the TDDF Records page (`/tddf-records`) and associated code.

**Files Modified/Deleted**:
- `client/src/App.tsx`: Removed TddfPage import and `/tddf-records` route
- `client/src/components/layout/MainLayout.tsx`: Removed "TDDF Records" link from Legacy submenu, removed location checks
- `client/src/pages/tddf-page.tsx`: **Deleted**

### December 3, 2025 - TDDF Records Page Data Source Migration
**Change**: Connected the Legacy TDDF Records page (`/legacy/tddf`) DT Records tab to use the `tddf_json` data source instead of the legacy `/api/tddf` endpoint.

**Files Modified**:
- `client/src/pages/tddf-page.tsx`: Updated DT Records query to use `/api/tddf-json/records` with `recordType=DT` filter
- `server/routes/tddf-records.routes.ts`: Implemented full `/api/tddf-json/records` endpoint with filtering, pagination, and sorting

**Technical Details**:
- Query endpoint changed from `/api/tddf` to `/api/tddf-json/records?recordType=DT`
- Response data is transformed from `extracted_fields` JSON structure to expected TddfRecord format
- Filter parameters mapped: `txnDateFrom/txnDateTo` → `dateFilter` or `startDate/endDate`
- Sort field names mapped: `transactionDate` → `transaction_date`, etc.
- Cache invalidation updated for both old and new query keys