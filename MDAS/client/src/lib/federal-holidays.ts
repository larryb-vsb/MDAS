/**
 * US Federal Holidays and Non-Processing Days Utility
 * 
 * This module provides functionality to identify US federal holidays
 * and other non-processing days for financial systems.
 */

import { format, getYear, getMonth, getDate, getDay, addDays, subDays } from "date-fns";

export interface Holiday {
  name: string;
  date: Date;
  type: 'federal' | 'bank' | 'market';
  isFixed: boolean; // true for fixed dates, false for calculated dates
}

/**
 * Calculate Easter Sunday for a given year using the algorithm
 */
function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Calculate Martin Luther King Jr. Day (3rd Monday in January)
 */
function calculateMLKDay(year: number): Date {
  const jan1 = new Date(year, 0, 1);
  const firstMonday = new Date(year, 0, 1 + (8 - jan1.getDay()) % 7);
  return addDays(firstMonday, 14); // 3rd Monday
}

/**
 * Calculate Presidents Day (3rd Monday in February)
 */
function calculatePresidentsDay(year: number): Date {
  const feb1 = new Date(year, 1, 1);
  const firstMonday = new Date(year, 1, 1 + (8 - feb1.getDay()) % 7);
  return addDays(firstMonday, 14); // 3rd Monday
}

/**
 * Calculate Memorial Day (last Monday in May)
 */
function calculateMemorialDay(year: number): Date {
  const may31 = new Date(year, 4, 31);
  const lastMonday = subDays(may31, (may31.getDay() + 6) % 7);
  return lastMonday;
}

/**
 * Calculate Labor Day (1st Monday in September)
 */
function calculateLaborDay(year: number): Date {
  const sep1 = new Date(year, 8, 1);
  const firstMonday = new Date(year, 8, 1 + (8 - sep1.getDay()) % 7);
  return firstMonday;
}

/**
 * Calculate Columbus Day (2nd Monday in October)
 */
function calculateColumbusDay(year: number): Date {
  const oct1 = new Date(year, 9, 1);
  const firstMonday = new Date(year, 9, 1 + (8 - oct1.getDay()) % 7);
  return addDays(firstMonday, 7); // 2nd Monday
}

/**
 * Calculate Thanksgiving Day (4th Thursday in November)
 */
function calculateThanksgiving(year: number): Date {
  const nov1 = new Date(year, 10, 1);
  const firstThursday = new Date(year, 10, 1 + (11 - nov1.getDay()) % 7);
  return addDays(firstThursday, 21); // 4th Thursday
}

/**
 * Get all US federal holidays for a given year
 */
export function getFederalHolidays(year: number): Holiday[] {
  const holidays: Holiday[] = [
    // Fixed Date Holidays
    {
      name: "New Year's Day",
      date: new Date(year, 0, 1),
      type: 'federal',
      isFixed: true
    },
    {
      name: "Independence Day",
      date: new Date(year, 6, 4),
      type: 'federal',
      isFixed: true
    },
    {
      name: "Veterans Day",
      date: new Date(year, 10, 11),
      type: 'federal',
      isFixed: true
    },
    {
      name: "Christmas Day",
      date: new Date(year, 11, 25),
      type: 'federal',
      isFixed: true
    },
    
    // Calculated Date Holidays
    {
      name: "Martin Luther King Jr. Day",
      date: calculateMLKDay(year),
      type: 'federal',
      isFixed: false
    },
    {
      name: "Presidents Day",
      date: calculatePresidentsDay(year),
      type: 'federal',
      isFixed: false
    },
    {
      name: "Memorial Day",
      date: calculateMemorialDay(year),
      type: 'federal',
      isFixed: false
    },
    {
      name: "Labor Day",
      date: calculateLaborDay(year),
      type: 'federal',
      isFixed: false
    },
    {
      name: "Columbus Day",
      date: calculateColumbusDay(year),
      type: 'federal',
      isFixed: false
    },
    {
      name: "Thanksgiving Day",
      date: calculateThanksgiving(year),
      type: 'federal',
      isFixed: false
    }
  ];

  // Handle weekend adjustments for fixed holidays
  return holidays.map(holiday => {
    if (holiday.isFixed) {
      const dayOfWeek = holiday.date.getDay();
      if (dayOfWeek === 0) { // Sunday - observe on Monday
        return {
          ...holiday,
          date: addDays(holiday.date, 1),
          name: `${holiday.name} (Observed)`
        };
      } else if (dayOfWeek === 6) { // Saturday - observe on Friday
        return {
          ...holiday,
          date: subDays(holiday.date, 1),
          name: `${holiday.name} (Observed)`
        };
      }
    }
    return holiday;
  });
}

/**
 * Check if a given date is a US federal holiday
 */
export function isFederalHoliday(date: Date): Holiday | null {
  const year = getYear(date);
  const holidays = getFederalHolidays(year);
  
  const dateString = format(date, 'yyyy-MM-dd');
  
  for (const holiday of holidays) {
    const holidayString = format(holiday.date, 'yyyy-MM-dd');
    if (dateString === holidayString) {
      return holiday;
    }
  }
  
  return null;
}

/**
 * Check if a given date is a non-processing day (weekend or federal holiday)
 */
export function isNonProcessingDay(date: Date): {
  isNonProcessing: boolean;
  reason: string;
  holiday?: Holiday;
} {
  const dayOfWeek = getDay(date);
  
  // Check for weekends
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      isNonProcessing: true,
      reason: dayOfWeek === 0 ? 'Sunday' : 'Saturday'
    };
  }
  
  // Check for federal holidays
  const holiday = isFederalHoliday(date);
  if (holiday) {
    return {
      isNonProcessing: true,
      reason: 'Federal Holiday',
      holiday
    };
  }
  
  return {
    isNonProcessing: false,
    reason: 'Processing Day'
  };
}

/**
 * Get the next processing day from a given date
 */
export function getNextProcessingDay(date: Date): Date {
  let nextDay = addDays(date, 1);
  
  while (isNonProcessingDay(nextDay).isNonProcessing) {
    nextDay = addDays(nextDay, 1);
  }
  
  return nextDay;
}

/**
 * Get the previous processing day from a given date
 */
export function getPreviousProcessingDay(date: Date): Date {
  let prevDay = subDays(date, 1);
  
  while (isNonProcessingDay(prevDay).isNonProcessing) {
    prevDay = subDays(prevDay, 1);
  }
  
  return prevDay;
}

/**
 * Get all non-processing days for a given year
 */
export function getAllNonProcessingDays(year: number): Date[] {
  const nonProcessingDays: Date[] = [];
  
  // Add all federal holidays
  const holidays = getFederalHolidays(year);
  holidays.forEach(holiday => {
    nonProcessingDays.push(holiday.date);
  });
  
  // Add all weekends
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  
  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    const dayOfWeek = getDay(currentDate);
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      nonProcessingDays.push(new Date(currentDate));
    }
    currentDate = addDays(currentDate, 1);
  }
  
  return nonProcessingDays.sort((a, b) => a.getTime() - b.getTime());
}