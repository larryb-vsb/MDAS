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
  status: "Pending",
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