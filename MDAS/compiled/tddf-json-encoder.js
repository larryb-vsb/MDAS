/**
 * TDDF to JSON/JSONB Encoder
 * Uses TDDF Record type schema definitions for structured field extraction
 */
// DT Record Field Definitions (based on shared/schema.ts tddfTransactionRecords)
export const DT_RECORD_FIELDS = [
    // Core TDDF header fields (positions 1-19)
    { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
    { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
    { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
    { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'Always "DT"' },
    // Bank and account fields (positions 20-55)
    { name: 'bankNumber', positions: [20, 23], type: 'text', description: 'Global Payments bank number' },
    { name: 'merchantAccountNumber', positions: [24, 39], type: 'text', description: 'GP account number (16 chars)' },
    { name: 'associationNumber', positions: [40, 45], type: 'text', description: 'Association ID (6 chars)' },
    { name: 'groupNumber', positions: [46, 51], type: 'text', description: 'Group number (6 chars)' },
    { name: 'transactionCode', positions: [52, 55], type: 'text', description: 'GP transaction code (4 chars)' },
    // Transaction identification and dates (positions 56-84)
    { name: 'referenceNumber', positions: [56, 84], type: 'text', description: 'TSYS reference number (29 chars)' },
    { name: 'transactionDate', positions: [85, 92], type: 'date', description: 'Transaction date (MMDDCCYY)' },
    { name: 'batchDate', positions: [93, 100], type: 'date', description: 'Batch date (MMDDCCYY)' },
    // Transaction amounts (positions 101-156)
    { name: 'transactionAmount', positions: [101, 112], type: 'numeric', precision: 12, scale: 2, description: 'Transaction amount' },
    { name: 'authorizationAmount', positions: [113, 124], type: 'numeric', precision: 12, scale: 2, description: 'Authorization amount' },
    { name: 'feeAmount', positions: [125, 136], type: 'numeric', precision: 12, scale: 2, description: 'Fee amount' },
    { name: 'cashbackAmount', positions: [137, 148], type: 'numeric', precision: 12, scale: 2, description: 'Cashback amount' },
    { name: 'tipAmount', positions: [149, 156], type: 'numeric', precision: 8, scale: 2, description: 'Tip amount' },
    // Card and POS data (positions 157-242)
    { name: 'cardNumber', positions: [157, 175], type: 'text', description: 'Card number (19 chars masked)' },
    { name: 'cardType', positions: [176, 177], type: 'text', description: 'Card type code' },
    { name: 'authorizationNumber', positions: [178, 183], type: 'text', description: 'Authorization number' },
    { name: 'posEntryMode', positions: [184, 186], type: 'text', description: 'POS entry mode' },
    { name: 'transactionTypeIdentifier', positions: [187, 190], type: 'text', description: 'Transaction type identifier' },
    { name: 'mccCode', positions: [191, 194], type: 'text', description: 'Merchant Category Code' },
    { name: 'terminalIdNumber', positions: [195, 202], type: 'text', description: 'Terminal ID number' },
    { name: 'reversalFlag', positions: [217, 217], type: 'text', description: 'Reversal flag' },
    { name: 'merchantName', positions: [218, 242], type: 'text', description: 'DBA name (25 chars)' }
];
// P1 Record Field Definitions (based on shared/schema.ts tddfPurchasingExtensions)
export const P1_RECORD_FIELDS = [
    // Core TDDF header fields (positions 1-19)
    { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
    { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
    { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
    { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'P1 or P2' },
    // Purchasing Card Level 1 Data (positions 20-39)
    { name: 'taxAmount', positions: [20, 31], type: 'numeric', precision: 12, scale: 2, description: 'Tax amount' },
    { name: 'taxRate', positions: [32, 38], type: 'numeric', precision: 15, scale: 4, description: 'Tax rate' },
    { name: 'taxType', positions: [39, 39], type: 'text', description: 'Tax type indicator' },
    // Purchasing Card Level 2 Data (positions 40-287)
    { name: 'purchaseIdentifier', positions: [40, 64], type: 'text', description: 'Purchase identifier' },
    { name: 'customerCode', positions: [65, 89], type: 'text', description: 'Customer code' },
    { name: 'salesTax', positions: [90, 101], type: 'numeric', precision: 12, scale: 2, description: 'Sales tax amount' },
    { name: 'freightAmount', positions: [114, 125], type: 'numeric', precision: 12, scale: 2, description: 'Freight amount' },
    { name: 'destinationZip', positions: [126, 135], type: 'text', description: 'Destination ZIP' },
    { name: 'merchantType', positions: [136, 139], type: 'text', description: 'Merchant type' },
    { name: 'dutyAmount', positions: [140, 151], type: 'numeric', precision: 12, scale: 2, description: 'Duty amount' },
    { name: 'discountAmount', positions: [217, 228], type: 'numeric', precision: 12, scale: 2, description: 'Discount amount' }
];
// BH Record Field Definitions (based on shared/schema.ts tddfBatchHeaders)
export const BH_RECORD_FIELDS = [
    // Core TDDF header fields (positions 1-19)
    { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
    { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
    { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
    { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'Always "BH"' },
    // Bank and account fields (positions 20-55)
    { name: 'bankNumber', positions: [20, 23], type: 'text', description: 'Global Payments bank number' },
    { name: 'merchantAccountNumber', positions: [24, 39], type: 'text', description: 'GP account number (16 chars)' },
    { name: 'associationNumber', positions: [40, 45], type: 'text', description: 'Association ID (6 chars)' },
    { name: 'groupNumber', positions: [46, 51], type: 'text', description: 'Group number (6 chars)' },
    { name: 'transactionCode', positions: [52, 55], type: 'text', description: 'GP transaction code (4 chars)' },
    // Batch information (positions 56-126)
    { name: 'batchDate', positions: [56, 63], type: 'date', description: 'Batch date (MMDDCCYY)' },
    { name: 'batchJulianDate', positions: [64, 68], type: 'text', description: 'Batch Julian date (5 chars)' },
    { name: 'netDeposit', positions: [69, 83], type: 'numeric', precision: 15, scale: 2, description: 'Net deposit amount' },
    { name: 'rejectReason', positions: [84, 87], type: 'text', description: 'Reject reason (4 chars)' },
    { name: 'merchantReferenceNum', positions: [88, 103], type: 'text', description: 'Merchant reference number (16 chars)' },
    { name: 'batchHeaderCarryIndicator', positions: [104, 104], type: 'text', description: 'Batch header carry indicator (1 char)' },
    { name: 'associationNumberBatch', positions: [105, 110], type: 'text', description: 'Association number (6 chars)' },
    { name: 'merchantBankNumber', positions: [111, 114], type: 'text', description: 'Merchant bank number (4 chars)' },
    { name: 'debitCreditIndicator', positions: [115, 115], type: 'text', description: 'Debit/Credit indicator (1 char)' },
    { name: 'achPostingDate', positions: [116, 123], type: 'date', description: 'ACH posting date (MMDDCCYY)' },
    { name: 'batchId', positions: [124, 126], type: 'text', description: 'Batch ID (3 chars)' }
];
/**
 * Extract field value from TDDF line using field definition
 */
function extractFieldValue(line, field) {
    const [start, end] = field.positions;
    const rawValue = line.substring(start - 1, end).trim(); // Convert to 0-based indexing
    if (!rawValue)
        return null;
    switch (field.type) {
        case 'numeric':
            const numValue = parseFloat(rawValue);
            if (isNaN(numValue))
                return null;
            return field.scale ? numValue / Math.pow(10, field.scale) : numValue;
        case 'date':
            // TDDF dates are in MMDDCCYY format
            if (rawValue.length === 8) {
                const month = rawValue.substring(0, 2);
                const day = rawValue.substring(2, 4);
                const year = rawValue.substring(4, 8);
                return `${year}-${month}-${day}`;
            }
            return null;
        case 'text':
        default:
            return rawValue;
    }
}
/**
 * Encode TDDF line to JSON using record type schema definitions
 */
function encodeTddfLineToJson(line, lineNumber) {
    if (line.length < 19) {
        return { error: 'Line too short for TDDF format', lineNumber, rawLine: line };
    }
    const recordType = line.substring(17, 19); // Positions 18-19
    let fields = [];
    switch (recordType) {
        case 'DT':
            fields = DT_RECORD_FIELDS;
            break;
        case 'P1':
        case 'P2':
            fields = P1_RECORD_FIELDS;
            break;
        case 'BH':
            fields = BH_RECORD_FIELDS;
            break;
        default:
            // For other record types (E1, G2, AD, DR, etc.), extract basic header fields
            fields = [
                { name: 'sequenceNumber', positions: [1, 7], type: 'text', description: 'File position identifier' },
                { name: 'entryRunNumber', positions: [8, 13], type: 'text', description: 'Entry run number' },
                { name: 'sequenceWithinRun', positions: [14, 17], type: 'text', description: 'Sequence within entry run' },
                { name: 'recordIdentifier', positions: [18, 19], type: 'text', description: 'Record type' }
            ];
    }
    const jsonRecord = {
        recordType,
        lineNumber,
        rawLine: line,
        extractedFields: {}
    };
    // Extract all defined fields
    for (const field of fields) {
        const value = extractFieldValue(line, field);
        if (value !== null) {
            jsonRecord.extractedFields[field.name] = value;
        }
    }
    return jsonRecord;
}
/**
 * Main TDDF to JSONB encoding function
 */
export async function encodeTddfToJsonb(fileContent, upload) {
    const startTime = Date.now();
    const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
    const results = {
        uploadId: upload.id,
        filename: upload.filename,
        totalLines: lines.length,
        totalRecords: 0,
        recordCounts: {
            total: 0,
            byType: {}
        },
        jsonRecords: [],
        encodingTimeMs: 0,
        errors: []
    };
    console.log(`[TDDF-JSON-ENCODER] Starting encoding for ${upload.filename} (${lines.length} lines)`);
    // Process each line
    for (let i = 0; i < lines.length; i++) {
        try {
            const jsonRecord = encodeTddfLineToJson(lines[i], i + 1);
            results.jsonRecords.push(jsonRecord);
            results.totalRecords++;
            if (jsonRecord.recordType) {
                results.recordCounts.byType[jsonRecord.recordType] =
                    (results.recordCounts.byType[jsonRecord.recordType] || 0) + 1;
            }
        }
        catch (error) {
            const errorMsg = `Line ${i + 1}: ${error.message}`;
            results.errors.push(errorMsg);
            console.error(`[TDDF-JSON-ENCODER] ${errorMsg}`);
        }
    }
    results.recordCounts.total = results.totalRecords;
    results.encodingTimeMs = Date.now() - startTime;
    console.log(`[TDDF-JSON-ENCODER] Completed encoding: ${results.totalRecords} records in ${results.encodingTimeMs}ms`);
    console.log(`[TDDF-JSON-ENCODER] Record type breakdown:`, results.recordCounts.byType);
    return results;
}
