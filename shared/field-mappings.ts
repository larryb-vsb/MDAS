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
  status: "Status", // Merchant status field (defaults to Active if not provided)
  merchantType: "Mtype", // Merchant Type field (numeric: 1=Online, 2=Retail, 3=Mixed, 4=B2B, 5=Wholesale)
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
  }
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
  "ClientMID", 
  "MerchantID", 
  "Merchant_ID", 
  "ClientID",
  "ClientNumber" // Add this as another possible merchant ID field
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