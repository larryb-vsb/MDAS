# Merchant Management System (MMS)

## Overview

The Merchant Management System (MMS) is a comprehensive merchant data warehouse for Vermont State Bank. It integrates mainframe data processing, merchant management, and financial reporting, focusing on processing TSYS mainframe TDDF files, managing merchant ACH deposit compliance, and providing API integrations and real-time analytics.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Updates (November 2025)

### OAuth Environment-Aware Redirect URIs (Nov 25, 2025)
- **Enhancement**: Microsoft OAuth now automatically detects production vs development environments
- **Environment Detection Logic**:
  - Production: Uses hardcoded published domain `https://mms-vsb.replit.app` when `NODE_ENV === 'production'`
  - Development: Uses `REPLIT_DEV_DOMAIN` environment variable for dev workspace URLs
  - Local: Falls back to `http://localhost:5000` for local development
- **Comprehensive Logging**: Enhanced startup logging captures all environment variables and redirect URI selection:
  - Logs NODE_ENV, REPLIT_DEPLOYMENT, and REPLIT_DEV_DOMAIN values
  - Shows selected redirect URI with environment-specific emoji indicators
  - Logs detailed error messages with redirect URI context when OAuth fails
- **Azure AD Configuration**: Supports multiple redirect URIs in same app registration:
  - Development: `https://{workspace-id}.janeway.replit.dev/auth/microsoft/callback`
  - Production: `https://mms-vsb.replit.app/auth/microsoft/callback`
- **Implementation**: `server/auth/microsoft-oauth.ts` imports `NODE_ENV` from `env-config.ts`
- **Error Handling**: Token exchange failures now log error details, stack traces, and configured redirect URI
- **Branding Update**: Mobile header and sheet menu updated from "MMS Dashboard" to "MDWS Dashboard" (matching desktop sidebar)

### About Page with API Documentation (Nov 24, 2025)
- **New Feature**: Comprehensive About page accessible by clicking version info in sidebar
- **UI/UX**: Clickable version links in both desktop and mobile sidebar navigation
  - Desktop: Click version info in sidebar (data-testid: link-version-desktop) navigates to /about
  - Mobile: Click version info in mobile sheet (data-testid: link-version-mobile) navigates to /about and closes menu
  - Hover effects and tooltip hint "Click to view API docs" guide user interaction
- **Content**:
  - Application information card: displays app name, version, build date, environment badge
  - API documentation organized by category: Auth, Users, Merchants, TDDF, Upload, Dashboard, Reports, System
  - Interactive tabs for easy navigation between API categories
  - Detailed endpoint documentation with method badges, paths, request/response schemas
- **TDDF API Documentation**: Expanded with 30+ endpoints organized into 6 categories:
  - File Management (6 endpoints): upload, files listing, file content, delete, queue, filename search
  - Records Management (7 endpoints): records filtering, batch headers, transactions, file records, all records, archive records, bulk delete
  - Schema Management (3 endpoints): get schemas, create schema, update field config
  - API Keys Management (3 endpoints): get keys, create key, delete key
  - Monitoring & Analytics (6 endpoints): monitoring data, last connection, hosts, connections, host approvals
  - Daily Statistics (5 endpoints): stats, day breakdown, recent activity, init tables, import data
- **Route**: Registered as ProtectedRoute at /about requiring authentication
- **Settings Page Cleanup**: Removed Database Schema Version, File Processing History, TDDF JSON Record Counts sections and uploader data status metrics to simplify interface
- **Testing**: End-to-end tests validate desktop and mobile navigation, About page rendering, API tab switching, TDDF subsections, and mobile responsiveness
- **Design Decision**: Version info made interactive to provide easy access to API documentation without cluttering main navigation

### Inline Profile Editing with Form Reset Pattern (Nov 24, 2025)
- **New Feature**: Users can update profile information directly from sidebar without navigating to separate settings page
- **UI/UX Enhancement**: Clickable user info section in sidebar opens profile editing dialog
  - Desktop: Click user info section in sidebar (data-testid: button-edit-profile)
  - Mobile: Click user info section in mobile sheet menu (data-testid: button-edit-profile-mobile)
- **Editable Fields**: First name, last name, email, username (local auth users only)
- **Architecture Pattern**: ForwardRef with Synchronous Reset
  - ProfileEditDialog component uses `forwardRef<ProfileEditDialogRef>` to expose `reset(userData)` method
  - MainLayout maintains `profileDialogRef` and `toggleProfileDialog()` helper function
  - Form reset happens synchronously before dialog state changes, preventing stale data and flicker
  - All close paths (Cancel, ESC, overlay click, rapid toggles, save success) route through helper
- **Backend**: PUT /api/user/profile endpoint with validation
  - Username uniqueness check (prevents duplicate usernames)
  - Email format validation
  - Returns updated user object on success
- **State Management**: Query invalidation on ["/api/user"] triggers useAuth context refresh
- **Testing**: End-to-end tests validate all close/reopen scenarios:
  - Edit → Cancel → Reopen: Unsaved changes discarded, original data shown
  - Edit → Save → Reopen: Server data persisted and reflected in UI
  - Edit → ESC → Reopen: Unsaved changes discarded
  - Edit → Overlay click → Reopen: Unsaved changes discarded
  - Rapid toggle: No stale values or flicker observed
- **Design Decision**: ForwardRef pattern chosen over useEffect-only approach to ensure synchronous form reset before render, eliminating all timing-related edge cases and visual artifacts

### Security Logs Integration (Nov 24, 2025)
- **New Feature**: Centralized security event logging for all authentication activities in `security_logs` table
- **Event Types Tracked**:
  - `login_success`: Successful local authentication logins with full client context
  - `login_failed`: Failed login attempts with detailed failure reasons (user not found, invalid password)
  - `auth_type_upgraded`: Hybrid authentication type conversions (local→hybrid, oauth→hybrid)
- **Storage Layer**:
  - `logSecurityEvent()`: Environment-aware method writes to dev_security_logs or security_logs
  - Non-blocking error handling ensures authentication continues even if logging fails
  - Captures userId, username, IP address, user agent, event type, result, reason, and custom details
- **Authentication Flows Enhanced**:
  - Local authentication (server/auth.ts): Logs failed logins with specific reasons and client context
  - Microsoft OAuth (microsoft-auth.routes.ts): Logs successful OAuth logins and hybrid auth upgrades
  - `getRealClientIP()` helper extracts real client IP from proxy headers (x-replit-user-ip, x-forwarded-for, etc.)
- **Security Monitoring**: All authentication events logged with timestamp, IP address, user agent for audit and security analysis
- **Design Decision**: Security logging uses try/catch to degrade gracefully without disrupting user authentication experience

### Comprehensive Login Tracking (Nov 24, 2025)
- **New Feature**: Complete login attempt tracking for both successful and failed authentications
- **Database Schema**: Added 4 new columns to users table:
  - `last_login_type`: Tracks authentication method (local/oauth) for last successful login
  - `last_failed_login`: Timestamp of most recent failed login attempt
  - `last_failed_login_type`: Authentication method (local/oauth) for last failed attempt
  - `last_failed_login_reason`: Detailed reason for login failure (e.g., "Invalid password")
- **Hybrid Authentication Detection**: System automatically detects when users authenticate with both methods:
  - Local user logging in with OAuth → auth_type converts from 'local' to 'hybrid'
  - OAuth user logging in locally → auth_type converts from 'oauth' to 'hybrid'
  - User re-fetch after auth_type conversion ensures session has current data
- **User Management UI Enhancements**:
  - Last Login column displays format: "Status:Type:DateTime" (e.g., "Success:Local:Nov 24, 2025 7:08 PM")
  - Hover tooltips show "Success" for successful logins or detailed failure reason for failed attempts
  - Color-coded status: green for successful logins, red for failed logins
  - Auth Type badges support: Local (secondary), OAuth (outline), Hybrid (default)
  - Data-testid attributes added for automated testing: `text-last-login-{userId}`, `cell-last-login-{userId}`
- **Storage Layer**: 
  - `updateSuccessfulLogin()`: Updates last_login and last_login_type, auto-detects hybrid auth
  - `updateFailedLogin()`: Non-blocking tracking with try/catch to prevent login disruption
  - `updateUserAuthType()`: Dedicated method for auth_type updates (excluded from general updateUser)
- **Authentication Flows**:
  - Microsoft OAuth tracks successful logins and detects hybrid users
  - Local authentication tracks both successful and failed attempts with detailed reasons
  - Failed login tracking won't block authentication if database issues occur
- **Data Integrity**: updateUser method excludes auth_type to prevent accidental overwrites

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