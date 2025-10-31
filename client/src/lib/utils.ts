import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatCompactCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  if (absAmount < 1000) {
    return `${sign}$${absAmount.toFixed(2)}`;
  } else if (absAmount < 999500) {
    const k = absAmount / 1000;
    return `${sign}$${k.toFixed(2)}K`;
  } else if (absAmount < 999500000) {
    const m = absAmount / 1000000;
    return `${sign}$${m.toFixed(2)}M`;
  } else {
    const b = absAmount / 1000000000;
    return `${sign}$${b.toFixed(2)}B`;
  }
}

export interface TddfTimestamps {
  scheduledDateTime: Date | null;
  actualDateTime: Date | null;
  processingDelaySeconds: number | null;
  parseSuccess: boolean;
  errorMessage?: string;
  scheduledSlotRaw: string | null;
  scheduledSlotLabel: string | null;
  slotDayOffset: number;
}

export function parseTddfFilename(filename: string): TddfTimestamps {
  try {
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

    const month = parseInt(dateRaw.substring(0, 2), 10);
    const day = parseInt(dateRaw.substring(2, 4), 10);
    const year = parseInt(dateRaw.substring(4, 8), 10);
    
    const baseDate = new Date(year, month - 1, day);
    
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

    let scheduledDateTime: Date;
    let scheduledSlotLabel: string;
    let slotDayOffset: number;

    if (schedRaw === '2400') {
      slotDayOffset = 1;
      scheduledSlotLabel = '24:00';
      
      scheduledDateTime = new Date(baseDate);
      scheduledDateTime.setDate(scheduledDateTime.getDate() + 1);
      scheduledDateTime.setHours(0, 0, 0, 0);
      
      const actualDateTime = new Date(baseDate);
      actualDateTime.setDate(actualDateTime.getDate() + 1);
      actualDateTime.setHours(actualHours, actualMinutes, actualSeconds, 0);
      
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
      slotDayOffset = 0;
      
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
      
      scheduledSlotLabel = `${schedHours.toString().padStart(2, '0')}:${schedMinutes.toString().padStart(2, '0')}`;
      
      scheduledDateTime = new Date(baseDate);
      scheduledDateTime.setHours(schedHours, schedMinutes, 0, 0);
      
      const actualDateTime = new Date(baseDate);
      actualDateTime.setHours(actualHours, actualMinutes, actualSeconds, 0);

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
    const minutes = Math.round(delaySeconds / 60 * 10) / 10;
    return `${minutes}min`;
  } else {
    const hours = Math.round(delaySeconds / 3600 * 10) / 10;
    return `${hours}hr`;
  }
}
