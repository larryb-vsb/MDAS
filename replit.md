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