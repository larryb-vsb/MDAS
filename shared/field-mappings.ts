/**
 * Field mapping configuration for CSV file imports
 * Maps CSV column names to database field names
 */

export const merchantFieldMappings = {
  // Database field: CSV field name
  id: "ClientMID", // Use ClientMID as our primary merchant ID
  name: "ClientLegalName",
  clientMID: "ClientNumber", // Map to clientMID
  otherClientNumber1: null, // Not in current import
  otherClientNumber2: null, // Not in current import
  status: null, // Default in code
  address: "ClientPAddress1", 
  city: "ClientPAddressCity",
  state: "ClientPAddressState",
  zipCode: "ClientPAddressZip",
  country: "ClientPAddressCountry",
  category: null, // Default in code
  clientSinceDate: "ClientSinceDate"
};

export const transactionFieldMappings = {
  // Database field: CSV field name
  id: "TransactionID",
  merchantId: "MerchantID", // Field that links to merchant table
  amount: "Amount",
  date: "Date",
  type: "Type"
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
  "ClientID"
];

export const transactionMerchantIdAliases = [
  "MerchantID", 
  "Merchant_ID", 
  "ClientMID", 
  "ClientID"
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