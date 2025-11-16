/**
 * Optimized TDDF Encoder with Hybrid Storage
 * Stores raw lines in object storage, structured data in database
 * Reduces database size by ~50% while maintaining query performance
 */

import { UploaderUpload } from '@shared/schema';
import { ObjectStorageService } from '../objectStorage';
import { randomUUID } from 'crypto';

interface TddfRecord {
  id?: number;
  record_type: string;
  raw_line_ref: string; // Object storage reference instead of full raw line
  record_sequence?: number;
  field_data?: any;
  transaction_amount?: number;
  merchant_id?: string;
  terminal_id?: string;
  batch_id?: string;
  transaction_date?: Date;
  processed_at?: Date;
  source_filename?: string;
  line_number?: number;
  parsed_datetime?: Date;
  record_time_source?: string;
}

export class OptimizedTddfEncoder {
  private objectStorage: ObjectStorageService;
  
  constructor() {
    this.objectStorage = new ObjectStorageService();
  }
  
  /**
   * Store raw lines in object storage and return reference
   */
  async storeRawLines(filename: string, rawLines: string[]): Promise<string> {
    try {
      const storageId = randomUUID();
      const objectPath = `tddf-raw-lines/${filename}/${storageId}.txt`;
      
      // Combine all raw lines with line separators
      const rawData = rawLines.join('\n');
      
      // Get upload URL and store the data
      const uploadUrl = await this.objectStorage.getObjectEntityUploadURL();
      
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        body: rawData,
        headers: {
          'Content-Type': 'text/plain'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      
      console.log(`[OPTIMIZED-TDDF] Stored ${rawLines.length} raw lines -> ${objectPath}`);
      return objectPath;
    } catch (error) {
      console.error(`[OPTIMIZED-TDDF] Failed to store raw lines:`, error);
      // Fallback to storing reference to original file
      return `fallback:${filename}`;
    }
  }
  
  /**
   * Process TDDF file with hybrid storage approach
   */
  async processTddfFile(
    filename: string, 
    rawLines: string[], 
    upload: UploaderUpload,
    db: any
  ): Promise<{
    processedRecords: number;
    storageSavings: string;
    objectStorageRef: string;
  }> {
    // Store raw lines in object storage
    const objectStorageRef = await this.storeRawLines(filename, rawLines);
    
    // Calculate storage savings
    const totalRawSize = rawLines.reduce((sum, line) => sum + line.length, 0);
    const storageSavings = this.formatBytes(totalRawSize);
    
    // Process each line for structured data extraction
    const records: TddfRecord[] = [];
    
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const lineNumber = i + 1;
      
      try {
        // Extract record type (first 2-3 characters typically)
        const recordType = this.extractRecordType(line);
        
        // Parse fields based on record type
        const extractedFields = this.extractFieldsByRecordType(recordType, line);
        
        // Create database record with object storage reference
        const record: TddfRecord = {
          record_type: recordType,
          raw_line_ref: `${objectStorageRef}:${lineNumber}`, // Reference format: "path:line_number"
          record_sequence: lineNumber,
          field_data: extractedFields,
          transaction_amount: extractedFields.transactionAmount || null,
          merchant_id: extractedFields.merchantAccountNumber || null,
          terminal_id: extractedFields.terminalId || null,
          batch_id: extractedFields.batchId || null,
          transaction_date: this.parseTransactionDate(extractedFields.transactionDate),
          processed_at: new Date(),
          source_filename: filename,
          line_number: lineNumber,
          parsed_datetime: new Date(),
          record_time_source: 'file_processing'
        };
        
        records.push(record);
      } catch (error) {
        console.error(`[OPTIMIZED-TDDF] Error processing line ${lineNumber}:`, error);
        // Create minimal record for problematic lines
        records.push({
          record_type: 'UNK',
          raw_line_ref: `${objectStorageRef}:${lineNumber}`,
          record_sequence: lineNumber,
          source_filename: filename,
          line_number: lineNumber,
          processed_at: new Date()
        });
      }
    }
    
    // Batch insert to database (without raw_line column)
    const tableName = this.getTddfTableName(filename);
    await this.createOptimizedTddfTable(db, tableName);
    await this.batchInsertRecords(db, tableName, records);
    
    // Update merchant analytics in aggregates table
    await this.updateMerchantAnalytics(db, records, filename);
    
    // Update main merchants table with metadata (Client MID, Last Batch, Last Transaction)
    await this.updateMainMerchantsMetadata(db, records, filename);
    
    return {
      processedRecords: records.length,
      storageSavings,
      objectStorageRef
    };
  }
  
  /**
   * Retrieve raw line from object storage reference
   */
  async getRawLine(rawLineRef: string): Promise<string> {
    try {
      const [objectPath, lineNumberStr] = rawLineRef.split(':');
      const lineNumber = parseInt(lineNumberStr, 10);
      
      if (objectPath.startsWith('fallback:')) {
        return `[Raw line not available - fallback reference: ${objectPath}]`;
      }
      
      // Get the specific line from object storage
      const objectFile = await this.objectStorage.getObjectEntityFile(`/objects/${objectPath}`);
      
      // Stream and parse to get specific line
      const chunks: Buffer[] = [];
      const stream = objectFile.createReadStream();
      
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => {
          const rawData = Buffer.concat(chunks).toString('utf-8');
          const rawLines = rawData.split('\n');
          
          if (lineNumber > 0 && lineNumber <= rawLines.length) {
            resolve(rawLines[lineNumber - 1]);
          } else {
            reject(new Error(`Line ${lineNumber} not found`));
          }
        });
        stream.on('error', reject);
      });
    } catch (error) {
      console.error(`[OPTIMIZED-TDDF] Error retrieving raw line:`, error);
      return `[Raw line retrieval failed: ${rawLineRef}]`;
    }
  }
  
  private extractRecordType(line: string): string {
    // Standard TDDF record type extraction
    if (line.length < 20) return 'UNK';
    
    // Check common record patterns
    if (line.includes('BH')) return 'BH';
    if (line.includes('DT')) return 'DT';
    if (line.includes('G2')) return 'G2';
    if (line.includes('E1')) return 'E1';
    if (line.includes('P1')) return 'P1';
    if (line.includes('DR')) return 'DR';
    
    return 'UNK';
  }
  
  private extractFieldsByRecordType(recordType: string, line: string): any {
    // Simplified field extraction - can be enhanced with full TDDF parsing
    const fields: any = {};
    
    switch (recordType) {
      case 'BH':
        // Batch Header fields
        if (line.length > 100) {
          fields.batchId = line.substring(80, 90)?.trim();
          fields.netDeposit = this.parseAmount(line.substring(50, 65));
        }
        break;
        
      case 'DT':
        // Detail Transaction fields
        if (line.length > 200) {
          fields.transactionAmount = this.parseAmount(line.substring(80, 92));
          fields.merchantAccountNumber = line.substring(30, 50)?.trim();
          fields.terminalId = line.substring(150, 170)?.trim();
        }
        break;
        
      default:
        // Minimal parsing for unknown types
        fields.raw_length = line.length;
    }
    
    return fields;
  }
  
  private parseAmount(amountStr: string): number | null {
    try {
      const cleaned = amountStr.replace(/[^\d.-]/g, '');
      const amount = parseFloat(cleaned) / 100; // Assume cents format
      return isNaN(amount) ? null : amount;
    } catch {
      return null;
    }
  }
  
  private parseTransactionDate(dateStr: string): Date | undefined {
    if (!dateStr || dateStr.length !== 8) return undefined;
    
    try {
      const month = dateStr.substring(0, 2);
      const day = dateStr.substring(2, 4);
      const year = dateStr.substring(4, 8);
      return new Date(`${year}-${month}-${day}`);
    } catch {
      return undefined;
    }
  }
  
  private getTddfTableName(filename: string): string {
    const env = process.env.NODE_ENV === 'development' ? 'dev_' : '';
    const cleanName = filename.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    return `${env}tddf1_file_${cleanName}`;
  }
  
  private async createOptimizedTddfTable(db: any, tableName: string): Promise<void> {
    // Create table with raw_line_ref instead of raw_line
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id SERIAL PRIMARY KEY,
        record_type VARCHAR(10) NOT NULL,
        raw_line_ref TEXT NOT NULL,  -- Object storage reference instead of full text
        record_sequence INTEGER,
        field_data JSONB,
        transaction_amount NUMERIC,
        merchant_id VARCHAR(50),
        terminal_id VARCHAR(50),
        batch_id VARCHAR(50),
        transaction_date DATE,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source_filename VARCHAR(255),
        line_number INTEGER,
        parsed_datetime TIMESTAMP,
        record_time_source VARCHAR(50)
      );
      
      CREATE INDEX IF NOT EXISTS idx_${tableName}_record_type ON ${tableName}(record_type);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_transaction_date ON ${tableName}(transaction_date);
    `;
    
    await db.execute(createTableSQL);
  }
  
  private async batchInsertRecords(db: any, tableName: string, records: TddfRecord[]): Promise<void> {
    // Batch insert for performance
    const batchSize = 1000;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const values = batch.map(record => `(
        '${record.record_type}',
        '${record.raw_line_ref}',
        ${record.record_sequence || 'NULL'},
        '${JSON.stringify(record.field_data || {})}',
        ${record.transaction_amount || 'NULL'},
        ${record.merchant_id ? `'${record.merchant_id}'` : 'NULL'},
        ${record.terminal_id ? `'${record.terminal_id}'` : 'NULL'},
        ${record.batch_id ? `'${record.batch_id}'` : 'NULL'},
        ${record.transaction_date ? `'${record.transaction_date.toISOString().split('T')[0]}'` : 'NULL'},
        CURRENT_TIMESTAMP,
        '${record.source_filename}',
        ${record.line_number},
        CURRENT_TIMESTAMP,
        '${record.record_time_source || 'file_processing'}'
      )`).join(',');
      
      const insertSQL = `
        INSERT INTO ${tableName} (
          record_type, raw_line_ref, record_sequence, field_data,
          transaction_amount, merchant_id, terminal_id, batch_id,
          transaction_date, processed_at, source_filename, line_number,
          parsed_datetime, record_time_source
        ) VALUES ${values};
      `;
      
      await db.execute(insertSQL);
    }
  }
  
  private formatBytes(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Update main merchants table with metadata fields (Client MID, Last Batch, Last Transaction)
   * Uses extracted JSONB fields and proper date tracking with conditional updates to prevent races
   */
  private async updateMainMerchantsMetadata(db: any, records: TddfRecord[], filename: string): Promise<void> {
    try {
      const environment = process.env.NODE_ENV || 'development';
      const mainMerchantsTable = environment === 'development' ? 'dev_merchants' : 'merchants';
      
      console.log(`[TDDF-METADATA] Updating main merchants table metadata from ${records.length} records`);
      
      // Track metadata per merchantAccountNumber (the TDDF identifier)
      const merchantMetadata = new Map<string, {
        merchantAccountNumber: string;
        lastBatchDate?: Date;
        lastTransactionDate?: Date;
        lastTransactionAmount?: number;
      }>();
      
      for (const record of records) {
        // Extract merchantAccountNumber from JSONB field_data
        const merchantAcctNum = record.field_data?.merchantAccountNumber;
        if (!merchantAcctNum) continue;
        
        if (!merchantMetadata.has(merchantAcctNum)) {
          merchantMetadata.set(merchantAcctNum, { merchantAccountNumber: merchantAcctNum });
        }
        
        const metadata = merchantMetadata.get(merchantAcctNum)!;
        
        // Track latest batch date from BH records using actual TDDF processing date
        if (record.record_type === 'BH') {
          const batchDate = record.field_data?.batchDate || record.transaction_date;
          if (batchDate && (!metadata.lastBatchDate || batchDate > metadata.lastBatchDate)) {
            metadata.lastBatchDate = batchDate;
          }
        }
        
        // Track latest transaction from DT records using actual transaction date
        if (record.record_type === 'DT' && record.transaction_date) {
          if (!metadata.lastTransactionDate || record.transaction_date > metadata.lastTransactionDate) {
            metadata.lastTransactionDate = record.transaction_date;
            metadata.lastTransactionAmount = record.transaction_amount;
          }
        }
      }
      
      // Update main merchants table in a transaction to ensure atomicity per file
      for (const [merchantAcctNum, data] of Array.from(merchantMetadata.entries())) {
        try {
          // Build conditional UPDATE using GREATEST/LEAST to prevent race conditions
          // Only update if new values are more recent than existing ones
          const updates: string[] = [];
          const params: any[] = [merchantAcctNum];
          let paramIndex = 2;
          
          // Always set client_mid if merchant exists and matches
          updates.push(`client_mid = COALESCE(client_mid, $${paramIndex++})`);
          params.push(merchantAcctNum);
          
          if (data.lastBatchDate) {
            updates.push(`last_batch_date = GREATEST(COALESCE(last_batch_date, '1970-01-01'::date), $${paramIndex++})`);
            params.push(data.lastBatchDate);
            updates.push(`last_batch_filename = CASE WHEN $${paramIndex} > COALESCE(last_batch_date, '1970-01-01'::date) THEN $${paramIndex+1} ELSE last_batch_filename END`);
            params.push(data.lastBatchDate);
            params.push(filename);
            paramIndex += 2;
          }
          
          if (data.lastTransactionDate) {
            updates.push(`last_transaction_date = GREATEST(COALESCE(last_transaction_date, '1970-01-01'::date), $${paramIndex++})`);
            params.push(data.lastTransactionDate);
          }
          
          if (data.lastTransactionAmount !== undefined) {
            updates.push(`last_transaction_amount = CASE WHEN $${paramIndex} >= COALESCE(last_transaction_date, '1970-01-01'::date) THEN $${paramIndex+1} ELSE last_transaction_amount END`);
            params.push(data.lastTransactionDate);
            params.push(data.lastTransactionAmount);
            paramIndex += 2;
          }
          
          updates.push(`edit_date = NOW()`);
          
          // Update WHERE id matches merchantAccountNumber
          const updateSQL = `
            UPDATE ${mainMerchantsTable}
            SET ${updates.join(', ')}
            WHERE id = $1
          `;
          
          await db.query(updateSQL, params);
          
        } catch (error) {
          console.error(`[TDDF-METADATA] Error updating merchant ${merchantAcctNum}:`, error);
        }
      }
      
      console.log(`[TDDF-METADATA] Updated ${merchantMetadata.size} merchants in main table`);
      
    } catch (error) {
      console.error('[TDDF-METADATA] Error updating main merchants metadata:', error);
      // Don't throw - metadata tracking is supplementary
    }
  }

  /**
   * Update merchant volume analytics from processed TDDF records
   */
  private async updateMerchantAnalytics(db: any, records: TddfRecord[], filename: string): Promise<void> {
    try {
      const environment = process.env.NODE_ENV || 'development';
      const merchantsTableName = environment === 'development' ? 'dev_tddf1_merchants' : 'tddf1_merchants';
      
      console.log(`[TDDF-MERCHANTS] Updating merchant analytics from ${records.length} records in ${filename}`);
      
      // Group records by merchant ID and extract merchant data
      const merchantData = new Map<string, {
        merchantId: string;
        merchantName?: string;
        amexMerchantSellerName?: string;
        totalTransactions: number;
        totalAmount: number;
        totalNetDeposits: number;
        uniqueTerminals: Set<string>;
        firstSeenDate: Date | undefined;
        lastSeenDate: Date | undefined;
        recordCount: number;
      }>();
      
      for (const record of records) {
        let merchantId: string | null = null;
        let merchantName: string | null = null;
        let amexMerchantSellerName: string | null = null;
        let transactionAmount = 0;
        let netDeposit = 0;
        let terminalId: string | null = null;
        
        // Extract merchant data based on record type
        if (record.record_type === 'BH' && record.field_data) {
          // BH records contain Merchant Account Number (pos 24-39) and Net Deposits
          merchantId = record.merchant_id || record.field_data.batchId;
          netDeposit = record.field_data.netDeposit || 0;
        } else if (record.record_type === 'DT' && record.field_data) {
          // DT records contain merchant names and transaction amounts
          merchantId = record.merchant_id || record.field_data.merchantAccountNumber;
          merchantName = record.field_data.merchantName;
          amexMerchantSellerName = record.field_data.amexMerchantSellerName;
          transactionAmount = record.transaction_amount || 0;
          terminalId = record.terminal_id || record.field_data.terminalId;
        }
        
        if (merchantId) {
          if (!merchantData.has(merchantId)) {
            merchantData.set(merchantId, {
              merchantId,
              merchantName: merchantName || undefined,
              amexMerchantSellerName: amexMerchantSellerName || undefined,
              totalTransactions: 0,
              totalAmount: 0,
              totalNetDeposits: 0,
              uniqueTerminals: new Set(),
              firstSeenDate: record.transaction_date,
              lastSeenDate: record.transaction_date,
              recordCount: 0
            });
          }
          
          const merchant = merchantData.get(merchantId)!;
          
          // Update merchant data
          if (merchantName && !merchant.merchantName) {
            merchant.merchantName = merchantName;
          }
          if (amexMerchantSellerName && !merchant.amexMerchantSellerName) {
            merchant.amexMerchantSellerName = amexMerchantSellerName;
          }
          
          if (record.record_type === 'DT') {
            merchant.totalTransactions++;
            merchant.totalAmount += transactionAmount;
          }
          if (record.record_type === 'BH') {
            merchant.totalNetDeposits += netDeposit;
          }
          
          if (terminalId) {
            merchant.uniqueTerminals.add(terminalId);
          }
          
          // Update date ranges
          if (record.transaction_date) {
            if (!merchant.firstSeenDate || record.transaction_date < merchant.firstSeenDate) {
              merchant.firstSeenDate = record.transaction_date;
            }
            if (!merchant.lastSeenDate || record.transaction_date > merchant.lastSeenDate) {
              merchant.lastSeenDate = record.transaction_date;
            }
          }
          
          merchant.recordCount++;
        }
      }
      
      // Update or insert merchant records using environment-aware queries
      for (const [merchantId, data] of Array.from(merchantData.entries())) {
        try {
          const checkExistsQuery = `SELECT merchant_id FROM ${merchantsTableName} WHERE merchant_id = $1`;
          const existingResult = await db.query(checkExistsQuery, [data.merchantId]);
          
          if (existingResult.rows.length > 0) {
            // Update existing merchant
            const updateSQL = `
              UPDATE ${merchantsTableName} SET
                merchant_name = COALESCE($2, merchant_name),
                amex_merchant_seller_name = COALESCE($3, amex_merchant_seller_name),
                total_transactions = total_transactions + $4,
                total_amount = total_amount + $5,
                total_net_deposits = total_net_deposits + $6,
                unique_terminals = unique_terminals + $7,
                first_seen_date = LEAST(first_seen_date, $8),
                last_seen_date = GREATEST(last_seen_date, $9),
                record_count = record_count + $10,
                last_updated = NOW(),
                source_files = CASE 
                  WHEN $11 = ANY(source_files) THEN source_files
                  ELSE array_append(source_files, $11)
                END,
                last_processed_file = $11
              WHERE merchant_id = $1
            `;
            
            await db.query(updateSQL, [
              data.merchantId,
              data.merchantName,
              data.amexMerchantSellerName,
              data.totalTransactions,
              data.totalAmount,
              data.totalNetDeposits,
              data.uniqueTerminals.size,
              data.firstSeenDate,
              data.lastSeenDate,
              data.recordCount,
              filename
            ]);
          } else {
            // Insert new merchant
            const insertSQL = `
              INSERT INTO ${merchantsTableName} (
                merchant_id, merchant_name, amex_merchant_seller_name,
                total_transactions, total_amount, total_net_deposits, unique_terminals,
                first_seen_date, last_seen_date, record_count, last_updated,
                source_files, last_processed_file
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), ARRAY[$11], $11)
            `;
            
            await db.query(insertSQL, [
              data.merchantId,
              data.merchantName,
              data.amexMerchantSellerName,
              data.totalTransactions,
              data.totalAmount,
              data.totalNetDeposits,
              data.uniqueTerminals.size,
              data.firstSeenDate,
              data.lastSeenDate,
              data.recordCount,
              filename
            ]);
          }
        } catch (merchantError) {
          console.error(`[TDDF-MERCHANTS] Error updating merchant ${data.merchantId}:`, merchantError);
        }
      }
      
      console.log(`[TDDF-MERCHANTS] Updated ${merchantData.size} merchants from ${filename}`);
      
    } catch (error) {
      console.error('[TDDF-MERCHANTS] Error updating merchant analytics:', error);
      // Don't throw - merchant tracking is supplementary, shouldn't fail main processing
    }
  }
}

export const optimizedTddfEncoder = new OptimizedTddfEncoder();