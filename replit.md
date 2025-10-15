# Merchant Management System (MMS) - Compressed Architecture Guide

## Overview
The Merchant Management System (MMS) is a comprehensive web application for merchant relationship management, transaction processing, and business data analysis. It provides robust solutions for merchant management, transaction processing, file uploads, data analytics, and automated backup, designed for enterprise-scale operations to efficiently handle large datasets and deliver rapid responses.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone: CST (America/Chicago) - All dates and times should display in Central Time.
Critical System Requirement: "Never re-fresh" policy - all auto-refresh functionality permanently disabled and verified working.

## Test Credentials Management
Admin and test credentials are managed via the `Test_Creds` Replit Secret for security and consistency:

### Secret Format
The `Test_Creds` secret must be a JSON object:
```json
{
  "username": "admin",
  "password": "your_password_here"
}
```

### Implementation
- **Admin User Initialization**: On startup, `database-helpers.ts` reads `Test_Creds` to create/update the admin user with credentials from the secret
- **Test Endpoints**: Login test endpoints (`/api/auth/test-login`) use `Test_Creds` for default test credentials
- **Fallback**: If `Test_Creds` is missing or malformed, the system falls back to default credentials (username: `admin`, password: `admin123`)
- **Security**: Credentials are never hardcoded in source files - always stored securely in Replit Secrets

### Updating Credentials
1. Go to Replit Secrets panel
2. Update the `Test_Creds` secret with new JSON credentials
3. Restart the application to apply changes

## System Architecture
MMS employs a modern client-server architecture with a focus on performance, scalability, and maintainability.

### UI/UX Decisions
The UI/UX prioritizes a modern, professional, and intuitive experience using TailwindCSS and shadcn/ui. Key decisions include:
- **Consistent Design**: Utilizes shared components and a unified aesthetic for a cohesive user experience.
- **Responsive Layouts**: Ensures comprehensive mobile optimization and touch-friendly interfaces across all key pages.
- **Intuitive Interactions**: Incorporates features like interactive heat maps, comprehensive sorting, clear progress indicators, and color-coded status displays.
- **PDF Reporting System**: Generates monthly PDF reports for TDDF1 data with professional layouts and key metrics.
- **Dynamic Merchant Demographics**: Implements MCC schema-driven forms with flexible refresh options and paginated data display for TSYS Risk & Configuration Fields.

### Technical Implementations
- **Frontend**: React-based Single Page Application (SPA) with TypeScript.
- **Backend**: RESTful Express.js API.
- **Database**: PostgreSQL with Drizzle ORM.
- **Unified Cache System**: Features a universal "never expire" cache, month-by-month refresh, and persistent configuration to optimize query responses.
- **Dynamic Aggregation**: Implements intelligent performance tiers for large datasets with progressive loading indicators.
- **File Processing Pipeline**: A robust, automated 5-stage pipeline supporting large files (40MB+) and various formats (CSV, TSV, JSON, TDDF) with metadata capture and failed file recovery.
- **TDDF Processing Architecture**: Utilizes a switch-based system for efficient handling of various record types, ensuring comprehensive field extraction and transactional integrity.
- **Concurrency Control**: Employs database-level locking to prevent race conditions and enable multi-node deployments.
- **Environment Isolation**: Achieves separation between development and production environments at the table level within the same database instance using dynamic table naming.
- **Schema Versioning**: A database-based system tracks schema changes, ensures synchronization, and prevents deployment issues.
- **Hybrid Storage System**: Stores raw line data in object storage and structured data in the database for cost efficiency and fast queries.
- **Self-Repairing Cache System**: Automatically creates missing TDDF1 totals tables and handles cache rebuild failures.
- **Enhanced Auto 4-5 Retry System**: Implemented comprehensive retry logic and conflict handling for the Auto 4-5 processing pipeline.
- **Shared TDDF Resource Architecture**: Provides unified components and utilities for consistent data handling and reduced duplication.
- **TDDF Enhanced Metadata System**: Comprehensive filename parsing and metadata extraction for TDDF files, enriching JSONB table with metadata.
- **TDDF Records Pre-Cache by Year**: Comprehensive pre-cache system for TDDF record tabs with dedicated tables, "never expire" policy, and manual refresh controls.
- **Enhanced Batch Relations with G2 Records**: Supports comprehensive BH → DT → G2 relationship display, including geographic/location data.
- **Cross-Environment Storage Management**: Allows viewing and scanning files from both dev-uploader/ and prod-uploader/ storage locations via a dropdown interface.
- **Startup TDDF Cache Validation**: Automatic validation and creation of missing TDDF cache tables during application startup.
- **Production Self-Correcting Database**: Comprehensive production database health validation with automatic table creation and user provisioning.
- **Editable MCC Schema Configuration**: Redesigned MCC Schema table for full CRUD operations on TSYS merchant detail field configuration with a comprehensive UI.
- **TSYS Merchant Status System**: Comprehensive TSYS merchant status code mapping system with dual-field architecture for consistent UI display.
- **Modular Route Architecture**: Reorganized monolithic `routes.ts` into modular, maintainable route files for improved maintainability, faster navigation, and reduced merge conflicts.
- **TDDF Merchant Name Lookup**: Enhanced TDDF viewer with asynchronous merchant name lookup functionality across all view modes, including account number normalization.
- **Independent Step 6 Processing Interval**: Auto Step 6 now runs on its own 60-second interval (independent from Auto 4-5), queries database setting before each run, and automatically processes encoded TDDF files to completion when enabled.
- **TDDF JSONB Query Performance Optimization**: Implemented high-performance indexes on JSONB fields (merchantAccountNumber, batchDate) achieving 93% query speedup (980ms → 64ms) for merchant batch filtering. Uses text-based date comparisons to leverage indexes while maintaining ISO-8601 format compatibility.
- **Single-Day Batch View with Navigation**: Merchant Detail Batches tab now uses single-day date picker with Previous/Next navigation buttons (← →) instead of date range selector. Uses timezone-safe date parsing with `parseISO` and `addDays`/`subDays` from date-fns to prevent day-skipping across timezones. Backend supports `batch_date` parameter for exact-match filtering while maintaining backward compatibility with date range queries.
- **Duplicate File Upload Prevention**: Line-level deduplication system using SHA-256 hash of first 52 characters (sequence + record type + bank + merchant + association + group). Post-insert validation strategy with bulk insert followed by single cleanup query using MAX(id) to retain newest records and delete older duplicates. UI displays "validating" status phase (teal badge) during duplicate cleanup.
- **File Processing Status Messages**: Added `status_message` column to uploader_uploads table for user-friendly status messages during processing phases (e.g., "Validating & removing duplicates...", "Completed: X records, Y duplicates removed").
- **Enhanced DT Record Display in Raw Data View**: DT records in Raw tab Flat View now display formatted business information (merchant name, account number, transaction date, and amount) alongside badges, matching the BH record display pattern for improved readability and data visibility.
- **MCC/TDDF Transactions Tab with Enhanced UX**: Standalone Transactions page (`/transactions`) with dual-tab interface: ACH Transactions (existing ACH data with sorting, pagination, search) and MCC/TDDF tab displaying DT records from TDDF processing system. MCC/TDDF tab features: (1) Full pagination support (10/25/50/100 per page, default 10) with limit/offset parameters, (2) Click-to-expand row functionality showing detailed DT record view with chevron indicators, (3) Blue header card matching TDDF viewer design displaying merchant account, name, transaction date, and amount, (4) Dual-tab detail view with Fields tab (three-column grid of all DT fields) and Raw tab (dark background with green monospace text showing raw TDDF line data and character count), (5) Card type badges, merchant account/name lookup, and file metadata. Backend endpoint `/api/tddf-records/dt-latest` supports pagination with environment-aware table selection and merchant name resolution via `/api/merchants/lookup-map`.

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