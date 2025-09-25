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
  // New fields for scheduled slot information
  scheduledSlotRaw: string | null;           // Raw token like "2400" or "830"
  scheduledSlotLabel: string | null;         // Formatted like "08:30" or "24:00 next-day"
  slotDayOffset: number;                     // 0 for same day, 1 for next day
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
        errorMessage: 'No matching pattern found',
        scheduledSlotRaw: null,
        scheduledSlotLabel: null,
        slotDayOffset: 0
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
        errorMessage: 'Invalid date format',
        scheduledSlotRaw: null,
        scheduledSlotLabel: null,
        slotDayOffset: 0
      };
    }

    // Parse actual time (HHMMSS format) first
    if (actualRaw.length !== 6) {
      return {
        scheduledDateTime: null,
        actualDateTime: null,
        processingDelaySeconds: null,
        parseSuccess: false,
        errorMessage: 'Invalid actual time format',
        scheduledSlotRaw: null,
        scheduledSlotLabel: null,
        slotDayOffset: 0
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
        errorMessage: 'Invalid actual time values',
        scheduledSlotRaw: null,
        scheduledSlotLabel: null,
        slotDayOffset: 0
      };
    }

    // Handle scheduled time and create slot information
    let scheduledDateTime: Date;
    let scheduledSlotLabel: string;
    let slotDayOffset: number;

    if (schedRaw === '2400') {
      // 2400 means midnight of next day
      slotDayOffset = 1;
      scheduledSlotLabel = '24:00 next-day';
      
      // Create scheduled time on next day
      scheduledDateTime = new Date(baseDate);
      scheduledDateTime.setDate(scheduledDateTime.getDate() + 1);
      scheduledDateTime.setHours(0, 0, 0, 0);
      
      // Align actual time to the same day as scheduled (next day)
      const actualDateTime = new Date(baseDate);
      actualDateTime.setDate(actualDateTime.getDate() + 1);
      actualDateTime.setHours(actualHours, actualMinutes, actualSeconds, 0);
      
      // Calculate processing delay
      const delayMs = actualDateTime.getTime() - scheduledDateTime.getTime();
      const delaySeconds = Math.round(delayMs / 1000);

      return {
        scheduledDateTime,
        actualDateTime,
        processingDelaySeconds: delaySeconds,
        parseSuccess: true,
        scheduledSlotRaw: schedRaw,
        scheduledSlotLabel,
        slotDayOffset
      };
    } else {
      // Regular scheduled time (same day)
      slotDayOffset = 0;
      
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
          errorMessage: 'Invalid scheduled time',
          scheduledSlotRaw: null,
          scheduledSlotLabel: null,
          slotDayOffset: 0
        };
      }
      
      // Format slot label (e.g., "08:30")
      scheduledSlotLabel = `${schedHours.toString().padStart(2, '0')}:${schedMinutes.toString().padStart(2, '0')}`;
      
      // Both scheduled and actual times on same day (base date)
      scheduledDateTime = new Date(baseDate);
      scheduledDateTime.setHours(schedHours, schedMinutes, 0, 0);
      
      const actualDateTime = new Date(baseDate);
      actualDateTime.setHours(actualHours, actualMinutes, actualSeconds, 0);

      // Calculate processing delay
      const delayMs = actualDateTime.getTime() - scheduledDateTime.getTime();
      const delaySeconds = Math.round(delayMs / 1000);

      return {
        scheduledDateTime,
        actualDateTime,
        processingDelaySeconds: delaySeconds,
        parseSuccess: true,
        scheduledSlotRaw: schedRaw,
        scheduledSlotLabel,
        slotDayOffset
      };
    }

  } catch (error) {
    return {
      scheduledDateTime: null,
      actualDateTime: null,
      processingDelaySeconds: null,
      parseSuccess: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown parsing error',
      scheduledSlotRaw: null,
      scheduledSlotLabel: null,
      slotDayOffset: 0
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