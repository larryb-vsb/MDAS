# Merchant Management System (MMS)

## Overview
The Merchant Management System (MMS) is a comprehensive web application for enterprise-scale merchant relationship management, transaction processing, and business data analysis. It provides robust solutions for handling large datasets, including merchant management, transaction processing, file uploads, data analytics, and automated backup, with a focus on rapid responses. The system aims to deliver a robust, scalable, and user-friendly platform for efficient business operations.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone: CST (America/Chicago) - All dates and times should display in Central Time.
Critical System Requirement: "Never re-fresh" policy - all auto-refresh functionality permanently disabled and verified working.

## System Architecture
MMS employs a modern client-server architecture prioritizing performance, scalability, and maintainability.

### UI/UX Decisions
The UI/UX emphasizes a modern, professional, and intuitive experience using TailwindCSS and shadcn/ui. This includes consistent design, responsive layouts, intuitive interactions (e.g., interactive heat maps, sorting, progress indicators, color-coded status), a PDF reporting system, dynamic MCC schema-driven forms for TSYS Risk & Configuration Fields, and consolidated automation controls. Enhanced TDDF1 monthly view includes clickable rows navigating to daily dashboards and dedicated duplicate file cleanup per date.

### Technical Implementations
- **Frontend**: React-based Single Page Application (SPA) with TypeScript.
- **Backend**: RESTful Express.js API.
- **Database**: PostgreSQL with Drizzle ORM, utilizing database-level locking for concurrency.
- **Data Management**: Unified "never expire" cache, dynamic aggregation with performance tiers, and hybrid storage (object storage for raw data, database for structured data). Includes self-repairing cache and TDDF1 hybrid pre-cache architecture for dashboard performance.
- **File Processing**: Robust, automated 5-stage pipeline for large files (CSV, TSV, JSON, TDDF) with metadata capture, failed file recovery, TDDF-specific switch-based processing, and duplicate file upload prevention with line-level deduplication. Soft-delete is implemented for TDDF file uploads with persistent audit logging. Step 6 processing includes retry limits (MAX_STEP6_RETRIES=3) and timeout protection (5-minute timeout) to prevent infinite retry loops and memory exhaustion.
- **TDDF Specifics**: Shared TDDF resource architecture, enhanced metadata system, comprehensive pre-cache for record tabs, improved BH → DT → G2 relationship display, and flag-based archiving with seamless restoration. TDDF JSONB query performance is optimized via expression indexes and quarterly table partitioning.
- **Quarterly Table Partitioning**: The `tddf_jsonb` master table uses PostgreSQL quarterly range partitioning on `tddf_processing_date` to optimize query performance for multi-year datasets. Each quarter is a separate partition (e.g., 2024-Q1, 2024-Q2), enabling partition pruning where queries scan only relevant quarters instead of the entire table. Auto-creation functions (`create_quarterly_partition`, `ensure_future_partitions`) automatically create future partitions. The table uses a composite primary key `(id, tddf_processing_date)` required for partitioning, with an additional `id`-only index for cross-partition queries. Combined with expression indexes on JSONB fields, this delivers 2000x query performance improvements (monthly dashboard queries: ~70ms vs 2-3 minutes).
- **Operational Features**: Cross-environment storage management, startup TDDF cache validation, production self-correcting database, editable MCC schema configuration, and enhanced auto-retry systems.
- **Error Recovery & Admin Tools**: Multi-phase error recovery system with atomic transaction-based `/api/uploader/reset-errors` endpoint for resetting files from error phase to encoded. Enhanced `/api/admin/reset-stuck-step6-files` endpoint supports multiple phases (validating, identified, processing, error) with phase-specific reset logic (validating/identified → uploaded, processing/error → encoded). Warning telemetry only incremented for processing/error resets, not normal flow retries. All reset operations use database transactions with FOR UPDATE locks and race condition detection. Enhanced status filtering UI includes all processing phases (validating, processing, error) with unlimited pagination support (50, 100, 200 items per page).
- **User Authentication**: Microsoft Azure AD OAuth with optional Duo two-factor authentication, alongside existing username/password authentication.
- **Data Precision**: Enhanced currency formatting to consistently display two decimal places.
- **Terminal Management**: Efficient UPSERT logic for terminal imports with unique constraints and automatic timestamp updates. TDDF Step 6 processing creates/updates terminals from DT records (positions 277-284) with full audit trail tracking including `update_source` (format: "TDDF: filename Line: 12345"), `created_by`/`updated_by` (format: "STEP6:upload_id"), and automatic timestamps. Terminal IDs starting with '7' or '0' are converted to V-number format (e.g., 75679867 → V5679867) for v_number storage while preserving original format in terminal_id field.
- **Analytics**: Comprehensive daily merchant breakdown dashboard with full record type details, optimized with multiple performance indexes. Includes a compact monthly calendar heat map for terminal activity. Standardized `mcc` property usage across backend and frontend for accurate reporting. Merchant list now displays pre-cached "Last Batch" (filename and date) and "Last Transaction" (amount and date) instead of aggregated daily/monthly statistics for improved performance.
- **Processing Page**: Real-time TDDF processing monitoring dashboard with modern JSONB-backed endpoints. Four API endpoints query dev_uploaded_files and dev_tddf_jsonb directly: real-time-stats (file counts + record breakdown from last hour), performance-kpis (records per minute from last 10 minutes with DT/BH/P1/P2 breakdown), queue-status (currently processing files), and performance-chart-history (historical minute-by-minute data with 1440-point limit). Critical created_at index on dev_tddf_jsonb ensures sub-second response times. RecordsPerMinuteChart displays stacked bar visualization of record types processed per minute.
- **Batch Uploaders**: PowerShell and Python-based batch file uploaders with API key authentication, automatic chunking for large files, queue status monitoring, and retry logic.
- **API Key Usage Tracking**: Comprehensive monitoring system tracking `last_used` timestamp, `last_used_ip`, and `request_count` for all API key authenticated requests.
- **Connection Logging & IP Blocking**: Global middleware logs all API requests to a `dev_connection_log` table. An IP blocking system (`dev_ip_blocklist` table) allows administrators to block malicious IPs.
- **Host Approval System**: Security-enhanced upload access control based on hostname + API key combinations, requiring administrator approval for new hosts.
- **Dynamic Verbose Logging API**: Runtime-controllable logging system with API endpoints to adjust verbosity for authentication, navigation, uploader, charts, TDDF processing, and database modules.
- **Database Health Monitoring**: Production-ready database health check system with API endpoints for latency tests, full health checks (connection, tables, indexes, orphaned records, stuck files, cache integrity), and schema validation.
- **Storage Management System**: Comprehensive object storage management and cleanup system with a master object keys database. Provides API endpoints for storage statistics, object listing, duplicate detection, orphaned object scanning, purging, and manual deletion. Includes a frontend for managing storage.

## External Dependencies
- **Database**: PostgreSQL (via @neondatabase/serverless)
- **ORM**: drizzle-orm
- **Web Framework**: express
- **Frontend Library**: react
- **State Management**: @tanstack/react-query
- **Authentication**: passport, @azure/msal-node, @duosecurity/duo_universal
- **UI Components**: @radix-ui/, tailwindcss, lucide-react
- **Routing**: wouter
- **File Uploads**: multer
- **CSV Processing**: csv-parse, fast-csv
- **Cloud Storage**: @aws-sdk/client-s3
- **Scheduling**: node-schedule