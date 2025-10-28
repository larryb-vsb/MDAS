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