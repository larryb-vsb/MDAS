/**
 * TDDF Line Reconstructor Service
 * Rebuilds original TDDF raw lines from structured database records
 * Stores reconstructed lines in object storage for hybrid optimization
 */

import { ObjectStorageService } from '../objectStorage';

export class TddfLineReconstructorService {
  private objectStorage: ObjectStorageService;

  constructor() {
    this.objectStorage = new ObjectStorageService();
  }

  /**
   * Reconstruct raw TDDF line from structured field data
   * @param recordType - BH, DT, P1, E1, G2, etc.
   * @param fieldData - Extracted structured fields from database
   * @returns Reconstructed raw TDDF line string
   */
  reconstructRawLine(recordType: string, fieldData: any): string {
    try {
      switch (recordType) {
        case 'BH':
          return this.reconstructBHLine(fieldData);
        case 'DT':
          return this.reconstructDTLine(fieldData);
        case 'P1':
          return this.reconstructP1Line(fieldData);
        case 'E1':
          return this.reconstructE1Line(fieldData);
        case 'G2':
          return this.reconstructG2Line(fieldData);
        default:
          console.warn(`[RECONSTRUCTOR] Unknown record type: ${recordType}`);
          return `${recordType}[UNKNOWN_RECORD_TYPE]`;
      }
    } catch (error) {
      console.error(`[RECONSTRUCTOR] Error reconstructing ${recordType} line:`, error);
      return `${recordType}[RECONSTRUCTION_ERROR]`;
    }
  }

  /**
   * Reconstruct BH (Batch Header) line from field data
   */
  private reconstructBHLine(fields: any): string {
    // BH format: positions 1-2=BH, 3-14=Account, 15-20=Batch, 21-28=Date, etc.
    let line = 'BH'; // Record type (positions 1-2)
    
    // Merchant Account Number (positions 3-14, 12 chars)
    line += this.padField(fields.merchantAccountNumber || '', 12, 'right');
    
    // Batch ID (positions 15-20, 6 chars)
    line += this.padField(fields.batchId || '', 6, 'left', '0');
    
    // Batch Date (positions 21-28, 8 chars MMDDCCYY)
    line += this.formatDateField(fields.batchDate || '', 8);
    
    // Net Deposit (positions 69-83, 15 chars, right-justified)
    line += this.padField('', 40, 'right'); // Filler positions 29-68
    line += this.padField(fields.netDeposit || '0', 15, 'left', '0');
    
    // Add any remaining fields based on TDDF specification
    line = this.padLineToLength(line, 80); // Standard TDDF line length
    
    return line;
  }

  /**
   * Reconstruct DT (Detail Transaction) line from field data  
   */
  private reconstructDTLine(fields: any): string {
    let line = 'DT'; // Record type (positions 1-2)
    
    // Transaction Amount (positions 3-17, 15 chars)
    line += this.padField(fields.transactionAmount || '0', 15, 'left', '0');
    
    // Transaction Date (positions 18-25, 8 chars MMDDCCYY)
    line += this.formatDateField(fields.transactionDate || '', 8);
    
    // Terminal ID (positions 26-35, 10 chars)
    line += this.padField(fields.terminalId || '', 10, 'right');
    
    // Merchant Account (positions 36-47, 12 chars)
    line += this.padField(fields.merchantAccountNumber || '', 12, 'right');
    
    // Add remaining fields and pad to standard length
    line = this.padLineToLength(line, 80);
    
    return line;
  }

  /**
   * Reconstruct P1 (Parameter) line from field data
   */
  private reconstructP1Line(fields: any): string {
    let line = 'P1';
    
    // Parameter Code (positions 3-4)
    line += this.padField(fields.parameterCode || '', 2, 'right');
    
    // Parameter Value (positions 5-34, 30 chars)
    line += this.padField(fields.parameterValue || '', 30, 'right');
    
    line = this.padLineToLength(line, 80);
    return line;
  }

  /**
   * Reconstruct E1 (Error) line from field data
   */
  private reconstructE1Line(fields: any): string {
    let line = 'E1';
    
    // Error Code (positions 3-6, 4 chars)
    line += this.padField(fields.errorCode || '', 4, 'right');
    
    // Error Description (positions 7-46, 40 chars)
    line += this.padField(fields.errorDescription || '', 40, 'right');
    
    line = this.padLineToLength(line, 80);
    return line;
  }

  /**
   * Reconstruct G2 (Geographic) line from field data
   */
  private reconstructG2Line(fields: any): string {
    let line = 'G2';
    
    // Location Code (positions 3-12, 10 chars)
    line += this.padField(fields.locationCode || '', 10, 'right');
    
    // Geographic Data (positions 13-52, 40 chars)
    line += this.padField(fields.geographicData || '', 40, 'right');
    
    line = this.padLineToLength(line, 80);
    return line;
  }

  /**
   * Pad field to specified length with padding character
   */
  private padField(value: string, length: number, align: 'left' | 'right', padChar: string = ' '): string {
    const str = String(value || '');
    
    if (str.length >= length) {
      return str.substring(0, length);
    }
    
    const padding = padChar.repeat(length - str.length);
    return align === 'left' ? padding + str : str + padding;
  }

  /**
   * Format date field to TDDF specification (MMDDCCYY)
   */
  private formatDateField(dateValue: string | Date, length: number): string {
    if (!dateValue) {
      return this.padField('', length, 'right');
    }
    
    try {
      const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const fullYear = date.getFullYear();
      const century = String(Math.floor(fullYear / 100)).padStart(2, '0');
      const year = String(fullYear % 100).padStart(2, '0');
      
      return `${month}${day}${century}${year}`;
    } catch (error) {
      console.warn(`[RECONSTRUCTOR] Invalid date: ${dateValue}`);
      return this.padField('', length, 'right');
    }
  }

  /**
   * Pad line to standard TDDF length
   */
  private padLineToLength(line: string, targetLength: number): string {
    if (line.length >= targetLength) {
      return line.substring(0, targetLength);
    }
    return line + ' '.repeat(targetLength - line.length);
  }

  /**
   * Batch reconstruct raw lines for an entire TDDF file table
   * @param tableName - TDDF1 table name to process
   * @returns Object storage reference for reconstructed file
   */
  async reconstructFileFromTable(tableName: string): Promise<{
    objectStorageRef: string;
    totalLines: number;
    bytesSaved: number;
  }> {
    console.log(`[RECONSTRUCTOR] Starting reconstruction for table: ${tableName}`);
    
    // Query all records from table ordered by line number
    const { db } = await import('../db');
    const records = await db.query(`
      SELECT record_type, field_data, record_sequence, line_number
      FROM ${tableName}
      ORDER BY record_sequence ASC
    `);
    
    // Reconstruct each line
    const reconstructedLines: string[] = [];
    for (const record of records.rows) {
      const rawLine = this.reconstructRawLine(
        record.record_type,
        record.field_data
      );
      reconstructedLines.push(rawLine);
    }
    
    // Store reconstructed lines in object storage
    const combinedContent = reconstructedLines.join('\n');
    const uploadURL = await this.objectStorage.getObjectEntityUploadURL();
    
    const response = await fetch(uploadURL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': combinedContent.length.toString(),
      },
      body: combinedContent,
    });
    
    if (!response.ok) {
      throw new Error(`Object storage upload failed: ${response.status}`);
    }
    
    const bytesSaved = combinedContent.length;
    console.log(`[RECONSTRUCTOR] ✅ Reconstructed ${reconstructedLines.length} lines (${bytesSaved} bytes) to object storage`);
    
    // Update table to add object storage reference
    await db.query(`
      UPDATE ${tableName} 
      SET raw_line_ref = $1 || ':' || line_number
      WHERE raw_line_ref IS NULL OR raw_line_ref = ''
    `, [uploadURL]);
    
    return {
      objectStorageRef: uploadURL,
      totalLines: reconstructedLines.length,
      bytesSaved
    };
  }

  /**
   * Get reconstructed raw line for debugging/auditing
   */
  async getRawLineFromRef(rawLineRef: string): Promise<string> {
    try {
      const [objectPath, lineNumberStr] = rawLineRef.split(':');
      const lineNumber = parseInt(lineNumberStr, 10);
      
      // Get the specific line from object storage
      const response = await fetch(objectPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch from object storage: ${response.status}`);
      }
      
      const rawData = await response.text();
      const rawLines = rawData.split('\n');
      
      if (lineNumber > 0 && lineNumber <= rawLines.length) {
        return rawLines[lineNumber - 1]; // Convert to 0-based index
      } else {
        return `[Line ${lineNumber} not found in reconstructed data]`;
      }
    } catch (error) {
      console.error('[RECONSTRUCTOR] Error retrieving raw line:', error);
      return `[Error retrieving raw line: ${error instanceof Error ? error.message : String(error)}]`;
    }
  }
}