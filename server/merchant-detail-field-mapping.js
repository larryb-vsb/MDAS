// Merchant Detail Field Mapping
// Maps DACQ_MER_DTL tab-delimited fields to database columns
// Based on MMS schema configuration table

export const MERCHANT_DETAIL_FIELD_MAP = [
  // Index 0: Bank Number (1-4)
  { index: 0, mmsField: 'Bank Number', dbColumn: 'agent_bank_number', parser: (v) => v?.trim() || null },
  
  // Index 1: Group (Level 1) (6-11)
  { index: 1, mmsField: 'Group (Level 1)', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 2: Association Number (13-18)
  { index: 2, mmsField: 'Association Number', dbColumn: 'association', parser: (v) => v?.trim() || null },
  
  // Index 3: Account Number/Client MID (20-35)
  { index: 3, mmsField: 'Account Number', dbColumn: 'client_mid', parser: (v) => v?.trim() || null },
  
  // Index 4: Association Name (37-76)
  { index: 4, mmsField: 'Association Name', dbColumn: 'legal_name', parser: (v) => v?.trim() || null },
  
  // Index 5: Group Level 1 Name (78-117)
  { index: 5, mmsField: 'Group Level 1 Name', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 6: SIC (119-122)
  { index: 6, mmsField: 'SIC', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 7: CLASS/MCC (124-127)
  { index: 7, mmsField: 'CLASS', dbColumn: 'mcc', parser: (v) => v?.trim() || null },
  
  // Index 8: DBA Name (129-153)
  { index: 8, mmsField: 'DBA Name', dbColumn: 'dba_name', parser: (v) => v?.trim() || null },
  
  // Index 9: DBA Address City (155-167)
  { index: 9, mmsField: 'DBA Address City', dbColumn: 'city', parser: (v) => v?.trim() || null },
  
  // Index 10: DBA Address State (169-170)
  { index: 10, mmsField: 'DBA Address State', dbColumn: 'state', parser: (v) => v?.trim() || null },
  
  // Index 11: DBA Zip (172-180)
  { index: 11, mmsField: 'DBA Zip', dbColumn: 'zip_code', parser: (v) => v?.trim() || null },
  
  // Index 12: Phone 1 (182-191)
  { index: 12, mmsField: 'Phone 1', dbColumn: 'phone', parser: (v) => v?.trim() || null },
  
  // Index 13: Phone 2 (193-202)
  { index: 13, mmsField: 'Phone 2', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 14: Business License (204-213)
  { index: 14, mmsField: 'Business License', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 15: Bank Officer 1 (215-218)
  { index: 15, mmsField: 'Bank Officer 1', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 16: Bank Officer 2 (220-223)
  { index: 16, mmsField: 'Bank Officer 2', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 17: Federal Tax ID (235-243)
  { index: 17, mmsField: 'Federal Tax ID', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 18: State Tax ID (245-253)
  { index: 18, mmsField: 'State Tax ID', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 19: Merchant Type (377)
  { index: 19, mmsField: 'Merchant Type', dbColumn: 'merchant_type', parser: (v) => '0' }, // Always '0' for DACQ files
  
  // Index 20: Owner Name (395-419)
  { index: 20, mmsField: 'Owner Name', dbColumn: null, parser: (v) => v?.trim() || null }, // No db column
  
  // Index 21: Manager Name (421-445)
  { index: 21, mmsField: 'Manager Name', dbColumn: 'contact_person', parser: (v) => v?.trim() || null },
  
  // Index 22: Last Activity Date (720-729)
  { index: 22, mmsField: 'Last Activity Date', dbColumn: null, parser: parseDate },
  
  // Index 23: Daily Fee Indicator (731)
  { index: 23, mmsField: 'Daily Fee Indicator', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 24: MC Reg ID (733-735)
  { index: 24, mmsField: 'MC Reg ID', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 25: Customer Service Number (737-746)
  { index: 25, mmsField: 'Customer Service Number', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 26: Update Date Time (748-766)
  { index: 26, mmsField: 'Update Date Time', dbColumn: 'edit_date', parser: parseDateTime },
  
  // Index 27: Status Change Date (768-777)
  { index: 27, mmsField: 'Status Change Date', dbColumn: null, parser: parseDate },
  
  // Index 28: Discover MAP Flag (779)
  { index: 28, mmsField: 'Discover MAP Flag', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 29: Amex OptBlue Flag (781)
  { index: 29, mmsField: 'Amex OptBlue Flag', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 30: Visa Descriptor (792-816)
  { index: 30, mmsField: 'Visa Descriptor', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 31: MC Descriptor (818-842)
  { index: 31, mmsField: 'MC Descriptor', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 32: URL (844-883)
  { index: 32, mmsField: 'URL', dbColumn: 'website', parser: (v) => v?.trim() || null },
  
  // Index 33: Close Date (885-894)
  { index: 33, mmsField: 'Close Date', dbColumn: null, parser: parseDate },
  
  // Index 34: Date of Last Auth (896-905)
  { index: 34, mmsField: 'Date of Last Auth', dbColumn: null, parser: parseDate },
  
  // Index 35: DUNS Number (907-921)
  { index: 35, mmsField: 'DUNS Number', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 36: Print Statement Indicator (931)
  { index: 36, mmsField: 'Print Statement Indicator', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 37: Visa BIN (933-938)
  { index: 37, mmsField: 'Visa BIN', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 38: MC BIN (940-945)
  { index: 38, mmsField: 'MC BIN', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 39: MC ICA (947-952)
  { index: 39, mmsField: 'MC ICA', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 40: Amex CAP ID (954-965)
  { index: 40, mmsField: 'Amex CAP ID', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 41: Discover AIID (967-977)
  { index: 41, mmsField: 'Discover AIID', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 42: DDA Number (979-995)
  { index: 42, mmsField: 'DDA Number', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 43: Transit Routing Number (997-1005)
  { index: 43, mmsField: 'Transit Routing Number', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 44: Exposure Amount (1009-1016)
  { index: 44, mmsField: 'Exposure Amount', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 45: Merchant Activation Date (1018-1027)
  { index: 45, mmsField: 'Merchant Activation Date', dbColumn: 'client_since_date', parser: parseYYYYMMDD },
  
  // Index 46: Date of First Deposit (1029-1038)
  { index: 46, mmsField: 'Date of First Deposit', dbColumn: null, parser: parseYYYYMMDD },
  
  // Index 47: Date of Last Deposit (1040-1049)
  { index: 47, mmsField: 'Date of Last Deposit', dbColumn: null, parser: parseYYYYMMDD },
  
  // Index 48: Trans Destination (1051)
  { index: 48, mmsField: 'Trans Destination', dbColumn: null, parser: (v) => v?.trim() || null },
  
  // Index 49: Merchant Email Address (1056-1127)
  { index: 49, mmsField: 'Merchant Email Address', dbColumn: 'email', parser: (v) => v?.trim() || null },
  
  // Index 50: Chargeback Email Address (1129-1200)
  { index: 50, mmsField: 'Chargeback Email Address', dbColumn: null, parser: (v) => v?.trim() || null },
];

// Date parsing helpers
function parseDate(dateString) {
  if (!dateString || dateString.trim() === '' || dateString === '99/99/9999' || dateString === '00/00/0000') {
    return null;
  }
  
  try {
    if (dateString.includes('/')) {
      const [month, day, year] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    }
    if (dateString.includes('-')) {
      return new Date(dateString);
    }
    return null;
  } catch (error) {
    return null;
  }
}

function parseYYYYMMDD(dateString) {
  if (!dateString || dateString.trim() === '' || dateString === '9999/99/99' || dateString === '0000/00/00') {
    return null;
  }
  
  try {
    // YYYY/MM/DD format
    if (dateString.includes('/')) {
      const [year, month, day] = dateString.split('/');
      return new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    }
    return null;
  } catch (error) {
    return null;
  }
}

function parseDateTime(dateTimeString) {
  if (!dateTimeString || dateTimeString.trim() === '') {
    return null;
  }
  
  try {
    // YYYY-MM-DD HH:MM:SS format
    return new Date(dateTimeString);
  } catch (error) {
    return null;
  }
}

// Extract merchant data from tab-delimited fields
export function extractMerchantData(fields) {
  const merchantData = {
    // Use Association Number (index 2) as the merchant ID - this is the unique merchant identifier
    id: fields[2]?.trim() || null,
    
    // DBA Name as the merchant name
    name: fields[8]?.trim() || 'Unknown Merchant',
    
    // REQUIRED: Always set merchant_type to '0' for DACQ_MER_DTL files
    merchantType: '0',
    
    // Set status based on presence of data
    status: 'Active'
  };
  
  // Extract all MMS-enabled fields
  for (const mapping of MERCHANT_DETAIL_FIELD_MAP) {
    if (mapping.dbColumn && mapping.index < fields.length) {
      const value = mapping.parser(fields[mapping.index]);
      if (value !== null) {
        // Convert dbColumn snake_case to camelCase for storage function
        const camelCaseKey = snakeToCamel(mapping.dbColumn);
        merchantData[camelCaseKey] = value;
      }
    }
  }
  
  // Store additional MMS fields in metadata JSONB
  const metadata = {};
  for (const mapping of MERCHANT_DETAIL_FIELD_MAP) {
    if (!mapping.dbColumn && mapping.index < fields.length) {
      const value = mapping.parser(fields[mapping.index]);
      if (value !== null) {
        metadata[mapping.mmsField] = value;
      }
    }
  }
  
  if (Object.keys(metadata).length > 0) {
    merchantData.metadata = metadata;
  }
  
  return merchantData;
}

// Helper: Convert snake_case to camelCase
function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
}
