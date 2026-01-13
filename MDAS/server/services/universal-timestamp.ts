/**
 * Universal Timestamping Service for TDDF Record Ingestion
 * 
 * Author: Larry B. & Replit Agent (Alex)
 * Date: 2025-08-01
 * 
 * Implements the universal timestamping hierarchy as specified in the feature document:
 * 1. DT embedded date (transactionDate) → record_time_source = "dt_line"
 * 2. BH embedded date (batchDate) → record_time_source = "bh_line"  
 * 3. File timestamp + line offset → record_time_source = "file_timestamp + line_offset"
 * 4. Current ingestion time → record_time_source = "ingest_time"
 */

export interface UniversalTimestamp {
  parsed_datetime: Date;
  record_time_source: string;
  file_timestamp: Date | null;
}

export interface TDDFRecordForTimestamp {
  line_number: number;
  record_type: string;
  extracted_fields: any;
  filename: string;
}

/**
 * Extract file timestamp from TDDF filename
 * Format: VERMNTSB.6759_TDDF_2400_MMDDYYYY_HHMMSS.TSYSO
 */
export function extractFileTimestamp(filename: string): Date | null {
  try {
    // Match pattern: MMDDYYYY_HHMMSS
    const match = filename.match(/(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})(\d{2})/);
    if (!match) {
      console.warn(`[UNIVERSAL-TIMESTAMP] Could not extract timestamp from filename: ${filename}`);
      return null;
    }

    const [, month, day, year, hour, minute, second] = match;
    
    // Construct ISO date string: YYYY-MM-DDTHH:mm:ss
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
    
    const fileDate = new Date(isoString);
    
    if (isNaN(fileDate.getTime())) {
      console.warn(`[UNIVERSAL-TIMESTAMP] Invalid date parsed from filename: ${filename} → ${isoString}`);
      return null;
    }

    console.log(`[UNIVERSAL-TIMESTAMP] Extracted file timestamp: ${filename} → ${fileDate.toISOString()}`);
    return fileDate;
    
  } catch (error) {
    console.error(`[UNIVERSAL-TIMESTAMP] Error extracting timestamp from filename ${filename}:`, error);
    return null;
  }
}

/**
 * Parse transaction date from DT record
 * Format: YYYY-MM-DD (from extracted_fields.transactionDate)
 */
export function parseDTTransactionDate(extractedFields: any): Date | null {
  try {
    const transactionDate = extractedFields?.transactionDate;
    if (!transactionDate) return null;

    const date = new Date(transactionDate);
    if (isNaN(date.getTime())) return null;

    return date;
  } catch (error) {
    console.error('[UNIVERSAL-TIMESTAMP] Error parsing DT transaction date:', error);
    return null;
  }
}

/**
 * Parse batch date from BH record  
 * Format: YYYY-MM-DD (from extracted_fields.batchDate)
 */
export function parseBHBatchDate(extractedFields: any): Date | null {
  try {
    const batchDate = extractedFields?.batchDate;
    if (!batchDate) return null;

    const date = new Date(batchDate);
    if (isNaN(date.getTime())) return null;

    return date;
  } catch (error) {
    console.error('[UNIVERSAL-TIMESTAMP] Error parsing BH batch date:', error);
    return null;
  }
}

/**
 * Compute universal timestamp using the hierarchy from the feature document
 * 
 * @param record - TDDF record data
 * @param lineOffsetMs - Milliseconds per line for file timestamp + offset (default: 100ms)
 * @returns Universal timestamp data
 */
export function computeUniversalTimestamp(
  record: TDDFRecordForTimestamp,
  lineOffsetMs: number = 100
): UniversalTimestamp {
  
  const { line_number, record_type, extracted_fields, filename } = record;
  
  console.log(`[UNIVERSAL-TIMESTAMP] Computing for ${record_type} line ${line_number} from ${filename}`);

  // HIERARCHY 1: DT embedded transaction date
  if (record_type === 'DT') {
    const dtDate = parseDTTransactionDate(extracted_fields);
    if (dtDate) {
      console.log(`[UNIVERSAL-TIMESTAMP] Using DT transaction date: ${dtDate.toISOString()}`);
      return {
        parsed_datetime: dtDate,
        record_time_source: 'dt_line',
        file_timestamp: extractFileTimestamp(filename)
      };
    }
  }

  // HIERARCHY 2: BH embedded batch date
  if (record_type === 'BH') {
    const bhDate = parseBHBatchDate(extracted_fields);
    if (bhDate) {
      console.log(`[UNIVERSAL-TIMESTAMP] Using BH batch date: ${bhDate.toISOString()}`);
      return {
        parsed_datetime: bhDate,
        record_time_source: 'bh_line',
        file_timestamp: extractFileTimestamp(filename)
      };
    }
  }

  // HIERARCHY 3: File timestamp + line offset
  const fileTimestamp = extractFileTimestamp(filename);
  if (fileTimestamp) {
    // Add line offset: 100ms per line number
    const offsetMs = (line_number - 1) * lineOffsetMs;
    const parsedDatetime = new Date(fileTimestamp.getTime() + offsetMs);
    
    console.log(`[UNIVERSAL-TIMESTAMP] Using file timestamp + offset: ${parsedDatetime.toISOString()} (${offsetMs}ms offset)`);
    return {
      parsed_datetime: parsedDatetime,
      record_time_source: 'file_timestamp + line_offset',
      file_timestamp: fileTimestamp
    };
  }

  // HIERARCHY 4: Current ingestion time (fallback)
  const ingestTime = new Date();
  console.log(`[UNIVERSAL-TIMESTAMP] Using ingestion time fallback: ${ingestTime.toISOString()}`);
  return {
    parsed_datetime: ingestTime,
    record_time_source: 'ingest_time',
    file_timestamp: null
  };
}

/**
 * Update existing TDDF records with universal timestamps
 * This can be used to backfill existing records
 */
export async function backfillUniversalTimestamps(
  pool: any,
  tableName: string = 'dev_tddf_jsonb',
  batchSize: number = 1000
): Promise<{ updated: number; errors: number }> {
  
  console.log(`[UNIVERSAL-TIMESTAMP] Starting backfill for table: ${tableName}`);
  
  let totalUpdated = 0;
  let totalErrors = 0;
  let offset = 0;
  
  while (true) {
    try {
      // Get batch of records without universal timestamps
      const result = await pool.query(`
        SELECT id, line_number, record_type, extracted_fields, filename
        FROM ${tableName}
        WHERE parsed_datetime IS NULL
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [batchSize, offset]);
      
      const records = result.rows;
      if (records.length === 0) break;
      
      console.log(`[UNIVERSAL-TIMESTAMP] Processing batch: ${records.length} records (offset: ${offset})`);
      
      for (const record of records) {
        try {
          const timestamp = computeUniversalTimestamp({
            line_number: record.line_number,
            record_type: record.record_type,
            extracted_fields: record.extracted_fields,
            filename: record.filename
          });
          
          // Update the record
          await pool.query(`
            UPDATE ${tableName}
            SET 
              parsed_datetime = $1,
              record_time_source = $2,
              file_timestamp = $3
            WHERE id = $4
          `, [
            timestamp.parsed_datetime,
            timestamp.record_time_source,
            timestamp.file_timestamp,
            record.id
          ]);
          
          totalUpdated++;
          
        } catch (error) {
          console.error(`[UNIVERSAL-TIMESTAMP] Error updating record ${record.id}:`, error);
          totalErrors++;
        }
      }
      
      offset += batchSize;
      
      // Log progress
      if (totalUpdated % 10000 === 0) {
        console.log(`[UNIVERSAL-TIMESTAMP] Progress: ${totalUpdated} records updated, ${totalErrors} errors`);
      }
      
    } catch (error) {
      console.error(`[UNIVERSAL-TIMESTAMP] Batch processing error at offset ${offset}:`, error);
      totalErrors++;
      break;
    }
  }
  
  console.log(`[UNIVERSAL-TIMESTAMP] Backfill complete: ${totalUpdated} updated, ${totalErrors} errors`);
  return { updated: totalUpdated, errors: totalErrors };
}