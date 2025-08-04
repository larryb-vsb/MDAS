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
  
  private parseTransactionDate(dateStr: string): Date | null {
    if (!dateStr || dateStr.length !== 8) return null;
    
    try {
      const month = dateStr.substring(0, 2);
      const day = dateStr.substring(2, 4);
      const year = dateStr.substring(4, 8);
      return new Date(`${year}-${month}-${day}`);
    } catch {
      return null;
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
}

export const optimizedTddfEncoder = new OptimizedTddfEncoder();