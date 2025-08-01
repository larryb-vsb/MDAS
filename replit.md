# Merchant Management System (MMS) - Architecture Guide

## Overview
The Merchant Management System (MMS) is a comprehensive web application designed to manage merchant relationships, process transactions, and analyze business data. It provides capabilities for merchant management, transaction processing, file uploads, data analytics, and automated backup management. The system is built for enterprise-scale operations, handling large datasets efficiently and transforming long-running queries into millisecond responses through advanced caching mechanisms.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone: CST (America/Chicago) - All dates and times should display in Central Time.

## System Architecture

MMS employs a modern client-server architecture with clear separation between frontend and backend components.

### High-Level Architecture
- **Frontend**: React-based Single Page Application (SPA) with TypeScript.
- **Backend**: RESTful Express.js API handling business logic and data processing.
- **Database**: PostgreSQL, managed with Drizzle ORM for type-safe operations.

### Key Architectural Decisions & Design Patterns
- **Unified Cache System**: Features a universal "never expire" cache, month-by-month cache refresh, and persistent cache configuration managed via a dedicated database system. This transforms 50-second queries into millisecond responses.
- **Dynamic Aggregation**: Implements intelligent performance tiers (daily/weekly/monthly/quarterly) for large datasets (5-10M records) with progressive loading indicators.
- **File Processing Pipeline**: A robust, automated 5-stage pipeline (Started → Uploading → Uploaded → Identified → Encoding → Encoded) supports large files (40MB+) and various formats (CSV, TSV, JSON, TDDF). It includes comprehensive metadata capture, multi-stream JSON uploads, and a failed file recovery system.
- **TDDF Processing Architecture**: Utilizes a switch-based processing system for different record types (DT, BH, P1, P2, E1, G2, AD, DR, CK, LG, GE), ensuring efficient handling and easy extensibility. It includes comprehensive field extraction based on TDDF specifications and strong transactional integrity.
- **Concurrency Control**: Implements database-level locking for atomic file claiming, preventing race conditions and enabling multi-node deployments with unique server identification and stale lock cleanup.
- **Environment Isolation**: Achieves robust separation between development (dev_ prefix) and production environments at the table level within the same database instance, using dynamic table naming.
- **Schema Versioning**: A comprehensive, database-based schema management system tracks changes, ensures synchronization between environments, and prevents deployment-blocking schema mismatches.
- **UI/UX Decisions**:
    - **Consistent Design**: Utilizes TailwindCSS and shadcn/ui for a modern, professional appearance with consistent styling across all components.
    - **Responsive Layouts**: Features comprehensive mobile optimization for all key pages (Dashboard, TDDF screens, Login), ensuring touch-friendly and adaptive interfaces across various screen sizes.
    - **Intuitive Interactions**: Implements features like interactive heat maps, comprehensive sorting, clear progress indicators, and color-coded status displays for enhanced user experience.
    - **Standardized Elements**: Employs shared components (e.g., Cache Control Widget, Heat Map Component Library) for consistent functionality and appearance across the application.

### Core Technical Implementations
- **Frontend**: React, Wouter for routing, React Query for server state, React Hook Form with Zod for forms.
- **Backend**: Express.js, Drizzle ORM, Multer for file uploads, Passport.js for authentication.
- **Database Schema**: Includes tables for Merchants, Transactions, Users, Uploaded Files, Backup Management, Audit Logging, and Schema Versioning.
- **Tab-Specific Pre-Cache System**: Each TDDF JSON page tab (Statistics, Activity Heat Map, Batch Relationships, Other Records) now has dedicated pre-cache tables optimized for their unique data patterns and query requirements, eliminating expensive real-time aggregations and JOINs.
- **TDDF Records Pre-Cache by Year**: Comprehensive pre-cache system for TDDF record tabs by year with dedicated tables for All Records, DT-Transactions, BH-Batch Headers, Batch Relationships, P1-Purchasing, P2-Purchasing 2, and Other Types. Features "never expire" policy, manual refresh controls, processing status tracking, and enhanced loading dialogs similar to heat map implementation.
- **Enhanced Batch Relations with G2 Records**: Complete BH → DT → G2 relationship support showing comprehensive batch relationships including geographic/location data from G2 records. Features merchant location information, category codes, and enhanced validation badges for relationship compliance.
- **TDDF Specification Documentation**: Complete official TDDF specification extracted and organized in `tddf_documentation/` directory with reference guide (`TDDF_SPECIFICATION_REFERENCE.md`) covering all record types, relationships, and field mappings based on 2025-06-10 specification version.
- **Cross-Environment Storage Management**: Complete implementation allowing users to view and scan files from both dev-uploader/ and prod-uploader/ storage locations via dropdown selection interface. Features real-time count updates, environment-aware orphan scanning, and proper logging separation ensuring no environment confusion during operations.

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