
# TDDF API Plan 8-29 - Comprehensive Table and Field Specifications

## Planned New Tables for TDDF API System

### Core TDDF API Tables ✅ **ALREADY EXISTS**
- `tddf_api_schemas` - Schema definitions for TDDF file parsing ✅ **ALREADY EXISTS**
- `tddf_api_files` - Uploaded TDDF files and metadata ✅ **ALREADY EXISTS**
- `tddf_api_records` - Individual parsed records from TDDF files ✅ **ALREADY EXISTS**
- `tddf_api_keys` - API keys for authentication ✅ **ALREADY EXISTS**
- `tddf_api_request_logs` - API request logging ✅ **ALREADY EXISTS**
- `tddf_api_processing_queue` - File processing queue management ✅ **ALREADY EXISTS**
- `tddf_api_field_configs` - Field configuration management ✅ **ALREADY EXISTS**

### Merchant & Terminal Metadata Tables 🆕 **NEW TABLES NEEDED**
- `tddf_api_merchants` - Merchant metadata and enhanced information
- `tddf_api_terminals` - Terminal metadata and enhanced information

### Pre-Cache Tables for Performance 🆕 **PLANNED**
- `merchant_weekly_cache` - Weekly merchant data cache with filters
- `merchant_monthly_cache` - Monthly merchant data cache with filters
- `merchant_cache_metadata` - Cache build tracking and metadata

## Complete TDDF Field Specification

### Core Header Fields (All Record Types) - Positions 1-23
- `sequenceNumber` (1-7) - File position identifier
- `entryRunNumber` (8-13) - Entry run number  
- `sequenceWithinRun` (14-17) - Sequence within entry run
- `recordIdentifier` (18-19) - Record type (BH, DT, P1, P2, etc.)
- `bankNumber` (20-23) - Global Payments bank number

### Key Account & Merchant Fields
- `merchantAccountNumber` (24-39) - GP account number (16 chars)
- `associationNumber` (40-45) - Association ID (6 chars) ✅ **USER REQUESTED**
- `groupNumber` (46-51) - Group number (6 chars) ✅ **USER REQUESTED**
- `transactionCode` (52-55) - GP transaction code

### Critical DT Transaction Fields 📊 FROM DT RECORDS
- `referenceNumber` (62-84) - Reference number (23 chars)
- `transactionDate` (85-92) - Transaction date (MMDDCCYY)
- `transactionAmount` (93-103) - Transaction amount
- `netDeposit` (109-123) - Net deposit amount
- `cardholderAccountNumber` (124-142) - Cardholder account

### Authorization & Processing Fields 📊 FROM DT RECORDS
- `authAmount` (192-203) - Authorization amount
- `authResponseCode` (208-209) - Authorization response
- `posEntryMode` (214-215) - POS entry mode
- `debitCreditIndicator` (216) - Debit/Credit indicator
- `reversalFlag` (217) - Reversal flag
- `merchantName` (218-242) - DBA name (25 chars)
- `authorizationNumber` (243-248) - Authorization number
- `cardType` (253-254) - Card type code

### MCC and Terminal Info ✅ **USER REQUESTED**
- `mccCode` (273-276) - Merchant Category Code
- `terminalId` (277-284) - Terminal ID
- `transactionTypeIdentifier` (336-338) - Transaction Type Identifier ✅ **NEWLY ADDED**

### Data Integrity Fields (Critical)
- `sourceFileId` - Links to original uploaded file
- `sourceRowNumber` - Exact row position in original file
- `rawData` - Complete original record as JSONB
- `mmsRawLine` - Original line before processing
- `filename` - Original TDDF filename
- `processingTimestamp` - When record was processed

## Implementation Status Summary
- ✅ **7 Core TDDF API tables already exist** (from schema.ts review)
- 🆕 **2 New metadata tables needed**: `tddf_api_merchants` and `tddf_api_terminals`
- 🆕 **3 New cache tables planned** for performance optimization
- 📊 **Complete TDDF field specification** ready for implementation

## Data Flow Architecture
1. **Upload**: Files uploaded to `tddf_api_files`
2. **Parse**: Records extracted to `tddf_api_records` with full field mapping
3. **Enhance**: Merchant/Terminal metadata populated in respective tables
4. **Cache**: Pre-computed aggregations stored for performance
5. **Integrity**: Complete traceability maintained through raw data storage

## Key Features
- Complete field position mapping from TDDF specification
- Environment-aware table separation (dev_ prefixes)
- Full data lineage tracking
- Performance-optimized caching strategy
- API security through key management
- Request logging and monitoring

*Generated: January 29, 2025*
*Status: Ready for implementation of new metadata tables*
