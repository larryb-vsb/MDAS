/**
 * Application version information
 * 
 * Version history:
 * 1.0.0 - Initial release
 * 1.1.0 - Added user authentication and database backup features
 * 1.2.0 - Added environment separation and improved backup system
 * 2.0.0 - Major refactoring, TDDF API, hierarchical storage, object storage
 * 2.0.1 - Schema sync fixes
 * 2.0.2 - Buffer polyfill for PDF exports
 * 2.0.3 - Production fixes (Hold, orphan cleanup, Neon errors)
 */

export const APP_VERSION = '2.0.3';
export const BUILD_DATE = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format