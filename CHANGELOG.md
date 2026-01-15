# Changelog

All notable changes to MDAS (Merchant Datawarehouse and Automation System) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.7] - 2026-01-15

### Added
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
