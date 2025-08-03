# Merchant Management System (MMS) - Compressed Architecture Guide

## Overview
The Merchant Management System (MMS) is a comprehensive web application designed for merchant relationship management, transaction processing, and business data analysis. It supports merchant management, transaction processing, file uploads, data analytics, and automated backup. MMS is built for enterprise-scale operations, handling large datasets efficiently and transforming long-running queries into millisecond responses through advanced caching mechanisms, aiming to provide a robust solution for large-scale financial data management.

**DEPLOYMENT-READY STATUS (2025-08-02)**: System successfully implements complete TDDF data clearing functionality with robust error handling. Clear TDDF button now properly removes all TDDF data (both TDDF JSON and TDDF1 systems) and gracefully handles empty states without crashes. All client-side null-safety issues resolved. Active TDDF processing pipeline verified working with multi-file batch processing capabilities.

**ENVIRONMENT-AWARE TDDF1 SYSTEM (2025-08-02)**: Fixed critical environment separation issues for TDDF1 file processing. All TDDF1 endpoints (stats, rebuild-totals-cache, day-breakdown, recent-activity) now properly detect NODE_ENV and use appropriate table prefixes: 'dev_tddf1_' for development, 'tddf1_' for production. TDDF encoder updated to create environment-specific file tables and totals tables. "Rebuild TDDF1 Totals Cache" button now works correctly in both development and production environments.

**ENHANCED AUTO 4-5 RETRY SYSTEM (2025-08-02)**: Implemented comprehensive retry logic and conflict handling for the Auto 4-5 processing pipeline. System now automatically retries encoding failures up to 3 times, silently logs conflicts to file metadata without stopping processing, and continues batch processing even with database conflicts. Added retry tracking columns and API endpoint for monitoring retry statistics and warning logs.

**CRITICAL TDDF1 CALCULATION FIX (2025-08-03)**: Fixed major calculation error in TDDF1 amount processing. System was incorrectly using DT record transaction amounts (~$28K) instead of BH record net deposits (~$2.8M). Updated calculation logic to properly extract Net Deposit from BH (Batch Header) records at positions 69-83 according to TDDF specifications. This aligns with industry-standard TDDF processing and user validation via PowerShell script analysis.

**SEPARATED BH/DT CALCULATIONS (2025-08-03)**: Critical fix - stopped incorrectly adding BH and DT values together. Now correctly calculates and displays separate totals: BH Net Deposits (batch totals from merchants) and DT Transaction Amounts (individual customer payments). These values should be close but separate, representing the business flow where customers pay transaction amounts during the day, then merchants batch at end of day with net deposits that may differ due to fees/adjustments. Added separate database columns (bh_net_deposits, dt_transaction_amounts) to properly track both values independently.

**CRITICAL CACHE MISMATCH IDENTIFIED (2025-08-03)**: BH-DT-Cortex-Validator revealed massive discrepancies between cached totals and direct TDDF calculations. Root cause: Rebuild cache endpoint was using pre-parsed database fields instead of raw TDDF specification. Fixed rebuild cache logic to use PowerShell-equivalent calculations (SUBSTRING from raw_line positions with proper validation). Cache must be rebuilt to correct values: August 2025 should show $879,638.53 DT amounts vs current cached $8,800.43.

**COMMON TOOLS FRAMEWORK (2025-08-03)**: Established reusable tools directory with BH-DT-TDDF-Cortex-Validator as the first common diagnostic tool. Located in `tools/` directory with comprehensive documentation and usage guidelines. Tool provides PowerShell-compliant TDDF validation, cache consistency checks, and environment-aware processing for ongoing system maintenance. Originally developed in collaboration with Cortex.

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
- **File Processing Pipeline**: A robust, automated 5-stage pipeline (Started → Uploading → Uploaded → Identified → Encoding → Encoded) supports large files (40MB+) and various formats (CSV, TSV, JSON, TDDF). It includes comprehensive metadata capture, multi-stream JSON uploads, and a failed file recovery system.
- **TDDF Processing Architecture**: Utilizes a switch-based processing system for various record types, ensuring efficient handling and easy extensibility, including comprehensive field extraction based on TDDF specifications and strong transactional integrity.
- **Concurrency Control**: Implements database-level locking for atomic file claiming, preventing race conditions and enabling multi-node deployments with unique server identification and stale lock cleanup.
- **Environment Isolation**: Achieves robust separation between development (dev_ prefix) and production environments at the table level within the same database instance, using dynamic table naming.
- **Schema Versioning**: A comprehensive, database-based schema management system tracks changes, ensures synchronization between environments, and prevents deployment-blocking schema mismatches.
- **UI/UX Decisions**:
    - **Consistent Design**: Utilizes TailwindCSS and shadcn/ui for a modern, professional appearance.
    - **Responsive Layouts**: Features comprehensive mobile optimization for all key pages, ensuring touch-friendly and adaptive interfaces.
    - **Intuitive Interactions**: Implements features like interactive heat maps, comprehensive sorting, clear progress indicators, and color-coded status displays.
    - **Standardized Elements**: Employs shared components (e.g., Cache Control Widget, Heat Map Component Library) for consistent functionality.

### Core Technical Implementations
- **Frontend**: React, Wouter for routing, React Query for server state, React Hook Form with Zod for forms.
- **Backend**: Express.js, Drizzle ORM, Multer for file uploads, Passport.js for authentication.
- **Database Schema**: Includes tables for Merchants, Transactions, Users, Uploaded Files, Backup Management, Audit Logging, and Schema Versioning.
- **Tab-Specific Pre-Cache System**: Each TDDF JSON page tab has dedicated pre-cache tables optimized for unique data patterns and query requirements, eliminating expensive real-time aggregations and JOINs.
- **TDDF Records Pre-Cache by Year**: Comprehensive pre-cache system for TDDF record tabs by year with dedicated tables for various record types, featuring "never expire" policy and manual refresh controls.
- **Enhanced Batch Relations with G2 Records**: Complete BH → DT → G2 relationship support showing comprehensive batch relationships including geographic/location data from G2 records.
- **Cross-Environment Storage Management**: Allows users to view and scan files from both dev-uploader/ and prod-uploader/ storage locations via dropdown selection interface.
- **Startup TDDF Cache Validation**: Automatic validation and creation of missing TDDF cache tables during application startup.
- **Production Self-Correcting Database**: Comprehensive production database health validation with automatic table creation and user provisioning, ensuring critical tables exist and preventing dashboard failures.

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