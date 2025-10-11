# Merchant Management System (MMS) - Compressed Architecture Guide

## Overview
The Merchant Management System (MMS) is a comprehensive web application for merchant relationship management, transaction processing, and business data analysis. It supports merchant management, transaction processing, file uploads, data analytics, and automated backup. MMS is designed for enterprise-scale operations, efficiently handling large datasets and transforming long-running queries into millisecond responses through advanced caching, aiming to provide a robust solution for large-scale financial data management.

## User Preferences
Preferred communication style: Simple, everyday language.
Timezone: CST (America/Chicago) - All dates and times should display in Central Time.
Critical System Requirement: "Never re-fresh" policy - all auto-refresh functionality permanently disabled and verified working.

## System Architecture
MMS employs a modern client-server architecture with a React-based frontend, a RESTful Express.js backend, and a PostgreSQL database managed with Drizzle ORM.

### Key Architectural Decisions & Design Patterns
- **Unified Cache System**: Implements a "never expire" cache, month-by-month refresh, and persistent cache configuration for performance optimization.
- **Dynamic Aggregation**: Supports intelligent performance tiers (daily/weekly/monthly/quarterly) for large datasets with progressive loading indicators.
- **File Processing Pipeline**: A robust, automated 5-stage pipeline (Started → Uploading → Uploaded → Identified → Encoding → Encoded) supporting large files (40MB+) and various formats (CSV, TSV, JSON, TDDF) with metadata capture and failed file recovery.
- **TDDF Processing Architecture**: Utilizes a switch-based system for various record types, ensuring efficient handling and extensibility, comprehensive field extraction, and strong transactional integrity.
- **Concurrency Control**: Employs database-level locking for atomic file claiming, preventing race conditions and enabling multi-node deployments.
- **Environment Isolation**: Achieves robust separation between development and production environments at the table level within the same database instance using dynamic table naming.
- **Schema Versioning**: A comprehensive, database-based schema management system tracks changes and ensures synchronization.
- **Hybrid Storage System**: Stores raw line data in object storage and structured data in the database for cost efficiency and fast queries.
- **Self-Repairing Cache System**: Automatically creates missing TDDF1 totals tables and handles cache rebuild failures.
- **Enhanced Auto 4-5 Retry System**: Implements comprehensive retry logic and conflict handling for the Auto 4-5 processing pipeline.
- **Shared TDDF Resource Architecture**: Unified components and utilities for consistent data formatting, type definitions, and helper functions.
- **TDDF Enhanced Metadata System**: Comprehensive filename parsing and metadata extraction system for TDDF files, enriching JSONB tables.
- **TDDF Records Pre-Cache by Year**: Comprehensive pre-cache system for TDDF record tabs by year with dedicated tables, featuring a "never expire" policy and manual refresh controls.
- **Enhanced Batch Relations with G2 Records**: Provides comprehensive batch relationships including geographic/location data from G2 records.
- **Cross-Environment Storage Management**: Allows users to view and scan files from both dev-uploader/ and prod-uploader/ storage locations via a dropdown interface.
- **Startup TDDF Cache Validation**: Automatic validation and creation of missing TDDF cache tables during application startup.
- **Production Self-Correcting Database**: Comprehensive production database health validation with automatic table creation and user provisioning.
- **Editable MCC Schema Configuration**: Redesigned MCC Schema table with auto-increment 'id', 'key' for database column mapping, and 'tab_position'. Supports full CRUD operations for TSYS merchant detail field configuration.
- **TSYS Merchant Status System**: Comprehensive TSYS merchant status code mapping system with a dual-field architecture for raw codes and descriptive text, ensuring UI consistency.
- **Modular Route Architecture**: Routes have been refactored into modular, maintainable files, significantly reducing the size of the main `routes.ts` file and improving maintainability.

### UI/UX Decisions
- **Consistent Design**: Utilizes TailwindCSS and shadcn/ui for a modern, professional appearance.
- **Responsive Layouts**: Features comprehensive mobile optimization for all key pages.
- **Intuitive Interactions**: Implements interactive heat maps, comprehensive sorting, clear progress indicators, and color-coded status displays.
- **Standardized Elements**: Employs shared components for consistent functionality.
- **PDF Reporting System**: Generates monthly PDF reports for TDDF1 data with a professional layout.
- **Dynamic Merchant Demographics**: MCC schema-driven Demographics form with auto-refresh and paginated TSYS Risk & Configuration Fields display.

## External Dependencies

- **Database**: PostgreSQL (@neondatabase/serverless)
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