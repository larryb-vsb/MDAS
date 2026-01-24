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
 * 2.0.4 - Terminal VAR number normalization (consistent VXXXXXXX format)
 * 2.0.5 - Merchant Alias System for duplicate prevention
 * 2.0.6 - Archive heatmap, file type filters, enhanced ACH filename parsing
 * 2.0.7 - AH0314P1 fuzzy matching with pg_trgm, restore buttons in file search
 * 2.0.8 - History page Processing tab for TSYS reconciliation
 * 2.0.9 - History page Transactions tab for DT records by transaction date
 * 2.0.10 - Email Settings page, Merchants flagged filter, Client Since column
 * 2.0.11 - Dashboard improvements (Last 3 Days Processing, TDDF Merchants Today)
 */

export const APP_VERSION = '2.0.11';
export const BUILD_DATE = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format