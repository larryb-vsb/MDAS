# TDDF (Transaction Data Detail File) Specification Reference

## Overview
This document serves as a quick reference for the TDDF specification used in the Merchant Management System (MMS). The complete specification documents are stored in the `tddf_documentation/` directory.

## Specification Files (Extracted August 1, 2025)
- **Primary Reference**: `m_trans_process_rules_en-us-2025-06-10.pdf` (English, US)
- **CVM Limits**: `CVM_Limits_2025_20_May_2025.xlsx` (Excel format)
- **Additional Languages**:
  - French (Canada): `mc_trans_process_rules_fr-ca.pdf`
  - Spanish (Latin America): `m_trans_process_rules_es-la.pdf`
  - Chinese: `mc_trans_process_rules_7Jan2025_zh-cn.pdf`
  - Portuguese (Brazil): `m_trans_process_rules_pt-br.pdf`

## TDDF Record Types (Based on Implementation Analysis)

### Core Record Types
- **BH** - Batch Header: Contains batch-level information including entry run numbers, merchant accounts, net deposits
- **DT** - Detail Transaction: Individual transaction records with amounts, dates, card types, reference numbers
- **G2** - General Data 2 (Geographic): Location and merchant information including city, state, ZIP, category codes

### Additional Record Types
- **P1** - Purchasing Card 1: Primary purchasing card extension data
- **P2** - Purchasing Card 2: Secondary purchasing card extension data
- **E1** - Electronic Check: Electronic check transaction data
- **AD** - Adjustment: Transaction adjustment records
- **DR** - Direct Marketing: Direct marketing transaction data
- **CK** - Check: Check transaction records
- **LG** - Lodge: Lodge/hospitality specific data
- **GE** - General Extension: General extension records

## Record Relationships (TDDF Specification)

### BH → DT Relationships
- **Shared Identifiers**: Entry Run Number + Merchant Account Number
- **Sequential Positioning**: DT records follow BH records in file sequence
- **Validation**: BH net deposit should match sum of related DT transaction amounts

### BH → G2 Relationships  
- **Shared Identifiers**: Merchant Account Number + Bank Number
- **Sequential Positioning**: G2 records appear within the same batch grouping
- **Purpose**: Provides geographic/location data for merchants in the batch

### Enhanced Batch Processing (BH → DT → G2)
The system now supports comprehensive batch relationship analysis showing:
1. Batch Header (BH) with deposit totals and merchant identification
2. Related Detail Transactions (DT) with individual transaction data
3. Geographic Records (G2) with merchant location and category information

## Field Mapping Insights

### Common BH Fields
- `entryRunNumber` / `batchId`: Batch identifier
- `merchantAccountNumber`: Merchant account identifier
- `netDeposit`: Total batch deposit amount
- `batchDate`: Processing date
- `bankNumber`: Bank routing identifier

### Common DT Fields
- `transactionAmount`: Individual transaction amount
- `transactionDate`: Transaction processing date
- `cardType`: Card brand (VI=Visa, MC=MasterCard, AX=Amex, DI=Discover)
- `referenceNumber`: Transaction reference identifier
- `merchantName`: Merchant name from transaction

### Common G2 Fields
- `merchantName`: Merchant business name
- `merchantCity`: Merchant city location
- `merchantState`: Merchant state/province
- `merchantZip`: Merchant postal code
- `merchantCountry`: Merchant country code
- `merchantCategoryCode`: MCC (Merchant Category Code)
- `geographicCode`: Geographic region identifier

## Implementation Status in MMS

### ✅ Completed Features
- **TDDF Record Processing**: All record types supported with field extraction
- **Batch Relationships**: BH → DT → G2 comprehensive relationships
- **Pre-Cache System**: Optimized queries with "never expire" caching
- **Frontend Display**: Enhanced UI showing all relationship types
- **Field Validation**: TDDF compliance checking and validation badges
- **Geographic Integration**: G2 records properly joined and displayed

### 🔧 System Architecture Integration
- **Database Schema**: Proper TDDF record storage in `dev_tddf_jsonb` table
- **Cache Tables**: Dedicated pre-cache tables for performance optimization  
- **API Endpoints**: RESTful endpoints for batch relationship queries
- **UI Components**: React components with TDDF-aware field display

## Reference Documentation Location
All official TDDF specification documents are stored in:
```
./tddf_documentation/
├── m_trans_process_rules_en-us-2025-06-10.pdf    (Primary English spec)
├── CVM_Limits_2025_20_May_2025.xlsx              (CVM limits reference)
├── mc_trans_process_rules_fr-ca.pdf              (French specification)
├── m_trans_process_rules_es-la.pdf               (Spanish specification)
├── mc_trans_process_rules_7Jan2025_zh-cn.pdf     (Chinese specification)
└── m_trans_process_rules_pt-br.pdf               (Portuguese specification)
```

## Next Steps for Enhanced TDDF Support
1. **Advanced Relationship Analysis**: Cross-reference P1/P2 with DT records
2. **Field Mapping Enhancement**: Expand field extraction based on full spec review
3. **Validation Rules**: Implement additional TDDF compliance validations
4. **Performance Optimization**: Enhanced pre-cache for complex relationships

---
*Last Updated: August 1, 2025*
*TDDF Specification Version: 2025-06-10 (English US)*