import { format, formatDistanceToNow, isValid } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

// User timezone setting - you can change this to your preferred timezone
const USER_TIMEZONE = 'America/Chicago'; // CST/CDT timezone

/**
 * Converts UTC timestamp to user's preferred timezone
 * @param utcTimestamp - UTC timestamp string from database (may or may not have Z suffix)
 * @returns Date object in user's timezone
 */
export function utcToLocal(utcTimestamp: string | null): Date | null {
  if (!utcTimestamp) return null;
  
  // Handle database timestamps that don't have Z suffix (assume they are UTC from server)
  let dateString = utcTimestamp;
  if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('T')) {
    // Format: "2025-07-20 01:22:22.961" - add Z to indicate UTC
    dateString = dateString.replace(' ', 'T') + 'Z';
  } else if (!dateString.endsWith('Z') && dateString.includes('T') && !dateString.includes('+')) {
    // Format: "2025-07-20T01:22:22.961" - add Z to indicate UTC  
    dateString = dateString + 'Z';
  }
  
  const utcDate = new Date(dateString);
  
  // Validate the date
  if (!isValid(utcDate)) {
    console.warn('Invalid date provided:', utcTimestamp, 'converted to:', dateString);
    return null;
  }
  
  // Convert UTC to user's timezone
  return toZonedTime(utcDate, USER_TIMEZONE);
}

/**
 * Formats a UTC timestamp to user's timezone time string
 * @param utcTimestamp - UTC timestamp from database (may or may not have Z suffix)
 * @param formatStr - date-fns format string
 * @returns Formatted timezone-aware time string or fallback
 */
export function formatLocalTime(utcTimestamp: string | null, formatStr: string = "MMM d, h:mm a", fallback: string = "-"): string {
  if (!utcTimestamp) return fallback;
  
  // Handle database timestamps that don't have Z suffix (assume they are UTC from server)
  let dateString = utcTimestamp;
  if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('T')) {
    // Format: "2025-07-20 01:22:22.961" - add Z to indicate UTC
    dateString = dateString.replace(' ', 'T') + 'Z';
  } else if (!dateString.endsWith('Z') && dateString.includes('T') && !dateString.includes('+')) {
    // Format: "2025-07-20T01:22:22.961" - add Z to indicate UTC  
    dateString = dateString + 'Z';
  }
  
  const utcDate = new Date(dateString);
  if (!isValid(utcDate)) return fallback;
  
  // Format in user's timezone
  return formatInTimeZone(utcDate, USER_TIMEZONE, formatStr);
}

/**
 * Formats a UTC timestamp to relative time (e.g., "3 minutes ago") 
 * @param utcTimestamp - UTC timestamp from database (may or may not have Z suffix)
 * @returns Relative time string or fallback
 */
export function formatRelativeTime(utcTimestamp: string | null, fallback: string = "Never"): string {
  if (!utcTimestamp) return fallback;
  
  // Handle database timestamps that don't have Z suffix (assume they are UTC from server)
  let dateString = utcTimestamp;
  if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('T')) {
    // Format: "2025-07-20 01:22:22.961" - add Z to indicate UTC
    dateString = dateString.replace(' ', 'T') + 'Z';
  } else if (!dateString.endsWith('Z') && dateString.includes('T') && !dateString.includes('+')) {
    // Format: "2025-07-20T01:22:22.961" - add Z to indicate UTC  
    dateString = dateString + 'Z';
  }
  
  const utcDate = new Date(dateString);
  if (!isValid(utcDate)) return fallback;
  
  // Convert to user's timezone for accurate relative time calculation
  const userDate = toZonedTime(utcDate, USER_TIMEZONE);
  return formatDistanceToNow(userDate, { addSuffix: true });
}

/**
 * Smart date formatter for upload times in user's timezone
 * @param utcTimestamp - UTC timestamp from database (may or may not have Z suffix)
 * @returns Formatted string in user's timezone
 */
export function formatUploadTime(utcTimestamp: string | null): string {
  if (!utcTimestamp) return "-";
  
  // Handle database timestamps that don't have Z suffix (assume they are UTC from server)
  let dateString = utcTimestamp;
  if (!dateString.endsWith('Z') && !dateString.includes('+') && !dateString.includes('T')) {
    // Format: "2025-07-20 01:22:22.961" - add Z to indicate UTC
    dateString = dateString.replace(' ', 'T') + 'Z';
  } else if (!dateString.endsWith('Z') && dateString.includes('T') && !dateString.includes('+')) {
    // Format: "2025-07-20T01:22:22.961" - add Z to indicate UTC  
    dateString = dateString + 'Z';
  }
  
  const utcDate = new Date(dateString);
  if (!isValid(utcDate)) return "-";
  
  return formatInTimeZone(utcDate, USER_TIMEZONE, "MMM d, h:mm a");
}

/**
 * Formats full date with seconds for detailed timestamps in user's timezone
 * @param utcTimestamp - UTC timestamp from database  
 * @returns Full formatted date and time in user's timezone
 */
export function formatFullDateTime(utcTimestamp: string | null): string {
  if (!utcTimestamp) return "-";
  
  const utcDate = new Date(utcTimestamp);
  if (!isValid(utcDate)) return "-";
  
  const userDate = toZonedTime(utcDate, USER_TIMEZONE);
  const relativeTime = formatDistanceToNow(userDate, { addSuffix: true });
  const absoluteTime = formatInTimeZone(utcDate, USER_TIMEZONE, "MMM d, yyyy 'at' h:mm:ss a zzz");
  
  return `${relativeTime} (${absoluteTime})`;
}

/**
 * Formats date for display in tables (compact format) in user's timezone
 * @param utcTimestamp - UTC timestamp from database
 * @returns Compact formatted date in user's timezone
 */
export function formatTableDate(utcTimestamp: string | null): string {
  return formatLocalTime(utcTimestamp, "MMM d, yyyy h:mm a", "-");
}

/**
 * Formats date for TDDF records (date only, no time since TDDF contains only date data)
 * @param dateString - Date string from database (format: "2023-02-03")
 * @returns Date-only format without timezone conversion
 */
export function formatTddfDate(dateString: string | null): string {
  if (!dateString) return "N/A";
  
  try {
    // Handle both ISO format from API (e.g., "2025-07-25T00:00:00.000Z") 
    // and date-only strings (e.g., "2023-02-03")
    const date = new Date(dateString);
    
    if (!isValid(date)) return "N/A";
    
    return format(date, "MMM d, yyyy");
  } catch (error) {
    console.warn('Invalid TDDF date provided:', dateString);
    return "N/A";
  }
}

/**
 * Formats date for tooltips and detailed views in user's timezone
 * @param utcTimestamp - UTC timestamp from database
 * @returns Detailed formatted date in user's timezone
 */
export function formatDetailedDate(utcTimestamp: string | null): string {
  if (!utcTimestamp) return "Never";
  
  const utcDate = new Date(utcTimestamp);
  if (!isValid(utcDate)) return "Never";
  
  return formatInTimeZone(utcDate, USER_TIMEZONE, "PPpp zzz");
}