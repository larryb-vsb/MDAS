# Merchant Management System (MMS) - Compressed Architecture Guide

## Overview
The Merchant Management System (MMS) is a comprehensive web application for merchant relationship management, transaction processing, and business data analysis. It supports merchant management, transaction processing, file uploads, data analytics, and automated backup. MMS is designed for enterprise-scale operations, handling large datasets efficiently and transforming long-running queries into millisecond responses through advanced caching, aiming to provide a robust solution for large-scale financial data management.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone: CST (America/Chicago) - All dates and times should display in Central Time.
Critical System Requirement: "Never re-fresh" policy - all auto-refresh functionality permanently disabled and verified working.

## System Architecture
MMS employs a modern client-server architecture.

### High-Level Architecture
- **Frontend**: React-based Single Page Application (SPA) with TypeScript.
- **Backend**: RESTful Express.js API handling business logic and data processing.
- **Database**: PostgreSQL, managed with Drizzle ORM for type-safe operations.

### Key Architectural Decisions & Design Patterns
- **Unified Cache System**: Features a universal "never expire" cache, month-by-month cache refresh, and persistent cache configuration via a dedicated database system, transforming 50-second queries into millisecond responses.
- **Dynamic Aggregation**: Implements intelligent performance tiers (daily/weekly/monthly/quarterly) for large datasets (5-10M records) with progressive loading indicators.
- **File Processing Pipeline**: A robust, automated 5-stage pipeline (Started → Uploading → Uploaded → Identified → Encoding → Encoded) supporting large files (40MB+) and various formats (CSV, TSV, JSON, TDDF). It includes metadata capture, multi-stream JSON uploads, and failed file recovery.
- **TDDF Processing Architecture**: Utilizes a switch-based processing system for various record types, ensuring efficient handling and extensibility, comprehensive field extraction based on TDDF specifications, and strong transactional integrity.
- **Concurrency Control**: Implements database-level locking for atomic file claiming, preventing race conditions and enabling multi-node deployments with unique server identification and stale lock cleanup.
- **Environment Isolation**: Achieves robust separation between development (dev_ prefix) and production environments at the table level within the same database instance, using dynamic table naming.
- **Schema Versioning**: A comprehensive, database-based schema management system tracks changes, ensures synchronization between environments, and prevents deployment-blocking schema mismatches.
- **Hybrid Storage System**: Stores raw line data in object storage and structured data in the database for cost efficiency and fast queries.
- **Self-Repairing Cache System**: Automatically creates missing TDDF1 totals tables and handles cache rebuild failures gracefully.
- **Enhanced Auto 4-5 Retry System**: Implemented comprehensive retry logic and conflict handling for the Auto 4-5 processing pipeline.
- **Shared TDDF Resource Architecture**: Unified components and utilities for consistent data formatting, type definitions, and helper functions, eliminating code duplication.
- **TDDF Enhanced Metadata System**: Comprehensive filename parsing and metadata extraction system for TDDF files, enriching JSONB table with metadata fields.
- **TDDF Records Pre-Cache by Year**: Comprehensive pre-cache system for TDDF record tabs by year with dedicated tables for various record types, featuring "never expire" policy and manual refresh controls.
- **Enhanced Batch Relations with G2 Records**: Complete BH → DT → G2 relationship support showing comprehensive batch relationships including geographic/location data from G2 records.
- **Cross-Environment Storage Management**: Allows users to view and scan files from both dev-uploader/ and prod-uploader/ storage locations via dropdown selection interface.
- **Startup TDDF Cache Validation**: Automatic validation and creation of missing TDDF cache tables during application startup.
- **Production Self-Correcting Database**: Comprehensive production database health validation with automatic table creation and user provisioning, ensuring critical tables exist and preventing dashboard failures.
- **Editable MCC Schema Configuration**: MCC Schema table redesigned with auto-increment 'id' primary key (replacing 'position'), enabling position value editing. Added 'key' field for database column mapping and 'tab_position' field to track tab-delimited file structure. Supports full CRUD operations for TSYS merchant detail field configuration with comprehensive UI for editing all schema attributes.
- **TSYS Merchant Status System**: Comprehensive TSYS merchant status code mapping system with dual-field architecture (merchant_status stores raw code, status stores descriptive text). Supports all TSYS codes: I→Inactive, F→Fraud, S→Suspect, Z→Merchant do not auth, C→Closed (nothing goes through), D→Delete (Only Chargebacks and Adjustments), B→Do not post deposits; drop next reorg, blank→Open. Ensures UI consistency across Overview and Demographics tabs.
- **Encoding Processing Fixes (Oct 2025)**: Resolved critical encoding bugs in MMS Watcher and UI: (1) Fixed individual encode button storage path retrieval - changed from undefined `upload.storageKey` to correct `upload.storagePath` field in mms-watcher.js, eliminating "Failed to read file undefined" errors. (2) Added comprehensive bulk encoding progress indicators with visual feedback showing up to 5 files with progress bars, percentages, and proper interval cleanup on both success and error paths. (3) Extended JSONB viewer eye icon visibility to include both 'encoded' and 'completed' phases - green eye icon now remains visible after Step 6 processing completes, ensuring continuous access to JSONB data for completed TDDF files. (4) Fixed F64 record type display bug - corrected Transaction Type Identifier field extraction in DT_FIELD_SPECS from positions 225-227 to 335-338 (TDDF positions 336-338), resolving issue where F64 records incorrectly displayed as "ST" instead of "F64". (5) Fixed Step 6 bulk processing bug - added missing `recordIdentifier` field to masterRecord object in tddf-json-encoder.ts processAllRecordsToMasterTable function (line 386), resolving "0 records processed" error where insertMasterTableBatch expected 12 parameters but masterRecord only provided 11, ensuring successful database insertion during bulk TDDF encoding.
- **TDDF DT Field Specification Corrections (Oct 2025)**: Comprehensive cleanup of DT_FIELD_SPECS in tddf-json-encoder.ts to align with official TDDF specification: (1) Removed merchantCity field (doesn't exist in DT schema - was incorrectly mapping positions 243-255). (2) Removed processingCode field (doesn't exist in DT schema - was incorrectly mapping positions 153-158 which overlap with Downgrade Reason fields). (3) Removed messageType field (doesn't exist in DT schema - was incorrectly mapping positions 149-152 which overlap with Downgrade Reason fields). (4) Corrected Terminal ID position from 202-211 to 276-284 (TDDF 277-284). (5) Corrected POS Data Code position from 276-289 to 322-335 (TDDF 323-335). (6) Added missing Card Type (2-char) field at positions 252-254 (TDDF 253-254). (7) Added missing Card Type (3-char) field at positions 338-341 (TDDF 339-341). (8) Corrected Amex Merchant Seller Name position from 233-253 to 512-537 (TDDF 513-537). (9) Corrected Purchase ID position from 253-278 to 287-312 (TDDF 288-312). All field mappings now correctly convert 1-based TDDF positions to 0-based JavaScript array indices for substring extraction.
- **TDDF Merchant Name Lookup (Oct 2025)**: Enhanced TDDF viewer with merchant name lookup functionality across all view modes (Tree View, File View, Flat View). System implements `/api/merchants/lookup-map` endpoint that returns account_number → dba_name mapping for fast merchant lookups. Features progressive loading pattern where TDDF records display immediately with account numbers (16-digit format with leading zero shown in blue text), then merchant names populate asynchronously below account numbers in green text when lookup map loads. Account number normalization automatically strips leading zero from TDDF 16-digit format (e.g., "0675900000138461") to match merchant table 15-digit format (e.g., "675900000138461") for accurate lookups. Applied to TddfJsonPage (/tddf-json) and TddfApiDataPage (/tddf-api) with getMerchantName helper function passed to all view components (TreeViewDisplay, FileViewDisplay, RawDataTab) for consistent merchant identification across BH and DT record displays.
- **Modular Route Architecture (Oct 2025)**: Successfully reorganized monolithic routes.ts into modular, maintainable route files. **Phase A Complete**: Reduced routes.ts from 26,595 lines to 23,786 lines (10.6% reduction, 2,809 lines removed). Created foundational modules: merchants.routes.ts (13 endpoints), users.routes.ts (6 endpoints), api-users.routes.ts (4 endpoints), middleware.ts (shared authentication), utils.ts (shared utilities). **Phase B Complete**: Further reduced routes.ts from 23,786 lines to 22,272 lines (6.3% reduction, 1,514 lines removed). Added infrastructure modules: system.routes.ts (8 endpoints), auth.routes.ts (2 endpoints), settings.routes.ts (10 endpoints), schema.routes.ts (5 endpoints). **Phase C Attempted & Rolled Back**: Attempted upload/file-processor route extraction but discovered architectural incompatibility - routes must integrate with existing processing_status workflow and file processor service before modularization. **Phase D Complete**: Extracted 123 TDDF routes into 3 specialized modules (tddf-files: 42 routes/83KB, tddf-records: 55 routes/88KB, tddf-cache: 26 routes/79KB), achieved 91% phase reduction (22,274 → 2,089 lines). **Total Achievement**: 92.1% reduction overall (26,595 → 2,089 lines, 24,506 lines removed), 10 active route modules. All modules functional, tested, and actively serving production traffic. **Benefits**: Improved maintainability, faster navigation, reduced merge conflicts, clearer separation of concerns. **Safety**: Multiple rollback options available (routes.ts.phase-a, routes.ts.phase-b, routes.ts.phase-c, routes.ts.old, routes.ts.backup).
- **JSON Field Handling Fixes (Oct 2025)**: Resolved critical PostgreSQL JSON/JSONB errors in MMS Uploader: (1) Fixed processingNotes TEXT field - standardized all writes to use JSON.stringify() with proper object structure across routes.ts and mms-watcher.js, migrated 7 legacy database records from plain strings to valid JSON format using SQL UPDATE with jsonb_build_object. (2) Fixed validationErrors JSONB field - added JSON.stringify() to array assignments in mms-watcher.js (lines 623, 1012) preventing jsonfuncs.c PostgreSQL errors. Database schema: processing_notes is TEXT (stores JSON strings), validation_errors is JSONB (requires stringified JSON, PostgreSQL parses on retrieval). All uploader endpoints verified functional: orphan-files detection, manual identification, individual/bulk encoding, step-6 master table processing, file content preview. End-to-end testing confirms no PostgreSQL JSONB errors and proper JSON formatting throughout file processing pipeline.

### UI/UX Decisions
- **Consistent Design**: Utilizes TailwindCSS and shadcn/ui for a modern, professional appearance.
- **Responsive Layouts**: Features comprehensive mobile optimization for all key pages, ensuring touch-friendly and adaptive interfaces.
- **Intuitive Interactions**: Implements features like interactive heat maps, comprehensive sorting, clear progress indicators, and color-coded status displays.
- **Standardized Elements**: Employs shared components (e.g., Cache Control Widget, Heat Map Component Library) for consistent functionality.
- **PDF Reporting System**: Monthly PDF report generation for TDDF1 data with professional layout, executive summary, and key metrics.
- **Dynamic Merchant Demographics**: MCC schema-driven Demographics form with auto-refresh (5-minute intervals), manual refresh button, and paginated TSYS Risk & Configuration Fields display (5, 10, 20, 50, 75 items per page, default 5).

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