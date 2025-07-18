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
  status: null, // Default in code
  merchantType: "Mtype", // New field for merchant type
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
  status: "Active", // Changed from Pending to Active
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
  // If the ID doesn't have a prefix like "VS" or "M", add one
  if (!/^[A-Za-z]/.test(id)) {
    return `M${id}`;
  }
  return id;
}