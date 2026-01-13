/**
 * Field mapping configuration for CSV file imports
 * Maps CSV column names to database field names
 */

// Transaction code mappings
export const transactionCodeMapping = {
  "22": "Credit", // Code 22 represents a Credit (money into account)
  "27": "Debit"   // Code 27 represents a Debit (money out of account)
};

export const merchantFieldMappings = {
  // Database field: CSV field name
  id: "ClientMID", // Use ClientMID as our primary merchant ID
  name: "ClientLegalName",
  clientMID: "ClientNum", // Map to clientMID - FIXED to match VSB format
  otherClientNumber1: "ClientNum", // Also map ClientNum here for backup
  otherClientNumber2: "MID2", // Parent MID from CSV
  status: "Status", // Merchant status field (Open = Active, Delete = Inactive)
  merchantType: "Mtype", // Merchant Type field (numeric: 1=Online, 2=Retail, 3=Mixed, 4=B2B, 5=Wholesale)
  association: "Association", // Business association field
  mcc: "MCC", // Merchant Category Code
  masterMID: "POS Merchant #", // Master Merchant ID from TSYS (POS Merchant # field)
  address: "ClientPAddr1", // FIXED to match VSB format
  city: "ClientPAddr2", // Use ClientPAddr2 for city since VSB format splits address
  state: "ClientState", // FIXED to match VSB format
  zipCode: "ClientPAddr7", // Use ClientPAddr7 for zip code
  country: "ClientPAddr6", // Use ClientPAddr6 for country
  category: null, // Default in code
  clientSinceDate: "ClientSinceDate",
  asOfDate: "AsOfDate" // Date from demographic import file
};

// Alternative field mappings for headers with spaces
export const merchantFieldMappingsAlt = {
  id: "Client ID",
  name: "Client Legal Name",
  clientMID: "Client MID",
  otherClientNumber2: "Parent MID", // Alternative header name for Parent MID
  address: "Client Primary Address",
  city: "Client City", 
  state: "Client State",
  zipCode: "Client Zip Code",
  asOfDate: "As Of Date"
};

/**
 * Trace number to unique transaction ID mapping utility
 * Handles duplicate trace numbers by incrementing
 */
export class TraceNumberMapper {
  private static traceCounter: Map<string, number> = new Map();
  
  /**
   * Maps a trace number to a unique transaction ID
   * For duplicates, appends increment counter (trace-1, trace-2, etc.)
   */
  static generateTransactionId(traceNumber: string | null): string {
    if (!traceNumber) {
      // Generate a fallback ID if no trace number
      return `txn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Clean trace number (remove any non-alphanumeric characters)
    const cleanTrace = traceNumber.toString().replace(/[^a-zA-Z0-9]/g, '');
    
    // Check if we've seen this trace number before
    if (this.traceCounter.has(cleanTrace)) {
      // Increment counter for this trace number
      const currentCount = this.traceCounter.get(cleanTrace)! + 1;
      this.traceCounter.set(cleanTrace, currentCount);
      return `${cleanTrace}-${currentCount}`;
    } else {
      // First time seeing this trace number
      this.traceCounter.set(cleanTrace, 0);
      return cleanTrace;
    }
  }
  
  /**
   * Reset the counter (useful for testing or new file processing sessions)
   */
  static resetCounter(): void {
    this.traceCounter.clear();
  }
  
  /**
   * Get current mapping statistics
   */
  static getStats(): { totalUniqueTraces: number; duplicatesFound: number } {
    let duplicatesFound = 0;
    for (const count of this.traceCounter.values()) {
      if (count > 0) duplicatesFound++;
    }
    
    return {
      totalUniqueTraces: this.traceCounter.size,
      duplicatesFound
    };
  }
}

export const transactionFieldMappings = {
  // Database field: CSV field name (standard format)
  id: "TransactionID",
  merchantId: "MerchantID", // Field that links to merchant table
  amount: "Amount",
  date: "Date",
  type: "Type",
  traceNumber: "TraceNbr" // Maps to trace number field
};

// Alternative transaction field mappings for headers with spaces
export const transactionFieldMappingsAlt = {
  id: "Transaction ID",
  merchantId: "Merchant ID",
  clientId: "Client ID",
  amount: "Amount",
  date: "Transaction Date",
  type: "Transaction Type",
  description: "Description"
};

// Alternate transaction field mappings for different file formats
export const alternateTransactionMappings = {
  // New format with Name,Account,Amount,Date,Code,Descr,TraceNbr
  format1: {
    id: "TraceNbr", // Use TraceNbr as transaction ID if available
    merchantId: "Account", // Using Account as the merchant identifier
    amount: "Amount",
    date: "Date",
    type: "Code", // Using Code as transaction type
    description: "Descr", // Additional field for description
    merchantName: "Name" // Name of merchant
  },
  
  // TDDF (Transaction Daily Detail File) format - fixed-width banking format
  tddf: {
    txnId: "TXN_ID",
    merchantId: "MERCHANT_ID", 
    merchantName: "MERCHANT_NAME",
    txnAmount: "TXN_AMOUNT",
    txnDate: "TXN_DATE",
    txnType: "TXN_TYPE",
    txnDesc: "TXN_DESC",
    batchId: "BATCH_ID",
    authCode: "AUTH_CODE",
    cardType: "CARD_TYPE",
    entryMethod: "ENTRY_METHOD",
    responseCode: "RESPONSE_CODE"
  }
};

// Terminal field mappings for TSYS export (July 2025 format)
export const terminalFieldMappings: Record<string, string | null> = {
  vNumber: "V Number", // VAR Number from TSYS (unique identifier) 
  posMerchantNumber: "POS Mc", // EXACT header from TSYS CSV (July format)
  // Additional fields from CSV screenshot - EXACT HEADERS
  dbaName: "DBA Name",
  dailyAuth: "Daily Auth Count", // EXACT header 
  dialPay: "Dial Pay Passcode", // EXACT header
  mcc: "Terminal Visa MCC", // EXACT header from TSYS CSV - contains actual MCC codes
  recordStatus: "Record", // EXACT header from TSYS CSV (July format) - shows Closed/FS/Open
  boardDate: "Board Date",
  terminalVisa: "Terminal Visa MCC", // EXACT header
  bin: "BIN", // Bank Identification Number
  encryption: "Encryption", // Payment encryption settings
  ssl: "SSL", // SSL security configuration  
  tokenization: "Tokenization", // Tokenization settings
  agent: "Agent", // Agent information
  chain: "Chain", // Chain store identifier
  store: "Store", // Store number
  terminalInfo: "Terminal Info", // Terminal information field
  
  // Extended fields from comprehensive specification (if available in CSV)
  bankNumber: "Bank Number", // Bank identification
  associationNumber1: "Association Number 1", // Association mapping
  transactionCode: "Transaction Code", // Processing codes
  authSource: "Auth Source", // Authorization source
  networkIdentifierDebit: "Network Identifier Debit", // Network routing
  posEntryMode: "POS Entry Mode", // Entry method
  authResponseCode: "Auth Response Code", // Response handling
  validationCode: "Validation Code", // Transaction validation
  catIndicator: "CAT Indicator", // Cardholder authentication
  onlineEntry: "Online Entry", // Online processing capability
  achFlag: "ACH Flag", // ACH capability
  cardholderIdMethod: "Cardholder ID Method", // ID verification method
  terminalId: "Terminal #", // Terminal # from CSV (July format) maps to Terminal ID
  discoverPosEntryMode: "Discover POS Entry Mode", // Discover network entry
  purchaseId: "Purchase ID", // Purchase identification
  posDataCode: "POS Data Code", // POS configuration code
  termNumber: "Term Number", // Alternative terminal number field
  
  // Additional fields not directly from TSYS but managed internally
  terminalType: null, // Will be set during processing
  status: null, // Managed internally
  location: null, // Internal field
  installationDate: null, // Internal field
  lastActivity: null, // Internal field
  
  // Local database-only fields (not from external systems)
  mType: null, // Local merchant type information - database only
  mLocation: null, // Local location information - database only
  hardwareModel: null, // Internal field
  manufacturer: null, // Internal field
  firmwareVersion: null, // Internal field
  networkType: null, // Internal field
  ipAddress: null, // Internal field
  genericField2: null, // Generic field for custom use
  description: null, // Internal field
  notes: null, // Internal field
  internalNotes: null, // Internal field
};

// Alternative terminal field mappings for TSYS export (Oct 2025 format)
export const terminalFieldMappingsAlt: Record<string, string | null> = {
  vNumber: "V Number", // VAR Number from TSYS (unique identifier)
  posMerchantNumber: "POS Merc", // Oct 2025 format uses "POS Merc" instead of "POS Mc"
  dbaName: "DBA Name",
  dailyAuth: "Daily Auth", // Shortened in Oct format
  dialPay: "Dial Pay P", // Shortened in Oct format
  mcc: "Terminal Visa MCC",
  recordStatus: "Merchant Record St", // Oct 2025 format uses full "Merchant Record St" instead of "Record"
  boardDate: "Board Date",
  terminalVisa: "Terminal Visa MCC",
  bin: "BIN",
  encryption: "Encryption",
  ssl: "SSL",
  tokenization: "Tokenization",
  agent: "Agent",
  chain: "Chain",
  store: "Store",
  terminalId: "Terminal", // Oct 2025 format uses "Terminal" instead of "Terminal #"
  termNumber: "Term Number",
  
  // PPR MCC field specific to Oct format
  pprMcc: "PPR MCC", // Additional MCC field in Oct format
  
  // Fields not directly mapped (internal only)
  terminalType: null,
  status: null,
  location: null,
  installationDate: null,
  lastActivity: null,
  mType: null,
  mLocation: null,
  hardwareModel: null,
  manufacturer: null,
  firmwareVersion: null,
  networkType: null,
  ipAddress: null,
  genericField2: null,
  description: null,
  notes: null,
  internalNotes: null,
};

// Customizable default values for fields not found in CSV
export const defaultMerchantValues = {
  status: "Active/Open", // Default status matches dashboard filter
  category: "Retail",
  country: "US",
  address: "123 Business St" // Default if not provided
};

// CSV header variations that might occur in different files
export const merchantIdAliases = [
  "ClientMID", // Primary merchant ID for VSB files
  "ClientNum", // Alternative merchant ID for VSB files 
  "ClientNumber", // Legacy format
  "MerchantID", 
  "Merchant_ID", 
  "ClientID"
];

export const transactionMerchantIdAliases = [
  "MerchantID", 
  "Merchant_ID", 
  "ClientMID", 
  "ClientID",
  "Account" // Adding Account as merchant ID for new format
];

/**
 * Relationship mapping between merchant and transaction fields
 * This is used to match transactions to merchants when processing files
 */
export const relationshipMapping = {
  // How merchant ID appears in transaction files
  merchantIdInTransactions: "MerchantID",
  // How merchant ID is stored in the merchants table
  merchantIdInDatabase: "id",
};

// Valid merchant type mappings (numeric values as per demographics CSV)
export const merchantTypeMapping = {
  "1": "Online",
  "2": "Retail", 
  "3": "Mixed",
  "4": "B2B", 
  "5": "Wholesale",
  "6": "Service",
  "7": "Manufacturing",
  "8": "Restaurant/Food",
  "9": "Healthcare",
  "10": "Professional Services"
};

// Validate and normalize merchant type to numeric value
export function normalizeMerchantType(value: any): string | null {
  if (!value) return null;
  
  const strValue = value.toString().trim();
  
  // If already numeric and valid
  if (merchantTypeMapping[strValue as keyof typeof merchantTypeMapping]) {
    return strValue;
  }
  
  // Try to match text values to numeric codes
  const textToNumeric: Record<string, string> = {
    "online": "1",
    "retail": "2", 
    "mixed": "3",
    "b2b": "4",
    "wholesale": "5"
  };
  
  const lowerValue = strValue.toLowerCase();
  if (textToNumeric[lowerValue]) {
    return textToNumeric[lowerValue];
  }
  
  // Return original if numeric but unknown (will be handled as custom)
  if (/^\d+$/.test(strValue)) {
    return strValue;
  }
  
  return null; // Invalid value
}

// Find a merchant ID in a CSV record, trying various possible column names
export function findMerchantId(record: Record<string, any>, aliases: string[]): string | null {
  for (const alias of aliases) {
    if (record[alias] && (typeof record[alias] === 'string' || typeof record[alias] === 'number')) {
      return record[alias].toString();
    }
  }
  return null;
}

// Fix issues with some merchant IDs that might be missing prefixes
export function normalizeMerchantId(id: string): string {
  // Return merchant ID exactly as found in CSV - no automatic prefixing
  // Only use authentic merchant IDs from CSV data
  return id.trim();
}