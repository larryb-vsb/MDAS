# Schema Comparison: Development vs Production

**Generated:** October 31, 2025  
**Development Database:** ep-shy-king-aasxdlh7 (NEON_DEV_DATABASE_URL)  
**Production Database:** ep-quiet-unit-aa0eaxhe (NEON_PROD_DATABASE_URL)  
**Total Tables:** 49 (all using `dev_` prefix)

---

## Executive Summary

This document provides a complete inventory of all database tables in the Merchant Management System (MMS), comparing the development environment (source of truth) against production (deployment target).

### Key Statistics

**Database Size Overview:**
- **Largest Table:** `dev_tddf_jsonb` - 10,012 MB (1.7M records)
- **Second Largest:** `dev_uploader_tddf_jsonb_records` - 4,597 MB
- **Total Tables:** 49 active tables (12 orphan tables archived with `del_` prefix)

**Tables Modified in October 2025:**
1. `dev_uploader_uploads` - Added soft-delete columns (deleted_at, deleted_by)
2. `dev_audit_logs` - Added file_metadata JSONB column + action index

---

## Complete Table Inventory

### Section 1: File Upload & Processing Tables

#### 1.1 dev_uploader_uploads ⭐ MODIFIED OCT 2025
- **Columns:** 80
- **Size:** 328 KB (table) / 88 KB (data)
- **Row Count:** 74
- **Purpose:** Master tracking table for all file uploads through 5-stage processing pipeline
- **Recent Changes:** 
  - Added `deleted_at` (timestamp) for soft-delete tracking
  - Added `deleted_by` (varchar) for audit trail
  - Added `uploader_uploads_deleted_at_idx` index
- **Critical Fields:** id, filename, upload_status, current_phase, deleted_at, deleted_by

#### 1.2 dev_uploader_tddf_jsonb_records
- **Columns:** 19
- **Size:** 4,597 MB (table) / 4,134 MB (data)
- **Purpose:** Stores parsed TDDF records in JSONB format for fast querying
- **Critical Fields:** upload_id, record_type, json_data, terminal_id, merchant_id

#### 1.3 dev_uploader_json
- **Columns:** 10
- **Size:** 24 KB
- **Purpose:** Generic JSON data uploads
- **Critical Fields:** id, filename, upload_id

#### 1.4 dev_uploader_mastercard_di_edit_records
- **Columns:** 5
- **Size:** 24 KB
- **Purpose:** Mastercard Digital Issuance edit record storage
- **Critical Fields:** id, record_data

#### 1.5 dev_uploaded_files
- **Columns:** 25
- **Size:** 32 KB
- **Purpose:** Legacy file upload tracking (superseded by uploader_uploads)
- **Critical Fields:** id, filename, status

---

### Section 2: TDDF Transaction Processing Tables

#### 2.1 dev_tddf_jsonb ⭐ PRIMARY TDDF TABLE
- **Columns:** 18
- **Size:** 10,012 MB (table) / 8,959 MB (data)
- **Row Count:** 1,708,195
- **Purpose:** Master TDDF transaction storage in JSONB format for optimal query performance
- **Critical Fields:** upload_id, record_type, record_data, terminal_id, merchant_id, transaction_date
- **Indexes:** Multiple on terminal_id, merchant_id, transaction_date, record_type

#### 2.2 dev_tddf1_totals
- **Columns:** 10
- **Size:** 72 KB
- **Purpose:** Pre-calculated TDDF1 daily aggregates for dashboard performance
- **Critical Fields:** business_date, total_transaction_value, net_deposits

#### 2.3 dev_tddf1_merchants
- **Columns:** 17
- **Size:** 144 KB
- **Purpose:** TDDF merchant relationship tracking
- **Critical Fields:** merchant_id, merchant_name, terminal_ids

#### 2.4 dev_tddf1_activity_cache
- **Columns:** 6
- **Size:** 16 KB
- **Purpose:** Caches terminal activity data for heat maps
- **Critical Fields:** terminal_id, activity_date, transaction_count

#### 2.5 dev_tddf1_monthly_cache
- **Columns:** 6
- **Size:** 24 KB
- **Purpose:** Monthly aggregated TDDF statistics
- **Critical Fields:** month_key, total_transactions, total_amount

#### 2.6 dev_tddf_batch_headers
- **Columns:** 15
- **Size:** 16 KB
- **Purpose:** TDDF BH (Batch Header) record storage
- **Critical Fields:** batch_id, batch_date, net_deposit

#### 2.7 dev_tddf_datamaster
- **Columns:** 18
- **Size:** 16 KB
- **Purpose:** TDDF master data reference table
- **Critical Fields:** id, data_type, data_value

#### 2.8 dev_tddf_purchasing_extensions
- **Columns:** 14
- **Size:** 16 KB
- **Purpose:** TDDF purchasing card extension data
- **Critical Fields:** id, extension_data

#### 2.9 dev_tddf_other_records
- **Columns:** 13
- **Size:** 16 KB
- **Purpose:** Non-standard TDDF record types
- **Critical Fields:** id, record_type, record_data

#### 2.10 dev_tddf_records
- **Columns:** 25
- **Size:** 24 KB
- **Purpose:** Legacy TDDF record storage (superseded by tddf_jsonb)
- **Critical Fields:** id, record_type, terminal_id

---

### Section 3: TDDF Archive & Historical Data

#### 3.1 dev_tddf_archive
- **Columns:** 25
- **Size:** 280 KB (table) / 40 KB (data)
- **Purpose:** Archived TDDF files with flag-based soft archiving
- **Critical Fields:** id, filename, is_archived, archived_at, archived_by

#### 3.2 dev_tddf_archive_records
- **Columns:** 22
- **Size:** 56 KB
- **Purpose:** Individual records from archived files
- **Critical Fields:** archive_id, record_type, record_data

#### 3.3 dev_tddf_raw_import
- **Columns:** 11
- **Size:** 32 KB
- **Purpose:** Raw TDDF file import staging area
- **Critical Fields:** id, raw_data, import_status

#### 3.4 dev_tddf_import_log
- **Columns:** 8
- **Size:** 16 KB
- **Purpose:** TDDF import operation audit log
- **Critical Fields:** id, import_date, status, record_count

---

### Section 4: TDDF Cache & Pre-calculated Data

#### 4.1 dev_tddf_json_record_type_counts_pre_cache
- **Columns:** 22
- **Size:** 80 KB
- **Purpose:** Pre-cached record type counts for dashboard performance
- **Critical Fields:** cache_key, record_counts_json, last_updated

#### 4.2 dev_tddf_object_totals_cache_2025
- **Columns:** 15
- **Size:** 16 KB
- **Purpose:** Year-specific TDDF object totals cache
- **Critical Fields:** object_type, total_count, total_amount

#### 4.3 dev_tddf1_activity_cache
- **Columns:** 6
- **Size:** 16 KB
- **Purpose:** Activity data for GitHub-style heat maps
- **Critical Fields:** date, activity_count

---

### Section 5: TDDF API Integration Tables

#### 5.1 dev_tddf_api_files
- **Columns:** 19
- **Size:** 64 KB
- **Purpose:** External API file metadata
- **Critical Fields:** id, filename, api_source, status

#### 5.2 dev_tddf_api_records
- **Columns:** 21
- **Size:** 72 KB
- **Purpose:** Records fetched via external APIs
- **Critical Fields:** id, file_id, record_data

#### 5.3 dev_tddf_api_queue
- **Columns:** 8
- **Size:** 32 KB
- **Purpose:** API request queue management
- **Critical Fields:** id, request_type, status, scheduled_at

#### 5.4 dev_tddf_api_request_logs
- **Columns:** 12
- **Size:** 32 KB
- **Purpose:** API request/response audit trail
- **Critical Fields:** id, endpoint, status_code, response_time

#### 5.5 dev_tddf_api_keys
- **Columns:** 12
- **Size:** 32 KB
- **Purpose:** API authentication credential storage
- **Critical Fields:** id, key_name, encrypted_key

#### 5.6 dev_tddf_api_schemas
- **Columns:** 9
- **Size:** 32 KB
- **Purpose:** API data schema definitions
- **Critical Fields:** id, schema_name, schema_version, schema_json

---

### Section 6: Merchant & Terminal Management

#### 6.1 dev_merchants
- **Columns:** 245
- **Size:** 1,296 KB (table) / 376 KB (data)
- **Purpose:** Comprehensive merchant data including MCC schema fields
- **Critical Fields:** id, name, dba_name, mcc_code, terminal_relationships

#### 6.2 dev_api_merchants
- **Columns:** 35
- **Size:** 32 KB
- **Purpose:** External API merchant data synchronization
- **Critical Fields:** id, external_id, merchant_name

#### 6.3 dev_terminals
- **Columns:** 44
- **Size:** 24 KB
- **Purpose:** Terminal configuration and status
- **Critical Fields:** id, terminal_number, var_number, last_activity

#### 6.4 dev_api_terminals
- **Columns:** 60
- **Size:** 1,504 KB (table) / 552 KB (data)
- **Purpose:** External API terminal data with enriched metadata
- **Critical Fields:** id, terminal_id, merchant_id, terminal_status

#### 6.5 dev_sub_merchant_terminals
- **Columns:** 13
- **Size:** 64 KB
- **Purpose:** Sub-merchant to terminal relationship mapping
- **Critical Fields:** id, merchant_id, terminal_id

---

### Section 7: Transaction & ACH Processing

#### 7.1 dev_transactions
- **Columns:** 14
- **Size:** 48 KB
- **Purpose:** General transaction records
- **Critical Fields:** id, transaction_date, amount, merchant_id

#### 7.2 dev_api_achtransactions
- **Columns:** 13
- **Size:** 5,632 KB (table) / 3,648 KB (data)
- **Purpose:** ACH transaction processing and tracking
- **Critical Fields:** id, ach_date, amount, status, merchant_id

---

### Section 8: System Configuration & Caching

#### 8.1 dev_cache_configuration
- **Columns:** 20
- **Size:** 64 KB
- **Purpose:** Global cache behavior configuration
- **Critical Fields:** cache_key, cache_enabled, ttl_seconds

#### 8.2 dev_dashboard_cache
- **Columns:** 8
- **Size:** 112 KB (table) / 8 KB (data)
- **Purpose:** Pre-calculated dashboard metrics and KPIs
- **Critical Fields:** cache_key, cache_data, last_updated

#### 8.3 dev_charts_pre_cache
- **Columns:** 6
- **Size:** 16 KB
- **Purpose:** Pre-rendered chart data for instant loading
- **Critical Fields:** chart_id, chart_data, generated_at

#### 8.4 dev_duplicate_finder_cache
- **Columns:** 12
- **Size:** 32 KB
- **Purpose:** Duplicate detection results cache
- **Critical Fields:** hash_key, duplicate_ids, detected_at

#### 8.5 dev_system_settings
- **Columns:** 8
- **Size:** 48 KB
- **Purpose:** Application-wide configuration settings
- **Critical Fields:** setting_key, setting_value, updated_at

---

### Section 9: Merchant MCC Schema

#### 9.1 dev_merchant_mcc_schema
- **Columns:** 11
- **Size:** 120 KB (table) / 48 KB (data)
- **Purpose:** Dynamic MCC (Merchant Category Code) schema configuration for TSYS fields
- **Critical Fields:** mcc_code, schema_config, field_definitions

---

### Section 10: Logging & Audit Tables

#### 10.1 dev_audit_logs ⭐ MODIFIED OCT 2025
- **Columns:** 14
- **Size:** 208 KB (table) / 32 KB (data)
- **Row Count:** 75
- **Purpose:** Comprehensive audit trail for all system operations
- **Recent Changes:**
  - Added `file_metadata` (JSONB) for persistent file deletion metadata
  - Added `audit_logs_action_idx` index on action column
- **Critical Fields:** id, entity_type, entity_id, action, username, timestamp, file_metadata

#### 10.2 dev_system_logs
- **Columns:** 10
- **Size:** 11 MB (table) / 9,328 KB (data)
- **Purpose:** Application-level system event logging
- **Critical Fields:** id, log_level, message, timestamp

#### 10.3 dev_security_logs
- **Columns:** 17
- **Size:** 400 KB (table) / 288 KB (data)
- **Purpose:** Security event tracking (login attempts, access violations)
- **Critical Fields:** id, event_type, user_id, ip_address, timestamp

#### 10.4 dev_processing_timing_logs
- **Columns:** 11
- **Size:** 656 KB (table) / 544 KB (data)
- **Purpose:** File processing performance metrics
- **Critical Fields:** id, operation_name, duration_ms, timestamp

#### 10.5 dev_processing_metrics
- **Columns:** 56
- **Size:** 720 KB (table) / 576 KB (data)
- **Purpose:** Detailed processing pipeline metrics and statistics
- **Critical Fields:** id, metric_type, metric_value, recorded_at

---

### Section 11: User & Session Management

#### 11.1 dev_users
- **Columns:** 14
- **Size:** 64 KB
- **Purpose:** User accounts and authentication
- **Critical Fields:** id, username, email, password_hash

#### 11.2 dev_api_users
- **Columns:** 8
- **Size:** 32 KB
- **Purpose:** External API user synchronization
- **Critical Fields:** id, external_user_id, username

#### 11.3 dev_session
- **Columns:** 3
- **Size:** 280 KB (table) / 152 KB (data)
- **Purpose:** Express session storage for authentication
- **Critical Fields:** sid, sess, expire

---

### Section 12: Development & Testing

#### 12.1 dev_dev_uploads
- **Columns:** 10
- **Size:** 16 KB
- **Purpose:** Development environment file upload testing
- **Critical Fields:** id, filename, upload_date

---

## October 2025 Migration Impact Analysis

### Tables Requiring Schema Changes (2)

**1. dev_uploader_uploads**
- Action: ADD COLUMN deleted_at TIMESTAMP
- Action: ADD COLUMN deleted_by VARCHAR(255)
- Action: CREATE INDEX uploader_uploads_deleted_at_idx
- Risk: Low (nullable columns, no data migration)
- Impact: Enables soft-delete functionality

**2. dev_audit_logs**
- Action: ADD COLUMN file_metadata JSONB
- Action: CREATE INDEX audit_logs_action_idx
- Risk: Low (nullable column, performance improvement)
- Impact: Persistent file metadata in audit trail

### Tables Requiring Application Code Updates (4)

**1. dev_uploader_uploads**
- Backend filtering: Add WHERE clause to exclude deleted files
- Storage layer: Map deleted_at/deleted_by fields
- Routes: Implement soft-delete endpoint

**2. dev_audit_logs**
- Capture file metadata on deletion events
- Query optimization via action index

**3. dev_tddf_jsonb**
- Used by new heat map queries (no schema change)
- Enhanced merchant-terminal integration queries

**4. dev_api_terminals**
- Enrichment source for TDDF terminal data (no schema change)

### Tables Unaffected (45)

All remaining tables continue functioning without changes. No breaking changes to existing functionality.

---

## Production Deployment Prerequisites

### Schema Validation Checklist

Before deploying to production, verify:

- [ ] **All 49 dev_ tables exist** in production database
- [ ] **dev_uploader_uploads** does NOT have deleted_at/deleted_by columns yet
- [ ] **dev_audit_logs** does NOT have file_metadata column yet
- [ ] **Production table row counts** are reasonable (no excessive bloat)
- [ ] **No active file uploads** in progress during migration window

### Expected Post-Migration State

After successful deployment:

- [ ] **dev_uploader_uploads:** 80 columns (78 existing + 2 new)
- [ ] **dev_audit_logs:** 14 columns (13 existing + 1 new)
- [ ] **New indexes created:** 2 (uploader_uploads_deleted_at_idx, audit_logs_action_idx)
- [ ] **All existing data preserved:** Zero data loss
- [ ] **Application functionality:** Enhanced with soft-delete feature

---

## Appendix: Orphaned Tables (Archived)

The following 12 tables were archived on October 31, 2025 with `del_` prefix:

1. del_transactions (original transaction table)
2. del_tddf_cache_* (legacy cache tables)
3. del_old_upload_tables (superseded upload tracking)
4. ... (see DATABASE_CLEANUP_SUMMARY.md for complete list)

These tables are preserved in development for historical reference but should NOT be deployed to production.

---

## Document Control

**Created:** October 31, 2025  
**Last Updated:** October 31, 2025  
**Version:** 1.0  
**Author:** Alex (Replit Agent)  
**Purpose:** Production deployment schema reference

**Related Documents:**
- PRODUCTION_DEPLOYMENT_PACKAGE_OCT2025.md
- production-migration-oct2025.sql
- DEPLOYMENT_CHECKLIST_OCT2025.md
