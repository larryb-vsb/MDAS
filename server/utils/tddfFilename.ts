/**
 * TDDF Filename Parser Utility
 * Extracts scheduled and actual timestamps from TDDF filenames
 * Pattern: _(\d{3,4})_(\d{8})_(\d{6})
 */

export interface TddfTimestamps {
  scheduledDateTime: Date | null;
  actualDateTime: Date | null;
  processingDelaySeconds: number | null;
  parseSuccess: boolean;
  errorMessage?: string;
}

export function parseTddfFilename(filename: string): TddfTimestamps {
  try {
    // Extract using regex pattern _(\d{3,4})_(\d{8})_(\d{6})
    const match = filename.match(/_(\d{3,4})_(\d{8})_(\d{6})/);
    
    if (!match) {
      return {
        scheduledDateTime: null,
        actualDateTime: null,
        processingDelaySeconds: null,
        parseSuccess: false,
        errorMessage: 'No matching pattern found'
      };
    }

    const [, schedRaw, dateRaw, actualRaw] = match;

    // Parse base date (MMDDYYYY format)
    const month = parseInt(dateRaw.substring(0, 2), 10);
    const day = parseInt(dateRaw.substring(2, 4), 10);
    const year = parseInt(dateRaw.substring(4, 8), 10);
    
    const baseDate = new Date(year, month - 1, day); // month is 0-indexed
    
    if (isNaN(baseDate.getTime())) {
      return {
        scheduledDateTime: null,
        actualDateTime: null,
        processingDelaySeconds: null,
        parseSuccess: false,
        errorMessage: 'Invalid date format'
      };
    }

    // Handle scheduled time
    let scheduledDateTime: Date;
    if (schedRaw === '2400') {
      // 2400 means midnight of next day
      scheduledDateTime = new Date(baseDate);
      scheduledDateTime.setDate(scheduledDateTime.getDate() + 1);
      scheduledDateTime.setHours(0, 0, 0, 0);
    } else {
      // Pad scheduled time to HHMM format
      const schedPadded = schedRaw.padStart(4, '0');
      const schedHours = parseInt(schedPadded.substring(0, 2), 10);
      const schedMinutes = parseInt(schedPadded.substring(2, 4), 10);
      
      if (schedHours > 23 || schedMinutes > 59) {
        return {
          scheduledDateTime: null,
          actualDateTime: null,
          processingDelaySeconds: null,
          parseSuccess: false,
          errorMessage: 'Invalid scheduled time'
        };
      }
      
      scheduledDateTime = new Date(baseDate);
      scheduledDateTime.setHours(schedHours, schedMinutes, 0, 0);
    }

    // Parse actual time (HHMMSS format)
    if (actualRaw.length !== 6) {
      return {
        scheduledDateTime: null,
        actualDateTime: null,
        processingDelaySeconds: null,
        parseSuccess: false,
        errorMessage: 'Invalid actual time format'
      };
    }

    const actualHours = parseInt(actualRaw.substring(0, 2), 10);
    const actualMinutes = parseInt(actualRaw.substring(2, 4), 10);
    const actualSeconds = parseInt(actualRaw.substring(4, 6), 10);
    
    if (actualHours > 23 || actualMinutes > 59 || actualSeconds > 59) {
      return {
        scheduledDateTime: null,
        actualDateTime: null,
        processingDelaySeconds: null,
        parseSuccess: false,
        errorMessage: 'Invalid actual time values'
      };
    }

    const actualDateTime = new Date(baseDate);
    actualDateTime.setHours(actualHours, actualMinutes, actualSeconds, 0);

    // Calculate processing delay
    const delayMs = actualDateTime.getTime() - scheduledDateTime.getTime();
    const delaySeconds = Math.round(delayMs / 1000);

    return {
      scheduledDateTime,
      actualDateTime,
      processingDelaySeconds: delaySeconds,
      parseSuccess: true
    };

  } catch (error) {
    return {
      scheduledDateTime: null,
      actualDateTime: null,
      processingDelaySeconds: null,
      parseSuccess: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown parsing error'
    };
  }
}

export function formatProcessingTime(delaySeconds: number | null): string {
  if (delaySeconds === null) return 'N/A';
  
  const absDelay = Math.abs(delaySeconds);
  
  if (absDelay < 60) {
    return `${delaySeconds}s`;
  } else if (absDelay < 3600) {
    const minutes = Math.round(delaySeconds / 60 * 10) / 10; // 1 decimal place
    return `${minutes}min`;
  } else {
    const hours = Math.round(delaySeconds / 3600 * 10) / 10; // 1 decimal place
    return `${hours}hr`;
  }
}