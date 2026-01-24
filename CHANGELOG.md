# Changelog

All notable changes to MDAS (Merchant Datawarehouse and Automation System) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.11] - 2026-01-24

### Changed
- Dashboard metric improvements:
  - Replaced redundant "Daily Processing" and "Today's Processing" cards with "Last 3 Days Processing" showing authorizations and purchases for the last 3 transaction dates
  - Added "TDDF Merchants Today" metric showing unique merchant count with transactions for current day
  - Updated "Total Records" to "Records Processed Last 30 Days" showing 30-day DT record count

### Added
- New helper functions: `getLast3DaysProcessing()` and `getTddfMerchantsForDate()`

### Fixed
- Date format handling to support both YYYYMMDD and YYYY-MM-DD formats in transaction date queries
- Updated TypeScript interfaces for dashboard metrics

## [2.0.10] - 2026-01-24

### Added
- Dedicated Email Settings page under System menu with three tabs:
  - Settings: Email service configuration/status display, connection testing, send test emails and alerts
  - Outbox: View pending/queued emails with recipient, subject, status, and retry count
  - History: View sent/failed emails with delivery timestamps and error messages
- New API endpoints: `/api/email/outbox` and `/api/email/history` for email management
- Enhanced Merchants page with "Flagged" filter (All, Flagged Only, Not Flagged) to review potential duplicate merchants
- Sortable "Client Since" column to merchant tables for tracking customer tenure

### Changed
- Client MID now displays abbreviated "...last5" format with full value shown on hover tooltip
- Sidebar navigation updates:
  - Changed Merchants icon from Users to Store with emerald-500 color
  - Moved Exports to appear after Reports and before System section

## [2.0.9] - 2026-01-22

### Added
- "Transactions" tab to History page showing individual DT records by actual transaction date
- Pagination support with "Page X of Y" controls for browsing DT records

### Changed
- Removed "Table View" tab and consolidated content into "Files Processed" tab
- History page now has 4 tabs: Files Processed, Processing, Transactions, Merchant Volume

### Fixed
- Transactions tab displays: DT badge (green), card type, masked account, amount, merchant ID/name, date, customer ID, file reference
- Uses `/api/tddf-records/dt-latest?batchDate=YYYY-MM-DD` endpoint to filter by transaction date

## [2.0.8] - 2026-01-22

### Added
- "Processing" tab to History page for TSYS reconciliation
- New `/api/tddf/daily-processing/:date` endpoint queries transactions by actual transaction date (from `extracted_fields->>'transactionDate'`) instead of file processing date

### Changed
- Renamed "Daily Overview" tab to "Files Processed" for clarity
- Tab layout updated from 3 columns to 4 columns

### Fixed
- Resolved confusion where MDAS appeared to have duplicates when comparing with TSYS daily summaries
- Processing tab shows Daily Summary (Total Authorizations/Capture with counts and amounts) and BIN Summary

## [2.0.7] - 2026-01-15

### Added
- Enhanced AH0314P1 merchant name fuzzy matching with PostgreSQL pg_trgm similarity function
- Uses 80% similarity threshold to catch near-duplicates (e.g., "TOROVERDE II INC" vs "TOROVERDE INC")
- Case-insensitive matching prevents duplicates like "METRO 1996 LLC" vs "Metro 1996 LLC"
- Normalizes names by removing business suffixes (LLC, INC, CORP, LTD, COMPANY, etc.) before comparison
- Returns highest similarity match when multiple candidates exist
- Restore buttons to file search results for both Active Uploads and Archived Files sections
- One-step `/api/uploader/upload` endpoint for batch uploader compatibility
- Duplicate file detection returns HTTP 409 with existing file ID

### Fixed
- Batch uploader uploads failing due to missing simple upload endpoint
- Production Neon connection errors logged for monitoring

## [2.0.6] - 2026-01-15

### Added
- GitHub-style 12-month activity heatmap on Archive tab showing daily archive activity
- Year navigation controls for heatmap (last 5 years)
- `/api/tddf-archive/activity-heatmap` endpoint with `?months=12` and `?year=YYYY` parameters
- File type filter dropdown on Archive tab (TDDF, ACH Transactions, ACH Merchant, MasterCard DI)
- Archive cards now display file size, file type, line count, and business day

### Changed
- Archive tab UI redesigned with card-based layout matching Processed tab
- Heatmap shows trailing 12-month window for current year, calendar year for past years

### Fixed
- Fixed heatmap alignment and whitespace issues with constants-based layout (10px cells, 2px gaps)
- Month labels properly positioned above corresponding grid columns

## [2.0.5] - 2026-01-14

### Added
- Merchant Alias System to prevent duplicate merchant creation during ACH imports
- `dev_merchant_aliases` table tracks alternate names, MIDs, and IDs for merged merchants
- ACH import now checks alias table before fuzzy matching
- MerchDem/MCC import checks ID aliases before creating new merchants
- Storage methods: `createMerchantAlias`, `getMerchantAliases`, `findMerchantByAlias`, `findMerchantByNameFuzzy`, `deleteMerchantAlias`

### Changed
- Merge operation auto-creates aliases for source merchant's name, ID, and MID

### Fixed
- Enhanced ACH filename parsing to support YYYYMMDD date format (ACH0314P1 files)
- Added `parseAchFilename()` and `extractBusinessDayFromFilename()` utilities

## [2.0.4] - 2026-01-12

### Fixed
- Fixed inconsistent terminal VAR number formats across all creation paths
- Terminal IDs are now normalized to canonical VXXXXXXX format (e.g., 78912073 → V8912073)

### Added
- `normalizeVarNumber()` utility function for consistent VAR number formatting
- Backfill script (`scripts/backfill-terminal-var-numbers.ts`) to fix existing terminals
- VAR number normalization in TDDF Step 6 processing, manual API, and CSV import

## [2.0.3] - 2026-01-10

### Fixed
- Fixed Hold feature failing in production due to missing `phase_updated_at` column
- Fixed orphan object cleanup showing "Files Already Removed" for objects already deleted from storage
- Fixed Neon database error handling causing "Cannot set property message" errors
- Orphan scan now verifies object existence in Replit Object Storage before marking as orphan

### Added
- "Copy Path" button in Log Dump UI for easier sharing of log paths with AI
- Auto-cleanup of stale database entries when objects no longer exist in storage

## [2.0.2] - 2026-01-10

### Fixed
- Fixed "Buffer is not defined" browser console warnings by adding early Buffer polyfill in index.html for @react-pdf/renderer compatibility
- Silenced non-critical "Error checking fallback status" console errors in FallbackStorageAlert component

### Removed
- Removed unused MMSMerchants.tsx.broken file from codebase

## [2.0.1] - 2026-01-09

### Fixed
- Fixed schema content API to serve correct version 2.0.1
- Established automatic schema content synchronization to database

### Changed
- Schema API now properly serves current file content
- Database-stored schema content matches current schema.ts file

## [2.0.0] - 2026-01-08

### Added
- Database-based schema version storage in schema_content table
- Formal Semantic Versioning policy (SCHEMA_VERSIONING_POLICY.md)
- Complete historical version reconstruction from backup data
- Production-ready MMS with comprehensive TDDF processing capabilities
- Attribution system for version tracking
- Schema version selector with complete history display
- New baseline for future schema evolution

### Changed
- Schema management from file-based to database-based storage
- Version tracking system completely restructured
- Production-ready architecture with environment separation

## [1.3.0] - 2025-12-15

### Added
- Complete TDDF field processing with 100+ fields
- Field position mappings for technical transparency
- Enhanced version history tracking system
- Schema file version documentation header
- Color-coded change categorization in UI

### Changed
- merchant_type field changed from INTEGER to TEXT
- Enhanced SchemaVersionInfo widget with diff capabilities
- Version comparison functionality added

## [1.2.0] - 2025-11-20

### Added
- Environment-specific storage paths
- Enhanced backup tracking
- Environment configuration system

### Changed
- Backup history table structure
- Changed fileSize field to size
- Changed tables field to JSONB format

## [1.1.0] - 2025-10-15

### Added
- otherClientNumber1 field to merchants table
- otherClientNumber2 field to merchants table
- clientSinceDate field to merchants table
- country field to merchants table
- editDate field to merchants table

## [1.0.0] - 2025-09-01

### Added
- Initial schema with merchants, transactions, uploaded_files, and backup_history tables
- clientMID field to merchants table
- Schema version tracking system
