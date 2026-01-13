// DT Record Field Definitions for TDDF
// Each field has position (1-indexed), length, format, and description
// Based on TSYS TDDF specification

export interface DTFieldDefinition {
  key: string;
  label: string;
  start: number;  // 1-indexed start position
  length: number;
  format: 'N' | 'AN';  // N = Numeric, AN = Alphanumeric
  description: string;
}

// Complete DT field map based on the TDDF specification
export const DT_FIELDS: DTFieldDefinition[] = [
  { key: 'sequenceNumberArea', label: 'Sequence Number Area', start: 1, length: 7, format: 'N', description: 'A number 1' },
  { key: 'entryRunNumber', label: 'Entry Run Number', start: 8, length: 6, format: 'N', description: 'The value 1' },
  { key: 'sequenceWithinEntry', label: 'Sequence Number within entry', start: 14, length: 4, format: 'N', description: 'The value 1' },
  { key: 'recordIdentifier', label: 'Record Identifier', start: 18, length: 2, format: 'AN', description: 'The value 1' },
  { key: 'bankNumber', label: 'Bank Number', start: 20, length: 4, format: 'N', description: 'The Global' },
  { key: 'merchantAccountNumber', label: 'Merchant Account Number', start: 24, length: 16, format: 'N', description: 'The Global' },
  { key: 'associationNumber', label: 'Association Number', start: 40, length: 6, format: 'AN', description: 'The identifi' },
  { key: 'groupNumber', label: 'Group Number', start: 46, length: 6, format: 'N', description: 'Group numb' },
  { key: 'transactionCode', label: 'Transaction Code', start: 52, length: 5, format: 'N', description: 'The Global Pa' },
  { key: 'associationNumberTxn', label: 'Association Number', start: 56, length: 6, format: 'N', description: 'The identifi' },
  { key: 'referenceNumber', label: 'Reference Number', start: 62, length: 23, format: 'N', description: 'The 11 digit' },
  { key: 'transactionDate', label: 'Transaction Date', start: 85, length: 8, format: 'N', description: 'The date o' },
  { key: 'transactionAmount', label: 'Transaction Amount', start: 93, length: 11, format: 'N', description: 'The amoun' },
  { key: 'batchJulianDate', label: 'Batch Julian Date', start: 104, length: 4, format: 'N', description: 'Batch Julia' },
  { key: 'netDeposit', label: 'Net Deposit', start: 108, length: 16, format: 'N', description: 'The depos' },
  { key: 'cardholderAccountNumber', label: 'Cardholder Account Number', start: 124, length: 19, format: 'N', description: 'The accou' },
  { key: 'bestInterchangeEligible', label: 'Best Interchange Eligible', start: 143, length: 1, format: 'AN', description: '' },
  { key: 'transactionDataConditionCode', label: 'Transaction Data Condition Code', start: 145, length: 2, format: 'AN', description: 'The condit' },
  { key: 'downgradeReason1', label: 'Downgrade Reason 1', start: 147, length: 4, format: 'AN', description: '' },
  { key: 'downgradeReason2', label: 'Downgrade Reason 2', start: 151, length: 4, format: 'N', description: '' },
  { key: 'downgradeReason3', label: 'Downgrade Reason 3', start: 155, length: 10, format: 'N', description: '' },
  { key: 'onlineEntry', label: 'Online Entry', start: 165, length: 1, format: 'N', description: '' },
  { key: 'achFlag', label: 'ACH Flag', start: 166, length: 1, format: 'N', description: 'The daily A' },
  { key: 'authSource', label: 'Auth Source', start: 167, length: 1, format: 'AN', description: 'The source' },
  { key: 'cardholderIdMethod', label: 'Cardholder ID Method', start: 168, length: 1, format: 'AN', description: '' },
  { key: 'cafIndicator', label: 'CAF Indicator', start: 169, length: 1, format: 'AN', description: 'A code tha' },
  { key: 'reimbursementAttribute', label: 'Reimbursement Attribute', start: 170, length: 1, format: 'N', description: 'The code t' },
  { key: 'mailOrderTelephoneOrderInd', label: 'Mail Order/Telephone Order Ind', start: 171, length: 1, format: 'N', description: 'The value i' },
  { key: 'authCharInd', label: 'Auth Char Ind (ACI)', start: 172, length: 1, format: 'AN', description: 'The value i' },
  { key: 'banknetReferenceNumber', label: 'Banknet Reference Number and', start: 173, length: 14, format: 'N', description: 'MC Ref N' },
  { key: 'draftAFlag', label: 'Draft A Flag', start: 188, length: 1, format: 'AN', description: '' },
  { key: 'authCurrencyCode', label: 'Auth Currency Code', start: 189, length: 3, format: 'N', description: 'The code t' },
  { key: 'authAmount', label: 'Auth Amount', start: 192, length: 12, format: 'N', description: 'The 12 digi' },
  { key: 'validationCode', label: 'Validation Code', start: 204, length: 4, format: 'N', description: '' },
  { key: 'authResponseCode', label: 'Auth Response Code', start: 208, length: 2, format: 'N', description: 'The respo' },
  { key: 'networkInterchangeDebit', label: 'Network Interchange - Debit', start: 210, length: 3, format: 'N', description: '' },
  { key: 'switchSettledIndicator', label: 'Switch Settled Indicator', start: 213, length: 1, format: 'N', description: 'The uo' },
  { key: 'posEntryMode', label: 'POS Entry Mode', start: 214, length: 2, format: 'N', description: 'A code tha' },
  { key: 'debitCreditIndicator', label: 'Debit/Credit Indicator', start: 216, length: 1, format: 'AN', description: 'Indicates t' },
  { key: 'reversalFlag', label: 'Reversal Flag', start: 217, length: 1, format: 'N', description: '' },
  { key: 'merchantName', label: 'Merchant Name', start: 218, length: 25, format: 'AN', description: 'The DBA n' },
  { key: 'authorizationNumber', label: 'Authorization Number', start: 243, length: 6, format: 'AN', description: '' },
  { key: 'rejectReason', label: 'Reject Reason', start: 249, length: 4, format: 'N', description: '' },
  { key: 'cardType', label: 'Card Type', start: 253, length: 2, format: 'N', description: 'The type c' },
  { key: 'currencyCode', label: 'Currency Code', start: 255, length: 3, format: 'AN', description: 'The curre' },
  { key: 'originalTransactionAmount', label: 'Original Transaction Amount', start: 258, length: 12, format: 'N', description: 'The amou' },
  { key: 'foreignCardIndicator', label: 'Foreign Card Indicator', start: 269, length: 1, format: 'AN', description: '' },
  { key: 'carryoverIndicator', label: 'Carryover Indicator', start: 270, length: 1, format: 'AN', description: '' },
  { key: 'extensionRecordIndicator', label: 'Extension Record Indicator', start: 271, length: 2, format: 'AN', description: 'Indicates t' },
  { key: 'mccCode', label: 'MCC Code', start: 273, length: 4, format: 'AN', description: 'The merch' },
  { key: 'terminalId', label: 'Terminal ID', start: 277, length: 8, format: 'AN', description: '' },
  { key: 'discoverPosEntryMode', label: 'Discover POS Entry Mode', start: 285, length: 3, format: 'N', description: '' },
  { key: 'purchaseId', label: 'Purchase ID', start: 288, length: 25, format: 'AN', description: '' },
  { key: 'cashBackAmountMc', label: 'Cash Back Amount (MC)', start: 313, length: 9, format: 'N', description: '' },
  { key: 'cashBackAmountVisa', label: 'Cash Back Amount +/- (V)', start: 322, length: 11, format: 'N', description: 'The cash b' },
  { key: 'posDataCode', label: 'POS Data Code', start: 323, length: 13, format: 'AN', description: 'A 12 part c' },
  { key: 'transactionTypeIdentifier', label: 'Transaction Type Identifier', start: 335, length: 3, format: 'AN', description: 'A code use' },
  { key: 'cardTypeSuffix', label: 'Card Type', start: 338, length: 3, format: 'AN', description: '' },
  { key: 'productId', label: 'Product ID', start: 342, length: 3, format: 'AN', description: 'The identifi' },
  { key: 'submittedInterchange', label: 'Submitted Interchange', start: 344, length: 6, format: 'N', description: '' },
  { key: 'systemTraceAuditNumber', label: 'System Trace Audit Number', start: 350, length: 6, format: 'N', description: 'A number 1' },
  { key: 'discoverTransactionType', label: 'Discover Transaction Type', start: 355, length: 2, format: 'AN', description: '' },
  { key: 'localTransactionTime', label: 'Local Transaction Time', start: 357, length: 6, format: 'N', description: 'Time the' },
  { key: 'discoverProcessingCode', label: 'Discover Processing Code', start: 363, length: 6, format: 'AN', description: 'The code u' },
  { key: 'commercialCardServiceIndex', label: 'Commercial Card Service Index', start: 369, length: 1, format: 'AN', description: '' },
  { key: 'mastercardCrossBorderVisa', label: 'Mastercard Cross BorderVisa IS', start: 370, length: 9, format: 'N', description: '' },
  { key: 'cardBrandFeeCode', label: 'Card Brand Fee Code', start: 379, length: 1, format: 'AN', description: '' },
  { key: 'dccIndicator', label: 'DCC Indicator', start: 380, length: 1, format: 'AN', description: 'Indicates t' },
  { key: 'regulatedIndicator', label: 'Regulated Indicator', start: 381, length: 1, format: 'AN', description: '' },
  { key: 'visaIntegrityFee', label: 'Visa Integrity Fee', start: 382, length: 10, format: 'AN', description: '' },
  { key: 'foreignExchangeRateFlagRedefin', label: 'Foreign Exchange Rate (Flag-Re-defin', start: 381, length: 14, format: 'AN', description: 'Indicates t' },
  { key: 'visaFeeProgram', label: 'Visa Fee Program Indicator', start: 394, length: 3, format: 'AN', description: '' },
  { key: 'transactionFeeDebitCreditInd', label: 'Transaction Fee Debit/Credit Ind', start: 395, length: 2, format: 'AN', description: 'Indicates t' },
  { key: 'transactionFeeAmount', label: 'Transaction Fee Amount', start: 397, length: 18, format: 'N', description: 'Includes ta' },
  { key: 'transactionFeeAmountInCan', label: 'Transaction Fee Amount in Can', start: 414, length: 11, format: 'AN', description: 'Late Intern' },
  { key: 'iasfFeeType', label: 'IASF Fee Type', start: 425, length: 2, format: 'AN', description: 'Visa Intern' },
  { key: 'iasfFeeAmount', label: 'IASF Fee Amount', start: 437, length: 1, format: 'AN', description: '' },
  { key: 'iasfFeeDebitCreditIndicator', label: 'IASF Fee Debit/ Credit Indicator', start: 438, length: 12, format: 'AN', description: '' },
  { key: 'merchantAssignedReferenceN', label: 'Merchant Assigned Reference N', start: 439, length: 12, format: 'AN', description: '' },
  { key: 'netDepositAdjustmentAmount', label: 'Net Deposit Adjustment Amount', start: 451, length: 15, format: 'N', description: '' },
  { key: 'netDepositAdjustmentIndicator', label: 'Net Deposit Adjustment Indicator', start: 466, length: 1, format: 'AN', description: '' },
  { key: 'mcCashBackFee', label: 'MC Cash Back Fee', start: 467, length: 15, format: 'AN', description: '' },
  { key: 'mcCashBackFeeSign', label: 'MC Cash Back Fee Sign', start: 482, length: 1, format: 'AN', description: '' },
  { key: 'amexIndustrySeNumber', label: 'Amex Industry SE Number', start: 483, length: 10, format: 'N', description: 'This field' },
  { key: 'amexMerchantSellerId', label: 'Amex Merchant Seller ID', start: 493, length: 20, format: 'AN', description: 'A unique t' },
  { key: 'amexMerchantSellerName', label: 'Amex Merchant Seller Name', start: 513, length: 25, format: 'AN', description: 'This field' },
  { key: 'amexMerchantSellerAddress', label: 'Amex Merchant Seller Address', start: 538, length: 25, format: 'AN', description: 'This field' },
  { key: 'amexMerchantSellerPhone', label: 'Amex Merchant Seller Phone', start: 563, length: 16, format: 'AN', description: 'This field' },
  { key: 'amexMerchantSellerPostalCo', label: 'Amex Merchant Seller Postal Co', start: 579, length: 10, format: 'AN', description: 'Amex Merch' },
  { key: 'amexMerchantSellerEmail', label: 'Amex Merchant Seller Email', start: 589, length: 40, format: 'AN', description: 'Amex Merch' },
  { key: 'mastercardTransactionIntegrity', label: 'Mastercard Transaction Integrity', start: 629, length: 2, format: 'AN', description: 'This value' },
  { key: 'equipmentSourceIdentification', label: 'Equipment Source Identification', start: 631, length: 3, format: 'AN', description: 'Identifies t' },
  { key: 'operatorId', label: 'Operator ID', start: 634, length: 4, format: 'AN', description: '' },
  { key: 'requestedPaymentServiceIRP', label: 'Requested Payment Service IRP', start: 637, length: 1, format: 'AN', description: 'Visa Requ' },
  { key: 'totalAuthorizedAmount', label: 'Total Authorized Amount', start: 638, length: 12, format: 'AN', description: 'Amex onin' },
  { key: 'interchangeFeeAmount', label: 'Interchange Fee Amount', start: 649, length: 18, format: 'AN', description: '' },
  { key: 'mastercardWalletIdentifier', label: 'Mastercard Wallet Identifier', start: 667, length: 3, format: 'AN', description: 'This is a M' },
  { key: 'visaSpecialConditionIndicator', label: 'Visa Special Condition Indicator', start: 670, length: 4, format: 'AN', description: 'Special Co' },
  { key: 'interchangePerItemRate', label: 'Interchange Per Item Rate', start: 674, length: 6, format: 'N', description: 'Card bran' },
  { key: 'interchangePerItemFee', label: 'Interchange Per Item Fee', start: 678, length: 6, format: 'N', description: '' },
  { key: 'creditPlanRejectCode', label: 'Credit Plan Reject Code', start: 681, length: 4, format: 'AN', description: 'Applicabl' },
  { key: 'esoRetailFileSpot', label: 'ESO (Retail File Spot)', start: 685, length: 6, format: 'AN', description: 'A greeme' },
  { key: 'visaAdditionToken', label: 'Visa Addition Token Response', start: 691, length: 1, format: 'AN', description: '' },
  { key: 'visaMerchantIdentifier', label: 'Visa Merchant Identifier', start: 692, length: 8, format: 'AN', description: '' },
  { key: 'reservedForFuture', label: 'Reserved for future use', start: 700, length: 1, format: 'AN', description: '' },
];

// Get field options for dropdown
export const getDTFieldOptions = (): { value: string; label: string; }[] => {
  return DT_FIELDS.map(field => ({
    value: field.key,
    label: field.label,
  }));
};

// Get field definition by key
export const getDTFieldByKey = (key: string): DTFieldDefinition | undefined => {
  return DT_FIELDS.find(f => f.key === key);
};
