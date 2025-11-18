# Merchant Management System (MMS)

## Overview

The Merchant Management System (MMS) is a comprehensive merchant data wherehouse designed for Vermont State Bank. It handles merchant processing logs form mainfriam data processing, merchant management, and financial reporting. The system processes TSYS mainfraim TDDF (Transaction Data Detail File) files as MCC merchant, manages merchant ACH deposit Compliance reporting, handles API integrations, and provides real-time analytics dashboards.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

### Quarterly View Implementation (November 18, 2025)
- Implemented complete quarterly view for History page with `/history/YYYY/QN` URL pattern (e.g., `/history/2025/Q4`)
- **Backend Endpoints**: Created two new cache-based API endpoints:
  - `/api/tddf1/quarterly-totals` - Aggregates 3 months from `dev_tddf1_monthly_cache` table, returns quarterly totals with daily breakdown (~90 days)
  - `/api/tddf1/quarterly-comparison` - Fetches 6 months (current Q + previous Q), returns monthly breakdowns for comparison chart
- **Monthly Cache Integration**: Both endpoints query the `totals_json` column from `dev_tddf1_monthly_cache` table (not master `tddf_jsonb` table) for optimal performance
  - Each month fetched separately with explicit cache keys including filter parameters
  - Quarterly data aggregated from 3 individual monthly cache records
  - Daily breakdowns combined from all 3 months and sorted chronologically
  - **Database Schema Fix**: Corrected endpoints to query using separate `year` (integer) and `month` (integer) columns instead of combined month strings like "2025-07"
  - Cache key format uses underscores: `monthly_YYYY_MM` with zero-padded months (e.g., `monthly_2025_07`)
- **Frontend Components**:
  - 4 summary metric cards (Transaction Authorizations, Net Deposits, Total Files, Total Records) with gradient styling
  - FilterBar with full filter support (Group, Association, Merchant Name, Merchant Account, Terminal)
  - Record type breakdown collapsible section (BH, DT, G2, E1, P1, P2, DR, AD counts)
  - Quarterly comparison chart showing 3 months per quarter with Line/Bar toggle (Bar chart default)
  - Paginated daily breakdown table (20 rows per page for ~90 days) with Previous/Next controls
  - **Quarter Navigation Buttons**: Q1, Q2, Q3, Q4 buttons in header for easy quarter switching within same year
  - **Clear Filter Button**: Shows when any filters are active on monthly or quarterly views to reset all filters at once
- **Chart Configuration**: Quarterly comparison chart displays month names on x-axis with 4 toggleable series (current Q auth/deposit, previous Q auth/deposit), matching monthly chart styling
- **Smart Features**: "No Data Available" message when filtered merchant has no transactions, chart title displays merchant name when filtered
- **Bug Fixes**: 
  - Fixed critical bug where endpoints initially queried wrong column name (`cached_data` instead of `totals_json`), causing 500 errors
  - Fixed database query pattern from `WHERE month = $1` with "2025-07" string to `WHERE year = $1 AND month = $2` with integers (2025, 7)
  - Fixed quarterly-totals endpoint to handle partial quarter data gracefully - works with incomplete quarters (e.g., Q4 2025 shows Oct/Nov data even though Dec hasn't occurred yet)
  - Fixed data type mismatch: backend was returning months as objects `{year, month, display}` but frontend expected strings - now returns just display strings like "2025-01"

### Merchant Name Filter Enhancement (November 18, 2025)
- Added merchant name filter to History page monthly view for easier merchant filtering by name instead of account number
- Created `/api/merchants/for-filter` backend endpoint that fetches all MCC merchants (types 0, 1, blank, null) including all statuses (active, disabled, deleted)
- Implemented dropdown using merchant IDs as unique values to handle duplicate merchant names correctly
- **Bidirectional filter sync**: Selecting merchant by name auto-populates account number, and vice versa
- Updated filter labels: "All Merch Names" for name dropdown, "All Merch Accts" for account dropdown
- **Chart title enhancement**: Monthly Financial Trends Comparison chart now displays selected merchant name in title
- **Smart chart visibility**: Chart only displays when merchant has transaction data for the selected period
- **"No Data Available" message**: Shows friendly message with merchant name and period when filtered merchant has no transactions
- Added memoized lookups: ID → account (forward) and account → ID (reverse) for efficient bidirectional sync
- Idempotent URL restoration: auto-populates merchant account when loading bookmarked URLs with `?merchantName=X` parameter
- Performance optimizations: useCallback on handleFilterChange, useMemo on merchant lookups, proper dependency arrays to prevent unnecessary re-renders
- FilterBar cascading filters maintained: Group → Association → Merchant Name → Merchant Account → Terminal
- **Comparison Chart Filtering Fix**: Fixed critical bug where comparison chart was showing all merchants' data instead of filtering by selected merchant. Updated frontend to pass filter parameters and backend `/api/tddf1/monthly-comparison` endpoint to apply merchant filter to query
- **Bar Chart Visualization**: Added chart type switcher with Line and Bar buttons allowing users to toggle between line chart and bar chart views of the monthly comparison data
  - Bar chart is now the default view for all users
  - Bar chart displays all 31 days of the month (with zero values for days without data)
  - Line chart dynamically shows only days with actual data
  - Both chart types display the same filtered merchant data with consistent styling

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript using Vite as the build tool.

**UI Component Library**: Radix UI primitives with custom styling via Tailwind CSS, following the shadcn/ui design system.

**State Management**: React hooks and context for local state management, with real-time updates via WebSocket connections for processing status monitoring.

**Key Design Patterns**:
- Component-based architecture with reusable UI primitives
- Real-time data visualization using pre-aggregated backend data
- Performance-optimized rendering for large datasets (5M+ records)
- Manual refresh controls with cooldown timers to prevent backend overload

### Backend Architecture

**Runtime**: Node.js with Express.js framework, written in TypeScript/ESModules.

**Database ORM**: Drizzle ORM for type-safe database operations.

**File Processing Pipeline**: Multi-phase processing system with automatic status tracking:
1. Upload → Database entry creation
2. File identification and validation
3. Encoding and parsing
4. Record-level processing
5. Data aggregation and caching

**Key Design Decisions**:
- Dual environment support (development/production) with table prefixing (`dev_*` tables for development)
- Watcher service pattern for autonomous file processing monitoring (30-second intervals)
- Database-level concurrency control to prevent duplicate processing across multiple nodes
- Automatic recovery mechanisms for stuck/orphaned files

### Data Storage Solutions

**Primary Database**: PostgreSQL via Neon serverless (connection pooling configured for high-performance parallel processing).

**Object Storage**: Replit Object Storage for file persistence with environment-specific prefixes (`dev-uploader/` and `prod-uploader/`).

**Hybrid Storage Strategy**: 
- Raw file lines stored in object storage to minimize database size
- Parsed/processed records stored in PostgreSQL for fast querying
- Pre-aggregated summary tables for dashboard performance

**Caching Layer**: Dashboard cache tables for expensive queries, updated automatically by watcher services.

### Authentication and Authorization

**Session Management**: Express-session with PostgreSQL session store.

**API Authentication**: API key-based authentication for external integrations (TDDF API uploads).

**Multi-Factor Authentication**: Support for Duo Security and Azure MSAL integrations.

### External Service Integrations

**Cloud Storage Options**: 
- AWS S3 (via @aws-sdk/client-s3)
- Google Cloud Storage (via @google-cloud/storage)
- Replit Object Storage (primary)

**Payment Processing**: Integration with TSYS merchant processing system for transaction data.

**File Format Support**:
- TDDF (Transaction Data Detail Files) - primary format
- TSYSO files (TSYS merchant data)
- CSV/TSV merchant detail files
- Excel files (via parsing libraries)

## External Dependencies

### Third-Party Services

**Database**: Neon PostgreSQL serverless database with WebSocket support for low-latency connections.

**Object Storage**: Replit Object Storage for file persistence across deployments.

**Authentication Providers**:
- Duo Security for 2FA
- Azure MSAL for enterprise SSO

### APIs and Integrations

**TDDF API**: External API endpoint for automated file uploads with API key authentication (`/api/tddf/upload`).

**Processing APIs**: Internal APIs for:
- Real-time processing statistics
- File upload management
- Merchant data queries
- Transaction reporting

### Key NPM Dependencies

**Database & ORM**:
- `@neondatabase/serverless` - PostgreSQL client optimized for serverless
- `drizzle-orm` - Type-safe ORM layer
- `pg` - Node.js PostgreSQL client

**File Processing**:
- `@aws-sdk/client-s3` and `@aws-sdk/lib-storage` - S3 integration
- `@google-cloud/storage` - GCS integration
- `@replit/object-storage` - Replit storage client

**Frontend Framework**:
- `react` and `react-dom` - UI framework
- `@tanstack/react-query` - Server state management
- `wouter` - Lightweight routing

**UI Components**:
- `@radix-ui/*` - Accessible UI primitives
- `tailwindcss` - Utility-first CSS
- `recharts` - Data visualization
- `lucide-react` - Icon library

**Development Tools**:
- `vite` - Build tool and dev server
- `tsx` - TypeScript execution
- `drizzle-kit` - Database migrations

### Performance Optimization Strategies

**Query Optimization**: Pre-aggregated summary tables prevent expensive real-time calculations on large datasets.

**Bulk Processing**: Batch operations for TDDF record processing (500-2000 records per cycle) with emergency bulk mode for backlogs.

**Connection Pooling**: Optimized PostgreSQL connection pools (max: 15, min: 5) for parallel processing workloads.

**Monitoring**: Scanly Watcher service tracks processing performance, database health, and automatically triggers recovery operations.

## Schema Version Management

### SchemaWatch Auto-Tracking System

**Technology**: PostgreSQL event triggers with materialized views (Neon-compatible implementation based on Grok specification).

**Purpose**: Automatically detect and track every database schema change in development environment without manual intervention.

**Implementation Details**:
- **Event Trigger**: DDL event trigger (`schema_watch_trigger`) captures CREATE, ALTER, and DROP events for tables, indexes, functions, views, sequences, and schemas
- **Audit Log**: Immutable log table (`schema_watch.log`) stores all DDL events with timestamps, command tags, and full SQL text
- **Version Sequence**: Monotonically increasing version number (`schema_watch.version_seq`) starting at 1000
- **Materialized View**: Zero-cost read access via `schema_watch.current_version_mat` with unique index for instant queries
- **Auto-Increment**: Every schema change automatically increments the version number and updates the materialized view in the same transaction

**Database Objects**:
- `schema_watch.log` - Complete DDL event history
- `schema_watch.version_seq` - Version counter
- `schema_watch.current_version` - View for latest version
- `schema_watch.current_version_mat` - Materialized view for performance
- `schema_watch.record_ddl()` - Event trigger function
- `schema_watch_trigger` - DDL event trigger

**Development vs Production Workflow**:
- **Development**: SchemaWatch auto-tracks all schema changes in real-time (currently at v1006+)
- **Production**: Manual sync workflow using `run-production-schema.sh` script to control when dev schema is pushed to prod
- **Tracking Tables**: 
  - `dev_schema_dump_tracking` - Records when dev schema is manually generated
  - `schema_dump_tracking` - Records when production is manually synced from dev

**API Integration**:
- Endpoint: `GET /api/schema/versions`
- Returns: Current dev version from SchemaWatch, production sync status, and timestamps
- Settings Page: Displays both Dev (auto-tracked) and Prod (manual sync) versions side-by-side

**Metadata Table**:
- `dev_mms-app-DatabaseInfo` - Stores environment metadata including schema version, environment name, and custom notes
- Mixed-case naming preserved with double quotes for Postgres compatibility

**Benefits**:
- Zero manual work for dev versioning
- Always accurate (impossible to forget to update version)
- Complete audit trail of all schema changes
- Minimal overhead (<1ms per DDL statement)
- Immediate version detection in Settings page