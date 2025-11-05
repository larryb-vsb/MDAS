# Merchant Management System (MMS)

## Overview
The Merchant Management System (MMS) is a comprehensive web application designed for enterprise-scale merchant relationship management, transaction processing, and business data analysis. It provides robust solutions for efficiently handling large datasets, including merchant management, transaction processing, file uploads, data analytics, and automated backup, with a focus on rapid responses.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone: CST (America/Chicago) - All dates and times should display in Central Time.
Critical System Requirement: "Never re-fresh" policy - all auto-refresh functionality permanently disabled and verified working.

## System Architecture
MMS employs a modern client-server architecture prioritizing performance, scalability, and maintainability.

### UI/UX Decisions
The UI/UX emphasizes a modern, professional, and intuitive experience using TailwindCSS and shadcn/ui. This includes consistent design, responsive layouts, intuitive interactions (e.g., interactive heat maps, sorting, progress indicators, color-coded status), a PDF reporting system, and dynamic MCC schema-driven forms for TSYS Risk & Configuration Fields.

### Technical Implementations
- **Frontend**: React-based Single Page Application (SPA) with TypeScript.
- **Backend**: RESTful Express.js API.
- **Database**: PostgreSQL with Drizzle ORM.
- **Data Management**: Unified "never expire" cache, dynamic aggregation with performance tiers, hybrid storage (object storage for raw data, database for structured data), and database-level locking for concurrency.
- **File Processing**: Robust, automated 5-stage pipeline for large files (CSV, TSV, JSON, TDDF) with metadata capture, failed file recovery, and TDDF-specific switch-based processing for record types. Includes duplicate file upload prevention with line-level deduplication.
- **Self-Healing & Optimization**: Self-repairing cache system, TDDF1 hybrid pre-cache architecture for dashboard performance, and enhanced auto-retry systems.
- **TDDF Specifics**: Shared TDDF resource architecture, enhanced metadata system, comprehensive pre-cache for record tabs, improved BH → DT → G2 relationship display, and flag-based archiving with seamless restoration. TDDF JSONB query performance is optimized via indexing.
- **Operational Features**: Cross-environment storage management, startup TDDF cache validation, production self-correcting database, and editable MCC schema configuration.
- **User Authentication**: Microsoft Azure AD OAuth with optional Duo two-factor authentication, alongside existing username/password authentication.
- **Data Precision**: Enhanced currency formatting to consistently display two decimal places in compact currency values.
- **Soft-Delete**: Implemented for TDDF file uploads with persistent audit logging, allowing files to be marked as 'deleted' while retaining metadata for recovery and audit trails.
- **Terminal Management**: Efficient UPSERT logic for terminal imports with unique constraint on `v_number` to prevent duplicates and automatic update of `last_update` timestamp and `update_source`. Terminal CSV file type detection improved.
- **Analytics**: Comprehensive daily merchant breakdown dashboard with full record type details, optimized with multiple performance indexes on TDDF JSONB records for date-based queries. Includes a compact monthly calendar heat map for terminal activity.
- **Dashboard Consistency**: Standardized `mcc` property usage across backend caching and frontend display to ensure accurate reporting of Merchant Category Code metrics.
- **MCC Calculation Fix (Nov 5, 2025)**: Corrected MCC merchant count from 0 to 359 by updating SQL query logic to use `merchant_type != '3'` (exclude only ACH) instead of `IN ('0', '1')` which didn't match actual merchant data types ('8000', '1000', '3000', etc.). Fixed frontend typo (.mmc → .mcc) in HomeDashboardEnhanced.tsx across all 9 metric references.
- **PowerShell Batch Uploader (Nov 5, 2025)**: Comprehensive PowerShell-based batch file uploader with API key authentication, automatic chunking for large files (>25MB), queue status monitoring, and retry logic. Supports both command-line parameters and optional config file. Includes new API endpoints: GET /api/uploader/ping (connectivity test) and GET /api/uploader/batch-status (queue metrics). Upload endpoints (/api/uploader/start, /api/uploader/:id/upload, /api/uploader/:id/upload-chunk) enhanced with flexible authentication supporting both session cookies and API key headers.
- **Python Batch Uploader (Nov 5, 2025)**: Production-ready Python alternative to PowerShell uploader (RECOMMENDED). Cross-platform (Windows/Mac/Linux), more reliable error handling, and easier to test/debug. Features three actions (--ping, --status, --upload), JSON config file support with CLI parameter override, automatic file chunking >25MB, retry logic with exponential backoff (max 3 retries), colored terminal output, comprehensive error messages for non-technical users, and JSON upload reports. Tested successfully with ping, authentication validation, and full upload flow.
- **API Key Usage Tracking (Nov 5, 2025)**: Comprehensive API key monitoring system tracking last_used timestamp, last_used_ip (client IP address), and request_count for all API key authenticated requests. Implemented getClientIp() helper in middleware to extract client IP from X-Forwarded-For, X-Real-IP headers, or direct connection. Backend monitoring endpoint GET /api/tddf-api/monitoring/last-connection returns most recent API activity. Frontend API Keys table displays "Last Used" (formatted with time) and "Last IP" columns. Monitoring tab includes "Last API Connection" card showing real-time timestamp, key name, IP, and request count with 4-second refresh. All authentication middleware (routes.ts and middleware.ts) updated to use snake_case database fields (is_active, username) for proper field mapping. Successfully tested with Python batch uploader confirming accurate tracking and incrementation.
- **Connection Logging & IP Blocking (Nov 5, 2025)**: Comprehensive security monitoring system tracking ALL connections (authenticated or not) to the API. Global middleware logs every request to `dev_connection_log` table with IP address, endpoint, method, user agent, API key used (if any), response time, and status code. IP blocking system (`dev_ip_blocklist` table) allows admins to block malicious IPs globally with optional expiration dates. Ping endpoint (/api/uploader/ping) works WITHOUT authentication and returns service status plus API key validation (valid/invalid/inactive/not_provided). Python batch uploader v1.1.3 enhanced with comprehensive logging to `mms-uploader.log`, detailed ping output showing service status and key validation, verbose mode (-v flag), connection tracking for security monitoring, version display in output and logs, and timestamp display on ping. Monitoring tab includes "Host List" showing all unique IPs with connection stats and "Connection Log" table showing recent requests with full details.

## External Dependencies

- **Database**: PostgreSQL (via @neondatabase/serverless)
- **ORM**: drizzle-orm
- **Web Framework**: express
- **Frontend Library**: react
- **State Management**: @tanstack/react-query
- **Authentication**: passport, @azure/msal-node (Microsoft OAuth), @duosecurity/duo_universal (Duo MFA)
- **UI Components**: @radix-ui/, tailwindcss, lucide-react
- **Routing**: wouter
- **File Uploads**: multer
- **CSV Processing**: csv-parse, fast-csv
- **Cloud Storage**: @aws-sdk/client-s3
- **Scheduling**: node-schedule