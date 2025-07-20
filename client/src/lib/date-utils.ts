import { format, formatDistanceToNow, isValid } from "date-fns";

/**
 * Converts UTC timestamp to local Date object
 * @param utcTimestamp - UTC timestamp string from database
 * @returns Date object in local timezone
 */
export function utcToLocal(utcTimestamp: string | null): Date | null {
  if (!utcTimestamp) return null;
  
  // Parse the UTC timestamp - assumes it's in ISO format
  const utcDate = new Date(utcTimestamp);
  
  // Validate the date
  if (!isValid(utcDate)) {
    console.warn('Invalid date provided:', utcTimestamp);
    return null;
  }
  
  // Return the date object - JavaScript Date automatically handles timezone conversion
  return utcDate;
}

/**
 * Formats a UTC timestamp to local time string
 * @param utcTimestamp - UTC timestamp from database
 * @param formatStr - date-fns format string
 * @returns Formatted local time string or fallback
 */
export function formatLocalTime(utcTimestamp: string | null, formatStr: string = "MMM d, h:mm a", fallback: string = "-"): string {
  const localDate = utcToLocal(utcTimestamp);
  if (!localDate) return fallback;
  
  return format(localDate, formatStr);
}

/**
 * Formats a UTC timestamp to relative time (e.g., "3 minutes ago")
 * @param utcTimestamp - UTC timestamp from database
 * @returns Relative time string or fallback
 */
export function formatRelativeTime(utcTimestamp: string | null, fallback: string = "Never"): string {
  const localDate = utcToLocal(utcTimestamp);
  if (!localDate) return fallback;
  
  return formatDistanceToNow(localDate, { addSuffix: true });
}

/**
 * Smart date formatter for upload times
 * Shows relative time for recent dates, absolute time for older dates
 * @param utcTimestamp - UTC timestamp from database
 * @returns Formatted string appropriate for context
 */
export function formatUploadTime(utcTimestamp: string | null): string {
  const localDate = utcToLocal(utcTimestamp);
  if (!localDate) return "-";
  
  return format(localDate, "MMM d, h:mm a");
}

/**
 * Formats full date with seconds for detailed timestamps
 * @param utcTimestamp - UTC timestamp from database
 * @returns Full formatted local date and time with relative time
 */
export function formatFullDateTime(utcTimestamp: string | null): string {
  const localDate = utcToLocal(utcTimestamp);
  if (!localDate) return "-";
  
  const relativeTime = formatDistanceToNow(localDate, { addSuffix: true });
  const absoluteTime = format(localDate, "MMM d, yyyy 'at' h:mm:ss a");
  
  return `${relativeTime} (${absoluteTime})`;
}

/**
 * Formats date for display in tables (compact format)
 * @param utcTimestamp - UTC timestamp from database
 * @returns Compact formatted date
 */
export function formatTableDate(utcTimestamp: string | null): string {
  return formatLocalTime(utcTimestamp, "MMM d, h:mm a", "-");
}

/**
 * Formats date for tooltips and detailed views
 * @param utcTimestamp - UTC timestamp from database
 * @returns Detailed formatted date
 */
export function formatDetailedDate(utcTimestamp: string | null): string {
  return formatLocalTime(utcTimestamp, "PPpp", "Never");
}