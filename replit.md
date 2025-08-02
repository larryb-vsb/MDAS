# Merchant Management System (MMS) - Architecture Guide

## Overview
The Merchant Management System (MMS) is a comprehensive web application designed to manage merchant relationships, process transactions, and analyze business data. It provides capabilities for merchant management, transaction processing, file uploads, data analytics, and automated backup management. The system is built for enterprise-scale operations, handling large datasets efficiently and transforming long-running queries into millisecond responses through advanced caching mechanisms.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone: CST (America/Chicago) - All dates and times should display in Central Time.
Critical System Requirement: "Never re-fresh" policy - all auto-refresh functionality permanently disabled and verified working.

## Known Critical Issues
**Sidebar Menu Disappearing Bug (RESOLVED 2025-08-02)**: Fixed critical navigation issue affecting both mobile and desktop sidebar menus. Root cause was missing onClick handlers in desktop navigation and Radix Dialog auto-close behavior in mobile navigation. Solution implemented comprehensive click handling for both mobile Sheet navigation and desktop sidebar navigation with proper event management to prevent unwanted automatic closure. Both mobile and desktop navigation now work correctly with proper debugging and state management.

**TDDF1 System Implementation (COMPLETED 2025-08-02)**: Successfully implemented comprehensive TDDF1 file-based encoding system with dynamic table creation, pre-cache totals management, and enhanced row-by-row transaction validation. **TDDF Merchant Account Number Validation Fixed (2025-08-02)**: Resolved critical validation bug where system checked 'merchantId' but extracted 'merchantAccountNumber' from TDDF positions 24-39. Fixed Settings TDDF clear function to properly detect and drop TDDF1 tables. **Lightning-Fast Performance Optimization (2025-08-02)**: Restored yesterday's instant 10k processing performance by increasing batch size from 500 to 2,000 records and implementing bulk INSERT statements instead of individual row inserts. Added automatic status update to "encoded" when processing completes. **Enhanced UI with Refresh Controls (2025-08-02)**: Added refresh buttons to Daily Breakdown and Recent Activity widgets to handle real-time updates when multiple files are processed for the same date. Implemented consistent color-coded record type display (BH=Blue, DT=Green, G2=Purple, E1=Orange, P1=Cyan, P2=Pink, DR=Red, AD=Indigo) with fixed ordering across all widgets. Features include:
- Dynamic table creation using `dev_tddf1_filename` pattern for each uploaded file
- Pre-cache totals table (`dev_tddf1_totals`) for optimized dashboard performance  
- File processing API endpoint that parses TDDF records and extracts transaction data
- Totals cache management widget with manual rebuild functionality
- Enhanced navigation with back button and simplified day navigation
- Environment-aware table prefixes (dev_/prod_) for proper isolation
- **Comprehensive Row-by-Row Validation**: Enhanced encoding process validates each transaction row during file processing with field-level validation, record type validation, transaction amount validation, date format validation, merchant ID validation, and comprehensive logging of validation results
- **Complete System Migration (2025-08-02)**: Successfully migrated all file encoding processes from old TDDF JSONB system to TDDF1 file-based system. Updated MMS Watcher automatic processing, manual encoding endpoints, individual encode buttons, storage processing endpoints, and bulk processing to exclusively use `encodeTddfToTddf1FileBased` function. This ensures all new files are processed using the file-based table structure with proper universal timestamping and enhanced transaction validation.
- **Manual Queue Integration (2025-08-02)**: Updated individual "Encode" buttons and bulk encoding to use the manual queue system instead of direct processing. When users press "Encode" on individual files or trigger bulk encoding, files are now added to the manual45Queue and processed by MMS Watcher within 15 seconds, ensuring consistent TDDF1 processing flow and integration with the automated monitoring system.

**Production TDDF Processing Fixed (2025-08-01)**: Resolved critical production database schema issue where TDDF files failed encoding with "error" phase. Missing production tables (tddf_records_json, tddf_transactions, tddf_purchasing_cards, tddf_purchasing_cards_2) were created from development templates. File phase reset and type classification fixes implemented. Production TDDF processing now matches development environment capabilities.

**Year Navigation & Data Existence Optimization (2025-08-01)**: Successfully implemented year navigation functionality in TDDF JSON Activity Heat Map with comprehensive data existence validation. Fixed React Query configuration to properly refetch data when year changes while maintaining strict "never refresh" policy. Added pre-cache data existence checks to prevent building empty cache tables - system now validates data availability before starting cache rebuild operations, avoiding unnecessary cache creation for years with no data.

## System Architecture

MMS employs a modern client-server architecture with clear separation between frontend and backend components.

### High-Level Architecture
- **Frontend**: React-based Single Page Application (SPA) with TypeScript.
- **Backend**: RESTful Express.js API handling business logic and data processing.
- **Database**: PostgreSQL, managed with Drizzle ORM for type-safe operations.

### Key Architectural Decisions & Design Patterns
- **Unified Cache System**: Features a universal "never expire" cache, month-by-month cache refresh, and persistent cache configuration managed via a dedicated database system. This transforms 50-second queries into millisecond responses.
- **Dynamic Aggregation**: Implements intelligent performance tiers (daily/weekly/monthly/quarterly) for large datasets (5-10M records) with progressive loading indicators.
- **File Processing Pipeline**: A robust, automated 5-stage pipeline (Started → Uploading → Uploaded → Identified → Encoding → Encoded) supports large files (40MB+) and various formats (CSV, TSV, JSON, TDDF). It includes comprehensive metadata capture, multi-stream JSON uploads, and a failed file recovery system.
- **TDDF Processing Architecture**: Utilizes a switch-based processing system for different record types (DT, BH, P1, P2, E1, G2, AD, DR, CK, LG, GE), ensuring efficient handling and easy extensibility. It includes comprehensive field extraction based on TDDF specifications and strong transactional integrity.
- **Concurrency Control**: Implements database-level locking for atomic file claiming, preventing race conditions and enabling multi-node deployments with unique server identification and stale lock cleanup.
- **Environment Isolation**: Achieves robust separation between development (dev_ prefix) and production environments at the table level within the same database instance, using dynamic table naming.
- **Schema Versioning**: A comprehensive, database-based schema management system tracks changes, ensures synchronization between environments, and prevents deployment-blocking schema mismatches.
- **UI/UX Decisions**:
    - **Consistent Design**: Utilizes TailwindCSS and shadcn/ui for a modern, professional appearance with consistent styling across all components.
    - **Responsive Layouts**: Features comprehensive mobile optimization for all key pages (Dashboard, TDDF screens, Login), ensuring touch-friendly and adaptive interfaces across various screen sizes.
    - **Intuitive Interactions**: Implements features like interactive heat maps, comprehensive sorting, clear progress indicators, and color-coded status displays for enhanced user experience.
    - **Standardized Elements**: Employs shared components (e.g., Cache Control Widget, Heat Map Component Library) for consistent functionality and appearance across the application.

### Core Technical Implementations
- **Frontend**: React, Wouter for routing, React Query for server state, React Hook Form with Zod for forms.
- **Backend**: Express.js, Drizzle ORM, Multer for file uploads, Passport.js for authentication.
- **Database Schema**: Includes tables for Merchants, Transactions, Users, Uploaded Files, Backup Management, Audit Logging, and Schema Versioning.
- **Tab-Specific Pre-Cache System**: Each TDDF JSON page tab (Statistics, Activity Heat Map, Batch Relationships, Other Records) now has dedicated pre-cache tables optimized for their unique data patterns and query requirements, eliminating expensive real-time aggregations and JOINs.
- **TDDF Records Pre-Cache by Year**: Comprehensive pre-cache system for TDDF record tabs by year with dedicated tables for All Records, DT-Transactions, BH-Batch Headers, Batch Relationships, P1-Purchasing, P2-Purchasing 2, and Other Types. Features "never expire" policy, manual refresh controls, processing status tracking, and enhanced loading dialogs similar to heat map implementation.
- **Enhanced Batch Relations with G2 Records**: Complete BH → DT → G2 relationship support showing comprehensive batch relationships including geographic/location data from G2 records. Features merchant location information, category codes, and enhanced validation badges for relationship compliance.
- **TDDF Specification Documentation**: Complete official TDDF specification extracted and organized in `tddf_documentation/` directory with reference guide (`TDDF_SPECIFICATION_REFERENCE.md`) covering all record types, relationships, and field mappings based on 2025-06-10 specification version.
- **Cross-Environment Storage Management**: Complete implementation allowing users to view and scan files from both dev-uploader/ and prod-uploader/ storage locations via dropdown selection interface. Features real-time count updates, environment-aware orphan scanning, and proper logging separation ensuring no environment confusion during operations.
- **Startup TDDF Cache Validation**: Automatic validation and creation of missing TDDF cache tables during application startup (`server/startup-cache-validation.ts`). Ensures all 12 required cache tables exist in current environment, preventing production TDDF screen loading failures. Runs during database migration process and creates missing tables by copying structure from development environment.
- **Production Self-Correcting Database**: Comprehensive production database health validation with automatic table creation and user provisioning (`ensureProductionDatabaseHealth`). Automatically fixes missing critical tables (users, merchants, transactions, uploaded_files, dashboard_cache, duplicate_finder_cache, charts_pre_cache) by copying structure from dev environment. Ensures admin user exists and prevents production dashboard failures. Integrated into startup migration process for automatic correction on every deployment.

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
- **Cloud Storage**: @aws-sdk/client-s3 (for backups)
- **Scheduling**: node-schedule