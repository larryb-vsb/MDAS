# Merchant Datawarehouse and Automation System (MDAS)

## E2E Testing / Playwright Authentication

**IMPORTANT FOR TESTING AGENT**: This app requires login before accessing protected pages.

### Login Credentials
- **Secret Name**: `Test_Creds` (stored in Replit Secrets)
- **Format**: `{"username":"radmin","password":"MDAS123"}`
- **Username**: `radmin`
- **Password**: `MDAS123`

### Login Flow for E2E Tests
1. Navigate to `/auth` (or any protected route will redirect here)
2. Enter username `radmin` in the Username field
3. Enter password `MDAS123` in the Password field  
4. Click the "Login" button
5. Wait for redirect to dashboard (`/` or `/tddf1-monthly`)
6. Proceed with testing protected pages (e.g., `/settings`)

### Protected Routes
All routes except `/auth` require authentication. The testing agent must complete the login flow above before testing any features.

---

## Overview

The Merchant Datawarehouse and Automation System (MDAS) is a comprehensive merchant data warehouse for Vermont State Bank. Its primary purpose is to integrate mainframe data processing, merchant management, and financial reporting. Key capabilities include processing TSYS mainframe TDDF files, ensuring merchant ACH deposit compliance, providing API integrations, and delivering real-time analytics. The business vision is to provide a robust, automated solution for financial data management, enhancing efficiency and compliance.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions

The frontend is built with React and TypeScript, utilizing Radix UI primitives and Tailwind CSS (shadcn/ui design system) for a consistent and modern user experience. It features real-time data visualization based on pre-aggregated backend data, performance-optimized rendering, and manual refresh controls with cooldowns.

### Technical Implementations

- **Frontend**: React with TypeScript (Vite), React hooks and context for state management, WebSockets for real-time updates.
- **Backend**: Node.js with Express.js (TypeScript/ESModules), Drizzle ORM for type-safe database operations.
- **File Processing Pipeline**: A multi-phase system (Upload, Validation, Parsing, Processing, Aggregation/Caching) with automatic status tracking, dual environment support (`dev_*` tables), a watcher service for autonomous processing, and database-level concurrency control for automatic recovery.
- **Data Storage**: PostgreSQL (Neon serverless) as the primary database, Replit Object Storage for file persistence. A hybrid strategy stores raw file lines in object storage, processed records in PostgreSQL, and pre-aggregated summary tables for dashboards. Dashboard cache tables are updated by watcher services.
- **Authentication**: Express-session with PostgreSQL session store, API key-based authentication for external integrations, and multi-factor authentication via Duo Security and Azure MSAL.
- **Schema Management**: SchemaWatch Auto-Tracking System uses PostgreSQL event triggers and materialized views for automatic detection and logging of database schema changes in development.

### Feature Specifications

- Real-time processing statistics and file management.
- Comprehensive merchant data querying and transaction reporting.
- Advanced field-based search for DT records within raw TDDF data using PostgreSQL `SUBSTRING` for precise field extraction.
- Automated orphan healing service to detect and reset files stuck in intermediate processing states (validating>10m, encoding>10m, processing>15m, validation-timeout>10m).
- Robust concurrency support for Step 6 processing with retry logic and pool health monitoring.
- Step 6 validation phase includes 5-minute query timeout to prevent infinite hangs on duplicate cleanup.
- Performance-optimized connection monitoring with 7-day rolling window filter.

### Recent Changes (January 2026)

**Version 2.0.8 (2026-01-22)**
- Added "Processing" tab to History page for TSYS reconciliation
- New `/api/tddf/daily-processing/:date` endpoint queries transactions by actual transaction date (from `extracted_fields->>'transactionDate'`) instead of file processing date
- Resolves confusion where MDAS appeared to have duplicates when comparing with TSYS daily summaries
- Processing tab shows Daily Summary (Total Authorizations/Capture with counts and amounts) and BIN Summary
- Renamed "Daily Overview" tab to "Files Processed" for clarity
- Tab layout updated from 3 columns to 4 columns

**Version 2.0.7 (2026-01-15)**
- Enhanced AH0314P1 merchant name fuzzy matching with PostgreSQL pg_trgm similarity function
- Uses 80% similarity threshold to catch near-duplicates (e.g., "TOROVERDE II INC" vs "TOROVERDE INC")
- Case-insensitive matching prevents duplicates like "METRO 1996 LLC" vs "Metro 1996 LLC"
- Normalizes names by removing business suffixes (LLC, INC, CORP, LTD, COMPANY, etc.) before comparison
- Returns highest similarity match when multiple candidates exist
- Added restore buttons to file search results for both Active Uploads and Archived Files sections

**Version 2.0.6 (2026-01-15)**
- Enhanced filename parsing to support ACH0314P1 files (YYYYMMDD date format)
- Added `parseAchFilename()` and `extractBusinessDayFromFilename()` utilities for dual format support
- Archive tab UI redesigned to match Processed tab with card-based layout
- Added file type filter dropdown to Archive tab (TDDF, ACH Transactions, ACH Merchant, MasterCard DI)
- Archive cards now show file size, file type, line count, and business day in subtitle row
- Added GitHub-style 12-month activity heatmap showing daily archive activity
- New `/api/tddf-archive/activity-heatmap` endpoint for aggregated daily file counts

**Version 2.0.5 (2026-01-14)**
- Implemented Merchant Alias System to prevent duplicate merchant creation
- New `dev_merchant_aliases` table tracks alternate names, MIDs, and IDs for merged merchants
- Merge operation now auto-creates aliases for source merchant's name, ID, and MID
- ACH import checks alias table before fuzzy matching - prevents recreating merged merchants
- MerchDem/MCC import checks ID aliases before creating new merchants
- Added storage methods: createMerchantAlias, getMerchantAliases, findMerchantByAlias, findMerchantByNameFuzzy, deleteMerchantAlias

**Version 2.0.4 (2026-01-12)**
- Fixed inconsistent terminal VAR number formats across all creation paths
- Terminal IDs now normalized to canonical VXXXXXXX format (e.g., 78912073 → V8912073)
- Added `normalizeVarNumber()` utility for consistent VAR number formatting
- Added backfill script to fix 401 existing terminals with non-standard formats

**Version 2.0.3 (2026-01-10)**
- Fixed Hold feature failing in production (missing phase_updated_at column)
- Fixed orphan cleanup showing "Files Already Removed" by verifying object existence in storage
- Fixed Neon error handling causing "Cannot set property message" errors
- Added "Copy Path" button in Log Dump UI for AI analysis

**Version 2.0.2 (2026-01-10)**
- Fixed "Buffer is not defined" browser console warnings by adding early Buffer polyfill for PDF export compatibility
- Silenced non-critical fallback status console errors
- Removed unused backup files from codebase
- Added CHANGELOG.md for version tracking

**Version 2.0.1 (2026-01-09)**
- Fixed schema content API to serve correct version
- Established automatic schema content synchronization

**Earlier Changes:**
- **Transaction ID Race Condition Fix**: Implemented date-prefixed transaction IDs (YYYYMMDD_TraceNbr format) to prevent duplicate key conflicts when multiple files with same trace numbers are processed concurrently. Three-tier date priority: (1) Row-level Date column, (2) Filename extraction via sourceFileId lookup, (3) Processing date fallback. Includes file-level business date caching for performance.
- Fixed Step 6 validation phase hanging on large files by adding 5-minute query timeout
- Enhanced orphan healing service to recover files stuck in validation timeout (mark as completed since data is already inserted)
- Reduced encoding stuck threshold from 30 to 10 minutes for faster recovery
- Optimized /api/tddf-api/monitoring/hosts endpoint with 7-day date filter to prevent full table scans

## Production Schema Sync Guide

### Recommended Workflow for Schema Changes

1. **Run sanity check first**: `npx tsx scripts/analysis/schema-sanity-check.ts`
   - Generates comprehensive dev vs prod comparison
   - Creates reports in `scripts/analysis/schema-sanity-report.{json,md}`
   - Updates `scripts/schema-compat-map.ts` with detected mappings

2. **Review differences**: Check `scripts/analysis/schema-sanity-report.md`
   - Shows column differences, type mismatches, missing columns
   - Identifies dev-only and prod-only tables/columns

3. **Update production schema**: Edit `sql/production-schema.sql`
   - Use production column names (see compatibility map below)
   - Add new tables/columns using production naming conventions

4. **Deploy to production**: `bash scripts/run-production-schema.sh`
   - Runs in transaction (ROLLBACK on any error)
   - Records sync event in `schema_versions` table

### Key Scripts

| Script | Purpose |
|--------|---------|
| `scripts/analysis/schema-sanity-check.ts` | **Primary tool** - Full dev vs prod comparison |
| `scripts/schema-compat-map.ts` | Column name mappings (dev → prod) |
| `scripts/run-production-schema.sh` | Execute SQL against production |
| `sql/production-schema.sql` | Production schema SQL (manually maintained) |
| `scripts/sync-production-with-dev.ts` | Legacy - finds missing columns only |
| `scripts/generate-production-schema.ts` | **OUTDATED** - uses dev column names |

### Column Name Compatibility Map

Production tables evolved with different column names. The canonical mapping is in `scripts/schema-compat-map.ts`:

| Table | Dev Column | Production Column |
|-------|-----------|-------------------|
| `uploader_uploads` | `upload_datetime` | `uploaded_at` |
| `uploader_uploads` | `pipeline_status` | `status` |
| `connection_log` | `ip_address` | `client_ip` |
| `uploaded_files` | `upload_id` | `source_file_id` |
| `uploaded_files` | `upload_date` | `uploaded_at` |
| `tddf_records_all_pre_cache` | `year`, `cache_key` | `upload_id`, `record_type` |
| `tddf_records_dt_pre_cache` | `year`, `cache_key` | `upload_id`, `merchant_account` |

### Troubleshooting Index Errors

If you see `ERROR: column "X" does not exist` during schema sync:
1. Check which table the index references
2. Query production: `SELECT column_name FROM information_schema.columns WHERE table_name = 'TABLE_NAME';`
3. Update the index in `sql/production-schema.sql` to use the correct production column name
4. Add the mapping to `scripts/schema-compat-map.ts` for future reference

### Environment Variables
- `NEON_PROD_DATABASE_URL` - Production database connection string (required for sync)
- `DATABASE_URL` - Development database connection string

## External Dependencies

### Third-Party Services

- **Database**: Neon PostgreSQL serverless.
- **Object Storage**: Replit Object Storage, AWS S3, Google Cloud Storage.
- **Authentication Providers**: Duo Security, Azure MSAL.

### APIs and Integrations

- **TDDF API**: External API for automated file uploads.
- **Payment Processing**: TSYS merchant processing system.
- **File Format Support**: TDDF, TSYSO, CSV/TSV, Excel files.