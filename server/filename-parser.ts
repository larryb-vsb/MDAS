/**
 * TDDF Filename Parser
 * Extracts metadata from TDDF filenames following the pattern:
 * VERMNTSB.6759_TDDF_830_08072025_083341.TSYSO
 */

export interface TddfFilenameMetadata {
  original_filename: string;
  file_processing_date: Date | null;
  file_sequence_number: string | null;
  file_processing_time: string | null;
  file_system_id: string | null;
  mainframe_process_data: {
    filename_pattern: string;
    parsing_success: boolean;
    extracted_parts: {
      system_prefix?: string;
      file_type?: string;
      sequence?: string;
      date_string?: string;
      time_string?: string;
      extension?: string;
    };
    processing_datetime?: string;
  };
}

/**
 * Parse TDDF filename to extract metadata
 * Pattern: SYSTEM.ID_TDDF_SEQUENCE_MMDDYYYY_HHMMSS.EXT
 * Example: VERMNTSB.6759_TDDF_830_08072025_083341.TSYSO
 */
export function parseTddfFilename(filename: string): TddfFilenameMetadata {
  const metadata: TddfFilenameMetadata = {
    original_filename: filename,
    file_processing_date: null,
    file_sequence_number: null,
    file_processing_time: null,
    file_system_id: null,
    mainframe_process_data: {
      filename_pattern: filename,
      parsing_success: false,
      extracted_parts: {}
    }
  };

  try {
    // Pattern: SYSTEM.ID_TDDF_SEQUENCE_MMDDYYYY_HHMMSS.EXT
    const tddfPattern = /^([^_]+)_TDDF_(\d+)_(\d{8})_(\d{6})\.(.+)$/i;
    const match = filename.match(tddfPattern);
    
    if (match) {
      const [, systemId, sequence, dateString, timeString, extension] = match;
      
      // Extract system ID and file type
      metadata.file_system_id = systemId;
      metadata.file_sequence_number = sequence;
      metadata.file_processing_time = timeString;
      
      // Parse date (MMDDYYYY format)
      const month = parseInt(dateString.substring(0, 2), 10);
      const day = parseInt(dateString.substring(2, 4), 10);
      const year = parseInt(dateString.substring(4, 8), 10);
      
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
        metadata.file_processing_date = new Date(year, month - 1, day);
      }
      
      // Build processing datetime
      if (metadata.file_processing_date && timeString.length === 6) {
        const hour = parseInt(timeString.substring(0, 2), 10);
        const minute = parseInt(timeString.substring(2, 4), 10);
        const second = parseInt(timeString.substring(4, 6), 10);
        
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
          const processingDateTime = new Date(metadata.file_processing_date);
          processingDateTime.setHours(hour, minute, second);
          
          metadata.mainframe_process_data.processing_datetime = processingDateTime.toISOString();
        }
      }
      
      // Store extracted parts
      metadata.mainframe_process_data.extracted_parts = {
        system_prefix: systemId,
        file_type: 'TDDF',
        sequence: sequence,
        date_string: dateString,
        time_string: timeString,
        extension: extension
      };
      
      metadata.mainframe_process_data.parsing_success = true;
      
      console.log(`[FILENAME-PARSER] Successfully parsed ${filename}:`, {
        system: systemId,
        sequence: sequence,
        date: metadata.file_processing_date?.toISOString().split('T')[0],
        time: timeString
      });
    } else {
      console.log(`[FILENAME-PARSER] Filename ${filename} doesn't match TDDF pattern`);
      
      // Try to extract any useful information from non-standard filenames
      const parts = filename.split('_');
      if (parts.length > 1) {
        metadata.file_system_id = parts[0];
        metadata.mainframe_process_data.extracted_parts.system_prefix = parts[0];
      }
    }
  } catch (error) {
    console.error(`[FILENAME-PARSER] Error parsing filename ${filename}:`, error);
    metadata.mainframe_process_data.parsing_success = false;
  }
  
  return metadata;
}

/**
 * Check if filename can be used for duplicate detection
 */
export function canDetectDuplicates(metadata: TddfFilenameMetadata): boolean {
  return !!(
    metadata.file_system_id &&
    metadata.file_sequence_number &&
    metadata.file_processing_date
  );
}

/**
 * Generate a unique key for duplicate detection
 */
export function generateDuplicateKey(metadata: TddfFilenameMetadata): string | null {
  if (!canDetectDuplicates(metadata)) {
    return null;
  }
  
  const dateString = metadata.file_processing_date?.toISOString().split('T')[0] || 'unknown';
  return `${metadata.file_system_id}_${metadata.file_sequence_number}_${dateString}`;
}

/**
 * ACH Filename Metadata (for AH0314P1 files)
 */
export interface AchFilenameMetadata {
  original_filename: string;
  business_day: Date | null;
  file_sequence_number: string | null;
  file_type: string | null;
  parsing_success: boolean;
}

/**
 * Parse ACH filename to extract metadata
 * Pattern: PREFIX_AH0314P1_YYYYMMDD_SEQ-TIMESTAMP.ext
 * Example: 801203_AH0314P1_20241022_001-20260106225932.csv
 */
export function parseAchFilename(filename: string): AchFilenameMetadata {
  const metadata: AchFilenameMetadata = {
    original_filename: filename,
    business_day: null,
    file_sequence_number: null,
    file_type: null,
    parsing_success: false
  };

  try {
    // Pattern: PREFIX_AH0314P1_YYYYMMDD_SEQ-TIMESTAMP
    const achPattern = /^[^_]+_AH0314P1_(\d{8})_(\d{3})-/i;
    const match = filename.match(achPattern);
    
    if (match) {
      const [, dateString, sequence] = match;
      
      // Parse date (YYYYMMDD format)
      const year = parseInt(dateString.substring(0, 4), 10);
      const month = parseInt(dateString.substring(4, 6), 10);
      const day = parseInt(dateString.substring(6, 8), 10);
      
      if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        metadata.business_day = new Date(year, month - 1, day);
      }
      
      metadata.file_sequence_number = sequence;
      metadata.file_type = 'transaction_csv';
      metadata.parsing_success = true;
      
      console.log(`[FILENAME-PARSER] Successfully parsed ACH filename ${filename}:`, {
        business_day: metadata.business_day?.toISOString().split('T')[0],
        sequence: sequence
      });
    }
  } catch (error) {
    console.error(`[FILENAME-PARSER] Error parsing ACH filename ${filename}:`, error);
    metadata.parsing_success = false;
  }
  
  return metadata;
}

/**
 * Extract business day from any filename type
 * Returns { business_day: Date | null, file_sequence: string | null }
 */
export function extractBusinessDayFromFilename(filename: string): { business_day: Date | null, file_sequence: string | null } {
  // Try ACH pattern first (AH0314P1 files)
  if (filename.includes('AH0314P1')) {
    const achMetadata = parseAchFilename(filename);
    if (achMetadata.parsing_success) {
      return {
        business_day: achMetadata.business_day,
        file_sequence: achMetadata.file_sequence_number
      };
    }
  }
  
  // Try TDDF pattern
  const tddfMetadata = parseTddfFilename(filename);
  if (tddfMetadata.mainframe_process_data.parsing_success) {
    return {
      business_day: tddfMetadata.file_processing_date,
      file_sequence: tddfMetadata.file_sequence_number
    };
  }
  
  return { business_day: null, file_sequence: null };
}