# Merchant Datawarehouse and Automation System (MDAS)

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