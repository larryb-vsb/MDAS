# Merchant Management System (MMS)

## Overview
The Merchant Management System (MMS) is a comprehensive web application designed for enterprise-scale merchant relationship management, transaction processing, and business data analysis. It offers robust solutions for handling large datasets, including merchant management, transaction processing, file uploads, data analytics, and automated backup, with a focus on rapid responses. The system aims to provide a scalable, user-friendly platform for efficient business operations, delivering business vision and market potential through its advanced capabilities.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone: CST (America/Chicago) - All dates and times should display in Central Time.
Critical System Requirement: "Never re-fresh" policy - all auto-refresh functionality permanently disabled and verified working.

## System Architecture
MMS employs a modern client-server architecture prioritizing performance, scalability, and maintainability.

### UI/UX Decisions
The UI/UX emphasizes a modern, professional, and intuitive experience using TailwindCSS and shadcn/ui. Key features include consistent design, responsive layouts, interactive heat maps, sorting, progress indicators, color-coded status, a PDF reporting system, dynamic MCC schema-driven forms, and consolidated automation controls. The history page provides comprehensive hierarchical URL-based navigation with full daily view support, including metric cards, record type breakdowns, and merchant volume tables.

### Technical Implementations
- **Frontend**: React-based Single Page Application (SPA) with TypeScript.
- **Backend**: RESTful Express.js API.
- **Database**: PostgreSQL with Drizzle ORM, utilizing database-level locking and quarterly table partitioning for `tddf_jsonb` to optimize query performance (2000x improvements).
- **Data Management**: Unified "never expire" cache, dynamic aggregation with performance tiers, and hybrid storage (object storage for raw data, database for structured data). Includes a self-repairing cache and a TDDF1 hybrid pre-cache architecture.
- **File Processing**: Robust, automated 5-stage pipeline for large files (CSV, TSV, JSON, TDDF) with metadata capture, failed file recovery, TDDF-specific processing, and duplicate file upload prevention with line-level deduplication. Includes soft-delete for TDDF uploads and retry limits/timeout protection for Step 6 processing.
- **TDDF Specifics**: Shared TDDF resource architecture, enhanced metadata system, comprehensive pre-cache for record tabs, and optimized TDDF JSONB query performance via expression indexes and partitioning.
- **Operational Features**: Cross-environment storage management, startup TDDF cache validation, production self-correcting database, editable MCC schema, and enhanced auto-retry systems.
- **Error Recovery & Admin Tools**: Multi-phase error recovery system with atomic transaction-based endpoints for resetting files. Enhanced auto-recovery for files stuck in the validating phase, including retry limits and concurrent processing guards.
- **User Authentication**: Microsoft Azure AD OAuth with optional Duo two-factor authentication, alongside existing username/password authentication.
- **Data Precision**: Enhanced currency formatting to consistently display two decimal places.
- **Terminal Management**: Efficient UPSERT logic for terminal imports with unique constraints and automatic timestamp updates. TDDF Step 6 processing creates/updates terminals with full audit trail tracking and converts specific terminal IDs to V-number format.
- **Analytics**: Comprehensive daily merchant breakdown dashboard with record type details, optimized with performance indexes. Includes a compact monthly calendar heat map for terminal activity and pre-cached "Last Batch" and "Last Transaction" for improved performance in merchant lists. Multi-field search functionality for merchants.
- **Processing Page**: Real-time TDDF processing monitoring dashboard with JSONB-backed endpoints providing real-time stats, performance KPIs, queue status, and historical data.
- **Batch Uploaders**: PowerShell and Python-based batch file uploaders with API key authentication, automatic chunking, queue status monitoring, and retry logic.
- **API Key Usage Tracking**: Comprehensive monitoring of `last_used` timestamp, `last_used_ip`, and `request_count` for API key authenticated requests.
- **Connection Logging & IP Blocking**: Global middleware for logging API requests and a system for administrators to block malicious IPs.
- **Host Approval System**: Security-enhanced upload access control requiring administrator approval for new hostname + API key combinations.
- **Dynamic Verbose Logging API**: Runtime-controllable logging system with API endpoints to adjust verbosity for various modules.
- **Database Health Monitoring**: Production-ready database health check system with API endpoints for latency tests, full health checks, and schema validation.
- **Storage Management System**: Comprehensive object storage management and cleanup system with a master object keys database and API endpoints for statistics, listing, duplicate detection, and purging.
- **Pre-Cache Management System**: Fully operational background pre-calculation system for monthly TDDF data enabling instant dashboard loading, successfully caching months of data with efficient build times. Includes dedicated UI for inspection, rebuilds, and real-time tracking of rebuild jobs. Features a dual upload tracking architecture to handle legacy and modern upload IDs.
- **Main Dashboard Performance**: Optimized homepage dashboard displays comprehensive business metrics with sub-2-second load times by utilizing monthly cache queries, extracting transaction counts from daily breakdown data, and removing slow JSONB record scans.
- **Environment-Aware Table Naming**: Smart 4-priority table prefix logic in `getTableName()` function automatically handles development vs production table naming. Priority order: (1) Explicit `TABLE_PREFIX` env var, (2) Replit production detection via `REPLIT_DEPLOYMENT`, (3) Standard production via `NODE_ENV`, (4) Safe `dev_` prefix default. Ensures monitoring features (Host List, Connection Log) work correctly in production without manual configuration.
- **Production Schema Management**: Version-controlled database schema system with `production-schema.sql` (Version 2.8.0, last updated 2025-11-17) that creates complete production database from scratch. Auto-generated from `shared/schema.ts` via `scripts/generate-production-schema.ts`. Includes 21 core tables (merchants, TDDF records, cache configuration, pre-cache tables, system tables) with 58 performance indexes. Safe to run multiple times using IF NOT EXISTS. Regenerate after schema changes with: `npx tsx scripts/generate-production-schema.ts`.

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