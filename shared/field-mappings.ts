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
  clientMID: "ClientNumber", // Map to clientMID
  otherClientNumber1: null, // Not in current import
  otherClientNumber2: null, // Not in current import
  status: "Status", // Merchant status field (Open = Active, Delete = Inactive)
  merchantType: "Mtype", // Merchant Type field (numeric: 1=Online, 2=Retail, 3=Mixed, 4=B2B, 5=Wholesale)
  association: "Association", // Business association field
  mcc: "MCC", // Merchant Category Code
  masterMID: "POS Merchant #", // Master Merchant ID from TSYS (POS Merchant # field)
  address: "ClientPAddress1", 
  city: "ClientPAddressCity",
  state: "ClientPAddressState",
  zipCode: "ClientPAddressZip",
  country: "ClientPAddressCountry",
  category: null, // Default in code
  clientSinceDate: "ClientSinceDate",
  asOfDate: "AsOfDate" // Date from demographic import file
};

// Alternative field mappings for headers with spaces
export const merchantFieldMappingsAlt = {
  id: "Client ID",
  name: "Client Legal Name",
  clientMID: "Client MID",
  address: "Client Primary Address",
  city: "Client City", 
  state: "Client State",
  zipCode: "Client Zip Code",
  asOfDate: "As Of Date"
};

export const transactionFieldMappings = {
  // Database field: CSV field name (standard format)
  id: "TransactionID",
  merchantId: "MerchantID", // Field that links to merchant table
  amount: "Amount",
  date: "Date",
  type: "Type"
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

// Terminal field mappings for TSYS export
export const terminalFieldMappings: Record<string, string | null> = {
  vNumber: "V Number", // VAR Number from TSYS (unique identifier)
  posMerchantNumber: "POS Merchant #", // Links to merchants.masterMID
  bin: "BIN", // Bank Identification Number
  dbaName: "DBA Name", // Doing Business As name
  dailyAuth: "Daily Auth", // Daily authorization limit
  dialPay: "Dial Pay", // Dial payment configuration
  encryption: "Encryption", // Payment encryption settings
  prr: "PRR", // Processing rate/rule
  mcc: "MCC", // Merchant Category Code
  ssl: "SSL", // SSL security configuration
  tokenization: "Tokenization", // Tokenization settings
  agent: "Agent", // Agent information
  chain: "Chain", // Chain store identifier
  store: "Store", // Store number
  terminalInfo: "Terminal", // Terminal information
  recordStatus: "Record Status", // Record status from TSYS
  boardDate: "Board Date", // Board date from TSYS
  terminalVisa: "Terminal Visa", // Visa terminal settings
  
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
  terminalId: "Terminal ID", // Terminal hardware ID
  discoverPosEntryMode: "Discover POS Entry Mode", // Discover network entry
  purchaseId: "Purchase ID", // Purchase identification
  posDataCode: "POS Data Code", // POS configuration code
  
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
  genericField1: null, // Generic field for custom use
  genericField2: null, // Generic field for custom use
  description: null, // Internal field
  notes: null, // Internal field
  internalNotes: null, // Internal field
};

// Customizable default values for fields not found in CSV
export const defaultMerchantValues = {
  status: "Active", // Default status is Active unless specified otherwise in CSV
  category: "Retail",
  country: "US",
  address: "123 Business St" // Default if not provided
};

// CSV header variations that might occur in different files
export const merchantIdAliases = [
  "ClientNumber", // Primary merchant ID for demographics files
  "ClientMID", 
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
    if (record[alias] && typeof record[alias] === 'string') {
      return record[alias];
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