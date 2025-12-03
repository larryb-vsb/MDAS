# Merchant Datawarehouse and Automation System (MDAS)

## Overview

The Merchant Datawarehouse and Automation System (MDAS) is a comprehensive merchant data warehouse for Vermont State Bank. Its primary purpose is to integrate mainframe data processing, merchant management, and financial reporting. Key capabilities include processing TSYS mainframe TDDF files, ensuring merchant ACH deposit compliance, providing API integrations, and delivering real-time analytics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript (Vite build tool).
**UI Component Library**: Radix UI primitives with Tailwind CSS (shadcn/ui design system).
**State Management**: React hooks and context, with real-time updates via WebSockets.
**Key Design Patterns**: Component-based, real-time data visualization using pre-aggregated backend data, performance-optimized rendering, manual refresh controls with cooldowns.

### Backend Architecture

**Runtime**: Node.js with Express.js (TypeScript/ESModules).
**Database ORM**: Drizzle ORM for type-safe operations.
**File Processing Pipeline**: Multi-phase system (Upload, Validation, Parsing, Processing, Aggregation/Caching) with automatic status tracking.
**Key Design Decisions**: Dual environment support (`dev_*` tables), watcher service for autonomous processing, database-level concurrency control, automatic recovery.

### Data Storage Solutions

**Primary Database**: PostgreSQL via Neon serverless (connection pooling configured).
**Object Storage**: Replit Object Storage for file persistence with environment-specific prefixes.
**Hybrid Storage Strategy**: Raw file lines in object storage, processed records in PostgreSQL, pre-aggregated summary tables for dashboards.
**Caching Layer**: Dashboard cache tables for expensive queries, updated by watcher services.

### Authentication and Authorization

**Session Management**: Express-session with PostgreSQL session store.
**API Authentication**: API key-based for external integrations.
**Multi-Factor Authentication**: Duo Security and Azure MSAL integrations.

### Schema Version Management

**SchemaWatch Auto-Tracking System**: Utilizes PostgreSQL event triggers and materialized views to automatically detect and log all database schema changes in development, ensuring an accurate audit trail and versioning. Production schema updates are managed manually.

## External Dependencies

### Third-Party Services

**Database**: Neon PostgreSQL serverless.
**Object Storage**: Replit Object Storage, AWS S3, Google Cloud Storage.
**Authentication Providers**: Duo Security, Azure MSAL.

### APIs and Integrations

**TDDF API**: External API for automated file uploads.
**Processing APIs**: Internal APIs for real-time processing stats, file management, merchant data queries, and transaction reporting.
**Payment Processing**: TSYS merchant processing system.
**File Format Support**: TDDF, TSYSO, CSV/TSV, Excel files.

## Recent Changes

### December 3, 2025 - Route Cleanup: Removed /tddf Duplicate
**Change**: Removed the duplicate `/tddf` route, keeping only `/tddf-records` as the canonical path for the TDDF Records page.

**Files Modified**:
- `client/src/App.tsx`: Removed duplicate route `/tddf` (line 62)
- `client/src/components/layout/MainLayout.tsx`: Updated sidebar link from `/tddf` to `/tddf-records`, updated location check logic

### December 3, 2025 - TDDF Records Page Data Source Migration
**Change**: Connected the Legacy TDDF Records page (`/legacy/tddf`) DT Records tab to use the `tddf_json` data source instead of the legacy `/api/tddf` endpoint.

**Files Modified**:
- `client/src/pages/tddf-page.tsx`: Updated DT Records query to use `/api/tddf-json/records` with `recordType=DT` filter
- `server/routes/tddf-records.routes.ts`: Implemented full `/api/tddf-json/records` endpoint with filtering, pagination, and sorting

**Technical Details**:
- Query endpoint changed from `/api/tddf` to `/api/tddf-json/records?recordType=DT`
- Response data is transformed from `extracted_fields` JSON structure to expected TddfRecord format
- Filter parameters mapped: `txnDateFrom/txnDateTo` → `dateFilter` or `startDate/endDate`
- Sort field names mapped: `transactionDate` → `transaction_date`, etc.
- Cache invalidation updated for both old and new query keys