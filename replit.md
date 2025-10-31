# Merchant Management System (MMS)

## Overview
The Merchant Management System (MMS) is a comprehensive web application designed for merchant relationship management, transaction processing, and business data analysis. It offers robust solutions for enterprise-scale operations, including merchant management, transaction processing, file uploads, data analytics, and automated backup, built to efficiently handle large datasets and provide rapid responses.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone: CST (America/Chicago) - All dates and times should display in Central Time.
Critical System Requirement: "Never re-fresh" policy - all auto-refresh functionality permanently disabled and verified working.

## System Architecture
MMS employs a modern client-server architecture focusing on performance, scalability, and maintainability.

### UI/UX Decisions
The UI/UX prioritizes a modern, professional, and intuitive experience using TailwindCSS and shadcn/ui. Key aspects include consistent design, responsive layouts, intuitive interactions (e.g., interactive heat maps, sorting, progress indicators, color-coded status), a PDF reporting system, and dynamic MCC schema-driven forms for TSYS Risk & Configuration Fields.

### Technical Implementations
- **Frontend**: React-based Single Page Application (SPA) with TypeScript.
- **Backend**: RESTful Express.js API.
- **Database**: PostgreSQL with Drizzle ORM.
- **Data Management**: Unified "never expire" cache, dynamic aggregation with performance tiers, and a hybrid storage system (object storage for raw data, database for structured data).
- **File Processing**: Robust, automated 5-stage pipeline for large files (CSV, TSV, JSON, TDDF) with metadata capture and failed file recovery. TDDF processing uses a switch-based system for record types.
- **Concurrency & Isolation**: Database-level locking for race condition prevention, environment isolation at the table level using dynamic naming, and a database-based schema versioning system.
- **Self-Healing & Optimization**: Self-repairing cache system, TDDF1 hybrid pre-cache architecture for dashboard performance, and enhanced auto-retry systems.
- **TDDF Specifics**: Shared TDDF resource architecture, enhanced metadata system, comprehensive pre-cache for record tabs, and improved BH → DT → G2 relationship display.
- **Operational Features**: Cross-environment storage management, startup TDDF cache validation, production self-correcting database, and editable MCC schema configuration.
- **Modular Design**: Modular route architecture for maintainability.
- **Performance & UX Enhancements**: TDDF JSONB query performance optimization via indexing, single-day batch view with navigation, duplicate file upload prevention with line-level deduplication, enhanced file processing status messages, improved DT record display, and an MCC/TDDF Transactions tab with comprehensive filtering, pagination, and detailed views.
- **Archiving**: Flag-based TDDF archive system allowing seamless restoration without data migration, with comprehensive sorting and pagination.
- **TDDF1 Migration**: TDDF1 dashboard migrated to a unified master table architecture for cleaner data management and optimal performance.
- **TDDF1 Dashboard Bug Fixes (Oct 2025)**: Fixed critical frontend-backend field name mismatches causing $0.00M display issues. Frontend now correctly uses `totalTransactionValue` (for authorizations) and `netDeposits` (for deposits) matching backend API responses. Updated 3 display locations: Authorizations card, bubble chart, and DT record totals. DT records correctly measured by transactionDate field, BH records by batchDate.
- **TDDF1 Table View Tab**: Added comprehensive table view tab to TDDF1 dashboard providing single-day record type breakdown and file details. Displays record types (BH, DT, G2, E1, P1, P2, DR, AD) with count, percentage of total, transaction amounts (for DT records), net deposits (for BH records), and descriptions. Table features color-coded badges for each record type, monospaced fonts for numbers, hover effects, and a summary row showing totals and file count. Below the record type table, displays detailed file information for all files processed on the selected date, including filename, upload time, file size, total records, record type counts per file, and transaction amounts. Each file card shows a breakdown of record types with color-coded badges. Backend endpoint `/api/tddf1/files-by-date` queries the master table joined with uploader metadata to provide comprehensive file details.
- **Terminal Activity Heat Map (Oct 2025)**: Compact monthly calendar heat map showing transaction activity in GitHub-style format. Displays only current month days (1-31) with empty grid spaces for previous/next month dates, ensuring clean month-only view. Features: day numbers visible inside colored squares, gradient color thresholds (gray=0, green=1-10, blue=11-20, purple=21+), h-8 cells with aspect-square ratio, mobile-responsive 7-column grid (Sun-Sat), interactive tooltips showing transaction counts, and date selection for drill-down views. Backend API endpoint `/api/tddf/activity-heatmap` accepts terminal_id, year, and month parameters for efficient data retrieval. Terminal detail pages load all transactions (no LIMIT) to ensure complete date coverage for filtering.
- **Terminals Page Sorting (Oct 2025)**: Added comprehensive sorting functionality to VAR Number column on the Terminals page. Smart numeric sorting extracts the numeric part from VAR format (e.g., V8171266 → 8171266) for proper ordering. Features three-state sorting (descending → ascending → clear), clickable column headers with visual indicators (arrow icons), and hover effects. Complements existing sorting for Term Number, Last Activity, and Last Update columns.
- **Merchant-TDDF Terminal Integration (Oct 2025)**: Added TDDF terminals display on merchant detail pages. New endpoint `/api/tddf1/merchant-terminals` queries TDDF transaction data directly to show terminals with transaction activity for any merchant on a selected date. Features: handles merchant ID variants (with/without leading "0"), queries TDDF DT records grouped by Terminal ID, enriches with terminal info from dev_api_terminals if available, displays transaction counts, amounts, card types, and MCC codes in a filterable table. Merchant detail Terminals tab now includes dedicated "TDDF Terminals with Transactions" section above manual terminal relationships, with date picker for viewing terminals on any date. Enhanced `/api/merchants/:id` endpoint to include TDDF transaction statistics in analytics.monthlyStats (last 30 days) when terminals exist.
- **TDDF1 Display Precision & File Counting (Oct 31, 2025)**: Enhanced currency formatting to display 2 decimal places consistently (e.g., $1.11M, $12.10M) across all compact currency values for improved precision. Updated TDDF1 day-breakdown API endpoint to filter files by filename business date (extracting MMDDYYYY from 4th underscore-separated segment) instead of filtering by batch/transaction dates in records. This prevents duplicate file counting and ensures both cache-hit and cache-miss paths consistently identify files belonging to a specific business date, maintaining data integrity and accurate file counts in the dashboard.
- **Soft-Delete with Audit Trails (Oct 31, 2025)**: Implemented comprehensive soft-delete functionality for TDDF file uploads with persistent audit logging. Files marked for deletion remain in database as stub records with upload_status='deleted', deleted_at timestamp, and deleted_by username. Deleted files are automatically filtered from normal views while preserving all data for potential recovery. Audit logs table (dev_audit_logs) captures deletion events with complete file metadata (filename, size, record counts) that persist even after eventual purge operations. Deletion endpoint provides detailed console logging showing user, timestamp, and full file details for each deleted file. This enables safe file management with complete audit trails and recovery capabilities.
- **Production Deployment Package (Oct 31, 2025)**: Created comprehensive production deployment documentation covering 27 days of development changes. Package includes: (1) Executive summary with risk assessment and deployment steps (PRODUCTION_DEPLOYMENT_PACKAGE_OCT2025.md), (2) Complete migration SQL script with pre-flight checks and verification queries (production-migration-oct2025.sql), (3) Safe rollback procedures (production-rollback-oct2025.sql), (4) Post-deployment validation queries (production-verification-oct2025.sql), (5) Step-by-step deployment checklist with monitoring protocols (DEPLOYMENT_CHECKLIST_OCT2025.md), (6) Complete schema inventory of all 49 tables with change analysis (SCHEMA_COMPARISON_DEV_PROD.md). Schema changes include: added deleted_at and deleted_by columns to uploader_uploads table, added file_metadata JSONB column to audit_logs table, created performance indexes (audit_logs_action_idx, uploader_uploads_deleted_at_idx). All changes are backward compatible with zero data loss risk. Migration includes database cleanup of 12 orphaned tables archived with del_ prefix.

## External Dependencies

- **Database**: PostgreSQL (via @neondatabase/serverless)
- **ORM**: drizzle-orm
- **Web Framework**: express
- **Frontend Library**: react
- **State Management**: @tanstack/react-query
- **Authentication**: passport
- **UI Components**: @radix-ui/ (shadcn/ui), tailwindcss, lucide-react
- **Routing**: wouter
- **File Uploads**: multer
- **CSV Processing**: csv-parse, fast-csv
- **Cloud Storage**: @aws-sdk/client-s3
- **Scheduling**: node-schedule