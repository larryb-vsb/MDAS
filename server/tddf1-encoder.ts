/**
 * TDDF1 File-Based Encoding Service
 * 
 * This service implements the new file-based TDDF encoding system that creates
 * individual tables for each TDDF file using the naming pattern: dev_tddf1_filename
 * 
 * Key Features:
 * - Universal timestamping with 100ms line offset intervals
 * - File-specific table creation for each TDDF file
 * - Support for all TDDF record types (DT, BH, P1, P2, E1, G2, AD, DR, etc.)
 * - Enhanced chronological ordering and data organization
 */

import { db, pool } from "./db";
import { getFileBasedTddfTableName, createFileBasedTddfTable } from "@shared/schema";
import { eq, desc, asc } from "drizzle-orm";

export interface TddfRecord {
  recordType: string;
  sequenceNumber: string;
  entryRunNumber: string;
  sequenceWithinRun: string;
  recordIdentifier: string;
  bankNumber: string;
  rawData: any;
  parsedData: any;
}

export interface EncodingResult {
  success: boolean;
  tableName: string;
  recordCount: number;
  errors: string[];
  recordBreakdown: Record<string, number>;
}

export class Tddf1Encoder {
  
  /**
   * Create a new file-based TDDF table for a specific file
   */
  async createFileBasedTable(fileName: string): Promise<string> {
    const tableName = getFileBasedTddfTableName(fileName);
    
    // Create the table using raw SQL since Drizzle doesn't support dynamic table creation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id SERIAL PRIMARY KEY,
        universal_timestamp NUMERIC(20,3),
        sequence_number TEXT,
        entry_run_number TEXT,
        sequence_within_run TEXT,
        record_identifier TEXT,
        bank_number TEXT,
        record_type TEXT NOT NULL,
        merchant_account_number TEXT,
        association_number TEXT,
        group_number TEXT,
        transaction_code TEXT,
        reference_number TEXT,
        transaction_date DATE,
        transaction_amount NUMERIC(15,2),
        batch_julian_date TEXT,
        net_deposit NUMERIC(17,2),
        cardholder_account_number TEXT,
        batch_date TEXT,
        batch_id TEXT,
        purchase_identifier TEXT,
        customer_code TEXT,
        merchant_name TEXT,
        merchant_address TEXT,
        merchant_city TEXT,
        merchant_state TEXT,
        merchant_zip TEXT,
        record_data JSONB,
        source_file_id TEXT,
        source_row_number INTEGER,
        recorded_at TIMESTAMP DEFAULT NOW(),
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes for the new table
    await pool.query(`
      CREATE INDEX IF NOT EXISTS "${tableName}_universal_timestamp_idx" ON "${tableName}" (universal_timestamp);
      CREATE INDEX IF NOT EXISTS "${tableName}_record_type_idx" ON "${tableName}" (record_type);
      CREATE INDEX IF NOT EXISTS "${tableName}_merchant_account_idx" ON "${tableName}" (merchant_account_number);
      CREATE INDEX IF NOT EXISTS "${tableName}_transaction_date_idx" ON "${tableName}" (transaction_date);
      CREATE INDEX IF NOT EXISTS "${tableName}_sequence_number_idx" ON "${tableName}" (sequence_number);
    `);

    console.log(`✅ Created file-based TDDF table: ${tableName}`);
    return tableName;
  }

  /**
   * Encode a TDDF file to a file-specific table
   */
  async encodeFile(fileId: string, fileName: string, fileContent: string): Promise<EncodingResult> {
    const errors: string[] = [];
    const recordBreakdown: Record<string, number> = {};
    let recordCount = 0;

    try {
      // Create the table for this file
      const tableName = await this.createFileBasedTable(fileName);

      // Get base timestamp for universal timestamping
      const baseTimestamp = Date.now();

      // Split content into lines
      const lines = fileContent.split('\n').filter(line => line.trim().length > 0);
      console.log(`📄 Processing ${lines.length} lines from file: ${fileName}`);

      // Process each line
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) continue;

        try {
          // Parse TDDF record
          const record = this.parseTddfLine(line, i + 1);
          
          // Calculate universal timestamp with 100ms offset
          const universalTimestamp = baseTimestamp + (i * 100);

          // Insert record into file-specific table
          await this.insertTddfRecord(tableName, record, universalTimestamp, fileId, i + 1);

          recordCount++;
          recordBreakdown[record.recordType] = (recordBreakdown[record.recordType] || 0) + 1;

        } catch (parseError: any) {
          const errorMsg = `Line ${i + 1}: ${parseError.message}`;
          errors.push(errorMsg);
          console.error(`❌ Parse error: ${errorMsg}`);
        }
      }

      console.log(`✅ Successfully encoded ${recordCount} records to ${tableName}`);
      console.log(`📊 Record breakdown:`, recordBreakdown);

      return {
        success: true,
        tableName,
        recordCount,
        errors,
        recordBreakdown
      };

    } catch (error: any) {
      const errorMsg = `Encoding failed: ${error.message}`;
      errors.push(errorMsg);
      console.error(`❌ ${errorMsg}`);
      
      return {
        success: false,
        tableName: '',
        recordCount: 0,
        errors,
        recordBreakdown
      };
    }
  }

  /**
   * Parse a single TDDF line into a structured record
   */
  private parseTddfLine(line: string, lineNumber: number): TddfRecord {
    if (line.length < 23) {
      throw new Error(`Line too short: ${line.length} characters (minimum 23 required)`);
    }

    // Extract core header fields (positions 1-23)
    const sequenceNumber = line.substring(0, 7).trim();
    const entryRunNumber = line.substring(7, 13).trim();
    const sequenceWithinRun = line.substring(13, 17).trim();
    const recordIdentifier = line.substring(17, 19).trim();
    const bankNumber = line.substring(19, 23).trim();

    // Determine record type
    const recordType = recordIdentifier;

    // Parse record-specific data based on type
    let parsedData: any = {};

    switch (recordType) {
      case 'DT':
        parsedData = this.parseDtRecord(line);
        break;
      case 'BH':
        parsedData = this.parseBhRecord(line);
        break;
      case 'P1':
        parsedData = this.parseP1Record(line);
        break;
      case 'P2':
        parsedData = this.parseP2Record(line);
        break;
      case 'E1':
        parsedData = this.parseE1Record(line);
        break;
      case 'G2':
        parsedData = this.parseG2Record(line);
        break;
      case 'AD':
      case 'DR':
        parsedData = this.parseAdDrRecord(line);
        break;
      default:
        // Generic record parsing for unknown types
        parsedData = this.parseGenericRecord(line);
        break;
    }

    return {
      recordType,
      sequenceNumber,
      entryRunNumber,
      sequenceWithinRun,
      recordIdentifier,
      bankNumber,
      rawData: { line, lineNumber },
      parsedData
    };
  }

  /**
   * Parse DT (Detail Transaction) record
   */
  private parseDtRecord(line: string): any {
    return {
      merchantAccountNumber: line.length > 39 ? line.substring(23, 39).trim() : '',
      associationNumber1: line.length > 45 ? line.substring(39, 45).trim() : '',
      groupNumber: line.length > 51 ? line.substring(45, 51).trim() : '',
      transactionCode: line.length > 55 ? line.substring(51, 55).trim() : '',
      associationNumber2: line.length > 61 ? line.substring(55, 61).trim() : '',
      referenceNumber: line.length > 84 ? line.substring(61, 84).trim() : '',
      transactionDate: line.length > 92 ? line.substring(84, 92).trim() : '',
      transactionAmount: line.length > 103 ? line.substring(92, 103).trim() : '',
      batchJulianDate: line.length > 108 ? line.substring(103, 108).trim() : '',
      netDeposit: line.length > 123 ? line.substring(108, 123).trim() : '',
      cardholderAccountNumber: line.length > 142 ? line.substring(123, 142).trim() : ''
    };
  }

  /**
   * Parse BH (Batch Header) record
   */
  private parseBhRecord(line: string): any {
    return {
      merchantAccountNumber: line.length > 39 ? line.substring(23, 39).trim() : '',
      associationNumber: line.length > 45 ? line.substring(39, 45).trim() : '',
      groupNumber: line.length > 51 ? line.substring(45, 51).trim() : '',
      transactionCode: line.length > 55 ? line.substring(51, 55).trim() : '',
      batchDate: line.length > 63 ? line.substring(55, 63).trim() : '',
      batchJulianDate: line.length > 68 ? line.substring(63, 68).trim() : '',
      netDeposit: line.length > 83 ? line.substring(68, 83).trim() : '',
      rejectReason: line.length > 87 ? line.substring(83, 87).trim() : '',
      batchId: line.length > 126 ? line.substring(123, 126).trim() : ''
    };
  }

  /**
   * Parse P1 (Purchasing Card 1) record
   */
  private parseP1Record(line: string): any {
    return {
      merchantAccountNumber: line.length > 39 ? line.substring(23, 39).trim() : '',
      associationNumber: line.length > 45 ? line.substring(39, 45).trim() : '',
      groupNumber: line.length > 51 ? line.substring(45, 51).trim() : '',
      transactionCode: line.length > 55 ? line.substring(51, 55).trim() : '',
      referenceNumber: line.length > 78 ? line.substring(55, 78).trim() : '',
      purchaseIdentifier: line.length > 103 ? line.substring(78, 103).trim() : '',
      customerCode: line.length > 127 ? line.substring(103, 127).trim() : ''
    };
  }

  /**
   * Parse P2 (Purchasing Card 2) record
   */
  private parseP2Record(line: string): any {
    return {
      merchantAccountNumber: line.length > 39 ? line.substring(23, 39).trim() : '',
      merchantName: line.length > 64 ? line.substring(39, 64).trim() : '',
      merchantAddress: line.length > 89 ? line.substring(64, 89).trim() : '',
      merchantCity: line.length > 102 ? line.substring(89, 102).trim() : '',
      merchantState: line.length > 104 ? line.substring(102, 104).trim() : '',
      merchantZip: line.length > 113 ? line.substring(104, 113).trim() : ''
    };
  }

  /**
   * Parse E1 (Electronic Check) record
   */
  private parseE1Record(line: string): any {
    return {
      merchantAccountNumber: line.length > 39 ? line.substring(23, 39).trim() : '',
      checkNumber: line.length > 54 ? line.substring(39, 54).trim() : '',
      routingNumber: line.length > 63 ? line.substring(54, 63).trim() : '',
      accountNumber: line.length > 80 ? line.substring(63, 80).trim() : ''
    };
  }

  /**
   * Parse G2 (Geographic Information) record
   */
  private parseG2Record(line: string): any {
    return {
      merchantAccountNumber: line.length > 39 ? line.substring(23, 39).trim() : '',
      merchantCategoryCode: line.length > 43 ? line.substring(39, 43).trim() : '',
      postalCode: line.length > 52 ? line.substring(43, 52).trim() : '',
      countryCode: line.length > 55 ? line.substring(52, 55).trim() : ''
    };
  }

  /**
   * Parse AD/DR (Adjustment/Deposit Reversal) record
   */
  private parseAdDrRecord(line: string): any {
    return {
      merchantAccountNumber: line.length > 39 ? line.substring(23, 39).trim() : '',
      adjustmentType: line.length > 41 ? line.substring(39, 41).trim() : '',
      adjustmentAmount: line.length > 56 ? line.substring(41, 56).trim() : '',
      adjustmentReason: line.length > 60 ? line.substring(56, 60).trim() : ''
    };
  }

  /**
   * Parse generic record for unknown types
   */
  private parseGenericRecord(line: string): any {
    return {
      fullLine: line,
      length: line.length,
      parsed: false
    };
  }

  /**
   * Insert a TDDF record into the file-specific table
   */
  private async insertTddfRecord(tableName: string, record: TddfRecord, universalTimestamp: number, fileId: string, lineNumber: number): Promise<void> {
    const insertQuery = `
      INSERT INTO "${tableName}" (
        universal_timestamp,
        sequence_number,
        entry_run_number,
        sequence_within_run,
        record_identifier,
        bank_number,
        record_type,
        merchant_account_number,
        association_number,
        group_number,
        transaction_code,
        reference_number,
        transaction_date,
        transaction_amount,
        batch_julian_date,
        net_deposit,
        cardholder_account_number,
        batch_date,
        batch_id,
        purchase_identifier,
        customer_code,
        merchant_name,
        merchant_address,
        merchant_city,
        merchant_state,
        merchant_zip,
        record_data,
        source_file_id,
        source_row_number,
        raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
    `;

    const values = [
      universalTimestamp,
      record.sequenceNumber,
      record.entryRunNumber,
      record.sequenceWithinRun,
      record.recordIdentifier,
      record.bankNumber,
      record.recordType,
      record.parsedData.merchantAccountNumber || null,
      record.parsedData.associationNumber || record.parsedData.associationNumber1 || null,
      record.parsedData.groupNumber || null,
      record.parsedData.transactionCode || null,
      record.parsedData.referenceNumber || null,
      this.parseDate(record.parsedData.transactionDate),
      this.parseAmount(record.parsedData.transactionAmount),
      record.parsedData.batchJulianDate || null,
      this.parseAmount(record.parsedData.netDeposit),
      record.parsedData.cardholderAccountNumber || null,
      record.parsedData.batchDate || null,
      record.parsedData.batchId || null,
      record.parsedData.purchaseIdentifier || null,
      record.parsedData.customerCode || null,
      record.parsedData.merchantName || null,
      record.parsedData.merchantAddress || null,
      record.parsedData.merchantCity || null,
      record.parsedData.merchantState || null,
      record.parsedData.merchantZip || null,
      JSON.stringify(record.parsedData),
      fileId,
      lineNumber,
      JSON.stringify(record.rawData)
    ];

    await pool.query(insertQuery, values);
  }

  /**
   * Parse date from MMDDCCYY format to PostgreSQL date
   */
  private parseDate(dateStr: string): string | null {
    if (!dateStr || dateStr.length !== 8) return null;
    
    try {
      const month = dateStr.substring(0, 2);
      const day = dateStr.substring(2, 4);
      const year = dateStr.substring(4, 8);
      
      // Validate date components
      if (parseInt(month) < 1 || parseInt(month) > 12) return null;
      if (parseInt(day) < 1 || parseInt(day) > 31) return null;
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse amount from string to numeric value
   */
  private parseAmount(amountStr: string): number | null {
    if (!amountStr) return null;
    
    try {
      // Remove leading zeros and parse as number
      const cleaned = amountStr.replace(/^0+/, '') || '0';
      const amount = parseFloat(cleaned);
      
      // Convert cents to dollars (TDDF amounts are in cents)
      return amount / 100;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get records from a file-based TDDF table
   */
  async getRecords(tableName: string, options: { recordType?: string; limit?: number; offset?: number } = {}): Promise<any[]> {
    const { recordType, limit = 100, offset = 0 } = options;
    
    let query = `SELECT * FROM "${tableName}"`;
    const params: any[] = [];
    
    if (recordType) {
      query += ` WHERE record_type = $1`;
      params.push(recordType);
    }
    
    query += ` ORDER BY universal_timestamp ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Delete a file-based TDDF table
   */
  async deleteTable(tableName: string): Promise<void> {
    await pool.query(`DROP TABLE IF EXISTS "${tableName}"`);
    console.log(`🗑️ Deleted file-based TDDF table: ${tableName}`);
  }

  /**
   * Get table statistics
   */
  async getTableStats(tableName: string): Promise<{
    totalRecords: number;
    recordTypes: Record<string, number>;
    dateRange: { earliest: string; latest: string };
  }> {
    // Get total records
    const totalResult = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const totalRecords = parseInt(totalResult.rows[0].count);

    // Get record type breakdown
    const typeResult = await pool.query(`
      SELECT record_type, COUNT(*) as count 
      FROM "${tableName}" 
      GROUP BY record_type 
      ORDER BY count DESC
    `);
    const recordTypes: Record<string, number> = {};
    typeResult.rows.forEach(row => {
      recordTypes[row.record_type] = parseInt(row.count);
    });

    // Get date range
    const dateResult = await pool.query(`
      SELECT 
        MIN(transaction_date) as earliest,
        MAX(transaction_date) as latest
      FROM "${tableName}"
      WHERE transaction_date IS NOT NULL
    `);
    const dateRange = {
      earliest: dateResult.rows[0]?.earliest || '',
      latest: dateResult.rows[0]?.latest || ''
    };

    return {
      totalRecords,
      recordTypes,
      dateRange
    };
  }
}

export const tddf1Encoder = new Tddf1Encoder();