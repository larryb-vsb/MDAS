# Production Database Upgrade Script
## Version: 7 November 2025

## Purpose
This SQL script synchronizes the production database with the development schema, ensuring all tables, indexes, and constraints are properly deployed.

## Known Issues Fixed
1. **Auto 7 Switch** - Missing `dev_system_settings` table
2. **Monitoring Tab** - Missing `dev_tddf_api_request_logs` and related indexes
3. **TDDF Cache Tables** - All pre-cache tables for performance
4. **Performance Indexes** - Complete set of indexes for optimal query performance

## Script Statistics
- **Total Tables**: 65
- **Total Indexes**: 129
- **Total Lines**: 1,303
- **Type**: Idempotent (safe to re-run)

## Key Tables Included

### System & Configuration
- `dev_system_settings` - System configuration and automation settings
- `dev_cache_configuration` - Cache management
- `dev_dashboard_cache` - Dashboard data caching

### Monitoring & Logging
- `dev_tddf_api_request_logs` - API request tracking (fixes Monitoring tab)
- `dev_connection_log` - Connection logging
- `dev_security_logs` - Security event logging
- `dev_system_logs` - System event logging
- `dev_audit_logs` - Audit trail

### User & Security
- `dev_users` - User accounts
- `dev_api_users` - API user management
- `dev_tddf_api_keys` - API key management
- `dev_host_approvals` - Host approval system
- `dev_ip_blocklist` - IP blocking

### Merchants & Terminals
- `dev_merchants` - Main merchant table
- `dev_api_merchants` - API merchant data
- `dev_terminals` - Terminal management
- `dev_api_terminals` - API terminal data (with last_activity_date)
- `dev_sub_merchant_terminals` - Sub-merchant relationships

### TDDF Processing
- `dev_tddf_jsonb` - Main TDDF records (JSONB format)
- `dev_tddf_records` - Legacy TDDF records
- `dev_tddf_batch_headers` - Batch header data
- `dev_tddf_other_records` - Other record types
- `dev_tddf_purchasing_extensions` - Purchasing extensions
- `dev_tddf_raw_import` - Raw import data

### TDDF API System
- `dev_tddf_api_schemas` - API schema definitions
- `dev_tddf_api_files` - File tracking
- `dev_tddf_api_queue` - Processing queue
- `dev_tddf_api_records` - API records

### File Upload & Processing
- `dev_uploaded_files` - File upload tracking
- `dev_uploader_uploads` - Uploader system files
- `dev_uploader_tddf_jsonb_records` - Uploader TDDF records
- `dev_uploader_json` - JSON uploads
- `dev_uploader_mastercard_di_edit_records` - Mastercard records

### Caching & Performance
- `dev_dashboard_cache` - Dashboard metrics cache
- `dev_charts_pre_cache` - Charts data pre-cache
- `dev_tddf1_merchants` - Merchant cache
- `dev_tddf1_monthly_cache` - Monthly aggregation cache
- `dev_tddf1_activity_cache` - Activity cache
- `dev_tddf1_totals` - Totals cache
- `dev_tddf_json_record_type_counts_pre_cache` - Record type counts
- `dev_tddf_object_totals_cache_2025` - Object totals cache

### Transactions
- `dev_transactions` - Transaction records
- `dev_api_achtransactions` - ACH transactions

### Processing Metrics
- `dev_processing_metrics` - Processing performance metrics
- `dev_processing_timing_logs` - Timing logs

### Archive & Data Management
- `dev_tddf_archive` - Archived TDDF files
- `dev_tddf_archive_records` - Archived records
- `dev_tddf_datamaster` - Data master
- `dev_tddf_import_log` - Import logging
- `dev_master_object_keys` - Object storage key management
- `dev_duplicate_finder_cache` - Duplicate detection cache

### Backup & System Management
- `backup_schedules` - Backup scheduling
- `backup_history` - Backup execution history
- `schema_versions` - Schema version tracking
- `schema_content` - Schema definitions
- `dev_session` - Express session storage

### Configuration
- `dev_merchant_mcc_schema` - MCC schema configuration
- `merchant_mcc_schema` - Production MCC schema

## How to Use

### 1. Backup Production Database First
```bash
# Always backup before running migrations
pg_dump -h <prod_host> -U <prod_user> -d <prod_db> > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Run the Script
```bash
# Method 1: Using psql directly
psql -h <prod_host> -U <prod_user> -d <prod_db> -f dbupdate7Nov2025.sql

# Method 2: Using stdin
cat dbupdate7Nov2025.sql | psql -h <prod_host> -U <prod_user> -d <prod_db>

# Method 3: With output logging
psql -h <prod_host> -U <prod_user> -d <prod_db> -f dbupdate7Nov2025.sql 2>&1 | tee migration_log_$(date +%Y%m%d_%H%M%S).log
```

### 3. Verify Execution
The script includes verification queries that will output:
- Total number of `dev_*` tables created
- Total number of indexes created
- Completion message with summary

### 4. Post-Migration Checks
```sql
-- Check if critical tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'dev_system_settings',
    'dev_tddf_api_request_logs',
    'dev_connection_log'
  );

-- Check if indexes were created
SELECT tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND tablename = 'dev_tddf_api_request_logs';

-- Verify table counts
SELECT 
  COUNT(*) FILTER (WHERE table_name LIKE 'dev_%') as dev_tables,
  COUNT(*) as total_tables
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';
```

## Safety Features

### Idempotent Design
- Uses `CREATE TABLE IF NOT EXISTS` for all tables
- Uses `CREATE INDEX IF NOT EXISTS` for all indexes
- Safe to re-run multiple times without errors
- Will NOT drop or modify existing data

### Production-Safe JSONB Indexes
The script includes special handling for JSONB numeric indexes to prevent crashes on existing data:
- **batchDepositAmount index**: Uses partial index with WHERE clause to filter out null, empty, and non-numeric values
- Regex validation (`^[0-9]+\.?[0-9]*$`) ensures only valid numeric strings are indexed
- NULLIF wrapper handles edge cases gracefully
- This prevents the common "invalid input syntax for type numeric" error on legacy data

### Dependency Handling
Tables are created in proper dependency order:
1. Core system tables first
2. User and security tables
3. Merchant and terminal tables
4. TDDF processing tables
5. Cache tables
6. Backup and management tables

### No Data Loss
- Only creates missing elements
- Does NOT modify existing tables
- Does NOT delete any data
- Does NOT alter existing columns

## Expected Output
When run successfully, you should see:
```
NOTICE:  Total dev_ tables created: 65
NOTICE:  Total indexes created on dev_ tables: 129
NOTICE:  ============================================================
NOTICE:  Production Database Upgrade Complete!
NOTICE:  Version: 7 Nov 2025
NOTICE:  ============================================================
NOTICE:  Key Tables Added:
NOTICE:    ✓ dev_system_settings (Auto 7 switch fix)
NOTICE:    ✓ dev_tddf_api_request_logs (Monitoring tab fix)
NOTICE:    ✓ All TDDF processing tables
NOTICE:    ✓ All cache tables
NOTICE:    ✓ All monitoring and logging tables
NOTICE:    ✓ All indexes for performance
NOTICE:  ============================================================
NOTICE:  This script is IDEMPOTENT - safe to re-run if needed.
NOTICE:  ============================================================
```

## Troubleshooting

### Permission Errors
If you get permission errors:
```bash
# Ensure user has CREATE privileges
GRANT CREATE ON DATABASE <db_name> TO <user>;
GRANT USAGE ON SCHEMA public TO <user>;
```

### Connection Issues
```bash
# Test connection first
psql -h <prod_host> -U <prod_user> -d <prod_db> -c "SELECT version();"
```

### Check Existing Tables
```sql
-- See what's already in production
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

## Post-Deployment Verification

### 1. Test Auto 7 Switch
- Navigate to system settings
- Check if Auto 7 toggle works
- Verify settings are persisted to `dev_system_settings`

### 2. Test Monitoring Tab
- Navigate to TDDF API → Monitoring tab
- Should now display request logs
- Check for API request history

### 3. Verify Cache Tables
```sql
-- Check cache tables exist and are being populated
SELECT COUNT(*) FROM dev_dashboard_cache;
SELECT COUNT(*) FROM dev_tddf1_totals;
SELECT COUNT(*) FROM dev_charts_pre_cache;
```

### 4. Check Performance
```sql
-- Verify indexes are being used
EXPLAIN ANALYZE 
SELECT * FROM dev_tddf_jsonb 
WHERE business_day = '2025-01-15' 
  AND record_type = 'DT';
```

## Maintenance

### Re-running the Script
The script can be safely re-run if:
- New tables added to development
- Indexes missing in production
- After any schema updates

### Keeping in Sync
To keep production in sync with development:
1. Extract latest dev schema
2. Update this script with new tables/indexes
3. Re-run on production

## Support
If you encounter any issues:
1. Check the migration log file
2. Verify database connection and permissions
3. Ensure PostgreSQL version compatibility (11+)
4. Review the error messages in detail

## Version History
- **7 Nov 2025**: Initial comprehensive migration
  - 65 tables
  - 129 indexes
  - Auto 7 switch fix
  - Monitoring tab fix
  - All cache tables
