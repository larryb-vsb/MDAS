# Merchant Management System (MMS)

## Overview

The Merchant Management System (MMS) is a comprehensive merchant data warehouse for Vermont State Bank. It integrates mainframe data processing, merchant management, and financial reporting, focusing on processing TSYS mainframe TDDF files, managing merchant ACH deposit compliance, and providing API integrations and real-time analytics.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Updates (November 2025)

### User Authentication Type Tracking (Nov 22, 2025)
- Added `auth_type` column to users table to distinguish between OAuth and local authentication
- **OAuth Users**: Microsoft OAuth authenticated users automatically created with `auth_type: 'oauth'`
- **Local Users**: Admin-created users and locally authenticated users default to `auth_type: 'local'`
- User Management UI updated to display Auth Type column with color-coded badges
- Storage layer fully plumbed to persist and retrieve auth type across all user operations
- Migration script created: `scripts/backfill-user-auth-type.sql` (environment-aware with dev/prod table naming instructions)
- All existing users backfilled with 'local' auth type for backward compatibility

### TDDF Field Extraction Fixes

**POS Entry Mode Fix (Nov 19, 2025)**
- Fixed critical 16-position offset error in POS Entry Mode extraction
- **Before**: Extracted from positions 230-231 (wrong), displayed as "5-"
- **After**: Extracted from positions 214-215 (correct per TDDF spec), displays as "05", "07", etc.
- Added zero-padding logic to ensure 2-digit format (e.g., "05" not "5")
- SQL remediation script created: `scripts/fix-pos-entry-mode-existing-records.sql`
- Tested successfully: 2,548 records corrected in sample file showing valid codes ("07", "05", "90", "01", "80")

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