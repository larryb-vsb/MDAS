# Merchant Datawarehouse and Automation System (MDAS)

## Overview

The Merchant Datawarehouse and Automation System (MDAS) is a comprehensive solution for Vermont State Bank, designed to integrate mainframe data processing, merchant management, and financial reporting. Its core purpose is to process TSYS mainframe TDDF files, ensure merchant ACH deposit compliance, provide robust API integrations, and deliver real-time analytics. The project aims to provide an automated solution for financial data management, enhancing operational efficiency and regulatory compliance.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions

The frontend is developed using React with TypeScript, leveraging Radix UI primitives and Tailwind CSS (shadcn/ui) for a modern and consistent user experience. It features performance-optimized rendering, real-time data visualization based on pre-aggregated backend data, and manual refresh controls with cooldowns.

### Technical Implementations

- **Frontend**: React with TypeScript (Vite), utilizing React hooks and context for state management, and WebSockets for real-time updates.
- **Backend**: Node.js with Express.js (TypeScript/ESModules) and Drizzle ORM for type-safe database interactions.
- **File Processing Pipeline**: A multi-stage pipeline (Upload, Validation, Parsing, Processing, Aggregation/Caching) includes automatic status tracking, dual environment support (e.g., `dev_*` tables), a watcher service for autonomous processing, and database-level concurrency control for recovery.
- **Data Storage**: PostgreSQL (Neon serverless) serves as the primary database. Replit Object Storage is used for file persistence, employing a hybrid strategy where raw file lines are stored in object storage, processed records in PostgreSQL, and pre-aggregated summary tables for dashboards.
- **Authentication**: Express-session with a PostgreSQL session store, API key-based authentication for external integrations, and multi-factor authentication via Duo Security and Azure MSAL.
- **Schema Management**: SchemaWatch Auto-Tracking System utilizes PostgreSQL event triggers and materialized views to automatically detect and log database schema changes during development.
- **Core Features**: Real-time processing statistics, comprehensive merchant data querying, advanced field-based search using PostgreSQL `SUBSTRING`, and an automated orphan healing service for stuck files. Robust concurrency support for processing steps with retry logic and connection monitoring.

### Feature Specifications

- Real-time processing statistics and file management capabilities.
- Comprehensive merchant data querying and transaction reporting.
- Advanced field-based search for DT records within raw TDDF data.
- Automated orphan healing service to detect and reset files stuck in intermediate processing states.
- Robust concurrency support for Step 6 processing with retry logic and pool health monitoring.
- Step 6 validation phase includes a 5-minute query timeout.
- Performance-optimized connection monitoring with a 7-day rolling window filter.
- Support for Merchant Alias System to prevent duplicate merchant creation, including fuzzy matching and normalization of merchant names.
- Consistent terminal VAR number formats across all creation paths using a `normalizeVarNumber()` utility.
- Enhanced History page with tabs for Files Processed, Processing, Transactions, and Merchant Volume, providing detailed views of processed data and daily summaries.
- Dedicated Email Settings page for service configuration, outbox viewing, and history tracking.
- Redesigned Archive tab with card-based layout, file type filtering, and activity heatmap.

## External Dependencies

### Third-Party Services

- **Database**: Neon PostgreSQL serverless.
- **Object Storage**: Replit Object Storage, AWS S3, Google Cloud Storage.
- **Authentication Providers**: Duo Security, Azure MSAL.

### APIs and Integrations

- **TDDF API**: External API for automated file uploads.
- **Payment Processing**: TSYS merchant processing system.
- **File Format Support**: TDDF, TSYSO, CSV/TSV, Excel files.