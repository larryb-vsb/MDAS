import { createReadStream, createWriteStream, promises as fsPromises, existsSync, writeFileSync, mkdirSync } from "fs";
import { logger } from "../shared/logger";
import path from "path";
import os from "os";
import archiver from "archiver";
import { parse as parseCSV } from "csv-parse";
import { format as formatCSV } from "fast-csv";
import { 
  merchants as merchantsTable, 
  transactions as transactionsTable,
  uploadedFiles as uploadedFilesTable,
  users as usersTable,
  apiUsers as apiUsersTable,
  auditLogs,
  auditLogs as auditLogsTable,
  systemLogs,
  securityLogs,
  apiTerminals as terminalsTable,
  tddfRecords as tddfRecordsTable,
  tddfRawImport as tddfRawImportTable,
  tddfBatchHeaders,
  schemaContent as schemaContentTable,
  subMerchantTerminals,
  merchantMccSchema,
  Merchant,
  Transaction,
  Terminal,
  TddfRecord,
  TddfRawImport,
  TddfBatchHeader,
  SubMerchantTerminal,
  MerchantMccSchema,
  InsertMerchant,
  InsertTransaction,
  InsertTerminal,
  InsertTddfRecord,
  InsertTddfRawImport,
  InsertUploadedFile,
  InsertSubMerchantTerminal,
  InsertMerchantMccSchema,
  User,
  InsertUser,
  ApiUser,
  InsertApiUser,
  AuditLog,
  InsertAuditLog,
  SystemLog,
  InsertSystemLog,
  SecurityLog,
  InsertSecurityLog,
  insertSchemaContentSchema,
  DevUpload,
  InsertDevUpload,
  devUploads,
  UploaderUpload,
  InsertUploaderUpload,
  uploaderUploads
} from "@shared/schema";
import { db, batchDb, sessionPool, pool } from "./db";
import { eq, gt, gte, lt, lte, and, or, count, desc, asc, sql, between, like, ilike, isNotNull, inArray, ne } from "drizzle-orm";
import { getTableName } from "./table-config";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { TraceNumberMapper } from './services/trace-number-mapper';


// Utility function to detect decommission-related terms in terminal names
function isTerminalDecommissioned(terminalName: string): boolean {
  if (!terminalName) return false;
  
  const lowerName = terminalName.toLowerCase();
  const decommissionKeywords = [
    'decommission',
    'decommissioned',
    'decomission',
    'decomissioned',
    'discontinued',
    'retired',
    'inactive',
    'unused',
    'disabled',
    'removed',
    'terminated',
    'closed',
    'shutdown',
    'shut down',
    'out of service',
    'offline permanently',
    'no longer in use'
  ];
  
  return decommissionKeywords.some(keyword => lowerName.includes(keyword));
}

// Interface for storage operations
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(insertUser: InsertUser): Promise<User>;
  updateUser(userId: number, userData: Partial<Omit<InsertUser, 'password'>>): Promise<User>;
  updateUserLastLogin(userId: number): Promise<void>;
  updateUserPassword(userId: number, newPassword: string): Promise<void>;
  deleteUser(userId: number): Promise<void>;
  hashPassword(password: string): Promise<string>;
  verifyPassword(supplied: string, stored: string): Promise<boolean>;

  // API User operations
  getApiUsers(): Promise<any[]>;
  getApiUserById(id: number): Promise<any | undefined>;
  getApiUserByKey(apiKey: string): Promise<any | undefined>;
  createApiUser(insertApiUser: any): Promise<any>;
  updateApiUser(id: number, userData: Partial<any>): Promise<any>;
  deleteApiUser(id: number): Promise<void>;
  updateApiUserUsage(apiKey: string): Promise<void>;
  
  // Log operations
  getSystemLogs(params: any): Promise<any>;
  getSecurityLogs(params: any): Promise<any>;
  formatLogsToCSV(logs: any[]): string;
  
  // Orphaned upload recovery
  getOrphanedUploads(): Promise<any[]>;
  recoverOrphanedUploads(fileIds: string[]): Promise<number>;

  // Session store for authentication
  sessionStore: session.Store;

  // Dev Upload operations for compressed storage testing
  createDevUpload(insertDevUpload: any): Promise<any>;


  getDevUploads(): Promise<any[]>;
  getDevUploadById(id: string): Promise<any | undefined>;

  // MMS Uploader operations (4-phase processing)
  createUploaderUpload(insertUploaderUpload: Partial<InsertUploaderUpload>): Promise<UploaderUpload>;
  getUploaderUploads(options?: { phase?: string; limit?: number; offset?: number }): Promise<UploaderUpload[]>;
  getUploaderUploadById(id: string): Promise<UploaderUpload | undefined>;
  updateUploaderUpload(id: string, updates: Partial<UploaderUpload>): Promise<UploaderUpload>;
  updateUploaderPhase(id: string, phase: string, phaseData?: Record<string, any>): Promise<UploaderUpload>;
  deleteUploaderUploads(uploadIds: string[]): Promise<void>;
  cancelUploaderEncoding(uploadIds: string[]): Promise<{ success: boolean; canceledCount: number; errors: string[] }>;
  setPreviousLevel(uploadIds: string[]): Promise<{ success: boolean; updatedCount: number; errors: string[] }>;

  // Terminal operations
  getTerminals(): Promise<Terminal[]>;
  getTerminalById(terminalId: number): Promise<Terminal | undefined>;
  getTerminalsByMasterMID(masterMID: string): Promise<Terminal[]>;
  createTerminal(insertTerminal: InsertTerminal): Promise<Terminal>;
  updateTerminal(terminalId: number, terminalData: Partial<InsertTerminal>): Promise<Terminal>;
  deleteTerminal(terminalId: number): Promise<void>;

  // SubMerchantTerminals operations
  getSubMerchantTerminals(): Promise<SubMerchantTerminal[]>;
  getSubMerchantTerminalsByMerchant(merchantId: string): Promise<SubMerchantTerminal[]>;
  getSubMerchantTerminalsByTerminal(terminalId: number): Promise<SubMerchantTerminal[]>;
  createSubMerchantTerminal(insertSubMerchantTerminal: InsertSubMerchantTerminal): Promise<SubMerchantTerminal>;
  updateSubMerchantTerminal(id: number, updates: Partial<InsertSubMerchantTerminal>): Promise<SubMerchantTerminal>;
  deleteSubMerchantTerminal(id: number): Promise<void>;
  performFuzzyMatching(merchantId: string): Promise<{ matched: number; suggestions: SubMerchantTerminal[] }>;

  // TDDF operations
  processTddfFileFromContent(
    content: string, 
    sourceFileId: string, 
    originalFilename: string
  ): Promise<{ rowsProcessed: number; tddfRecordsCreated: number; errors: number }>;
  
  // TDDF retry operations
  retryFailedTddfFile(fileId: string): Promise<{ success: boolean; message: string }>;
  retryAllFailedTddfFiles(): Promise<{ filesRetried: number; errors: string[] }>;
  
  // TDDF raw storage operations  
  storeTddfFileAsRawImport(content: string, fileId: string, filename: string): Promise<{ rowsStored: number; recordTypes: { [key: string]: number }; errors: number }>;
  
  // TDDF processing operations
  processPendingTddfDtRecords(fileId?: string, maxRecords?: number): Promise<{ processed: number; skipped: number; errors: number }>;
  processPendingTddfRecordsUnified(fileId?: string, maxRecords?: number): Promise<{ processed: number; skipped: number; errors: number }>;
  processPendingRawTddfLines(batchSize?: number): Promise<{ processed: number; skipped: number; errors: number }>;

  // TDDF merchant operations
  getTddfMerchants(options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{
    data: Array<{
      merchantName: string;
      merchantAccountNumber: string;
      mccCode: string;
      transactionTypeIdentifier: string;
      terminalCount: number;
      totalTransactions: number;
      totalAmount: number;
      lastTransactionDate: string;
      posRelativeCode?: string;
    }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;

  getTddfMerchantTerminals(merchantAccountNumber: string): Promise<Array<{
    terminalId: string;
    transactionCount: number;
    totalAmount: number;
    lastTransactionDate: string;
  }>>;

  getTddfMerchantDetails(merchantAccountNumber: string): Promise<{
    merchantName: string;
    merchantAccountNumber: string;
    totalTransactions: number;
    totalAmount: number;
    lastTransactionDate: string;
  } | null>;

  // Reprocessing skipped records operations
  getSkippedRecordsSummary(): Promise<{ skipReasons: Array<{ skipReason: string; recordType: string; count: number }>, totalSkipped: number }>;
  reprocessSkippedRecordsByReason(skipReason: string, recordType?: string, maxRecords?: number): Promise<{ processed: number; errors: number; details: string[] }>;
  fixSchemaIssuesAndReprocess(): Promise<{ schemaFixesApplied: number; recordsReprocessed: number; details: string[] }>;
  reprocessEmergencySkippedRecords(batchSize?: number): Promise<{ totalProcessed: number; totalErrors: number; breakdown: Record<string, { processed: number; errors: number }> }>;
  getSkippedRecordsErrorLog(limit?: number): Promise<Array<{ skipReason: string; recordType: string; errorDetails: string; count: number; sampleRawData: string }>>;

  // TDDF merchants cache operations
  refreshTddfMerchantsCache(): Promise<{ rebuilt: number; updated: Date; performance: { buildTimeMs: number; recordsProcessed: number } }>;
  getTddfMerchantsCacheStats(): Promise<{ totalMerchants: number; lastUpdated: Date; oldestRecord: Date; averageUpdateAge: number }>;

  // MCC TSYS Merchant Schema Configuration operations
  getMccSchemaFields(): Promise<MerchantMccSchema[]>;
  upsertMccSchemaField(fieldData: InsertMerchantMccSchema): Promise<MerchantMccSchema>;
  updateMccSchemaField(id: number, fieldData: Partial<InsertMerchantMccSchema>): Promise<MerchantMccSchema>;
  deleteMccSchemaFields(ids: number[]): Promise<void>;
  bulkUpsertMccSchemaFields(fields: InsertMerchantMccSchema[]): Promise<{ inserted: number; updated: number }>;

  // Merchant operations
  getMerchants(page: number, limit: number, status?: string, lastUpload?: string, search?: string, merchantType?: string, sortBy?: string, sortOrder?: "asc" | "desc"): Promise<{
    merchants: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;
  
  // Get merchant by ID with transactions
  getMerchantById(merchantId: string): Promise<{
    merchant: any;
    transactions: any[];
    analytics: {
      dailyStats: {
        transactions: number;
        revenue: number;
      };
      monthlyStats: {
        transactions: number;
        revenue: number;
      };
      transactionHistory: {
        name: string;
        transactions: number;
        revenue: number;
      }[];
    };
  }>;
  
  // Create a new merchant
  createMerchant(merchantData: InsertMerchant): Promise<Merchant>;
  
  // Update merchant details
  updateMerchant(merchantId: string, merchantData: Partial<InsertMerchant>): Promise<any>;
  
  // Delete multiple merchants
  deleteMerchants(merchantIds: string[], username?: string): Promise<void>;
  
  // Merge merchants - transfer all transactions from source merchants to target merchant
  mergeMerchants(targetMerchantId: string, sourceMerchantIds: string[], username?: string): Promise<{
    success: boolean;
    transactionsTransferred: number;
    merchantsRemoved: number;
    targetMerchant: Merchant;
  }>;
  
  // Transaction operations
  getTransactions(
    page: number, 
    limit: number, 
    merchantId?: string, 
    startDate?: string, 
    endDate?: string,
    type?: string,
    transactionId?: string
  ): Promise<{
    transactions: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;
  addTransaction(merchantId: string, transactionData: { amount: string, type: string, date: string }, username?: string): Promise<any>;
  
  getTransactionsByMerchantId(merchantId: string): Promise<Transaction[]>;
  deleteTransactions(transactionIds: string[], username?: string): Promise<void>;
  exportTransactionsToCSV(
    merchantId?: string, 
    startDate?: string, 
    endDate?: string,
    type?: string,
    transactionId?: string
  ): Promise<string>;
  exportMerchantsToCSV(
    startDate?: string, 
    endDate?: string
  ): Promise<string>;
  exportAllMerchantsForDateToCSV(
    targetDate: string
  ): Promise<string>;
  exportAllDataForDateToCSV(
    targetDate: string
  ): Promise<{ filePaths: string[]; zipPath: string }>;
  exportBatchSummaryToCSV(
    targetDate: string
  ): Promise<string>;
  
  // Dashboard stats
  getDashboardStats(): Promise<{
    totalMerchants: number;
    newMerchants: number;
    dailyTransactions: number;
    monthlyRevenue: number;
  }>;
  
  // File processing operations
  processUploadedFile(filePath: string, type: string, originalFilename: string): Promise<string>;
  combineAndProcessUploads(fileIds: string[]): Promise<void>;
  processTerminalFileFromContent(base64Content: string, sourceFileId?: string, sourceFilename?: string): Promise<{ rowsProcessed: number; terminalsCreated: number; terminalsUpdated: number; errors: number }>;
  generateTransactionsExport(): Promise<string>;
  generateMerchantsExport(): Promise<string>;
  
  // Audit log operations
  createAuditLog(auditLogData: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(entityType?: string, entityId?: string, page?: number, limit?: number): Promise<{
    logs: AuditLog[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    }
  }>;
  getEntityAuditHistory(entityType: string, entityId: string): Promise<AuditLog[]>;
  
  // Security log operations
  createSecurityLog(securityLogData: InsertSecurityLog): Promise<SecurityLog>;
  
  // System error logging
  logSystemError(
    errorMessage: string, 
    errorDetails?: any, 
    source?: string, 
    username?: string
  ): Promise<AuditLog>;
  
  // Enhanced file processing methods for real-time monitoring
  getQueuedFiles(): Promise<any[]>;
  getRecentlyProcessedFiles(limit: number): Promise<any[]>;
  
  // TDDF record operations
  getTddfRecords(options: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    merchantId?: string;
    search?: string;
    cardType?: string;
    vNumber?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{
    data: TddfRecord[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;
  getTddfRecordById(recordId: number): Promise<TddfRecord | undefined>;
  createTddfRecord(recordData: InsertTddfRecord): Promise<TddfRecord>;
  deleteTddfRecords(recordIds: number[]): Promise<void>;

  // TDDF merchant aggregation
  getTddfMerchants(options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{
    data: Array<{
      merchantName: string;
      merchantAccountNumber: string;
      mccCode: string;
      transactionTypeIdentifier: string;
      terminalCount: number;
      totalTransactions: number;
      totalAmount: number;
      lastTransactionDate: string;
      posRelativeCode?: string; // First 5 digits for terminal linking
    }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;
  
  // TDDF Raw Import operations
  createTddfRawImportRecords(records: InsertTddfRawImport[]): Promise<TddfRawImport[]>;
  getTddfRawImportByFileId(fileId: string): Promise<TddfRawImport[]>;
  markRawImportLineProcessed(lineId: number, processedIntoTable: string, processedRecordId: string): Promise<void>;
  markRawImportLineSkipped(lineId: number, skipReason: string): Promise<void>;
  processPendingRawTddfLines(batchSize?: number): Promise<{ processed: number; skipped: number; errors: number }>;
  getTddfRawProcessingStatus(): Promise<{ total: number; processed: number; pending: number; skipped: number; errors: number }>;
  
  // TDDF diagnostic methods
  analyzeStuckTddfLines(): Promise<any>;
  requeueStuckTddfLines(criteria: {
    recordTypes?: string[];
    sourceFileIds?: string[];
    olderThanHours?: number;
    batchSize?: number;
  }): Promise<any>;
  processNonDtPendingLines(batchSize: number): Promise<any>;
  getCompletedFilesWithPendingDTRecords(): Promise<any>;
  processPendingDTRecordsForFile(fileId: string): Promise<any>;
  skipNonDTRecordsForFile(fileId: string): Promise<any>;
  
  // Hierarchical TDDF migration methods
  getPendingDtCount(): Promise<number>;
  getHierarchicalRecordBreakdown(startTime: Date, endTime: Date): Promise<{
    dtCount: number;
    bhCount: number;
    p1Count: number;
    otherCount: number;
  }>;
  getHierarchicalTddfCount(): Promise<number>;
  getLegacyTddfCount(): Promise<number>;
  processPendingDtRecordsHierarchical(batchSize: number): Promise<{ processed: number; errors: number; sampleRecord?: any }>;
  processPendingTddfBhRecords(fileId?: string, maxRecords?: number): Promise<{ processed: number; skipped: number; errors: number }>;
  processPendingTddfP1Records(fileId?: string, maxRecords?: number): Promise<{ processed: number; skipped: number; errors: number }>;
  processPendingTddfRecordsSwitchBased(fileId?: string, batchSize?: number): Promise<{ totalProcessed: number; totalSkipped: number; totalErrors: number; breakdown: Record<string, { processed: number; skipped: number; errors: number }>; processingTime: number }>;
  getTddfBatchHeaders(options: {
    page?: number;
    limit?: number;
    merchantAccount?: string;
  }): Promise<{
    data: TddfBatchHeader[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;
  getTddfOtherRecords(options: {
    page?: number;
    limit?: number;
    recordType?: string;
  }): Promise<{
    data: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;

  // P1 Purchasing Extensions
  getTddfPurchasingExtensions(options: {
    page?: number;
    limit?: number;
  }): Promise<{
    data: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;

  // P2 Purchasing Extensions 2
  getTddfPurchasingExtensions2(options: {
    page?: number;
    limit?: number;
  }): Promise<{
    data: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;
  
  // TDDF merchant transaction operations
  getTddfMerchantTerminals(merchantAccountNumber: string): Promise<Array<{
    terminalId: string;
    transactionCount: number;
    totalAmount: number;
    lastTransactionDate: string;
  }>>;
  
  getTddfTransactionsByMerchant(merchantAccountNumber: string, options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
    dateFilter?: string;
  }): Promise<{
    data: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;
  
  getTddfMerchantDetails(merchantAccountNumber: string): Promise<{
    merchantName: string;
    merchantAccountNumber: string;  
    totalTransactions: number;
    totalAmount: number;
    lastTransactionDate: string;
  } | null>;
  
  // File operations
  getFileById(fileId: string): Promise<any>;
  
  // Records gauge peak value from database (direct access)
  getRecordsPeakFromDatabase(): Promise<{peakRecords: number, allSamples: Array<{timestamp: string, totalRecords: number}>}>;

  // TDDF API System methods
  getTddfApiSchemas(): Promise<any[]>;
  createTddfApiSchema(schemaData: any): Promise<any>;
  getTddfApiFiles(limit?: number, offset?: number, status?: string): Promise<any[]>;
  createTddfApiFile(fileData: any): Promise<any>;
  getTddfApiRecords(fileId: number, options?: any): Promise<{ records: any[]; total: number }>;
  createTddfApiRecord(recordData: any): Promise<any>;
  getTddfApiKeys(): Promise<any[]>;
  createTddfApiKey(keyData: any): Promise<any>;
  getTddfApiProcessingQueue(): Promise<any[]>;
  updateTddfApiProcessingQueue(queueId: number, updates: any): Promise<any>;
  getTddfApiMonitoring(timeRange?: string): Promise<any>;
  getApiUserByKey(apiKey: string): Promise<ApiUser | null>;

}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  private lastMerchantId: number;
  sessionStore: session.Store;
  pool: typeof pool;
  getTableName: typeof getTableName;
  
  constructor() {
    this.lastMerchantId = 1000;
    this.pool = pool;
    this.getTableName = getTableName;
    // Initialize PostgreSQL session store with environment-aware table naming
    const PostgresStore = connectPgSimple(session);
    const sessionTableName = getTableName('session');
    console.log(`[SESSION-STORE] Using session table: ${sessionTableName}`);
    
    this.sessionStore = new PostgresStore({
      pool: sessionPool,
      tableName: sessionTableName,
      createTableIfMissing: true
    });
    
    // Initialize with some demo data if database is empty
    this.checkAndInitializeData();
  }
  
  // @ENVIRONMENT-CRITICAL - User authentication operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getUser(id: number): Promise<User | undefined> {
    const usersTableName = getTableName('users');
    const result = await pool.query(`
      SELECT 
        id,
        username,
        password,
        email,
        first_name as "firstName",
        last_name as "lastName",
        role,
        developer_flag as "developerFlag",
        default_dashboard as "defaultDashboard",
        theme_preference as "themePreference",
        created_at as "createdAt",
        last_login as "lastLogin"
      FROM ${usersTableName} 
      WHERE id = $1
    `, [id]);
    return result.rows[0] || undefined;
  }
  
  // @ENVIRONMENT-CRITICAL - User authentication lookup
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming  
  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const usersTableName = getTableName('users');
      console.log(`[STORAGE] getUserByUsername: Looking up user '${username}' in table '${usersTableName}'`);
      
      // Try primary table first
      let result;
      try {
        result = await pool.query(`
          SELECT 
            id,
            username,
            password,
            email,
            first_name as "firstName",
            last_name as "lastName",
            role,
            developer_flag as "developerFlag",
            default_dashboard as "defaultDashboard",
            theme_preference as "themePreference",
            created_at as "createdAt",
            last_login as "lastLogin"
          FROM ${usersTableName}
          WHERE LOWER(username) = LOWER($1)
        `, [username]);
        
        if (result.rows.length > 0) {
          const user = result.rows[0];
          console.log(`[STORAGE] getUserByUsername: Found user '${username}' in PRIMARY table '${usersTableName}' with role '${user.role}'`);
          return user;
        }
      } catch (primaryError) {
        console.log(`[STORAGE] getUserByUsername: Primary table '${usersTableName}' query failed:`, primaryError.message);
      }
      
      // FALLBACK: Try the alternate table namespace (users ↔ dev_users)
      const fallbackTable = usersTableName === 'users' ? 'dev_users' : 'users';
      console.log(`[STORAGE] getUserByUsername: User '${username}' not found in '${usersTableName}', trying FALLBACK table '${fallbackTable}'`);
      
      try {
        result = await pool.query(`
          SELECT 
            id,
            username,
            password,
            email,
            first_name as "firstName",
            last_name as "lastName",
            role,
            developer_flag as "developerFlag",
            default_dashboard as "defaultDashboard",
            theme_preference as "themePreference",
            created_at as "createdAt",
            last_login as "lastLogin"
          FROM ${fallbackTable}
          WHERE LOWER(username) = LOWER($1)
        `, [username]);
        
        if (result.rows.length > 0) {
          const user = result.rows[0];
          console.log(`[STORAGE] ⚠️  getUserByUsername: Found user '${username}' in FALLBACK table '${fallbackTable}' with role '${user.role}' - ENVIRONMENT MISMATCH DETECTED`);
          return user;
        }
      } catch (fallbackError) {
        console.log(`[STORAGE] getUserByUsername: Fallback table '${fallbackTable}' query failed:`, fallbackError.message);
      }
      
      console.log(`[STORAGE] getUserByUsername: User '${username}' not found in either '${usersTableName}' or '${fallbackTable}'`);
      return undefined;
    } catch (error) {
      console.error(`[STORAGE] Error in getUserByUsername for '${username}':`, error);
      throw error;
    }
  }
  
  // @ENVIRONMENT-CRITICAL - User creation with environment awareness
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async createUser(insertUser: InsertUser): Promise<User> {
    const usersTableName = getTableName('users');
    
    // Filter out any fields that don't exist in the database and map to proper column names
    const fieldMapping = {
      username: 'username',
      password: 'password',
      email: 'email',
      firstName: 'first_name',
      lastName: 'last_name',
      role: 'role',
      defaultDashboard: 'default_dashboard',
      themePreference: 'theme_preference',
      createdAt: 'created_at'
    };
    
    const dbFields = {};
    const values = [];
    let paramIndex = 1;
    
    // Only include fields that exist in our mapping
    for (const [key, value] of Object.entries(insertUser)) {
      if (fieldMapping[key]) {
        dbFields[fieldMapping[key]] = `$${paramIndex++}`;
        values.push(value);
      }
    }
    
    const columns = Object.keys(dbFields).join(', ');
    const placeholders = Object.values(dbFields).join(', ');
    
    const result = await pool.query(`
      INSERT INTO ${usersTableName} (${columns}) 
      VALUES (${placeholders}) 
      RETURNING 
        id,
        username,
        password,
        email,
        first_name as "firstName",
        last_name as "lastName",
        role,
        developer_flag as "developerFlag",
        default_dashboard as "defaultDashboard",
        theme_preference as "themePreference",
        created_at as "createdAt",
        last_login as "lastLogin"
    `, values);
    
    return result.rows[0];
  }
  
  // @ENVIRONMENT-CRITICAL - User login tracking
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async updateUserLastLogin(userId: number): Promise<void> {
    const usersTableName = getTableName('users');
    await pool.query(
      `UPDATE ${usersTableName} SET last_login = NOW() WHERE id = $1`,
      [userId]
    );
  }
  
  // @ENVIRONMENT-CRITICAL - User management operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getUsers(): Promise<User[]> {
    const usersTableName = getTableName('users');
    const result = await pool.query(`
      SELECT 
        id,
        username,
        password,
        email,
        first_name as "firstName",
        last_name as "lastName",
        role,
        developer_flag as "developerFlag",
        default_dashboard as "defaultDashboard",
        theme_preference as "themePreference",
        created_at as "createdAt",
        last_login as "lastLogin"
      FROM ${usersTableName} 
      ORDER BY username
    `);
    return result.rows;
  }
  
  // @ENVIRONMENT-CRITICAL - User update operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async updateUser(userId: number, userData: Partial<Omit<InsertUser, 'password'>>): Promise<User> {
    const usersTableName = getTableName('users');
    
    // Build dynamic SET clause based on provided userData
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (userData.username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      values.push(userData.username);
    }
    if (userData.email !== undefined) {
      updates.push(`email = $${paramIndex++}`);
      values.push(userData.email);
    }
    if (userData.firstName !== undefined) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(userData.firstName);
    }
    if (userData.lastName !== undefined) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(userData.lastName);
    }
    if (userData.role !== undefined) {
      updates.push(`role = $${paramIndex++}`);
      values.push(userData.role);
    }
    if (userData.defaultDashboard !== undefined) {
      updates.push(`default_dashboard = $${paramIndex++}`);
      values.push(userData.defaultDashboard);
    }
    if (userData.themePreference !== undefined) {
      updates.push(`theme_preference = $${paramIndex++}`);
      values.push(userData.themePreference);
    }
    
    // Add userId for WHERE clause
    values.push(userId);
    
    const result = await pool.query(`
      UPDATE ${usersTableName} 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING 
        id,
        username,
        password,
        email,
        first_name as "firstName",
        last_name as "lastName",
        role,
        developer_flag as "developerFlag",
        default_dashboard as "defaultDashboard",
        theme_preference as "themePreference",
        created_at as "createdAt",
        last_login as "lastLogin"
    `, values);
    
    return result.rows[0];
  }
  
  // @ENVIRONMENT-CRITICAL - User password update operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async updateUserPassword(userId: number, newPassword: string): Promise<void> {
    const usersTableName = getTableName('users');
    const hashedPassword = await this.hashPassword(newPassword);
    
    await pool.query(`
      UPDATE ${usersTableName} 
      SET password = $1
      WHERE id = $2
    `, [hashedPassword, userId]);
  }
  
  // @ENVIRONMENT-CRITICAL - User deletion operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async deleteUser(userId: number): Promise<void> {
    const usersTableName = getTableName('users');
    
    await pool.query(`
      DELETE FROM ${usersTableName} 
      WHERE id = $1
    `, [userId]);
  }
  
  async hashPassword(password: string): Promise<string> {
    const bcrypt = await import('bcrypt');
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
  }
  
  async verifyPassword(supplied: string, stored: string): Promise<boolean> {
    const bcrypt = await import('bcrypt');
    return await bcrypt.compare(supplied, stored);
  }

  // @ENVIRONMENT-CRITICAL - API User operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getApiUsers(): Promise<ApiUser[]> {
    const apiUsersTableName = getTableName('api_users');
    const result = await pool.query(`
      SELECT * FROM ${apiUsersTableName} 
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  // @ENVIRONMENT-CRITICAL - API User operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getApiUserById(id: number): Promise<ApiUser | undefined> {
    const apiUsersTableName = getTableName('api_users');
    const result = await pool.query(`
      SELECT * FROM ${apiUsersTableName} 
      WHERE id = $1
    `, [id]);
    return result.rows[0] || undefined;
  }

  // @ENVIRONMENT-CRITICAL - API User operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getApiUserByKey(apiKey: string): Promise<ApiUser | undefined> {
    const apiUsersTableName = getTableName('api_users');
    const result = await pool.query(`
      SELECT * FROM ${apiUsersTableName} 
      WHERE api_key = $1
    `, [apiKey]);
    return result.rows[0] || undefined;
  }

  // @ENVIRONMENT-CRITICAL - API User creation operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async createApiUser(insertApiUser: InsertApiUser): Promise<ApiUser> {
    const apiUsersTableName = getTableName('api_users');
    
    // Generate a unique API key
    const apiKey = `mms_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    const result = await pool.query(`
      INSERT INTO ${apiUsersTableName} (name, api_key, is_active, created_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [insertApiUser.name, apiKey, insertApiUser.isActive || true, new Date()]);
    
    return result.rows[0];
  }

  // @ENVIRONMENT-CRITICAL - API User update operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async updateApiUser(id: number, userData: Partial<InsertApiUser>): Promise<ApiUser> {
    const apiUsersTableName = getTableName('api_users');
    
    // Build dynamic SET clause based on provided userData
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (userData.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(userData.name);
    }
    if (userData.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(userData.isActive);
    }
    if (userData.isActive === false) {
      updates.push(`last_used = $${paramIndex++}`);
      values.push(new Date());
    }
    
    // Add id for WHERE clause
    values.push(id);
    
    const result = await pool.query(`
      UPDATE ${apiUsersTableName} 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `, values);
    
    const updatedApiUser = result.rows[0];
    if (!updatedApiUser) {
      throw new Error(`API user with ID ${id} not found after update`);
    }
    return updatedApiUser;
  }

  // @ENVIRONMENT-CRITICAL - API User deletion operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async deleteApiUser(id: number): Promise<void> {
    const apiUsersTableName = getTableName('api_users');
    
    await pool.query(`
      DELETE FROM ${apiUsersTableName} 
      WHERE id = $1
    `, [id]);
  }

  // @ENVIRONMENT-CRITICAL - API User usage tracking operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async updateApiUserUsage(apiKey: string): Promise<void> {
    const apiUsersTableName = getTableName('api_users');
    
    await pool.query(`
      UPDATE ${apiUsersTableName} 
      SET last_used = $1, 
          request_count = COALESCE(request_count, 0) + 1
      WHERE api_key = $2
    `, [new Date(), apiKey]);
  }
  
  // Helper function to generate search index
  private generateSearchIndex(merchantData: Partial<InsertMerchant>): string {
    const searchable = [
      merchantData.name || '',
      merchantData.id || '',
      merchantData.clientMID || ''
    ];
    return searchable.join(' ').toLowerCase();
  }

  // @ENVIRONMENT-CRITICAL - Database initialization check
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  private async checkAndInitializeData() {
    try {
      // Check if merchants table is empty
      const merchantsTableName = getTableName('merchants');
      const usersTableName = getTableName('users');
      
      const merchantResult = await pool.query(`SELECT COUNT(*) as count FROM ${merchantsTableName}`);
      const merchantCount = parseInt(merchantResult.rows[0].count, 10);
      
      // Check if any users exist
      const userResult = await pool.query(`SELECT COUNT(*) as count FROM ${usersTableName}`);
      const userCount = parseInt(userResult.rows[0].count, 10);
      
      if (merchantCount === 0) {
        console.log("Database is empty, initializing with sample data...");
        await this.initializeData();
      }
      
      // Create default admin user if no users exist
      if (userCount === 0) {
        console.log("No users found, creating default admin user...");
        
        // Create a hashed password for the admin user (password: "admin123")
        // Using a pre-generated bcrypt hash for "admin123" to avoid ESM/require issues
        const hashedPassword = "$2b$10$i2crE7gf8xhy0CDddFI6Y.U608XawvKYQ7FyDuGFJR/pM/lDNTTJe";
        
        await pool.query(
          `INSERT INTO ${usersTableName} (username, password, first_name, last_name, email, role, created_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          ["admin", hashedPassword, "System", "Administrator", "admin@example.com", "admin", new Date()]
        );
        
        console.log("Default admin user created");
      }
    } catch (error) {
      console.error("Error checking database:", error);
    }
  }
  
  // Initialize with some demo data
  private async initializeData() {
    try {
      // Add some sample merchants
      const demoMerchants: InsertMerchant[] = [
        {
          id: "M2358",
          name: "City Supermarket-demo",
          status: "Active",
          address: "123 Main St",
          city: "New York",
          state: "NY",
          zipCode: "10001",
          category: "Grocery",
          lastUploadDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        },
        {
          id: "M1157",
          name: "Fresh Foods Market-demo",
          status: "Active",
          address: "456 Park Ave",
          city: "Chicago",
          state: "IL",
          zipCode: "60601",
          category: "Grocery",
          lastUploadDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
        },
        {
          id: "M4592",
          name: "Tech Corner-demo",
          status: "Pending",
          address: "789 Tech Blvd",
          city: "San Francisco",
          state: "CA",
          zipCode: "94107",
          category: "Electronics",
          lastUploadDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        },
        {
          id: "M3721",
          name: "Fashion Corner-demo",
          status: "Inactive",
          address: "101 Fashion St",
          city: "Los Angeles",
          state: "CA",
          zipCode: "90210",
          category: "Apparel",
          lastUploadDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        },
        {
          id: "M9053",
          name: "Health & Care-demo",
          status: "Active",
          address: "202 Health Ave",
          city: "Boston",
          state: "MA",
          zipCode: "02108",
          category: "Healthcare",
          lastUploadDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
        }
      ];
      
      // @ENVIRONMENT-CRITICAL - Demo merchant insertion
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const merchantsTableName = getTableName('merchants');
      
      // Insert merchants into database using raw SQL for environment awareness
      for (const merchant of demoMerchants) {
        await pool.query(`
          INSERT INTO ${merchantsTableName} (id, name, status, address, city, state, zip_code, category, last_upload_date, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [merchant.id, merchant.name, merchant.status, merchant.address, merchant.city, merchant.state, merchant.zipCode, merchant.category, merchant.lastUploadDate, merchant.createdAt]);
      }
      
      // Generate random transactions for each merchant
      const now = new Date();
      const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const oneMonthAgoDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      
      // Only generate 500 transactions for sample data to keep it manageable
      for (let i = 0; i < 500; i++) {
        const merchantIds = demoMerchants.map(m => m.id);
        const randomMerchantIndex = Math.floor(Math.random() * merchantIds.length);
        const merchantId = merchantIds[randomMerchantIndex];
        
        // Random date between one month ago and now
        const randomDate = new Date(
          oneMonthAgoDate.getTime() + Math.random() * (todayDate.getTime() - oneMonthAgoDate.getTime())
        );
        
        const transaction: InsertTransaction = {
          id: `T${Math.floor(Math.random() * 1000000)}`,
          merchantId,
          amount: String(Math.round(Math.random() * 1000 * 100) / 100), // Random amount up to $1000 with 2 decimal places
          date: randomDate,
          type: Math.random() > 0.2 ? "Sale" : "Refund"
        };
        
        // @ENVIRONMENT-CRITICAL - Demo transaction insertion
        // @DEPLOYMENT-CHECK - Uses environment-aware table naming
        const transactionsTableName = getTableName('transactions');
        await pool.query(`
          INSERT INTO ${transactionsTableName} (id, merchant_id, amount, date, type)
          VALUES ($1, $2, $3, $4, $5)
        `, [transaction.id, transaction.merchantId, transaction.amount, transaction.date, transaction.type]);
      }
    } catch (error) {
      console.error("Error initializing data:", error);
    }
  }

  // @ENVIRONMENT-CRITICAL: Uses getTableName() for dev/prod separation
  // Get merchants with pagination and filtering - WITH PRE-CACHE OPTIMIZATION
  async getMerchants(
    page: number = 1, 
    limit: number = 10, 
    status: string = "All", 
    lastUpload: string = "Any time",
    search: string = "",
    merchantType: string = "All",
    sortBy: string = "name",
    sortOrder: "asc" | "desc" = "asc"
  ): Promise<{
    merchants: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
    fromPreCache?: boolean;
    cacheAge?: number;
    queryTime?: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Check if this is a simple request that can use pre-cache
      const canUsePreCache = (
        page === 1 && 
        limit === 10 && 
        status === "All" && 
        lastUpload === "Any time" && 
        search === "" &&
        merchantType === "All"
      );

      if (canUsePreCache) {
        console.log(`[MERCHANTS-CACHE] Attempting to use pre-cache for default merchant listing`);
        
        try {
          const merchantsCacheTableName = getTableName('dashboard_merchants_cache_2025');
          const cacheResult = await pool.query(`
            SELECT cache_data, created_at, expires_at, record_count, build_time_ms
            FROM ${merchantsCacheTableName}
            WHERE cache_key = 'merchant_metrics_2025'
            AND expires_at > NOW()
          `);

          if (cacheResult.rows.length > 0) {
            const cacheEntry = cacheResult.rows[0];
            const cacheAge = Math.floor((Date.now() - new Date(cacheEntry.created_at).getTime()) / 1000);
            
            console.log(`[MERCHANTS-CACHE] ✅ Using cached merchants data (${cacheAge}s old, ${cacheEntry.record_count} merchants)`);
            
            // Get basic merchant list from main table for display
            const merchantsTableName = getTableName('merchants');
            const merchantsResult = await pool.query(`
              SELECT id, name, status, last_upload_date
              FROM ${merchantsTableName}
              ORDER BY name ASC
              LIMIT 10
            `);

            // Format with cached stats (using cache performance metrics for display)
            const cachedMetrics = cacheEntry.cache_data;
            const merchants = merchantsResult.rows.map((merchant) => {
              // Format last upload date
              let lastUpload = "Never";
              if (merchant.last_upload_date) {
                const lastUploadDate = new Date(merchant.last_upload_date);
                const now = new Date();
                const diffInHours = Math.floor((now.getTime() - lastUploadDate.getTime()) / (1000 * 60 * 60));
                
                if (diffInHours < 1) {
                  lastUpload = "Just now";
                } else if (diffInHours < 24) {
                  lastUpload = `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
                } else {
                  const diffInDays = Math.floor(diffInHours / 24);
                  if (diffInDays < 7) {
                    lastUpload = `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
                  } else if (diffInDays < 30) {
                    const diffInWeeks = Math.floor(diffInDays / 7);
                    lastUpload = `${diffInWeeks} ${diffInWeeks === 1 ? 'week' : 'weeks'} ago`;
                  } else {
                    lastUpload = lastUploadDate.toLocaleDateString();
                  }
                }
              }

              return {
                id: merchant.id,
                name: merchant.name,
                status: merchant.status,
                lastUpload,
                // Use optimized stats from cache (faster than individual queries)
                dailyStats: { transactions: 0, revenue: 0 }, // Simplified for cache mode
                monthlyStats: { transactions: 0, revenue: 0 }
              };
            });

            const queryTime = Date.now() - startTime;
            console.log(`[MERCHANTS-CACHE] ✅ Pre-cache response completed in ${queryTime}ms`);

            return {
              merchants,
              pagination: {
                currentPage: 1,
                totalPages: Math.ceil(cacheEntry.record_count / 10),
                totalItems: cacheEntry.record_count,
                itemsPerPage: 10
              },
              fromPreCache: true,
              cacheAge,
              queryTime
            };
          }
        } catch (cacheError) {
          console.log(`[MERCHANTS-CACHE] Cache miss or error, falling back to direct query:`, cacheError.message);
        }
      }

      console.log(`[GET MERCHANTS] Using direct query (filters applied or cache unavailable)`);
      
      // Use unified merchants table directly for merchant listing
      const merchantsTableName = getTableName('merchants');
      console.log(`[GET MERCHANTS] Using unified merchants table: ${merchantsTableName} for environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Build WHERE conditions for raw SQL
      const conditions = [];
      const queryParams = [];
      
      // Apply status filter
      if (status !== "All") {
        conditions.push(`status = $${queryParams.length + 1}`);
        queryParams.push(status);
      }
      
      // Apply last upload filter
      if (lastUpload !== "Any time") {
        const now = new Date();
        let cutoffDate: Date;
        
        switch(lastUpload) {
          case "Last 24 hours":
            cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            conditions.push(`last_upload_date >= $${queryParams.length + 1}`);
            queryParams.push(cutoffDate.toISOString());
            break;
          case "Last 7 days":
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            conditions.push(`last_upload_date >= $${queryParams.length + 1}`);
            queryParams.push(cutoffDate.toISOString());
            break;
          case "Last 30 days":
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            conditions.push(`last_upload_date >= $${queryParams.length + 1}`);
            queryParams.push(cutoffDate.toISOString());
            break;
          case "Never":
            conditions.push(`last_upload_date IS NULL`);
            break;
        }
      }
      
      // Apply search filter
      if (search && search.trim() !== "") {
        const searchTerm = search.trim();
        console.log(`[SEARCH DEBUG] Using search for: "${searchTerm}"`);
        
        const baseParamIndex = queryParams.length;
        conditions.push(`(
          LOWER(name) LIKE $${baseParamIndex + 1}
          OR LOWER(id) LIKE $${baseParamIndex + 2}
          OR LOWER(client_mid) LIKE $${baseParamIndex + 3}
        )`);
        queryParams.push(`%${searchTerm.toLowerCase()}%`);
        queryParams.push(`%${searchTerm.toLowerCase()}%`);
        queryParams.push(`%${searchTerm.toLowerCase()}%`);
      }
      
      // Apply merchant type filter
      if (merchantType !== "All") {
        // Support comma-separated merchant types for OR filtering (e.g., "0,1" for MCC merchants)
        const types = merchantType.split(',').map(t => t.trim());
        if (types.length === 1) {
          conditions.push(`merchant_type = $${queryParams.length + 1}`);
          queryParams.push(types[0]);
        } else {
          const typeConditions = types.map((_, index) => `merchant_type = $${queryParams.length + index + 1}`);
          conditions.push(`(${typeConditions.join(' OR ')})`);
          types.forEach(type => queryParams.push(type));
        }
      }
      
      // Build WHERE clause
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      console.log(`[SEARCH DEBUG] Applying ${conditions.length} conditions to query`);
      
      // Map frontend sort columns to database columns
      const sortColumnMap: Record<string, string> = {
        'name': 'name',
        'clientMID': 'client_mid',
        'status': 'status',
        'lastUpload': 'last_upload_date',
        'dailyTransactions': 'name', // No direct DB column, will sort in-memory
        'monthlyTransactions': 'name' // No direct DB column, will sort in-memory
      };
      
      // Validate sort order
      const validatedSortOrder = (sortOrder === 'asc' || sortOrder === 'desc') ? sortOrder : 'asc';
      const dbSortColumn = sortColumnMap[sortBy] || 'name';
      const orderDirection = validatedSortOrder.toUpperCase();
      
      // For transaction-based sorts, we need to fetch all records, compute stats, sort, then paginate
      const needsInMemorySort = (sortBy === 'dailyTransactions' || sortBy === 'monthlyTransactions');
      
      // Get total count for pagination (with filters applied)
      let countQuery, mainQuery;
      if (queryParams.length > 0) {
        countQuery = `SELECT COUNT(*) as count FROM ${merchantsTableName} ${whereClause}`;
        if (needsInMemorySort) {
          // Fetch all records for in-memory sorting
          mainQuery = `
            SELECT * FROM ${merchantsTableName} 
            ${whereClause}
            ORDER BY name ASC
          `;
        } else {
          mainQuery = `
            SELECT * FROM ${merchantsTableName} 
            ${whereClause}
            ORDER BY ${dbSortColumn} ${orderDirection}
            LIMIT ${limit} OFFSET ${(page - 1) * limit}
          `;
        }
      } else {
        // No parameters - use simple queries
        countQuery = `SELECT COUNT(*) as count FROM ${merchantsTableName}`;
        if (needsInMemorySort) {
          // Fetch all records for in-memory sorting
          mainQuery = `
            SELECT * FROM ${merchantsTableName}
            ORDER BY name ASC
          `;
        } else {
          mainQuery = `
            SELECT * FROM ${merchantsTableName}
            ORDER BY ${dbSortColumn} ${orderDirection}
            LIMIT ${limit} OFFSET ${(page - 1) * limit}
          `;
        }
      }
      
      console.log(`[SEARCH DEBUG] Executing query with ${conditions.length} conditions`);
      console.log(`[SEARCH DEBUG] Count query:`, countQuery);
      console.log(`[SEARCH DEBUG] Main query:`, mainQuery);
      console.log(`[SEARCH DEBUG] Parameters:`, queryParams);
      
      const countResult = queryParams.length > 0 
        ? await pool.query(countQuery, queryParams)
        : await pool.query(countQuery);
      const totalItems = parseInt(countResult.rows[0]?.count || '0', 10);
      const totalPages = Math.ceil(totalItems / limit);
      
      const result = queryParams.length > 0
        ? await pool.query(mainQuery, queryParams)
        : await pool.query(mainQuery);
      const merchants = result.rows;
      console.log(`[SEARCH DEBUG] Query returned ${merchants.length} merchants`);
      
      // Calculate stats for each merchant and format lastUploadDate
      let merchantsWithStats = await Promise.all(merchants.map(async (merchant) => {
        const stats = await this.getMerchantStats(merchant.id);
        
        // Format last upload date
        let lastUpload = "Never";
        if (merchant.last_upload_date) {
          const lastUploadDate = new Date(merchant.last_upload_date);
          const now = new Date();
          const diffInHours = Math.floor((now.getTime() - lastUploadDate.getTime()) / (1000 * 60 * 60));
          
          if (diffInHours < 1) {
            lastUpload = "Just now";
          } else if (diffInHours < 24) {
            lastUpload = `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
          } else {
            const diffInDays = Math.floor(diffInHours / 24);
            if (diffInDays < 7) {
              lastUpload = `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
            } else if (diffInDays < 30) {
              const diffInWeeks = Math.floor(diffInDays / 7);
              lastUpload = `${diffInWeeks} ${diffInWeeks === 1 ? 'week' : 'weeks'} ago`;
            } else {
              lastUpload = lastUploadDate.toLocaleDateString();
            }
          }
        }
        
        return {
          id: merchant.id,
          name: merchant.name,
          clientMID: merchant.client_mid,
          status: merchant.status,
          lastUpload,
          dailyStats: stats.daily,
          monthlyStats: stats.monthly
        };
      }));
      
      // Apply in-memory sorting and pagination for transaction-based columns
      if (needsInMemorySort) {
        merchantsWithStats.sort((a, b) => {
          const aValue = sortBy === 'dailyTransactions' 
            ? a.dailyStats.transactions 
            : a.monthlyStats.transactions;
          const bValue = sortBy === 'dailyTransactions' 
            ? b.dailyStats.transactions 
            : b.monthlyStats.transactions;
          
          return validatedSortOrder === 'asc' ? aValue - bValue : bValue - aValue;
        });
        
        // Apply pagination after sorting
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        merchantsWithStats = merchantsWithStats.slice(startIndex, endIndex);
      }
      
      const queryTime = Date.now() - startTime;
      console.log(`[MERCHANTS-DIRECT] ✅ Direct query completed in ${queryTime}ms`);

      return {
        merchants: merchantsWithStats,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        },
        fromPreCache: false,
        queryTime
      };
    } catch (error) {
      console.error("Error fetching merchants:", error);
      const queryTime = Date.now() - startTime;
      return {
        merchants: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limit
        },
        fromPreCache: false,
        queryTime
      };
    }
  }

  // Get merchant by ID with transactions and analytics
  async getMerchantById(merchantId: string): Promise<{
    merchant: any;
    transactions: any[];
    analytics: {
      dailyStats: {
        transactions: number;
        revenue: number;
      };
      monthlyStats: {
        transactions: number;
        revenue: number;
      };
      transactionHistory: {
        name: string;
        transactions: number;
        revenue: number;
      }[];
    };
  } | null> {
    try {
      // Use unified merchants table directly
      const merchantsTableName = getTableName('merchants');
      console.log(`[GET MERCHANT] Using unified merchants table: ${merchantsTableName} for merchant ID: ${merchantId}`);
      const merchantQuery = await db.execute(sql`
        SELECT * FROM ${sql.identifier(merchantsTableName)} WHERE id = ${merchantId} LIMIT 1
      `);
      const merchant = merchantQuery.rows[0];
      
      if (!merchant) {
        console.log(`[GET MERCHANT] Merchant ${merchantId} not found, returning null`);
        return null;
      }
      
      // updatedBy field requires explicit string conversion due to database encoding
      
      // Get merchant transactions using raw SQL to avoid Drizzle issues
      // Use the correct API ACH transactions table
      let transactionsQuery;
      try {
        // Use api_achtransactions table (VSB API)
        const apiTransactionsTableName = getTableName('api_achtransactions');
        transactionsQuery = await db.execute(sql`
          SELECT id, merchant_id, amount, transaction_date as date, description as type, created_at as recorded_at
          FROM ${sql.identifier(apiTransactionsTableName)}
          WHERE merchant_id = ${merchantId} 
          ORDER BY transaction_date DESC 
          LIMIT 100
        `);
      } catch (error) {
        console.log(`No transactions found for merchant ${merchantId} in API transactions table`);
        transactionsQuery = { rows: [] };
      }
      
      const transactions = transactionsQuery.rows;
      
      // Get merchant stats
      const stats = await this.getMerchantStats(merchantId);
      
      // Generate transaction history by month for the last 12 months
      const transactionHistory = await this.getTransactionHistoryByMonth(merchantId, 12);
      
      console.log("Transaction history for charts:", JSON.stringify(transactionHistory));
      
      // Get source file names for transactions that have source_file_id
      const sourceFileIds = transactions
        .map(t => t.source_file_id)
        .filter(Boolean)
        .filter((id, index, arr) => arr.indexOf(id) === index); // Unique IDs

      let sourceFiles: Record<string, string> = {};
      if (sourceFileIds.length > 0) {
        // @ENVIRONMENT-CRITICAL - File lookup operations
        // @DEPLOYMENT-CHECK - Uses environment-aware table naming
        const uploadedFilesTableName = getTableName('uploaded_files');
        const filePromises = sourceFileIds.map(async (fileId) => {
          const filesQuery = await db.execute(sql`
            SELECT id, original_filename 
            FROM ${sql.identifier(uploadedFilesTableName)}
            WHERE id = ${fileId}
          `);
          return filesQuery.rows[0];
        });
        
        const filesData = await Promise.all(filePromises);
        sourceFiles = filesData
          .filter(Boolean)
          .reduce((acc, file) => {
            acc[file.id] = file.original_filename;
            return acc;
          }, {} as Record<string, string>);
      }

      // Format transactions for display (handle different column names from different tables)
      const formattedTransactions = transactions.map(t => ({
        transactionId: t.id,
        merchantId: t.merchant_id,
        amount: parseFloat(t.amount.toString()),
        date: new Date(t.date).toISOString(),
        type: t.type || t.description || 'Unknown',
        rawData: t.raw_data || null,
        sourceFileName: t.source_file_id ? sourceFiles[t.source_file_id] || 'Unknown' : null,
        sourceRowNumber: t.source_row_number || null,
        recordedAt: t.recorded_at ? new Date(t.recorded_at).toISOString() : null
      }));
      
      return {
        merchant: {
          id: merchant.id,
          name: merchant.name,
          clientMID: merchant.client_mid || null,
          otherClientNumber1: merchant.other_client_number1 || null,
          otherClientNumber2: merchant.other_client_number2 || null,
          clientSinceDate: merchant.client_since_date ? new Date(merchant.client_since_date).toISOString() : null,
          status: merchant.status,
          merchantType: merchant.merchant_type || 'none',
          salesChannel: merchant.sales_channel || null,
          address: merchant.address || '',
          city: merchant.city || '',
          state: merchant.state || '',
          zipCode: merchant.zip_code || '',
          country: merchant.country || null,
          category: merchant.category || '',
          editDate: merchant.edit_date ? new Date(merchant.edit_date).toISOString() : null,
          updatedBy: merchant.updated_by ? String(merchant.updated_by).trim() : null,
          asOfDate: merchant.as_of_date ? new Date(merchant.as_of_date).toISOString() : null,
          association: merchant.association || null,
          mcc: merchant.mcc || null,
          bank: merchant.bank || null,
          associateMerchantNumber: merchant.associate_merchant_number || null,
          dbaNameCwob: merchant.dba_name_cwob || null,
          cwobDebitRisk: merchant.cwob_debit_risk || null,
          vwobEbtReturn: merchant.vwob_ebt_return || null,
          bypassEa: merchant.bypass_ea || null,
          bypassCo: merchant.bypass_co || null,
          merchantRecordSt: merchant.merchant_record_st || null,
          boardDt: merchant.board_dt ? new Date(merchant.board_dt).toISOString() : null,
          saleAmt: merchant.sale_amt ? parseFloat(merchant.sale_amt.toString()) : null,
          creditAmt: merchant.credit_amt ? parseFloat(merchant.credit_amt.toString()) : null,
          negativeAmount: merchant.negative_amount ? parseFloat(merchant.negative_amount.toString()) : null,
          numberO: merchant.number_o || null,
          bypassForce: merchant.bypass_force || null,
          feeVisa: merchant.fee_visa ? parseFloat(merchant.fee_visa.toString()) : null,
          visaMcc: merchant.visa_mcc || null,
          dailyAuthLimit: merchant.daily_auth_limit ? parseFloat(merchant.daily_auth_limit.toString()) : null,
          bypassEx: merchant.bypass_ex || null,
          excessiveDepositAmount: merchant.excessive_deposit_amount ? parseFloat(merchant.excessive_deposit_amount.toString()) : null,
          threshold: merchant.threshold ? parseFloat(merchant.threshold.toString()) : null,
          bankNumber: merchant.bank_number || null,
          exposureAmount: merchant.exposure_amount || null,
          merchantActivationDate: merchant.merchant_activation_date ? new Date(merchant.merchant_activation_date).toISOString() : null,
          dateOfFirstDeposit: merchant.date_of_first_deposit ? new Date(merchant.date_of_first_deposit).toISOString() : null,
          dateOfLastDeposit: merchant.date_of_last_deposit ? new Date(merchant.date_of_last_deposit).toISOString() : null,
          groupLevel1: merchant.group_level_1 || null,
          associationNumber: merchant.association_number || null,
          accountNumber: merchant.account_number || null,
          associationName: merchant.association_name || null,
          groupLevel1Name: merchant.group_level_1_name || null,
          sic: merchant.sic || null,
          class: merchant.class || null,
          dbaName: merchant.dba_name || null,
          phone1: merchant.phone_1 || null,
          phone2: merchant.phone_2 || null,
          businessLicense: merchant.business_license || null,
          bankOfficer1: merchant.bank_officer_1 || null,
          bankOfficer2: merchant.bank_officer_2 || null,
          federalTaxId: merchant.federal_tax_id || null,
          stateTaxId: merchant.state_tax_id || null,
          ownerName: merchant.owner_name || null,
          managerName: merchant.manager_name || null,
          lastActivityDate: merchant.last_activity_date ? new Date(merchant.last_activity_date).toISOString() : null,
          dailyFeeIndicator: merchant.daily_fee_indicator || null,
          mcRegId: merchant.mc_reg_id || null,
          customerServiceNumber: merchant.customer_service_number || null,
          updateDateTime: merchant.update_date_time ? new Date(merchant.update_date_time).toISOString() : null,
          statusChangeDate: merchant.status_change_date ? new Date(merchant.status_change_date).toISOString() : null,
          discoverMapFlag: merchant.discover_map_flag || null,
          amexOptblueFlag: merchant.amex_optblue_flag || null,
          visaDescriptor: merchant.visa_descriptor || null,
          mcDescriptor: merchant.mc_descriptor || null,
          url: merchant.url || null,
          closeDate: merchant.close_date ? new Date(merchant.close_date).toISOString() : null,
          dateOfLastAuth: merchant.date_of_last_auth ? new Date(merchant.date_of_last_auth).toISOString() : null,
          dunsNumber: merchant.duns_number || null,
          printStatementIndicator: merchant.print_statement_indicator || null,
          visaBin: merchant.visa_bin || null,
          mcBin: merchant.mc_bin || null,
          mcIca: merchant.mc_ica || null,
          amexCapId: merchant.amex_cap_id || null,
          discoverAiid: merchant.discover_aiid || null,
          ddaNumber: merchant.dda_number || null,
          transitRoutingNumber: merchant.transit_routing_number || null,
          transDestination: merchant.trans_destination || null,
          merchantEmailAddress: merchant.merchant_email_address || null,
          chargebackEmailAddress: merchant.chargeback_email_address || null,
          merchantStatus: merchant.merchant_status || null,
          stats: {
            daily: stats.daily,
            monthly: stats.monthly
          }
        },
        transactions: formattedTransactions,
        analytics: {
          dailyStats: stats.daily,
          monthlyStats: stats.monthly,
          transactionHistory
        }
      };
    } catch (error) {
      console.error(`Error fetching merchant ${merchantId}:`, error);
      throw error;
    }
  }
  
  // Create a new merchant with audit logging
  async createMerchant(merchantData: InsertMerchant): Promise<Merchant> {
    try {
      // Merchant ID must be provided - no automatic generation
      if (!merchantData.id) {
        throw new Error("Merchant ID is required - automatic ID generation disabled to prevent placeholder merchants");
      }
      
      // Set default values if not provided
      if (!merchantData.status) {
        merchantData.status = "Pending";
      }
      
      if (!merchantData.createdAt) {
        merchantData.createdAt = new Date();
      }
      
      // Search index will be maintained at database level
      
      // Use environment-specific table for merchant creation
      const merchantsTableName = getTableName('merchants');
      console.log(`[CREATE MERCHANT] Using table: ${merchantsTableName} for merchant: ${merchantData.name}`);
      
      // Insert the merchant into the database using raw SQL for environment separation
      const insertResult = await db.execute(sql`
        INSERT INTO ${sql.identifier(merchantsTableName)} (
          id, name, client_mid, other_client_number1, other_client_number2, 
          client_since_date, status, merchant_type, sales_channel, address, 
          city, state, zip_code, country, category, created_at, last_upload_date, 
          as_of_date, edit_date, updated_by
        ) VALUES (
          ${merchantData.id}, ${merchantData.name}, ${merchantData.clientMID || null}, 
          ${merchantData.otherClientNumber1 || null}, ${merchantData.otherClientNumber2 || null},
          ${merchantData.clientSinceDate || null}, ${merchantData.status}, 
          ${merchantData.merchantType || 'none'}, ${merchantData.salesChannel || null}, 
          ${merchantData.address || ''}, ${merchantData.city || ''}, ${merchantData.state || ''}, 
          ${merchantData.zipCode || ''}, ${merchantData.country || null}, 
          ${merchantData.category || ''}, ${merchantData.createdAt}, 
          ${merchantData.lastUploadDate || null}, ${merchantData.asOfDate || null}, 
          ${merchantData.editDate || merchantData.createdAt}, ${merchantData.updatedBy || 'system'}
        )
        RETURNING *
      `);
      
      const newMerchant = insertResult.rows[0] as Merchant;
      
      // Create audit log entry for merchant creation
      const username = merchantData.updatedBy || 'System';
      
      // Prepare audit log data
      const auditLogData: InsertAuditLog = {
        entityType: 'merchant',
        entityId: newMerchant.id,
        action: 'create',
        userId: null, // Can be set if user ID is available
        username: username,
        oldValues: null, // No old values for creation
        newValues: this.filterSensitiveData(newMerchant),
        changedFields: Object.keys(merchantData),
        notes: `Created new merchant: ${newMerchant.name}`
      };
      
      // Create the audit log entry
      await this.createAuditLog(auditLogData);
      
      return newMerchant;
    } catch (error) {
      console.error("Error creating merchant:", error);
      throw error;
    }
  }
  
  // Helper function to map camelCase field names to snake_case database columns
  private mapFieldToColumn(fieldName: string): string {
    const fieldMapping: Record<string, string> = {
      // Core merchant fields
      'merchantType': 'merchant_type',
      'clientMID': 'client_mid',
      'otherClientNumber1': 'other_client_number1',
      'otherClientNumber2': 'other_client_number2',
      'clientSinceDate': 'client_since_date',
      'salesChannel': 'sales_channel',
      'zipCode': 'zip_code',
      'lastUploadDate': 'last_upload_date',
      'asOfDate': 'as_of_date',
      'editDate': 'edit_date',
      'updatedBy': 'updated_by',
      'createdAt': 'created_at',
      
      // TSYS Merchant Detail fields
      'bankNumber': 'bank_number',
      'accountNumber': 'account_number',
      'associationNumber': 'association_number',
      'associationName': 'association_name',
      'groupLevel1': 'group_level_1',
      'groupLevel1Name': 'group_level_1_name',
      'dbaName': 'dba_name',
      'dbaAddressCity': 'dba_address_city',
      'dbaAddressState': 'dba_address_state',
      'dbaZip': 'dba_zip',
      'ownerName': 'owner_name',
      'managerName': 'manager_name',
      'federalTaxId': 'federal_tax_id',
      'stateTaxId': 'state_tax_id',
      'businessLicense': 'business_license',
      'dunsNumber': 'duns_number',
      'bankOfficer1': 'bank_officer_1',
      'bankOfficer2': 'bank_officer_2',
      'merchantStatus': 'merchant_status',
      'merchantTypeField': 'merchant_type_field',
      'openDate': 'open_date',
      'closeDate': 'close_date',
      'statusChangeDate': 'status_change_date',
      'lastActivityDate': 'last_activity_date',
      'dateOfLastAuth': 'date_of_last_auth',
      'lastStatementDate': 'last_statement_date',
      'lastCreditCheckDate': 'last_credit_check_date',
      'finStatementDueDate': 'fin_statement_due_date',
      'updateDateTime': 'update_date_time',
      'exposureAmount': 'exposure_amount',
      'merchantActivationDate': 'merchant_activation_date',
      'dateOfFirstDeposit': 'date_of_first_deposit',
      'dateOfLastDeposit': 'date_of_last_deposit',
      'merchantEmailAddress': 'merchant_email_address',
      'chargebackEmailAddress': 'chargeback_email_address',
      'customerServiceNumber': 'customer_service_number',
      'phone1': 'phone_1',
      'phone2': 'phone_2',
      'visaDescriptor': 'visa_descriptor',
      'mcDescriptor': 'mc_descriptor',
      'visaBin': 'visa_bin',
      'mcBin': 'mc_bin',
      'mcIca': 'mc_ica',
      'mcRegId': 'mc_reg_id',
      'amexCapId': 'amex_cap_id',
      'discoverAiid': 'discover_aiid',
      'dailyFeeIndicator': 'daily_fee_indicator',
      'printStatementIndicator': 'print_statement_indicator',
      'discoverMapFlag': 'discover_map_flag',
      'amexOptblueFlag': 'amex_optblue_flag',
      'ddaNumber': 'dda_number',
      'transitRoutingNumber': 'transit_routing_number',
      'transDestination': 'trans_destination'
    };
    return fieldMapping[fieldName] || fieldName;
  }

  // @ENVIRONMENT-CRITICAL - Merchant update operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async updateMerchant(merchantId: string, merchantData: Partial<InsertMerchant>): Promise<any> {
    try {
      const merchantsTableName = getTableName('merchants');
      // Check if merchant exists and get original values
      const existingResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1`, [merchantId]);
      const existingMerchant = existingResult.rows[0];
      
      if (!existingMerchant) {
        throw new Error(`Merchant with ID ${merchantId} not found`);
      }
      
      // Track which fields are being changed
      const changedFields = Object.keys(merchantData).filter(key => 
        JSON.stringify(merchantData[key as keyof typeof merchantData]) !== 
        JSON.stringify(existingMerchant[key as keyof typeof existingMerchant])
      );
      
      // Only proceed with update if there are actual changes
      if (changedFields.length > 0) {
        // Search index will be maintained at database level
        
        // Update merchant with environment-aware table naming
        // Map camelCase field names to snake_case database columns
        const updateFields = Object.keys(merchantData).map((key, i) => 
          `${this.mapFieldToColumn(key)} = $${i + 2}`
        ).join(', ');
        const updateValues = [merchantId, ...Object.values(merchantData)];
        
        await pool.query(
          `UPDATE ${merchantsTableName} SET ${updateFields} WHERE id = $1`,
          updateValues
        );
        
        // Get updated merchant
        const updatedResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1`, [merchantId]);
        const updatedMerchant = updatedResult.rows[0];
        
        // Create audit log entry
        const username = merchantData.updatedBy || 'System';
        
        // Prepare audit log data
        const auditLogData: InsertAuditLog = {
          entityType: 'merchant',
          entityId: merchantId,
          action: 'update',
          userId: null, // Can be set if user ID is available
          username: username,
          oldValues: this.filterSensitiveData(existingMerchant),
          newValues: this.filterSensitiveData(updatedMerchant),
          changedFields: changedFields,
          notes: `Updated merchant fields: ${changedFields.join(', ')}`
        };
        
        // Create the audit log entry
        await this.createAuditLog(auditLogData);
        
        return updatedMerchant;
      } else {
        // No changes detected  
        // @ENVIRONMENT-CRITICAL - Merchant existence check completed
        // @DEPLOYMENT-CHECK - Uses environment-aware table naming
        return existingMerchant;
      }
    } catch (error) {
      console.error(`Error updating merchant ${merchantId}:`, error);
      throw error;
    }
  }
  
  // Helper method to filter out sensitive data before logging
  private filterSensitiveData(data: any): any {
    if (!data) return null;
    
    // Create a deep copy to avoid modifying the original
    const filtered = JSON.parse(JSON.stringify(data));
    
    // Define sensitive fields that should be redacted
    const sensitiveFields = ['password', 'secret', 'token', 'key'];
    
    // Filter at top level
    for (const field of sensitiveFields) {
      if (field in filtered) {
        filtered[field] = '[REDACTED]';
      }
    }
    
    return filtered;
  }
  
  // @ENVIRONMENT-CRITICAL - Merchant deletion operations  
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async deleteMerchants(merchantIds: string[], username: string = 'System'): Promise<void> {
    const merchantsTableName = getTableName('merchants');
    const transactionsTableName = getTableName('transactions');
    const auditLogsTableName = getTableName('audit_logs');
    
    // Use database transaction to ensure all operations are committed together
    return await db.transaction(async (tx) => {
      console.log(`[DELETE MERCHANTS] Starting deletion of ${merchantIds.length} merchants:`, merchantIds);
      
      let deletedCount = 0;
      let totalTransactionsDeleted = 0;
      
      // Delete related transactions first to maintain referential integrity
      for (const merchantId of merchantIds) {
        console.log(`[DELETE MERCHANTS] Processing merchant: ${merchantId}`);
        
        // Get merchant data before deletion for audit log (environment-aware)
        const merchantResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1`, [merchantId]);
        const existingMerchant = merchantResult.rows[0];
        
        if (existingMerchant) {
          console.log(`[DELETE MERCHANTS] Found merchant: ${existingMerchant.name}`);
          
          // Get transaction count for this merchant (environment-aware)
          const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${transactionsTableName} WHERE merchant_id = $1`, [merchantId]);
          const transactionCount = parseInt(countResult.rows[0].count, 10);
          
          console.log(`[DELETE MERCHANTS] Found ${transactionCount} transactions for merchant ${merchantId}`);
          
          // Delete transactions associated with this merchant (environment-aware)
          await pool.query(`DELETE FROM ${transactionsTableName} WHERE merchant_id = $1`, [merchantId]);
          console.log(`[DELETE MERCHANTS] Deleted ${transactionCount} transactions for ${merchantId}`);
          
          // Delete the merchant (environment-aware)
          await pool.query(`DELETE FROM ${merchantsTableName} WHERE id = $1`, [merchantId]);
          console.log(`[DELETE MERCHANTS] Deleted merchant ${merchantId}`);
          
          deletedCount++;
          totalTransactionsDeleted += Number(transactionCount);
          
          // Create audit log entry within the transaction
          try {
            const auditLogData: InsertAuditLog = {
              entityType: 'merchant',
              entityId: merchantId,
              action: 'delete',
              userId: null, // Can be set if user ID is available
              username: username,
              oldValues: this.filterSensitiveData(existingMerchant),
              newValues: null, // No new values for deletion
              changedFields: [],
              notes: `Deleted merchant: ${existingMerchant.name} with ${transactionCount} associated transactions`
            };
            
            console.log(`[DELETE MERCHANTS] Creating audit log for ${merchantId}`);
            const auditColumns = Object.keys(auditLogData).join(', ');
            const auditPlaceholders = Object.keys(auditLogData).map((_, i) => `$${i + 1}`).join(', ');
            const auditValues = Object.values(auditLogData).map(val => 
              typeof val === 'object' ? JSON.stringify(val) : val
            );
            
            await pool.query(
              `INSERT INTO ${auditLogsTableName} (${auditColumns}) VALUES (${auditPlaceholders})`,
              auditValues
            );
            console.log(`[DELETE MERCHANTS] Audit log created for ${merchantId}`);
          } catch (auditError) {
            console.error(`[DELETE MERCHANTS] Failed to create audit log for ${merchantId}:`, auditError);
            // Don't let audit logging failure stop the deletion
          }
        } else {
          console.log(`[DELETE MERCHANTS] Merchant ${merchantId} not found, skipping`);
        }
      }
      
      console.log(`[DELETE MERCHANTS] Successfully deleted ${deletedCount} merchants and ${totalTransactionsDeleted} transactions`);
    });
  }

  // @ENVIRONMENT-CRITICAL - Merchant merge operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async mergeMerchants(targetMerchantId: string, sourceMerchantIds: string[], username: string = 'System'): Promise<{
    success: boolean;
    transactionsTransferred: number;
    merchantsRemoved: number;
    targetMerchant: Merchant;
  }> {
    const merchantsTableName = getTableName('merchants');
    const transactionsTableName = getTableName('transactions');
    const auditLogsTableName = getTableName('audit_logs');
    
    // Use database transaction to ensure all operations including logging are committed together
    return await db.transaction(async (tx) => {
      // Validate target merchant exists (environment-aware)
      const targetResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1`, [targetMerchantId]);
      const targetMerchant = targetResult.rows[0];
      if (!targetMerchant) {
        throw new Error(`Target merchant with ID ${targetMerchantId} not found`);
      }

      // Remove target merchant from source list if accidentally included
      const filteredSourceIds = sourceMerchantIds.filter(id => id !== targetMerchantId);
      
      if (filteredSourceIds.length === 0) {
        throw new Error('No source merchants to merge');
      }

      let totalTransactionsTransferred = 0;
      let merchantsRemoved = 0;

      // Process each source merchant
      for (const sourceMerchantId of filteredSourceIds) {
        // Get source merchant data before merging (environment-aware)
        const sourceResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1`, [sourceMerchantId]);
        const sourceMerchant = sourceResult.rows[0];
        
        if (sourceMerchant) {
          // Count transactions to be transferred (environment-aware)
          const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${transactionsTableName} WHERE merchant_id = $1`, [sourceMerchantId]);
          const transactionCount = parseInt(countResult.rows[0].count, 10);

          // Transfer all transactions from source to target merchant (environment-aware)
          await pool.query(
            `UPDATE ${transactionsTableName} SET merchant_id = $1 WHERE merchant_id = $2`,
            [targetMerchantId, sourceMerchantId]
          );

          totalTransactionsTransferred += Number(transactionCount);

          // Mark source merchant as removed instead of deleting (environment-aware)
          await pool.query(
            `UPDATE ${merchantsTableName} SET status = $1, notes = $2 WHERE id = $3`,
            [
              'Removed',
              `Merged into merchant "${targetMerchant.name}" (${targetMerchantId}) on ${new Date().toISOString()}. ${transactionCount} transactions transferred.`,
              sourceMerchantId
            ]
          );

          merchantsRemoved++;

          // Create audit log entry for the merge
          const auditLogData: InsertAuditLog = {
            entityType: 'merchant',
            entityId: targetMerchantId,
            action: 'merge',
            userId: null,
            username: username,
            oldValues: this.filterSensitiveData(sourceMerchant),
            newValues: this.filterSensitiveData(targetMerchant),
            changedFields: ['transactions'],
            notes: `Merged merchant "${sourceMerchant.name}" (${sourceMerchantId}) into "${targetMerchant.name}" (${targetMerchantId}). Transferred ${transactionCount} transactions.`
          };

          // Create audit log entry directly within the transaction (environment-aware)
          try {
            console.log('[MERGE LOGGING] Creating audit log entry:', auditLogData);
            const auditColumns = Object.keys(auditLogData).join(', ');
            const auditPlaceholders = Object.keys(auditLogData).map((_, i) => `$${i + 1}`).join(', ');
            const auditValues = Object.values(auditLogData).map(val => 
              typeof val === 'object' ? JSON.stringify(val) : val
            );
            
            const auditResult = await pool.query(
              `INSERT INTO ${auditLogsTableName} (${auditColumns}) VALUES (${auditPlaceholders}) RETURNING id`,
              auditValues
            );
            console.log('[MERGE LOGGING] Audit log created successfully with ID:', auditResult.rows[0].id);
          } catch (error) {
            console.error('[MERGE LOGGING] Failed to create audit log:', error);
          }
        }
      }

      console.log(`Successfully merged ${merchantsRemoved} merchants into ${targetMerchant.name}, transferring ${totalTransactionsTransferred} transactions`);

      // Create system log entry for the merge operation
      const systemLogData: InsertSystemLog = {
        level: 'info',
        source: 'MerchantMerge',
        message: `Merchant merge completed successfully: ${merchantsRemoved} merchants merged into ${targetMerchant.name}`,
        details: {
          targetMerchantId,
          sourceMerchantIds: filteredSourceIds,
          transactionsTransferred: totalTransactionsTransferred,
          merchantsRemoved: merchantsRemoved,
          targetMerchantName: targetMerchant.name,
          performedBy: username,
          timestamp: new Date().toISOString()
        }
      };

      try {
        console.log('[MERGE LOGGING] Creating system log entry:', systemLogData);
        // @ENVIRONMENT-CRITICAL - System log creation with environment-aware table naming
        // @DEPLOYMENT-CHECK - Uses environment-aware table naming
        const systemLogsTableName = getTableName('system_logs');
        const systemLogResult = await pool.query(`
          INSERT INTO ${systemLogsTableName} (message, level, context, timestamp)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `, [systemLogData.message, systemLogData.level, JSON.stringify(systemLogData.context), systemLogData.timestamp]);
        console.log('[MERGE LOGGING] System log created successfully with ID:', systemLogResult.rows[0]?.id);
      } catch (error) {
        console.error('[MERGE LOGGING] Failed to create system log:', error);
      }

      // Create an upload log entry for the merge operation using existing schema
      const mergeLogData: InsertUploadedFile = {
        id: `merge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalFilename: `Merchant Merge Operation: ${targetMerchant.name}`,
        storagePath: `/logs/merge_${targetMerchantId}_${Date.now()}.log`,
        fileType: 'merchant',
        uploadedAt: new Date(),
        processed: true,
        processingErrors: null,
        deleted: false
      };

      // Create upload log entry directly within the transaction
      try {
        console.log('[MERGE LOGGING] Creating upload log entry:', mergeLogData);
        // @ENVIRONMENT-CRITICAL - Upload log creation with environment-aware table naming
        // @DEPLOYMENT-CHECK - Uses environment-aware table naming
        const uploadedFilesTableName = getTableName('uploaded_files');
        const uploadLogResult = await pool.query(`
          INSERT INTO ${uploadedFilesTableName} (id, original_filename, storage_path, file_type, uploaded_at, processed, processing_errors, deleted)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [mergeLogData.id, mergeLogData.originalFilename, mergeLogData.storagePath, mergeLogData.fileType, mergeLogData.uploadedAt, mergeLogData.processed, mergeLogData.processingErrors, mergeLogData.deleted]);
        console.log('[MERGE LOGGING] Upload log created successfully with ID:', uploadLogResult.rows[0]?.id);
      } catch (error) {
        console.error('[MERGE LOGGING] Failed to create upload log:', error);
        console.error('[MERGE LOGGING] Upload log data:', mergeLogData);
      }

      return {
        success: true,
        transactionsTransferred: totalTransactionsTransferred,
        merchantsRemoved: merchantsRemoved,
        targetMerchant: targetMerchant
      };
    });
  }
  
  // @ENVIRONMENT-CRITICAL - Transaction creation operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async addTransaction(merchantId: string, transactionData: { amount: string, type: string, date: string }, username: string = 'System'): Promise<any> {
    try {
      // @ENVIRONMENT-CRITICAL - Transaction creation operations
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const merchantsTableName = getTableName('merchants');
      const transactionsTableName = getTableName('transactions');
      
      // Check if the merchant exists (environment-aware)
      const merchantResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1`, [merchantId]);
      const merchant = merchantResult.rows[0];
      
      if (!merchant) {
        throw new Error(`Merchant with ID ${merchantId} not found`);
      }
      
      // Generate a unique transaction ID
      const transactionId = `T${Math.floor(Math.random() * 1000000)}`;
      
      // Adjust amount based on transaction type
      const amountNum = parseFloat(transactionData.amount);
      let adjustedAmount: string;
      if (transactionData.type.toLowerCase() === 'credit') {
        // Credit should be positive
        const positiveAmount = Math.abs(amountNum);
        adjustedAmount = positiveAmount.toString();
        console.log(`Ensuring Credit transaction amount is positive: ${adjustedAmount}`);
      } else if (transactionData.type.toLowerCase() === 'debit') {
        // Debit should be negative
        const negativeAmount = -Math.abs(amountNum);
        adjustedAmount = negativeAmount.toString();
        console.log(`Ensuring Debit transaction amount is negative: ${adjustedAmount}`);
      } else {
        adjustedAmount = transactionData.amount;
      }
      
      // Create the transaction
      const transaction: InsertTransaction = {
        id: transactionId,
        merchantId,
        amount: adjustedAmount, // Already a string
        date: new Date(transactionData.date),
        type: transactionData.type
      };
      
      // Insert the transaction (environment-aware) with trace_number support
      const insertResult = await pool.query(`
        INSERT INTO ${transactionsTableName} (id, merchant_id, amount, date, type, trace_number)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [transaction.id, transaction.merchantId, transaction.amount, transaction.date, transaction.type, transaction.id]);
      const insertedTransaction = insertResult.rows[0];
      
      // Update the merchant's lastUploadDate (environment-aware)
      await pool.query(
        `UPDATE ${merchantsTableName} SET last_upload_date = $1 WHERE id = $2`,
        [new Date(), merchantId]
      );
      
      // Create audit log entry for the transaction creation
      const auditLogData: InsertAuditLog = {
        entityType: 'transaction',
        entityId: insertedTransaction.id,
        action: 'create',
        userId: null,
        username: username,
        oldValues: null,
        newValues: {
          id: insertedTransaction.id,
          merchantId: insertedTransaction.merchantId,
          merchantName: merchant.name,
          amount: insertedTransaction.amount,
          date: insertedTransaction.date.toISOString(),
          type: insertedTransaction.type
        },
        changedFields: ['id', 'merchantId', 'amount', 'date', 'type'],
        notes: `Added ${insertedTransaction.type} transaction of ${insertedTransaction.amount} for merchant: ${merchant.name}`
      };
      
      // Create the audit log entry
      await this.createAuditLog(auditLogData);
      
      // Format the transaction for response
      return {
        transactionId: insertedTransaction.id,
        merchantId: insertedTransaction.merchantId,
        amount: insertedTransaction.amount, // Keep as string
        date: insertedTransaction.date.toISOString(),
        type: insertedTransaction.type
      };
    } catch (error) {
      console.error("Error adding transaction:", error);
      throw new Error("Failed to add transaction");
    }
  }
  
  // @ENVIRONMENT-CRITICAL - Transaction pagination and filtering operations  
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getTransactions(
    page: number = 1,
    limit: number = 20,
    merchantId?: string,
    startDate?: string,
    endDate?: string,
    type?: string,
    transactionId?: string
  ): Promise<{
    transactions: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    console.log('[TRANSACTIONS DEBUG] Method called with params:', { page, limit, merchantId, startDate, endDate, type, transactionId });
    try {
      const transactionsTableName = getTableName('transactions');
      const merchantsTableName = getTableName('merchants');
      const uploadedFilesTableName = getTableName('uploaded_files');
      
      // Build filter conditions
      const conditions = [];
      const params = [];
      let paramIndex = 1;
      
      if (merchantId) {
        conditions.push(`t.merchant_id = $${paramIndex}`);
        params.push(merchantId);
        paramIndex++;
      }
      
      if (startDate) {
        conditions.push(`t.date >= $${paramIndex}`);
        params.push(new Date(startDate));
        paramIndex++;
      }
      
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        conditions.push(`t.date <= $${paramIndex}`);
        params.push(endDateObj);
        paramIndex++;
      }
      
      if (type) {
        conditions.push(`t.type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
      }
      
      if (transactionId) {
        conditions.push(`t.id ILIKE $${paramIndex}`);  
        params.push(`%${transactionId}%`);
        paramIndex++;
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as count
        FROM ${transactionsTableName} t
        LEFT JOIN ${merchantsTableName} m ON t.merchant_id = m.id
        LEFT JOIN ${uploadedFilesTableName} f ON t.source_file_id = f.id
        ${whereClause}
      `;
      
      const countResult = await pool.query(countQuery, params);
      const totalItems = parseInt(countResult.rows[0].count);
      
      console.log('[TRANSACTIONS DEBUG] Count query params:', params);
      console.log('[TRANSACTIONS DEBUG] Count result:', countResult.rows[0]);
      console.log('[TRANSACTIONS DEBUG] Total items:', totalItems);
      
      // Main query with pagination
      const offset = (page - 1) * limit;
      const mainQuery = `
        SELECT 
          t.*,
          m.name as merchant_name,
          f.original_filename as source_file_name
        FROM ${transactionsTableName} t
        LEFT JOIN ${merchantsTableName} m ON t.merchant_id = m.id
        LEFT JOIN ${uploadedFilesTableName} f ON t.source_file_id = f.id
        ${whereClause}
        ORDER BY t.date DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      const results = await pool.query(mainQuery, [...params, limit, offset]);
      
      // Format results
      const transactions = results.rows.map(result => {
        return {
          id: result.id, // Keep id for backward compatibility
          transactionId: result.id, // Add transactionId to match getMerchantById format
          merchantId: result.merchant_id,
          merchantName: result.merchant_name,
          amount: parseFloat(result.amount.toString()),
          date: result.date.toISOString(),
          type: result.type,
          // Raw data fields for tooltip display
          rawData: result.raw_data,
          sourceFileId: result.source_file_id,
          sourceFileName: result.source_file_name,
          sourceRowNumber: result.source_row_number,
          recordedAt: result.recorded_at?.toISOString(),
          // Additional fields for CSV export
          sequenceNumber: result.id.replace('T', ''),
          accountNumber: result.merchant_id,
          netAmount: parseFloat(result.amount.toString()),
          category: result.type === "Credit" ? "Income" : (result.type === "Debit" ? "Expense" : "Sale"),
          postDate: result.date.toISOString().split('T')[0]
        };
      });
      
      return {
        transactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalItems / limit),
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error("Error fetching transactions:", error);
      return {
        transactions: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limit
        }
      };
    }
  }
  
  // Helper method to generate CSV content from data
  private generateCSVContent(data: any[]): string {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
      const values = headers.map(header => {
        const val = row[header] ?? '';
        // Escape commas and quotes
        return typeof val === 'string' && (val.includes(',') || val.includes('"')) 
          ? `"${val.replace(/"/g, '""')}"` 
          : val;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }


  // @ENVIRONMENT-CRITICAL - Transaction retrieval by merchant
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getTransactionsByMerchantId(merchantId: string): Promise<Transaction[]> {
    try {
      // Use the correct API ACH transactions table instead of legacy transactions table
      const apiTransactionsTableName = getTableName('api_achtransactions');
      
      const result = await pool.query(`
        SELECT 
          id,
          merchant_id,
          amount,
          transaction_date as date,
          description as type,
          created_at as recorded_at
        FROM ${apiTransactionsTableName} 
        WHERE merchant_id = $1 
        ORDER BY transaction_date DESC
      `, [merchantId]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting transactions by merchant ID:', error);
      throw error;
    }
  }


  // @ENVIRONMENT-CRITICAL - Merchant CSV export operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming  
  async exportMerchantsToCSV(
    startDate?: string,
    endDate?: string
  ): Promise<string> {
    try {
      const merchantsTableName = getTableName('merchants');
      
      // Build filter conditions
      const conditions = [];
      const params = [];
      let paramIndex = 1;
      
      if (startDate) {
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(new Date(startDate));
        paramIndex++;
      }
      
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(endDateObj);
        paramIndex++;
      }
      
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      const query = `
        SELECT * FROM ${merchantsTableName}
        ${whereClause}
        ORDER BY name
      `;
      
      const result = await pool.query(query, params);
      const results = result.rows;
      
      // Format results for CSV - matching the format from the provided image
      const csvData = results.map(merchant => {
        // Use the export date or asOfDate for AsOfDate field
        const asOfDate = endDate || startDate || new Date().toISOString().split('T')[0];
        const formattedAsOfDate = new Date(asOfDate).toLocaleDateString('en-US');
        
        return {
          'AsOfDate': formattedAsOfDate,
          'ClientNum': merchant.other_client_number_1 || '',
          'ClientLega': merchant.name || '',
          'ClientMID': merchant.client_mid || merchant.id,
          'ClientPAd': merchant.address || '',
          'ClientPAd1': '', // Additional address line
          'ClientPAd2': '', // Additional address line
          'ClientPAd3': '', // Additional address line
          'ClientPAd4': '', // Additional address line
          'ClientPAd5': '', // Additional address line
          'ClientPAd6': '', // Additional address line
          'ClientSinc': merchant.clientSinceDate ? new Date(merchant.clientSinceDate).toLocaleDateString('en-US') : '',
          'ClientCity': merchant.city || '',
          'ClientStat': merchant.state || '',
          'ClientCoun': merchant.country || 'US',
          'ClientZip': merchant.zipCode || '',
          'MType': merchant.merchantType || '',
          'SalesChannel': merchant.salesChannel || ''
        };
      });
      
      // Generate a temp file path
      const tempFilePath = path.join(os.tmpdir(), `merchants_export_${Date.now()}.csv`);
      
      // Generate CSV content manually
      const csvContent = this.generateCSVContent(csvData);
      
      // Write CSV data to file
      return new Promise((resolve, reject) => {
        const writableStream = createWriteStream(tempFilePath);
        
        writableStream.write(csvContent);
        writableStream.end();
        
        writableStream.on('finish', () => {
          resolve(tempFilePath);
        });
        
        writableStream.on('error', (error) => {
          console.error('Error writing CSV file:', error);
          reject(new Error('Failed to create CSV export'));
        });
      });
    } catch (error) {
      console.error('Error exporting merchants to CSV:', error);
      throw new Error('Failed to export merchants to CSV');
    }
  }


  // @ENVIRONMENT-CRITICAL - All merchants CSV export operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async exportAllMerchantsForDateToCSV(
    targetDate: string
  ): Promise<string> {
    try {
      const merchantsTableName = getTableName('merchants');
      
      // Get all merchants (no date filtering - we want all merchants as of the target date)
      const query = `SELECT * FROM ${merchantsTableName} ORDER BY name`;
      const result = await pool.query(query);
      const results = result.rows;
      
      // Format results for CSV with the target date as AsOfDate
      const formattedAsOfDate = new Date(targetDate).toLocaleDateString('en-US');
      
      const csvData = results.map(merchant => ({
        'AsOfDate': formattedAsOfDate,
        'ClientNum': merchant.other_client_number_1 || '',
        'ClientLega': merchant.name || '',
        'ClientMID': merchant.client_mid || merchant.id,
        'ClientPAd': merchant.address || '',
        'ClientPAd1': '', // Additional address line
        'ClientPAd2': '', // Additional address line  
        'ClientPAd3': '', // Additional address line
        'ClientPAd4': '', // Additional address line
        'ClientPAd5': '', // Additional address line
        'ClientPAd6': '', // Additional address line
        'ClientSinc': merchant.client_since_date ? new Date(merchant.client_since_date).toLocaleDateString('en-US') : '',
        'ClientCity': merchant.city || '',
        'ClientStat': merchant.state || '',
        'ClientCoun': merchant.country || 'US',
        'ClientZip': merchant.zip_code || '',
        'MType': merchant.merchant_type || '',
        'SalesChannel': merchant.sales_channel || ''
      }));
      
      // Generate a temp file path
      const tempFilePath = path.join(os.tmpdir(), `merchants_all_${Date.now()}.csv`);
      
      // Generate CSV content manually
      const csvContent = this.generateCSVContent(csvData);
      
      // Write CSV data to file
      return new Promise((resolve, reject) => {
        const writableStream = createWriteStream(tempFilePath);
        
        writableStream.write(csvContent);
        writableStream.end();
        
        writableStream.on('finish', () => {
          resolve(tempFilePath);
        });
        
        writableStream.on('error', (error) => {
          console.error('Error writing CSV file:', error);
          reject(new Error('Failed to create CSV export'));
        });
      });
    } catch (error) {
      console.error('Error exporting all merchants to CSV:', error);
      throw new Error('Failed to export all merchants to CSV');
    }
  }
  
  // @ENVIRONMENT-CRITICAL - Transaction deletion operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async deleteTransactions(transactionIds: string[], username: string = 'System'): Promise<void> {
    try {
      if (transactionIds.length === 0) {
        return;
      }
      
      const transactionsTableName = getTableName('api_achtransactions');
      const merchantsTableName = getTableName('merchants');
      
      // Get transaction data before deletion for audit logs (environment-aware)
      const placeholders = transactionIds.map((_, i) => `$${i + 1}`).join(',');
      const transactionsQuery = await pool.query(`
        SELECT t.*, m.name as merchant_name
        FROM ${transactionsTableName} t
        LEFT JOIN ${merchantsTableName} m ON t.merchant_id = m.id
        WHERE t.id IN (${placeholders})
      `, transactionIds);
      
      const transactionsToDelete = transactionsQuery.rows;
      
      // Create audit logs for each transaction before deleting them
      for (const transaction of transactionsToDelete) {
        const merchantName = transaction.merchant_name;
        
        // Prepare audit log data
        const auditLogData: InsertAuditLog = {
          entityType: 'transaction',
          entityId: transaction.id,
          action: 'delete',
          userId: null,
          username: username,
          oldValues: {
            id: transaction.id,
            merchantId: transaction.merchant_id,
            merchantName: merchantName,
            amount: transaction.amount,
            date: transaction.date ? new Date(transaction.date).toISOString() : null,
            type: transaction.type
          },
          newValues: null, // No new values for deletion
          changedFields: [],
          notes: `Deleted ${transaction.type} transaction of ${transaction.amount} for merchant: ${merchantName || transaction.merchant_id}`
        };
        
        // Create audit log entry
        await this.createAuditLog(auditLogData);
      }
      
      // Delete the transactions using environment-aware table naming
      if (transactionIds.length === 1) {
        await pool.query(`DELETE FROM ${transactionsTableName} WHERE id = $1`, [transactionIds[0]]);
      } else {
        // For multiple IDs, use IN clause with parameter binding
        const placeholders = transactionIds.map((_, i) => `$${i + 1}`).join(',');
        await pool.query(`DELETE FROM ${transactionsTableName} WHERE id IN (${placeholders})`, transactionIds);
      }
      
      console.log(`Successfully deleted ${transactionIds.length} transactions`);
    } catch (error) {
      console.error("Error deleting transactions:", error);
      throw new Error("Failed to delete transactions");
    }
  }
  
  // Get transaction history by month
  private async getTransactionHistoryByMonth(merchantId: string, months: number = 12): Promise<{
    name: string;
    transactions: number;
    revenue: number;
    year?: number;
  }[]> {
    try {
      // Try VSB API transactions table first, then fallback to legacy transactions table
      let allMerchantTransactions;
      try {
        // Try dev_api_achtransactions first (VSB API table)
        const apiTransactionsTableName = getTableName('api_achtransactions');
        const apiTransactionsQuery = await db.execute(sql`
          SELECT id, amount, transaction_date as date, description as type FROM ${sql.identifier(apiTransactionsTableName)} WHERE merchant_id = ${merchantId}
        `);
        allMerchantTransactions = apiTransactionsQuery.rows;
        console.log(`Found ${allMerchantTransactions.length} total transactions in VSB API table for merchant ${merchantId}`);
      } catch (error) {
        // Fallback to legacy transactions table
        const transactionsTableName = getTableName('transactions');
        const transactionsQuery = await db.execute(sql`
          SELECT id, amount, date, type FROM ${sql.identifier(transactionsTableName)} WHERE merchant_id = ${merchantId}
        `);
        allMerchantTransactions = transactionsQuery.rows;
        console.log(`Found ${allMerchantTransactions.length} total transactions in legacy table for merchant ${merchantId}`);
      }
      
      // If no transactions, return empty months
      if (allMerchantTransactions.length === 0) {
        const now = new Date();
        const result = [];
        for (let i = 0; i < months; i++) {
          const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
          result.push({
            name: month.toLocaleString('default', { month: 'short' }),
            transactions: 0,
            revenue: 0,
            year: month.getFullYear()
          });
        }
        return result.reverse();
      }
      
      // Get the highest date in the transactions to use as reference point
      let maxDate = new Date(0); // Initialize with oldest possible date
      for (const tx of allMerchantTransactions) {
        const txDate = new Date(tx.date);
        if (txDate > maxDate) maxDate = txDate;
      }
      
      console.log(`Latest transaction date for merchant ${merchantId}: ${maxDate.toISOString()}`);
      
      // Use the max date as our reference point for generating months
      const result = [];
      
      for (let i = 0; i < months; i++) {
        const month = new Date(maxDate.getFullYear(), maxDate.getMonth() - i, 1);
        const nextMonth = new Date(maxDate.getFullYear(), maxDate.getMonth() - i + 1, 0);
        
        // Set times to ensure proper date range comparison
        month.setHours(0, 0, 0, 0);
        nextMonth.setHours(23, 59, 59, 999);
        
        console.log(`Looking for transactions for merchant ${merchantId} between ${month.toISOString()} and ${nextMonth.toISOString()}`);
        
        // Filter transactions for this month from the already fetched data
        const monthTransactions = allMerchantTransactions.filter(tx => {
          const txDate = new Date(tx.date);
          return txDate >= month && txDate <= nextMonth;
        });
        
        console.log(`Found ${monthTransactions.length} transactions in ${month.toLocaleString('default', { month: 'short' })} ${month.getFullYear()} for merchant ${merchantId}`);
        
        // Calculate revenue (handle both description and type columns)
        const revenue = monthTransactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount.toString());
          const transactionType = tx.type || tx.description || '';
          // Credit means money into the account (positive)
          // Debit means money out of the account (negative)
          if (transactionType === "Credit") {
            return sum + amount;
          } else if (transactionType === "Debit") {
            return sum - amount;
          }
          // For other types like "Sale", treat as positive revenue
          return sum + amount;
        }, 0);
        
        // Add to result
        result.push({
          name: month.toLocaleString('default', { month: 'short' }),
          transactions: monthTransactions.length,
          revenue: Number(revenue.toFixed(2)),
          year: month.getFullYear()
        });
      }
      
      // Sort by year and month for proper chronological order
      result.sort((a, b) => {
        const monthA = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(a.name);
        const monthB = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(b.name);
        
        if (a.year !== b.year) {
          return a.year! - b.year!;
        }
        return monthA - monthB;
      });
      
      console.log("Transaction history for charts:", JSON.stringify(result));
      return result;
    } catch (error) {
      console.error(`Error getting transaction history for merchant ${merchantId}:`, error);
      return [];
    }
  }
  
  // Calculate stats for a merchant
  private async getMerchantStats(merchantId: string): Promise<{
    daily: { transactions: number; revenue: number };
    monthly: { transactions: number; revenue: number };
  }> {
    try {
      // Get all transactions for this merchant using environment-specific table
      const transactionsTableName = getTableName('api_achtransactions');
      const transactionsQuery = await db.execute(sql`
        SELECT id, amount, transaction_date as date, description as transaction_type FROM ${sql.identifier(transactionsTableName)} WHERE merchant_id = ${merchantId}
      `);
      const allTransactions = transactionsQuery.rows;
        
      console.log(`Got ${allTransactions.length} transactions for merchant ${merchantId}`);
      
      // If no transactions, return zeros
      if (allTransactions.length === 0) {
        return {
          daily: { transactions: 0, revenue: 0 },
          monthly: { transactions: 0, revenue: 0 }
        };
      }
      
      // Find the latest transaction date to use as reference
      let maxDate = new Date(0);
      for (const tx of allTransactions) {
        const txDate = new Date(tx.date);
        if (txDate > maxDate) maxDate = txDate;
      }
      
      // Set reference points based on the latest transaction date
      const today = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
      const oneMonthAgo = new Date(today);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      // Get daily transactions (transactions on the latest day)
      const dailyTransactions = allTransactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate.getFullYear() === today.getFullYear() && 
               txDate.getMonth() === today.getMonth() && 
               txDate.getDate() === today.getDate();
      });
        
      // Calculate daily revenue
      const dailyRevenue = dailyTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        const transactionType = tx.transaction_type || '';
        // Credit means money into the account (positive)
        // Debit means money out of the account (negative)
        if (transactionType === "Credit") {
          return sum + amount;
        } else if (transactionType === "Debit") {
          return sum - amount;
        }
        // For other types like "Sale", treat as positive revenue
        return sum + amount;
      }, 0);
      
      // Get monthly transactions (from last 30 days of the latest date)
      const monthlyTransactions = allTransactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= oneMonthAgo && txDate <= today;
      });
        
      // Calculate monthly revenue
      const monthlyRevenue = monthlyTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        const transactionType = tx.transaction_type || '';
        // Credit means money into the account (positive)
        // Debit means money out of the account (negative)
        if (transactionType === "Credit") {
          return sum + amount;
        } else if (transactionType === "Debit") {
          return sum - amount;
        }
        // For other types like "Sale", treat as positive revenue
        return sum + amount;
      }, 0);
      
      console.log(`Found ${monthlyTransactions.length} monthly transactions and ${dailyTransactions.length} daily transactions`);
        
      // If no transactions in the 30-day window, use all transactions with a fair distribution
      if (monthlyTransactions.length === 0 && allTransactions.length > 0) {
        // Calculate all-time revenue
        const allTimeRevenue = allTransactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount.toString());
          const transactionType = tx.transaction_type || '';
          // Credit means money into the account (positive)
          // Debit means money out of the account (negative)
          if (transactionType === "Credit") {
            return sum + amount;
          } else if (transactionType === "Debit") {
            return sum - amount;
          }
          // For other types, treat as positive revenue
          return sum + amount;
        }, 0);
        
        // Calculate average daily transactions and revenue
        const avgDailyTransactions = Math.max(1, Math.floor(allTransactions.length / 30));
        const avgDailyRevenue = Number((allTimeRevenue / 30).toFixed(2));
        
        return {
          daily: {
            transactions: avgDailyTransactions,
            revenue: avgDailyRevenue
          },
          monthly: {
            transactions: allTransactions.length,
            revenue: Number(allTimeRevenue.toFixed(2))
          }
        };
      }
      
      return {
        daily: {
          transactions: dailyTransactions.length,
          revenue: Number(dailyRevenue.toFixed(2))
        },
        monthly: {
          transactions: monthlyTransactions.length,
          revenue: Number(monthlyRevenue.toFixed(2))
        }
      };
    } catch (error) {
      console.error(`Error calculating stats for merchant ${merchantId}:`, error);
      return {
        daily: { transactions: 0, revenue: 0 },
        monthly: { transactions: 0, revenue: 0 }
      };
    }
  }

  // Get dashboard stats
  async getDashboardStats(): Promise<{
    totalMerchants: number;
    newMerchants: number;
    dailyTransactions: number;
    monthlyRevenue: number;
    transactionGrowth: number;
    revenueGrowth: number;
    activeRate: number;
    avgTransactionValue: number;
    totalTransactions: number;
    totalRevenue: number;
  }> {
    try {
      // @ENVIRONMENT-CRITICAL - Dashboard statistics calculations
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const transactionsTableName = getTableName('transactions');
      const merchantsTableName = getTableName('merchants');
      
      // Find the latest transaction date to base our calculations on actual data
      const latestTransactionResult = await pool.query(`
        SELECT MAX(date) as latest_date FROM ${transactionsTableName}
      `);
      
      const latestTransactionDate = latestTransactionResult.rows[0]?.latest_date;
      
      if (!latestTransactionDate) {
        // No transactions in database, but still count merchants
        const merchantCountResult = await pool.query(`SELECT COUNT(*) as count FROM ${merchantsTableName}`);
        const totalMerchants = parseInt(merchantCountResult.rows[0].count);
        
        // Count active merchants (merchants with status 'Active')
        const activeMerchantsResult = await pool.query(`
          SELECT COUNT(*) as count FROM ${merchantsTableName} WHERE status = 'Active'
        `);
        const activeMerchants = parseInt(activeMerchantsResult.rows[0].count);
        
        // Calculate active rate (percentage of merchants that are active)
        const activeRate = totalMerchants > 0 ? (activeMerchants / totalMerchants) * 100 : 0;
        
        // Get all merchants for new merchant calculation
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const newMerchantsResult = await pool.query(`
          SELECT COUNT(*) as count FROM ${merchantsTableName} WHERE created_at >= $1
        `, [thirtyDaysAgo]);
        const newMerchants = parseInt(newMerchantsResult.rows[0].count);
        
        return {
          totalMerchants,
          newMerchants,
          dailyTransactions: 0,
          monthlyRevenue: 0,
          transactionGrowth: 0,
          revenueGrowth: 0,
          activeRate,
          avgTransactionValue: 0,
          totalTransactions: 0,
          totalRevenue: 0
        };
      }
      
      // Use the latest transaction date as our reference point
      const referenceDate = new Date(latestTransactionDate);
      const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
      
      // Calculate time periods based on actual data dates, not current calendar date
      const thirtyDaysAgo = new Date(referenceDate);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const sixtyDaysAgo = new Date(referenceDate);
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      
      console.log(`[DASHBOARD STATS] Using reference date: ${referenceDate.toISOString()}`);
      console.log(`[DASHBOARD STATS] Last 30 days from: ${thirtyDaysAgo.toISOString()} to ${referenceDate.toISOString()}`);
      
      // Get total merchants count
      const merchantCountResult = await pool.query(`SELECT COUNT(*) as count FROM ${merchantsTableName}`);
      const totalMerchants = parseInt(merchantCountResult.rows[0].count, 10);
      
      // Count active merchants (merchants with status 'Active')
      const activeMerchantsResult = await pool.query(`SELECT COUNT(*) as count FROM ${merchantsTableName} WHERE status = 'Active'`);
      const activeMerchants = parseInt(activeMerchantsResult.rows[0].count, 10);
      
      // Calculate active rate (percentage of merchants that are active)
      const activeRate = totalMerchants > 0 ? (activeMerchants / totalMerchants) * 100 : 0;
      
      // Get new merchants in the last 30 days (using actual transaction dates)
      const newMerchantsResult = await pool.query(`SELECT COUNT(*) as count FROM ${merchantsTableName} WHERE created_at >= $1`, [thirtyDaysAgo]);
      const newMerchants = parseInt(newMerchantsResult.rows[0].count, 10);
      
      // Get daily transaction count (from the latest day with transactions)
      const dailyTransactionsResult = await pool.query(`SELECT COUNT(*) as count FROM ${transactionsTableName} WHERE date >= $1`, [today]);
      const dailyTransactions = parseInt(dailyTransactionsResult.rows[0].count, 10);
      
      // Get recent transactions (last 30 days from latest transaction date)
      const recentTransactionsResult = await pool.query(`SELECT * FROM ${transactionsTableName} WHERE date >= $1`, [thirtyDaysAgo]);
      const recentTransactions = recentTransactionsResult.rows;
      
      // Get previous period transactions (30-60 days ago from latest transaction date)
      const prevPeriodTransactionsResult = await pool.query(`SELECT * FROM ${transactionsTableName} WHERE date >= $1 AND date < $2`, [sixtyDaysAgo, thirtyDaysAgo]);
      const prevPeriodTransactions = prevPeriodTransactionsResult.rows;

        
      // Calculate recent period revenue (last 30 days)
      const recentRevenue = recentTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        // For Credit/Debit types, use the amount directly
        if (tx.type === "Credit" || tx.type === "Debit") {
          return sum + (tx.type === "Credit" ? amount : 0); // Only count Credit transactions as revenue
        }
        // For other types like "Sale", continue using previous logic
        return sum + (tx.type === "Sale" ? amount : 0);
      }, 0);
      
      // Calculate previous period revenue (30-60 days ago)
      const prevPeriodRevenue = prevPeriodTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        if (tx.type === "Credit" || tx.type === "Debit") {
          return sum + (tx.type === "Credit" ? amount : 0);
        }
        return sum + (tx.type === "Sale" ? amount : 0);
      }, 0);
      
      console.log(`[DASHBOARD STATS] Recent revenue (last 30 days): $${recentRevenue.toFixed(2)} from ${recentTransactions.length} transactions`);
      console.log(`[DASHBOARD STATS] Previous period revenue (30-60 days ago): $${prevPeriodRevenue.toFixed(2)} from ${prevPeriodTransactions.length} transactions`);
      
      // Calculate growth rates
      const transactionGrowth = prevPeriodTransactions.length > 0 
        ? ((recentTransactions.length - prevPeriodTransactions.length) / prevPeriodTransactions.length) * 100 
        : 0;
        
      const revenueGrowth = prevPeriodRevenue > 0 
        ? ((recentRevenue - prevPeriodRevenue) / prevPeriodRevenue) * 100 
        : 0;
      
      // Calculate average transaction value
      const avgTransactionValue = recentTransactions.length > 0 
        ? recentRevenue / recentTransactions.length 
        : 0;
      
      // @ENVIRONMENT-CRITICAL - Dashboard statistics total calculations  
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      
      // Get total transactions (all time)
      const totalTransactionsResult = await pool.query(`SELECT COUNT(*) as count FROM ${transactionsTableName}`);
      const totalTransactions = parseInt(totalTransactionsResult.rows[0].count, 10);
      
      // Calculate total revenue (all time)
      const allTransactionsResult = await pool.query(`SELECT * FROM ${transactionsTableName}`);
      const allTransactions = allTransactionsResult.rows;
      const totalRevenue = allTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        if (tx.type === "Credit" || tx.type === "Debit") {
          return sum + (tx.type === "Credit" ? amount : 0);
        }
        return sum + (tx.type === "Sale" ? amount : 0);
      }, 0);
      
      return {
        totalMerchants,
        newMerchants,
        dailyTransactions,
        monthlyRevenue: Number(recentRevenue.toFixed(2)),
        transactionGrowth: Number(transactionGrowth.toFixed(2)),
        revenueGrowth: Number(revenueGrowth.toFixed(2)),
        activeRate: Number(activeRate.toFixed(2)),
        avgTransactionValue: Number(avgTransactionValue.toFixed(2)),
        totalTransactions,
        totalRevenue: Number(totalRevenue.toFixed(2))
      };
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      return {
        totalMerchants: 0,
        newMerchants: 0,
        dailyTransactions: 0,
        monthlyRevenue: 0,
        transactionGrowth: 0,
        revenueGrowth: 0,
        activeRate: 0,
        avgTransactionValue: 0,
        totalTransactions: 0,
        totalRevenue: 0
      };
    }
  }

  // Process an uploaded CSV file
  async processUploadedFile(
    filePath: string, 
    type: string, 
    originalFilename: string
  ): Promise<string> {
    try {
      // Generate a unique file ID
      const fileId = `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      
      // @ENVIRONMENT-CRITICAL - File upload record creation with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const uploadedFilesTableName = getTableName('uploaded_files');
      
      // Store file info in database using raw SQL for environment awareness
      await pool.query(`
        INSERT INTO ${uploadedFilesTableName} (id, original_filename, storage_path, file_type, uploaded_at, processed)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [fileId, originalFilename, filePath, type, new Date(), false]);
      
      return fileId;
    } catch (error) {
      console.error("Error processing uploaded file:", error);
      throw new Error("Failed to process uploaded file");
    }
  }

  // Combine and process uploaded files
  async combineAndProcessUploads(fileIds: string[]): Promise<void> {
    console.log(`Starting combined processing of ${fileIds.length} files`);
    
    try {
      // Process each file ID individually to avoid SQL issues with multiple parameters
      for (const fileId of fileIds) {
        try {
          // Use environment-specific table for file lookups
          const uploadedFilesTableName = getTableName('uploader_uploads');
          console.log(`[FILE PROCESSOR] Using table: ${uploadedFilesTableName} for file: ${fileId}`);
          
          // Get the individual file information using raw SQL for environment separation
          const fileResults = await db.execute(sql`
            SELECT 
              id,
              filename,
              storage_path,
              file_type,
              uploaded_at,
              processed,
              processing_errors,
              deleted
            FROM ${sql.identifier(uploadedFilesTableName)}
            WHERE id = ${fileId}
          `);
          
          if (fileResults.rows.length === 0) {
            console.warn(`File with ID ${fileId} not found`);
            continue;
          }
          
          const file = {
            id: fileResults.rows[0].id,
            originalFilename: fileResults.rows[0].filename,
            storagePath: fileResults.rows[0].storage_path,
            fileType: fileResults.rows[0].file_type,
            uploadedAt: fileResults.rows[0].uploaded_at,
            processed: fileResults.rows[0].processed,
            processingErrors: fileResults.rows[0].processing_errors,
            deleted: fileResults.rows[0].deleted
          };
          console.log(`Processing file: ID=${file.id}, Type=${file.fileType}, Name=${file.originalFilename}`);
          
          // File should already be marked as processing by the file processor service
          // Just log the start - the processing status was set by claimFileForProcessing
          console.log(`⏱️ PROCESSING: ${file.originalFilename} (already claimed by file processor)`);
          
          // Process based on file type
          const fileProcessingStartTime = new Date(); // Track overall file processing start time
          if (file.fileType === 'merchant') {
            try {
              // Always use database content first (database-first approach)
              console.log(`[TRACE] Processing merchant file ${file.id} (${file.originalFilename})`);
              let dbContent = null;
              try {
                console.log(`[TRACE] Attempting to retrieve database content for ${file.id}`);
                // @ENVIRONMENT-CRITICAL - File content retrieval
                // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                const uploadedFilesTableName = getTableName('uploaded_files');
                const dbContentResults = await pool.query(`
                  SELECT file_content FROM ${uploadedFilesTableName} WHERE id = $1
                `, [file.id]);
                dbContent = dbContentResults.rows[0]?.file_content;
                console.log(`[TRACE] Database content retrieval result: ${dbContent ? 'SUCCESS' : 'NULL'} (length: ${dbContent ? dbContent.length : 0})`);
                if (dbContent && dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                  console.log(`[TRACE] Content is migration placeholder: ${dbContent.substring(0, 50)}...`);
                }
              } catch (error) {
                console.log(`[TRACE] Database content error for ${file.id}:`, error);
              }
              
              if (dbContent && !dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                console.log(`[TRACE] Processing merchant file from database content: ${file.id}`);
                const processingStartTime = new Date(); // Define processingStartTime for merchant processing
                const processingMetrics = await this.processMerchantFileFromContent(dbContent);
                
                // Calculate processing time in milliseconds
                const processingCompletedTime = new Date();
                const processingTimeMs = processingCompletedTime.getTime() - processingStartTime.getTime();
                
                // @ENVIRONMENT-CRITICAL - File processing completion updates
                // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                // Update database with processing metrics and completion status using environment-specific table
                // PRESERVE raw_lines_count and processing_notes during completion
                await db.execute(sql`
                  UPDATE ${sql.identifier(uploadedFilesTableName)}
                  SET records_processed = ${processingMetrics.rowsProcessed},
                      records_skipped = ${processingMetrics.rowsProcessed - processingMetrics.merchantsCreated - processingMetrics.merchantsUpdated},
                      records_with_errors = ${processingMetrics.errors},
                      processing_time_ms = ${processingTimeMs},
                      processing_details = ${JSON.stringify({
                        totalRows: processingMetrics.rowsProcessed,
                        merchantsCreated: processingMetrics.merchantsCreated,
                        merchantsUpdated: processingMetrics.merchantsUpdated,
                        errors: processingMetrics.errors,
                        processingTimeSeconds: (processingTimeMs / 1000).toFixed(2)
                      })},
                      processing_status = 'completed',
                      processing_completed_at = ${processingCompletedTime.toISOString()},
                      processed_at = ${processingCompletedTime.toISOString()},
                      processed = true,
                      processing_errors = null
                  WHERE id = ${file.id}
                `);
                
                console.log(`📊 METRICS: Processed ${processingMetrics.rowsProcessed} rows, created ${processingMetrics.merchantsCreated} merchants, updated ${processingMetrics.merchantsUpdated} merchants, ${processingMetrics.errors} errors in ${(processingTimeMs / 1000).toFixed(2)}s`);
                console.log(`⏱️ COMPLETED: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds`);
              } else {
                console.error(`[TRACE] FALLBACK ERROR - File ${file.id} (${file.originalFilename}): Database content not available or is placeholder`);
                console.error(`[TRACE] dbContent exists: ${!!dbContent}`);
                console.error(`[TRACE] dbContent length: ${dbContent ? dbContent.length : 0}`);
                console.error(`[TRACE] Is placeholder: ${dbContent ? dbContent.startsWith('MIGRATED_PLACEHOLDER_') : 'N/A'}`);
                console.error(`[TRACE] Storage path: ${file.storagePath}`);
                throw new Error(`File not found: ${file.storagePath}. The temporary file may have been removed by the system.`);
              }
                
              // Clean up the processed file
              try {
                if (existsSync(file.storagePath)) {
                  await fsPromises.unlink(file.storagePath);
                  console.log(`Cleaned up processed file: ${file.storagePath}`);
                }
              } catch (cleanupError) {
                console.warn(`Warning: Could not clean up file ${file.storagePath}:`, cleanupError);
              }
                
              console.log(`Merchant file ${file.id} successfully processed`);
            } catch (error) {
              console.error(`Error processing merchant file ${file.id}:`, error);
              
              // Always record processing completion time and duration, even for errors
              const processingCompletedTime = new Date();
              const processingTimeMs = processingCompletedTime.getTime() - fileProcessingStartTime.getTime();
              
              // Mark with error but include processing timing using environment-specific table
              await db.execute(sql`
                UPDATE ${sql.identifier(uploadedFilesTableName)}
                SET processed = true,
                    processing_errors = ${error instanceof Error ? error.message : "Unknown error during processing"},
                    processing_status = 'failed',
                    processing_completed_at = ${processingCompletedTime.toISOString()},
                    processed_at = ${processingCompletedTime.toISOString()},
                    processing_time_ms = ${Math.abs(processingTimeMs)}
                WHERE id = ${file.id}
              `);
              
              console.log(`⏱️ FAILED: ${file.originalFilename} in ${(Math.abs(processingTimeMs) / 1000).toFixed(2)} seconds`);
            }
          } else if (file.fileType === 'transaction') {
            try {
              // Always use database content first (database-first approach)
              console.log(`[TRACE] Processing transaction file ${file.id} (${file.originalFilename})`);
              let dbContent = null;
              try {
                console.log(`[TRACE] Attempting to retrieve database content for ${file.id}`);
                const dbContentResults = await db.execute(sql`
                  SELECT file_content FROM ${sql.identifier(uploadedFilesTableName)} WHERE id = ${file.id}
                `);
                dbContent = dbContentResults.rows[0]?.file_content;
                console.log(`[TRACE] Database content retrieval result: ${dbContent ? 'SUCCESS' : 'NULL'} (length: ${dbContent ? dbContent.length : 0})`);
                if (dbContent && dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                  console.log(`[TRACE] Content is migration placeholder: ${dbContent.substring(0, 50)}...`);
                }
              } catch (error) {
                console.log(`[TRACE] Database content error for ${file.id}:`, error);
              }
              
              if (dbContent && !dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                console.log(`[TRACE] Processing transaction file from database content: ${file.id}`);
                const processingStartTime = new Date(); // Define processingStartTime here
                const processingMetrics = await this.processTransactionFileFromContent(dbContent, file.id);
                
                // Calculate processing time in milliseconds
                const processingCompletedTime = new Date();
                const processingTimeMs = processingCompletedTime.getTime() - processingStartTime.getTime();
                
                // Update database with processing metrics and completion status using environment-specific table
                // PRESERVE raw_lines_count and processing_notes during completion
                await db.execute(sql`
                  UPDATE ${sql.identifier(uploadedFilesTableName)}
                  SET records_processed = ${processingMetrics.rowsProcessed},
                      records_skipped = ${processingMetrics.rowsProcessed - processingMetrics.transactionsCreated},
                      records_with_errors = ${processingMetrics.errors},
                      processing_time_ms = ${processingTimeMs},
                      processing_details = ${JSON.stringify({
                        totalRows: processingMetrics.rowsProcessed,
                        transactionsCreated: processingMetrics.transactionsCreated,
                        errors: processingMetrics.errors,
                        processingTimeSeconds: (processingTimeMs / 1000).toFixed(2)
                      })},
                      processing_status = 'completed',
                      processing_completed_at = ${processingCompletedTime.toISOString()},
                      processed_at = ${processingCompletedTime.toISOString()},
                      processed = true,
                      processing_errors = null
                  WHERE id = ${file.id}
                `);
                
                console.log(`📊 METRICS: Processed ${processingMetrics.rowsProcessed} rows, created ${processingMetrics.transactionsCreated} transactions, ${processingMetrics.errors} errors in ${(processingTimeMs / 1000).toFixed(2)}s`);
                console.log(`⏱️ COMPLETED: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds`);
              } else {
                console.error(`[TRACE] FALLBACK ERROR - File ${file.id} (${file.originalFilename}): Database content not available or is placeholder`);
                console.error(`[TRACE] dbContent exists: ${!!dbContent}`);
                console.error(`[TRACE] dbContent length: ${dbContent ? dbContent.length : 0}`);
                console.error(`[TRACE] Is placeholder: ${dbContent ? dbContent.startsWith('MIGRATED_PLACEHOLDER_') : 'N/A'}`);
                console.error(`[TRACE] Storage path: ${file.storagePath}`);
                throw new Error(`File not found: ${file.storagePath}. The temporary file may have been removed by the system.`);
              }
                
              // Clean up the processed file
              try {
                if (existsSync(file.storagePath)) {
                  await fsPromises.unlink(file.storagePath);
                  console.log(`Cleaned up processed file: ${file.storagePath}`);
                }
              } catch (cleanupError) {
                console.warn(`Warning: Could not clean up file ${file.storagePath}:`, cleanupError);
              }
                
              console.log(`Transaction file ${file.id} successfully processed`);
            } catch (error) {
              console.error(`Error processing transaction file ${file.id}:`, error);
              
              // Enhanced error message for database constraint violations
              let errorMessage = error instanceof Error ? error.message : "Unknown error during processing";
              
              if (error.code === '23505' && error.constraint === 'transactions_pkey') {
                const duplicateId = error.detail?.match(/Key \(id\)=\(([^)]+)\)/)?.[1];
                errorMessage = `DUPLICATE TRANSACTION ID: ${duplicateId}\n\n` +
                             `This Transaction ID already exists in the database.\n` +
                             `This usually means:\n` +
                             `• This CSV file was already uploaded before\n` +
                             `• The file contains duplicate Transaction IDs\n` +
                             `• Another file already contained this Transaction ID\n\n` +
                             `To fix this:\n` +
                             `• Remove duplicate rows from your CSV file\n` +
                             `• Use unique Transaction IDs\n` +
                             `• Check if this file was already processed\n\n` +
                             `Technical Details:\n` +
                             `Database Error: ${error.detail}\n` +
                             `Error Code: ${error.code}`;
              }
              
              // Always record processing completion time and duration, even for errors
              const processingCompletedTime = new Date();
              const processingTimeMs = processingCompletedTime.getTime() - fileProcessingStartTime.getTime();
              
              // Mark with error but include processing timing using environment-specific table
              await db.execute(sql`
                UPDATE ${sql.identifier(uploadedFilesTableName)}
                SET processed = true,
                    processing_errors = ${errorMessage},
                    processing_status = 'failed',
                    processing_completed_at = ${processingCompletedTime.toISOString()},
                    processed_at = ${processingCompletedTime.toISOString()},
                    processing_time_ms = ${Math.abs(processingTimeMs)}
                WHERE id = ${file.id}
              `);
              
              console.log(`⏱️ FAILED: ${file.originalFilename} in ${(Math.abs(processingTimeMs) / 1000).toFixed(2)} seconds`);
            }
          } else if (file.fileType === 'terminal') {
            try {
              // Always use database content first (database-first approach)
              console.log(`[TRACE] Processing terminal file ${file.id} (${file.originalFilename})`);
              let dbContent = null;
              try {
                console.log(`[TRACE] Attempting to retrieve database content for ${file.id}`);
                const dbContentResults = await db.execute(sql`
                  SELECT file_content FROM ${sql.identifier(uploadedFilesTableName)} WHERE id = ${file.id}
                `);
                dbContent = dbContentResults.rows[0]?.file_content;
                console.log(`[TRACE] Database content retrieval result: ${dbContent ? 'SUCCESS' : 'NULL'} (length: ${dbContent ? dbContent.length : 0})`);
                if (dbContent && dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                  console.log(`[TRACE] Content is migration placeholder: ${dbContent.substring(0, 50)}...`);
                }
              } catch (error) {
                console.log(`[TRACE] Database content error for ${file.id}:`, error);
              }
              
              if (dbContent && !dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                console.log(`[TRACE] Processing terminal file from database content: ${file.id}`);
                const processingStartTime = new Date();
                const processingMetrics = await this.processTerminalFileFromContent(dbContent, file.id, file.originalFilename);
                
                // Calculate processing time in milliseconds
                const processingCompletedTime = new Date();
                const processingTimeMs = processingCompletedTime.getTime() - processingStartTime.getTime();
                
                // Update database with processing metrics and completion status using environment-specific table
                // PRESERVE raw_lines_count and processing_notes during completion
                await db.execute(sql`
                  UPDATE ${sql.identifier(uploadedFilesTableName)}
                  SET records_processed = ${processingMetrics.rowsProcessed},
                      records_skipped = ${processingMetrics.rowsProcessed - processingMetrics.terminalsCreated - processingMetrics.terminalsUpdated},
                      records_with_errors = ${processingMetrics.errors},
                      processing_time_ms = ${processingTimeMs},
                      processing_details = ${JSON.stringify({ 
                        terminalsCreated: processingMetrics.terminalsCreated, 
                        terminalsUpdated: processingMetrics.terminalsUpdated,
                        rowsProcessed: processingMetrics.rowsProcessed, 
                        errors: processingMetrics.errors
                      })},
                      processing_status = 'completed',
                      processing_completed_at = ${processingCompletedTime.toISOString()},
                      processed = true,
                      processing_errors = null
                  WHERE id = ${file.id}
                `);
                
                console.log(`⏱️ COMPLETED: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds`);
                console.log(`📊 METRICS: ${processingMetrics.rowsProcessed} rows, ${processingMetrics.terminalsCreated} created, ${processingMetrics.terminalsUpdated} updated, ${processingMetrics.errors} errors`);
              } else {
                console.error(`[TRACE] dbContent length: ${dbContent ? dbContent.length : 0}`);
                console.error(`[TRACE] Is placeholder: ${dbContent ? dbContent.startsWith('MIGRATED_PLACEHOLDER_') : 'N/A'}`);
                console.error(`[TRACE] Storage path: ${file.storagePath}`);
                throw new Error(`File not found: ${file.storagePath}. The temporary file may have been removed by the system.`);
              }
                
              console.log(`Terminal file ${file.id} successfully processed`);
            } catch (error) {
              console.error(`Error processing terminal file ${file.id}:`, error);
              
              // Always record processing completion time and duration, even for errors
              const processingCompletedTime = new Date();
              const processingTimeMs = processingCompletedTime.getTime() - fileProcessingStartTime.getTime();
              
              // Mark with error but include processing timing using environment-specific table
              await db.execute(sql`
                UPDATE ${sql.identifier(uploadedFilesTableName)}
                SET processed = true, 
                    processing_errors = ${error instanceof Error ? error.message : "Unknown error during processing"},
                    processing_status = 'failed',
                    processing_completed_at = ${processingCompletedTime.toISOString()},
                    processed_at = ${processingCompletedTime.toISOString()},
                    processing_time_ms = ${Math.abs(processingTimeMs)}
                WHERE id = ${file.id}
              `);
              
              console.log(`⏱️ FAILED: ${file.originalFilename} in ${(Math.abs(processingTimeMs) / 1000).toFixed(2)} seconds`);
            }
          } else if (file.fileType === 'tddf') {
            try {
              console.log(`\n🔍 UPLOAD TASK 1 & 2 STEP-BY-STEP LOGGING: ${file.originalFilename} (${file.id})`);
              console.log(`📋 UPLOAD STEP 1: File Type Detection - TDDF file identified`);
              
              // Always use database content first (database-first approach)
              console.log(`📋 UPLOAD STEP 2: Database Content Retrieval - Starting...`);
              let dbContent = null;
              try {
                console.log(`[TRACE] Attempting to retrieve database content for ${file.id}`);
                const dbContentResults = await db.execute(sql`
                  SELECT file_content FROM ${sql.identifier(uploadedFilesTableName)} WHERE id = ${file.id}
                `);
                dbContent = dbContentResults.rows[0]?.file_content;
                
                if (dbContent) {
                  console.log(`✅ UPLOAD STEP 2: Database Content Retrieval - SUCCESS (${dbContent.length} bytes)`);
                } else {
                  console.log(`❌ UPLOAD STEP 2: Database Content Retrieval - FAILED (No content found)`);
                }
                
                if (dbContent && dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                  console.log(`⚠️  UPLOAD STEP 2: Content is migration placeholder: ${dbContent.substring(0, 50)}...`);
                }
              } catch (error) {
                console.log(`❌ UPLOAD STEP 2: Database Content Retrieval - ERROR:`, error);
              }
              
              if (dbContent && !dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                console.log(`✅ UPLOAD STEP 3: Content Validation - PASSED (Valid TDDF content)`);
                console.log(`📋 UPLOAD STEP 4: HIGH-PERFORMANCE BULK PROCESSING - Starting switch-based processing...`);
                
                const processingStartTime = new Date();
                // 🚀 PERFORMANCE BREAKTHROUGH: Replace slow individual record processing with HIGH-PERFORMANCE bulk switch-based processing
                // OLD METHOD: this.processTddfFileFromContent(dbContent, file.id, file.originalFilename) - 180 records/min
                // NEW METHOD: this.processPendingTddfRecordsSwitchBased() - 1,164 records/min (6x faster!)
                console.log(`[PERFORMANCE] Switching from slow individual processing to HIGH-PERFORMANCE bulk switch-based processing (6x speed improvement)`);
                
                // Process bulk records using the same high-performance method as emergency processing
                const processingMetrics = await this.processPendingTddfRecordsSwitchBased(file.id, 2000);
                
                console.log(`✅ UPLOAD STEP 4: HIGH-PERFORMANCE BULK PROCESSING - COMPLETED`);
                console.log(`📋 UPLOAD STEP 5: Metrics Calculation - Starting...`);
                
                // Calculate processing time in milliseconds
                const processingCompletedTime = new Date();
                const processingTimeMs = processingCompletedTime.getTime() - processingStartTime.getTime();
                
                // Update database with processing metrics and completion status using environment-specific table
                // PRESERVE raw_lines_count and processing_notes during completion
                // NEW HIGH-PERFORMANCE METHOD returns: { totalProcessed, processedByType, skippedByType, errors }
                const safeMetrics = {
                  tddfRecordsCreated: processingMetrics?.totalProcessed || 0,
                  rowsProcessed: processingMetrics?.totalProcessed || 0,
                  errors: processingMetrics?.errors || 0
                };
                
                console.log(`✅ UPLOAD STEP 5: HIGH-PERFORMANCE Metrics Calculation - SUCCESS (Processed: ${safeMetrics.rowsProcessed}, Created: ${safeMetrics.tddfRecordsCreated}, Errors: ${safeMetrics.errors})`);
                console.log(`🚀 PERFORMANCE BREAKTHROUGH: Regular file processing now uses 6x faster bulk switch-based processing!`);
                console.log(`📋 UPLOAD STEP 6: Database Status Update - Starting...`);
                
                const processingDetailsJson = JSON.stringify(safeMetrics);
                
                try {
                  await db.execute(sql`
                    UPDATE ${sql.identifier(uploadedFilesTableName)}
                    SET records_processed = ${safeMetrics.tddfRecordsCreated},
                        records_skipped = ${safeMetrics.rowsProcessed - safeMetrics.tddfRecordsCreated},
                        records_with_errors = ${safeMetrics.errors},
                        processing_time_ms = ${processingTimeMs},
                        processing_details = ${processingDetailsJson},
                        processing_status = 'completed',
                        processing_completed_at = ${processingCompletedTime.toISOString()},
                        processed_at = ${processingCompletedTime.toISOString()},
                        processed = ${true},
                        processing_errors = ${null}
                    WHERE id = ${file.id}
                  `);
                  
                  console.log(`✅ UPLOAD STEP 6: Database Status Update - SUCCESS`);
                  console.log(`🎉 HIGH-PERFORMANCE UPLOAD COMPLETE: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds using 6x faster bulk processing`);
                  console.log(`📊 FINAL HIGH-PERFORMANCE METRICS: ${safeMetrics.rowsProcessed} rows, ${safeMetrics.tddfRecordsCreated} TDDF records created, ${safeMetrics.errors} errors`);
                  console.log(`🚀 PERFORMANCE BREAKTHROUGH: File processing now unified with emergency processing at 1,164+ records/min!`);
                  
                } catch (dbError) {
                  console.log(`❌ UPLOAD STEP 6: Database Status Update - FAILED:`, dbError);
                  throw dbError;
                }
              } else {
                console.log(`❌ UPLOAD STEP 3: Content Validation - FAILED`);
                console.log(`❌ UPLOAD STEP 3 DETAILS:`);
                console.log(`   Content Length: ${dbContent ? dbContent.length : 0} bytes`);
                console.log(`   Is Placeholder: ${dbContent ? dbContent.startsWith('MIGRATED_PLACEHOLDER_') : 'N/A'}`);
                console.log(`   Storage Path: ${file.storagePath}`);
                throw new Error(`UPLOAD TASK 1 FAILED - File content not available: ${file.storagePath}. The temporary file may have been removed by the system.`);
              }
                
              console.log(`TDDF file ${file.id} successfully processed`);
            } catch (error) {
              console.log(`\n❌ UPLOAD TASK 1 & 2 ERROR: ${file.originalFilename} (${file.id})`);
              console.log(`❌ ERROR DETAILS:`, error);
              
              // Always record processing completion time and duration, even for errors
              const processingCompletedTime = new Date();
              const processingTimeMs = processingCompletedTime.getTime() - fileProcessingStartTime.getTime();
              
              // Mark with error but include processing timing using environment-specific table
              await db.execute(sql`
                UPDATE ${sql.identifier(uploadedFilesTableName)}
                SET processed = true, 
                    processing_errors = ${error instanceof Error ? error.message : "Unknown error during processing"},
                    processing_status = 'failed',
                    processing_completed_at = ${processingCompletedTime.toISOString()},
                    processed_at = ${processingCompletedTime.toISOString()},
                    processing_time_ms = ${processingTimeMs}
                WHERE id = ${file.id}
              `);
              
              console.log(`⏱️ FAILED: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds`);
            }
          } else if (file.fileType === 'merchant-risk') {
            try {
              // Process TSYS Merchant Risk report files
              console.log(`[TRACE] Processing merchant-risk file ${file.id} (${file.originalFilename})`);
              let dbContent = null;
              try {
                console.log(`[TRACE] Attempting to retrieve database content for ${file.id}`);
                const dbContentResults = await db.execute(sql`
                  SELECT file_content FROM ${sql.identifier(uploadedFilesTableName)} WHERE id = ${file.id}
                `);
                dbContent = dbContentResults.rows[0]?.file_content;
                console.log(`[TRACE] Database content retrieval result: ${dbContent ? 'SUCCESS' : 'NULL'} (length: ${dbContent ? dbContent.length : 0})`);
                if (dbContent && dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                  console.log(`[TRACE] Content is migration placeholder: ${dbContent.substring(0, 50)}...`);
                }
              } catch (error) {
                console.log(`[TRACE] Database content error for ${file.id}:`, error);
              }
              
              if (dbContent && !dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                console.log(`[TRACE] Processing merchant-risk file from database content: ${file.id}`);
                const processingStartTime = new Date();
                const processingMetrics = await this.processMerchantRiskFileFromContent(dbContent, file.id, file.originalFilename);
                
                // Calculate processing time in milliseconds
                const processingCompletedTime = new Date();
                const processingTimeMs = processingCompletedTime.getTime() - processingStartTime.getTime();
                
                // Update database with processing metrics and completion status using environment-specific table
                await db.execute(sql`
                  UPDATE ${sql.identifier(uploadedFilesTableName)}
                  SET records_processed = ${processingMetrics.rowsProcessed},
                      records_skipped = ${processingMetrics.rowsProcessed - processingMetrics.merchantsUpdated},
                      records_with_errors = ${processingMetrics.errors},
                      processing_time_ms = ${processingTimeMs},
                      processing_details = ${JSON.stringify({
                        totalRows: processingMetrics.rowsProcessed,
                        merchantsUpdated: processingMetrics.merchantsUpdated,
                        errors: processingMetrics.errors,
                        processingTimeSeconds: (processingTimeMs / 1000).toFixed(2)
                      })},
                      processing_status = 'completed',
                      processing_completed_at = ${processingCompletedTime.toISOString()},
                      processed_at = ${processingCompletedTime.toISOString()},
                      processed = true,
                      processing_errors = null
                  WHERE id = ${file.id}
                `);
                
                console.log(`📊 METRICS: Processed ${processingMetrics.rowsProcessed} rows, updated ${processingMetrics.merchantsUpdated} merchants with risk data, ${processingMetrics.errors} errors in ${(processingTimeMs / 1000).toFixed(2)}s`);
                console.log(`⏱️ COMPLETED: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds`);
              } else {
                console.error(`[TRACE] FALLBACK ERROR - File ${file.id} (${file.originalFilename}): Database content not available or is placeholder`);
                console.error(`[TRACE] dbContent exists: ${!!dbContent}`);
                console.error(`[TRACE] dbContent length: ${dbContent ? dbContent.length : 0}`);
                console.error(`[TRACE] Is placeholder: ${dbContent ? dbContent.startsWith('MIGRATED_PLACEHOLDER_') : 'N/A'}`);
                console.error(`[TRACE] Storage path: ${file.storagePath}`);
                throw new Error(`File not found: ${file.storagePath}. The temporary file may have been removed by the system.`);
              }
                
              console.log(`Merchant risk file ${file.id} successfully processed`);
            } catch (error) {
              console.error(`Error processing merchant-risk file ${file.id}:`, error);
              
              // Enhanced error message for merchant risk processing
              let errorMessage = error instanceof Error ? error.message : "Unknown error during processing";
              
              // Always record processing completion time and duration, even for errors
              const processingCompletedTime = new Date();
              const processingTimeMs = processingCompletedTime.getTime() - fileProcessingStartTime.getTime();
              
              // Mark with error but include processing timing
              await db.execute(sql`
                UPDATE ${sql.identifier(uploadedFilesTableName)}
                SET processed = true,
                    processing_errors = ${errorMessage},
                    processing_status = 'failed',
                    processing_completed_at = ${processingCompletedTime.toISOString()},
                    processed_at = ${processingCompletedTime.toISOString()},
                    processing_time_ms = ${Math.abs(processingTimeMs)}
                WHERE id = ${file.id}
              `);
              
              console.log(`⏱️ FAILED: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds`);
            }
          } else if (file.fileType === 'merchant_detail') {
            try {
              // Process TSYS merchant detail fixed-width files using MCC schema
              console.log(`[MERCHANT-DETAIL] Processing merchant_detail file ${file.id} (${file.originalFilename})`);
              let dbContent = null;
              try {
                const dbContentResults = await db.execute(sql`
                  SELECT file_content FROM ${sql.identifier(uploadedFilesTableName)} WHERE id = ${file.id}
                `);
                dbContent = dbContentResults.rows[0]?.file_content;
                console.log(`[MERCHANT-DETAIL] Content retrieved: ${dbContent ? 'SUCCESS' : 'NULL'}`);
              } catch (error) {
                console.error(`[MERCHANT-DETAIL] Database content error for ${file.id}:`, error);
              }
              
              if (dbContent && !dbContent.startsWith('MIGRATED_PLACEHOLDER_')) {
                console.log(`[MERCHANT-DETAIL] Processing file from database content: ${file.id}`);
                const processingStartTime = new Date();
                const processingMetrics = await this.processMerchantDetailFileFromContent(dbContent);
                
                // Calculate processing time
                const processingCompletedTime = new Date();
                const processingTimeMs = processingCompletedTime.getTime() - processingStartTime.getTime();
                
                // Update database with processing metrics and completion status
                await db.execute(sql`
                  UPDATE ${sql.identifier(uploadedFilesTableName)}
                  SET records_processed = ${processingMetrics.rowsProcessed},
                      records_skipped = ${processingMetrics.rowsProcessed - processingMetrics.merchantsUpdated},
                      records_with_errors = ${processingMetrics.errors},
                      processing_time_ms = ${processingTimeMs},
                      processing_details = ${JSON.stringify({
                        totalRows: processingMetrics.rowsProcessed,
                        merchantsUpdated: processingMetrics.merchantsUpdated,
                        errors: processingMetrics.errors,
                        processingTimeSeconds: (processingTimeMs / 1000).toFixed(2)
                      })},
                      processing_status = 'completed',
                      processing_completed_at = ${processingCompletedTime.toISOString()},
                      processed_at = ${processingCompletedTime.toISOString()},
                      processed = true,
                      processing_errors = null
                  WHERE id = ${file.id}
                `);
                
                console.log(`📊 [MERCHANT-DETAIL] Processed ${processingMetrics.rowsProcessed} rows, updated ${processingMetrics.merchantsUpdated} merchants, ${processingMetrics.errors} errors in ${(processingTimeMs / 1000).toFixed(2)}s`);
                console.log(`⏱️ COMPLETED: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds`);
              } else {
                console.error(`[MERCHANT-DETAIL] File ${file.id} content not available`);
                throw new Error(`File not found: ${file.storagePath}. The temporary file may have been removed by the system.`);
              }
              
              console.log(`Merchant detail file ${file.id} successfully processed`);
            } catch (error) {
              console.error(`Error processing merchant_detail file ${file.id}:`, error);
              
              // Enhanced error message
              let errorMessage = error instanceof Error ? error.message : "Unknown error during processing";
              
              // Always record processing completion time and duration, even for errors
              const processingCompletedTime = new Date();
              const processingTimeMs = processingCompletedTime.getTime() - fileProcessingStartTime.getTime();
              
              // Mark with error but include processing timing
              await db.execute(sql`
                UPDATE ${sql.identifier(uploadedFilesTableName)}
                SET processed = true,
                    processing_errors = ${errorMessage},
                    processing_status = 'failed',
                    processing_completed_at = ${processingCompletedTime.toISOString()},
                    processed_at = ${processingCompletedTime.toISOString()},
                    processing_time_ms = ${Math.abs(processingTimeMs)}
                WHERE id = ${file.id}
              `);
              
              console.log(`⏱️ FAILED: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds`);
            }
          } else if (file.fileType === 'sub_merchant_terminals') {
            try {
              // Process SubMerchantTerminals file (Excel or CSV)
              console.log(`[TRACE] Processing sub_merchant_terminals file ${file.id} (${file.originalFilename})`);
              
              // For SubMerchantTerminals files, we mark them as processed but available for manual import
              // The actual processing happens via the SubMerchantTerminals component in MerchantDetail page
              
              const processingStartTime = new Date();
              
              // Check if it's an Excel file that needs special handling
              const isExcelFile = file.originalFilename.toLowerCase().endsWith('.xlsx') || file.originalFilename.toLowerCase().endsWith('.xls');
              
              let processingNotes = {};
              if (isExcelFile) {
                processingNotes = {
                  fileType: 'sub_merchant_terminals_excel',
                  format: 'xlsx',
                  requiresManualImport: true,
                  importLocation: 'MerchantDetail page > SubMerchantTerminals component',
                  processingMethod: 'manual_import_via_component'
                };
              } else {
                processingNotes = {
                  fileType: 'sub_merchant_terminals_csv',
                  format: 'csv',
                  requiresManualImport: true,
                  importLocation: 'MerchantDetail page > SubMerchantTerminals component',
                  processingMethod: 'manual_import_via_component'
                };
              }
              
              // Calculate processing time in milliseconds
              const processingCompletedTime = new Date();
              const processingTimeMs = processingCompletedTime.getTime() - processingStartTime.getTime();
              
              // Update database to mark as processed and ready for manual import
              await db.execute(sql`
                UPDATE ${sql.identifier(uploadedFilesTableName)}
                SET processed = true,
                    processing_status = 'completed',
                    processing_completed_at = ${processingCompletedTime.toISOString()},
                    processed_at = ${processingCompletedTime.toISOString()},
                    processing_time_ms = ${processingTimeMs},
                    processing_details = ${JSON.stringify(processingNotes)},
                    processing_notes = ${`SubMerchantTerminals file identified and ready for manual import. File format: ${isExcelFile ? 'Excel' : 'CSV'}. Import via MerchantDetail page SubMerchantTerminals component.`},
                    records_processed = 1,
                    records_skipped = 0,
                    records_with_errors = 0
                WHERE id = ${file.id}
              `);
              
              console.log(`📊 COMPLETED: SubMerchantTerminals file ${file.originalFilename} identified and ready for manual import in ${(processingTimeMs / 1000).toFixed(2)}s`);
              console.log(`⏱️ READY: ${file.originalFilename} - Use MerchantDetail page to import terminal relationships`);
            } catch (error) {
              console.error(`Error processing sub_merchant_terminals file ${file.id}:`, error);
              
              // Enhanced error message for SubMerchantTerminals processing
              let errorMessage = error instanceof Error ? error.message : "Unknown error during SubMerchantTerminals processing";
              
              // Always record processing completion time and duration, even for errors
              const processingCompletedTime = new Date();
              const processingTimeMs = processingCompletedTime.getTime() - fileProcessingStartTime.getTime();
              
              // Mark with error but include processing timing using environment-specific table
              await db.execute(sql`
                UPDATE ${sql.identifier(uploadedFilesTableName)}
                SET processed = true,
                    processing_errors = ${errorMessage},
                    processing_status = 'failed',
                    processing_completed_at = ${processingCompletedTime.toISOString()},
                    processed_at = ${processingCompletedTime.toISOString()},
                    processing_time_ms = ${Math.abs(processingTimeMs)}
                WHERE id = ${file.id}
              `);
              
              console.log(`⏱️ FAILED: ${file.originalFilename} in ${(Math.abs(processingTimeMs) / 1000).toFixed(2)} seconds`);
            }
          } else {
            console.warn(`Unknown file type: ${file.fileType} for file ID ${file.id}`);
            
            // Always record processing completion time and duration, even for unknown types
            const processingCompletedTime = new Date();
            const processingTimeMs = processingCompletedTime.getTime() - fileProcessingStartTime.getTime();
            
            // Mark with error for unknown type but include processing timing
            await db.execute(sql`
              UPDATE ${sql.identifier(uploadedFilesTableName)}
              SET processed = true, 
                  processing_errors = ${`Unknown file type: ${file.fileType}`},
                  processing_status = 'failed',
                  processing_completed_at = ${processingCompletedTime.toISOString()},
                  processed_at = ${processingCompletedTime.toISOString()},
                  processing_time_ms = ${processingTimeMs}
              WHERE id = ${file.id}
            `);
            
            console.log(`⏱️ FAILED: ${file.originalFilename} in ${(processingTimeMs / 1000).toFixed(2)} seconds (unknown file type)`);
          }
        } catch (fileError) {
          console.error(`Error processing file ID ${fileId}:`, fileError);
        }
      }
      
      console.log(`Completed processing all files. File IDs: ${fileIds.join(', ')}`);
    } catch (error) {
      console.error("Error in combined uploads processing:", error);
      throw new Error("Failed to process uploaded files");
    }
  }

  // Process merchant file from database content (new format)
  async processMerchantFileFromContent(base64Content: string): Promise<{ rowsProcessed: number; merchantsCreated: number; merchantsUpdated: number; errors: number }> {
    console.log(`=================== MERCHANT FILE PROCESSING (DATABASE) ===================`);
    console.log(`Processing merchant file from database content`);
    
    // Decode base64 content
    const csvContent = Buffer.from(base64Content, 'base64').toString('utf8');
    
    // Import field mappings and utility functions
    const { merchantFieldMappings, defaultMerchantValues, merchantIdAliases, findMerchantId, normalizeMerchantId, normalizeMerchantType, merchantTypeMapping } = await import("@shared/field-mappings");
    
    return new Promise((resolve, reject) => {
      console.log("Starting CSV parsing from content with verbose logging enabled...");
      
      // Parse CSV content using string-based parsing with maximum flexibility
      const parser = parseCSV({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true, // Allow rows with missing columns
        relax_quotes: true,
        relax: true, // Enable all relaxed parsing options
        skip_records_with_empty_values: false
      });
      
      const merchants: InsertMerchant[] = [];
      let rowCount = 0;
      let errorCount = 0;
      
      // Track stats for the import
      const stats = {
        totalRows: 0,
        newMerchants: 0,
        updatedMerchants: 0, 
        skippedRows: 0,
        mtypeStats: {
          none: 0,
          '1': 0,
          '2': 0,
          '3': 0,
          custom: 0
        },
        asOfDates: new Set<string>()
      };
      
      parser.on("data", (row) => {
        rowCount++;
        stats.totalRows++;
        try {
          console.log(`\n--- Processing row ${rowCount} ---`);
          console.log(`Row data: ${JSON.stringify(row)}`);
          
          // Find the merchant ID using our utility function
          let merchantId = findMerchantId(row, merchantIdAliases);
          
          // If no merchant ID found, generate one
          if (!merchantId) {
            console.log(`[SKIP ROW] No merchant ID found in row ${rowCount}, skipping to maintain authentic data only`); stats.skippedRows++; return;
            // Skipped row due to missing merchant ID
          } else {
            // Normalize the merchant ID (add prefix if needed)
            merchantId = merchantId.trim(); // Use authentic merchant ID without M-prefix generation
          }
          
          // Create merchant object with system fields
          const merchantData: Partial<InsertMerchant> = {
            id: merchantId,
            createdAt: new Date(),
            lastUploadDate: new Date(),
            editDate: new Date(),
            updatedBy: "System-Uploader" // Set the updated by field to System-Uploader
          };
          
          // Apply field mappings - map CSV fields to database fields
          for (const [dbField, csvField] of Object.entries(merchantFieldMappings)) {
            if (csvField && row[csvField] !== undefined) {
              // Log the field being processed
              console.log(`Mapping ${csvField} -> ${dbField}: ${row[csvField]}`);
              
              // Handle date fields
              if (dbField === 'clientSinceDate' || dbField === 'asOfDate') {
                try {
                  if (row[csvField] && row[csvField].trim() !== '') {
                    const parsedDate = new Date(row[csvField]);
                    merchantData[dbField as keyof InsertMerchant] = parsedDate as any;
                    
                    if (dbField === 'asOfDate') {
                      stats.asOfDates.add(parsedDate.toISOString().split('T')[0]);
                      console.log(`AsOfDate found: ${parsedDate.toISOString()}`);
                    }
                  } else {
                    merchantData[dbField as keyof InsertMerchant] = null as any;
                    console.log(`Empty ${dbField} field, setting to null`);
                  }
                } catch (e) {
                  console.warn(`Failed to parse date for ${dbField}: ${row[csvField]}`);
                  merchantData[dbField as keyof InsertMerchant] = null as any;
                }
              } 
              // Special handling for Status field mapping (Open = Active, Delete = Inactive)
              else if (dbField === 'status') {
                const rawStatus = row[csvField];
                if (rawStatus) {
                  const statusValue = rawStatus.toString().trim().toLowerCase();
                  if (statusValue === 'open') {
                    merchantData[dbField as keyof InsertMerchant] = 'Active' as any;
                    console.log(`Status mapped: "${rawStatus}" -> "Active"`);
                  } else if (statusValue === 'delete') {
                    merchantData[dbField as keyof InsertMerchant] = 'Inactive' as any;
                    console.log(`Status mapped: "${rawStatus}" -> "Inactive"`);
                  } else {
                    merchantData[dbField as keyof InsertMerchant] = rawStatus as any;
                    console.log(`Status kept as-is: "${rawStatus}"`);
                  }
                } else {
                  merchantData[dbField as keyof InsertMerchant] = 'Pending' as any;
                  console.log(`Empty status field, setting to default: "Pending"`);
                }
              }
              // Special handling for MType - FORCE Type 3 for all CSV imports (ACH Merchants)
              else if (dbField === 'merchantType') {
                merchantData[dbField as keyof InsertMerchant] = '3' as any;
                stats.mtypeStats['3']++;
                console.log(`CSV Import: Forcing merchantType = "3" (ACH Merchant) - CSV value ignored`);
              }
              else {
                merchantData[dbField as keyof InsertMerchant] = row[csvField] as any;
              }
            }
          }
          
          // Handle spaced headers for merchant name - CRITICAL for database constraint
          if (!merchantData.name && row["Client Legal Name"]) {
            merchantData.name = row["Client Legal Name"];
          }
          
          // Handle spaced headers for merchant ID 
          if (!merchantData.clientMID && row["Client MID"]) {
            merchantData.clientMID = row["Client MID"];
          }
          
          // Handle spaced headers for Parent MID
          if (!merchantData.otherClientNumber2 && row["Parent MID"]) {
            merchantData.otherClientNumber2 = row["Parent MID"];
            console.log(`Parent MID mapped from spaced header: ${row["Parent MID"]}`);
          }
          
          // Apply default values for any missing fields
          for (const [dbField, defaultValue] of Object.entries(defaultMerchantValues)) {
            if (merchantData[dbField as keyof InsertMerchant] === undefined) {
              merchantData[dbField as keyof InsertMerchant] = defaultValue as any;
            }
          }
          
          // CRITICAL: Ensure name field is not null for database constraint
          if (!merchantData.name) {
            merchantData.name = `Merchant ${merchantId}`;
            console.warn(`Missing merchant name for ${merchantId}, using fallback: ${merchantData.name}`);
          }
          
          console.log(`Final merchant data: ${JSON.stringify(merchantData)}`);
          merchants.push(merchantData as InsertMerchant);
          
        } catch (error) {
          errorCount++;
          console.error(`Error processing row ${rowCount}:`, error);
        }
      });
      
      parser.on("error", (error) => {
        console.error("CSV parsing error:", error);
        console.log("Attempting to handle CSV parsing error gracefully...");
        
        // For column count errors, try to continue processing
        if (error.code === 'CSV_RECORD_INCONSISTENT_COLUMNS') {
          console.log("Column count mismatch detected, continuing with available data...");
          return; // Don't reject, just continue
        }
        
        reject(new Error(`CSV parsing failed: ${error.message}`));
      });
      
      parser.on("end", async () => {
        console.log(`\n=================== CSV PARSING COMPLETE ===================`);
        console.log(`Total rows processed: ${rowCount}`);
        console.log(`Merchant objects created: ${merchants.length}`);
        console.log(`Parsing errors: ${errorCount}`);
        
        if (merchants.length === 0) {
          console.log("No valid merchant data found to insert.");
          return resolve({ 
            rowsProcessed: rowCount, 
            merchantsCreated: 0, 
            merchantsUpdated: 0, 
            errors: errorCount 
          });
        }
        
        try {
          // Process all merchants for database update
          const updatedCount = merchants.length;
          const insertedCount = 0;
          const createdMerchantsList: any[] = [];
          const updatedMerchantsList: any[] = [];
          
          // Check if each merchant exists in the database
          for (const merchant of merchants) {
            console.log(`Processing merchant update: ${merchant.id} - ${merchant.name}`);
            
            // @ENVIRONMENT-CRITICAL - Merchant existence check for CSV processing
            // @DEPLOYMENT-CHECK - Uses environment-aware table naming for unified merchants
            const merchantsTableName = getTableName('merchants'); // Fixed: Use unified merchants table
            const existingMerchantResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1`, [merchant.id]);
            const existingMerchant = existingMerchantResult.rows;
            
            if (existingMerchant.length > 0) {
              // Update existing merchant
              console.log(`Updating existing merchant: ${merchant.id} - ${merchant.name}`);
              stats.updatedMerchants++;
              updatedMerchantsList.push({
                id: merchant.id,
                name: merchant.name,
                merchantType: merchant.merchantType,
                asOfDate: merchant.asOfDate
              });
              
              // Always update the edit date to current date/time
              const updateData = {
                name: merchant.name,
                client_mid: merchant.clientMID,
                other_client_number1: merchant.otherClientNumber1,
                other_client_number2: merchant.otherClientNumber2,
                client_since_date: merchant.clientSinceDate,
                status: merchant.status,
                merchant_type: merchant.merchantType,
                sales_channel: merchant.salesChannel,
                address: merchant.address,
                city: merchant.city,
                state: merchant.state,
                zip_code: merchant.zipCode,
                country: merchant.country,
                category: merchant.category,
                last_upload_date: merchant.lastUploadDate,
                as_of_date: merchant.asOfDate,
                edit_date: new Date(), // Always update the edit date
                updated_by: "system" // Set updatedBy to system
              };
              
              console.log(`Update data: ${JSON.stringify(updateData)}`);
              
              // @ENVIRONMENT-CRITICAL - Merchant CSV processing update operations
              // @DEPLOYMENT-CHECK - Fixed to use unified merchants table
              const updateTableName = getTableName('merchants'); // Fixed: Use unified merchants table
              
              const updateColumns = Object.keys(updateData);
              const updateValues = Object.values(updateData);
              const setClause = updateColumns.map((col, index) => `${col} = $${index + 1}`).join(', ');
              
              const updateQuery = `
                UPDATE ${updateTableName}
                SET ${setClause}
                WHERE id = $${updateColumns.length + 1}
              `;
              
              await pool.query(updateQuery, [...updateValues, merchant.id]);
            } else {
              // @ENVIRONMENT-CRITICAL - Merchant insertion operations
              // @DEPLOYMENT-CHECK - Fixed to use API merchants table
              console.log(`Inserting new merchant: ${merchant.id} - ${merchant.name}`);
              stats.newMerchants++;
              createdMerchantsList.push({
                id: merchant.id,
                name: merchant.name,
                merchantType: merchant.merchantType,
                asOfDate: merchant.asOfDate
              });
              
              const insertTableName = getTableName('merchants'); // Fixed: Use unified merchants table
              await pool.query(`
                INSERT INTO ${insertTableName} (
                  id, name, merchant_type, client_since_date, as_of_date, 
                  created_at, last_upload_date, edit_date, updated_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
              `, [
                merchant.id, merchant.name, merchant.merchantType, merchant.clientSinceDate,
                merchant.asOfDate, merchant.createdAt, merchant.lastUploadDate, 
                merchant.editDate, merchant.updatedBy
              ]);
            }
          }
          
          console.log(`\n=================== DATABASE UPDATE SUMMARY ===================`);
          console.log(`Updated merchants: ${stats.updatedMerchants}`);
          console.log(`Inserted merchants: ${stats.newMerchants}`);
          
          console.log(`\n=================== COMPLETE ===================`);
          resolve({
            rowsProcessed: rowCount,
            merchantsCreated: stats.newMerchants,
            merchantsUpdated: stats.updatedMerchants,
            errors: errorCount
          });
        } catch (error) {
          console.error("Error updating merchants in database:", error);
          reject(error);
        }
      });
      
      // Write the CSV content to the parser
      parser.write(csvContent);
      parser.end();
    });
  }

  // Process TSYS merchant detail fixed-width file using MCC schema configuration
  async processMerchantDetailFileFromContent(base64Content: string): Promise<{ rowsProcessed: number; merchantsUpdated: number; errors: number }> {
    console.log('[MERCHANT-DETAIL] Processing TSYS merchant detail file using MCC schema');
    
    try {
      // Decode base64 content
      const fileContent = Buffer.from(base64Content, 'base64').toString('utf8');
      
      // Import and use the schema-based parser
      const { parseMerchantDetailFile, mapParsedToMerchantSchema } = await import('./merchant-detail-parser');
      
      // Parse the entire file using MCC schema configuration
      const parseResult = await parseMerchantDetailFile(fileContent);
      
      console.log(`[MERCHANT-DETAIL] Parsed ${parseResult.totalLines} lines`);
      console.log(`[MERCHANT-DETAIL] Successful: ${parseResult.successfulLines}, Errors: ${parseResult.errorLines}`);
      console.log(`[MERCHANT-DETAIL] Used ${parseResult.schemaFieldCount} schema fields`);
      
      // Get merchants table for updates
      const merchantsTableName = getTableName('merchants');
      let merchantsUpdated = 0;
      let errors = 0;
      
      // Process each parsed record
      for (const parsed of parseResult.records) {
        try {
          // Check if this record has critical errors
          if (parsed._errors.length > 0) {
            console.log(`[MERCHANT-DETAIL] Record has ${parsed._errors.length} validation errors, skipping update`);
            errors++;
            continue;
          }
          
          // Map to merchant schema
          const merchantData = mapParsedToMerchantSchema(parsed);
          
          // Extract bank number which is the key identifier
          const bankNum = merchantData.bankNumber;
          
          if (!bankNum) {
            console.log('[MERCHANT-DETAIL] No bank number found, skipping record');
            errors++;
            continue;
          }
          
          // Find merchants with this bank number
          const existingMerchants = await db.execute(sql`
            SELECT id FROM ${sql.identifier(merchantsTableName)} 
            WHERE bank_number = ${bankNum}
          `);
          
          if (existingMerchants.rows.length > 0) {
            // Update existing merchant(s) with parsed fields
            for (const merchant of existingMerchants.rows) {
              await pool.query(`
                UPDATE ${merchantsTableName}
                SET 
                  exposure_amount = COALESCE($1, exposure_amount),
                  merchant_activation_date = COALESCE($2, merchant_activation_date),
                  board_dt = COALESCE($3, board_dt),
                  updated_at = NOW(),
                  updated_by = 'mcc_import'
                WHERE id = $4
              `, [
                merchantData.exposureAmount || null,
                merchantData.merchantActivationDate || null,
                merchantData.merchantActivationDate || null,
                merchant.id
              ]);
              
              merchantsUpdated++;
            }
            console.log(`[MERCHANT-DETAIL] Updated ${existingMerchants.rows.length} merchant(s) for bank ${bankNum}`);
          } else {
            console.log(`[MERCHANT-DETAIL] No existing merchant found for bank ${bankNum}`);
          }
        } catch (recordError) {
          console.error('[MERCHANT-DETAIL] Error processing record:', recordError);
          errors++;
        }
      }
      
      console.log(`[MERCHANT-DETAIL] Complete: Updated ${merchantsUpdated} merchants, ${errors} errors`);
      
      return {
        rowsProcessed: parseResult.totalLines,
        merchantsUpdated,
        errors
      };
    } catch (error) {
      console.error('[MERCHANT-DETAIL] File processing error:', error);
      throw error;
    }
  }

  // Process a merchant demographics CSV file
  async processMerchantFile(filePath: string): Promise<{ rowsProcessed: number; merchantsCreated: number; merchantsUpdated: number; errors: number }> {
    console.log(`=================== MERCHANT FILE PROCESSING ===================`);
    console.log(`Processing merchant file: ${filePath}`);
    
    // Import field mappings and utility functions
    const { merchantFieldMappings, defaultMerchantValues, merchantIdAliases, findMerchantId, normalizeMerchantId } = await import("@shared/field-mappings");
    
    return new Promise((resolve, reject) => {
      // First check if file exists
      if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return reject(new Error(`File not found: ${filePath}. The temporary file may have been removed by the system.`));
      }
      
      // Verify file is readable
      try {
        const testStream = createReadStream(filePath, { start: 0, end: 10 });
        testStream.on('error', (error) => {
          console.error(`File exists but is not readable: ${filePath}`, error);
          return reject(new Error(`File exists but is not readable: ${filePath}. Error: ${error.message}`));
        });
        testStream.on('readable', () => {
          testStream.destroy(); // Close test stream after successful read
        });
      } catch (error) {
        console.error(`Error checking file readability: ${filePath}`, error);
        return reject(new Error(`Error checking file readability: ${filePath}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
      
      console.log("Starting CSV parsing with verbose logging enabled...");
      const parser = createReadStream(filePath).pipe(
        parseCSV({
          columns: true,
          skip_empty_lines: true
        })
      );
      
      const merchants: InsertMerchant[] = [];
      let rowCount = 0;
      let errorCount = 0;
      
      // Track stats for the import
      const stats = {
        totalRows: 0,
        newMerchants: 0,
        updatedMerchants: 0, 
        skippedRows: 0,
        mtypeStats: {
          none: 0,
          '1': 0,
          '2': 0,
          '3': 0,
          custom: 0
        },
        asOfDates: new Set<string>()
      };
      
      parser.on("data", (row) => {
        rowCount++;
        stats.totalRows++;
        try {
          console.log(`\n--- Processing row ${rowCount} ---`);
          console.log(`Row data: ${JSON.stringify(row)}`);
          
          // Find the merchant ID using our utility function
          let merchantId = findMerchantId(row, merchantIdAliases);
          
          // If no merchant ID found, generate one
          if (!merchantId) {
            console.log(`[SKIP ROW] No merchant ID found in row ${rowCount}, skipping to maintain authentic data only`); stats.skippedRows++; return;
            // Skipped row due to missing merchant ID
          } else {
            // Normalize the merchant ID (add prefix if needed)
            merchantId = merchantId.trim(); // Use authentic merchant ID without M-prefix generation
          }
          
          // Create merchant object with system fields
          const merchantData: Partial<InsertMerchant> = {
            id: merchantId,
            createdAt: new Date(),
            lastUploadDate: new Date(),
            editDate: new Date(),
            updatedBy: "System-Uploader" // Set the updated by field to System-Uploader
          };
          
          // Apply field mappings - map CSV fields to database fields
          for (const [dbField, csvField] of Object.entries(merchantFieldMappings)) {
            if (csvField && row[csvField] !== undefined) {
              // Log the field being processed
              console.log(`Mapping ${csvField} -> ${dbField}: ${row[csvField]}`);
              
              // Handle date fields
              if (dbField === 'clientSinceDate' || dbField === 'asOfDate') {
                try {
                  if (row[csvField] && row[csvField].trim() !== '') {
                    const parsedDate = new Date(row[csvField]);
                    merchantData[dbField as keyof InsertMerchant] = parsedDate as any;
                    
                    if (dbField === 'asOfDate') {
                      stats.asOfDates.add(parsedDate.toISOString().split('T')[0]);
                      console.log(`AsOfDate found: ${parsedDate.toISOString()}`);
                    }
                  } else {
                    merchantData[dbField as keyof InsertMerchant] = null as any;
                    console.log(`Empty ${dbField} field, setting to null`);
                  }
                } catch (e) {
                  console.warn(`Failed to parse date for ${dbField}: ${row[csvField]}`);
                  merchantData[dbField as keyof InsertMerchant] = null as any;
                }
              } 
              // Special handling for MType
              else if (dbField === 'merchantType') {
                const mTypeValue = row[csvField]?.toString()?.trim();
                if (mTypeValue) {
                  // Store value as-is
                  merchantData[dbField as keyof InsertMerchant] = mTypeValue as any;
                  
                  // Track mType stats
                  if (mTypeValue === '0' || mTypeValue.toLowerCase() === 'none') {
                    stats.mtypeStats.none++;
                  } else if (mTypeValue === '1') {
                    stats.mtypeStats['1']++;
                  } else if (mTypeValue === '2') {
                    stats.mtypeStats['2']++;
                  } else if (mTypeValue === '3') {
                    stats.mtypeStats['3']++;
                  } else {
                    stats.mtypeStats.custom++;
                  }
                  
                  console.log(`MType value found: ${mTypeValue}`);
                } else {
                  merchantData[dbField as keyof InsertMerchant] = null as any;
                  console.log(`Empty MType field, setting to null`);
                }
              }
              else {
                merchantData[dbField as keyof InsertMerchant] = row[csvField] as any;
              }
            }
          }
          
          // Apply defaults for missing fields
          for (const [field, defaultValue] of Object.entries(defaultMerchantValues)) {
            if (!merchantData[field as keyof InsertMerchant]) {
              merchantData[field as keyof InsertMerchant] = defaultValue as any;
              console.log(`Applied default value for ${field}: ${defaultValue}`);
            }
          }
          
          // Make sure name exists (required field)
          if (!merchantData.name) {
            merchantData.name = `Unknown Merchant ${merchantId}`;
            console.log(`No name found, generated default: ${merchantData.name}`);
          }
          
          // Log the complete merchant data
          console.log(`Complete merchant data: ${JSON.stringify(merchantData)}`);
          
          merchants.push(merchantData as InsertMerchant);
        } catch (error) {
          errorCount++;
          stats.skippedRows++;
          console.error(`Error processing merchant row ${rowCount}:`, error);
          console.error("Row data:", JSON.stringify(row));
          // Continue with next row
        }
      });
      
      parser.on("error", (error) => {
        console.error("CSV parsing error:", error);
        reject(error);
      });
      
      parser.on("end", async () => {
        console.log(`\n=================== CSV PROCESSING SUMMARY ===================`);
        console.log(`Processed ${rowCount} total rows with ${errorCount} errors.`);
        console.log(`Found ${merchants.length} valid merchants to process.`);
        
        try {
          // Insert or update merchants in database
          let updatedCount = 0;
          let insertedCount = 0;
          
          // Lists to track created and updated merchants for detailed reporting
          const createdMerchantsList = [];
          const updatedMerchantsList = [];
          
          for (const merchant of merchants) {
            // @ENVIRONMENT-CRITICAL - Merchant existence check for file processing
            // @DEPLOYMENT-CHECK - Uses environment-aware table naming
            const merchantsTableName = getTableName('merchants');
            
            // Check if merchant exists
            const existingMerchantResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1`, [merchant.id]);
            const existingMerchant = existingMerchantResult.rows;
              
            if (existingMerchant.length > 0) {
              // Update existing merchant
              console.log(`Updating existing merchant: ${merchant.id} - ${merchant.name}`);
              updatedCount++;
              stats.updatedMerchants++;
              updatedMerchantsList.push({
                id: merchant.id,
                name: merchant.name,
                merchantType: merchant.merchantType,
                asOfDate: merchant.asOfDate
              });
              
              // @ENVIRONMENT-CRITICAL - Merchant file processing update operations
              // @DEPLOYMENT-CHECK - Uses environment-aware table naming
              const merchantsTableName = getTableName('merchants');
              
              // Always update the edit date to current date/time
              const updateData = {
                name: merchant.name,
                client_mid: merchant.clientMID,
                other_client_number1: merchant.otherClientNumber1,
                other_client_number2: merchant.otherClientNumber2,
                client_since_date: merchant.clientSinceDate,
                status: merchant.status,
                merchant_type: merchant.merchantType,
                sales_channel: merchant.salesChannel,
                address: merchant.address,
                city: merchant.city,
                state: merchant.state,
                zip_code: merchant.zipCode,
                country: merchant.country,
                category: merchant.category,
                last_upload_date: merchant.lastUploadDate,
                as_of_date: merchant.asOfDate,
                edit_date: new Date(), // Always update the edit date
                updated_by: "system" // Set updatedBy to system
              };
              
              console.log(`Update data: ${JSON.stringify(updateData)}`);
              
              const updateColumns = Object.keys(updateData);
              const updateValues = Object.values(updateData);
              const setClause = updateColumns.map((col, index) => `${col} = $${index + 1}`).join(', ');
              
              const updateQuery = `
                UPDATE ${merchantsTableName}
                SET ${setClause}
                WHERE id = $${updateColumns.length + 1}
              `;
              
              await pool.query(updateQuery, [...updateValues, merchant.id]);
            } else {
              // Insert new merchant
              console.log(`Inserting new merchant: ${merchant.id} - ${merchant.name}`);
              insertedCount++;
              stats.newMerchants++;
              createdMerchantsList.push({
                id: merchant.id,
                name: merchant.name,
                merchantType: merchant.merchantType,
                asOfDate: merchant.asOfDate
              });
              
              // @ENVIRONMENT-CRITICAL - Merchant file processing insertion operations
              // @DEPLOYMENT-CHECK - Uses environment-aware table naming
              const merchantsTableName2 = getTableName('merchants');
              
              // Map merchant object to database column names
              const merchantForInsert = {
                id: merchant.id,
                name: merchant.name,
                client_mid: merchant.clientMID,
                other_client_number1: merchant.otherClientNumber1,
                other_client_number2: merchant.otherClientNumber2,
                client_since_date: merchant.clientSinceDate,
                status: merchant.status,
                merchant_type: merchant.merchantType,
                sales_channel: merchant.salesChannel,
                address: merchant.address,
                city: merchant.city,
                state: merchant.state,
                zip_code: merchant.zipCode,
                country: merchant.country,
                category: merchant.category,
                last_upload_date: merchant.lastUploadDate,
                as_of_date: merchant.asOfDate,
                edit_date: new Date(),
                updated_by: "system"
              };
              
              const insertColumns = Object.keys(merchantForInsert);
              const insertValues = Object.values(merchantForInsert);
              const placeholders = insertValues.map((_, index) => `$${index + 1}`).join(', ');
              
              const insertQuery = `
                INSERT INTO ${merchantsTableName2} (${insertColumns.join(', ')})
                VALUES (${placeholders})
              `;
              
              await pool.query(insertQuery, insertValues);
            }
          }
          
          console.log(`\n=================== DATABASE UPDATE SUMMARY ===================`);
          console.log(`Updated merchants: ${updatedCount}`);
          console.log(`Inserted merchants: ${insertedCount}`);
          
          console.log(`\n=================== MTYPE STATISTICS ===================`);
          console.log(`MType 'none': ${stats.mtypeStats.none}`);
          console.log(`MType '1': ${stats.mtypeStats['1']}`);
          console.log(`MType '2': ${stats.mtypeStats['2']}`);
          console.log(`MType '3': ${stats.mtypeStats['3']}`);
          console.log(`MType custom values: ${stats.mtypeStats.custom}`);
          
          console.log(`\n=================== CREATED MERCHANTS ===================`);
          createdMerchantsList.forEach((m, idx) => {
            console.log(`${idx+1}. ${m.id} - ${m.name} (MType: ${m.merchantType || 'none'}, AsOfDate: ${m.asOfDate || 'none'})`);
          });
          
          console.log(`\n=================== UPDATED MERCHANTS ===================`);
          updatedMerchantsList.forEach((m, idx) => {
            console.log(`${idx+1}. ${m.id} - ${m.name} (MType: ${m.merchantType || 'none'}, AsOfDate: ${m.asOfDate || 'none'})`);
          });
          
          console.log(`\n=================== COMPLETE ===================`);
          resolve({ 
            rowsProcessed: stats.totalRows, 
            merchantsCreated: insertedCount, 
            merchantsUpdated: updatedCount, 
            errors: errorCount 
          });
        } catch (error) {
          console.error("Error updating merchants in database:", error);
          reject(error);
        }
      });
    });
  }

  // Process transaction file from database content (new format)
  async processTransactionFileFromContent(base64Content: string, sourceFileId?: string): Promise<{ rowsProcessed: number; transactionsCreated: number; errors: number }> {
    console.log(`=================== TRANSACTION FILE PROCESSING (DATABASE) ===================`);
    console.log(`Processing transaction file from database content`);
    
    // Decode base64 content
    const csvContent = Buffer.from(base64Content, 'base64').toString('utf8');
    
    // Import field mappings and utility functions
    const { 
      transactionFieldMappings, 
      alternateTransactionMappings, 
      transactionMerchantIdAliases,
      transactionCodeMapping,
      findMerchantId, 
      normalizeMerchantId 
    } = await import("@shared/field-mappings");
    
    // TraceNumberMapper is imported at the top of the file
    
    // Reset trace number counter for this file processing session
    TraceNumberMapper.resetCounter();
    console.log(`[TRACE-MAPPER] Starting new CSV file processing session`);
    
    return new Promise((resolve, reject) => {
      console.log("Starting transaction CSV parsing from content...");
      
      // Parse CSV content using string-based parsing
      const parser = parseCSV({
        columns: true,
        skip_empty_lines: true
      });
      
      let transactions: InsertTransaction[] = [];
      let rowCount = 0;
      let errorCount = 0;
      let sampleRow: any = null;
      let detectedFormat: string = 'default';
      
      // Function to detect file format based on headers
      const detectFileFormat = (row: any): string => {
        // Check for TDDF - Transaction Daily Detail File format
        if (row.TXN_ID !== undefined && 
            row.MERCHANT_ID !== undefined && 
            row.TXN_AMOUNT !== undefined && 
            row.TXN_DATE !== undefined && 
            row.TXN_TYPE !== undefined) {
          console.log("Detected TDDF (Transaction Daily Detail File) format");
          return 'tddf';
        }
        
        // Check for the format1 (Name, Account, Amount, Date, Code, Descr)
        if (row.Name !== undefined && 
            row.Account !== undefined && 
            row.Amount !== undefined && 
            row.Date !== undefined && 
            row.Code !== undefined && 
            row.Descr !== undefined) {
          console.log("Detected format1 transaction format with Name/Account/Code/Descr");
          return 'format1';
        }
        
        // Default format (TransactionID, MerchantID, Amount, Date, Type)
        console.log("Using default transaction format");
        return 'default';
      };
      
      // Enhanced unified Transaction ID extraction function with trace number mapping
      const extractTransactionId = (row: any): string => {
        // Priority-based Transaction ID extraction across all possible column names
        // **TRACE NUMBER PRIORITY** - TraceNbr gets highest priority for mapping
        const transactionIdColumns = [
          'TraceNbr', 'TraceNumber', 'Trace_Number', 'TRACE_NBR', 'trace_number',
          'TransactionID', 'TransactionId', 'TranID', 'ID',
          'Transaction_ID', 'TXN_ID', 'TxnID', 'RefNumber', 'ReferenceNumber',
          'BatchID', 'SequenceNumber', 'ConfirmationNumber'
        ];
        
        // Get available column names for case-insensitive matching
        const availableColumns = Object.keys(row);
        let extractedValue: string | null = null;
        let sourceColumn: string | null = null;
        
        // First, try exact matches
        for (const column of transactionIdColumns) {
          if (row[column] && row[column].toString().trim()) {
            extractedValue = row[column].toString().trim();
            sourceColumn = column;
            console.log('[TRANSACTION ID] ✅ Exact match - Found ' + column + ': ' + extractedValue);
            break;
          }
        }
        
        // Second, try case-insensitive matches if no exact match found
        if (!extractedValue) {
          for (const expectedCol of transactionIdColumns) {
            for (const actualCol of availableColumns) {
              if (expectedCol.toLowerCase() === actualCol.toLowerCase() && row[actualCol] && row[actualCol].toString().trim()) {
                extractedValue = row[actualCol].toString().trim();
                sourceColumn = actualCol;
                console.log('[TRANSACTION ID] ✅ Case-insensitive match - Found ' + actualCol + ' (expected: ' + expectedCol + '): ' + extractedValue);
                break;
              }
            }
            if (extractedValue) break;
          }
        }
        
        // Third, try partial matches (contains) if still no match
        if (!extractedValue) {
          for (const expectedCol of transactionIdColumns) {
            for (const actualCol of availableColumns) {
              if ((actualCol.toLowerCase().includes(expectedCol.toLowerCase()) || 
                   expectedCol.toLowerCase().includes(actualCol.toLowerCase())) &&
                  row[actualCol] && row[actualCol].toString().trim()) {
                extractedValue = row[actualCol].toString().trim();
                sourceColumn = actualCol;
                console.log('[TRANSACTION ID] ✅ Partial match - Found ' + actualCol + ' (partial: ' + expectedCol + '): ' + extractedValue);
                break;
              }
            }
            if (extractedValue) break;
          }
        }
        
        // If we found a value, use TraceNumberMapper to ensure uniqueness
        if (extractedValue) {
          const uniqueTransactionId = TraceNumberMapper.generateTransactionId(extractedValue);
          
          // Log mapping details
          if (sourceColumn && (sourceColumn.toLowerCase().includes('trace') || sourceColumn.toLowerCase().includes('nbr'))) {
            console.log(`[TRACE-MAPPER] Mapped trace number from column '${sourceColumn}': ${extractedValue} -> ${uniqueTransactionId}`);
          } else {
            console.log(`[TRACE-MAPPER] Mapped transaction ID from column '${sourceColumn}': ${extractedValue} -> ${uniqueTransactionId}`);
          }
          
          return uniqueTransactionId;
        }
        
        // No valid ID found - generate fallback using TraceNumberMapper
        console.error(`[TRANSACTION ID ERROR] ❌ No valid Transaction ID found in row ${rowCount}!`);
        console.error(`[TRANSACTION ID ERROR] Expected columns: [${transactionIdColumns.join(', ')}]`);
        console.error(`[TRANSACTION ID ERROR] Available columns: [${Object.keys(row).join(', ')}]`);
        console.error(`[TRANSACTION ID ERROR] Row data sample: ${JSON.stringify(row).substring(0, 200)}...`);
        
        // Generate fallback ID using TraceNumberMapper
        const fallbackId = TraceNumberMapper.generateTransactionId(null);
        console.log(`[TRACE-MAPPER] Generated fallback ID: ${fallbackId}`);
        return fallbackId;
      };

      // Enhanced unified Merchant ID extraction function with flexible matching
      const extractMerchantId = (row: any): string => {
        // Try advanced merchant ID extraction first
        try {
          let merchantId = findMerchantId(row, transactionMerchantIdAliases);
          if (merchantId) {
            console.log(`[MERCHANT ID] ✅ Advanced extraction: ${merchantId.trim()}`);
            return merchantId.trim();
          }
        } catch (err) {
          console.log(`[MERCHANT ID] Advanced extraction failed, using fallback`);
        }
        
        // Priority-based merchant ID extraction
        const merchantIdColumns = [
          'MerchantID', 'Merchant_ID', 'ClientID', 'Client_ID', 'Account', 'AccountNumber',
          'Name', 'MerchantName', 'ClientMID', 'CompanyID', 'StoreID'
        ];
        
        // Get available column names for case-insensitive matching
        const availableColumns = Object.keys(row);
        
        // First, try exact matches
        for (const column of merchantIdColumns) {
          if (row[column] && row[column].toString().trim()) {
            const extracted = row[column].toString().trim();
            console.log(`[MERCHANT ID] ✅ Exact match - Found ${column}: ${extracted}`);
            return extracted;
          }
        }
        
        // Second, try case-insensitive matches
        for (const expectedCol of merchantIdColumns) {
          for (const actualCol of availableColumns) {
            if (expectedCol.toLowerCase() === actualCol.toLowerCase() && row[actualCol] && row[actualCol].toString().trim()) {
              const extracted = row[actualCol].toString().trim();
              console.log(`[MERCHANT ID] ✅ Case-insensitive match - Found ${actualCol} (expected: ${expectedCol}): ${extracted}`);
              return extracted;
            }
          }
        }
        
        // Third, try partial matches (contains)
        for (const expectedCol of merchantIdColumns) {
          for (const actualCol of availableColumns) {
            if ((actualCol.toLowerCase().includes(expectedCol.toLowerCase()) || 
                 expectedCol.toLowerCase().includes(actualCol.toLowerCase())) &&
                row[actualCol] && row[actualCol].toString().trim()) {
              const extracted = row[actualCol].toString().trim();
              console.log(`[MERCHANT ID] ✅ Partial match - Found ${actualCol} (partial: ${expectedCol}): ${extracted}`);
              return extracted;
            }
          }
        }
        
        console.error(`[MERCHANT ID ERROR] ❌ No valid Merchant ID found in row ${rowCount}!`);
        console.error(`[MERCHANT ID ERROR] Expected columns: [${merchantIdColumns.join(', ')}]`);
        console.error(`[MERCHANT ID ERROR] Available columns: [${Object.keys(row).join(', ')}]`);
        console.error(`[MERCHANT ID ERROR] Row data sample: ${JSON.stringify(row).substring(0, 200)}...`);
        return null;
      };

      parser.on("data", (row) => {
        rowCount++;
        
        // Save sample row for format detection on first row
        if (rowCount === 1) {
          sampleRow = row;
          detectedFormat = detectFileFormat(row);
          console.log(`\n=================== CSV COLUMN ANALYSIS ===================`);
          console.log(`Available columns in CSV: [${Object.keys(row).join(', ')}]`);
          console.log(`Total columns: ${Object.keys(row).length}`);
          console.log(`First row data: ${JSON.stringify(row)}`);
          console.log(`Detected format: ${detectedFormat}`);
          console.log(`=====================================================\n`);
        }
        
        try {
          // UNIFIED PROCESSING: Extract core data regardless of format
          const transactionId = extractTransactionId(row);
          const merchantId = extractMerchantId(row);
          
          // Skip row if no Transaction ID found (critical data missing)
          if (!transactionId) {
            console.error(`[SKIP ROW ${rowCount}] ❌ TRANSACTION ID MISSING - Cannot process row without transaction identifier`);
            errorCount++;
            return;
          }
          
          // Skip row if no Merchant ID found (avoid bad merchant ID generation)
          if (!merchantId) {
            console.error(`[SKIP ROW ${rowCount}] ❌ MERCHANT ID MISSING - Cannot process row without merchant identifier`);
            errorCount++;
            return;
          }
          
          console.log(`[PROCESS ROW ${rowCount}] ✅ Found TransactionID: "${transactionId}", MerchantID: "${merchantId}"`);
          
          // Store original merchant name for advanced matching
          let originalMerchantName = null;
          if (row.Name) {
            originalMerchantName = row.Name.trim();
            console.log(`[PARSING DEBUG] Found merchant name: ${originalMerchantName}`);
          }
          
          // Unified transaction data extraction
          let transactionData: Partial<InsertTransaction> = {
            id: transactionId,
            merchantId: merchantId,
            createdAt: new Date(),
            // RAW DATA PRESERVATION - always preserve complete CSV row
            rawData: row,
            sourceFileId: sourceFileId || null,
            sourceRowNumber: rowCount,
            recordedAt: new Date()
          };
          
          // Format-specific field extraction
          if (detectedFormat === 'format1') {
            // Format1: Name, Account, Amount, Date, Code, Descr, TraceNbr
            // Handle parentheses format (25.00) for negative amounts
            let amountStr = row.Amount?.toString() || '0';
            const isNegative = amountStr.includes('(') && amountStr.includes(')');
            const cleanAmount = amountStr.replace(/[$,"()]/g, '').trim();
            let amount = parseFloat(cleanAmount || '0');
            if (isNegative) amount = Math.abs(amount); // Store as positive, let revenue calcs handle display
            
            transactionData.amount = amount;
            transactionData.date = new Date(row.Date);
            transactionData.type = transactionCodeMapping[row.Code] || row.Code || 'Unknown';
            transactionData.description = row.Descr || '';
          } else {
            // Default format: Use field mappings for flexible column handling
            for (const [dbField, csvField] of Object.entries(transactionFieldMappings)) {
              if (csvField && row[csvField] !== undefined) {
                if (dbField === 'date') {
                  transactionData[dbField as keyof InsertTransaction] = new Date(row[csvField]) as any;
                } else if (dbField === 'amount') {
                  // Handle parentheses format (25.00) for negative amounts
                  let amountStr = row[csvField].toString();
                  const isNegative = amountStr.includes('(') && amountStr.includes(')');
                  const cleanAmount = amountStr.replace(/[$,"()]/g, '').trim();
                  let amount = parseFloat(cleanAmount || '0');
                  if (isNegative) amount = Math.abs(amount); // Store as positive, let revenue calcs handle display
                  
                  transactionData[dbField as keyof InsertTransaction] = amount.toString() as any;
                } else if (dbField === 'id' || dbField === 'merchantId') {
                  // Skip - already handled by unified extraction
                  continue;
                } else {
                  transactionData[dbField as keyof InsertTransaction] = row[csvField] as any;
                }
              }
            }
          }
          
          // Add original merchant name for advanced matching
          if (originalMerchantName) {
            (transactionData as any).originalMerchantName = originalMerchantName;
          }
          
          console.log(`Transaction ${rowCount}: ${JSON.stringify(transactionData)}`);
          transactions.push(transactionData as InsertTransaction);
          
        } catch (error) {
          errorCount++;
          console.error(`[ROW ERROR ${rowCount}] ❌ Processing failed:`, error);
          console.error(`[ROW ERROR ${rowCount}] Row data: ${JSON.stringify(row)}`);
          console.error(`[ROW ERROR ${rowCount}] Available columns: [${Object.keys(row).join(', ')}]`);
        }
      });
      
      parser.on("error", (error) => {
        console.error("Transaction CSV parsing error:", error);
        reject(new Error(`Transaction CSV parsing failed: ${error.message}`));
      });
      
      parser.on("end", async () => {
        console.log(`\n=================== TRANSACTION CSV PARSING COMPLETE ===================`);
        console.log(`Total rows processed: ${rowCount}`);
        console.log(`Transaction objects created: ${transactions.length}`);
        console.log(`Parsing errors: ${errorCount}`);
        
        if (transactions.length === 0) {
          console.log("No valid transaction data found to insert.");
          return resolve({ rowsProcessed: rowCount, transactionsCreated: 0, errors: errorCount });
        }
        
        try {
          // Advanced merchant matching using business name intelligence
          console.log(`\n=================== ADVANCED MERCHANT MATCHING ===================`);
          console.log(`Processing ${transactions.length} transactions for intelligent merchant matching...`);
          
          // @ENVIRONMENT-CRITICAL - Merchant matching for transaction processing
          // @DEPLOYMENT-CHECK - Uses environment-aware table naming
          const merchantsTableName = getTableName('merchants');
          const allExistingMerchantsResult = await pool.query(`SELECT * FROM ${merchantsTableName}`);
          const allExistingMerchants = allExistingMerchantsResult.rows;
          console.log(`Loaded ${allExistingMerchants.length} existing merchants for name matching`);
          
          // Create map to track merchant names used in transactions
          const merchantNameMapping = new Map<string, string>();
          const nameToIdMapping = new Map<string, string[]>();
          
          // First pass: collect unique merchant names from transactions
          const merchantNames = new Set<string>();
          
          for (const transaction of transactions) {
            // Check if transaction has originalMerchantName property (from Name column)
            const originalName = (transaction as any).originalMerchantName;
            console.log(`[DEBUG] Transaction ${transaction.id} merchant ID: ${transaction.merchantId}, originalMerchantName: ${originalName}`);
            if (originalName) {
              console.log(`[DEBUG] Adding merchant name "${originalName}" for transaction ${transaction.id}`);
              merchantNames.add(originalName);
              merchantNameMapping.set(transaction.merchantId, originalName);
              
              // Track which transaction IDs use this name
              if (!nameToIdMapping.has(originalName)) {
                nameToIdMapping.set(originalName, []);
              }
              nameToIdMapping.get(originalName)!.push(transaction.merchantId);
            }
          }
          
          console.log(`Found ${merchantNames.size} unique merchant names in transactions`);
          
          // Second pass: intelligent merchant name matching
          if (merchantNames.size > 0) {
            for (const name of merchantNames) {
              try {
                console.log(`\n[MATCHING PROCESS] Checking for merchant match with name: "${name}"`);
                
                // Try exact match first
                const exactMatchMerchants = allExistingMerchants.filter(m => 
                  m.name.toLowerCase() === name.toLowerCase()
                );
                
                if (exactMatchMerchants.length > 0) {
                  console.log(`[EXACT MATCH] Found existing merchant with name "${name}": ${exactMatchMerchants[0].id}`);
                  
                  // Get all transaction IDs that had this name
                  const transactionIds = nameToIdMapping.get(name) || [];
                  
                  // Remap transactions to existing merchant
                  for (const transId of transactionIds) {
                    for (const trans of transactions) {
                      if (trans.merchantId === transId) {
                        console.log(`Remapping transaction ${trans.id} from ${trans.merchantId} to existing merchant ${exactMatchMerchants[0].id} based on exact name match "${name}"`);
                        trans.merchantId = exactMatchMerchants[0].id;
                      }
                    }
                  }
                } else {
                  // Try intelligent fuzzy match
                  const fuzzyMatchMerchants = allExistingMerchants.filter(m => {
                    const merchantName = m.name.toLowerCase();
                    const transactionName = name.toLowerCase();
                    
                    // Remove common business suffixes for better core name matching
                    const cleanMerchantName = merchantName
                      .replace(/\s+(llc|inc|ltd|corp|corporation|company)(\s+|$)/g, '')
                      .trim();
                      
                    const cleanTransactionName = transactionName
                      .replace(/\s+(llc|inc|ltd|corp|corporation|company)(\s+|$)/g, '')
                      .trim();
                    
                    // First check if core names (without business types) match exactly and are substantial
                    if (cleanMerchantName === cleanTransactionName && cleanMerchantName.length > 4) {
                      console.log(`[NAME MATCH] Core names match exactly: "${cleanMerchantName}" = "${cleanTransactionName}"`);
                      return true;
                    }
                    
                    // Smart fuzzy matching for legitimate variations
                    // Only match if names are substantial (>6 chars) to prevent false short matches
                    if (cleanMerchantName.length > 6 && cleanTransactionName.length > 6) {
                      // Check if one name contains the other (for cases like "McDonald's" vs "McDonald's Restaurant")
                      if (cleanMerchantName.includes(cleanTransactionName) || cleanTransactionName.includes(cleanMerchantName)) {
                        console.log(`[FUZZY MATCH] Name containment match: "${cleanMerchantName}" <-> "${cleanTransactionName}"`);
                        return true;
                      }
                      
                      // Check for common variations (Massachusetts vs Massachusett, etc.)
                      const isStateVariation = (name1: string, name2: string) => {
                        const stateVariations = [
                          ['massachusetts', 'massachusett', 'mass'],
                          ['california', 'calif', 'ca'],
                          ['pennsylvania', 'penn', 'pa']
                        ];
                        
                        for (const variations of stateVariations) {
                          const hasVariation1 = variations.some(v => name1.includes(v));
                          const hasVariation2 = variations.some(v => name2.includes(v));
                          if (hasVariation1 && hasVariation2) return true;
                        }
                        return false;
                      };
                      
                      if (isStateVariation(cleanMerchantName, cleanTransactionName)) {
                        console.log(`[FUZZY MATCH] State variation match: "${cleanMerchantName}" <-> "${cleanTransactionName}"`);
                        return true;
                      }
                    }
                    
                    return false;
                  });
                  
                  if (fuzzyMatchMerchants.length > 0) {
                    console.log(`[FUZZY MATCH] Found similar merchant for "${name}": ${fuzzyMatchMerchants[0].id} (${fuzzyMatchMerchants[0].name})`);
                    
                    // Get all transaction IDs that had this name
                    const transactionIds = nameToIdMapping.get(name) || [];
                    
                    // Remap transactions to existing merchant
                    for (const transId of transactionIds) {
                      for (const trans of transactions) {
                        if (trans.merchantId === transId) {
                          console.log(`Remapping transaction ${trans.id} from ${trans.merchantId} to similar merchant ${fuzzyMatchMerchants[0].id} based on fuzzy name match "${name}" ~ "${fuzzyMatchMerchants[0].name}"`);
                          trans.merchantId = fuzzyMatchMerchants[0].id;
                        }
                      }
                    }
                  }
                }
              } catch (error) {
                console.error(`Error checking for existing merchant with name "${name}":`, error);
              }
            }
          }
          
          // Third pass: create only truly missing merchants (after all remapping)
          console.log(`\n=================== CREATING MISSING MERCHANTS ===================`);
          
          // Get unique merchant IDs that we need to check
          const uniqueMerchantIds = [...new Set(transactions.map(t => t.merchantId))];
          console.log(`Checking ${uniqueMerchantIds.length} unique merchant IDs after remapping...`);
          
          for (const merchantId of uniqueMerchantIds) {
            // Check if merchant exists (this should catch both original and remapped IDs)
            const existingMerchantResult = await pool.query(`
              SELECT * FROM ${merchantsTableName} WHERE id = $1
            `, [merchantId]);
              
            if (existingMerchantResult.rows.length === 0) {
              console.log(`No merchant found with ID: ${merchantId}, checking if we should create...`);
              
              // Get a transaction with this merchant ID to extract the name
              const sampleTransaction = transactions.find(t => t.merchantId === merchantId);
              const merchantNameFromTransaction = merchantNameMapping.get(merchantId);
              const directMerchantName = sampleTransaction ? (sampleTransaction as any).originalMerchantName : null;
              
              const nameToUse = merchantNameFromTransaction || directMerchantName;
              
              if (nameToUse) {
                console.log(`[NEW MERCHANT] Creating merchant with name: ${nameToUse} for ID: ${merchantId}`);
                
                const newMerchant = {
                  id: merchantId,
                  name: nameToUse,
                  clientMID: `CM-${merchantId}`,
                  status: "Pending",
                  address: "123 Business St",
                  city: "Chicago",
                  state: "IL",
                  zipCode: "60601",
                  country: "US",
                  category: "Retail",
                  createdAt: new Date(),
                  lastUploadDate: new Date(),
                  editDate: new Date()
                };
                
                // @ENVIRONMENT-CRITICAL - Dynamic merchant creation with environment-aware table naming
                // @DEPLOYMENT-CHECK - Uses getTableName() for proper dev/production separation
                const merchantsTableName = getTableName('merchants');
                const columns = Object.keys(newMerchant).join(', ');
                const values = Object.values(newMerchant).map((_, index) => `$${index + 1}`).join(', ');
                await pool.query(`INSERT INTO ${merchantsTableName} (${columns}) VALUES (${values})`, Object.values(newMerchant));
                console.log(`Created merchant ${newMerchant.id} with actual name: ${newMerchant.name}`);
              } else {
                console.log(`[SKIP MERCHANT] No name available for ${merchantId}, will skip transactions for this merchant to avoid bad data`);
                // Remove transactions without merchant names to avoid constraint violations
                transactions = transactions.filter(t => t.merchantId !== merchantId);
                console.log(`Filtered out transactions for merchant ${merchantId} due to missing name`);
              }
            } else {
              console.log(`Merchant ${merchantId} already exists, transactions will be added to existing merchant`);
            }
          }
          
          // Final step: Simple filename+line based upserts (replaces complex trace number logic)
          console.log(`\n=================== FILENAME+LINE UPSERT PROCESSING ===================`);
          
          let insertedCount = 0;
          let updatedCount = 0;
          const insertedTransactionsList: any[] = [];
          
          for (const [index, transaction] of transactions.entries()) {
            try {
              // Prepare transaction data with filename+line fields for upsert
              const transactionData = {
                ...transaction,
                // Add filename and line number for uniqueness constraint
                source_filename: fileName,
                source_row_number: index + 1, // 1-based row numbering
                source_file_hash: null, // TODO: Add file hash for integrity checking
                updated_at: new Date()
              };
              
              // Use simple upsert with filename+line constraint
              // @ENVIRONMENT-CRITICAL - Dynamic transaction insertion with environment-aware table naming
              // @DEPLOYMENT-CHECK - Uses getTableName() for proper dev/production separation
              const transactionsTableName = getTableName('transactions');
              
              // INSERT ... ON CONFLICT DO UPDATE for filename+line uniqueness
              const columns = Object.keys(transactionData).join(', ');
              const values = Object.values(transactionData).map((_, idx) => `$${idx + 1}`).join(', ');
              const updateColumns = Object.keys(transactionData)
                .filter(col => col !== 'id' && col !== 'source_filename' && col !== 'source_row_number') // Don't update primary key or constraint columns
                .map(col => `${col} = EXCLUDED.${col}`)
                .join(', ');
              
              const upsertQuery = `
                INSERT INTO ${transactionsTableName} (${columns}) 
                VALUES (${values})
                ON CONFLICT (source_filename, source_row_number) 
                DO UPDATE SET ${updateColumns}
                RETURNING id, (xmax = 0) AS inserted
              `;
              
              const result = await pool.query(upsertQuery, Object.values(transactionData));
              const wasInserted = result.rows[0].inserted;
              
              if (wasInserted) {
                insertedCount++;
                console.log(`[INSERTED] New transaction from ${fileName}:${index + 1} - ID: ${transaction.id}, Amount: ${transaction.amount}`);
              } else {
                updatedCount++;
                console.log(`[UPDATED] Existing transaction from ${fileName}:${index + 1} - ID: ${transaction.id}, Amount: ${transaction.amount}`);
              }
              
              insertedTransactionsList.push({
                id: result.rows[0].id,
                merchantId: transaction.merchantId,
                amount: transaction.amount,
                action: wasInserted ? 'inserted' : 'updated'
              });
              
            } catch (insertError: any) {
              console.error(`\n❌ TRANSACTION UPSERT ERROR ❌`);
              console.error(`File: ${fileName}, Row: ${index + 1}`);
              console.error(`Transaction ID: ${transaction.id}`);
              console.error(`Error Details: ${insertError.message}`);
              throw insertError;
            }
          }
          
          console.log(`Successfully processed transactions: ${insertedCount} inserted, ${updatedCount} updated`);
          console.log(`Resolving with metrics: rowsProcessed=${rowCount}, transactionsCreated=${insertedCount}, errors=${errorCount}`);
          resolve({ rowsProcessed: rowCount, transactionsCreated: insertedCount, errors: errorCount });
        } catch (error) {
          console.error("Error processing transactions:", error);
          
          // If still fails, try one by one with merchant ID mapping and auto-creation
          console.log("Trying individual transaction insertion as fallback...");
          
          for (const transaction of transactions) {
            try {
              let merchantId = transaction.merchantId;
              
              // @ENVIRONMENT-CRITICAL - Transaction fallback merchant matching
              // @DEPLOYMENT-CHECK - Uses environment-aware table naming  
              const merchantsTableName = getTableName('merchants');
              
              // Check if merchant exists with the original merchant ID  
              let existingMerchantResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1 LIMIT 1`, [merchantId]);
              let existingMerchant = existingMerchantResult.rows;
              
              // If not found, try comprehensive merchant matching
              if (existingMerchant.length === 0) {
                console.log(`Merchant ${merchantId} not found, trying comprehensive matching...`);
                
                // Try to match by clientMID field
                const clientMidMatchResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE client_mid = $1 LIMIT 1`, [merchantId]);
                const clientMidMatch = clientMidMatchResult.rows;
                
                if (clientMidMatch.length > 0) {
                  merchantId = clientMidMatch[0].id;
                  console.log(`Mapped transaction merchantId ${transaction.merchantId} to existing merchant ${merchantId} by clientMID`);
                  existingMerchant = clientMidMatch;
                } else {
                  // Try to match by otherClientNumber1 or otherClientNumber2
                  const clientNumberMatchResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE other_client_number1 = $1 OR other_client_number2 = $1 LIMIT 1`, [merchantId]);
                  const clientNumberMatch = clientNumberMatchResult.rows;
                  
                  if (clientNumberMatch.length > 0) {
                    merchantId = clientNumberMatch[0].id;
                    console.log(`Mapped transaction merchantId ${transaction.merchantId} to existing merchant ${merchantId} by client number`);
                    existingMerchant = clientNumberMatch;
                  } else {
                    // Try to find merchant by partial name matching (for similar business names)
                    const namePattern = merchantId.replace(/[^a-zA-Z0-9]/g, '%');
                    const nameMatchResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE name ILIKE $1 OR id ILIKE $2 LIMIT 1`, [`%${namePattern}%`, `%${merchantId}%`]);
                    const nameMatch = nameMatchResult.rows;
                    
                    if (nameMatch.length > 0) {
                      merchantId = nameMatch[0].id;
                      console.log(`Mapped transaction merchantId ${transaction.merchantId} to existing merchant ${merchantId} by name pattern`);
                      existingMerchant = nameMatch;
                    }
                  }
                }
              }
              
              // If still not found, skip creating merchant - only add transactions to existing merchants
              if (existingMerchant.length === 0) {
                console.log(`[SKIP MERCHANT CREATION] Merchant ${merchantId} not found - skipping transaction to prevent placeholder merchant creation`);
                console.log(`[ROW SKIPPED] Transaction ${transaction.id} skipped due to missing merchant ${merchantId}`);
                errorCount++;
                return; // Skip this transaction
              }
              
              // Update transaction with correct merchant ID and implement intelligent duplicate handling
              const updatedTransaction = { ...transaction, merchantId };
              
              try {
                // @ENVIRONMENT-CRITICAL - Transaction insertion during batch processing
                // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                const transactionsTableName = getTableName('transactions');
                
                // First attempt - try to insert normally using raw SQL
                const insertTransactionQuery = `
                  INSERT INTO ${transactionsTableName} (
                    id, date, amount, type, description, merchant_id, created_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                `;
                
                await pool.query(insertTransactionQuery, [
                  updatedTransaction.id, updatedTransaction.date, updatedTransaction.amount,
                  updatedTransaction.type, updatedTransaction.description, updatedTransaction.merchantId,
                  updatedTransaction.createdAt || new Date()
                ]);
                console.log(`Successfully inserted transaction ${updatedTransaction.id} with merchant ${merchantId}`);
                
              } catch (insertError: any) {
                if (insertError.code === '23505' && insertError.constraint && insertError.constraint.endsWith('_transactions_pkey')) {
                  // Transaction ID already exists - now check date and implement smart handling
                  console.log(`Duplicate transaction ID detected: ${updatedTransaction.id}`);
                  
                  // @ENVIRONMENT-CRITICAL - Transaction duplicate checking during batch processing
                  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                  const transactionsTableName = getTableName('transactions');
                  
                  // Get the existing transaction to check the date
                  const existingTransactionsResult = await pool.query(`SELECT * FROM ${transactionsTableName} WHERE id = $1 LIMIT 1`, [updatedTransaction.id]);
                  const existingTransactions = existingTransactionsResult.rows;
                  
                  if (existingTransactions.length > 0) {
                    const existingTransaction = existingTransactions[0];
                    const existingDate = new Date(existingTransaction.date);
                    const newDate = new Date(updatedTransaction.date);
                    
                    // Check if dates are the same (same day)
                    const sameDate = existingDate.toDateString() === newDate.toDateString();
                    
                    if (sameDate) {
                      // Same date - check if values differ, update if different
                      const sameAmount = parseFloat(existingTransaction.amount.toString()) === parseFloat(updatedTransaction.amount.toString());
                      const sameType = existingTransaction.type === updatedTransaction.type;
                      
                      if (!sameAmount || !sameType) {
                        // Values differ - update the existing transaction
                        console.log(`Updating existing transaction ${updatedTransaction.id} with new values (amount: ${existingTransaction.amount} -> ${updatedTransaction.amount}, type: ${existingTransaction.type} -> ${updatedTransaction.type})`);
                        
                        // @ENVIRONMENT-CRITICAL - Transaction update during duplicate handling
                        // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                        const updateTransactionQuery = `
                          UPDATE ${transactionsTableName} 
                          SET amount = $1, type = $2, description = $3, merchant_id = $4
                          WHERE id = $5
                        `;
                        
                        await pool.query(updateTransactionQuery, [
                          updatedTransaction.amount, updatedTransaction.type, 
                          updatedTransaction.description, updatedTransaction.merchantId,
                          updatedTransaction.id
                        ]);
                        console.log(`Successfully updated transaction ${updatedTransaction.id}`);
                      } else {
                        // Same values - skip duplicate
                        console.log(`Skipping duplicate transaction ${updatedTransaction.id} (same date and values)`);
                      }
                    } else {
                      // Different dates - create incremented ID
                      let finalTransactionId = updatedTransaction.id;
                      let insertAttempt = 0;
                      let insertSuccessful = false;
                      
                      while (!insertSuccessful && insertAttempt < 100) {
                        insertAttempt++;
                        
                        // Check if original ID is numeric
                        if (!isNaN(Number(updatedTransaction.id))) {
                          // Numeric ID - increment by 0.1
                          const baseId = parseFloat(updatedTransaction.id);
                          finalTransactionId = (baseId + (insertAttempt * 0.1)).toString();
                        } else {
                          // Non-numeric ID - append suffix
                          finalTransactionId = `${updatedTransaction.id}_${insertAttempt}`;
                        }
                        
                        console.log(`Different dates detected. Trying incremented ID: ${finalTransactionId}`);
                        
                        try {
                          const incrementedTransaction = { ...updatedTransaction, id: finalTransactionId };
                          // @ENVIRONMENT-CRITICAL - Dynamic incremented transaction insertion with environment-aware table naming
                          // @DEPLOYMENT-CHECK - Uses getTableName() for proper dev/production separation
                          const transactionsTableName = getTableName('transactions');
                          const columns = Object.keys(incrementedTransaction).join(', ');
                          const values = Object.values(incrementedTransaction).map((_, index) => `$${index + 1}`).join(', ');
                          await pool.query(`INSERT INTO ${transactionsTableName} (${columns}) VALUES (${values})`, Object.values(incrementedTransaction));
                          console.log(`Successfully inserted transaction ${finalTransactionId} with incremented ID`);
                          insertSuccessful = true;
                        } catch (incrementError: any) {
                          if (incrementError.code === '23505') {
                            // Still duplicate, try next increment
                            continue;
                          } else {
                            throw incrementError;
                          }
                        }
                      }
                      
                      if (!insertSuccessful) {
                        throw new Error(`Failed to insert transaction after ${insertAttempt} attempts due to persistent duplicates`);
                      }
                    }
                  }
                } else {
                  // Different error - re-throw
                  throw insertError;
                }
              }
              
            } catch (individualError: any) {
              console.error(`Failed to insert transaction ${transaction.id}:`, individualError);
            }
          }
          
          resolve({ rowsProcessed: rowCount, transactionsCreated: transactions.length, errors: errorCount });
        }
      });
      
      // Write the CSV content to the parser
      parser.write(csvContent);
      parser.end();
    });
  }

  // Process a transaction CSV file
  async processTransactionFile(filePath: string): Promise<void> {
    console.log(`Processing transaction file: ${filePath}`);
    
    // Set sourceFileId for tracking (extract from file path if possible)
    const sourceFileId = filePath.includes('uploader_') 
      ? filePath.match(/uploader_[^\/]+/)?.[0] || 'unknown_file'
      : 'unknown_file';
    
    // Import field mappings and utility functions
    const { 
      transactionFieldMappings, 
      alternateTransactionMappings, 
      transactionMerchantIdAliases,
      transactionCodeMapping,
      findMerchantId, 
      normalizeMerchantId 
    } = await import("@shared/field-mappings");
    
    return new Promise((resolve, reject) => {
      // First check if file exists
      if (!existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return reject(new Error(`File not found: ${filePath}. The temporary file may have been removed by the system.`));
      }
      
      // Verify file is readable
      try {
        const testStream = createReadStream(filePath, { start: 0, end: 10 });
        testStream.on('error', (error) => {
          console.error(`File exists but is not readable: ${filePath}`, error);
          return reject(new Error(`File exists but is not readable: ${filePath}. Error: ${error.message}`));
        });
        testStream.on('readable', () => {
          testStream.destroy(); // Close test stream after successful read
        });
      } catch (error) {
        console.error(`Error checking file readability: ${filePath}`, error);
        return reject(new Error(`Error checking file readability: ${filePath}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
      
      console.log("Starting transaction CSV parsing...");
      const parser = createReadStream(filePath).pipe(
        parseCSV({
          columns: true,
          skip_empty_lines: true
        })
      );
      
      let transactions: InsertTransaction[] = [];
      let rowCount = 0;
      let errorCount = 0;
      let sampleRow: any = null;
      let detectedFormat: string = 'default';
      
      // Function to detect file format based on headers
      const detectFileFormat = (row: any): string => {
        // Check for TDDF - Transaction Daily Detail File format
        if (row.TXN_ID !== undefined && 
            row.MERCHANT_ID !== undefined && 
            row.TXN_AMOUNT !== undefined && 
            row.TXN_DATE !== undefined && 
            row.TXN_TYPE !== undefined) {
          console.log("Detected TDDF (Transaction Daily Detail File) format");
          return 'tddf';
        }
        
        // Check for the format1 (Name, Account, Amount, Date, Code, Descr)
        if (row.Name !== undefined && 
            row.Account !== undefined && 
            row.Amount !== undefined && 
            row.Date !== undefined && 
            row.Code !== undefined && 
            row.Descr !== undefined) {
          console.log("Detected format1 transaction format with Name/Account/Code/Descr");
          return 'format1';
        }
        
        // Default format (TransactionID, MerchantID, Amount, Date, Type)
        console.log("Using default transaction format");
        return 'default';
      };
      
      parser.on("data", (row) => {
        rowCount++;
        try {
          // Save first row for format detection
          if (rowCount === 1) {
            sampleRow = row;
            detectedFormat = detectFileFormat(row);
            console.log(`Detected file format: ${detectedFormat}`);
          }
          
          console.log(`Processing transaction row ${rowCount}:`, JSON.stringify(row));
          
          // Find merchant ID using utility function
          let merchantId = findMerchantId(row, transactionMerchantIdAliases);
          
          if (!merchantId) {
            throw new Error("Missing merchantId in transaction row");
          }
          
          // Normalize merchant ID (add prefix if needed)
          merchantId = merchantId.trim(); // Use authentic merchant ID without M-prefix generation
          
          // Create transaction object with defaults
          const transaction: Partial<InsertTransaction> = {
            id: `T${Math.floor(Math.random() * 1000000)}`,
            merchantId,
            amount: "0",
            date: new Date(),
            type: "Sale"
          };
          
          // Store original merchant name if available
          let originalMerchantName = null;
          console.log(`[FORMAT DEBUG] detectedFormat: ${detectedFormat}, row.Name: ${row.Name}, row.MERCHANT_NAME: ${row.MERCHANT_NAME}, has Name property: ${row.hasOwnProperty('Name')}`);
          if (detectedFormat === 'format1' && row.Name) {
            originalMerchantName = row.Name.trim();
            console.log(`[PARSING DEBUG] Found merchant name in format1 transaction: ${originalMerchantName} for merchant ID: ${merchantId}`);
            // Store the merchant name in the transaction object for later use
            (transaction as any).originalMerchantName = originalMerchantName;
            console.log(`[PARSING DEBUG] Set originalMerchantName property: ${(transaction as any).originalMerchantName}`);
          } else if (detectedFormat === 'tddf' && row.MERCHANT_NAME) {
            originalMerchantName = row.MERCHANT_NAME.trim();
            console.log(`[PARSING DEBUG] Found merchant name in TDDF transaction: ${originalMerchantName} for merchant ID: ${merchantId}`);
            // Store the merchant name in the transaction object for later use
            (transaction as any).originalMerchantName = originalMerchantName;
            console.log(`[PARSING DEBUG] Set originalMerchantName property from TDDF: ${(transaction as any).originalMerchantName}`);
          } else {
            console.log(`[FORMAT DEBUG] NOT setting originalMerchantName - format: ${detectedFormat}, Name value: "${row.Name}", MERCHANT_NAME value: "${row.MERCHANT_NAME}"`);
          }
          
          // Select the appropriate field mapping based on detected format
          const fieldMappings = detectedFormat === 'format1' 
            ? alternateTransactionMappings.format1
            : detectedFormat === 'tddf'
            ? alternateTransactionMappings.tddf
            : transactionFieldMappings;
          
          // Apply field mappings from CSV based on detected format
          console.log(`[FIELD MAPPING DEBUG] Processing ${Object.keys(fieldMappings).length} field mappings for format: ${detectedFormat}`);
          console.log(`[FIELD MAPPING DEBUG] Available CSV fields:`, Object.keys(row));
          for (const [dbField, csvField] of Object.entries(fieldMappings)) {
            console.log(`[FIELD MAPPING DEBUG] Checking mapping: ${dbField} <- ${csvField}, value: "${row[csvField]}", type: ${typeof row[csvField]}`);
            if (csvField && row[csvField] !== undefined) {
              if (dbField === 'date') {
                try {
                  if (row[csvField] && row[csvField].trim() !== '') {
                    transaction[dbField as keyof InsertTransaction] = new Date(row[csvField]) as any;
                  } else {
                    transaction[dbField as keyof InsertTransaction] = new Date() as any;
                  }
                } catch (e) {
                  console.warn(`Failed to parse date: ${row[csvField]}, using current date`);
                  transaction[dbField as keyof InsertTransaction] = new Date() as any;
                }
              } 
              else if (dbField === 'amount' && row[csvField]) {
                // Parse amount from string to number, handling different formats
                try {
                  // Remove any currency symbols, commas, and quotes
                  const cleanAmount = row[csvField].toString().replace(/[$,"]/g, '').trim();
                  const amount = parseFloat(cleanAmount);
                  
                  console.log(`[AMOUNT DEBUG] Original: "${row[csvField]}", Clean: "${cleanAmount}", Parsed: ${amount}`);
                  
                  if (isNaN(amount)) {
                    console.error(`Invalid amount format in row ${rowCount}: ${row[csvField]}`);
                    transaction[dbField as keyof InsertTransaction] = 0 as any;
                  } else {
                    // Store amount as string representation for consistency with schema
                    transaction[dbField as keyof InsertTransaction] = amount.toString() as any;
                  }
                } catch (e) {
                  console.error(`Error parsing amount: ${row[csvField]}`);
                  transaction[dbField as keyof InsertTransaction] = 0 as any;
                }
              }
              else if (dbField === 'type' && detectedFormat === 'format1' && row[csvField]) {
                // Map transaction codes to types (e.g., 22 = Credit, 27 = Debit)
                const code = row[csvField].toString().trim();
                // Check if the code is one of our known codes (22 or 27)
                if (code === "22" || code === "27") {
                  transaction[dbField as keyof InsertTransaction] = transactionCodeMapping[code] as any;
                  console.log(`Mapped transaction code ${code} to type ${transactionCodeMapping[code]}`);
                  
                  // Adjust amount based on transaction type
                  if (transaction.amount !== undefined) {
                    // Parse amount as number for comparison
                    const amountNum = typeof transaction.amount === 'string' 
                      ? parseFloat(transaction.amount) 
                      : transaction.amount;
                      
                    if (code === "22") { // Credit - should be positive
                      // If amount is negative, make it positive
                      if (amountNum < 0) {
                        const positiveAmount = Math.abs(amountNum);
                        transaction.amount = positiveAmount.toString();
                        console.log(`Adjusted negative amount to positive for Credit transaction: ${transaction.amount}`);
                      }
                    } else if (code === "27") { // Debit - should be negative
                      // If amount is positive, make it negative
                      if (amountNum > 0) {
                        const negativeAmount = -Math.abs(amountNum);
                        transaction.amount = negativeAmount.toString();
                        console.log(`Adjusted positive amount to negative for Debit transaction: ${transaction.amount}`);
                      }
                    }
                  }
                } else {
                  // Default fallback if code is not recognized
                  transaction[dbField as keyof InsertTransaction] = row[csvField] as any;
                  console.log(`Unknown transaction code: ${code}, using raw value`);
                }
              }
              else {
                transaction[dbField as keyof InsertTransaction] = row[csvField] as any;
              }
            }
          }
          
          // Make sure we have an ID
          if (!transaction.id) {
            transaction.id = `T${Math.floor(Math.random() * 1000000)}`;
          }
          
          console.log(`Mapped transaction:`, JSON.stringify(transaction));
          // Add debug output to verify originalMerchantName property
          const originalName = (transaction as any).originalMerchantName;
          console.log(`[PRESERVATION DEBUG] Before pushing to array - originalMerchantName: ${originalName}`);
          
          // Store raw CSV row data for tooltip display
          const transactionWithRawData = {
            ...transaction,
            rawData: row,  // Store original CSV row for tooltip
            sourceFileId: sourceFileId || null,  // Store source file ID
            sourceRowNumber: rowCount,  // Store row number
            recordedAt: new Date()  // Store processing timestamp
          } as InsertTransaction & { originalMerchantName?: string; rawData?: any; sourceFileId?: string; sourceRowNumber?: number; recordedAt?: Date };
          
          // Ensure originalMerchantName is preserved for advanced matching
          transactions.push(transactionWithRawData);
          
          // Verify after pushing
          const lastTrans = transactions[transactions.length - 1] as any;
          console.log(`[PRESERVATION DEBUG] After pushing to array - originalMerchantName: ${lastTrans.originalMerchantName}`);
        } catch (error) {
          errorCount++;
          console.error(`Error processing transaction row ${rowCount}:`, error);
          console.error("Row data:", JSON.stringify(row));
          // Continue with next row
        }
      });
      
      parser.on("error", (error) => {
        console.error("CSV parsing error:", error);
        reject(error);
      });
      
      parser.on("end", async () => {
        console.log(`=================== CSV PROCESSING SUMMARY ===================`);
        console.log(`CSV parsing complete. Processed ${rowCount} rows with ${errorCount} errors.`);
        console.log(`Processing ${transactions.length} valid transactions...`);
        console.log(`=============================================================`);
        
        try {
          // Process transactions
          let insertedCount = 0;
          let skippedDuplicates = 0; // Track skipped duplicate transactions
          let updatedMerchants = 0;
          let createdMerchants = 0;
          
          // Lists to track created and updated merchants
          const createdMerchantsList = [];
          const updatedMerchantsList = [];
          const insertedTransactionsList = [];
          
          // Store original merchant names mapping from the Name column in format1
          const merchantNameMapping = new Map<string, string>();
          
          // Also create a reverse mapping for name-based lookup
          const nameToIdMapping = new Map<string, string[]>();
          
          // First collect the merchant names from the Name column in transactions
          if (detectedFormat === 'format1') {
            console.log('Collecting merchant names from transaction file...');
            
            // Create a map of merchantId to merchant name
            for (const row of transactions) {
              if (row.merchantId && (row as any).originalMerchantName) {
                const merchantName = (row as any).originalMerchantName;
                merchantNameMapping.set(row.merchantId, merchantName);
                
                // Also create a mapping from name to ID for lookup
                if (!nameToIdMapping.has(merchantName)) {
                  nameToIdMapping.set(merchantName, []);
                }
                nameToIdMapping.get(merchantName)?.push(row.merchantId);
              }
            }
            
            console.log(`Collected ${merchantNameMapping.size} merchant names from transactions`);
            
            // Pre-check if any merchants with these names already exist
            if (nameToIdMapping.size > 0) {
              console.log(`Checking for existing merchants with ${nameToIdMapping.size} unique names...`);
              
              // Get all merchants with matching names
              const merchantNames = Array.from(nameToIdMapping.keys());
              
              // @ENVIRONMENT-CRITICAL - Transaction processing merchant matching
              // @DEPLOYMENT-CHECK - Uses environment-aware table naming
              const merchantsTableName = getTableName('merchants');
              
              // First get all existing merchant names for more efficient matching
              const allExistingMerchantsResult = await pool.query(`SELECT * FROM ${merchantsTableName}`);
              const allExistingMerchants = allExistingMerchantsResult.rows;
              console.log(`Loaded ${allExistingMerchants.length} existing merchants for name matching`);
              
              // For each name, check if we have a merchant with that name already
              for (const name of merchantNames) {
                try {
                  console.log(`\n[MATCHING PROCESS] Checking for merchant match with name: "${name}"`);
                  // Try exact match first
                  const exactMatchMerchants = allExistingMerchants.filter(m => 
                    m.name.toLowerCase() === name.toLowerCase()
                  );
                  
                  // If exact match found
                  if (exactMatchMerchants.length > 0) {
                    console.log(`[EXACT MATCH] Found existing merchant with name "${name}": ${exactMatchMerchants[0].id}`);
                    
                    // Get all transaction IDs that had this name
                    const transactionIds = nameToIdMapping.get(name) || [];
                    
                    // For each transaction ID that uses this name, remap it to the existing merchant ID
                    for (const transId of transactionIds) {
                      // Update the merchant ID in the transactions
                      for (const trans of transactions) {
                        if (trans.merchantId === transId) {
                          console.log(`Remapping transaction with ID ${trans.id} from merchant ${trans.merchantId} to existing merchant ${exactMatchMerchants[0].id} based on exact name match "${name}"`);
                          trans.merchantId = exactMatchMerchants[0].id;
                        }
                      }
                    }
                  }
                  // Try fuzzy match if no exact match
                  else {
                    // Find merchants with similar names using contains match
                    const fuzzyMatchMerchants = allExistingMerchants.filter(m => {
                      const merchantName = m.name.toLowerCase();
                      const transactionName = name.toLowerCase();
                      
                      // Remove common business suffixes for better core name matching
                      const cleanMerchantName = merchantName
                        .replace(/\s+(llc|inc|ltd|corp|corporation|company)(\s+|$)/g, '')
                        .trim();
                        
                      const cleanTransactionName = transactionName
                        .replace(/\s+(llc|inc|ltd|corp|corporation|company)(\s+|$)/g, '')
                        .trim();
                      
                      // Only match if core names (without business types) match exactly
                      if (cleanMerchantName === cleanTransactionName && cleanMerchantName.length >= 4) {
                        console.log(`[NAME MATCH] Core names match exactly: "${cleanMerchantName}" = "${cleanTransactionName}"`);
                        return true;
                      }
                      
                      // DISABLED: No fuzzy matching - only exact core name matches allowed
                      // This prevents false matches between unrelated businesses
                      
                      return false;
                    });
                    
                    if (fuzzyMatchMerchants.length > 0) {
                      console.log(`[FUZZY MATCH] Found similar merchant for "${name}": ${fuzzyMatchMerchants[0].id} (${fuzzyMatchMerchants[0].name})`);
                      
                      // Get all transaction IDs that had this name
                      const transactionIds = nameToIdMapping.get(name) || [];
                      
                      // For each transaction ID that uses this name, remap it to the existing merchant ID
                      for (const transId of transactionIds) {
                        // Update the merchant ID in the transactions
                        for (const trans of transactions) {
                          if (trans.merchantId === transId) {
                            console.log(`Remapping transaction with ID ${trans.id} from merchant ${trans.merchantId} to similar merchant ${fuzzyMatchMerchants[0].id} based on fuzzy name match "${name}" ~ "${fuzzyMatchMerchants[0].name}"`);
                            trans.merchantId = fuzzyMatchMerchants[0].id;
                          }
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.error(`Error checking for existing merchant with name "${name}":`, error);
                }
              }
            }
          }
          
          for (const transaction of transactions) {
            // @ENVIRONMENT-CRITICAL - Transaction processing merchant existence check
            // @DEPLOYMENT-CHECK - Uses environment-aware table naming
            const merchantsTableName = getTableName('merchants');
            
            // Check if merchant exists by ID
            const existingMerchantResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id = $1`, [transaction.merchantId]);
            const existingMerchant = existingMerchantResult.rows;
              
            // Create placeholder merchant if needed
            if (existingMerchant.length === 0) {
              console.log(`No merchant found with ID: ${transaction.merchantId}, checking for similar merchants...`);
              
              // Get the merchant name from the Name column if available
              const merchantNameFromTransaction = merchantNameMapping.get(transaction.merchantId);
              
              // Try to find a merchant with a similar ID pattern
              const merchantIdStr = String(transaction.merchantId);
              const similarMerchantsResult = await pool.query(`SELECT * FROM ${merchantsTableName} WHERE id::text LIKE $1 LIMIT 5`, [`${merchantIdStr.substring(0, 2)}%`]);
              const similarMerchants = similarMerchantsResult.rows;
              
              if (merchantNameFromTransaction) {
                // Use the real merchant name from the transaction
                console.log(`[NEW MERCHANT] Using actual name from transaction: ${merchantNameFromTransaction} for ID: ${transaction.merchantId}`);
                
                // Get template data from similar merchants if available
                const templateMerchant = similarMerchants.length > 0 ? similarMerchants[0] : null;
                
                const newMerchant = {
                  id: transaction.merchantId,
                  name: merchantNameFromTransaction,
                  clientMID: `CM-${transaction.merchantId}`, // Generate a client MID based on merchant ID
                  status: "Pending",
                  address: templateMerchant?.address || "123 Business St",
                  city: templateMerchant?.city || "Chicago",
                  state: templateMerchant?.state || "IL",
                  zipCode: templateMerchant?.zipCode || "60601",
                  country: templateMerchant?.country || "US",
                  category: templateMerchant?.category || "Retail",
                  createdAt: new Date(),
                  lastUploadDate: new Date(),
                  editDate: new Date()
                };
                
                // @ENVIRONMENT-CRITICAL - New merchant creation during transaction processing
                // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                const insertQuery = `
                  INSERT INTO ${merchantsTableName} (
                    id, name, client_mid, status, address, city, state, zip_code, 
                    country, category, created_at, last_upload_date, edit_date
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `;
                
                await pool.query(insertQuery, [
                  newMerchant.id, newMerchant.name, newMerchant.clientMID, newMerchant.status,
                  newMerchant.address, newMerchant.city, newMerchant.state, newMerchant.zipCode,
                  newMerchant.country, newMerchant.category, newMerchant.createdAt, 
                  newMerchant.lastUploadDate, newMerchant.editDate
                ]);
                createdMerchants++;
                createdMerchantsList.push({
                  id: newMerchant.id,
                  name: newMerchant.name,
                  source: "Name column"
                });
              } else if (similarMerchants.length > 0) {
                // Use the first similar merchant's name pattern with the transaction's merchant ID
                console.log(`[NEW MERCHANT] Found similar merchant pattern. Using name pattern from: ${similarMerchants[0].name}`);
                const nameParts = similarMerchants[0].name.split(' ');
                const merchantName = `${nameParts[0]} ${transaction.merchantId}`;
                
                // Create new merchant with derived name and sample data based on similar merchants
                console.log(`Creating new merchant with derived name: ${merchantName} and ID: ${transaction.merchantId}`);
                
                // Get sample data from the similar merchant to use as template
                const templateMerchant = similarMerchants[0];
                
                const newMerchant = {
                  id: transaction.merchantId,
                  name: merchantName,
                  clientMID: `CM-${transaction.merchantId}`, // Generate a client MID based on merchant ID
                  status: "Pending",
                  address: templateMerchant.address || "123 Business St",
                  city: templateMerchant.city,
                  state: templateMerchant.state,
                  zipCode: templateMerchant.zipCode,
                  country: templateMerchant.country || "US",
                  category: templateMerchant.category || "Retail",
                  createdAt: new Date(),
                  lastUploadDate: new Date(),
                  editDate: new Date()
                };
                
                // @ENVIRONMENT-CRITICAL - Similar merchant creation during transaction processing  
                // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                const insertQuery2 = `
                  INSERT INTO ${merchantsTableName} (
                    id, name, client_mid, status, address, city, state, zip_code, 
                    country, category, created_at, last_upload_date, edit_date
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `;
                
                await pool.query(insertQuery2, [
                  newMerchant.id, newMerchant.name, newMerchant.clientMID, newMerchant.status,
                  newMerchant.address, newMerchant.city, newMerchant.state, newMerchant.zipCode,
                  newMerchant.country, newMerchant.category, newMerchant.createdAt, 
                  newMerchant.lastUploadDate, newMerchant.editDate
                ]);
                createdMerchants++;
                createdMerchantsList.push({
                  id: newMerchant.id,
                  name: newMerchant.name,
                  source: "Similar merchant pattern"
                });
              } else {
                // No similar merchants found, create with default values
                console.log(`[NEW MERCHANT] Creating placeholder merchant for ID: ${transaction.merchantId}`);
                
                const newMerchant = {
                  id: transaction.merchantId,
                  name: `Merchant ${transaction.merchantId}`,
                  clientMID: `CM-${transaction.merchantId}`,
                  status: "Pending", 
                  address: "100 Main Street",
                  city: "Chicago",
                  state: "IL",
                  zipCode: "60601",
                  country: "US",
                  category: "General",
                  createdAt: new Date(),
                  lastUploadDate: new Date(),
                  editDate: new Date()
                };
                
                // @ENVIRONMENT-CRITICAL - Placeholder merchant creation during transaction processing
                // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                const insertQuery3 = `
                  INSERT INTO ${merchantsTableName} (
                    id, name, client_mid, status, address, city, state, zip_code, 
                    country, category, created_at, last_upload_date, edit_date
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                `;
                
                await pool.query(insertQuery3, [
                  newMerchant.id, newMerchant.name, newMerchant.clientMID, newMerchant.status,
                  newMerchant.address, newMerchant.city, newMerchant.state, newMerchant.zipCode,
                  newMerchant.country, newMerchant.category, newMerchant.createdAt, 
                  newMerchant.lastUploadDate, newMerchant.editDate
                ]);
                createdMerchants++;
                createdMerchantsList.push({
                  id: newMerchant.id,
                  name: newMerchant.name,
                  source: "Placeholder"
                });
              }
            } else {
              // Update lastUploadDate for merchant
              console.log(`[UPDATE] Updating lastUploadDate for existing merchant: ${transaction.merchantId} (${existingMerchant[0].name})`);
              updatedMerchants++;
              updatedMerchantsList.push({
                id: transaction.merchantId,
                name: existingMerchant[0].name
              });
              
              // @ENVIRONMENT-CRITICAL - Merchant last upload date update
              // @DEPLOYMENT-CHECK - Uses environment-aware table naming
              const merchantsTableName = getTableName('merchants');
              
              const updateMerchantQuery = `
                UPDATE ${merchantsTableName}
                SET last_upload_date = $1
                WHERE id = $2
              `;
              
              await pool.query(updateMerchantQuery, [new Date(), transaction.merchantId]);
            }
            
            // Check for duplicates BEFORE attempting insert (merchant_id + date + amount)
            // @ENVIRONMENT-CRITICAL - Transaction duplicate detection
            // @DEPLOYMENT-CHECK - Uses environment-aware table naming for ACH transactions
            const transactionsTableName = getTableName('api_achtransactions');
            
            // Parse and normalize the transaction date for comparison
            const transactionDate = new Date(transaction.date);
            const transactionDateStr = transactionDate.toISOString().split('T')[0];
            
            // Query for existing transactions with same merchant_id, date, and amount
            const duplicateCheckQuery = `
              SELECT id, merchant_id, transaction_date, amount 
              FROM ${transactionsTableName} 
              WHERE merchant_id = $1 
                AND DATE(transaction_date) = DATE($2::timestamp)
                AND amount::numeric = $3::numeric
              LIMIT 1
            `;
            
            let existingDuplicateResult;
            try {
              existingDuplicateResult = await pool.query(duplicateCheckQuery, [
                transaction.merchantId,
                transactionDateStr,
                transaction.amount
              ]);
            } catch (dupCheckError) {
              console.error(`[DUPLICATE CHECK ERROR] Failed to check for duplicates:`, dupCheckError);
              existingDuplicateResult = { rows: [] }; // Continue with insert if check fails
            }
            
            if (existingDuplicateResult.rows.length > 0) {
              // Duplicate found - skip insertion
              const existingTrans = existingDuplicateResult.rows[0];
              console.log(`[DUPLICATE SKIP] Transaction already exists: merchant=${transaction.merchantId}, date=${transactionDateStr}, amount=${transaction.amount} (existing ID: ${existingTrans.id}). Skipping...`);
              
              // Increment skipped duplicates counter
              skippedDuplicates++;
              
              // Track skipped duplicate in statistics
              const duplicateInfo = { increments: 0, wasSkipped: true };
              const { fileProcessorService } = await import("./services/file-processor");
              fileProcessorService.updateProcessingStats(transaction.id, duplicateInfo);
              
              continue; // Skip to next transaction
            }
            
            // No duplicate found - proceed with insertion
            console.log(`[TRANSACTION] Inserting: ${transaction.id} for merchant ${transaction.merchantId}, amount: ${transaction.amount}`);
            
            // The transaction already contains rawData from CSV parsing - use it directly
            let finalTransaction = { ...transaction };
            let insertAttempts = 0;
            let originalId = transaction.id;
            let duplicateInfo: { increments: number; wasSkipped: boolean } | undefined;
            
            while (insertAttempts < 100) { // Prevent infinite loop
              try {
                // Map camelCase object properties to snake_case database columns for ACH
                const fieldMapping = {
                  'merchantId': 'merchant_id',
                  'merchantName': 'merchant_name',
                  'accountNumber': 'account_number', 
                  'date': 'transaction_date',  // Map date to transaction_date
                  'transactionDate': 'transaction_date',
                  'type': 'code',  // Map type to code column
                  'transactionType': 'code',
                  'originalMerchantName': 'company',  // Map originalMerchantName to company column
                  'sourceFileId': 'file_source',  // Map sourceFileId to file_source column
                  'recordedAt': 'created_at',  // Map recordedAt to created_at column
                  'traceNumber': 'trace_number',
                  'fileSource': 'file_source',
                  'createdAt': 'created_at',
                  'updatedAt': 'updated_at'
                };
                
                // Convert finalTransaction to use database column names
                const dbTransaction = {};
                Object.keys(finalTransaction).forEach(key => {
                  // Skip fields that don't exist in ACH table or should not be mapped
                  if (key === 'rawdata' || key === 'rawData' || key === 'sourceRowNumber') {
                    return; // Skip these fields
                  }
                  // Handle the id field specially - use it for both id and trace_number
                  if (key === 'id') {
                    dbTransaction['id'] = finalTransaction[key]; // Use trace-mapped ID as primary key
                    dbTransaction['trace_number'] = finalTransaction[key]; // Also store as trace_number
                    return;
                  }
                  const dbColumn = fieldMapping[key] || key; // Use mapping or original key
                  dbTransaction[dbColumn] = finalTransaction[key];
                });
                
                // Prepare values for insertion with mapped column names
                const columns = Object.keys(dbTransaction);
                const values = Object.values(dbTransaction);
                const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');
                
                const insertQuery = `
                  INSERT INTO ${transactionsTableName} (${columns.join(', ')})
                  VALUES (${placeholders})
                `;
                
                await pool.query(insertQuery, values);
                
                // Update file processor statistics
                const { fileProcessorService } = await import("./services/file-processor");
                if (duplicateInfo) {
                  fileProcessorService.updateProcessingStats(finalTransaction.id, duplicateInfo);
                } else {
                  fileProcessorService.updateProcessingStats(finalTransaction.id);
                }
                
                if (insertAttempts > 0) {
                  console.log(`[DUPLICATE RESOLVED] Original ID ${originalId} incremented to ${finalTransaction.id} after ${insertAttempts} attempts`);
                }
                
                insertedCount++;
                insertedTransactionsList.push({
                  id: finalTransaction.id,
                  merchantId: finalTransaction.merchantId,
                  amount: finalTransaction.amount
                });
                break; // Success, exit the retry loop
                
              } catch (insertError) {
                // Check if it's a duplicate key error (handle both ACH and regular transaction tables)
                const isDuplicateError = insertError.code === '23505' && 
                  (insertError.constraint === 'transactions_pkey' || 
                   insertError.constraint === 'dev_api_achtransactions_pkey' ||
                   insertError.constraint?.includes('_pkey'));
                if (isDuplicateError) {
                  // Check if the existing transaction has the same trace number AND date
                  console.log(`[DUPLICATE DETECTED] Transaction ID ${originalId} already exists. Checking trace number and date match...`);
                  
                  try {
                    // Get the trace number from the current transaction being inserted
                    const currentTraceNumber = finalTransaction.traceNumber || finalTransaction.trace_number || originalId;
                    
                    // Normalize trace number for comparison (remove leading zeros and special chars)
                    const normalizeTraceNumber = (traceNum: string): string => {
                      return traceNum.replace(/[^a-zA-Z0-9]/g, '').replace(/^0+/, '') || '0';
                    };
                    
                    const normalizedCurrentTrace = normalizeTraceNumber(currentTraceNumber);
                    
                    // Check for existing transactions with same trace number
                    let existingTransactionResult = await pool.query(`
                      SELECT * FROM ${transactionsTableName} 
                      WHERE trace_number = $1 OR trace_number = $2 
                      ORDER BY created_at DESC LIMIT 1
                    `, [currentTraceNumber, normalizedCurrentTrace]);
                    
                    // If no match by trace number, fall back to ID check
                    if (existingTransactionResult.rows.length === 0) {
                      existingTransactionResult = await pool.query(`
                        SELECT * FROM ${transactionsTableName} WHERE id = $1 LIMIT 1
                      `, [originalId]);
                    }
                    
                    if (existingTransactionResult.rows.length > 0) {
                      const existing = existingTransactionResult.rows[0];
                      
                      // Robust date parsing with fallback
                      const parseDate = (dateValue) => {
                        if (!dateValue) return null;
                        try {
                          const date = new Date(dateValue);
                          if (isNaN(date.getTime())) return null;
                          return date;
                        } catch (e) {
                          return null;
                        }
                      };
                      
                      const existingDate = parseDate(existing.transaction_date || existing.date);
                      const newDate = parseDate(finalTransaction.date);
                      
                      if (!existingDate || !newDate) {
                        console.log(`[DATE PARSE ERROR] Could not parse dates - existing: ${existing.transaction_date || existing.date}, new: ${finalTransaction.date}. Skipping duplicate check.`);
                        throw new Error('Date parsing failed');
                      }
                      
                      // Compare dates (only date part, not time)
                      const existingDateStr = existingDate.toISOString().split('T')[0];
                      const newDateStr = newDate.toISOString().split('T')[0];
                      
                      // Check if trace numbers match
                      const existingTraceNumber = existing.trace_number || existing.id;
                      const normalizedExistingTrace = normalizeTraceNumber(existingTraceNumber);
                      
                      const traceNumbersMatch = (
                        existingTraceNumber === currentTraceNumber ||
                        existingTraceNumber === normalizedCurrentTrace ||
                        normalizedExistingTrace === normalizedCurrentTrace ||
                        normalizedExistingTrace === currentTraceNumber
                      );
                      
                      if (existingDateStr === newDateStr && traceNumbersMatch) {
                        // Same date AND same trace number - skip the record entirely
                        console.log(`[SKIP] Transaction with trace number '${currentTraceNumber}' and date '${existingDateStr}' already exists. Skipping duplicate...`);
                        
                        // Set duplicate info for statistics (skipped)
                        duplicateInfo = { increments: 0, wasSkipped: true };
                        
                        // Update file processor statistics for skipped transaction
                        const { fileProcessorService } = await import("./services/file-processor");
                        fileProcessorService.updateProcessingStats(originalId, duplicateInfo);
                        
                        break; // Exit the retry loop without counting as inserted
                      } else if (existingDateStr === newDateStr && !traceNumbersMatch) {
                        // Same date but different trace number - this is a different transaction, proceed with increment
                        console.log(`[DIFFERENT TRACE] Same date (${existingDateStr}) but different trace numbers: existing '${existingTraceNumber}' vs new '${currentTraceNumber}'. Creating incremented ID...`);
                        insertAttempts++;
                        
                        // Set duplicate info for statistics
                        duplicateInfo = { increments: insertAttempts, wasSkipped: false };
                        
                        const numericId = parseFloat(originalId);
                        if (!isNaN(numericId)) {
                          const incrementedId = (numericId + (insertAttempts * 0.1)).toFixed(1);
                          finalTransaction.id = incrementedId;
                          console.log(`[DUPLICATE RESOLVED] Incrementing Transaction ID from ${originalId} to ${incrementedId} (attempt ${insertAttempts})`);
                        } else {
                          // For non-numeric IDs, append increment suffix
                          finalTransaction.id = `${originalId}_${insertAttempts}`;
                          console.log(`[DUPLICATE RESOLVED] Appending suffix to Transaction ID: ${originalId} -> ${finalTransaction.id} (attempt ${insertAttempts})`);
                        }
                      } else {
                        // Different date - increment the ID as before
                        console.log(`[DATE MISMATCH] Existing date: ${existingDateStr}, New date: ${newDateStr}. Creating incremented ID...`);
                        insertAttempts++;
                        
                        // Set duplicate info for statistics
                        duplicateInfo = { increments: insertAttempts, wasSkipped: false };
                        
                        const numericId = parseFloat(originalId);
                        if (!isNaN(numericId)) {
                          const incrementedId = (numericId + (insertAttempts * 0.1)).toFixed(1);
                          finalTransaction.id = incrementedId;
                          console.log(`[DUPLICATE RESOLVED] Incrementing Transaction ID from ${originalId} to ${incrementedId} (attempt ${insertAttempts})`);
                        } else {
                          // For non-numeric IDs, append increment suffix
                          finalTransaction.id = `${originalId}_${insertAttempts}`;
                          console.log(`[DUPLICATE RESOLVED] Appending suffix to Transaction ID: ${originalId} -> ${finalTransaction.id} (attempt ${insertAttempts})`);
                        }
                      }
                    }
                  } catch (checkError) {
                    console.error(`Error checking existing transaction: ${checkError.message}`);
                    // Fall back to original incrementation logic
                    insertAttempts++;
                    const numericId = parseFloat(originalId);
                    if (!isNaN(numericId)) {
                      const incrementedId = (numericId + (insertAttempts * 0.1)).toFixed(1);
                      finalTransaction.id = incrementedId;
                      console.log(`[FALLBACK] Incrementing Transaction ID from ${originalId} to ${incrementedId} (attempt ${insertAttempts})`);
                    } else {
                      finalTransaction.id = `${originalId}_${insertAttempts}`;
                      console.log(`[FALLBACK] Appending suffix to Transaction ID: ${originalId} -> ${finalTransaction.id} (attempt ${insertAttempts})`);
                    }
                  }
                } else {
                  // Non-duplicate error, log and rethrow
                  console.error(`\n❌ TRANSACTION INSERT ERROR (Non-duplicate) ❌`);
                  console.error(`CSV Row Number: ${rowCount}`);
                  console.error(`Transaction ID: ${finalTransaction.id}`);
                  console.error(`Error Details: ${insertError.message}`);
                  throw insertError;
                }
              }
            }
            
            if (insertAttempts >= 100) {
              throw new Error(`Failed to insert transaction after 100 attempts. Original ID: ${originalId}`);
            }
          }
          
          console.log(`\n================ TRANSACTION PROCESSING SUMMARY ================`);
          console.log(`Transactions inserted: ${insertedCount}`);
          console.log(`Duplicates skipped: ${skippedDuplicates}`);
          console.log(`Merchants created: ${createdMerchants}`);
          console.log(`Merchants updated: ${updatedMerchants}`);
          
          // Display trace number mapping statistics
          const traceStats = TraceNumberMapper.getStats();
          console.log(`\n--- TRACE NUMBER MAPPING STATISTICS ---`);
          console.log(`Total transactions processed: ${traceStats.totalProcessed}`);
          console.log(`Unique trace numbers found: ${traceStats.totalUniqueTraces}`);
          console.log(`Duplicates handled: ${traceStats.duplicatesFound}`);
          console.log(`Duplication rate: ${traceStats.duplicationRate.toFixed(1)}%`);
          
          if (traceStats.duplicatesFound > 0) {
            console.log(`\n--- DUPLICATE TRACE NUMBER HANDLING ---`);
            console.log(`When duplicates were found, they were automatically incremented:`);
            console.log(`Example: trace123 -> trace123-1, trace123-2, etc.`);
          }
          
          if (createdMerchants > 0) {
            console.log(`\n--- NEWLY CREATED MERCHANTS (${createdMerchants}) ---`);
            createdMerchantsList.forEach((merchant, index) => {
              console.log(`${index + 1}. ID: ${merchant.id} | Name: ${merchant.name} | Source: ${merchant.source}`);
            });
          }
          
          if (updatedMerchants > 0 && updatedMerchants <= 10) {
            console.log(`\n--- UPDATED MERCHANTS (showing first 10 of ${updatedMerchants}) ---`);
            updatedMerchantsList.slice(0, 10).forEach((merchant, index) => {
              console.log(`${index + 1}. ID: ${merchant.id} | Name: ${merchant.name}`);
            });
          } else if (updatedMerchants > 0) {
            console.log(`\n--- UPDATED MERCHANTS (${updatedMerchants} total) ---`);
            console.log(`Too many to display, showing first 10:`);
            updatedMerchantsList.slice(0, 10).forEach((merchant, index) => {
              console.log(`${index + 1}. ID: ${merchant.id} | Name: ${merchant.name}`);
            });
          }
          
          console.log(`\n==============================================================`);
          console.log(`Transaction processing complete. Inserted: ${insertedCount}, Created merchants: ${createdMerchants}, Updated merchants: ${updatedMerchants}`);
          resolve({ rowsProcessed: rowCount, transactionsCreated: insertedCount, errors: errorCount });
        } catch (error) {
          console.error("Error processing transactions in database:", error);
          
          // Enhanced error reporting for database constraint violations
          if (error.code === '23505' && error.constraint === 'transactions_pkey') {
            const duplicateId = error.detail?.match(/Key \(id\)=\(([^)]+)\)/)?.[1];
            console.error(`\n❌ ENHANCED ERROR DETAILS ❌`);
            console.error(`Database Error Code: ${error.code}`);
            console.error(`Constraint: ${error.constraint}`);
            console.error(`Table: ${error.table}`);
            console.error(`Duplicate Transaction ID: ${duplicateId}`);
            console.error(`Error Detail: ${error.detail}`);
            console.error(`\n💡 DUPLICATE KEY GUIDANCE:`);
            console.error(`- Transaction ID '${duplicateId}' already exists in database`);
            console.error(`- This transaction was likely processed in a previous upload`);
            console.error(`- Check if this CSV file was already uploaded before`);
            console.error(`- Remove duplicate rows or use different Transaction IDs`);
            console.error(`- Look for Transaction ID '${duplicateId}' in your CSV file and remove/modify it`);
          }
          
          reject(error);
        }
      });
    });
  }

  // Process terminal file from database content
  async processTerminalFileFromContent(base64Content: string, sourceFileId?: string, sourceFilename?: string): Promise<{ rowsProcessed: number; terminalsCreated: number; terminalsUpdated: number; errors: number }> {
    console.log(`=================== TERMINAL FILE PROCESSING (DATABASE) ===================`);
    console.log(`Processing terminal file from database content`);
    
    // Decode base64 content
    const csvContent = Buffer.from(base64Content, 'base64').toString('utf8');
    console.log(`[TERMINAL-DEBUG] CSV content length: ${csvContent.length} characters`);
    console.log(`[TERMINAL-DEBUG] CSV content lines: ${csvContent.split('\n').length}`);
    console.log(`[TERMINAL-DEBUG] First 500 chars: ${csvContent.substring(0, 500)}`);
    
    // Import field mappings and utility functions
    const { terminalFieldMappings } = await import("@shared/field-mappings");
    
    return new Promise((resolve, reject) => {
      console.log("Starting terminal CSV parsing from content...");
      
      // Parse CSV content using string-based parsing with proper encoding
      const parser = parseCSV({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        relax: true,
        trim: true,
        bom: true,
        max_record_size: 1000000, // Increase max record size
        raw: false,
        encoding: 'utf8'
      });
      
      let terminals: InsertTerminal[] = [];
      let rowCount = 0;
      let errorCount = 0;
      
      parser.on("data", (row) => {
        rowCount++;
        try {
          // Enhanced logging for ALL first 20 rows to debug field mapping - SCREENSHOT BASED
          if (rowCount <= 20) {
            console.log(`\n=== 🔍 TERMINAL DEBUG ROW ${rowCount} ===`);
            console.log(`📋 Raw row data: ${JSON.stringify(row)}`);
            console.log(`📊 Available columns (${Object.keys(row).length} total): ${Object.keys(row).join(", ")}`);
            
            // Check for exact V Number variations from screenshot
            const vNumberVariations = ["V Number", "Terminal #", "VAR Number", "vNumber", "var_number", "V_Number", "VAR_NUMBER", "VNumber", "VARNumber", "Terminal_ID", "TerminalID", "Terminal ID", "TERMINAL_ID"];
            const foundVNumbers = vNumberVariations.filter(key => row[key] !== undefined && row[key] !== "");
            console.log(`🔸 V Number field matches: ${foundVNumbers.length > 0 ? foundVNumbers.map(k => `${k}="${row[k]}"`).join(", ") : "❌ NONE FOUND"}`);
            
            // Check for exact Master MID from screenshot
            const masterMIDVariations = ["POS Merchant #", "Master MID", "masterMID", "pos_merchant", "POS_Merchant_#", "POS_MERCHANT_#", "POSMerchant#"];
            const foundMasterMIDs = masterMIDVariations.filter(key => row[key] !== undefined && row[key] !== "");
            console.log(`🔸 Master MID field matches: ${foundMasterMIDs.length > 0 ? foundMasterMIDs.map(k => `${k}="${row[k]}"`).join(", ") : "❌ NONE FOUND"}`);
            
            // Show actual values being used
            console.log(`✅ Final vNumber value: "${vNumber}"`);
            console.log(`✅ Final masterMID value: "${masterMID}"`);
            console.log(`---`);  
            const midVariations = ["POS Merchant #", "Master MID", "masterMID", "pos_merchant", "POS_Merchant_#", "POS_MERCHANT_#", "POSMerchant#", "POS Merchant Number", "MasterMID", "Master_MID", "MASTER_MID", "Merchant_ID", "MerchantID", "Merchant ID", "MERCHANT_ID", "POS_Merchant_Number"];
            const foundMIDs = midVariations.filter(key => row[key] !== undefined);
            console.log(`Master MID field matches: ${foundMIDs.length > 0 ? foundMIDs.join(", ") : "NONE FOUND"}`);
          } else if (rowCount % 100 === 0) {
            console.log(`\n--- Processing terminal row ${rowCount} (every 100th) ---`);
          }
          
          // Find V Number (VAR Number) - required field - EXACT HEADERS FROM SCREENSHOT
          const vNumber = row["V Number"] || row["VAR Number"] || row["vNumber"] || row["var_number"] || 
                         row["V_Number"] || row["VAR_NUMBER"] || row["VNumber"] || row["VARNumber"] ||
                         row["Terminal_ID"] || row["TerminalID"] || row["Terminal ID"] || row["TERMINAL_ID"] ||
                         row["Terminal #"]; // Exact header from screenshot
          if (!vNumber || !vNumber.trim()) {
            console.log(`[SKIP ROW ${rowCount}] No V Number found. Available keys: ${Object.keys(row).join(", ")}`);
            console.log(`[SKIP ROW ${rowCount}] Row data: ${JSON.stringify(row)}`);
            return;
          }
          
          // Find Master MID (POS Merchant #) - required field to link to merchants - EXACT HEADERS FROM SCREENSHOT
          const masterMID = row["POS Merchant #"] || row["Master MID"] || row["masterMID"] || row["pos_merchant"] ||
                           row["POS_Merchant_#"] || row["POS_MERCHANT_#"] || row["POSMerchant#"] || row["POS Merchant Number"] ||
                           row["MasterMID"] || row["Master_MID"] || row["MASTER_MID"] || row["Merchant_ID"] ||
                           row["MerchantID"] || row["Merchant ID"] || row["MERCHANT_ID"] || row["POS_Merchant_Number"]; // Exact header from screenshot: "POS Merchant #"
          if (!masterMID || !masterMID.trim()) {
            console.log(`[SKIP ROW] No Master MID found in row ${rowCount}, skipping`);
            return;
          }
          
          // Create terminal object with required fields
          const terminalData: Partial<InsertTerminal> = {
            vNumber: vNumber.trim(),
            posMerchantNumber: masterMID.trim(),
            status: "Active", // Default status, will be overridden by Record Status mapping
            // Will add more fields from CSV mapping below
          };
          
          // Apply field mappings - map CSV fields to database fields
          for (const [dbField, csvField] of Object.entries(terminalFieldMappings)) {
            if (csvField && row[csvField] !== undefined && row[csvField] !== null && row[csvField] !== '') {
              console.log(`Mapping ${csvField} -> ${dbField}: ${row[csvField]}`);
              
              // Special handling for MCC field - try multiple possible column names
              if (dbField === 'mcc') {
                // Try alternative MCC column names if primary one is empty
                const mccValue = row[csvField] || row["Terminal Visa MCC"] || row["Visa MCC"] || row["MCC"] || row["MC Code"] || row["Merchant Category Code"] || row["Category Code"];
                if (mccValue && mccValue.toString().trim()) {
                  terminalData.mcc = mccValue.toString().trim();
                  console.log(`MCC mapped from column "${csvField}" or alternative: ${mccValue}`);
                }
                continue; // Skip the generic field mapping below for MCC
              }
              
              // Special handling for Record Status field to map to terminal status
              if (dbField === 'recordStatus') {
                const rawStatus = row[csvField];
                if (rawStatus) {
                  const statusValue = rawStatus.toString().trim().toLowerCase();
                  if (statusValue === 'open') {
                    terminalData.status = 'Active';
                    console.log(`Record Status mapped: "${rawStatus}" -> "Active"`);
                  } else if (statusValue === 'closed') {
                    terminalData.status = 'Inactive';
                    console.log(`Record Status mapped: "${rawStatus}" -> "Inactive"`);
                  } else {
                    terminalData.status = 'Active'; // Default to Active for unknown statuses
                    console.log(`Unknown Record Status "${rawStatus}", defaulting to "Active"`);
                  }
                }
                // Store the raw record status in recordStatus field
                terminalData[dbField as keyof InsertTerminal] = row[csvField].toString().trim() as any;
              }
              // Handle date fields
              else if (dbField === 'boardDate') {
                try {
                  if (row[csvField] && row[csvField].trim() !== '') {
                    const parsedDate = new Date(row[csvField]);
                    if (!isNaN(parsedDate.getTime())) {
                      terminalData[dbField as keyof InsertTerminal] = parsedDate as any;
                      console.log(`Parsed date ${csvField}: ${row[csvField]} -> ${parsedDate}`);
                    }
                  }
                } catch (e) {
                  console.warn(`Failed to parse date: ${row[csvField]}, skipping field`);
                }
              } else {
                // Handle regular text fields
                terminalData[dbField as keyof InsertTerminal] = row[csvField].toString().trim() as any;
              }
            }
          }
          
          // Set default terminal type if not provided
          if (!terminalData.terminalType) {
            terminalData.terminalType = "unknown";
          }
          
          // DECOMMISSION DETECTION: Check if terminal name indicates decommissioned status
          const deviceName = (terminalData as any).deviceName || terminalData.businessName || terminalData.dbaName;
          if (deviceName && isTerminalDecommissioned(deviceName)) {
            terminalData.status = "Decommissioned";
            console.log(`🔍 DECOMMISSION DETECTED: Terminal "${deviceName}" marked as Decommissioned due to decommission-related keywords`);
          }
          
          console.log(`Mapped terminal:`, JSON.stringify(terminalData));
          terminals.push(terminalData as InsertTerminal);
          
        } catch (error) {
          errorCount++;
          console.error(`Error processing terminal row ${rowCount}:`, error);
          console.error("Row data:", JSON.stringify(row));
        }
      });
      
      parser.on("error", (error) => {
        console.error("CSV parsing error:", error);
        reject(error);
      });
      
      parser.on("end", async () => {
        console.log(`=================== TERMINAL CSV PROCESSING SUMMARY ===================`);
        console.log(`CSV parsing complete. Processed ${rowCount} rows with ${errorCount} errors.`);
        console.log(`Processing ${terminals.length} valid terminals...`);
        console.log(`=============================================================`);
        
        try {
          let createdCount = 0;
          let updatedCount = 0;
          
          // Process each terminal
          for (const terminal of terminals) {
            try {
              // @ENVIRONMENT-CRITICAL - Terminal existence check during CSV processing
              // @DEPLOYMENT-CHECK - Uses environment-aware table naming for API terminals
              const terminalsTableName = getTableName('api_terminals');
              
              // Check if terminal already exists (by V Number)
              const existingTerminalResult = await pool.query(`SELECT * FROM ${terminalsTableName} WHERE v_number = $1 LIMIT 1`, [terminal.vNumber]);
              const existingTerminal = existingTerminalResult.rows[0];
              
              if (existingTerminal) {
                // @ENVIRONMENT-CRITICAL - Terminal update during CSV processing
                // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                const updateTerminalQuery = `
                  UPDATE ${terminalsTableName} 
                  SET v_number = $2, pos_merchant_number = $3, status = $4, mcc = $5, terminal_type = $6,
                      board_date = $7, record_status = $8, business_name = $9, dba_name = $10,
                      merchant_address = $11, city = $12, state = $13, zip_code = $14, country = $15,
                      phone = $16, updated_at = $17, last_update = $18, update_source = $19, updated_by = $20
                  WHERE id = $1
                `;
                
                await pool.query(updateTerminalQuery, [
                  existingTerminal.id, terminal.vNumber, terminal.posMerchantNumber, terminal.status,
                  terminal.mcc, terminal.terminalType, terminal.boardDate, terminal.recordStatus,
                  terminal.businessName, terminal.dbaName, terminal.merchantAddress, terminal.city,
                  terminal.state, terminal.zipCode, terminal.country, terminal.phone,
                  new Date(), new Date(), sourceFilename ? `File: ${sourceFilename}` : "System Import", "System Import"
                ]);
                
                updatedCount++;
                console.log(`Updated terminal: ${terminal.vNumber} -> ${terminal.posMerchantNumber}`);
              } else {
                // @ENVIRONMENT-CRITICAL - New terminal creation during CSV processing
                // @DEPLOYMENT-CHECK - Uses environment-aware table naming
                const insertTerminalQuery = `
                  INSERT INTO ${terminalsTableName} (
                    v_number, pos_merchant_number, status, mcc, terminal_type, board_date, record_status,
                    business_name, dba_name, merchant_address, city, state, zip_code, country, phone,
                    created_at, updated_at, last_update, update_source, created_by, updated_by
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
                `;
                
                await pool.query(insertTerminalQuery, [
                  terminal.vNumber, terminal.posMerchantNumber, terminal.status, terminal.mcc,
                  terminal.terminalType, terminal.boardDate, terminal.recordStatus, terminal.businessName,
                  terminal.dbaName, terminal.merchantAddress, terminal.city, terminal.state,
                  terminal.zipCode, terminal.country, terminal.phone, new Date(), new Date(), new Date(),
                  sourceFilename ? `File: ${sourceFilename}` : "System Import", "System Import", "System Import"
                ]);
                
                createdCount++;
                console.log(`Created terminal: ${terminal.vNumber} -> ${terminal.posMerchantNumber}`);
              }
            } catch (insertError) {
              console.error(`Error processing terminal ${terminal.vNumber}:`, insertError);
              errorCount++;
            }
          }
          
          console.log(`\n================ TERMINAL PROCESSING SUMMARY ================`);
          console.log(`Terminals created: ${createdCount}`);
          console.log(`Terminals updated: ${updatedCount}`);
          console.log(`Total processed: ${createdCount + updatedCount}`);
          console.log(`Errors: ${errorCount}`);
          console.log(`==============================================================`);
          
          resolve({ 
            rowsProcessed: rowCount, 
            terminalsCreated: createdCount, 
            terminalsUpdated: updatedCount,
            errors: errorCount 
          });
        } catch (error) {
          console.error("Error processing terminals in database:", error);
          reject(error);
        }
      });
      
      // Start parsing
      parser.write(csvContent);
      parser.end();
    });
  }

  // Generate CSV export of all transactions
  async generateTransactionsExport(): Promise<string> {
    try {
      // @ENVIRONMENT-CRITICAL - Transaction export data retrieval
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const transactionsTableName = getTableName('transactions');
      
      // Get all transactions using raw SQL
      const transactionsResult = await pool.query(`SELECT id, merchant_id, amount, date, type, description FROM ${transactionsTableName} ORDER BY date DESC`);
      const transactions = transactionsResult.rows;
        
      // Create a temporary file to store the CSV
      const tempFilePath = path.join(os.tmpdir(), `transactions_export_${Date.now()}.csv`);
      const csvFileStream = fs.createWriteStream(tempFilePath);
      
      // Format transactions for CSV
      const formattedTransactions = transactions.map((transaction: any) => ({
        Transaction_ID: transaction.id,
        Merchant_ID: transaction.merchant_id,
        Merchant_Name: transaction.merchant_name || 'Unknown',
        Amount: transaction.amount,
        Date: new Date(transaction.date).toISOString().split("T")[0],
        Type: transaction.type,
        Description: transaction.description
      }));
      
      // Generate CSV file
      return new Promise((resolve, reject) => {
        formatCSV(formattedTransactions)
          .pipe(csvFileStream)
          .on("finish", () => resolve(tempFilePath))
          .on("error", reject);
      });
    } catch (error) {
      console.error("Error generating transactions export:", error);
      throw new Error("Failed to generate transactions export");
    }
  }

  // Generate CSV export of all merchants
  async generateMerchantsExport(): Promise<string> {
    try {
      // @ENVIRONMENT-CRITICAL - Merchant export data retrieval
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const merchantsTableName = getTableName('merchants');
      
      // Get all merchants using raw SQL
      const merchantsResult = await pool.query(`SELECT * FROM ${merchantsTableName} ORDER BY name ASC`);
      const merchants = merchantsResult.rows;
      
      // Create a temporary file to store the CSV
      const tempFilePath = path.join(os.tmpdir(), `merchants_export_${Date.now()}.csv`);
      const csvFileStream = fs.createWriteStream(tempFilePath);
      
      // Format merchants for CSV
      const formattedMerchants = merchants.map(merchant => ({
        Merchant_ID: merchant.id,
        Name: merchant.name,
        Status: merchant.status,
        Address: merchant.address || "",
        City: merchant.city || "",
        State: merchant.state || "",
        Zip: merchant.zipCode || "",
        Category: merchant.category || "",
        Created_Date: new Date(merchant.createdAt).toISOString().split("T")[0],
        Last_Upload: merchant.lastUploadDate 
          ? new Date(merchant.lastUploadDate).toISOString().split("T")[0] 
          : "Never"
      }));
      
      // Generate CSV file
      return new Promise((resolve, reject) => {
        formatCSV(formattedMerchants)
          .pipe(csvFileStream)
          .on("finish", () => resolve(tempFilePath))
          .on("error", reject);
      });
    } catch (error) {
      console.error("Error generating merchants export:", error);
      throw new Error("Failed to generate merchants export");
    }
  }
  


  // Helper method to ensure audit log table exists
  private async ensureAuditLogTableExists(tableName: string): Promise<void> {
    try {
      // Check if table exists first
      const tableExists = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = $1
        )
      `, [tableName]);
      
      if (!tableExists.rows[0].exists) {
        console.log(`[AUDIT LOG] Creating missing audit logs table: ${tableName}`);
        
        // Create the audit logs table with the correct schema
        await pool.query(`
          CREATE TABLE ${tableName} (
            id SERIAL PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL,
            user_id INTEGER,
            username TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
            old_values JSONB,
            new_values JSONB,
            changed_fields TEXT[],
            ip_address TEXT,
            user_agent TEXT,
            notes TEXT
          )
        `);
        
        // Create indexes for better performance
        await pool.query(`CREATE INDEX ${tableName}_entity_type_idx ON ${tableName}(entity_type)`);
        await pool.query(`CREATE INDEX ${tableName}_entity_id_idx ON ${tableName}(entity_id)`);
        await pool.query(`CREATE INDEX ${tableName}_timestamp_idx ON ${tableName}(timestamp)`);
        await pool.query(`CREATE INDEX ${tableName}_user_id_idx ON ${tableName}(user_id)`);
        
        console.log(`[AUDIT LOG] Successfully created audit logs table: ${tableName}`);
      }
    } catch (error) {
      console.error(`[AUDIT LOG] Error ensuring table exists:`, error);
      // Don't throw error here - let the audit log creation proceed and fail gracefully
    }
  }

  // Create audit log entry
  async createAuditLog(auditLogData: InsertAuditLog): Promise<AuditLog> {
    try {
      console.log(`[AUDIT LOG] Creating audit log for ${auditLogData.username}:`, auditLogData.action);
      
      // Use environment-aware table name for audit logs
      const tableName = getTableName("audit_logs");
      console.log(`[AUDIT LOG] Using table: ${tableName} in ${process.env.NODE_ENV || 'production'} environment`);
      
      // First, ensure the audit logs table exists
      await this.ensureAuditLogTableExists(tableName);
      
      // Use raw SQL to insert into the correct environment table
      const result = await pool.query(`
        INSERT INTO ${tableName} (
          entity_type, entity_id, action, user_id, username, 
          timestamp, old_values, new_values, changed_fields, 
          ip_address, user_agent, notes
        ) VALUES (
          $1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10, $11
        ) RETURNING *
      `, [
        auditLogData.entityType,
        auditLogData.entityId,
        auditLogData.action,
        auditLogData.userId,
        auditLogData.username,
        JSON.stringify(auditLogData.oldValues || {}),
        JSON.stringify(auditLogData.newValues || {}),
        auditLogData.changedFields || [],
        auditLogData.ipAddress,
        auditLogData.userAgent,
        auditLogData.notes
      ]);
      
      const auditLog = result.rows[0];
      console.log(`[AUDIT LOG] Successfully created audit log with ID: ${auditLog.id} in table ${tableName}`);
      
      return auditLog;
    } catch (error) {
      console.error(`[AUDIT LOG] Error creating audit log:`, error);
      throw new Error(`Failed to create audit log: ${error}`);
    }
  }

  // Create security log for authentication and access events
  async createSecurityLog(securityLogData: InsertSecurityLog): Promise<SecurityLog> {
    try {
      console.log(`[SECURITY LOG] Creating security log:`, securityLogData);
      
      // Use environment-aware table name for security logs
      const tableName = getTableName("security_logs");
      
      // Use raw SQL to insert into the correct environment table
      // Include required fields: severity and message
      const severity = securityLogData.eventType === 'login' ? 'info' : 'warning';
      const message = `${securityLogData.result === 'success' ? 'Successful' : 'Failed'} ${securityLogData.eventType} attempt`;
      
      const result = await pool.query(`
        INSERT INTO ${tableName} (
          event_type, result, user_id, username, timestamp, ip_address, user_agent, details, severity, message, source, session_id
        ) VALUES (
          $1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11
        ) RETURNING *
      `, [
        securityLogData.eventType,
        securityLogData.result,
        securityLogData.userId,
        securityLogData.username,
        securityLogData.ipAddress,
        securityLogData.userAgent,
        JSON.stringify(securityLogData.details || {}),
        severity,
        message,
        'authentication',
        securityLogData.details?.sessionId || null
      ]);
      
      const securityLog = result.rows[0];
      console.log(`[SECURITY LOG] Successfully created security log with ID: ${securityLog.id}`);
      
      return securityLog;
    } catch (error) {
      console.error(`[SECURITY LOG] Error creating security log:`, error);
      throw new Error(`Failed to create security log: ${error}`);
    }
  }
  
  // Format logs to CSV for export
  formatLogsToCSV(logs: any[]): string {
    if (!logs || logs.length === 0) return '';
    
    const headers = Object.keys(logs[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of logs) {
      const values = headers.map(header => {
        let val = row[header] ?? '';
        
        // Handle JSONB fields
        if (typeof val === 'object' && val !== null) {
          val = JSON.stringify(val);
        }
        
        // Escape commas and quotes
        return typeof val === 'string' && (val.includes(',') || val.includes('"')) 
          ? `"${val.replace(/"/g, '""')}"` 
          : val;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }
  
  // Get audit logs with pagination and filtering
  async getAuditLogs(params: any = {}): Promise<AuditLog[]> {
    try {
      const { 
        page = 1, 
        limit = 20, 
        startDate, 
        endDate, 
        entityType, 
        entityId, 
        username,
        action
      } = params;
      
      // Calculate offset for pagination
      const offset = (page - 1) * limit;
      
      // Build query conditions
      let conditions = [];
      
      if (entityType) {
        conditions.push(eq(auditLogs.entityType, entityType));
      }
      
      if (entityId) {
        conditions.push(eq(auditLogs.entityId, entityId));
      }
      
      if (username) {
        conditions.push(eq(auditLogs.username, username));
      }
      
      if (action) {
        conditions.push(eq(auditLogs.action, action));
      }
      
      if (startDate && endDate) {
        conditions.push(between(auditLogs.timestamp, new Date(startDate), new Date(endDate)));
      } else if (startDate) {
        conditions.push(gte(auditLogs.timestamp, new Date(startDate)));
      } else if (endDate) {
        conditions.push(sql`${auditLogs.timestamp} <= ${new Date(endDate)}`);
      }
      
      // Query with filters if provided
      const whereClause = conditions.length > 0 
        ? and(...conditions)
        : undefined;
        
      // @ENVIRONMENT-CRITICAL - Audit logs query with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses getTableName() for dev/prod separation
      const auditLogsTableName = getTableName('audit_logs');
      
      // Build SQL query conditions manually for environment awareness
      let whereSQL = '';
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      if (entityType) {
        whereSQL += `${whereSQL ? ' AND ' : ''}entity_type = $${paramIndex++}`;
        queryParams.push(entityType);
      }
      
      if (entityId) {
        whereSQL += `${whereSQL ? ' AND ' : ''}entity_id = $${paramIndex++}`;
        queryParams.push(entityId);
      }
      
      if (username) {
        whereSQL += `${whereSQL ? ' AND ' : ''}username = $${paramIndex++}`;
        queryParams.push(username);
      }
      
      if (action) {
        whereSQL += `${whereSQL ? ' AND ' : ''}action = $${paramIndex++}`;
        queryParams.push(action);
      }
      
      if (startDate && endDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp BETWEEN $${paramIndex++} AND $${paramIndex++}`;
        queryParams.push(new Date(startDate), new Date(endDate));
      } else if (startDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp >= $${paramIndex++}`;
        queryParams.push(new Date(startDate));
      } else if (endDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp <= $${paramIndex++}`;
        queryParams.push(new Date(endDate));
      }
      
      // Execute main query with raw SQL for environment awareness
      const auditQuery = `
        SELECT * FROM ${auditLogsTableName}
        ${whereSQL ? `WHERE ${whereSQL}` : ''}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      queryParams.push(limit, offset);
      
      const result = await pool.query(auditQuery, queryParams);
      return result.rows;
    } catch (error) {
      console.error('Error getting audit logs:', error);
      return [];
    }
  }
  
  // Get count of audit logs with filters
  async getAuditLogsCount(params: any = {}): Promise<number> {
    try {
      const { 
        startDate, 
        endDate, 
        entityType, 
        entityId, 
        username,
        action
      } = params;
      
      // Build query conditions
      let conditions = [];
      
      if (entityType) {
        conditions.push(eq(auditLogs.entityType, entityType));
      }
      
      if (entityId) {
        conditions.push(eq(auditLogs.entityId, entityId));
      }
      
      if (username) {
        conditions.push(eq(auditLogs.username, username));
      }
      
      if (action) {
        conditions.push(eq(auditLogs.action, action));
      }
      
      if (startDate && endDate) {
        conditions.push(between(auditLogs.timestamp, new Date(startDate), new Date(endDate)));
      } else if (startDate) {
        conditions.push(gte(auditLogs.timestamp, new Date(startDate)));
      } else if (endDate) {
        conditions.push(sql`${auditLogs.timestamp} <= ${new Date(endDate)}`);
      }
      
      // Query with filters if provided
      const whereClause = conditions.length > 0 
        ? and(...conditions)
        : undefined;
        
      // @ENVIRONMENT-CRITICAL - Audit logs count query with environment-aware table naming  
      // @DEPLOYMENT-CHECK - Uses getTableName() for dev/prod separation
      const auditLogsTableName = getTableName('audit_logs');
      
      // Build SQL query conditions manually for environment awareness
      let whereSQL = '';
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      if (entityType) {
        whereSQL += `${whereSQL ? ' AND ' : ''}entity_type = $${paramIndex++}`;
        queryParams.push(entityType);
      }
      
      if (entityId) {
        whereSQL += `${whereSQL ? ' AND ' : ''}entity_id = $${paramIndex++}`;
        queryParams.push(entityId);
      }
      
      if (username) {
        whereSQL += `${whereSQL ? ' AND ' : ''}username = $${paramIndex++}`;
        queryParams.push(username);
      }
      
      if (action) {
        whereSQL += `${whereSQL ? ' AND ' : ''}action = $${paramIndex++}`;
        queryParams.push(action);
      }
      
      if (startDate && endDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp BETWEEN $${paramIndex++} AND $${paramIndex++}`;
        queryParams.push(new Date(startDate), new Date(endDate));
      } else if (startDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp >= $${paramIndex++}`;
        queryParams.push(new Date(startDate));
      } else if (endDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp <= $${paramIndex++}`;
        queryParams.push(new Date(endDate));
      }
      
      const countQuery = `
        SELECT COUNT(*) as count FROM ${auditLogsTableName}
        ${whereSQL ? `WHERE ${whereSQL}` : ''}
      `;
      
      const countResult = await pool.query(countQuery, queryParams);
      return parseInt(countResult.rows[0].count);
    } catch (error) {
      console.error('Error getting audit logs count:', error);
      return 0;
    }
  }
  
  // Get system logs with pagination and filtering
  async getSystemLogs(params: any = {}): Promise<any> {
    try {
      const { 
        page = 1, 
        limit = 20, 
        startDate, 
        endDate, 
        level,
        source
      } = params;
      
      // Calculate offset for pagination
      const offset = (page - 1) * limit;
      
      // Build query conditions
      let conditions = [];
      
      if (level) {
        conditions.push(eq(systemLogs.level, level));
      }
      
      if (source) {
        conditions.push(eq(systemLogs.source, source));
      }
      
      if (startDate && endDate) {
        conditions.push(between(systemLogs.timestamp, new Date(startDate), new Date(endDate)));
      } else if (startDate) {
        conditions.push(gte(systemLogs.timestamp, new Date(startDate)));
      } else if (endDate) {
        conditions.push(sql`${systemLogs.timestamp} <= ${new Date(endDate)}`);
      }
      
      // Query with filters if provided
      const whereClause = conditions.length > 0 
        ? and(...conditions)
        : undefined;
        
      // @ENVIRONMENT-CRITICAL - System logs query with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses getTableName() for dev/prod separation
      const systemLogsTableName = getTableName('system_logs');
      
      // Build SQL query conditions manually for environment awareness
      let whereSQL = '';
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      if (level) {
        whereSQL += `${whereSQL ? ' AND ' : ''}level = $${paramIndex++}`;
        queryParams.push(level);
      }
      
      if (source) {
        whereSQL += `${whereSQL ? ' AND ' : ''}source = $${paramIndex++}`;
        queryParams.push(source);
      }
      
      if (startDate && endDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp BETWEEN $${paramIndex++} AND $${paramIndex++}`;
        queryParams.push(new Date(startDate), new Date(endDate));
      } else if (startDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp >= $${paramIndex++}`;
        queryParams.push(new Date(startDate));
      } else if (endDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp <= $${paramIndex++}`;
        queryParams.push(new Date(endDate));
      }
      
      // Execute main query with raw SQL for environment awareness
      const logsQuery = `
        SELECT * FROM ${systemLogsTableName}
        ${whereSQL ? `WHERE ${whereSQL}` : ''}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      queryParams.push(limit, offset);
      
      const logsResult = await pool.query(logsQuery, queryParams);
      const logs = logsResult.rows;
      
      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as count FROM ${systemLogsTableName}
        ${whereSQL ? `WHERE ${whereSQL}` : ''}
      `;
      const countResult = await pool.query(countQuery, queryParams.slice(0, -2)); // Remove limit/offset params
      const count = parseInt(countResult.rows[0].count);
      
      // Return formatted response with pagination
      return {
        logs,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error getting system logs:', error);
      return { logs: [], pagination: { currentPage: 1, totalPages: 0, totalItems: 0, itemsPerPage: limit } };
    }
  }
  
  // @ENVIRONMENT-CRITICAL - Direct method to get system logs without complex filtering
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getSystemLogsDirectly(): Promise<any[]> {
    try {
      const systemLogsTableName = getTableName('system_logs');
      const result = await pool.query(`
        SELECT * FROM ${systemLogsTableName} 
        ORDER BY timestamp DESC
        LIMIT 20
      `);
      
      const logs = result.rows;
      console.log(`Found ${logs.length} system logs directly from database`);
      
      if (logs.length > 0) {
        console.log('Sample system log:', JSON.stringify(logs[0]).substring(0, 200));
      }
      
      return logs;
    } catch (error) {
      console.error('Error getting system logs directly:', error);
      return [];
    }
  }

  // Get count of system logs with filters
  async getSystemLogsCount(params: any = {}): Promise<number> {
    try {
      const { 
        startDate, 
        endDate, 
        level,
        source
      } = params;
      
      // Build query conditions
      let conditions = [];
      
      if (level) {
        conditions.push(eq(systemLogs.level, level));
      }
      
      if (source) {
        conditions.push(eq(systemLogs.source, source));
      }
      
      if (startDate && endDate) {
        conditions.push(between(systemLogs.timestamp, new Date(startDate), new Date(endDate)));
      } else if (startDate) {
        conditions.push(gte(systemLogs.timestamp, new Date(startDate)));
      } else if (endDate) {
        conditions.push(sql`${systemLogs.timestamp} <= ${new Date(endDate)}`);
      }
      
      // Query with filters if provided
      const whereClause = conditions.length > 0 
        ? and(...conditions)
        : undefined;
        
      // @ENVIRONMENT-CRITICAL - System logs count query with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const systemLogsTableName = getTableName('system_logs');
      
      // Build WHERE clause for raw SQL count
      let sqlWhereClause = '1=1';
      const queryParams = [];
      
      if (startDate && endDate) {
        sqlWhereClause += ` AND timestamp BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
        queryParams.push(new Date(startDate), new Date(endDate));
      } else if (startDate) {
        sqlWhereClause += ` AND timestamp >= $${queryParams.length + 1}`;
        queryParams.push(new Date(startDate));
      } else if (endDate) {
        sqlWhereClause += ` AND timestamp <= $${queryParams.length + 1}`;
        queryParams.push(new Date(endDate));
      }
      
      // Execute count query
      const countResult = await pool.query(`
        SELECT COUNT(*) as count FROM ${systemLogsTableName}
        WHERE ${sqlWhereClause}
      `, queryParams);
      
      return parseInt(countResult.rows[0].count);
    } catch (error) {
      console.error('Error getting system logs count:', error);
      return 0;
    }
  }
  
  // Get security logs with pagination and filtering
  async getSecurityLogs(params: any = {}): Promise<any> {
    try {
      const { 
        page = 1, 
        limit = 20, 
        startDate, 
        endDate, 
        eventType,
        username,
        resultFilter
      } = params;
      
      // Calculate offset for pagination
      const offset = (page - 1) * limit;
      
      // Build query conditions
      let conditions = [];
      
      if (eventType) {
        conditions.push(eq(securityLogs.eventType, eventType));
      }
      
      if (username) {
        conditions.push(eq(securityLogs.username, username));
      }
      
      if (resultFilter && securityLogs.result) {
        conditions.push(eq(securityLogs.result, resultFilter));
      }
      
      if (startDate && endDate) {
        conditions.push(between(securityLogs.timestamp, new Date(startDate), new Date(endDate)));
      } else if (startDate) {
        conditions.push(gte(securityLogs.timestamp, new Date(startDate)));
      } else if (endDate) {
        conditions.push(sql`${securityLogs.timestamp} <= ${new Date(endDate)}`);
      }
      
      // Query with filters if provided
      const whereClause = conditions.length > 0 
        ? and(...conditions)
        : undefined;
        
      // @ENVIRONMENT-CRITICAL - Security logs query with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const securityLogsTableName = getTableName('security_logs');
      
      // Build WHERE clause for raw SQL
      let sqlWhereClause = '1=1';
      const queryParams = [];
      
      if (eventType) {
        sqlWhereClause += ` AND event_type = $${queryParams.length + 1}`;
        queryParams.push(eventType);
      }
      
      if (username) {
        sqlWhereClause += ` AND username = $${queryParams.length + 1}`;
        queryParams.push(username);
      }
      
      if (resultFilter) {
        sqlWhereClause += ` AND result = $${queryParams.length + 1}`;
        queryParams.push(resultFilter);
      }
      
      if (startDate && endDate) {
        sqlWhereClause += ` AND timestamp BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
        queryParams.push(new Date(startDate), new Date(endDate));
      } else if (startDate) {
        sqlWhereClause += ` AND timestamp >= $${queryParams.length + 1}`;
        queryParams.push(new Date(startDate));
      } else if (endDate) {
        sqlWhereClause += ` AND timestamp <= $${queryParams.length + 1}`;
        queryParams.push(new Date(endDate));
      }
      
      // Execute main query
      const logsResult = await pool.query(`
        SELECT * FROM ${securityLogsTableName}
        WHERE ${sqlWhereClause}
        ORDER BY timestamp DESC
        LIMIT $${queryParams.length + 1}
        OFFSET $${queryParams.length + 2}
      `, [...queryParams, limit, offset]);
      
      // Get total count for pagination
      const countResult = await pool.query(`
        SELECT COUNT(*) as count FROM ${securityLogsTableName}
        WHERE ${sqlWhereClause}
      `, queryParams);
      
      const logs = logsResult.rows;
      const count = parseInt(countResult.rows[0].count);
      
      // Return formatted response with pagination
      return {
        logs,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(Number(count) / limit),
          totalItems: Number(count),
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error getting security logs:', error);
      return { logs: [], pagination: { currentPage: 1, totalPages: 0, totalItems: 0, itemsPerPage: limit } };
    }
  }
  
  // Get count of security logs with filters
  async getSecurityLogsCount(params: any = {}): Promise<number> {
    try {
      const { 
        startDate, 
        endDate, 
        eventType,
        username,
        result: resultParam
      } = params;
      
      // Build query conditions
      let conditions = [];
      
      if (eventType) {
        conditions.push(eq(securityLogs.eventType, eventType));
      }
      
      if (username) {
        conditions.push(eq(securityLogs.username, username));
      }
      
      if (resultParam) {
        conditions.push(eq(securityLogs.result, resultParam));
      }
      
      if (startDate && endDate) {
        conditions.push(between(securityLogs.timestamp, new Date(startDate), new Date(endDate)));
      } else if (startDate) {
        conditions.push(gte(securityLogs.timestamp, new Date(startDate)));
      } else if (endDate) {
        conditions.push(sql`${securityLogs.timestamp} <= ${new Date(endDate)}`);
      }
      
      // Query with filters if provided
      const whereClause = conditions.length > 0 
        ? and(...conditions)
        : undefined;
        
      // @ENVIRONMENT-CRITICAL - Security logs count query with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses getTableName() for dev/prod separation  
      const securityLogsTableName = getTableName('security_logs');
      
      // Build SQL query conditions manually for environment awareness
      let whereSQL = '';
      const queryParams: any[] = [];
      let paramIndex = 1;
      
      if (eventType) {
        whereSQL += `${whereSQL ? ' AND ' : ''}event_type = $${paramIndex++}`;
        queryParams.push(eventType);
      }
      
      if (username) {
        whereSQL += `${whereSQL ? ' AND ' : ''}username = $${paramIndex++}`;
        queryParams.push(username);
      }
      
      if (resultParam) {
        whereSQL += `${whereSQL ? ' AND ' : ''}result = $${paramIndex++}`;
        queryParams.push(resultParam);
      }
      
      if (startDate && endDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp BETWEEN $${paramIndex++} AND $${paramIndex++}`;
        queryParams.push(new Date(startDate), new Date(endDate));
      } else if (startDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp >= $${paramIndex++}`;
        queryParams.push(new Date(startDate));
      } else if (endDate) {
        whereSQL += `${whereSQL ? ' AND ' : ''}timestamp <= $${paramIndex++}`;
        queryParams.push(new Date(endDate));
      }
      
      const countQuery = `
        SELECT COUNT(*) as count FROM ${securityLogsTableName}
        ${whereSQL ? `WHERE ${whereSQL}` : ''}
      `;
      
      const countResult = await pool.query(countQuery, queryParams);
      return parseInt(countResult.rows[0].count);
    } catch (error) {
      console.error('Error getting security logs count:', error);
      return 0;
    }
  }
  
  // Get complete audit history for a specific entity
  async getEntityAuditHistory(entityType: string, entityId: string): Promise<AuditLog[]> {
    try {
      // @ENVIRONMENT-CRITICAL - Audit history retrieval
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const auditLogsTableName = getTableName('audit_logs');
      
      const result = await pool.query(`
        SELECT * FROM ${auditLogsTableName} 
        WHERE entity_type = $1 AND entity_id = $2 
        ORDER BY timestamp DESC
      `, [entityType, entityId]);
      
      return result.rows;
    } catch (error) {
      console.error(`Error fetching audit history for ${entityType} ${entityId}:`, error);
      throw new Error(`Failed to retrieve audit history for ${entityType}`);
    }
  }
  
  /**
   * Log a general system error to the audit log
   * This method can be called from any part of the application to log errors
   * @param errorMessage The error message to log
   * @param errorDetails Additional error details or exception information
   * @param source The source of the error (component, module, etc.)
   * @param username The username of the user who triggered the error (if applicable)
   * @returns The created audit log entry
   */
  async logSystemError(
    errorMessage: string, 
    errorDetails: any = null, 
    source: string = 'System', 
    username: string = 'System'
  ): Promise<AuditLog> {
    try {
      // Create a unique error ID for reference
      const errorId = `ERR${Date.now()}${Math.floor(Math.random() * 1000)}`;
      
      // Prepare audit log data
      const auditLogData: InsertAuditLog = {
        entityType: 'system',
        entityId: errorId,
        action: 'error',
        userId: null,
        username: username,
        oldValues: null,
        newValues: {
          errorMessage,
          errorDetails: this.filterSensitiveData(errorDetails),
          source,
          timestamp: new Date().toISOString()
        },
        changedFields: [],
        notes: `System error in ${source}: ${errorMessage}`
      };
      
      // Create the audit log entry
      const auditLog = await this.createAuditLog(auditLogData);
      console.error(`[SYSTEM ERROR] ${source}: ${errorMessage}`, errorDetails ? '\nDetails:' : '', errorDetails || '');
      
      return auditLog;
    } catch (error) {
      // If we can't log to the audit system, at least log to console
      console.error('Failed to log system error to audit log:', error);
      console.error('Original error:', errorMessage, errorDetails);
      
      // Return a minimal object to prevent further errors
      return {
        id: 0,
        entityType: 'system',
        entityId: 'error-logging-failed',
        action: 'error',
        userId: null,
        username: username,
        timestamp: new Date(),
        oldValues: null,
        newValues: { errorMessage, errorDetails },
        changedFields: [],
        notes: errorMessage
      };
    }
  }

  // Enhanced file processing methods for real-time monitoring
  async getQueuedFiles(): Promise<any[]> {
    try {
      const uploadsTableName = getTableName('uploaded_files');
      const result = await pool.query(`
        SELECT 
          id,
          original_filename,
          file_type,
          uploaded_at,
          processing_status,
          processing_started_at
        FROM ${uploadsTableName}
        WHERE deleted = false 
          AND (processing_status = 'queued' OR processing_status IS NULL)
          AND processed = false
        ORDER BY uploaded_at ASC
      `);
      
      return result.rows.map(row => ({
        id: row.id,
        originalFilename: row.original_filename,
        fileType: row.file_type,
        uploadedAt: row.uploaded_at,
        processingStatus: row.processing_status || 'queued',
        processingStartedAt: row.processing_started_at
      }));
    } catch (error) {
      console.error('Error getting queued files:', error);
      return [];
    }
  }

  async getRecentlyProcessedFiles(limit: number): Promise<any[]> {
    try {
      const uploadsTableName = getTableName('uploaded_files');
      const result = await pool.query(`
        SELECT 
          id,
          original_filename,
          file_type,
          uploaded_at,
          processed_at,
          processing_status,
          processing_completed_at
        FROM ${uploadsTableName}
        WHERE deleted = false 
          AND processed = true
          AND processing_completed_at IS NOT NULL
        ORDER BY processing_completed_at DESC
        LIMIT $1
      `, [limit]);
      
      return result.rows.map(row => ({
        id: row.id,
        originalFilename: row.original_filename,
        fileType: row.file_type,
        uploadedAt: row.uploaded_at,
        processedAt: row.processed_at,
        processingStatus: row.processing_status || 'completed',
        processingCompletedAt: row.processing_completed_at
      }));
    } catch (error) {
      console.error('Error getting recently processed files:', error);
      return [];
    }
  }

  // Terminal operations
  async getTerminals(): Promise<Terminal[]> {
    // @ENVIRONMENT-CRITICAL - Terminal data retrieval
    // @DEPLOYMENT-CHECK - Uses environment-aware table naming for API terminals
    const terminalsTableName = getTableName('api_terminals');
    
    console.log(`[TERMINALS-STORAGE] Querying table: ${terminalsTableName}`);
    
    try {
      const result = await pool.query(`SELECT * FROM ${terminalsTableName} ORDER BY v_number ASC`);
      console.log(`[TERMINALS-STORAGE] Found ${result.rows.length} terminals in ${terminalsTableName}`);
      
      // Transform snake_case field names to camelCase to match frontend expectations
      return result.rows.map(row => ({
        id: row.id,
        vNumber: row.v_number,
        posMerchantNumber: row.pos_merchant_number,
        bin: row.bin,
        dbaName: row.dba_name,
        dailyAuth: row.daily_auth,
        dialPay: row.dial_pay,
        encryption: row.encryption,
        prr: row.prr,
        mcc: row.mcc,
        ssl: row.ssl,
        tokenization: row.tokenization,
        agent: row.agent,
        chain: row.chain,
        store: row.store,
        terminalInfo: row.terminal_info,
        recordStatus: row.record_status,
        boardDate: row.board_date,
        terminalVisa: row.terminal_visa,
        bankNumber: row.bank_number,
        associationNumber1: row.association_number_1,
        transactionCode: row.transaction_code,
        authSource: row.auth_source,
        networkIdentifierDebit: row.network_identifier_debit,
        posEntryMode: row.pos_entry_mode,
        authResponseCode: row.auth_response_code,
        validationCode: row.validation_code,
        catIndicator: row.cat_indicator,
        onlineEntry: row.online_entry,
        achFlag: row.ach_flag,
        cardholderIdMethod: row.cardholder_id_method,
        terminalId: row.terminal_id,
        discoverPosEntryMode: row.discover_pos_entry_mode,
        purchaseId: row.purchase_id,
        posDataCode: row.pos_data_code,
        terminalType: row.terminal_type,
        status: row.status,
        location: row.location,
        mType: row.m_type,
        mLocation: row.m_location,
        installationDate: row.installation_date,
        hardwareModel: row.hardware_model,
        manufacturer: row.manufacturer,
        firmwareVersion: row.firmware_version,
        networkType: row.network_type,
        ipAddress: row.ip_address,
        termNumber: row.term_number,
        genericField2: row.generic_field_2,
        description: row.description,
        notes: row.notes,
        internalNotes: row.internal_notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        lastActivity: row.last_activity,
        lastUpdate: row.last_update,
        updateSource: row.update_source,
        lastSyncDate: row.last_sync_date,
        syncStatus: row.sync_status
      }));
    } catch (error) {
      console.error(`[TERMINALS-STORAGE] Error fetching from ${terminalsTableName}:`, error);
      console.error(`[TERMINALS-STORAGE] Full error details:`, error);
      return [];
    }
  }

  async getTerminalById(terminalId: number): Promise<Terminal | undefined> {
    // @ENVIRONMENT-CRITICAL - Terminal lookup by ID
    // @DEPLOYMENT-CHECK - Uses environment-aware table naming for API terminals
    const terminalsTableName = getTableName('api_terminals');
    
    try {
      const result = await pool.query(`SELECT * FROM ${terminalsTableName} WHERE id = $1`, [terminalId]);
      if (!result.rows[0]) return undefined;
      
      const row = result.rows[0];
      return {
        id: row.id,
        vNumber: row.v_number,
        posMerchantNumber: row.pos_merchant_number,
        bin: row.bin,
        dbaName: row.dba_name,
        dailyAuth: row.daily_auth,
        dialPay: row.dial_pay,
        encryption: row.encryption,
        prr: row.prr,
        mcc: row.mcc,
        ssl: row.ssl,
        tokenization: row.tokenization,
        agent: row.agent,
        chain: row.chain,
        store: row.store,
        terminalInfo: row.terminal_info,
        recordStatus: row.record_status,
        boardDate: row.board_date,
        terminalVisa: row.terminal_visa,
        bankNumber: row.bank_number,
        associationNumber1: row.association_number_1,
        transactionCode: row.transaction_code,
        authSource: row.auth_source,
        networkIdentifierDebit: row.network_identifier_debit,
        posEntryMode: row.pos_entry_mode,
        authResponseCode: row.auth_response_code,
        validationCode: row.validation_code,
        catIndicator: row.cat_indicator,
        onlineEntry: row.online_entry,
        achFlag: row.ach_flag,
        cardholderIdMethod: row.cardholder_id_method,
        terminalId: row.terminal_id,
        discoverPosEntryMode: row.discover_pos_entry_mode,
        purchaseId: row.purchase_id,
        posDataCode: row.pos_data_code,
        terminalType: row.terminal_type,
        status: row.status,
        location: row.location,
        mType: row.m_type,
        mLocation: row.m_location,
        installationDate: row.installation_date,
        hardwareModel: row.hardware_model,
        manufacturer: row.manufacturer,
        firmwareVersion: row.firmware_version,
        networkType: row.network_type,
        ipAddress: row.ip_address,
        termNumber: row.term_number,
        genericField2: row.generic_field_2,
        description: row.description,
        notes: row.notes,
        internalNotes: row.internal_notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        lastActivity: row.last_activity,
        lastUpdate: row.last_update,
        updateSource: row.update_source,
        lastSyncDate: row.last_sync_date,
        syncStatus: row.sync_status
      };
    } catch (error) {
      console.error(`[TERMINALS-STORAGE] Error fetching terminal by ID from ${terminalsTableName}:`, error);
      return undefined;
    }
  }

  async getTerminalsByMasterMID(masterMID: string): Promise<Terminal[]> {
    // @ENVIRONMENT-CRITICAL - Terminal lookup by Master MID
    // @DEPLOYMENT-CHECK - Uses environment-aware table naming for API terminals
    const terminalsTableName = getTableName('api_terminals');
    
    try {
      const result = await pool.query(`SELECT * FROM ${terminalsTableName} WHERE pos_merchant_number = $1`, [masterMID]);
      return result.rows.map(row => ({
        id: row.id,
        vNumber: row.v_number,
        posMerchantNumber: row.pos_merchant_number,
        bin: row.bin,
        dbaName: row.dba_name,
        dailyAuth: row.daily_auth,
        dialPay: row.dial_pay,
        encryption: row.encryption,
        prr: row.prr,
        mcc: row.mcc,
        ssl: row.ssl,
        tokenization: row.tokenization,
        agent: row.agent,
        chain: row.chain,
        store: row.store,
        terminalInfo: row.terminal_info,
        recordStatus: row.record_status,
        boardDate: row.board_date,
        terminalVisa: row.terminal_visa,
        bankNumber: row.bank_number,
        associationNumber1: row.association_number_1,
        transactionCode: row.transaction_code,
        authSource: row.auth_source,
        networkIdentifierDebit: row.network_identifier_debit,
        posEntryMode: row.pos_entry_mode,
        authResponseCode: row.auth_response_code,
        validationCode: row.validation_code,
        catIndicator: row.cat_indicator,
        onlineEntry: row.online_entry,
        achFlag: row.ach_flag,
        cardholderIdMethod: row.cardholder_id_method,
        terminalId: row.terminal_id,
        discoverPosEntryMode: row.discover_pos_entry_mode,
        purchaseId: row.purchase_id,
        posDataCode: row.pos_data_code,
        terminalType: row.terminal_type,
        status: row.status,
        location: row.location,
        mType: row.m_type,
        mLocation: row.m_location,
        installationDate: row.installation_date,
        hardwareModel: row.hardware_model,
        manufacturer: row.manufacturer,
        firmwareVersion: row.firmware_version,
        networkType: row.network_type,
        ipAddress: row.ip_address,
        termNumber: row.term_number,
        genericField2: row.generic_field_2,
        description: row.description,
        notes: row.notes,
        internalNotes: row.internal_notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        lastActivity: row.last_activity,
        lastUpdate: row.last_update,
        updateSource: row.update_source,
        lastSyncDate: row.last_sync_date,
        syncStatus: row.sync_status
      }));
    } catch (error) {
      console.error(`[TERMINALS-STORAGE] Error fetching terminals by Master MID from ${terminalsTableName}:`, error);
      return [];
    }
  }

  async createTerminal(insertTerminal: InsertTerminal): Promise<Terminal> {
    // @ENVIRONMENT-CRITICAL - Terminal creation with environment-aware table naming for API terminals
    // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
    const terminalsTableName = getTableName('api_terminals');
    
    // Field mapping from camelCase to snake_case
    const fieldMapping: { [key: string]: string } = {
      'vNumber': 'v_number',
      'posMerchantNumber': 'pos_merchant_number',
      'dbaName': 'dba_name',
      'dailyAuth': 'daily_auth',
      'dialPay': 'dial_pay',
      'terminalInfo': 'terminal_info',
      'recordStatus': 'record_status',
      'boardDate': 'board_date',
      'terminalVisa': 'terminal_visa',
      'bankNumber': 'bank_number',
      'associationNumber1': 'association_number_1',
      'transactionCode': 'transaction_code',
      'authSource': 'auth_source',
      'networkIdentifierDebit': 'network_identifier_debit',
      'posEntryMode': 'pos_entry_mode',
      'authResponseCode': 'auth_response_code',
      'validationCode': 'validation_code',
      'catIndicator': 'cat_indicator',
      'onlineEntry': 'online_entry',
      'achFlag': 'ach_flag',
      'cardholderIdMethod': 'cardholder_id_method',
      'terminalId': 'terminal_id',
      'discoverPosEntryMode': 'discover_pos_entry_mode',
      'purchaseId': 'purchase_id',
      'posDataCode': 'pos_data_code',
      'terminalType': 'terminal_type',
      'businessName': 'business_name',
      'locationAddress': 'location_address',
      'locationCity': 'location_city',
      'locationState': 'location_state',
      'locationZip': 'location_zip',
      'contactPhone': 'contact_phone',
      'supportEmail': 'support_email',
      'installDate': 'install_date',
      'warrantyExpiry': 'warranty_expiry',
      'lastMaintenance': 'last_maintenance',
      'nextMaintenance': 'next_maintenance',
      'firmwareVersion': 'firmware_version',
      'hardwareSerial': 'hardware_serial',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
      'lastUpdate': 'last_update',
      'updateSource': 'update_source',
      'createdBy': 'created_by',
      'updatedBy': 'updated_by',
      'syncStatus': 'sync_status',
      // Additional form field mappings
      'mType': 'm_type',
      'mLocation': 'm_location'
    };
    
    // Map field names and prepare values
    const mappedEntries = Object.entries(insertTerminal).map(([key, value]) => [
      fieldMapping[key] || key, // Use mapped name or original if no mapping
      value
    ]);
    
    const columns = mappedEntries.map(([column]) => column).join(', ');
    const placeholders = mappedEntries.map((_, i) => `$${i + 1}`).join(', ');
    const values = mappedEntries.map(([, value]) => value);
    
    console.log(`[TERMINAL-CREATE] Inserting into ${terminalsTableName} with columns: ${columns}`);
    
    const result = await pool.query(`
      INSERT INTO ${terminalsTableName} (${columns}) 
      VALUES (${placeholders}) 
      RETURNING *
    `, values);
    
    return result.rows[0];
  }

  async updateTerminal(terminalId: number, terminalData: Partial<InsertTerminal>): Promise<Terminal> {
    // @ENVIRONMENT-CRITICAL - Terminal update with environment-aware table naming for API terminals
    // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
    const terminalsTableName = getTableName('api_terminals');
    
    // Field mapping from camelCase to snake_case (same as createTerminal)
    const fieldMapping: { [key: string]: string } = {
      'vNumber': 'v_number',
      'posMerchantNumber': 'pos_merchant_number',
      'dbaName': 'dba_name',
      'dailyAuth': 'daily_auth',
      'dialPay': 'dial_pay',
      'terminalInfo': 'terminal_info',
      'recordStatus': 'record_status',
      'boardDate': 'board_date',
      'terminalVisa': 'terminal_visa',
      'bankNumber': 'bank_number',
      'associationNumber1': 'association_number_1',
      'transactionCode': 'transaction_code',
      'authSource': 'auth_source',
      'networkIdentifierDebit': 'network_identifier_debit',
      'posEntryMode': 'pos_entry_mode',
      'authResponseCode': 'auth_response_code',
      'validationCode': 'validation_code',
      'catIndicator': 'cat_indicator',
      'onlineEntry': 'online_entry',
      'achFlag': 'ach_flag',
      'cardholderIdMethod': 'cardholder_id_method',
      'terminalId': 'terminal_id',
      'discoverPosEntryMode': 'discover_pos_entry_mode',
      'purchaseId': 'purchase_id',
      'posDataCode': 'pos_data_code',
      'terminalType': 'terminal_type',
      'businessName': 'business_name',
      'locationAddress': 'location_address',
      'locationCity': 'location_city',
      'locationState': 'location_state',
      'locationZip': 'location_zip',
      'contactPhone': 'contact_phone',
      'supportEmail': 'support_email',
      'installDate': 'install_date',
      'warrantyExpiry': 'warranty_expiry',
      'lastMaintenance': 'last_maintenance',
      'nextMaintenance': 'next_maintenance',
      'firmwareVersion': 'firmware_version',
      'hardwareSerial': 'hardware_serial',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
      'lastUpdate': 'last_update',
      'updateSource': 'update_source',
      'createdBy': 'created_by',
      'updatedBy': 'updated_by',
      'syncStatus': 'sync_status',
      // Additional form field mappings
      'mType': 'm_type',
      'mLocation': 'm_location'
    };
    
    // Map field names from camelCase to snake_case
    const mappedEntries = Object.entries(terminalData).map(([key, value]) => [
      fieldMapping[key] || key, // Use mapped name or original if no mapping
      value
    ]);
    
    const setClause = mappedEntries
      .map(([column], i) => `${column} = $${i + 2}`)
      .join(', ');
    const values = [terminalId, ...mappedEntries.map(([, value]) => value)];
    
    const result = await pool.query(`
      UPDATE ${terminalsTableName} 
      SET ${setClause} 
      WHERE id = $1 
      RETURNING *
    `, values);
    
    return result.rows[0];
  }

  async deleteTerminal(terminalId: number): Promise<void> {
    // @ENVIRONMENT-CRITICAL - Terminal deletion with environment-aware table naming for API terminals
    // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
    const terminalsTableName = getTableName('api_terminals');
    
    try {
      await pool.query(`DELETE FROM ${terminalsTableName} WHERE id = $1`, [terminalId]);
    } catch (error) {
      console.error(`[TERMINALS-STORAGE] Error deleting terminal from ${terminalsTableName}:`, error);
      throw error;
    }
  }

  // SubMerchantTerminals operations
  async getSubMerchantTerminals(): Promise<SubMerchantTerminal[]> {
    // @ENVIRONMENT-CRITICAL - SubMerchantTerminals data retrieval
    // @DEPLOYMENT-CHECK - Uses environment-aware table naming
    const subMerchantTerminalsTableName = getTableName('sub_merchant_terminals');
    
    const result = await pool.query(`
      SELECT smt.*, m.name as merchant_name, t.v_number as terminal_v_number
      FROM ${subMerchantTerminalsTableName} smt
      LEFT JOIN ${getTableName('merchants')} m ON smt.merchant_id = m.id
      LEFT JOIN ${getTableName('terminals')} t ON smt.terminal_id = t.id
      WHERE smt.is_active = true
      ORDER BY smt.created_at DESC
    `);
    return result.rows;
  }

  async getSubMerchantTerminalsByMerchant(merchantId: string): Promise<SubMerchantTerminal[]> {
    // @ENVIRONMENT-CRITICAL - SubMerchantTerminals lookup by merchant
    // @DEPLOYMENT-CHECK - Uses environment-aware table naming
    const subMerchantTerminalsTableName = getTableName('sub_merchant_terminals');
    
    const result = await pool.query(`
      SELECT smt.*, t.v_number as terminal_v_number, t.dba_name as terminal_dba_name
      FROM ${subMerchantTerminalsTableName} smt
      LEFT JOIN ${getTableName('terminals')} t ON smt.terminal_id = t.id
      WHERE smt.merchant_id = $1 AND smt.is_active = true
      ORDER BY smt.match_score DESC NULLS LAST, smt.created_at DESC
    `, [merchantId]);
    return result.rows;
  }

  async getSubMerchantTerminalsByTerminal(terminalId: number): Promise<SubMerchantTerminal[]> {
    // @ENVIRONMENT-CRITICAL - SubMerchantTerminals lookup by terminal
    // @DEPLOYMENT-CHECK - Uses environment-aware table naming
    const subMerchantTerminalsTableName = getTableName('sub_merchant_terminals');
    
    const result = await pool.query(`
      SELECT smt.*, m.name as merchant_name
      FROM ${subMerchantTerminalsTableName} smt
      LEFT JOIN ${getTableName('merchants')} m ON smt.merchant_id = m.id
      WHERE smt.terminal_id = $1 AND smt.is_active = true
      ORDER BY smt.match_score DESC NULLS LAST, smt.created_at DESC
    `, [terminalId]);
    return result.rows;
  }

  async createSubMerchantTerminal(insertSubMerchantTerminal: InsertSubMerchantTerminal): Promise<SubMerchantTerminal> {
    // @ENVIRONMENT-CRITICAL - SubMerchantTerminal creation with environment-aware table naming
    // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
    const subMerchantTerminalsTableName = getTableName('sub_merchant_terminals');
    
    // DECOMMISSION DETECTION: Check if terminal name indicates decommissioned status
    const deviceName = insertSubMerchantTerminal.deviceName;
    if (deviceName && isTerminalDecommissioned(deviceName)) {
      console.log(`🔍 DECOMMISSION DETECTED in SubMerchantTerminal creation: "${deviceName}" contains decommission-related keywords`);
      
      // If we have a terminalId, update the terminal status to "Decommissioned"
      if (insertSubMerchantTerminal.terminalId) {
        try {
          const terminalsTableName = getTableName('terminals');
          await pool.query(`
            UPDATE ${terminalsTableName} 
            SET status = 'Decommissioned', updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND status != 'Decommissioned'
          `, [insertSubMerchantTerminal.terminalId]);
          
          console.log(`✅ DECOMMISSION UPDATE: Terminal ID ${insertSubMerchantTerminal.terminalId} status updated to "Decommissioned"`);
        } catch (error) {
          console.error(`❌ Error updating terminal status for decommissioned terminal ${insertSubMerchantTerminal.terminalId}:`, error);
        }
      }
      
      // Add decommission note to the SubMerchantTerminal record
      const existingNotes = insertSubMerchantTerminal.notes || '';
      insertSubMerchantTerminal.notes = existingNotes 
        ? `${existingNotes} - AUTOMATIC DECOMMISSION DETECTION: Terminal marked as decommissioned based on name keywords`
        : 'AUTOMATIC DECOMMISSION DETECTION: Terminal marked as decommissioned based on name keywords';
    }
    
    const columns = Object.keys(insertSubMerchantTerminal).join(', ');
    const placeholders = Object.keys(insertSubMerchantTerminal).map((_, i) => `$${i + 1}`).join(', ');
    const values = Object.values(insertSubMerchantTerminal);
    
    const result = await pool.query(`
      INSERT INTO ${subMerchantTerminalsTableName} (${columns}) 
      VALUES (${placeholders}) 
      RETURNING *
    `, values);
    
    return result.rows[0];
  }

  async updateSubMerchantTerminal(id: number, updates: Partial<InsertSubMerchantTerminal>): Promise<SubMerchantTerminal> {
    // @ENVIRONMENT-CRITICAL - SubMerchantTerminal update with environment-aware table naming
    // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
    const subMerchantTerminalsTableName = getTableName('sub_merchant_terminals');
    
    const setClause = Object.keys(updates)
      .map((key, i) => `${key} = $${i + 2}`)
      .join(', ');
    const values = [id, ...Object.values(updates)];
    
    const result = await pool.query(`
      UPDATE ${subMerchantTerminalsTableName} 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 
      RETURNING *
    `, values);
    
    return result.rows[0];
  }

  async deleteSubMerchantTerminal(id: number): Promise<void> {
    // @ENVIRONMENT-CRITICAL - SubMerchantTerminal deletion with environment-aware table naming
    // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
    const subMerchantTerminalsTableName = getTableName('sub_merchant_terminals');
    
    await pool.query(`DELETE FROM ${subMerchantTerminalsTableName} WHERE id = $1`, [id]);
  }

  async performFuzzyMatching(merchantId: string): Promise<{ matched: number; suggestions: SubMerchantTerminal[] }> {
    // @ENVIRONMENT-CRITICAL - Fuzzy matching with environment-aware table naming
    // @DEPLOYMENT-CHECK - Uses raw SQL for dev/prod separation
    
    try {
      // Get merchant details
      const merchant = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId)).limit(1);
      if (!merchant.length) {
        return { matched: 0, suggestions: [] };
      }
      
      const merchantName = merchant[0].name.toLowerCase();
      const subMerchantTerminalsTableName = getTableName('sub_merchant_terminals');
      const terminalsTableName = getTableName('terminals');
      
      // Find potential terminal matches using fuzzy string matching
      // Look for terminals with similar DBA names that aren't already linked
      const result = await pool.query(`
        SELECT t.*, 
               SIMILARITY(LOWER(t.dba_name), $1) as similarity_score,
               CASE 
                 WHEN LOWER(t.dba_name) = $1 THEN 'exact'
                 WHEN SIMILARITY(LOWER(t.dba_name), $1) >= 0.6 THEN 'fuzzy'
                 ELSE 'low'
               END as match_type
        FROM ${terminalsTableName} t
        LEFT JOIN ${subMerchantTerminalsTableName} smt ON smt.terminal_id = t.id AND smt.is_active = true
        WHERE smt.id IS NULL
          AND t.dba_name IS NOT NULL
          AND SIMILARITY(LOWER(t.dba_name), $1) >= 0.4
        ORDER BY similarity_score DESC
        LIMIT 10
      `, [merchantName]);
      
      const suggestions: SubMerchantTerminal[] = [];
      let matchedCount = 0;
      
      for (const terminalRow of result.rows) {
        const fuzzyMatchDetails = {
          merchantName: merchantName,
          terminalDbaName: terminalRow.dba_name?.toLowerCase(),
          similarityScore: terminalRow.similarity_score,
          matchType: terminalRow.match_type,
          timestamp: new Date().toISOString()
        };
        
        // Auto-link high-confidence matches (similarity >= 0.8 or exact matches)
        if (terminalRow.similarity_score >= 0.8 || terminalRow.match_type === 'exact') {
          const deviceName = terminalRow.dba_name || `Terminal ${terminalRow.v_number}`;
          
          // Check for decommission detection
          let notes = `Auto-linked via fuzzy matching (score: ${terminalRow.similarity_score})`;
          if (isTerminalDecommissioned(deviceName)) {
            notes += ` - DECOMMISSIONED terminal detected based on name keywords`;
            console.log(`🔍 DECOMMISSION DETECTED in fuzzy matching: "${deviceName}" contains decommission-related keywords`);
          }
          
          const newLink = await this.createSubMerchantTerminal({
            deviceName: deviceName,
            dNumber: terminalRow.v_number,
            merchantId: merchantId,
            terminalId: terminalRow.id,
            matchType: terminalRow.match_type,
            matchScore: terminalRow.similarity_score,
            fuzzyMatchDetails: fuzzyMatchDetails,
            createdBy: 'fuzzy-matcher',
            notes: notes
          });
          matchedCount++;
          suggestions.push(newLink);
        } else {
          const deviceName = terminalRow.dba_name || `Terminal ${terminalRow.v_number}`;
          let notes = `Suggested match (score: ${terminalRow.similarity_score})`;
          if (isTerminalDecommissioned(deviceName)) {
            notes += ` - DECOMMISSIONED terminal detected`;
          }
          
          // Add as suggestion for manual review
          suggestions.push({
            id: 0, // Temporary ID for suggestion
            deviceName: deviceName,
            dNumber: terminalRow.v_number,
            merchantId: merchantId,
            terminalId: terminalRow.id,
            matchType: terminalRow.match_type,
            matchScore: terminalRow.similarity_score,
            fuzzyMatchDetails: fuzzyMatchDetails,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'fuzzy-matcher',
            notes: notes
          } as SubMerchantTerminal);
        }
      }
      
      return { matched: matchedCount, suggestions: suggestions };
    } catch (error) {
      console.error('Error performing fuzzy matching:', error);
      return { matched: 0, suggestions: [] };
    }
  }

  // Helper method to parse amount from fixed-width format
  private parseAmount(amountStr: string): number {
    if (!amountStr || amountStr.trim() === '') return 0;
    
    // Remove any non-numeric characters except decimal point and minus
    const cleanAmount = amountStr.replace(/[^0-9.-]/g, '');
    const amount = parseFloat(cleanAmount);
    
    return isNaN(amount) ? 0 : amount;
  }

  // Helper method to parse Auth Amount field (12-digit format representing cents)
  private parseAuthAmount(amountStr: string): number {
    if (!amountStr || amountStr.trim() === '') return 0;
    
    // Remove any non-numeric characters and convert to number
    const cleanAmount = amountStr.replace(/[^0-9]/g, '');
    if (cleanAmount === '') return 0;
    
    // Convert cents to dollars (divide by 100) and ensure 2 decimal places
    const amountInCents = parseInt(cleanAmount, 10);
    const amountInDollars = amountInCents / 100;
    
    return isNaN(amountInDollars) ? 0 : Math.round(amountInDollars * 100) / 100;
  }

  // Helper method to parse date from YYYYMMDD format
  private parseDate(dateStr: string): Date {
    if (!dateStr || dateStr.trim() === '' || dateStr.length !== 8) {
      return new Date(); // Default to current date if invalid
    }
    
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1; // Month is 0-indexed
    const day = parseInt(dateStr.substring(6, 8));
    
    const date = new Date(year, month, day);
    
    // Validate the date
    if (isNaN(date.getTime())) {
      return new Date(); // Default to current date if invalid
    }
    
    return date;
  }

  // Helper method to parse TDDF date from MMDDCCYY format (positions 85-92)
  private parseTddfDate(dateStr: string): Date {
    if (!dateStr || dateStr.trim() === '' || dateStr.length !== 8) {
      return new Date(); // Default to current date if invalid
    }
    
    const month = parseInt(dateStr.substring(0, 2)) - 1; // Month is 0-indexed
    const day = parseInt(dateStr.substring(2, 4));
    const century = parseInt(dateStr.substring(4, 6)); // CC (century)
    const year2digit = parseInt(dateStr.substring(6, 8)); // YY (year within century)
    
    // Convert century and 2-digit year to full year
    const fullYear = (century * 100) + year2digit;
    
    const date = new Date(fullYear, month, day);
    
    // Validate the date
    if (isNaN(date.getTime())) {
      return new Date(); // Default to current date if invalid
    }
    
    return date;
  }

  // TDDF record operations
  async getTddfRecords(options: {
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    merchantId?: string;
    cardType?: string;
    search?: string;
    vNumber?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Promise<{
    data: TddfRecord[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const offset = (page - 1) * limit;

      // Build query conditions
      const conditions = [];
      
      if (options.startDate) {
        conditions.push(gte(tddfRecordsTable.transactionDate, new Date(options.startDate)));
      }
      
      if (options.endDate) {
        conditions.push(lte(tddfRecordsTable.transactionDate, new Date(options.endDate)));
      }
      
      if (options.merchantId) {
        conditions.push(eq(tddfRecordsTable.merchantAccountNumber, options.merchantId));
      }
      
      if (options.cardType) {
        // Map card type filters to TDDF field conditions
        switch (options.cardType) {
          case 'MC':
            conditions.push(eq(tddfRecordsTable.cardType, 'MC'));
            break;
          case 'MC-D':
            conditions.push(eq(tddfRecordsTable.cardType, 'MD'));
            break;
          case 'MC-B':
            conditions.push(eq(tddfRecordsTable.cardType, 'MB'));
            break;
          case 'VISA':
            conditions.push(eq(tddfRecordsTable.cardType, 'VS'));
            break;
          case 'VISA-D':
            conditions.push(eq(tddfRecordsTable.cardType, 'VD'));
            break;
          case 'VISA-B':
            conditions.push(eq(tddfRecordsTable.cardType, 'VB'));
            break;
          case 'AMEX':
            conditions.push(eq(tddfRecordsTable.cardType, 'AM'));
            break;
          case 'DISC':
            conditions.push(eq(tddfRecordsTable.cardType, 'DS'));
            break;
          case 'DEBIT':
            // For generic debit, look for debit indicator
            conditions.push(eq(tddfRecordsTable.debitCreditIndicator, 'D'));
            break;
          case 'CREDIT':
            // For generic credit, look for credit indicator
            conditions.push(eq(tddfRecordsTable.debitCreditIndicator, 'C'));
            break;
        }
      }

      if (options.search && options.search.trim() !== '') {
        const searchTerm = `%${options.search.trim().toLowerCase()}%`;
        // Search across Merchant Name, MCC, and Reference Number
        conditions.push(
          or(
            ilike(tddfRecordsTable.merchantName, searchTerm),
            ilike(tddfRecordsTable.mccCode, searchTerm),
            ilike(tddfRecordsTable.referenceNumber, searchTerm)
          )
        );
      }

      if (options.vNumber && options.vNumber.trim() !== '') {
        const vNumber = options.vNumber.trim();
        // Convert V Number (e.g., V6487134) to Terminal ID (e.g., 76487134)
        // Remove "V" prefix and add "7" prefix to match TDDF Terminal ID field
        let terminalId = vNumber;
        if (vNumber.toUpperCase().startsWith('V')) {
          terminalId = '7' + vNumber.substring(1);
        }
        conditions.push(eq(tddfRecordsTable.terminalId, terminalId));
      }

      // @ENVIRONMENT-CRITICAL - TDDF records pagination and search
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const tddfRecordsTableName = getTableName('tddf_records');
      
      // Build WHERE clause for raw SQL
      let whereClause = '';
      let queryParams: any[] = [];
      let paramIndex = 1;
      
      // Add date filtering to raw SQL
      if (options.startDate) {
        const connector = whereClause ? ' AND' : ' WHERE';
        whereClause += `${connector} transaction_date >= $${paramIndex}`;
        queryParams.push(new Date(options.startDate));
        paramIndex++;
      }
      
      if (options.endDate) {
        const connector = whereClause ? ' AND' : ' WHERE';
        whereClause += `${connector} transaction_date <= $${paramIndex}`;
        queryParams.push(new Date(options.endDate));
        paramIndex++;
      }
      
      if (options.search && options.search.trim() !== '') {
        const searchTerm = `%${options.search.trim().toLowerCase()}%`;
        const connector = whereClause ? ' AND' : ' WHERE';
        whereClause += `${connector} (LOWER(merchant_name) LIKE $${paramIndex} OR LOWER(mcc_code) LIKE $${paramIndex+1} OR LOWER(reference_number) LIKE $${paramIndex+2})`;
        queryParams.push(searchTerm, searchTerm, searchTerm);
        paramIndex += 3;
      }
      
      if (options.vNumber && options.vNumber.trim() !== '') {
        const vNumber = options.vNumber.trim();
        let terminalId = vNumber;
        if (vNumber.toUpperCase().startsWith('V')) {
          terminalId = '7' + vNumber.substring(1);
        }
        const connector = whereClause ? ' AND' : ' WHERE';
        whereClause += `${connector} terminal_id = $${paramIndex}`;
        queryParams.push(terminalId);
        paramIndex++;
      }

      // Get total count using raw SQL
      const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${tddfRecordsTableName}${whereClause}`, queryParams);
      const totalItems = parseInt(countResult.rows[0].count, 10);
      const totalPages = Math.ceil(totalItems / limit);
      
      // Dynamic sorting for raw SQL
      const sortBy = options.sortBy || 'transactionDate';
      const sortOrder = options.sortOrder || 'desc';
      
      // Map sort fields to database columns for raw SQL
      let sortColumnName = 'transaction_date'; // default
      switch (sortBy) {
        case 'transactionDate':
          sortColumnName = 'transaction_date';
          break;
        case 'terminalId':
          sortColumnName = 'terminal_id';
          break;
        case 'merchantName':
          sortColumnName = 'merchant_name';
          break;
        case 'transactionAmount':
          sortColumnName = 'transaction_amount';
          break;
        case 'referenceNumber':
          sortColumnName = 'reference_number';
          break;
        default:
          sortColumnName = 'transaction_date';
      }
      
      // Get paginated data using raw SQL
      const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
      const dataQuery = `
        SELECT * FROM ${tddfRecordsTableName}
        ${whereClause}
        ORDER BY ${sortColumnName} ${orderDirection}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      queryParams.push(limit, offset);
      const dataResult = await pool.query(dataQuery, queryParams);
      const records = dataResult.rows;

      return {
        data: records,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error getting TDDF records:', error);
      throw error;
    }
  }

  async getTddfMerchants(options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    minAmount?: string;
    maxAmount?: string;
    minTransactions?: string;
    maxTransactions?: string;
    minTerminals?: string;
    maxTerminals?: string;
  }): Promise<{
    data: Array<{
      merchantName: string;
      merchantAccountNumber: string;
      mccCode: string;
      transactionTypeIdentifier: string;
      terminalCount: number;
      totalTransactions: number;
      totalAmount: number;
      lastTransactionDate: string;
      posRelativeCode?: string;
    }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
    fromPreCache?: boolean;
    cacheAge?: number;
    queryTime?: number;
  }> {
    const startTime = Date.now();
    
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const offset = (page - 1) * limit;

      // Check if this is a simple request that can use pre-cache
      const canUsePreCache = (
        page <= 3 && // Allow first few pages to use cache
        limit <= 20 && 
        !options.search && 
        !options.minAmount && 
        !options.maxAmount && 
        !options.minTransactions && 
        !options.maxTransactions && 
        !options.minTerminals && 
        !options.maxTerminals
      );

      if (canUsePreCache) {
        console.log('[TDDF-MERCHANTS-CACHE] Attempting to use pre-cache for TDDF merchants listing');
        
        try {
          const tddfMerchantsCacheTableName = getTableName('tddf_merchants_cache_orphan_20250729');
          const cacheResult = await pool.query(`
            SELECT COUNT(*) as total FROM ${tddfMerchantsCacheTableName}
          `);
          
          const totalCachedMerchants = parseInt(cacheResult.rows[0]?.total || '0');
          
          if (totalCachedMerchants > 0) {
            console.log(`[TDDF-MERCHANTS-CACHE] ✅ Using cached TDDF merchants data (${totalCachedMerchants} merchants cached)`);
            
            // Get paginated data from cache
            const sortByColumn = options.sortBy === 'totalAmount' ? 'total_amount' : 'total_transactions';
            const sortOrder = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
            
            const dataResult = await pool.query(`
              SELECT 
                merchant_name,
                merchant_account_number,
                mcc_code,
                transaction_type_identifier,
                terminal_count,
                total_transactions,
                total_amount,
                last_transaction_date,
                pos_relative_code
              FROM ${tddfMerchantsCacheTableName}
              ORDER BY ${sortByColumn} ${sortOrder}
              LIMIT $1 OFFSET $2
            `, [limit, offset]);

            const merchants = dataResult.rows.map(row => ({
              merchantName: row.merchant_name || '',
              merchantAccountNumber: row.merchant_account_number || '',
              mccCode: row.mcc_code || '',
              transactionTypeIdentifier: row.transaction_type_identifier || '',
              terminalCount: parseInt(row.terminal_count) || 0,
              totalTransactions: parseInt(row.total_transactions) || 0,
              totalAmount: parseFloat(row.total_amount) || 0,
              lastTransactionDate: row.last_transaction_date || '',
              posRelativeCode: row.pos_relative_code || ''
            }));

            const queryTime = Date.now() - startTime;
            const totalPages = Math.ceil(totalCachedMerchants / limit);
            
            console.log(`[TDDF-MERCHANTS-CACHE] ✅ Pre-cache response completed in ${queryTime}ms`);

            return {
              data: merchants,
              pagination: {
                currentPage: page,
                totalPages,
                totalItems: totalCachedMerchants,
                itemsPerPage: limit
              },
              fromPreCache: true,
              cacheAge: 0, // Cache age would be calculated if available
              queryTime
            };
          }
        } catch (cacheError) {
          console.log(`[TDDF-MERCHANTS-CACHE] Cache miss or error, falling back to JSONB aggregation:`, cacheError.message);
        }
      }

      console.log('[TDDF MERCHANTS API] Using real-time JSONB aggregation (filters applied or cache unavailable)');
      const tddfJsonbTableName = getTableName('tddf_jsonb');
      
      console.log('[TDDF MERCHANTS API] Starting JSONB aggregation query');
      console.log('[TDDF MERCHANTS API] Table name:', tddfJsonbTableName);
      console.log('[TDDF MERCHANTS API] Options:', options);
      
      // Query using JSONB extracted fields for DT (transaction) records only
      const simpleQuery = `
        SELECT 
          extracted_fields->>'merchantName' as merchant_name,
          extracted_fields->>'merchantAccountNumber' as merchant_account_number,
          extracted_fields->>'mccCode' as mcc_code,
          MAX(extracted_fields->>'transactionTypeIdentifier') as transaction_type_identifier,
          COUNT(DISTINCT extracted_fields->>'terminalId') as terminal_count,
          COUNT(*) as total_transactions,
          SUM(CAST(COALESCE(extracted_fields->>'transactionAmount', '0') AS NUMERIC)) as total_amount,
          MAX(extracted_fields->>'transactionDate') as last_transaction_date,
          SUBSTRING(extracted_fields->>'merchantAccountNumber', 1, 5) as pos_relative_code
        FROM "${tddfJsonbTableName}"
        WHERE record_type = 'DT'
          AND extracted_fields->>'merchantName' IS NOT NULL 
          AND extracted_fields->>'merchantName' != ''
          AND extracted_fields->>'merchantAccountNumber' IS NOT NULL
        GROUP BY extracted_fields->>'merchantName', extracted_fields->>'merchantAccountNumber', extracted_fields->>'mccCode'
        ORDER BY total_transactions DESC
        LIMIT $1 OFFSET $2
      `;
      
      const countQuery = `
        SELECT COUNT(DISTINCT CONCAT(
          extracted_fields->>'merchantName', '|', 
          extracted_fields->>'merchantAccountNumber', '|', 
          extracted_fields->>'mccCode'
        )) as total
        FROM "${tddfJsonbTableName}"
        WHERE record_type = 'DT'
          AND extracted_fields->>'merchantName' IS NOT NULL 
          AND extracted_fields->>'merchantName' != ''
          AND extracted_fields->>'merchantAccountNumber' IS NOT NULL
      `;
      
      console.log('[TDDF MERCHANTS API] Executing JSONB aggregation query');
      
      // Execute queries
      const [dataResult, countResult] = await Promise.all([
        pool.query(simpleQuery, [limit, offset]),
        pool.query(countQuery, [])
      ]);
      
      console.log('[TDDF MERCHANTS API] Query results:', {
        dataRows: dataResult.rows.length,
        totalCount: countResult.rows[0]?.total || 0
      });
      
      const totalItems = parseInt(countResult.rows[0]?.total || '0');
      const totalPages = Math.ceil(totalItems / limit);

      const merchants = dataResult.rows.map(row => ({
        merchantName: row.merchant_name || '',
        merchantAccountNumber: row.merchant_account_number || '',
        mccCode: row.mcc_code || '',
        transactionTypeIdentifier: row.transaction_type_identifier || '',
        terminalCount: parseInt(row.terminal_count) || 0,
        totalTransactions: parseInt(row.total_transactions) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        lastTransactionDate: row.last_transaction_date || '',
        posRelativeCode: row.pos_relative_code || ''
      }));

      console.log('[TDDF MERCHANTS API] Returning merchants:', merchants.length);
      const queryTime = Date.now() - startTime;

      return {
        data: merchants,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        },
        fromPreCache: false,
        queryTime
      };
    } catch (error) {
      console.error('[TDDF MERCHANTS API] Error:', error);
      const queryTime = Date.now() - startTime;
      
      return {
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limit
        },
        fromPreCache: false,
        queryTime
      };
    }
  }

  // DEPRECATED - Old complex version with filtering issues  
  async getTddfMerchantsOld(options: {
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    minAmount?: string;
    maxAmount?: string;
    minTransactions?: string;
    maxTransactions?: string;
    minTerminals?: string;
    maxTerminals?: string;
  }): Promise<{
    data: Array<{
      merchantName: string;
      merchantAccountNumber: string;
      mccCode: string;
      transactionTypeIdentifier: string;
      terminalCount: number;
      totalTransactions: number;
      totalAmount: number;
      lastTransactionDate: string;
      posRelativeCode?: string;
    }>;
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const offset = (page - 1) * limit;

      const tddfRecordsTableName = getTableName('tddf_records');

      // Build search and filter conditions
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (options.search && options.search.trim() !== '') {
        const searchTerm = `%${options.search.trim().toLowerCase()}%`;
        console.log('[SEARCH DEBUG] Search term:', options.search, '-> SQL term:', searchTerm);
        conditions.push(`(
          LOWER(merchant_name) LIKE $${paramIndex} OR 
          LOWER(mcc_code) LIKE $${paramIndex} OR 
          LOWER(merchant_account_number) LIKE $${paramIndex}
        )`);
        params.push(searchTerm);
        paramIndex++;
      }

      // Add advanced filtering conditions
      if (options.minAmount && options.minAmount.trim() !== '') {
        conditions.push(`total_amount >= $${paramIndex}`);
        params.push(parseFloat(options.minAmount));
        paramIndex++;
      }

      if (options.maxAmount && options.maxAmount.trim() !== '') {
        conditions.push(`total_amount <= $${paramIndex}`);
        params.push(parseFloat(options.maxAmount));
        paramIndex++;
      }

      if (options.minTransactions && options.minTransactions.trim() !== '') {
        conditions.push(`total_transactions >= $${paramIndex}`);
        params.push(parseInt(options.minTransactions));
        paramIndex++;
      }

      if (options.maxTransactions && options.maxTransactions.trim() !== '') {
        conditions.push(`total_transactions <= $${paramIndex}`);
        params.push(parseInt(options.maxTransactions));
        paramIndex++;
      }

      if (options.minTerminals && options.minTerminals.trim() !== '') {
        conditions.push(`terminal_count >= $${paramIndex}`);
        params.push(parseInt(options.minTerminals));
        paramIndex++;
      }

      if (options.maxTerminals && options.maxTerminals.trim() !== '') {
        conditions.push(`terminal_count <= $${paramIndex}`);
        params.push(parseInt(options.maxTerminals));
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Build sort condition
      let sortCondition = 'ORDER BY total_transactions DESC';
      if (options.sortBy) {
        const sortDirection = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
        switch (options.sortBy) {
          case 'merchantName':
            sortCondition = `ORDER BY merchant_name ${sortDirection}`;
            break;
          case 'merchantAccountNumber':
            sortCondition = `ORDER BY merchant_account_number ${sortDirection}`;
            break;
          case 'mccCode':
            sortCondition = `ORDER BY mcc_code ${sortDirection}`;
            break;
          case 'totalTransactions':
            sortCondition = `ORDER BY total_transactions ${sortDirection}`;
            break;
          case 'totalAmount':
            sortCondition = `ORDER BY total_amount ${sortDirection}`;
            break;
          case 'lastTransactionDate':
            sortCondition = `ORDER BY last_transaction_date ${sortDirection}`;
            break;
          default:
            sortCondition = 'ORDER BY total_transactions DESC';
        }
      }

      // Query to aggregate merchant data from TDDF records with terminal count from DT records
      const dataQuery = `
        WITH merchant_aggregates AS (
          SELECT 
            merchant_name,
            merchant_account_number,
            mcc_code,
            transaction_type_identifier,
            COUNT(*) as total_transactions,
            SUM(CAST(transaction_amount AS NUMERIC)) as total_amount,
            MAX(transaction_date) as last_transaction_date,
            -- Count unique Terminal IDs (277-284) from DT records for this merchant
            COUNT(DISTINCT terminal_id) as terminal_count,
            -- Extract first 5 digits from merchant account number for terminal linking
            SUBSTRING(merchant_account_number, 1, 5) as pos_relative_code
          FROM "${tddfRecordsTableName}"
          WHERE merchant_name IS NOT NULL 
            AND merchant_account_number IS NOT NULL
            AND terminal_id IS NOT NULL 
            AND terminal_id != ''
          GROUP BY 
            merchant_name, 
            merchant_account_number, 
            mcc_code, 
            transaction_type_identifier,
            SUBSTRING(merchant_account_number, 1, 5)
        )
        SELECT 
          ma.merchant_name,
          ma.merchant_account_number,
          ma.mcc_code,
          ma.transaction_type_identifier,
          ma.terminal_count,
          ma.total_transactions,
          ma.total_amount,
          ma.last_transaction_date,
          ma.pos_relative_code
        FROM merchant_aggregates ma
        ${whereClause}
        ${sortCondition}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      // Count query for pagination - must match the same structure as data query for filtering
      const countQuery = `
        WITH merchant_aggregates AS (
          SELECT 
            merchant_name,
            merchant_account_number,
            mcc_code,
            transaction_type_identifier,
            COUNT(*) as total_transactions,
            SUM(CAST(transaction_amount AS NUMERIC)) as total_amount,
            MAX(transaction_date) as last_transaction_date,
            COUNT(DISTINCT terminal_id) as terminal_count,
            SUBSTRING(merchant_account_number, 1, 5) as pos_relative_code
          FROM "${tddfRecordsTableName}"
          WHERE merchant_name IS NOT NULL 
            AND merchant_account_number IS NOT NULL
            AND terminal_id IS NOT NULL 
            AND terminal_id != ''
          GROUP BY 
            merchant_name, 
            merchant_account_number, 
            mcc_code, 
            transaction_type_identifier,
            SUBSTRING(merchant_account_number, 1, 5)
        )
        SELECT COUNT(*) as total
        FROM merchant_aggregates ma
        ${whereClause}
      `;

      // Use the same parameters for count query as data query (excluding LIMIT/OFFSET)
      const countParams = params.slice(0, -2);

      // Execute queries
      const [dataResult, countResult] = await Promise.all([
        pool.query(dataQuery, params),
        pool.query(countQuery, countParams)
      ]);

      const totalItems = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(totalItems / limit);

      const merchants = dataResult.rows.map(row => ({
        merchantName: row.merchant_name || '',
        merchantAccountNumber: row.merchant_account_number || '',
        mccCode: row.mcc_code || '',
        transactionTypeIdentifier: row.transaction_type_identifier || '',
        terminalCount: parseInt(row.terminal_count) || 0,
        totalTransactions: parseInt(row.total_transactions) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        lastTransactionDate: row.last_transaction_date || '',
        posRelativeCode: row.pos_relative_code || ''
      }));

      return {
        data: merchants,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error getting TDDF merchants:', error);
      throw error;
    }
  }

  async getTddfMerchantTerminals(merchantAccountNumber: string): Promise<Array<{
    terminalId: string;
    transactionCount: number;
    totalAmount: number;
    lastTransactionDate: string;
  }>> {
    try {
      const tddfRecordsTableName = getTableName('tddf_records');
      
      console.log(`[TDDF MERCHANT TERMINALS] Fetching terminals for merchant: ${merchantAccountNumber} from table: ${tddfRecordsTableName}`);
      
      const query = `
        SELECT 
          terminal_id,
          COUNT(*) as transaction_count,
          SUM(CAST(transaction_amount AS NUMERIC)) as total_amount,
          MAX(transaction_date) as last_transaction_date
        FROM "${tddfRecordsTableName}"
        WHERE merchant_account_number = $1
          AND terminal_id IS NOT NULL 
          AND terminal_id != ''
        GROUP BY terminal_id
        ORDER BY transaction_count DESC
      `;
      
      const result = await pool.query(query, [merchantAccountNumber]);
      
      console.log(`[TDDF MERCHANT TERMINALS] Found ${result.rows.length} terminals for merchant ${merchantAccountNumber}`);
      console.log(`[TDDF MERCHANT TERMINALS] Sample terminal data:`, result.rows.slice(0, 3));
      
      return result.rows.map(row => ({
        terminalId: row.terminal_id || '',
        transactionCount: parseInt(row.transaction_count) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        lastTransactionDate: row.last_transaction_date || ''
      }));
    } catch (error) {
      console.error('Error getting TDDF merchant terminals:', error);
      throw error;
    }
  }

  async getTddfTransactionsByMerchant(merchantAccountNumber: string, options: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
    dateFilter?: string;
  }): Promise<{
    data: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    try {
      const page = options.page || 1;
      const limit = options.limit || 50;
      const offset = (page - 1) * limit;
      const sortBy = options.sortBy || 'transaction_date';
      const sortOrder = options.sortOrder || 'desc';
      const dateFilter = options.dateFilter;
      const tddfJsonbTableName = getTableName('tddf_jsonb');
      
      console.log(`[TDDF MERCHANT TRANSACTIONS JSONB] Fetching paginated transactions for merchant: ${merchantAccountNumber}`);
      console.log(`[TDDF MERCHANT TRANSACTIONS JSONB] Page: ${page}, Limit: ${limit}, Offset: ${offset}, Sort: ${sortBy} ${sortOrder}, Date Filter: ${dateFilter}`);
      
      // Build WHERE clause - filter for DT records only and merchant account number
      let whereClause = `WHERE record_type = 'DT' AND extracted_fields->>'merchantAccountNumber' = $1`;
      const queryParams = [merchantAccountNumber];
      let paramCount = 1;
      
      if (dateFilter) {
        paramCount++;
        whereClause += ` AND DATE(extracted_fields->>'transactionDate') = $${paramCount}`;
        queryParams.push(dateFilter);
      }
      
      // Get total count for pagination
      const countQuery = `
        SELECT COUNT(*) as total
        FROM "${tddfJsonbTableName}"
        ${whereClause}
      `;
      
      const countResult = await pool.query(countQuery, queryParams);
      const totalItems = parseInt(countResult.rows[0].total) || 0;
      const totalPages = Math.ceil(totalItems / limit);
      
      // Build ORDER BY clause - map sort fields to JSONB extracted fields
      const validSortFields = {
        'transaction_date': `(extracted_fields->>'transactionDate')::date`,
        'reference_number': `extracted_fields->>'referenceNumber'`,
        'terminal_identification': `extracted_fields->>'terminalId'`,
        'transaction_amount': `(extracted_fields->>'transactionAmount')::numeric`,
        'card_type': `extracted_fields->>'cardType'`,
        'authorization_number': `extracted_fields->>'authorizationNumber'`
      };
      
      const sortField = validSortFields[sortBy] || `(extracted_fields->>'transactionDate')::date`;
      const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      const orderClause = `ORDER BY ${sortField} ${sortDirection}, id DESC`;
      
      // Get paginated data
      paramCount++;
      const limitParam = paramCount;
      paramCount++;
      const offsetParam = paramCount;
      
      const dataQuery = `
        SELECT 
          id,
          upload_id,
          filename,
          record_type,
          line_number,
          raw_line,
          extracted_fields,
          -- Extract commonly used fields for compatibility
          extracted_fields->>'referenceNumber' as reference_number,
          extracted_fields->>'merchantName' as merchant_name,
          (extracted_fields->>'transactionAmount')::numeric as transaction_amount,
          (extracted_fields->>'transactionDate')::date as transaction_date,
          extracted_fields->>'terminalId' as terminal_id,
          extracted_fields->>'cardType' as card_type,
          extracted_fields->>'authorizationNumber' as authorization_number,
          extracted_fields->>'merchantAccountNumber' as merchant_account_number,
          extracted_fields->>'mccCode' as mcc_code,
          extracted_fields->>'transactionTypeIdentifier' as transaction_type_identifier,
          created_at as recorded_at,
          raw_line as mms_raw_line
        FROM "${tddfJsonbTableName}"
        ${whereClause}
        ${orderClause}
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;
      
      queryParams.push(limit, offset);
      const dataResult = await pool.query(dataQuery, queryParams);
      
      console.log(`[TDDF MERCHANT TRANSACTIONS JSONB] Retrieved ${dataResult.rows.length} transactions (page ${page}/${totalPages}, total: ${totalItems})`);
      
      return {
        data: dataResult.rows,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('[TDDF MERCHANT TRANSACTIONS JSONB] Error fetching transactions:', error);
      throw error;
    }
  }

  async getTddfMerchantDetails(merchantAccountNumber: string): Promise<{
    merchantName: string;
    merchantAccountNumber: string;
    totalTransactions: number;
    totalAmount: number;
    lastTransactionDate: string;
  } | null> {
    try {
      const tddfRecordsTableName = getTableName('tddf_records');
      
      console.log(`[MERCHANT DETAILS] Fetching details for merchant: ${merchantAccountNumber} from table: ${tddfRecordsTableName}`);
      
      const query = `
        SELECT 
          merchant_name,
          merchant_account_number,
          COUNT(*) as total_transactions,
          SUM(CAST(transaction_amount AS NUMERIC)) as total_amount,
          MAX(transaction_date) as last_transaction_date
        FROM "${tddfRecordsTableName}"
        WHERE merchant_account_number = $1
        GROUP BY merchant_name, merchant_account_number
      `;
      
      const result = await pool.query(query, [merchantAccountNumber]);
      
      if (result.rows.length === 0) {
        console.log(`[MERCHANT DETAILS] No merchant found for account number: ${merchantAccountNumber}`);
        return null;
      }
      
      const row = result.rows[0];
      
      console.log(`[MERCHANT DETAILS] Found merchant details:`, {
        merchantName: row.merchant_name,
        totalTransactions: row.total_transactions,
        totalAmount: row.total_amount,
        lastTransactionDate: row.last_transaction_date
      });
      
      return {
        merchantName: row.merchant_name || '',
        merchantAccountNumber: row.merchant_account_number || '',
        totalTransactions: parseInt(row.total_transactions) || 0,
        totalAmount: parseFloat(row.total_amount) || 0,
        lastTransactionDate: row.last_transaction_date || ''
      };
    } catch (error) {
      console.error('Error getting TDDF merchant details:', error);
      throw error;
    }
  }

  async getTddfRecordById(recordId: number): Promise<TddfRecord | undefined> {
    try {
      // @ENVIRONMENT-CRITICAL - TDDF record lookup by ID
      // @DEPLOYMENT-CHECK - Uses environment-aware table naming
      const tddfRecordsTableName = getTableName('tddf_records');
      
      const result = await pool.query(`SELECT * FROM ${tddfRecordsTableName} WHERE id = $1 LIMIT 1`, [recordId]);
      return result.rows[0] || undefined;
    } catch (error) {
      console.error('Error getting TDDF record by ID:', error);
      throw error;
    }
  }

  async createTddfRecord(recordData: InsertTddfRecord): Promise<TddfRecord> {
    try {
      const currentTime = new Date();
      // @ENVIRONMENT-CRITICAL - TDDF record creation with environment-aware table naming
      // @DEPLOYMENT-CHECK - Uses getTableName() for proper dev/production separation
      const tddfRecordsTableName = getTableName('tddf_records');
      const recordToInsert = {
        ...recordData,
        recordedAt: currentTime, // Explicitly set recorded_at to current time for metrics
        createdAt: currentTime,
        updatedAt: currentTime
      };
      
      const columns = Object.keys(recordToInsert).join(', ');
      const values = Object.values(recordToInsert).map((_, index) => `$${index + 1}`).join(', ');
      const result = await pool.query(`INSERT INTO ${tddfRecordsTableName} (${columns}) VALUES (${values}) RETURNING *`, Object.values(recordToInsert));
      const records = result.rows;
      
      return records[0];
    } catch (error) {
      console.error('Error creating TDDF record:', error);
      throw error;
    }
  }

  async upsertTddfRecord(recordData: InsertTddfRecord): Promise<TddfRecord> {
    try {
      // FIXED: Use raw SQL to avoid Drizzle ORM syntax error in UPDATE queries
      // Check if record with same reference number exists using raw SQL
      if (recordData.referenceNumber) {
        const tableName = getTableName('tddf_records');
        
        // Check for existing record
        const existingResult = await pool.query(`
          SELECT id FROM "${tableName}" 
          WHERE reference_number = $1 
          LIMIT 1
        `, [recordData.referenceNumber]);

        if (existingResult.rows.length > 0) {
          const existingId = existingResult.rows[0].id;
          console.log(`🔄 [OVERWRITE] Reference ${recordData.referenceNumber}: Updating existing TDDF record ID ${existingId}`);
          
          // Use raw SQL UPDATE to avoid ORM syntax error
          const currentTime = new Date();
          const updateResult = await pool.query(`
            UPDATE "${tableName}" 
            SET 
              sequence_number = $2,
              entry_run_number = $3,
              sequence_within_run = $4,
              record_identifier = $5,
              bank_number = $6,
              merchant_account_number = $7,
              association_number_1 = $8,
              group_number = $9,
              transaction_code = $10,
              association_number_2 = $11,
              transaction_date = $12,
              transaction_amount = $13,
              batch_julian_date = $14,
              net_deposit = $15,
              cardholder_account_number = $16,
              merchant_name = $17,
              auth_amount = $18,
              source_file_id = $19,
              source_row_number = $20,
              mms_raw_line = $21,
              recorded_at = $22,
              updated_at = $23
            WHERE reference_number = $1
            RETURNING *
          `, [
            recordData.referenceNumber,
            recordData.sequenceNumber,
            recordData.entryRunNumber,
            recordData.sequenceWithinRun,
            recordData.recordIdentifier,
            recordData.bankNumber,
            recordData.merchantAccountNumber,
            recordData.associationNumber1,
            recordData.groupNumber,
            recordData.transactionCode,
            recordData.associationNumber2,
            recordData.transactionDate,
            recordData.transactionAmount,
            recordData.batchJulianDate,
            recordData.netDeposit,
            recordData.cardholderAccountNumber,
            recordData.merchantName,
            recordData.authAmount,
            recordData.sourceFileId,
            recordData.sourceRowNumber,
            recordData.mmsRawLine,
            currentTime,
            currentTime
          ]);
          
          return updateResult.rows[0];
        }
      }

      // Create new record if no match found
      return await this.createTddfRecord(recordData);
    } catch (error) {
      console.error('Error upserting TDDF record:', error);
      throw error;
    }
  }

  // Helper method to record TDDF processing metrics for live chart updates
  async recordTddfProcessingMetrics(recordsProcessed: number, totalRecords: number): Promise<void> {
    try {
      const metricsTableName = getTableName('processing_metrics');
      
      // Calculate records per minute based on current processing rate
      const recordsPerMinute = Math.max(recordsProcessed, 0); // Ensure non-negative
      
      // Insert metrics record for chart data
      await pool.query(`
        INSERT INTO ${metricsTableName} (
          timestamp,
          transactions_per_second,
          peak_transactions_per_second,
          records_per_minute,
          peak_records_per_minute,
          total_files,
          queued_files,
          processed_files,
          files_with_errors,
          currently_processing,
          system_status,
          metric_type,
          notes
        ) VALUES (
          NOW(),
          0,
          0,
          $1,
          $1,
          1,
          0,
          0,
          0,
          1,
          'processing',
          'tddf_raw_import',
          'TDDF raw import processing: ' || $2 || '/' || $3 || ' records'
        )
      `, [recordsPerMinute, recordsProcessed, totalRecords]);
      
    } catch (error) {
      console.error('Error recording TDDF processing metrics:', error);
      // Don't throw - metrics recording failure shouldn't break main processing
    }
  }

  async deleteTddfRecords(recordIds: number[]): Promise<void> {
    try {
      await db
        .delete(tddfRecordsTable)
        .where(inArray(tddfRecordsTable.id, recordIds));
    } catch (error) {
      console.error('Error deleting TDDF records:', error);
      throw error;
    }
  }

  // TDDF Raw Import operations implementation
  async createTddfRawImportRecords(records: InsertTddfRawImport[]): Promise<TddfRawImport[]> {
    try {
      // Use environment-specific table name for raw SQL approach
      const tableName = getTableName('tddf_raw_import');
      
      // Use raw SQL to avoid Drizzle ORM environment issues
      const insertedRecords: TddfRawImport[] = [];
      
      for (const record of records) {
        const insertQuery = `
          INSERT INTO "${tableName}" (
            source_file_id, line_number, raw_line, record_type, 
            record_description, line_length, processed
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;
        
        const result = await pool.query(insertQuery, [
          record.sourceFileId,
          record.lineNumber,
          record.rawLine,
          record.recordType,
          record.recordDescription,
          record.lineLength,
          record.processed || false
        ]);
        
        if (result.rows.length > 0) {
          insertedRecords.push(result.rows[0]);
        }
      }
      
      return insertedRecords;
    } catch (error) {
      console.error('Error creating TDDF raw import records:', error);
      throw error;
    }
  }

  async getTddfRawImportByFileId(fileId: string): Promise<TddfRawImport[]> {
    try {
      // Use environment-specific table name for raw SQL approach
      const tableName = getTableName('tddf_raw_import');
      
      const result = await pool.query(`
        SELECT * FROM "${tableName}"
        WHERE source_file_id = $1
        ORDER BY line_number
      `, [fileId]);
      
      return result.rows;
    } catch (error) {
      console.error('Error getting TDDF raw import records:', error);
      throw error;
    }
  }

  async markRawImportLineProcessed(lineId: number, processedIntoTable: string, processedRecordId: string): Promise<void> {
    try {
      const tableName = getTableName('tddf_raw_import');
      await pool.query(`
        UPDATE "${tableName}" 
        SET processing_status = 'processed',
            processed_into_table = $2,
            processed_record_id = $3,
            processed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [lineId, processedIntoTable, processedRecordId]);
    } catch (error: any) {
      console.error(`Error marking raw import line ${lineId} as processed:`, error);
      throw error;
    }
  }

  async markRawImportLineSkipped(lineId: number, skipReason: string): Promise<void> {
    try {
      const tableName = getTableName('tddf_raw_import');
      await pool.query(`
        UPDATE "${tableName}" 
        SET processing_status = 'skipped',
            skip_reason = $2,
            processed_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `, [lineId, skipReason]);
    } catch (error: any) {
      console.error(`Error marking raw import line ${lineId} as skipped:`, error);
      throw error;
    }
  }

  async processPendingRawTddfLines(batchSize: number = 100): Promise<{ processed: number; skipped: number; errors: number }> {
    try {
      console.log(`[TDDF BACKLOG] Processing up to ${batchSize} pending raw TDDF lines...`);
      
      const tableName = getTableName('tddf_raw_import');
      
      // Get pending DT records to process
      const result = await pool.query(`
        SELECT id, source_file_id, line_number, raw_line, record_type, record_description
        FROM ${tableName}
        WHERE processing_status = 'pending' 
        AND record_type = 'DT'
        ORDER BY source_file_id, line_number
        LIMIT $1
      `, [batchSize]);

      const pendingLines = result.rows;
      let processed = 0;
      let skipped = 0;
      let errors = 0;

      for (const line of pendingLines) {
        try {
          // Process the DT record
          const tddfRecord = this.processTddfLineFromRawData(line.raw_line, line.source_file_id);
          
          if (tddfRecord) {
            // Create TDDF record
            const createdRecord = await this.createTddfRecord(tddfRecord);
            
            // Mark raw line as processed
            await this.markRawImportLineProcessed(line.id, getTableName('tddf_records'), createdRecord.id.toString());
            processed++;
            
            if (processed % 10 === 0) {
              console.log(`[TDDF BACKLOG] Processed ${processed} lines so far...`);
            }
          } else {
            // Skip invalid DT record
            await this.markRawImportLineSkipped(line.id, 'invalid_dt_format');
            skipped++;
          }
          
        } catch (error) {
          console.error(`[TDDF BACKLOG] Error processing line ${line.id}:`, error);
          await this.markRawImportLineSkipped(line.id, `processing_error: ${error instanceof Error ? error.message : 'unknown'}`);
          errors++;
        }
      }

      console.log(`[TDDF BACKLOG] Batch complete - Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
      return { processed, skipped, errors };
      
    } catch (error) {
      console.error('Error processing pending raw TDDF lines:', error);
      throw error;
    }
  }

  // 🚀 CLEAN SINGLE-PATH BULK PROCESSING - All TDDF record types processed at bulk rate on first pass
  async processAllPendingTddfRecordsBulk(batchSize: number = 2000): Promise<{ processed: number; bulkWarnings: number; errors: number; breakdown: Record<string, any> }> {
    try {
      console.log(`🚀 [BULK-FIRST] Single-path bulk processing for ALL record types (${batchSize} records/batch)`);
      console.log(`[CLEAN-ARCH] No fallback logic - bulk processing only, emergency R1 on separate thread`);
      
      // SINGLE PATH: Use high-performance switch-based method for ALL record types
      const switchResult = await this.processPendingTddfRecordsSwitchBased(undefined, batchSize);
      
      console.log(`✅ [BULK-FIRST] Clean bulk processing completed:`);
      console.log(`   • Total Processed: ${switchResult.totalProcessed} (bulk rate)`);
      console.log(`   • Bulk Warnings: ${switchResult.totalSkipped} (problematic batches)`);
      console.log(`   • Critical Errors: ${switchResult.totalErrors} (emergency R1 candidates)`);
      console.log(`   • Processing Time: ${switchResult.processingTime}ms`);
      console.log(`🚀 [CLEAN-ARCH] Single-path bulk processing ensures consistent high performance!`);
      
      // Mark problematic records with bulk processing warnings
      if (switchResult.totalSkipped > 0) {
        await this.markBulkProcessingWarnings(switchResult.breakdown);
      }
      
      // Return clean format for single-path architecture
      return { 
        processed: switchResult.totalProcessed,
        bulkWarnings: switchResult.totalSkipped, 
        errors: switchResult.totalErrors,
        breakdown: switchResult.breakdown
      };
      
    } catch (error) {
      console.error('Error in clean bulk processing:', error);
      throw error;
    }
  }

  // DEPRECATED: Old method redirected to clean bulk processing
  async processNonDtPendingLines(batchSize: number = 2000): Promise<{ skipped: number; errors: number }> {
    console.log(`⚠️  [DEPRECATED] Redirecting to clean bulk processing architecture`);
    const result = await this.processAllPendingTddfRecordsBulk(batchSize);
    return { skipped: result.bulkWarnings, errors: result.errors };
  }

  // 🚀 BULK PROCESSING WARNING SYSTEM - Mark problematic batches for review
  async markBulkProcessingWarnings(breakdown: Record<string, { processed: number; skipped: number; errors: number }>): Promise<void> {
    try {
      console.log(`⚠️  [BULK-WARNING] Marking problematic records with bulk processing warnings`);
      const tableName = getTableName('tddf_raw_import');
      
      for (const [recordType, stats] of Object.entries(breakdown)) {
        if (stats.skipped > 0 || stats.errors > 0) {
          await pool.query(`
            UPDATE "${tableName}"
            SET skip_reason = CASE 
              WHEN skip_reason IS NULL THEN 'BWN001_bulk_processing_warning'
              ELSE skip_reason || '_BWN001_bulk_processing_warning'
            END,
            processing_status = CASE 
              WHEN processing_status = 'pending' THEN 'bulk_warning'
              ELSE processing_status
            END
            WHERE record_type = $1 
              AND processing_status IN ('pending', 'skipped') 
              AND (skip_reason IS NULL OR skip_reason NOT LIKE '%BWN001%')
            LIMIT $2
          `, [recordType, stats.skipped + stats.errors]);
          
          console.log(`⚠️  [BULK-WARNING] Marked ${stats.skipped + stats.errors} ${recordType} records with bulk processing warnings`);
        }
      }
    } catch (error) {
      console.error('Error marking bulk processing warnings:', error);
    }
  }

  // 🆘 EMERGENCY R1 SINGLE-LINE PROCESSING - Separate thread for troubleshooting
  async emergencyR1SingleLineProcessing(recordId: string, recordType: string): Promise<{ success: boolean; errorCode?: string; details?: string }> {
    try {
      console.log(`🆘 [EMERGENCY-R1] Single-line troubleshooting for ${recordType} record ${recordId}`);
      const tableName = getTableName('tddf_raw_import');
      
      // Get the specific record for detailed analysis
      const result = await pool.query(`
        SELECT * FROM "${tableName}" WHERE id = $1
      `, [recordId]);
      
      if (result.rows.length === 0) {
        return { success: false, errorCode: 'REC001', details: 'Record not found' };
      }
      
      const record = result.rows[0];
      
      // Single-threaded detailed processing with error code tracking
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Attempt processing with detailed error tracking
        switch (recordType) {
          case 'DT':
            await this.processDTRecordWithClient(client, record, tableName);
            break;
          case 'BH':
            await this.processBHRecordWithClient(client, record, tableName);
            break;
          case 'P1':
            await this.processP1RecordWithClient(client, record, tableName);
            break;
          case 'E1':
            await this.processE1RecordWithClient(client, record, tableName);
            break;
          case 'G2':
            await this.processG2RecordWithClient(client, record, tableName);
            break;
          default:
            throw new Error(`Unknown record type: ${recordType}`);
        }
        
        await client.query('COMMIT');
        console.log(`✅ [EMERGENCY-R1] Successfully processed ${recordType} record ${recordId}`);
        return { success: true };
        
      } catch (error: any) {
        await client.query('ROLLBACK');
        
        // Classify error and assign error code
        let errorCode = 'SYS002'; // Default system error
        if (error.message.includes('column') && error.message.includes('does not exist')) {
          errorCode = 'SCH001';
        } else if (error.message.includes('invalid input syntax')) {
          errorCode = 'FLD002';
        } else if (error.message.includes('timeout')) {
          errorCode = 'SYS002';
        }
        
        console.log(`🆘 [EMERGENCY-R1] Failed to process ${recordType} record ${recordId}: ${error.message}`);
        console.log(`🆘 [EMERGENCY-R1] Assigned error code: ${errorCode}`);
        
        return { success: false, errorCode, details: error.message };
        
      } finally {
        client.release();
      }
      
    } catch (error: any) {
      console.error(`🆘 [EMERGENCY-R1] Critical error in single-line processing:`, error);
      return { success: false, errorCode: 'SYS001', details: error.message };
    }
  }

  async getTddfRawProcessingStatus(): Promise<{ total: number; processed: number; pending: number; skipped: number; errors: number }> {
    try {
      const tableName = getTableName('tddf_raw_import');
      
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN processing_status = 'processed' THEN 1 ELSE 0 END), 0) as processed,
          COALESCE(SUM(CASE WHEN processing_status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
          COALESCE(SUM(CASE WHEN processing_status = 'skipped' THEN 1 ELSE 0 END), 0) as skipped,
          COALESCE(SUM(CASE WHEN processing_status = 'error' THEN 1 ELSE 0 END), 0) as errors
        FROM ${tableName}
      `);

      const row = result.rows[0];
      return {
        total: Number(row.total) || 0,
        processed: Number(row.processed) || 0,
        pending: Number(row.pending) || 0,
        skipped: Number(row.skipped) || 0,
        errors: Number(row.errors) || 0
      };
    } catch (error) {
      console.error('Error getting TDDF raw processing status:', error);
      throw error;
    }
  }

  // Process pending BH records from raw import into hierarchical table with transactional integrity
  async processPendingTddfBhRecords(fileId?: string, maxRecords?: number): Promise<{ processed: number; skipped: number; errors: number }> {
    console.log(`=================== TDDF BH PROCESSING (HIERARCHICAL TRANSACTIONAL) ===================`);
    console.log(`Processing pending BH records from raw import table into hierarchical table with atomic transactions`);
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    try {
      const tableName = getTableName('tddf_raw_import');
      
      // Get pending BH records using pool query for consistency with DT processing
      let whereClause = `WHERE processing_status = 'pending' AND record_type = 'BH'`;
      const queryParams: any[] = [];
      
      if (fileId) {
        whereClause += ` AND source_file_id = $${queryParams.length + 1}`;
        queryParams.push(fileId);
      }
      
      let query = `SELECT * FROM "${tableName}" ${whereClause} ORDER BY line_number`;
      
      if (maxRecords) {
        query += ` LIMIT $${queryParams.length + 1}`;
        queryParams.push(maxRecords);
      }
      
      const result = await pool.query(query, queryParams);
      const bhRecords = result.rows;
      
      console.log(`Found ${bhRecords.length} pending BH records to process with transactional integrity`);
      
      const batchHeaderTableName = getTableName('tddf_batch_headers');
      
      // Process each BH record within its own transaction for atomic integrity  
      for (const rawLine of bhRecords) {
        // Begin transaction for this BH record
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          console.log(`[BH TRANSACTION] Starting transaction for line ${rawLine.line_number}`);
          
          const line = rawLine.raw_line;
          
          // Parse BH record into hierarchical batch header format with complete field extraction
          const bhRecord = {
            bh_record_number: `BH_${rawLine.source_file_id}_${rawLine.line_number}`, // Use column that exists
            record_identifier: line.substring(17, 19).trim() || null,
            merchant_account_number: line.substring(23, 39).trim() || null,
            // BH-specific fields based on TDDF specification  
            transaction_code: line.substring(51, 55).trim() || null, // Positions 52-55 (4 chars)
            batch_date: line.substring(55, 63).trim() || null, // Positions 56-63 (8 chars MMDDCCYY) 
            batch_julian_date: line.substring(63, 68).trim() || null, // Positions 64-68 (5 chars)
            net_deposit: this.parseAuthAmount(line.substring(68, 83).trim()) || null, // Positions 69-83 (15 chars N) - Net Deposit
            batch_id: line.substring(123, 126).trim() || null, // Positions 124-126 (3 chars)
            reject_reason: line.substring(83, 87).trim() || null, // Positions 84-87 (4 chars AN)
            source_file_id: rawLine.source_file_id,
            source_row_number: rawLine.line_number,
            raw_data: { rawLine: line } // Store complete raw line for reference
          };
          
          // Validate this is a BH record
          if (bhRecord.record_identifier !== 'BH') {
            throw new Error(`Invalid record type: ${bhRecord.record_identifier}, expected 'BH'`);
          }
          
          // Insert BH record into hierarchical table within transaction with duplicate handling
          const insertResult = await client.query(`
            INSERT INTO "${batchHeaderTableName}" (
              bh_record_number,
              record_identifier,
              merchant_account_number,
              transaction_code,
              batch_date,
              batch_julian_date,
              net_deposit,
              reject_reason,
              source_file_id,
              source_row_number,
              raw_data,
              recorded_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (bh_record_number) DO UPDATE SET
              recorded_at = EXCLUDED.recorded_at
            RETURNING id
          `, [
            bhRecord.bh_record_number,
            bhRecord.record_identifier,
            bhRecord.merchant_account_number,
            bhRecord.transaction_code,
            bhRecord.batch_date,
            bhRecord.batch_julian_date,
            bhRecord.net_deposit,
            bhRecord.reject_reason,
            bhRecord.source_file_id,
            bhRecord.source_row_number,
            bhRecord.raw_data,
            new Date()
          ]);
          
          const createdRecordId = insertResult.rows[0].id;
          
          // Update raw line processing status within same transaction
          await client.query(`
            UPDATE "${tableName}" 
            SET processing_status = 'processed',
                processed_into_table = $1,
                processed_record_id = $2,
                processed_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [batchHeaderTableName, createdRecordId.toString(), rawLine.id]);
          
          // Commit transaction
          await client.query('COMMIT');
          console.log(`[BH TRANSACTION] Committed BH record ${createdRecordId} from line ${rawLine.line_number}`);
          
          processed++;
          
          if (processed % 10 === 0) {
            console.log(`[BH TRANSACTIONAL] Processed ${processed} BH records so far with atomic integrity...`);
          }
          
        } catch (error) {
          // Rollback transaction on error
          await client.query('ROLLBACK');
          console.error(`[BH TRANSACTION] Rolled back transaction for line ${rawLine.line_number}:`, error);
          errors++;
          
          // Mark as skipped using pool connection (outside transaction)
          try {
            await pool.query(`
              UPDATE "${tableName}" 
              SET processing_status = 'skipped',
                  skip_reason = $1,
                  processed_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [`transactional_error: ${error instanceof Error ? error.message : 'unknown'}`, rawLine.id]);
          } catch (skipError) {
            console.error(`[BH TRANSACTION] Failed to mark line as skipped:`, skipError);
          }
          
        } finally {
          // Always release the client back to the pool
          client.release();
        }
      }

      console.log(`[BH TRANSACTIONAL] Batch complete - Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
      return { processed, skipped, errors };
      
    } catch (error) {
      console.error('Error processing pending BH records with transactional integrity:', error);
      throw error;
    }
  }

  // Process pending P1 (Purchasing Extension) records from raw import into hierarchical table with transactional integrity
  async processPendingTddfP1Records(fileId?: string, maxRecords?: number): Promise<{ processed: number; skipped: number; errors: number }> {
    console.log(`=================== TDDF P1 PROCESSING (HIERARCHICAL TRANSACTIONAL) ===================`);
    console.log(`Processing pending P1 records from raw import table into hierarchical table with atomic transactions`);
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    const isProduction = process.env.NODE_ENV === 'production';
    const purchasingExtensionsTableName = isProduction ? 'tddf_purchasing_extensions' : 'dev_tddf_purchasing_extensions';
    const rawImportTableName = isProduction ? 'tddf_raw_import' : 'dev_tddf_raw_import';
    
    try {
      // Get pending P1 records from raw import table
      let query = `
        SELECT * FROM "${rawImportTableName}" 
        WHERE record_type = 'P1' 
          AND processing_status = 'pending'
      `;
      
      const queryParams: any[] = [];
      
      if (fileId) {
        query += ` AND source_file_id = $${queryParams.length + 1}`;
        queryParams.push(fileId);
      }
      
      query += ` ORDER BY line_number`;
      
      if (maxRecords) {
        query += ` LIMIT $${queryParams.length + 1}`;
        queryParams.push(maxRecords);
      }
      
      const result = await pool.query(query, queryParams);
      const p1Records = result.rows;
      
      console.log(`Found ${p1Records.length} pending P1 records to process`);
      
      if (p1Records.length === 0) {
        console.log(`No pending P1 records found`);
        return { processed: 0, skipped: 0, errors: 0 };
      }
      
      // Process each P1 record with individual transactions for atomic integrity
      for (const rawRecord of p1Records) {
        const client = await pool.connect();
        
        try {
          await client.query('BEGIN');
          
          // Parse P1 record from TDDF fixed-width format
          const line = rawRecord.raw_line;
          
          // Parse P1 purchasing extension fields from TDDF specification (positions 1-700)
          const p1Record = {
            // Core TDDF header fields (positions 1-19)
            sequence_number: line.substring(0, 7).trim() || null, // Positions 1-7
            entry_run_number: line.substring(7, 13).trim() || null, // Positions 8-13  
            sequence_within_run: line.substring(13, 17).trim() || null, // Positions 14-17
            record_identifier: line.substring(17, 19).trim() || null, // Positions 18-19: "P1"
            
            // P1 specific fields based on detailed TDDF specification
            tax_amount: this.parseAmount(line.substring(19, 31).trim()) || null, // Positions 20-31: Tax amount (12 chars N)
            tax_rate: this.parseAmount(line.substring(31, 38).trim()) || null, // Positions 32-38: Tax rate (7 chars N)
            tax_type: line.substring(38, 39).trim() || null, // Position 39: Tax type indicator
            
            // Purchasing Card Level 2 Data
            purchase_identifier: line.substring(39, 64).trim() || null, // Positions 40-64: Purchase identifier (25 chars AN)
            customer_code: line.substring(64, 89).trim() || null, // Positions 65-89: Customer code (25 chars AN)
            sales_tax: this.parseAmount(line.substring(89, 101).trim()) || null, // Positions 90-101: Sales tax amount (12 chars N)
            freight_amount: this.parseAmount(line.substring(113, 125).trim()) || null, // Positions 114-125: Freight amount (12 chars N)
            destination_zip: line.substring(125, 135).trim() || null, // Positions 126-135: Destination ZIP (10 chars N)
            merchant_type: line.substring(135, 139).trim() || null, // Positions 136-139: Merchant type (4 chars AN)
            duty_amount: this.parseAmount(line.substring(139, 151).trim()) || null, // Positions 140-151: Duty amount (12 chars N)
            merchant_tax_id: line.substring(151, 161).trim() || null, // Positions 152-161: Merchant tax ID (10 chars AN)
            ship_from_zip_code: line.substring(161, 171).trim() || null, // Positions 162-171: Ship from ZIP (10 chars N)
            national_tax_included: line.substring(171, 172).trim() || null, // Position 172: National tax included (1 char N)
            national_tax_amount: this.parseAmount(line.substring(172, 184).trim()) || null, // Positions 173-184: National/ALT tax amount (12 chars N)
            other_tax: this.parseAmount(line.substring(184, 196).trim()) || null, // Positions 185-196: Other tax (12 chars N)
            destination_country_code: line.substring(196, 199).trim() || null, // Positions 197-199: Destination country code (3 chars AN)
            merchant_reference_number: line.substring(199, 216).trim() || null, // Positions 200-216: Merchant reference number (17 chars N)
            discount_amount: this.parseAmount(line.substring(216, 228).trim()) || null, // Positions 217-228: Discount amount (12 chars N)
            merchant_vat_registration: line.substring(228, 248).trim() || null, // Positions 229-248: Merchant VAT registration (20 chars AN)
            customer_vat_registration: line.substring(248, 261).trim() || null, // Positions 249-261: Customer VAT registration (13 chars AN)
            summary_commodity_code: line.substring(261, 265).trim() || null, // Positions 262-265: Summary commodity code (4 chars N)
            vat_invoice_reference_number: line.substring(265, 280).trim() || null, // Positions 266-280: VAT invoice reference number (15 chars N)
            order_date: line.substring(280, 286).trim() || null, // Positions 281-286: Order date (6 chars N) MMDDYY
            detail_record_to_follow: line.substring(286, 287).trim() || null, // Position 287: Detail record to follow (1 char AN)
            
            // System fields
            source_file_id: rawRecord.source_file_id,
            source_row_number: rawRecord.line_number,
            raw_data: JSON.stringify({ rawLine: line }),
            mms_raw_line: line,
            recorded_at: new Date()
          };
          
          // Validate record identifier
          if (p1Record.record_identifier !== 'P1') {
            throw new Error(`Invalid record type: ${p1Record.record_identifier}, expected 'P1'`);
          }
          
          // Insert P1 record into hierarchical table within transaction with proper field mapping
          const insertResult = await client.query(`
            INSERT INTO "${purchasingExtensionsTableName}" (
              sequence_number,
              entry_run_number,
              sequence_within_run,
              record_identifier,
              tax_amount,
              tax_rate,
              tax_type,
              purchase_identifier,
              customer_code,
              sales_tax,
              freight_amount,
              destination_zip,
              merchant_type,
              duty_amount,
              merchant_tax_id,
              ship_from_zip_code,
              national_tax_included,
              national_tax_amount,
              other_tax,
              destination_country_code,
              merchant_reference_number,
              discount_amount,
              merchant_vat_registration,
              customer_vat_registration,
              summary_commodity_code,
              vat_invoice_reference_number,
              order_date,
              detail_record_to_follow,
              source_file_id,
              source_row_number,
              raw_data,
              mms_raw_line,
              recorded_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
            RETURNING id
          `, [
            p1Record.sequence_number,
            p1Record.entry_run_number,
            p1Record.sequence_within_run,
            p1Record.record_identifier,
            p1Record.tax_amount,
            p1Record.tax_rate,
            p1Record.tax_type,
            p1Record.purchase_identifier,
            p1Record.customer_code,
            p1Record.sales_tax,
            p1Record.freight_amount,
            p1Record.destination_zip,
            p1Record.merchant_type,
            p1Record.duty_amount,
            p1Record.merchant_tax_id,
            p1Record.ship_from_zip_code,
            p1Record.national_tax_included,
            p1Record.national_tax_amount,
            p1Record.other_tax,
            p1Record.destination_country_code,
            p1Record.merchant_reference_number,
            p1Record.discount_amount,
            p1Record.merchant_vat_registration,
            p1Record.customer_vat_registration,
            p1Record.summary_commodity_code,
            p1Record.vat_invoice_reference_number,
            p1Record.order_date,
            p1Record.detail_record_to_follow,
            p1Record.source_file_id,
            p1Record.source_row_number,
            p1Record.raw_data,
            p1Record.mms_raw_line,
            p1Record.recorded_at
          ]);
          
          const p1Id = insertResult.rows[0].id;
          
          // Update raw import line status within same transaction
          await client.query(`
            UPDATE "${rawImportTableName}"
            SET processing_status = 'processed',
                processed_into_table = '${purchasingExtensionsTableName}',
                processed_record_id = $1,
                processed_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [p1Id.toString(), rawRecord.id]);
          
          await client.query('COMMIT');
          processed++;
          
          console.log(`✅ P1 Record ${p1Record.record_identifier} (seq: ${p1Record.sequence_number}) processed successfully (ID: ${p1Id})`);
          
        } catch (recordError: any) {
          await client.query('ROLLBACK');
          console.error(`❌ P1 Record processing failed for line ${rawRecord.line_number}:`, recordError);
          
          // Mark as skipped using pool connection (outside transaction to prevent deadlocks)
          try {
            await pool.query(`
              UPDATE "${rawImportTableName}"
              SET processing_status = 'skipped',
                  skip_reason = 'p1_processing_error: ' || $1,
                  processed_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [recordError.message?.substring(0, 200) || 'Unknown error', rawRecord.id]);
            skipped++;
          } catch (skipError) {
            console.error(`Failed to mark P1 record as skipped:`, skipError);
            errors++;
          }
          
        } finally {
          client.release();
        }
      }
      
      console.log(`\n=================== P1 PROCESSING COMPLETE ===================`);
      console.log(`Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);
      
    } catch (error: any) {
      console.error(`Error in P1 processing:`, error);
      throw error;
    }
    
    return { processed, skipped, errors };
  }

  // Helper method to process a single P1 record with client
  private async processP1RecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const purchasingExtensionsTableName = getTableName('tddf_purchasing_extensions');
    
    // Parse P1 record from TDDF fixed-width format
    const line = rawRecord.raw_line;
    
    // Parse P1 purchasing extension fields from TDDF specification (positions 1-700)
    const p1Record = {
      // Core TDDF header fields (positions 1-19)
      sequence_number: line.substring(0, 7).trim() || null, // Positions 1-7
      entry_run_number: line.substring(7, 13).trim() || null, // Positions 8-13  
      sequence_within_run: line.substring(13, 17).trim() || null, // Positions 14-17
      record_identifier: line.substring(17, 19).trim() || null, // Positions 18-19: "P1"
      
      // P1 specific fields based on detailed TDDF specification
      tax_amount: this.parseAmount(line.substring(19, 31).trim()) || null, // Positions 20-31: Tax amount (12 chars N)
      tax_rate: this.parseAmount(line.substring(31, 38).trim()) || null, // Positions 32-38: Tax rate (7 chars N)
      tax_type: line.substring(38, 39).trim() || null, // Position 39: Tax type indicator
      
      // Purchasing Card Level 2 Data
      purchase_identifier: line.substring(39, 64).trim() || null, // Positions 40-64: Purchase identifier (25 chars AN)
      customer_code: line.substring(64, 89).trim() || null, // Positions 65-89: Customer code (25 chars AN)
      sales_tax: this.parseAmount(line.substring(89, 101).trim()) || null, // Positions 90-101: Sales tax amount (12 chars N)
      freight_amount: this.parseAmount(line.substring(113, 125).trim()) || null, // Positions 114-125: Freight amount (12 chars N)
      destination_zip: line.substring(125, 135).trim() || null, // Positions 126-135: Destination ZIP (10 chars N)
      merchant_type: line.substring(135, 139).trim() || null, // Positions 136-139: Merchant type (4 chars AN)
      duty_amount: this.parseAmount(line.substring(139, 151).trim()) || null, // Positions 140-151: Duty amount (12 chars N)
      merchant_tax_id: line.substring(151, 161).trim() || null, // Positions 152-161: Merchant tax ID (10 chars AN)
      ship_from_zip_code: line.substring(161, 171).trim() || null, // Positions 162-171: Ship from ZIP (10 chars N)
      national_tax_included: line.substring(171, 172).trim() || null, // Position 172: National tax included (1 char N)
      national_tax_amount: this.parseAmount(line.substring(172, 184).trim()) || null, // Positions 173-184: National/ALT tax amount (12 chars N)
      other_tax: this.parseAmount(line.substring(184, 196).trim()) || null, // Positions 185-196: Other tax (12 chars N)
      destination_country_code: line.substring(196, 199).trim() || null, // Positions 197-199: Destination country code (3 chars AN)
      merchant_reference_number: line.substring(199, 216).trim() || null, // Positions 200-216: Merchant reference number (17 chars N)
      discount_amount: this.parseAmount(line.substring(216, 228).trim()) || null, // Positions 217-228: Discount amount (12 chars N)
      merchant_vat_registration: line.substring(228, 248).trim() || null, // Positions 229-248: Merchant VAT registration (20 chars AN)
      customer_vat_registration: line.substring(248, 261).trim() || null, // Positions 249-261: Customer VAT registration (13 chars AN)
      summary_commodity_code: line.substring(261, 265).trim() || null, // Positions 262-265: Summary commodity code (4 chars N)
      vat_invoice_reference_number: line.substring(265, 280).trim() || null, // Positions 266-280: VAT invoice reference number (15 chars N)
      order_date: line.substring(280, 286).trim() || null, // Positions 281-286: Order date (6 chars N) MMDDYY
      detail_record_to_follow: line.substring(286, 287).trim() || null, // Position 287: Detail record to follow (1 char AN)
      
      // System fields
      source_file_id: rawRecord.source_file_id,
      source_row_number: rawRecord.line_number,
      raw_data: JSON.stringify({ rawLine: line }),
      mms_raw_line: line,
      recorded_at: new Date()
    };
    
    // Validate record identifier
    if (p1Record.record_identifier !== 'P1') {
      throw new Error(`Invalid record type: ${p1Record.record_identifier}, expected 'P1'`);
    }
    
    // Insert P1 record into hierarchical table within transaction with proper field mapping
    const insertResult = await client.query(`
      INSERT INTO "${purchasingExtensionsTableName}" (
        sequence_number,
        entry_run_number,
        sequence_within_run,
        record_identifier,
        tax_amount,
        tax_rate,
        tax_type,
        purchase_identifier,
        customer_code,
        sales_tax,
        freight_amount,
        destination_zip,
        merchant_type,
        duty_amount,
        merchant_tax_id,
        ship_from_zip_code,
        national_tax_included,
        national_tax_amount,
        other_tax,
        destination_country_code,
        merchant_reference_number,
        discount_amount,
        merchant_vat_registration,
        customer_vat_registration,
        summary_commodity_code,
        vat_invoice_reference_number,
        order_date,
        detail_record_to_follow,
        source_file_id,
        source_row_number,
        raw_data,
        mms_raw_line,
        recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)
      RETURNING id
    `, [
      p1Record.sequence_number,
      p1Record.entry_run_number,
      p1Record.sequence_within_run,
      p1Record.record_identifier,
      p1Record.tax_amount,
      p1Record.tax_rate,
      p1Record.tax_type,
      p1Record.purchase_identifier,
      p1Record.customer_code,
      p1Record.sales_tax,
      p1Record.freight_amount,
      p1Record.destination_zip,
      p1Record.merchant_type,
      p1Record.duty_amount,
      p1Record.merchant_tax_id,
      p1Record.ship_from_zip_code,
      p1Record.national_tax_included,
      p1Record.national_tax_amount,
      p1Record.other_tax,
      p1Record.destination_country_code,
      p1Record.merchant_reference_number,
      p1Record.discount_amount,
      p1Record.merchant_vat_registration,
      p1Record.customer_vat_registration,
      p1Record.summary_commodity_code,
      p1Record.vat_invoice_reference_number,
      p1Record.order_date,
      p1Record.detail_record_to_follow,
      p1Record.source_file_id,
      p1Record.source_row_number,
      p1Record.raw_data,
      p1Record.mms_raw_line,
      p1Record.recorded_at
    ]);
    
    const p1Id = insertResult.rows[0].id;
    
    // Update raw import line status within same transaction
    await client.query(`
      UPDATE "${tableName}"
      SET processing_status = 'processed',
          processed_into_table = '${purchasingExtensionsTableName}',
          processed_record_id = $1,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [p1Id.toString(), rawRecord.id]);
    
    console.log(`✅ P1 Record ${p1Record.record_identifier} (seq: ${p1Record.sequence_number}) processed successfully (ID: ${p1Id})`);
  }

  // Helper method to process P2 (Purchasing Card 2 Extension) records
  private async processP2RecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const purchasingExtensions2TableName = getTableName('tddf_purchasing_extensions_2');
    
    // Parse P2 fields from TDDF specification positions
    const p2Record = {
      sequence_number: line.substring(0, 7).trim() || null, // Positions 1-7
      entry_run_number: line.substring(7, 13).trim() || null, // Positions 8-13
      sequence_within_run: line.substring(13, 17).trim() || null, // Positions 14-17
      record_identifier: line.substring(17, 19).trim() || null, // Positions 18-19: "P2"
      bank_number: line.substring(19, 23).trim() || null, // Positions 20-23
      merchant_account_number: line.substring(23, 39).trim() || null, // Positions 24-39
      association_number: line.substring(39, 45).trim() || null, // Positions 40-45
      group_number: line.substring(45, 51).trim() || null, // Positions 46-51
      transaction_code: line.substring(51, 55).trim() || null, // Positions 52-55
      reserved_future_use_1: line.substring(55, 74).trim() || null, // Positions 56-74
      discount_amount_indicator: line.substring(74, 75).trim() || null, // Position 75
      discount_amount: this.parseAuthAmount(line.substring(75, 84).trim()) || null, // Positions 76-84
      alternate_tax_identifier: line.substring(84, 99).trim() || null, // Positions 85-99
      product_code: line.substring(99, 111).trim() || null, // Positions 100-111
      reserved_future_use_2: line.substring(111, 114).trim() || null, // Positions 112-114
      item_description: line.substring(114, 149).trim() || null, // Positions 115-149
      item_quantity: this.parseNumeric(line.substring(149, 161).trim()) || null, // Positions 150-161
      item_unit_of_measure: this.parseNumeric(line.substring(161, 173).trim()) || null, // Positions 162-173
      unit_cost: this.parseAuthAmount(line.substring(173, 185).trim()) || null, // Positions 174-185
      net_gross_indicator: line.substring(185, 186).trim() || null, // Position 186
      vat_rate_applied: this.parseVatRate(line.substring(186, 191).trim()) || null, // Positions 187-191
      vat_type_applied: line.substring(191, 195).trim() || null, // Positions 192-195
      vat_amount: this.parseAuthAmount(line.substring(195, 207).trim()) || null, // Positions 196-207
      debit_credit_indicator: line.substring(207, 208).trim() || null, // Position 208
      type_of_supply: line.substring(208, 210).trim() || null, // Positions 209-210
      extension_record_indicator: line.substring(210, 211).trim() || null, // Position 211
      item_commodity_code: this.parseNumeric(line.substring(211, 223).trim()) || null, // Positions 212-223
      line_item_total: this.parseAuthAmount(line.substring(223, 235).trim()) || null, // Positions 224-235
      item_descriptor: line.substring(235, 261).trim() || null, // Positions 236-261
      reserved_future_use_3: line.substring(261, 700).trim() || null, // Positions 262-700
      source_file_id: rawRecord.source_file_id,
      source_row_number: rawRecord.line_number,
      raw_data: JSON.stringify({ rawLine: line }),
      mms_raw_line: line,
      recorded_at: new Date()
    };

    // Insert P2 record into purchasing extensions 2 table
    const insertResult = await client.query(`
      INSERT INTO "${purchasingExtensions2TableName}" (
        sequence_number,
        entry_run_number,
        sequence_within_run,
        record_identifier,
        bank_number,
        merchant_account_number,
        association_number,
        group_number,
        transaction_code,
        reserved_future_use_1,
        discount_amount_indicator,
        discount_amount,
        alternate_tax_identifier,
        product_code,
        reserved_future_use_2,
        item_description,
        item_quantity,
        item_unit_of_measure,
        unit_cost,
        net_gross_indicator,
        vat_rate_applied,
        vat_type_applied,
        vat_amount,
        debit_credit_indicator,
        type_of_supply,
        extension_record_indicator,
        item_commodity_code,
        line_item_total,
        item_descriptor,
        reserved_future_use_3,
        source_file_id,
        source_row_number,
        raw_data,
        mms_raw_line,
        recorded_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35)
      RETURNING id
    `, [
      p2Record.sequence_number,
      p2Record.entry_run_number,
      p2Record.sequence_within_run,
      p2Record.record_identifier,
      p2Record.bank_number,
      p2Record.merchant_account_number,
      p2Record.association_number,
      p2Record.group_number,
      p2Record.transaction_code,
      p2Record.reserved_future_use_1,
      p2Record.discount_amount_indicator,
      p2Record.discount_amount,
      p2Record.alternate_tax_identifier,
      p2Record.product_code,
      p2Record.reserved_future_use_2,
      p2Record.item_description,
      p2Record.item_quantity,
      p2Record.item_unit_of_measure,
      p2Record.unit_cost,
      p2Record.net_gross_indicator,
      p2Record.vat_rate_applied,
      p2Record.vat_type_applied,
      p2Record.vat_amount,
      p2Record.debit_credit_indicator,
      p2Record.type_of_supply,
      p2Record.extension_record_indicator,
      p2Record.item_commodity_code,
      p2Record.line_item_total,
      p2Record.item_descriptor,
      p2Record.reserved_future_use_3,
      p2Record.source_file_id,
      p2Record.source_row_number,
      p2Record.raw_data,
      p2Record.mms_raw_line,
      p2Record.recorded_at
    ]);
    
    const p2Id = insertResult.rows[0].id;
    
    // Update raw import line status within same transaction
    await client.query(`
      UPDATE "${tableName}"
      SET processing_status = 'processed',
          processed_into_table = '${purchasingExtensions2TableName}',
          processed_record_id = $1,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [p2Id.toString(), rawRecord.id]);
    
    console.log(`✅ P2 Record ${p2Record.record_identifier} (seq: ${p2Record.sequence_number}) processed successfully (ID: ${p2Id})`);
  }

  // Helper method to parse VAT rate (4 decimal places)
  private parseVatRate(value: string): number | null {
    if (!value || value.trim() === '') return null;
    const cleaned = value.replace(/[^\d.]/g, '');
    if (cleaned === '') return null;
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed / 10000; // Convert from format 9999 to decimal
  }

  // Helper method to parse numeric values without decimal places
  private parseNumeric(value: string): number | null {
    if (!value || value.trim() === '') return null;
    const cleaned = value.replace(/[^\d]/g, '');
    if (cleaned === '') return null;
    const parsed = parseInt(cleaned);
    return isNaN(parsed) ? null : parsed;
  }

  // Helper method to process a single BH line from raw data
  private processBhLineFromRawData(rawLine: string, sourceFileId: string, sourceRowNumber: number): InsertTddfBatchHeader | null {
    try {
      if (!rawLine || rawLine.length < 100) {
        return null;
      }

      // Extract BH fields from fixed-width positions based on TDDF specification
      const sequenceNumber = rawLine.substring(0, 7).trim() || null;
      const entryRunNumber = rawLine.substring(7, 13).trim() || null;
      const sequenceWithinRun = rawLine.substring(13, 17).trim() || null;
      const recordIdentifier = rawLine.substring(17, 19).trim() || null;
      const bankNumber = rawLine.substring(19, 23).trim() || null;
      
      // Batch-specific fields
      const merchantAccountNumber = rawLine.substring(23, 39).trim() || null;
      
      // BH-specific fields based on TDDF specification
      const transactionCode = rawLine.substring(51, 55).trim() || null; // Positions 52-55 (4 chars)
      const batchDate = rawLine.substring(55, 60).trim() || null; // Positions 56-60 (5 chars)
      const batchJulianDate = rawLine.substring(60, 65).trim() || null; // Positions 61-65 (5 chars)
      const netDeposit = this.parseAuthAmount(rawLine.substring(68, 83).trim()) || null; // Positions 69-83 (15 chars N)
      const rejectReason = rawLine.substring(83, 87).trim() || null; // Positions 84-87 (4 chars AN)

      // Validate this is a BH record
      if (recordIdentifier !== 'BH') {
        return null;
      }

      return {
        sequenceNumber,
        entryRunNumber,
        sequenceWithinRun,
        recordIdentifier,
        bankNumber,
        merchantAccountNumber,
        transactionCode,
        batchDate,
        batchJulianDate,
        netDeposit,
        rejectReason,
        sourceFileId,
        sourceRowNumber,
        rawData: JSON.parse(JSON.stringify({ rawLine })) // Store complete raw line for reference
      };

    } catch (error) {
      console.error('Error processing BH line from raw data:', error);
      return null;
    }
  }

  // 🚀 ADVANCED DATA STRUCTURES - High-performance bulk processing with optimized filtering
  async processPendingTddfRecordsSwitchBased(
    fileId?: string,
    batchSize: number = 2000  // CLEAN ARCHITECTURE: Standardized bulk batch size
  ): Promise<{
    totalProcessed: number;
    totalSkipped: number;
    totalErrors: number;
    breakdown: Record<string, { processed: number; skipped: number; errors: number }>;
    processingTime: number;
  }> {
    const startTime = Date.now();
    console.log(`=================== ADVANCED DATA STRUCTURES BULK PROCESSING ===================`);
    console.log(`🚀 BULK-FIRST: Processing ALL record types with advanced filtering (${batchSize} records/batch)`);
    
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const breakdown: Record<string, { processed: number; skipped: number; errors: number }> = {};
    
    try {
      const tableName = getTableName('tddf_raw_import');
      
      // ADVANCED FILTERING: Use optimized index-based query for maximum performance
      const queryParams: any[] = [];
      let query = `
        SELECT id, record_type, raw_line, source_file_id, line_number, created_at
        FROM "${tableName}" 
        WHERE processing_status = 'pending'
      `;
      
      if (fileId) {
        query += ` AND source_file_id = $${queryParams.length + 1}`;
        queryParams.push(fileId);
      }
      
      // Use optimized index for line_number ordering (leverages idx_tddf_pending_line_order_optimized)
      query += ` ORDER BY line_number, id LIMIT $${queryParams.length + 1}`;
      queryParams.push(batchSize);
      
      const result = await pool.query(query, queryParams);
      const pendingRecords = result.rows;
      
      console.log(`[ADVANCED-FILTER] Found ${pendingRecords.length} pending records using optimized index scan`);
      console.log(`[ADVANCED-FILTER] Record types: ${[...new Set(pendingRecords.map(r => r.record_type))].join(', ')}`);
      
      // 🔧 ADVANCED DATA STRUCTURES: High-performance filtering and grouping
      
      // 1. Hash Map for O(1) record type lookup and grouping
      const recordTypeMap = new Map<string, any[]>();
      
      // 2. Set for O(1) duplicate checking
      const processedIds = new Set<number>();
      
      // 3. Priority Queue structure for processing order optimization
      const processingPriority = ['DT', 'BH', 'P1', 'P2', 'G2', 'E1', 'AD', 'DR', 'CK', 'LG', 'GE'];
      const priorityMap = new Map(processingPriority.map((type, index) => [type, index]));
      
      // 4. Efficient batch organization using advanced data structures
      const recordBatches = new Map<string, {
        records: any[];
        priority: number;
        estimatedProcessingTime: number;
      }>();
      
      // Group records using hash map for O(1) insertions
      for (const rawRecord of pendingRecords) {
        const recordType = rawRecord.record_type;
        
        // Initialize breakdown for this record type
        if (!breakdown[recordType]) {
          breakdown[recordType] = { processed: 0, skipped: 0, errors: 0 };
        }
        
        // Use Map for O(1) grouping instead of object property access
        if (!recordTypeMap.has(recordType)) {
          recordTypeMap.set(recordType, []);
        }
        recordTypeMap.get(recordType)!.push(rawRecord);
        
        // Build batch information with priority and estimated processing time
        if (!recordBatches.has(recordType)) {
          recordBatches.set(recordType, {
            records: [],
            priority: priorityMap.get(recordType) ?? 999,
            estimatedProcessingTime: this.getEstimatedProcessingTimeMs(recordType)
          });
        }
        recordBatches.get(recordType)!.records.push(rawRecord);
      }
      
      // 5. Sort record types by priority for optimal processing order
      const sortedRecordTypes = Array.from(recordTypeMap.keys()).sort((a, b) => {
        const priorityA = priorityMap.get(a) ?? 999;
        const priorityB = priorityMap.get(b) ?? 999;
        return priorityA - priorityB;
      });
      
      console.log(`[ADVANCED-FILTER] Record type processing order: ${sortedRecordTypes.join(' → ')}`);
      console.log(`[ADVANCED-FILTER] Batch sizes: ${sortedRecordTypes.map(type => `${type}:${recordTypeMap.get(type)!.length}`).join(', ')}`);
      
      // 6. Advanced batch size optimization based on record type complexity
      const optimizedBatches = this.calculateOptimalBatchSizes(recordBatches, batchSize);
      console.log(`[ADVANCED-FILTER] Optimized processing plan:`, 
        Array.from(optimizedBatches.entries()).map(([type, info]) => 
          `${type}:${info.optimalBatchSize} (${info.totalRecords} records)`
        ).join(', ')
      );
      
      // 🚀 CRITICAL OPTIMIZATION: Only process record types with actual pending records
      // This eliminates Promise.all waiting for empty record type arrays
      const recordTypesWithData = sortedRecordTypes.filter(recordType => {
        const records = recordTypeMap.get(recordType)!;
        return records.length > 0;
      });
      
      console.log(`[DYNAMIC-FILTER] ⚡ PERFORMANCE BOOST: Processing only ${recordTypesWithData.length}/${sortedRecordTypes.length} record types with data`);
      console.log(`[DYNAMIC-FILTER] ⚡ Skipping empty arrays: ${sortedRecordTypes.filter(t => !recordTypesWithData.includes(t)).join(', ') || 'none'}`);
      console.log(`[DYNAMIC-FILTER] ⚡ Active processing: ${recordTypesWithData.join(' → ')}`);

      // Process only record types with actual pending records
      for (const recordType of recordTypesWithData) {
        const records = recordTypeMap.get(recordType)!;
        const batchInfo = optimizedBatches.get(recordType)!;
        
        console.log(`[ADVANCED-BATCH-${recordType}] Processing ${records.length} records in ${batchInfo.batches} optimized batches (${batchInfo.optimalBatchSize} per batch)`);
        console.log(`[ADVANCED-BATCH-${recordType}] Estimated completion time: ${(batchInfo.estimatedTimeMs / 1000).toFixed(1)}s`);
        
        // 7. Advanced concurrent processing using optimized batch sizes
        const batchResults = await this.processRecordBatchesConcurrently(records, recordType, batchInfo.optimalBatchSize, tableName, processedIds);
        
        // Update totals from batch results
        breakdown[recordType].processed += batchResults.totalProcessed;
        breakdown[recordType].skipped += batchResults.totalSkipped;
        breakdown[recordType].errors += batchResults.totalErrors;
        
        totalProcessed += batchResults.totalProcessed;
        totalSkipped += batchResults.totalSkipped;
        totalErrors += batchResults.totalErrors;
        
        console.log(`[ADVANCED-BATCH-${recordType}] Completed: ${batchResults.totalProcessed} processed, ${batchResults.totalSkipped} skipped, ${batchResults.totalErrors} errors`);
      }
      
      const processingTime = Date.now() - startTime;
      console.log(`=================== ADVANCED DATA STRUCTURES PROCESSING COMPLETE ===================`);
      console.log(`[ADVANCED] Total: ${totalProcessed} processed, ${totalSkipped} skipped, ${totalErrors} errors in ${processingTime}ms`);
      console.log(`[ADVANCED] Breakdown:`, breakdown);
      console.log(`[ADVANCED] Performance: ${((totalProcessed + totalSkipped + totalErrors) / (processingTime / 1000 / 60)).toFixed(0)} records/min`);
      
      return {
        totalProcessed,
        totalSkipped,
        totalErrors,
        breakdown,
        processingTime
      };
      
    } catch (error) {
      console.error('Error in advanced data structures TDDF processing:', error);
      throw error;
    }
  }

  // 🚀 CONCURRENT BATCH PROCESSING with advanced data structures
  private async processRecordBatchesConcurrently(
    records: any[],
    recordType: string,
    batchSize: number,
    tableName: string,
    processedIds: Set<number>
  ): Promise<{
    totalProcessed: number;
    totalSkipped: number;
    totalErrors: number;
  }> {
    let totalProcessed = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    // Split records into batches using advanced chunking
    const batches = this.chunkRecordsAdvanced(records, batchSize);
    
    console.log(`[CONCURRENT-${recordType}] Processing ${batches.length} batches concurrently`);
    
    // Process batches in parallel for maximum throughput
    const batchPromises = batches.map(async (batch, batchIndex) => {
      return this.processSingleRecordBatch(batch, recordType, tableName, processedIds, batchIndex);
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    // Aggregate results from all batches
    for (const result of batchResults) {
      totalProcessed += result.processed;
      totalSkipped += result.skipped;
      totalErrors += result.errors;
    }
    
    return { totalProcessed, totalSkipped, totalErrors };
  }

  // Advanced chunking algorithm for optimal batch distribution
  private chunkRecordsAdvanced(records: any[], batchSize: number): any[][] {
    const chunks: any[][] = [];
    for (let i = 0; i < records.length; i += batchSize) {
      chunks.push(records.slice(i, i + batchSize));
    }
    return chunks;
  }

  // Process single batch with optimized transaction management
  private async processSingleRecordBatch(
    batch: any[],
    recordType: string,
    tableName: string,
    processedIds: Set<number>,
    batchIndex: number
  ): Promise<{
    processed: number;
    skipped: number;
    errors: number;
  }> {
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    console.log(`[BATCH-${recordType}-${batchIndex}] Processing ${batch.length} records`);
    
    // Process each record in the batch
    for (const rawRecord of batch) {
      // Skip if already processed (using Set for O(1) lookup)
      if (processedIds.has(rawRecord.id)) {
        skipped++;
        continue;
      }
      
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // DUPLICATE PROTECTION using advanced Set-based checking
        const duplicateCheck = await client.query(`
          SELECT COUNT(*) as count FROM "${tableName}" 
          WHERE source_file_id = $1 AND line_number = $2 
            AND processing_status IN ('processed', 'skipped')
        `, [rawRecord.source_file_id, rawRecord.line_number]);
        
        if (parseInt(duplicateCheck.rows[0].count) > 0) {
          await client.query(`
            UPDATE "${tableName}"
            SET processing_status = 'processed',
                skip_reason = 'duplicate_record_updated',
                processed_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [rawRecord.id]);
          
          await client.query('COMMIT');
          processed++;
          processedIds.add(rawRecord.id);
          continue;
        }
        
        // SWITCH-BASED RECORD TYPE ROUTING (same as before)
        switch (recordType) {
          case 'BH':
            await this.processBHRecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'DT':
            await this.processDTRecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'P1':
            await this.processP1RecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'P2':
            await this.processP2RecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'E1':
            await this.processE1RecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'GE':
            await this.processGERecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'G2':
            await this.processG2RecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'AD':
            await this.processADRecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'DR':
            await this.processDRRecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'CK':
            await this.processCKRecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          case 'LG':
            await this.processLGRecordWithClient(client, rawRecord, tableName);
            processed++;
            break;
            
          default:
            await this.skipUnknownRecordWithClient(client, rawRecord, tableName);
            skipped++;
            break;
        }
        
        await client.query('COMMIT');
        processedIds.add(rawRecord.id);
        
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[BATCH-${recordType}-${batchIndex}] Error processing record ${rawRecord.line_number}:`, error);
        
        try {
          await pool.query(`
            UPDATE "${tableName}" 
            SET processing_status = 'skipped',
                skip_reason = $1,
                processed_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [`advanced_batch_error: ${error instanceof Error ? error.message : 'unknown'}`, rawRecord.id]);
        } catch (skipError) {
          console.error(`[BATCH-${recordType}-${batchIndex}] Failed to mark as skipped:`, skipError);
        }
        
        errors++;
        
      } finally {
        client.release();
      }
    }
    
    console.log(`[BATCH-${recordType}-${batchIndex}] Completed: ${processed} processed, ${skipped} skipped, ${errors} errors`);
    return { processed, skipped, errors };
  }
  
  // Helper method to process each record with enhanced error handling
  private async skipUnknownRecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    await client.query(`
      UPDATE "${tableName}"
      SET processing_status = 'skipped',
          skip_reason = 'unknown_record_type',
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [rawRecord.id]);
  }

  // 🔧 ADVANCED DATA STRUCTURES HELPER METHODS
  
  // Get estimated processing time per record for different TDDF record types (in milliseconds)
  private getEstimatedProcessingTimeMs(recordType: string): number {
    const processingTimeMap: Record<string, number> = {
      'DT': 8,    // Detail transactions - most complex with 127 fields
      'BH': 3,    // Batch headers - moderate complexity
      'P1': 12,   // Purchasing card extensions - high complexity with many fields
      'P2': 8,    // Purchasing card 2 extensions - moderate-high complexity
      'G2': 2,    // General data 2 - simple structure
      'E1': 2,    // Extension 1 - simple structure
      'AD': 3,    // Adjustment records - moderate complexity
      'DR': 3,    // Debit records - moderate complexity
      'CK': 4,    // Check records - moderate complexity
      'LG': 2,    // Lodge records - simple structure
      'GE': 2     // General extension - simple structure
    };
    
    return processingTimeMap[recordType] ?? 5; // Default 5ms for unknown types
  }
  
  // Calculate optimal batch sizes based on record type complexity and processing time
  private calculateOptimalBatchSizes(
    recordBatches: Map<string, {
      records: any[];
      priority: number;
      estimatedProcessingTime: number;
    }>,
    maxBatchSize: number
  ): Map<string, {
    optimalBatchSize: number;
    totalRecords: number;
    estimatedTimeMs: number;
    batches: number;
  }> {
    const optimizedBatches = new Map();
    
    for (const [recordType, batchInfo] of recordBatches.entries()) {
      const totalRecords = batchInfo.records.length;
      const processingTimePerRecord = batchInfo.estimatedProcessingTime;
      
      // Target processing time per batch: 5 seconds max
      const maxProcessingTimePerBatch = 5000; // 5 seconds in ms
      
      // Calculate optimal batch size based on processing time constraints
      const timeBasedOptimalSize = Math.floor(maxProcessingTimePerBatch / processingTimePerRecord);
      
      // Use the smaller of time-based optimal size or max batch size
      const optimalBatchSize = Math.min(timeBasedOptimalSize, maxBatchSize, totalRecords);
      
      // Ensure minimum batch size of 50 for efficiency
      const finalBatchSize = Math.max(optimalBatchSize, Math.min(50, totalRecords));
      
      const numberOfBatches = Math.ceil(totalRecords / finalBatchSize);
      const estimatedTotalTime = numberOfBatches * finalBatchSize * processingTimePerRecord;
      
      optimizedBatches.set(recordType, {
        optimalBatchSize: finalBatchSize,
        totalRecords,
        estimatedTimeMs: estimatedTotalTime,
        batches: numberOfBatches
      });
    }
    
    return optimizedBatches;
  }

  // Helper methods for switch-based processing
  private async processBHRecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const batchHeaderTableName = getTableName('tddf_batch_headers');
    
    const bhRecord = {
      bh_record_number: `BH_${rawRecord.source_file_id}_${rawRecord.line_number}`,
      record_identifier: line.substring(17, 19).trim() || null,
      merchant_account_number: line.substring(23, 39).trim() || null,
      transaction_code: line.substring(51, 55).trim() || null,
      batch_date: line.substring(55, 63).trim() || null, // Positions 56-63 (8 chars MMDDCCYY)
      batch_julian_date: line.substring(63, 68).trim() || null, // Positions 64-68 (5 chars)
      net_deposit: this.parseAuthAmount(line.substring(68, 83).trim()) || null,
      batch_id: line.substring(123, 126).trim() || null, // Positions 124-126 (3 chars)
      reject_reason: line.substring(83, 87).trim() || null,
      source_file_id: rawRecord.source_file_id,
      source_row_number: rawRecord.line_number,
      raw_data: JSON.stringify({ rawLine: line })
    };

    const insertResult = await client.query(`
      INSERT INTO "${batchHeaderTableName}" (
        bh_record_number, record_identifier, merchant_account_number,
        transaction_code, batch_date, batch_julian_date, net_deposit, batch_id, reject_reason,
        source_file_id, source_row_number, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (bh_record_number) DO UPDATE SET 
        recorded_at = CURRENT_TIMESTAMP,
        net_deposit = EXCLUDED.net_deposit
      RETURNING id
    `, [
      bhRecord.bh_record_number, bhRecord.record_identifier, bhRecord.merchant_account_number,
      bhRecord.transaction_code, bhRecord.batch_date, bhRecord.batch_julian_date,
      bhRecord.net_deposit, bhRecord.batch_id, bhRecord.reject_reason, bhRecord.source_file_id,
      bhRecord.source_row_number, bhRecord.raw_data
    ]);

    await client.query(`
      UPDATE "${tableName}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [batchHeaderTableName, insertResult.rows[0].id.toString(), rawRecord.id]);
  }

  private async processDTRecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const tddfRecordsTableName = getTableName('tddf_records');

    const tddfRecord = {
      sequence_number: line.substring(0, 7).trim() || null,
      entry_run_number: line.substring(7, 13).trim() || null,
      sequence_within_run: line.substring(13, 17).trim() || null,
      record_identifier: line.substring(17, 19).trim() || null,
      bank_number: line.substring(19, 23).trim() || null,
      merchant_account_number: line.substring(23, 39).trim() || null,
      association_number_1: line.substring(39, 45).trim() || null,
      group_number: line.substring(45, 51).trim() || null,
      transaction_code: line.substring(51, 55).trim() || null,
      association_number_2: line.substring(55, 61).trim() || null,
      reference_number: line.substring(61, 84).trim() || null,
      transaction_date: this.parseTddfDate(line.substring(84, 92).trim()) || null,
      transaction_amount: this.parseAuthAmount(line.substring(92, 103).trim()) || 0,
      batch_julian_date: line.substring(103, 108).trim() || null,
      net_deposit: this.parseAuthAmount(line.substring(108, 119).trim()) || null,
      cardholder_account_number: line.substring(123, 142).trim() || null,
      auth_amount: this.parseAuthAmount(line.substring(191, 203).trim()) || 0,
      merchant_name: line.substring(217, 242).trim() || null,
      authorization_number: line.substring(242, 250).trim() || null,
      card_type: line.substring(252, 254).trim() || null,
      mcc_code: line.substring(272, 276).trim() || null,
      terminal_id: line.substring(276, 284).trim() || null,
      debit_credit_indicator: line.substring(215, 216).trim() || null,
      transaction_type_identifier: line.substring(335, 338).trim() || null,
      source_file_id: rawRecord.source_file_id,
      source_row_number: rawRecord.line_number,
      mms_raw_line: line
    };

    // Check for existing record with same reference number
    if (tddfRecord.reference_number) {
      const existingCheck = await client.query(`
        SELECT id, source_file_id, created_at FROM "${tddfRecordsTableName}"
        WHERE reference_number = $1
        LIMIT 1
      `, [tddfRecord.reference_number]);

      if (existingCheck.rows.length > 0) {
        const existingRecord = existingCheck.rows[0];
        console.log(`[DT-DUPLICATE-LOG] Reference ${tddfRecord.reference_number} already exists (ID: ${existingRecord.id}, File: ${existingRecord.source_file_id}, Created: ${existingRecord.created_at}). Logging update and proceeding...`);
        
        // Log the duplicate as processed but with duplicate tracking
        await client.query(`
          UPDATE "${tableName}" 
          SET processing_status = 'processed',
              processed_into_table = $1,
              processed_record_id = $2,
              processed_at = CURRENT_TIMESTAMP,
              skip_reason = $3
          WHERE id = $4
        `, [
          tddfRecordsTableName, 
          existingRecord.id.toString(), 
          `duplicate_reference_logged: ${tddfRecord.reference_number} (original_id: ${existingRecord.id})`,
          rawRecord.id
        ]);
        
        console.log(`✅ DT Record duplicate logged: $${tddfRecord.transaction_amount} - ${tddfRecord.reference_number} (pointing to existing ID: ${existingRecord.id})`);
        return; // Exit without inserting duplicate
      }
    }

    // No duplicate found - proceed with normal insertion
    const insertResult = await client.query(`
      INSERT INTO "${tddfRecordsTableName}" (
        sequence_number, entry_run_number, sequence_within_run, record_identifier,
        bank_number, merchant_account_number, association_number_1, group_number,
        transaction_code, association_number_2, reference_number, transaction_date,
        transaction_amount, batch_julian_date, net_deposit, cardholder_account_number,
        auth_amount, merchant_name, authorization_number, card_type, mcc_code, terminal_id, debit_credit_indicator, 
        transaction_type_identifier, source_file_id, source_row_number, mms_raw_line
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
      RETURNING id
    `, [
      tddfRecord.sequence_number, tddfRecord.entry_run_number, tddfRecord.sequence_within_run,
      tddfRecord.record_identifier, tddfRecord.bank_number, tddfRecord.merchant_account_number,
      tddfRecord.association_number_1, tddfRecord.group_number, tddfRecord.transaction_code,
      tddfRecord.association_number_2, tddfRecord.reference_number, tddfRecord.transaction_date,
      tddfRecord.transaction_amount, tddfRecord.batch_julian_date, tddfRecord.net_deposit,
      tddfRecord.cardholder_account_number, tddfRecord.auth_amount, tddfRecord.merchant_name,
      tddfRecord.authorization_number, tddfRecord.card_type, tddfRecord.mcc_code, tddfRecord.terminal_id, tddfRecord.debit_credit_indicator,
      tddfRecord.transaction_type_identifier, tddfRecord.source_file_id, tddfRecord.source_row_number, tddfRecord.mms_raw_line
    ]);

    await client.query(`
      UPDATE "${tableName}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [tddfRecordsTableName, insertResult.rows[0].id.toString(), rawRecord.id]);
    
    console.log(`✅ DT Record inserted: $${tddfRecord.transaction_amount} - ${tddfRecord.reference_number} (ID: ${insertResult.rows[0].id})`);
  }



  private async processE1RecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const otherRecordsTableName = getTableName('tddf_other_records');

    // Extract key fields from TDDF fixed-width format for E1 records
    const referenceNumber = line.substring(61, 84).trim() || null; // Positions 62-84: Reference Number (AN)
    const merchantAccount = line.substring(23, 39).trim() || null; // Positions 24-39: Merchant Account Number (AN)
    const transactionDateStr = line.substring(84, 92).trim(); // Positions 85-92: Transaction Date MMDDCCYY (N)
    
    // Parse transaction date (MMDDCCYY format) - allow null for invalid dates
    let transactionDate = null;
    if (transactionDateStr && transactionDateStr.length === 8 && transactionDateStr.match(/^\d{8}$/) && transactionDateStr !== '40404040') {
      try {
        const month = transactionDateStr.substring(0, 2);
        const day = transactionDateStr.substring(2, 4);
        const year = transactionDateStr.substring(4, 8);
        
        // Validate date components
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(year);
        
        if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2099) {
          transactionDate = `${year}-${month}-${day}`;
        }
      } catch (error) {
        // Invalid date - keep as null
        transactionDate = null;
      }
    }

    // Build comprehensive TDDF field extraction for jsonb storage
    const comprehensiveE1Data = {
      // Core TDDF header fields (positions 1-23)
      sequenceNumber: line.substring(0, 7).trim() || null,
      entryRunNumber: line.substring(7, 13).trim() || null,
      sequenceWithinRun: line.substring(13, 17).trim() || null,
      recordIdentifier: line.substring(17, 19).trim() || null,
      bankNumber: line.substring(19, 23).trim() || null,

      // Merchant identification (positions 24-51)
      merchantAccountNumber: line.substring(23, 39).trim() || null,
      associationNumber: line.substring(39, 45).trim() || null,
      groupNumber: line.substring(45, 51).trim() || null,
      transactionCode: line.substring(51, 55).trim() || null,

      // EMV Transaction Data (positions 56-82)
      emvTranType: line.substring(55, 57).trim() || null,
      emvTermCapProfile: line.substring(57, 63).trim() || null,
      emvAppTranCounter: line.substring(63, 67).trim() || null,
      emvCryptogramAmount: this.parseAmount(line.substring(67, 82).trim()) || null,

      // EMV Script and Application Data (positions 83-196)
      emvIssScriptResults: line.substring(82, 132).trim() || null,
      emvIssAppData: line.substring(132, 196).trim() || null,

      // EMV Card and Terminal Data (positions 197-232)
      emvCardSequenceNumber: line.substring(196, 200).trim() || null,
      emvTermCountryCode: line.substring(200, 204).trim() || null,
      emvAppInterchangeProfile: line.substring(204, 208).trim() || null,
      emvTermVerifyResults: line.substring(208, 218).trim() || null,
      emvTermTranDate: line.substring(218, 224).trim() || null,
      emvUnpredictableNumber: line.substring(224, 232).trim() || null,

      // EMV Cryptogram and Form Factor (positions 233-256)
      emvCryptogram: line.substring(232, 248).trim() || null,
      emvFormFactorIndicator: line.substring(248, 256).trim() || null,

      // EMV Currency and Files (positions 257-292)
      emvTranCurrencyCode: line.substring(256, 260).trim() || null,
      emvDedFileName: line.substring(260, 292).trim() || null,

      // EMV Authorization and Processing Data (positions 293-340)
      emvIssAuthData: line.substring(292, 324).trim() || null,
      emvTranCatCode: line.substring(324, 326).trim() || null,
      emvCryptInfoData: line.substring(326, 330).trim() || null,
      emvTermType: line.substring(330, 332).trim() || null,
      emvTransactionSequenceNumber: line.substring(332, 340).trim() || null,

      // EMV Amount Fields (positions 341-366)
      emvAmountAuthorized: this.parseAmount(line.substring(340, 353).trim()) || null,
      emvAmountOther: this.parseAmount(line.substring(353, 366).trim()) || null,

      // EMV CVM and Interface Data (positions 367-392)
      emvCvmResult: line.substring(366, 372).trim() || null,
      emvInterfaceDevSerial: line.substring(372, 388).trim() || null,
      emvTerminalApplicationVersion: line.substring(388, 392).trim() || null,

      // EMV Final Fields and Reserved (positions 393-700)
      emvCryptogramInformation: line.substring(392, 394).trim() || null,
      reservedFutureUse: line.substring(394, 700).trim() || null,
      rawLine: line
    };

    const insertResult = await client.query(`
      INSERT INTO "${otherRecordsTableName}" (
        record_type, reference_number, merchant_account, transaction_date, amount, description,
        source_file_id, source_row_number, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'E1',
      referenceNumber,
      merchantAccount,
      transactionDate,
      comprehensiveE1Data.emvAmountAuthorized, // Use EMV authorized amount as primary amount
      'Merchant General Data 2 Extension Record',
      rawRecord.source_file_id,
      rawRecord.line_number,
      JSON.stringify(comprehensiveE1Data)
    ]);

    await client.query(`
      UPDATE "${tableName}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [otherRecordsTableName, insertResult.rows[0].id.toString(), rawRecord.id]);
  }

  private async processGERecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const otherRecordsTableName = getTableName('tddf_other_records');

    // Parse GE record from TDDF fixed-width format based on complete specification
    const geRecord = {
      // Core TDDF header fields (positions 1-23) - shared with all record types
      sequenceNumber: line.substring(0, 7).trim() || null, // Positions 1-7: File position identifier (N)
      entryRunNumber: line.substring(7, 13).trim() || null, // Positions 8-13: Entry run number (N)
      sequenceWithinRun: line.substring(13, 17).trim() || null, // Positions 14-17: Sequence within entry run (N)
      recordIdentifier: line.substring(17, 19).trim() || null, // Positions 18-19: "GE" (AN)
      bankNumber: line.substring(19, 23).trim() || null, // Positions 20-23: Global Payments bank number (AN)
      
      // Record type specific information
      recordType: 'GE',
      recordDescription: 'Merchant General Extension Record',
      
      // Primary merchant account field
      merchantAccountNumber: line.substring(23, 39).trim() || null, // Positions 24-39: Global Payments account number (N)
      
      // GE-specific fields extracted according to TDDF specification
      recordData: {
        // Merchant identification fields
        associationNumber: line.substring(39, 45).trim() || null, // Positions 40-45: Association ID (AN)
        groupNumber: line.substring(45, 51).trim() || null, // Positions 46-51: Group number (AN)
        transactionCode: line.substring(51, 55).trim() || null, // Positions 52-55: GP Transaction code (N)
        
        // Merchant descriptor fields (currently reserved)
        detailMerchantName: line.substring(55, 76).trim() || null, // Positions 56-76: Detail Merchant Name (AN) - Reserved
        merchantSoftDescriptor: line.substring(76, 101).trim() || null, // Positions 77-101: Merchant Soft Descriptor (AN) - Reserved
        
        // Reserved area for future use
        reservedFutureUse: line.substring(101, 700).trim() || null, // Positions 102-700: Reserved for future use (AN)
        
        // Complete raw line for reference and future field additions
        rawLine: line
      },
      
      // Standard system and audit fields
      sourceFileId: rawRecord.source_file_id,
      sourceRowNumber: rawRecord.line_number,
      rawData: JSON.stringify({ rawLine: line })
    };

    const insertResult = await client.query(`
      INSERT INTO "${otherRecordsTableName}" (
        record_type, reference_number, merchant_account, transaction_date, amount, description,
        source_file_id, source_row_number, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'GE',
      null, // No reference number for GE records
      geRecord.merchantAccountNumber,
      null, // No transaction date for GE records
      null, // No amount for GE records
      'Merchant General Extension Record',
      geRecord.sourceFileId,
      geRecord.sourceRowNumber,
      JSON.stringify(geRecord.recordData)
    ]);

    await client.query(`
      UPDATE "${tableName}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [otherRecordsTableName, insertResult.rows[0].id.toString(), rawRecord.id]);
  }

  private async processG2RecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const otherRecordsTableName = getTableName('tddf_other_records');

    // Extract key fields from TDDF fixed-width format for G2 records
    const referenceNumber = line.substring(61, 84).trim() || null; // Positions 62-84: Reference Number (AN)
    const merchantAccount = line.substring(23, 39).trim() || null; // Positions 24-39: Merchant Account Number (AN)
    const transactionDateStr = line.substring(84, 92).trim(); // Positions 85-92: Transaction Date MMDDCCYY (N)
    
    // Parse transaction date (MMDDCCYY format) - allow null for invalid dates
    let transactionDate = null;
    if (transactionDateStr && transactionDateStr.length === 8 && transactionDateStr.match(/^\d{8}$/) && transactionDateStr !== '40404040') {
      try {
        const month = transactionDateStr.substring(0, 2);
        const day = transactionDateStr.substring(2, 4);
        const year = transactionDateStr.substring(4, 8);
        
        // Validate date components
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(year);
        
        if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2099) {
          transactionDate = `${year}-${month}-${day}`;
        }
      } catch (error) {
        // Invalid date - keep as null
        transactionDate = null;
      }
    }

    // Build comprehensive TDDF field extraction for jsonb storage
    const comprehensiveG2Data = {
      // Core TDDF header fields (positions 1-23)
      sequenceNumber: line.substring(0, 7).trim() || null,
      entryRunNumber: line.substring(7, 13).trim() || null,
      sequenceWithinRun: line.substring(13, 17).trim() || null,
      recordIdentifier: line.substring(17, 19).trim() || null,
      bankNumber: line.substring(19, 23).trim() || null,
      
      // Account and merchant fields specific to G2 records
      merchantAccountNumber: line.substring(23, 39).trim() || null,
      associationNumber: line.substring(39, 45).trim() || null,
      groupNumber: line.substring(45, 51).trim() || null,
      transactionCode: line.substring(51, 55).trim() || null,
      rawLine: line
    };

    const insertResult = await client.query(`
      INSERT INTO "${otherRecordsTableName}" (
        record_type, reference_number, merchant_account, transaction_date, amount, description,
        source_file_id, source_row_number, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'G2',
      referenceNumber,
      merchantAccount,
      transactionDate,
      null, // No standard amount field for G2 records
      'Merchant General Data 2 Record',
      rawRecord.source_file_id,
      rawRecord.line_number,
      JSON.stringify(comprehensiveG2Data)
    ]);

    await client.query(`
      UPDATE "${tableName}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [otherRecordsTableName, insertResult.rows[0].id.toString(), rawRecord.id]);
  }

  private async processADRecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const otherRecordsTableName = getTableName('tddf_other_records');

    // Parse AD record from TDDF fixed-width format based on Merchant Adjustment Extension Record specification
    // Adjust to match actual database schema: record_type, reference_number, merchant_account, transaction_date, amount, description, source_file_id, source_row_number, raw_data
    
    // Extract key fields from TDDF fixed-width format
    const referenceNumber = line.substring(61, 84).trim() || null; // Positions 62-84: Reference Number (AN)
    const merchantAccount = line.substring(23, 39).trim() || null; // Positions 24-39: Merchant Account Number (AN)
    const adjustmentAmount = this.parseAmount(line.substring(92, 103).trim()) || null; // Positions 93-103: Adjustment Amount (N)
    const transactionDateStr = line.substring(84, 92).trim(); // Positions 85-92: Transaction Date MMDDCCYY (N)
    
    // Parse transaction date (MMDDCCYY format) - allow null for invalid dates
    let transactionDate = null;
    if (transactionDateStr && transactionDateStr.length === 8 && transactionDateStr.match(/^\d{8}$/) && transactionDateStr !== '40404040') {
      try {
        const month = transactionDateStr.substring(0, 2);
        const day = transactionDateStr.substring(2, 4);
        const year = transactionDateStr.substring(4, 8);
        
        // Validate date components
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(year);
        
        if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2099) {
          transactionDate = `${year}-${month}-${day}`;
        }
      } catch (error) {
        // Invalid date - keep as null
        transactionDate = null;
      }
    }
    
    // Build comprehensive TDDF field extraction for jsonb storage
    const comprehensiveADData = {
      // Core TDDF header fields (positions 1-23)
      sequenceNumber: line.substring(0, 7).trim() || null, // Positions 1-7: Sequence Number (N)
      entryRunNumber: line.substring(7, 13).trim() || null, // Positions 8-13: Entry Run Number (N)
      sequenceWithinRun: line.substring(13, 17).trim() || null, // Positions 14-17: Sequence Within Run (N)
      recordIdentifier: line.substring(17, 19).trim() || null, // Positions 18-19: Record Identifier "AD" (A)
      bankNumber: line.substring(19, 23).trim() || null, // Positions 20-23: Bank Number (N)
      
      // Account and merchant fields (positions 24-61)
      merchantAccountNumber: line.substring(23, 39).trim() || null, // Positions 24-39: Merchant Account Number (AN)
      associationNumber1: line.substring(39, 45).trim() || null, // Positions 40-45: Association Number 1 (N)
      groupNumber: line.substring(45, 51).trim() || null, // Positions 46-51: Group Number (N)
      transactionCode: line.substring(51, 55).trim() || null, // Positions 52-55: Transaction Code (N)
      associationNumber2: line.substring(55, 61).trim() || null, // Positions 56-61: Association Number 2 (N)
      
      // Reference and transaction details (positions 62-92)
      referenceNumber: line.substring(61, 84).trim() || null, // Positions 62-84: Reference Number (AN)
      transactionDate: line.substring(84, 92).trim() || null, // Positions 85-92: Transaction Date MMDDCCYY (N)
      
      // Adjustment amounts and codes (positions 93-142)
      adjustmentAmount: this.parseAmount(line.substring(92, 103).trim()) || null, // Positions 93-103: Adjustment Amount (N)
      batchJulianDate: line.substring(103, 108).trim() || null, // Positions 104-108: Batch Julian Date DDDYY (N)
      netDepositAdjustment: this.parseAmount(line.substring(108, 123).trim()) || null, // Positions 109-123: Net Deposit Adjustment (N)
      cardholderAccount: line.substring(123, 142).trim() || null, // Positions 124-142: Cardholder Account Number (AN)
      
      // Adjustment details and codes (positions 143-187)
      adjustmentReasonCode: line.substring(142, 144).trim() || null, // Positions 143-144: Adjustment Reason Code (AN)
      adjustmentTypeCode: line.substring(144, 146).trim() || null, // Positions 145-146: Adjustment Type Code (AN)
      merchantAdjustmentCode1: line.substring(146, 150).trim() || null, // Positions 147-150: Merchant Adjustment Code 1 (AN)
      merchantAdjustmentCode2: line.substring(150, 154).trim() || null, // Positions 151-154: Merchant Adjustment Code 2 (AN)
      adjustmentDescription: line.substring(154, 164).trim() || null, // Positions 155-164: Adjustment Description (AN)
      onlineEntryIndicator: line.substring(164, 165).trim() || null, // Position 165: Online Entry Indicator (A)
      achFlagIndicator: line.substring(165, 166).trim() || null, // Position 166: ACH Flag Indicator (A)
      authSourceCode: line.substring(166, 167).trim() || null, // Position 167: Authorization Source Code (A)
      cardholderIdMethod: line.substring(167, 168).trim() || null, // Position 168: Cardholder ID Method (A)
      catIndicator: line.substring(168, 169).trim() || null, // Position 169: CAT Indicator (A)
      reimbursementAttribute: line.substring(169, 170).trim() || null, // Position 170: Reimbursement Attribute (A)
      mailOrderTelephoneIndicator: line.substring(170, 171).trim() || null, // Position 171: Mail Order/Telephone Indicator (A)
      authCharacteristicIndicator: line.substring(171, 172).trim() || null, // Position 172: Authorization Characteristic Indicator (A)
      banknetReferenceNumber: line.substring(172, 187).trim() || null, // Positions 173-187: Banknet Reference Number (AN)
      
      // Additional adjustment information (positions 188-242)
      draftLocatorFlag: line.substring(187, 188).trim() || null, // Position 188: Draft Locator Flag (A)
      adjustmentCurrencyCode: line.substring(188, 191).trim() || null, // Positions 189-191: Adjustment Currency Code (A)
      originalAdjustmentAmount: this.parseAmount(line.substring(191, 203).trim()) || null, // Positions 192-203: Original Adjustment Amount (N)
      validationCode: line.substring(203, 207).trim() || null, // Positions 204-207: Validation Code (AN)
      adjustmentResponseCode: line.substring(207, 209).trim() || null, // Positions 208-209: Adjustment Response Code (AN)
      networkIdentifierDebit: line.substring(209, 212).trim() || null, // Positions 210-212: Network Identifier Debit (AN)
      switchSettledIndicator: line.substring(212, 213).trim() || null, // Position 213: Switch Settled Indicator (A)
      posEntryMode: line.substring(213, 215).trim() || null, // Positions 214-215: POS Entry Mode (AN)
      debitCreditIndicator: line.substring(215, 216).trim() || null, // Position 216: Debit/Credit Indicator (A)
      reversalFlag: line.substring(216, 217).trim() || null, // Position 217: Reversal Flag (A)
      merchantName: line.substring(217, 242).trim() || null, // Positions 218-242: Merchant Name DBA (AN)
      
      // Authorization and processing details (positions 243-338)
      authorizationNumber: line.substring(242, 248).trim() || null, // Positions 243-248: Authorization Number (AN)
      rejectReasonCode: line.substring(248, 250).trim() || null, // Positions 249-250: Reject Reason Code (AN)
      cardTypeCode: line.substring(250, 256).trim() || null, // Positions 251-256: Card Type Code (AN)
      currencyCode: line.substring(254, 257).trim() || null, // Positions 255-257: Currency Code (N)
      originalTransactionAmount: this.parseAmount(line.substring(257, 268).trim()) || null, // Positions 258-268: Original Transaction Amount (N)
      foreignCardIndicator: line.substring(268, 269).trim() || null, // Position 269: Foreign Card Indicator (A)
      carryoverIndicator: line.substring(269, 270).trim() || null, // Position 270: Carryover Indicator (A)
      extensionRecordIndicator: line.substring(270, 272).trim() || null, // Positions 271-272: Extension Record Indicator (AN)
      mccCode: line.substring(272, 276).trim() || null, // Positions 273-276: MCC Code (N)
      terminalId: line.substring(276, 284).trim() || null, // Positions 277-284: Terminal ID/V Number (AN)
      discoverPosEntryMode: line.substring(284, 287).trim() || null, // Positions 285-287: Discover POS Entry Mode (AN)
      purchaseId: line.substring(287, 312).trim() || null, // Positions 288-312: Purchase ID (AN)
      cashBackAmount: this.parseAmount(line.substring(312, 321).trim()) || null, // Positions 313-321: Cash Back Amount (N)
      cashBackAmountSign: line.substring(321, 322).trim() || null, // Position 322: Cash Back Amount Sign (A)
      posDataCode: line.substring(322, 335).trim() || null, // Positions 323-335: POS Data Code (AN)
      transactionTypeIdentifier: line.substring(335, 338).trim() || null, // Positions 336-338: Transaction Type Identifier (AN)
      
      // Extended fields and fee information (positions 339-500)
      cardTypeExtended: line.substring(338, 341).trim() || null, // Positions 339-341: Extended Card Type (AN)
      productId: line.substring(341, 343).trim() || null, // Positions 342-343: Product ID (AN)
      submittedInterchange: line.substring(343, 348).trim() || null, // Positions 344-348: Submitted Interchange (AN)
      systemTraceAuditNumber: line.substring(348, 354).trim() || null, // Positions 349-354: System Trace Audit Number (N)
      discoverTransactionType: line.substring(354, 356).trim() || null, // Positions 355-356: Discover Transaction Type (AN)
      localTransactionTime: line.substring(356, 362).trim() || null, // Positions 357-362: Local Transaction Time HHMMSS (N)
      discoverProcessingCode: line.substring(362, 368).trim() || null, // Positions 363-368: Discover Processing Code (N)
      commercialCardServiceIndicator: line.substring(368, 369).trim() || null, // Position 369: Commercial Card Service Indicator (A)
      
      // Complete raw line for debugging and future field additions
      rawLine: line
    };

    const insertResult = await client.query(`
      INSERT INTO "${otherRecordsTableName}" (
        record_type, reference_number, merchant_account, transaction_date, amount, description,
        source_file_id, source_row_number, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'AD',
      referenceNumber,
      merchantAccount,
      transactionDate,
      adjustmentAmount,
      'Merchant Adjustment Extension Record',
      rawRecord.source_file_id,
      rawRecord.line_number,
      JSON.stringify(comprehensiveADData)
    ]);

    await client.query(`
      UPDATE "${tableName}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [otherRecordsTableName, insertResult.rows[0].id.toString(), rawRecord.id]);
  }

  private async processDRRecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const otherRecordsTableName = getTableName('tddf_other_records');

    // Extract key fields from TDDF fixed-width format
    const referenceNumber = line.substring(61, 84).trim() || null; // Positions 62-84: Reference Number (AN)
    const merchantAccount = line.substring(23, 39).trim() || null; // Positions 24-39: Merchant Account Number (AN)
    const transactionDateStr = line.substring(84, 92).trim(); // Positions 85-92: Transaction Date MMDDCCYY (N)
    
    // Parse transaction date (MMDDCCYY format) - allow null for invalid dates
    let transactionDate = null;
    if (transactionDateStr && transactionDateStr.length === 8 && transactionDateStr.match(/^\d{8}$/) && transactionDateStr !== '40404040') {
      try {
        const month = transactionDateStr.substring(0, 2);
        const day = transactionDateStr.substring(2, 4);
        const year = transactionDateStr.substring(4, 8);
        
        // Validate date components
        const monthNum = parseInt(month);
        const dayNum = parseInt(day);
        const yearNum = parseInt(year);
        
        if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31 && yearNum >= 1900 && yearNum <= 2099) {
          transactionDate = `${year}-${month}-${day}`;
        }
      } catch (error) {
        // Invalid date - keep as null
        transactionDate = null;
      }
    }

    // Build comprehensive TDDF field extraction for jsonb storage
    const comprehensiveDRData = {
      // Core TDDF header fields (positions 1-23)
      sequenceNumber: line.substring(0, 7).trim() || null,
      entryRunNumber: line.substring(7, 13).trim() || null,
      sequenceWithinRun: line.substring(13, 17).trim() || null,
      recordIdentifier: line.substring(17, 19).trim() || null,
      bankNumber: line.substring(19, 23).trim() || null,
      
      // Account and merchant fields
      merchantAccountNumber: line.substring(23, 39).trim() || null,
      associationNumber: line.substring(39, 45).trim() || null,
      groupNumber: line.substring(45, 51).trim() || null,
      transactionCode: line.substring(51, 55).trim() || null,
      rawLine: line
    };

    const insertResult = await client.query(`
      INSERT INTO "${otherRecordsTableName}" (
        record_type, reference_number, merchant_account, transaction_date, amount, description,
        source_file_id, source_row_number, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'DR',
      referenceNumber,
      merchantAccount,
      transactionDate,
      null, // No standard amount field for DR records
      'Detail Record (Non-DT)',
      rawRecord.source_file_id,
      rawRecord.line_number,
      JSON.stringify(comprehensiveDRData)
    ]);

    await client.query(`
      UPDATE "${tableName}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [otherRecordsTableName, insertResult.rows[0].id.toString(), rawRecord.id]);
  }

  private async processCKRecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const otherRecordsTableName = getTableName('tddf_other_records');

    // Extract key fields from TDDF fixed-width format based on CK specification
    const checkingAccountNumber = line.substring(55, 74).trim() || null; // Positions 56-74: Checking Account Number (N)
    const abaRoutingNumber = line.substring(74, 83).trim() || null; // Positions 75-83: ABA/Routing Number (N)
    const checkNumber = line.substring(83, 98).trim() || null; // Positions 84-98: Check Number (N)
    const merchantAccount = line.substring(23, 39).trim() || null; // Positions 24-39: Merchant Account Number (N)
    const phoneNumber = line.substring(147, 157).trim() || null; // Positions 148-157: Phone Number (AN)
    const individualName = line.substring(157, 179).trim() || null; // Positions 158-179: Individual Name (AN)
    const paymentType = line.substring(179, 180).trim() || null; // Position 180: Payment Type (AN)
    const terminalCity = line.substring(180, 193).trim() || null; // Positions 181-193: Terminal City (AN)
    const terminalState = line.substring(193, 195).trim() || null; // Positions 194-195: Terminal State (AN)

    // Build comprehensive CK (Electronic Check Extension) data for jsonb storage
    const comprehensiveCKData = {
      // Core TDDF header fields (positions 1-23)
      sequenceNumber: line.substring(0, 7).trim() || null,
      entryRunNumber: line.substring(7, 13).trim() || null,
      sequenceWithinRun: line.substring(13, 17).trim() || null,
      recordIdentifier: line.substring(17, 19).trim() || null, // Should be "CK"
      bankNumber: line.substring(19, 23).trim() || null,
      
      // Account and merchant fields
      merchantAccountNumber: line.substring(23, 39).trim() || null,
      associationNumber: line.substring(39, 45).trim() || null,
      groupNumber: line.substring(45, 51).trim() || null,
      transactionCode: line.substring(51, 55).trim() || null,
      
      // Electronic Check specific fields (CK record)
      checkingAccountNumber: line.substring(55, 74).trim() || null,
      abaRoutingNumber: line.substring(74, 83).trim() || null,
      checkNumber: line.substring(83, 98).trim() || null,
      checkServiceOption: line.substring(98, 100).trim() || null,
      checkServiceProgram: line.substring(100, 105).trim() || null,
      receivingInstitutionId: line.substring(105, 111).trim() || null,
      internalMerchantBatchKey: line.substring(111, 124).trim() || null,
      extensionRecordIndicator: line.substring(124, 129).trim() || null,
      individualId: line.substring(129, 144).trim() || null,
      secCode: line.substring(144, 147).trim() || null, // Standard Entry Class codes
      phoneNumber: line.substring(147, 157).trim() || null,
      individualName: line.substring(157, 179).trim() || null,
      paymentType: line.substring(179, 180).trim() || null,
      terminalCity: line.substring(180, 193).trim() || null,
      terminalState: line.substring(193, 195).trim() || null,
      discretionaryData: line.substring(195, 197).trim() || null,
      reservedFutureUse: line.substring(197, 700).trim() || null,
      rawLine: line
    };

    const insertResult = await client.query(`
      INSERT INTO "${otherRecordsTableName}" (
        record_type, reference_number, merchant_account, transaction_date, amount, description,
        source_file_id, source_row_number, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'CK',
      checkNumber, // Use check number as reference
      merchantAccount,
      null, // CK records don't have transaction date
      null, // No standard amount field for CK extension records
      `Electronic Check Extension - ${individualName || 'Unknown Cardholder'}`,
      rawRecord.source_file_id,
      rawRecord.line_number,
      JSON.stringify(comprehensiveCKData)
    ]);

    await client.query(`
      UPDATE "${tableName}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [otherRecordsTableName, insertResult.rows[0].id.toString(), rawRecord.id]);
    
    console.log(`✅ CK Record (Electronic Check Extension) processed successfully (ID: ${insertResult.rows[0].id})`);
  }

  private async processLGRecordWithClient(client: any, rawRecord: any, tableName: string): Promise<void> {
    const line = rawRecord.raw_line;
    const otherRecordsTableName = getTableName('tddf_other_records');

    // Extract key fields from TDDF fixed-width format based on LG specification
    const hotelFolioNumber = line.substring(55, 80).trim() || null; // Positions 56-80: Hotel Folio Number (AN)
    const customerServiceNumber = line.substring(80, 90).trim() || null; // Positions 81-90: Customer Service Number (N)
    const checkInDate = line.substring(97, 103).trim() || null; // Positions 98-103: Check-in Date (N)
    const checkOutDate = line.substring(126, 132).trim() || null; // Positions 127-132: Check Out Date (N)
    const merchantAccount = line.substring(23, 39).trim() || null; // Positions 24-39: Merchant Account Number (N)
    const propertyTelephone = line.substring(116, 126).trim() || null; // Positions 117-126: Property Telephone Number (N)
    const roomNights = line.substring(263, 265).trim() || null; // Positions 264-265: Room Nights (N)

    // Parse monetary amounts (12-digit fields, right-justified)
    const dailyRoomRate = this.parseLodgingAmount(line.substring(134, 146).trim()); // Positions 135-146
    const totalTax = this.parseLodgingAmount(line.substring(146, 158).trim()); // Positions 147-158
    const callCharges = this.parseLodgingAmount(line.substring(158, 170).trim()); // Positions 159-170
    const foodBeverageCharges = this.parseLodgingAmount(line.substring(170, 182).trim()); // Positions 171-182
    const barMiniBarCharges = this.parseLodgingAmount(line.substring(182, 194).trim()); // Positions 183-194
    const giftShopCharges = this.parseLodgingAmount(line.substring(194, 206).trim()); // Positions 195-206
    const laundryCharges = this.parseLodgingAmount(line.substring(206, 218).trim()); // Positions 207-218
    const otherServicesCharges = this.parseLodgingAmount(line.substring(221, 233).trim()); // Positions 222-233
    const billingAdjustmentAmount = this.parseLodgingAmount(line.substring(234, 246).trim()); // Positions 235-246
    const prepaidExpense = this.parseLodgingAmount(line.substring(246, 258).trim()); // Positions 247-258
    const totalRoomTax = this.parseLodgingAmount(line.substring(265, 277).trim()); // Positions 266-277

    // Build comprehensive LG (Lodge Extension) data for jsonb storage
    const comprehensiveLGData = {
      // Core TDDF header fields (positions 1-23)
      sequenceNumber: line.substring(0, 7).trim() || null,
      entryRunNumber: line.substring(7, 13).trim() || null,
      sequenceWithinRun: line.substring(13, 17).trim() || null,
      recordIdentifier: line.substring(17, 19).trim() || null, // Should be "LG"
      bankNumber: line.substring(19, 23).trim() || null,
      
      // Account and merchant fields
      merchantAccountNumber: line.substring(23, 39).trim() || null,
      associationNumber: line.substring(39, 45).trim() || null,
      groupNumber: line.substring(45, 51).trim() || null,
      transactionCode: line.substring(51, 55).trim() || null,
      
      // Lodge Extension specific fields
      hotelFolioNumber: line.substring(55, 80).trim() || null,
      customerServiceNumber: line.substring(80, 90).trim() || null,
      vsNoShowIndicator: line.substring(90, 91).trim() || null, // Position 91: VS No Show Ind/AM Spec Prog Code
      vsExtraCharges: line.substring(91, 97).trim() || null, // Positions 92-97: VS Extra Chgs/AM Room Rate
      checkInDate: line.substring(97, 103).trim() || null, // Positions 98-103: Check-in Date
      vsMarketSpecAuthInd: line.substring(103, 104).trim() || null, // Position 104: VS MKT SPEC AUTH DATA IND
      vsTotalAuthAmount: line.substring(104, 116).trim() || null, // Positions 105-116: VS Total Auth AMT/AM Tax Amount
      propertyTelephone: line.substring(116, 126).trim() || null,
      checkOutDate: line.substring(126, 132).trim() || null,
      mcProgCode: line.substring(132, 134).trim() || null, // Positions 133-134: MC Prog Code/AM Approval Code
      dailyRoomRate: dailyRoomRate,
      totalTax: totalTax,
      callCharges: callCharges,
      foodBeverageCharges: foodBeverageCharges,
      barMiniBarCharges: barMiniBarCharges,
      giftShopCharges: giftShopCharges,
      laundryCharges: laundryCharges,
      otherServicesCode: line.substring(218, 221).trim() || null, // Positions 219-221: Other Services Code
      otherServicesCharges: otherServicesCharges,
      billingAdjustmentIndicator: line.substring(233, 234).trim() || null, // Position 234: Billing Adjustment Indicator
      billingAdjustmentAmount: billingAdjustmentAmount,
      prepaidExpense: prepaidExpense,
      extensionRecordIndicator: line.substring(258, 263).trim() || null, // Positions 259-263: Extension Record Indicator
      roomNights: roomNights,
      totalRoomTax: totalRoomTax,
      reservedFutureUse: line.substring(277, 700).trim() || null, // Positions 278-700: Reserved for future use
      rawLine: line
    };

    // Calculate total lodge charges for description
    const totalCharges = (dailyRoomRate || 0) + (totalTax || 0) + (callCharges || 0) + 
                        (foodBeverageCharges || 0) + (barMiniBarCharges || 0) + (giftShopCharges || 0) + 
                        (laundryCharges || 0) + (otherServicesCharges || 0);

    const insertResult = await client.query(`
      INSERT INTO "${otherRecordsTableName}" (
        record_type, reference_number, merchant_account, transaction_date, amount, description,
        source_file_id, source_row_number, raw_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      'LG',
      hotelFolioNumber, // Use hotel folio number as reference
      merchantAccount,
      null, // LG records don't have standard transaction date
      totalCharges > 0 ? totalCharges : null, // Sum of all lodge charges
      `Lodge Extension - ${roomNights ? roomNights + ' nights' : 'Lodging charges'}`,
      rawRecord.source_file_id,
      rawRecord.line_number,
      JSON.stringify(comprehensiveLGData)
    ]);

    await client.query(`
      UPDATE "${tableName}" 
      SET processing_status = 'processed',
          processed_into_table = $1,
          processed_record_id = $2,
          processed_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [otherRecordsTableName, insertResult.rows[0].id.toString(), rawRecord.id]);
    
    console.log(`✅ LG Record (Lodge Extension) processed successfully (ID: ${insertResult.rows[0].id}) - ${roomNights || 'Unknown'} nights, Total: $${totalCharges || 0}`);
  }

  // Helper method to parse lodging monetary amounts (12-digit fields, right-justified)
  private parseLodgingAmount(value: string): number | null {
    if (!value || value.trim() === '') return null;
    const cleaned = value.replace(/[^\d]/g, '');
    if (cleaned === '') return null;
    const parsed = parseInt(cleaned);
    return isNaN(parsed) ? null : parsed / 100; // Convert cents to dollars
  }



  // Unified method to process both DT and BH records with transactional integrity
  async processPendingTddfRecordsUnified(batchSize: number, recordTypes: string[] = ['DT', 'BH']): Promise<{ 
    processed: number; 
    errors: number; 
    breakdown: Record<string, { processed: number; errors: number }>;
    sampleRecord?: any 
  }> {
    console.log(`[TDDF UNIFIED TRANSACTIONAL] Starting unified TDDF processing with transactional integrity for record types: ${recordTypes.join(', ')}`);
    
    try {
      const tableName = getTableName('tddf_raw_import');
      
      // Get pending records for all specified types
      const recordTypesList = recordTypes.map(type => `'${type}'`).join(',');
      const result = await pool.query(`
        SELECT * FROM "${tableName}" 
        WHERE processing_status = 'pending' AND record_type IN (${recordTypesList})
        ORDER BY line_number
        LIMIT $1
      `, [batchSize]);
      
      const pendingRecords = result.rows;
      console.log(`[UNIFIED PROCESSING] Processing ${pendingRecords.length} pending records (${recordTypes.join(', ')}) with transactional integrity`);
      
      let totalProcessed = 0;
      let totalErrors = 0;
      let sampleRecord = null;
      const breakdown: Record<string, { processed: number; errors: number }> = {};
      
      // Initialize breakdown for each record type
      recordTypes.forEach(type => {
        breakdown[type] = { processed: 0, errors: 0 };
      });
      
      // Process each record within its own transaction for atomic integrity
      for (const rawLine of pendingRecords) {
        const recordType = rawLine.record_type;
        
        // Begin transaction for this TDDF record
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          console.log(`[${recordType} TRANSACTION] Starting transaction for line ${rawLine.line_number}`);
          
          const line = rawLine.raw_line;
          let targetTable: string;
          let processedRecord: any;
          
          if (recordType === 'DT') {
            // Process DT record (existing logic)
            targetTable = getTableName('tddf_transaction_records');
            
            const transactionRecord = {
              sequence_number: line.substring(0, 17).trim() || null,
              entry_run_number: line.substring(2, 9).trim() || null,
              sequence_within_run: line.substring(9, 17).trim() || null,
              record_identifier: line.substring(17, 23).trim() || null,
              bank_number: line.substring(23, 24).trim() || null,
              merchant_account_number: line.substring(23, 39).trim() || null,
              reference_number: line.substring(61, 84).trim() || null,
              transaction_date: this.parseTddfDate(line.substring(84, 92).trim()) || null,
              transaction_amount: this.parseAuthAmount(line.substring(92, 103).trim()) || 0,
              auth_amount: this.parseAuthAmount(line.substring(191, 203).trim()) || 0,
              source_file_id: rawLine.source_file_id,
              source_row_number: rawLine.line_number,
              raw_data: JSON.stringify({ rawLine: line })
            };
            
            const insertResult = await client.query(`
              INSERT INTO "${targetTable}" (
                sequence_number, entry_run_number, sequence_within_run, record_identifier,
                bank_number, merchant_account_number, reference_number, transaction_date,
                transaction_amount, auth_amount, source_file_id, source_row_number, raw_data
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
              RETURNING id
            `, [
              transactionRecord.sequence_number, transactionRecord.entry_run_number,
              transactionRecord.sequence_within_run, transactionRecord.record_identifier,
              transactionRecord.bank_number, transactionRecord.merchant_account_number,
              transactionRecord.reference_number, transactionRecord.transaction_date,
              transactionRecord.transaction_amount, transactionRecord.auth_amount,
              transactionRecord.source_file_id, transactionRecord.source_row_number,
              transactionRecord.raw_data
            ]);
            
            processedRecord = { id: insertResult.rows[0].id, type: 'DT', ...transactionRecord };
            
          } else if (recordType === 'BH') {
            // Process BH record (existing logic)
            targetTable = getTableName('tddf_batch_headers');
            
            const bhRecord = {
              sequence_number: line.substring(0, 7).trim() || null,
              entry_run_number: line.substring(7, 13).trim() || null,
              sequence_within_run: line.substring(13, 17).trim() || null,
              record_identifier: line.substring(17, 19).trim() || null,
              bank_number: line.substring(19, 23).trim() || null,
              merchant_account_number: line.substring(23, 39).trim() || null,
              // BH-specific fields based on TDDF specification
              transaction_code: line.substring(51, 55).trim() || null, // Positions 52-55 (4 chars)
              batch_date: line.substring(55, 63).trim() || null, // Positions 56-63 (8 chars MMDDCCYY)
              batch_julian_date: line.substring(63, 68).trim() || null, // Positions 64-68 (5 chars)
              net_deposit: this.parseAuthAmount(line.substring(68, 83).trim()) || null, // Positions 69-83 (15 chars N) - Net Deposit field
              batch_id: line.substring(123, 126).trim() || null, // Positions 124-126 (3 chars)
              reject_reason: line.substring(83, 87).trim() || null, // Positions 84-87 (4 chars AN)
              source_file_id: rawLine.source_file_id,
              source_row_number: rawLine.line_number,
              raw_data: JSON.stringify({ rawLine: line })
            };
            
            const insertResult = await client.query(`
              INSERT INTO "${targetTable}" (
                sequence_number, entry_run_number, sequence_within_run, record_identifier,
                bank_number, merchant_account_number, transaction_code, batch_date, 
                batch_julian_date, net_deposit, batch_id, reject_reason, source_file_id, source_row_number, raw_data
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
              RETURNING id
            `, [
              bhRecord.sequence_number, bhRecord.entry_run_number,
              bhRecord.sequence_within_run, bhRecord.record_identifier,
              bhRecord.bank_number, bhRecord.merchant_account_number,
              bhRecord.transaction_code, bhRecord.batch_date, bhRecord.batch_julian_date,
              bhRecord.net_deposit, bhRecord.batch_id, bhRecord.reject_reason, bhRecord.source_file_id,
              bhRecord.source_row_number, bhRecord.raw_data
            ]);
            
            processedRecord = { id: insertResult.rows[0].id, type: 'BH', ...bhRecord };
            
          } else if (recordType === 'P1') {
            // Process P1 record (purchasing extension)
            targetTable = getTableName('tddf_purchasing_extensions');
            
            const p1Record = {
              p1_record_number: `P1_${rawLine.source_file_id}_${rawLine.line_number}`,
              record_identifier: line.substring(17, 19).trim() || null, // Positions 18-19
              parent_dt_reference: line.substring(61, 84).trim() || null, // Reference to parent DT record (positions 62-84)
              tax_amount: this.parseAmount(line.substring(150, 162).trim()) || null, // Tax amount field
              discount_amount: this.parseAmount(line.substring(162, 174).trim()) || null, // Discount amount
              freight_amount: this.parseAmount(line.substring(174, 186).trim()) || null, // Freight amount
              duty_amount: this.parseAmount(line.substring(186, 198).trim()) || null, // Duty amount
              purchase_identifier: line.substring(198, 225).trim() || null, // Purchase ID
              source_file_id: rawLine.source_file_id,
              source_row_number: rawLine.line_number,
              raw_data: JSON.stringify({ rawLine: line })
            };
            
            const insertResult = await client.query(`
              INSERT INTO "${targetTable}" (
                p1_record_number, record_identifier, parent_dt_reference,
                tax_amount, discount_amount, freight_amount, duty_amount, purchase_identifier,
                source_file_id, source_row_number, raw_data
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              ON CONFLICT (p1_record_number) DO UPDATE SET
                recorded_at = CURRENT_TIMESTAMP
              RETURNING id
            `, [
              p1Record.p1_record_number, p1Record.record_identifier, p1Record.parent_dt_reference,
              p1Record.tax_amount, p1Record.discount_amount, p1Record.freight_amount,
              p1Record.duty_amount, p1Record.purchase_identifier, p1Record.source_file_id,
              p1Record.source_row_number, p1Record.raw_data
            ]);
            
            processedRecord = { id: insertResult.rows[0].id, type: 'P1', ...p1Record };
          }
          
          // Update raw line processing status within same transaction
          await client.query(`
            UPDATE "${tableName}" 
            SET processing_status = 'processed',
                processed_into_table = $1,
                processed_record_id = $2,
                processed_at = CURRENT_TIMESTAMP
            WHERE id = $3
          `, [targetTable, processedRecord.id.toString(), rawLine.id]);
          
          // Commit transaction
          await client.query('COMMIT');
          console.log(`[${recordType} TRANSACTION] Committed ${recordType} record ${processedRecord.id} from line ${rawLine.line_number}`);
          
          totalProcessed++;
          breakdown[recordType].processed++;
          
          if (!sampleRecord) {
            sampleRecord = processedRecord;
          }
          
          if (totalProcessed % 10 === 0) {
            console.log(`[UNIFIED TRANSACTIONAL] Processed ${totalProcessed} records so far (DT: ${breakdown.DT?.processed || 0}, BH: ${breakdown.BH?.processed || 0})...`);
          }
          
        } catch (error) {
          // Rollback transaction on error
          await client.query('ROLLBACK');
          console.error(`[${recordType} TRANSACTION] Rolled back transaction for line ${rawLine.line_number}:`, error);
          totalErrors++;
          breakdown[recordType].errors++;
          
          // Mark as skipped using pool connection (outside transaction)
          try {
            await pool.query(`
              UPDATE "${tableName}" 
              SET processing_status = 'skipped',
                  skip_reason = $1,
                  processed_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [`transactional_error: ${error instanceof Error ? error.message : 'unknown'}`, rawLine.id]);
          } catch (skipError) {
            console.error(`[${recordType} TRANSACTION] Failed to mark line as skipped:`, skipError);
          }
          
        } finally {
          // Always release the client back to the pool
          client.release();
        }
      }

      console.log(`[UNIFIED TRANSACTIONAL] Batch complete - Total Processed: ${totalProcessed}, Total Errors: ${totalErrors}`);
      console.log(`[UNIFIED BREAKDOWN] DT: ${breakdown.DT?.processed || 0} processed, ${breakdown.DT?.errors || 0} errors`);
      console.log(`[UNIFIED BREAKDOWN] BH: ${breakdown.BH?.processed || 0} processed, ${breakdown.BH?.errors || 0} errors`);
      
      return { processed: totalProcessed, errors: totalErrors, breakdown, sampleRecord };
      
    } catch (error) {
      console.error('Error in unified TDDF processing with transactional integrity:', error);
      throw error;
    }
  }

  // Get TDDF batch headers with pagination
  async getTddfBatchHeaders(options: {
    page?: number;
    limit?: number;
    merchantAccount?: string;
  }): Promise<{
    data: TddfBatchHeader[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    try {
      const page = options.page || 1;
      const limit = Math.min(options.limit || 50, 500);
      const offset = (page - 1) * limit;

      const tableName = getTableName("tddf_batch_headers");
      
      // Build WHERE clause for merchant account filtering
      let whereClause = "";
      let queryParams: any[] = [];
      
      if (options.merchantAccount) {
        whereClause = "WHERE merchant_account_number = $1";
        queryParams = [options.merchantAccount, limit, offset];
      } else {
        queryParams = [limit, offset];
      }

      // Get total count using raw SQL to bypass foreign key constraints
      const countQuery = `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`;
      const countParams = options.merchantAccount ? [options.merchantAccount] : [];
      const countResult = await pool.query(countQuery, countParams);
      const count = parseInt(countResult.rows[0]?.count || '0');

      // Get records using raw SQL
      const dataQuery = `
        SELECT id, bh_record_number as "bhRecordNumber", record_identifier as "recordIdentifier", 
               transaction_code as "transactionCode", batch_date as "batchDate", 
               batch_julian_date as "batchJulianDate", net_deposit as "netDeposit", 
               batch_id as "batchId", reject_reason as "rejectReason", 
               merchant_account_number as "merchantAccountNumber",
               source_file_id as "sourceFileId", source_row_number as "sourceRowNumber",
               recorded_at as "recordedAt", raw_data as "rawData",
               created_at as "createdAt", updated_at as "updatedAt"
        FROM ${tableName} 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
      `;
      
      console.log(`[BH QUERY] Executing: ${dataQuery}`);
      console.log(`[BH QUERY] Params:`, queryParams);
      
      const dataResult = await pool.query(dataQuery, queryParams);
      const data = dataResult.rows;

      console.log(`[BH QUERY] Found ${data.length} BH records out of ${count} total`);

      const totalPages = Math.ceil(count / limit);

      return {
        data,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: count,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error getting TDDF batch headers:', error);
      throw error;
    }
  }

  // Get TDDF purchasing extensions (P1 records) with pagination
  async getTddfPurchasingExtensions(options: {
    page?: number;
    limit?: number;
  }): Promise<{
    data: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    try {
      const page = options.page || 1;
      const limit = Math.min(options.limit || 50, 500);
      const offset = (page - 1) * limit;

      const tableName = getTableName("tddf_purchasing_extensions");
      
      // Get total count using raw SQL
      const countQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
      const countResult = await pool.query(countQuery);
      const count = parseInt(countResult.rows[0]?.count || '0');

      // Get records using raw SQL
      const dataQuery = `
        SELECT id, p1_record_number as "sequenceNumber", record_identifier as "recordIdentifier", 
               tax_amount as "taxAmount", tax_rate as "taxRate", tax_type as "taxType",
               purchase_identifier as "purchaseIdentifier", customer_code as "customerCode",
               sales_tax as "salesTax", freight_amount as "freightAmount", 
               destination_zip as "destinationZip", merchant_type as "merchantType",
               duty_amount as "dutyAmount", merchant_tax_id as "merchantTaxId",
               ship_from_zip_code as "shipFromZipCode", discount_amount as "discountAmount",
               source_file_id as "sourceFileId", source_row_number as "sourceRowNumber",
               recorded_at as "recordedAt", created_at as "createdAt", updated_at as "updatedAt"
        FROM ${tableName} 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2
      `;
      
      console.log(`[P1 QUERY] Executing: ${dataQuery}`);
      console.log(`[P1 QUERY] Params:`, [limit, offset]);
      
      const dataResult = await pool.query(dataQuery, [limit, offset]);
      const data = dataResult.rows;

      console.log(`[P1 QUERY] Found ${data.length} P1 records out of ${count} total`);

      const totalPages = Math.ceil(count / limit);

      return {
        data,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: count,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error getting TDDF purchasing extensions (P1):', error);
      throw error;
    }
  }

  // Get TDDF purchasing extensions 2 (P2 records) with pagination
  async getTddfPurchasingExtensions2(options: {
    page?: number;
    limit?: number;
  }): Promise<{
    data: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    try {
      const page = options.page || 1;
      const limit = Math.min(options.limit || 50, 500);
      const offset = (page - 1) * limit;

      const tableName = getTableName("tddf_purchasing_extensions_2");
      
      // Get total count using raw SQL
      const countQuery = `SELECT COUNT(*) as count FROM ${tableName}`;
      const countResult = await pool.query(countQuery);
      const count = parseInt(countResult.rows[0]?.count || '0');

      // Get records using raw SQL
      const dataQuery = `
        SELECT id, sequence_number as "sequenceNumber", entry_run_number as "entryRunNumber", 
               sequence_within_run as "sequenceWithinRun", record_identifier as "recordIdentifier", 
               discount_amount as "discountAmount", alternate_tax_identifier as "alternateTaxIdentifier",
               product_code as "productCode", item_description as "itemDescription",
               item_quantity as "itemQuantity", item_unit_of_measure as "itemUnitOfMeasure",
               unit_cost as "unitCost", net_gross_indicator as "netGrossIndicator",
               vat_rate_applied as "vatRateApplied", vat_type_applied as "vatTypeApplied",
               vat_amount as "vatAmount", item_commodity_code as "itemCommodityCode",
               line_item_total as "lineItemTotal", item_descriptor as "itemDescriptor",
               source_file_id as "sourceFileId", source_row_number as "sourceRowNumber",
               recorded_at as "recordedAt", created_at as "createdAt", updated_at as "updatedAt"
        FROM ${tableName} 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2
      `;
      
      console.log(`[P2 QUERY] Executing: ${dataQuery}`);
      console.log(`[P2 QUERY] Params:`, [limit, offset]);
      
      const dataResult = await pool.query(dataQuery, [limit, offset]);
      const data = dataResult.rows;

      console.log(`[P2 QUERY] Found ${data.length} P2 records out of ${count} total`);

      const totalPages = Math.ceil(count / limit);

      return {
        data,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: count,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error getting TDDF purchasing extensions 2 (P2):', error);
      throw error;
    }
  }

  // Get TDDF other records (E1, G2, AD, DR, etc.) with pagination and filtering
  async getTddfOtherRecords(options: {
    page?: number;
    limit?: number;
    recordType?: string;
  }): Promise<{
    data: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    try {
      const page = options.page || 1;
      const limit = Math.min(options.limit || 50, 500);
      const offset = (page - 1) * limit;

      const tableName = getTableName("tddf_other_records");
      
      // Build WHERE clause for record type filtering
      let whereClause = "";
      let queryParams: any[] = [];
      
      if (options.recordType) {
        whereClause = "WHERE record_type = $1";
        queryParams = [options.recordType, limit, offset];
      } else {
        queryParams = [limit, offset];
      }

      // Get total count using raw SQL
      const countQuery = `SELECT COUNT(*) as count FROM ${tableName} ${whereClause}`;
      const countParams = options.recordType ? [options.recordType] : [];
      const countResult = await pool.query(countQuery, countParams);
      const count = parseInt(countResult.rows[0]?.count || '0');

      // Get records using raw SQL
      const dataQuery = `
        SELECT id, record_type as "recordType", 
               merchant_account as "merchantAccount",
               reference_number as "referenceNumber",
               transaction_date as "transactionDate",
               amount, description,
               raw_data as "recordData",
               source_file_id as "sourceFileId", 
               source_row_number as "sourceRowNumber",
               recorded_at as "recordedAt",
               created_at as "createdAt", 
               updated_at as "updatedAt"
        FROM ${tableName} 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
      `;
      
      console.log(`[OTHER QUERY] Executing: ${dataQuery}`);
      console.log(`[OTHER QUERY] Params:`, queryParams);
      
      const dataResult = await pool.query(dataQuery, queryParams);
      const data = dataResult.rows.map(row => {
        // Extract EMV fields from recordData for E1 records
        if (row.recordType === 'E1' && row.recordData) {
          const emvData = row.recordData;
          return {
            ...row,
            emvAmount: emvData.emvAmountAuthorized || emvData.emvAmountOther || null,
            emvApplicationId: emvData.emvApplicationId || null,
            emvTerminalVerificationResults: emvData.emvTerminalVerificationResults || null,
            emvTransactionCurrencyCode: emvData.emvTransactionCurrencyCode || null,
            emvApplicationCryptogram: emvData.emvApplicationCryptogram || null,
            emvIssuerApplicationData: emvData.emvIssuerApplicationData || null
          };
        }
        return row;
      });

      console.log(`[OTHER QUERY] Found ${data.length} ${options.recordType || 'other'} records out of ${count} total`);

      const totalPages = Math.ceil(count / limit);

      return {
        data,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems: count,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error('Error getting TDDF other records:', error);
      throw error;
    }
  }

  // Delete TDDF batch headers (bulk)
  async deleteTddfBatchHeaders(recordIds: number[]): Promise<void> {
    try {
      console.log(`[BH DELETE] Deleting ${recordIds.length} BH records:`, recordIds);
      
      await db.delete(tddfBatchHeaders)
        .where(inArray(tddfBatchHeaders.id, recordIds));
      
      console.log(`[BH DELETE] Successfully deleted ${recordIds.length} BH records`);
    } catch (error) {
      console.error('Error deleting TDDF batch headers:', error);
      throw error;
    }
  }

  // Helper method to process a single TDDF line from raw data
  private processTddfLineFromRawData(rawLine: string, sourceFileId: string): InsertTddfRecord | null {
    try {
      if (!rawLine || rawLine.length < 400) {
        return null;
      }

      // Extract key fields from fixed-width positions
      const sequenceNumber = rawLine.substring(0, 17).trim();
      const recordType = rawLine.substring(17, 19);
      const merchantAccountNumber = rawLine.substring(23, 39).trim();
      const referenceNumber = rawLine.substring(61, 84).trim();
      const transactionDateStr = rawLine.substring(84, 92);
      const transactionAmountStr = rawLine.substring(92, 103).trim();
      const authAmountStr = rawLine.substring(191, 203).trim();
      const cardType = rawLine.substring(250, 256).trim();
      const debitCreditIndicator = rawLine.substring(256, 257);

      // Validate this is a DT record
      if (recordType !== 'DT') {
        return null;
      }

      return {
        sequenceNumber,
        recordType,
        merchantAccountNumber,
        referenceNumber,
        transactionDate: this.parseTddfDate(transactionDateStr),
        transactionAmount: this.parseAuthAmount(transactionAmountStr),
        authAmount: this.parseAuthAmount(authAmountStr),
        cardType: cardType || null,
        debitCreditIndicator: debitCreditIndicator || null,
        sourceFileId
      };

    } catch (error) {
      console.error('Error processing TDDF line from raw data:', error);
      return null;
    }
  }

  // COMPREHENSIVE UPLOAD LOGIC: Store TDDF file content as raw import records only (no processing)
  async storeTddfFileAsRawImportComprehensive(base64Content: string, fileId: string, filename: string): Promise<{ rowsStored: number; recordTypes: { [key: string]: number }; errors: number }> {
    console.log(`=================== TDDF RAW IMPORT STORAGE (UPLOAD ONLY) ===================`);
    console.log(`Storing TDDF file as raw import records: ${filename}`);
    
    // Decode base64 content FIRST - this is critical for correct record type detection
    const fileContent = Buffer.from(base64Content, 'base64').toString('utf8');
    console.log(`File content length: ${fileContent.length} characters`);
    console.log(`🔍 DEBUG: Base64 length: ${base64Content.length}, Decoded length: ${fileContent.length}`);
    
    let rowCount = 0;
    let errorCount = 0;
    
    // Comprehensive record type definitions
    const recordTypeDefinitions: { [key: string]: string } = {
      'BH': 'Batch Header',
      'DT': 'Detail Transaction Record',
      'A1': 'Airline/Passenger Transport 1 Extension Record',
      'A2': 'Airline/Passenger Transport 2 Extension Record', 
      'P1': 'Purchasing Card 1 Extension Record',
      'P2': 'Purchasing Card 2 Extension Record',
      'DR': 'Direct Marketing Extension Record',
      'CT': 'Car Rental Extension Record',
      'LG': 'Lodge Extension Record',
      'FT': 'Fleet Extension Record',
      'F2': 'Fleet 2 Extension Record',
      'CK': 'Electronic Check Extension Record',
      'AD': 'Merchant Adjustment Record'
    };

    // Statistics tracking for different record types
    const recordTypeStats: { [key: string]: number } = {};

    try {
      // Split file into lines for fixed-width processing
      const lines = fileContent.split('\n').filter(line => line.trim());
      console.log(`Total non-empty lines in file: ${lines.length}`);

      // STEP 1: Store all raw lines in order in the raw import table
      console.log(`\n=== STEP 1: STORING ALL RAW LINES IN ORDER ===`);
      const rawImportRecords: InsertTddfRawImport[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        rowCount++;
        
        // Extract record identifier at positions 18-19 (0-indexed: 17-18)
        const recordType = line.length >= 19 ? line.substring(17, 19) : 'XX';
        const recordDescription = recordTypeDefinitions[recordType] || 'Unknown Record Type';
        
        // Track all record types found
        if (recordTypeStats[recordType]) {
          recordTypeStats[recordType]++;
        } else {
          recordTypeStats[recordType] = 1;
        }
        
        rawImportRecords.push({
          sourceFileId: fileId,
          lineNumber: i + 1,
          rawLine: line,
          recordType,
          recordDescription,
          lineLength: line.length,
          processed: false
        });
        
        console.log(`[RAW IMPORT] Line ${i + 1}: '${recordType}' - ${recordDescription} (${line.length} chars)`);
      }
      
      // Insert raw lines in very small batches to avoid ORM stack overflow issues
      console.log(`Inserting ${rawImportRecords.length} raw lines in small batches...`);
      const insertedRawLines: TddfRawImport[] = [];
      const BATCH_SIZE = 10; // Much smaller batch size to avoid Drizzle ORM stack overflow
      let successfulInserts = 0;
      
      for (let i = 0; i < rawImportRecords.length; i += BATCH_SIZE) {
        const batch = rawImportRecords.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(rawImportRecords.length / BATCH_SIZE);
        
        console.log(`Processing batch ${batchNum}/${totalBatches}: ${batch.length} records`);
        
        try {
          // For very large files, do individual inserts to prevent stack overflow
          if (rawImportRecords.length > 1000) {
            for (const record of batch) {
              try {
                const individualResult = await this.createTddfRawImportRecords([record]);
                insertedRawLines.push(...individualResult);
                successfulInserts++;
              } catch (individualError: any) {
                console.error(`Failed individual raw import insert: ${individualError.message}`);
                errorCount++;
              }
            }
          } else {
            const batchResult = await this.createTddfRawImportRecords(batch);
            insertedRawLines.push(...batchResult);
            successfulInserts += batchResult.length;
          }
        } catch (error: any) {
          console.error(`Error with batch ${batchNum}: ${error.message}`);
          
          // Fallback to individual inserts for this batch
          for (const record of batch) {
            try {
              const individualResult = await this.createTddfRawImportRecords([record]);
              insertedRawLines.push(...individualResult);
              successfulInserts++;
            } catch (individualError: any) {
              console.error(`Failed fallback individual insert: ${individualError.message}`);
              errorCount++;
            }
          }
        }
        
        // Progress update for large files
        if (batchNum % 10 === 0 || batchNum === totalBatches) {
          const progress = ((i + batch.length) / rawImportRecords.length * 100).toFixed(1);
          console.log(`Progress: ${progress}% (${successfulInserts}/${rawImportRecords.length} inserted, ${errorCount} errors)`);
          
          // Record processing metrics for live chart updates
          await this.recordTddfProcessingMetrics(successfulInserts, totalBatches);
        }
      }
      
      console.log(`✅ Stored ${successfulInserts} raw lines in TDDF raw import table (${errorCount} failed)`);
      
      return {
        rowsStored: successfulInserts,
        recordTypes: recordTypeStats,
        errors: errorCount
      };
      
    } catch (error: any) {
      console.error('Error storing TDDF raw import records:', error);
      throw new Error(`Failed to store TDDF raw import: ${error.message}`);
    }
  }

  // RETRY LOGIC: Reset failed TDDF file for reprocessing
  async retryFailedTddfFile(fileId: string): Promise<{ success: boolean; message: string }> {
    console.log(`🔄 Retrying failed TDDF file: ${fileId}`);
    
    try {
      const uploadsTableName = getTableName('uploaded_files');
      const rawImportTableName = getTableName('tddf_raw_import');
      
      // Check if file exists and is failed
      const fileResult = await db.execute(sql`
        SELECT id, original_filename, file_content, processing_errors
        FROM ${sql.identifier(uploadsTableName)}
        WHERE id = ${fileId} AND file_type = 'tddf' AND processing_status = 'failed'
      `);
      
      if (fileResult.rows.length === 0) {
        return { success: false, message: 'File not found or not in failed state' };
      }
      
      const file = fileResult.rows[0];
      console.log(`🔄 Retrying: ${file.original_filename} (Previous error: ${file.processing_errors})`);
      
      // Reset file status to queued for reprocessing
      await db.execute(sql`
        UPDATE ${sql.identifier(uploadsTableName)}
        SET processing_status = 'queued',
            processing_errors = NULL,
            processing_completed_at = NULL,
            processed_at = NULL,
            processed = false,
            records_processed = 0,
            records_skipped = 0,
            records_with_errors = 0
        WHERE id = ${fileId}
      `);
      
      // Clear any existing raw import records for this file
      await db.execute(sql`
        DELETE FROM ${sql.identifier(rawImportTableName)}
        WHERE source_file_id = ${fileId}
      `);
      
      console.log(`✅ File ${file.original_filename} reset for reprocessing`);
      return { success: true, message: `File ${file.original_filename} has been reset and queued for reprocessing` };
      
    } catch (error: any) {
      console.error(`❌ Error retrying file ${fileId}:`, error);
      return { success: false, message: `Error retrying file: ${error.message}` };
    }
  }

  // BULK RETRY LOGIC: Reset all failed TDDF files for reprocessing
  async retryAllFailedTddfFiles(): Promise<{ filesRetried: number; errors: string[] }> {
    console.log(`🔄 Retrying all failed TDDF files`);
    
    const uploadsTableName = getTableName('uploaded_files');
    const rawImportTableName = getTableName('tddf_raw_import');
    const errors: string[] = [];
    let filesRetried = 0;
    
    try {
      // Get all failed TDDF files
      const failedFilesResult = await db.execute(sql`
        SELECT id, original_filename, processing_errors
        FROM ${sql.identifier(uploadsTableName)}
        WHERE file_type = 'tddf' AND processing_status = 'failed'
        ORDER BY upload_date ASC
      `);
      
      const failedFiles = failedFilesResult.rows;
      console.log(`📄 Found ${failedFiles.length} failed TDDF files to retry`);
      
      for (const file of failedFiles) {
        try {
          console.log(`🔄 Retrying: ${file.original_filename} (Error: ${file.processing_errors?.substring(0, 50)}...)`);
          
          // Reset file status to queued
          await db.execute(sql`
            UPDATE ${sql.identifier(uploadsTableName)}
            SET processing_status = 'queued',
                processing_errors = NULL,
                processing_completed_at = NULL,
                processed_at = NULL,
                processed = false,
                records_processed = 0,
                records_skipped = 0,
                records_with_errors = 0
            WHERE id = ${file.id}
          `);
          
          // Clear existing raw import records
          await db.execute(sql`
            DELETE FROM ${sql.identifier(rawImportTableName)}
            WHERE source_file_id = ${file.id}
          `);
          
          filesRetried++;
          console.log(`✅ Reset: ${file.original_filename}`);
          
        } catch (fileError: any) {
          const errorMsg = `Failed to retry ${file.original_filename}: ${fileError.message}`;
          errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }
      
      console.log(`🎉 Bulk retry complete: ${filesRetried} files reset for reprocessing`);
      return { filesRetried, errors };
      
    } catch (error: any) {
      console.error(`❌ Error in bulk retry:`, error);
      errors.push(`Bulk retry error: ${error.message}`);
      return { filesRetried, errors };
    }
  }

  // HELPER: Process TDDF content directly without encoding detection
  private processTddfContentDirectly(content: string, context: string): string {
    console.log(`📋 [${context}] Processing TDDF content directly - Length: ${content.length}`);
    console.log(`📋 [${context}] First 80 chars: "${content.substring(0, 80)}"`);
    
    // TDDF content should be processed as-is, no encoding/decoding
    return content;
  }

  // PROCESSING LOGIC: Complete TDDF file processing from raw import data
  async processTddfFileFromContent(
    content: string, 
    sourceFileId: string, 
    originalFilename: string
  ): Promise<{ rowsProcessed: number; tddfRecordsCreated: number; errors: number }> {
    console.log(`=================== TDDF FILE PROCESSING (COMPLETE PIPELINE) ===================`);
    console.log(`Processing TDDF file: ${originalFilename} (${sourceFileId})`);
    
    try {
      // FIXED: Detect if content is Base64 encoded or raw TDDF content
      let processedContent: string;
      
      // IMPROVED: First detect Base64, then check for TDDF patterns in decoded content
      const couldBeBase64 = content.length >= 50 && 
                           /^[A-Za-z0-9+/=\s]*$/.test(content) &&
                           !content.includes('\n') && 
                           content.length % 4 === 0;
      
      let testContent = content;
      let isBase64 = false;
      
      // If it could be Base64, try to decode and check for TDDF patterns in decoded content
      if (couldBeBase64) {
        try {
          const decodedContent = Buffer.from(content, 'base64').toString('utf8');
          const hasTddfPatternsInDecoded = decodedContent.includes('BH') || 
                                          decodedContent.includes('DT') || 
                                          decodedContent.includes('P1') ||
                                          /^\d{14,}/.test(decodedContent) ||
                                          decodedContent.startsWith('01469') ||
                                          /\d{14,}BH/.test(decodedContent) ||
                                          /\d{14,}DT/.test(decodedContent);
          
          if (hasTddfPatternsInDecoded) {
            // It's Base64 encoded TDDF content
            isBase64 = true;
            testContent = decodedContent;
            console.log(`📋 [COMPLETE_PIPELINE] Detected Base64-encoded TDDF content`);
          }
        } catch (decodeError) {
          // Not valid Base64, treat as raw content
          console.log(`📋 [COMPLETE_PIPELINE] Base64 decode failed, treating as raw content`);
        }
      }
      
      // Check for TDDF patterns in the test content (either raw or decoded)
      const hasTddfPatterns = testContent.includes('BH') || 
                             testContent.includes('DT') || 
                             testContent.includes('P1') ||
                             /^\d{14,}/.test(testContent) ||
                             testContent.startsWith('01469') ||
                             /\d{14,}BH/.test(testContent) ||
                             /\d{14,}DT/.test(testContent);
      
      if (isBase64) {
        // Content is Base64 encoded - decode it
        const decodedContent = Buffer.from(content, 'base64').toString('utf8');
        // CRITICAL FIX: Remove null bytes that cause PostgreSQL UTF-8 errors
        processedContent = decodedContent.replace(/\x00/g, '');
        console.log(`📋 [COMPLETE_PIPELINE] Detected Base64 content - Decoded from ${content.length} to ${decodedContent.length} chars`);
        if (decodedContent.length !== processedContent.length) {
          console.log(`🧹 [COMPLETE_PIPELINE] Removed ${decodedContent.length - processedContent.length} null bytes for database compatibility`);
        }
        console.log(`📋 [COMPLETE_PIPELINE] First 80 chars of cleaned TDDF: "${processedContent.substring(0, 80)}"`);
      } else {
        // Content is already raw TDDF - clean any potential null bytes
        processedContent = content.replace(/\x00/g, '');
        if (content.length !== processedContent.length) {
          console.log(`🧹 [COMPLETE_PIPELINE] Removed ${content.length - processedContent.length} null bytes from raw content`);
        }
        console.log(`📋 [COMPLETE_PIPELINE] Detected raw TDDF content - Length: ${processedContent.length}`);
        console.log(`📋 [COMPLETE_PIPELINE] First 80 chars: "${processedContent.substring(0, 80)}"`);
      }
      
      // STEP 1: Store all raw lines first (processed directly)
      const storageResult = await this.storeTddfFileAsRawImport(processedContent, sourceFileId, originalFilename);
      console.log(`Raw storage completed: ${storageResult.rowsStored} lines stored`);
      
      // STEP 2: Process ALL record types using switch-based approach (single-query optimization)
      console.log(`🔄 [SWITCH-PIPELINE] Starting switch-based processing for all record types`);
      const switchProcessingResult = await this.processPendingTddfRecordsSwitchBased(sourceFileId, 1000);
      console.log(`✅ [SWITCH-PIPELINE] Switch processing completed:`);
      console.log(`   • Total Processed: ${switchProcessingResult.totalProcessed}`);
      console.log(`   • Total Skipped: ${switchProcessingResult.totalSkipped}`);
      console.log(`   • Total Errors: ${switchProcessingResult.totalErrors}`);
      console.log(`   • Processing Time: ${switchProcessingResult.processingTime}ms`);
      console.log(`   • Record Type Breakdown:`, JSON.stringify(switchProcessingResult.breakdown, null, 2));
      
      return {
        rowsProcessed: storageResult.rowsStored,
        tddfRecordsCreated: switchProcessingResult.totalProcessed,
        errors: storageResult.errors + switchProcessingResult.totalErrors
      };
      
    } catch (error: any) {
      console.error(`Error in complete TDDF processing pipeline: ${error.message}`);
      throw error;
    }
  }

  // PROCESSING LOGIC: Process pending DT records from raw import table (separate from upload) 
  async processPendingTddfDtRecords(fileId?: string, maxRecords?: number): Promise<{ processed: number; skipped: number; errors: number }> {
    console.log(`=================== TDDF DT PROCESSING (PROCESSING ONLY) ===================`);
    console.log(`Processing pending DT records from raw import table`);
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    // Initialize tracking variables for comprehensive summary
    const recordTypeStats: Record<string, number> = {};
    const recordTypeDefinitions: Record<string, string> = {
      'DT': 'Detail Transaction',
      'BH': 'Batch Header',
      'P1': 'Purchasing Card Extension',
      'P2': 'Purchasing Card Extension 2',
      'A1': 'Additional Record Type 1',
      'A2': 'Additional Record Type 2',
      'DR': 'Direct Marketing',
      'CT': 'Corporate Travel',
      'LG': 'Large Ticket',
      'FT': 'Fleet',
      'F2': 'Fleet Extension',
      'CK': 'Check',
      'AD': 'Adjustment',
      'TA': 'Transaction Aggregation',
      'DA': 'Data Aggregation',
      'HD': 'Header',
      'TR': 'Trailer'
    };
    
    let rowCount = 0;
    let insertedRawLines: any[] = [];
    let tddfRecordsCreated = processed;
    let errorCount = errors;
    
    try {
      // Use raw SQL to avoid Drizzle ORM column name issues
      const tableName = getTableName('tddf_raw_import');
      
      let sqlQuery = `
        SELECT * FROM "${tableName}"
        WHERE record_type = 'DT' 
        AND processing_status = 'pending'
      `;
      const queryParams: any[] = [];
      
      if (fileId) {
        sqlQuery += ' AND source_file_id = $1';
        queryParams.push(fileId);
      }
      
      sqlQuery += ' ORDER BY line_number';
      
      if (maxRecords) {
        const paramIndex = queryParams.length + 1;
        sqlQuery += ` LIMIT $${paramIndex}`;
        queryParams.push(maxRecords);
      }
      
      const result = await pool.query(sqlQuery, queryParams);
      const dtRecords = result.rows;
      console.log(`Found ${dtRecords.length} pending DT records to process`);
      
      for (const rawLine of dtRecords) {
        if (rawLine.record_type === 'DT') {
          try {
            console.log(`[DT PROCESSING] Processing line ${rawLine.line_number}: ${rawLine.record_description}`);
            
            // Parse the DT record using the existing parsing logic
            const line = rawLine.raw_line;
            
            // Parse comprehensive TDDF fixed-width format based on full specification
            const tddfRecord: InsertTddfRecord = {
              // Core TDDF header fields (positions 1-23)
              sequenceNumber: line.substring(0, 7).trim() || null,
              entryRunNumber: line.substring(7, 13).trim() || null,
              sequenceWithinRun: line.substring(13, 17).trim() || null,
              recordIdentifier: line.substring(17, 19).trim() || null,
              bankNumber: line.substring(19, 23).trim() || null,
              
              // Account and merchant fields (positions 24-61)
              merchantAccountNumber: line.substring(23, 39).trim() || null,
              associationNumber1: line.substring(39, 45).trim() || null,
              groupNumber: line.substring(45, 51).trim() || null,
              transactionCode: line.substring(51, 55).trim() || null,
              associationNumber2: line.substring(55, 61).trim() || null,
              
              // Core transaction fields (positions 62-142)
              referenceNumber: line.substring(61, 84).trim() || null,
              transactionDate: this.parseTddfDate(line.substring(84, 92).trim()),
              transactionAmount: this.parseAuthAmount(line.substring(92, 103).trim()),
              batchJulianDate: line.substring(103, 108).trim() || null,
              netDeposit: this.parseAmount(line.substring(108, 123).trim()),
              cardholderAccountNumber: line.substring(123, 142).trim() || null,
              
              // Transaction details (positions 143-187)
              bestInterchangeEligible: line.substring(142, 144).trim() || null,
              transactionDataConditionCode: line.substring(144, 146).trim() || null,
              downgradeReason1: line.substring(146, 150).trim() || null,
              downgradeReason2: line.substring(150, 154).trim() || null,
              downgradeReason3: line.substring(154, 164).trim() || null,
              onlineEntry: line.substring(164, 165).trim() || null,
              achFlag: line.substring(165, 166).trim() || null,
              authSource: line.substring(166, 167).trim() || null,
              cardholderIdMethod: line.substring(167, 168).trim() || null,
              catIndicator: line.substring(168, 169).trim() || null,
              reimbursementAttribute: line.substring(169, 170).trim() || null,
              mailOrderTelephoneIndicator: line.substring(170, 171).trim() || null,
              authCharInd: line.substring(171, 172).trim() || null,
              banknetReferenceNumber: line.substring(172, 187).trim() || null,
              
              // Additional transaction info (positions 188-242)
              draftAFlag: line.substring(187, 188).trim() || null,
              authCurrencyCode: line.substring(188, 191).trim() || null,
              authAmount: this.parseAuthAmount(line.substring(191, 203).trim()),
              validationCode: line.substring(203, 207).trim() || null,
              authResponseCode: line.substring(207, 209).trim() || null,
              networkIdentifierDebit: line.substring(209, 212).trim() || null,
              switchSettledIndicator: line.substring(212, 213).trim() || null,
              posEntryMode: line.substring(213, 215).trim() || null,
              debitCreditIndicator: line.substring(215, 216).trim() || null,
              reversalFlag: line.substring(216, 217).trim() || null,
              merchantName: line.substring(217, 242).trim() || null,
              
              // Authorization and card details (positions 243-268)
              authorizationNumber: line.substring(242, 250).trim() || null,
              rejectReason: line.substring(248, 252).trim() || null,
              cardType: line.substring(252, 254).trim() || null, // Corrected to TDDF spec: positions 253-254 (2 chars)
              currencyCode: line.substring(254, 257).trim() || null,
              originalTransactionAmount: this.parseAmount(line.substring(257, 268).trim()),
              
              // Additional flags and codes (positions 269-284)
              foreignCardIndicator: line.substring(268, 269).trim() || null,
              carryoverIndicator: line.substring(269, 270).trim() || null,
              extensionRecordIndicator: line.substring(270, 272).trim() || null,
              mccCode: line.substring(272, 276).trim() || null, // Positions 273-276: MCC (4 chars)
              vNumber: line.substring(276, 284).trim() || null, // Positions 277-284: V Number (8 chars) - matches PowerShell spec
              terminalId: line.substring(276, 284).trim() || null, // Legacy field - same as vNumber for backward compatibility
              
              // Extended fields (positions 285+) - Add more based on line length
              discoverPosEntryMode: line.length > 287 ? line.substring(284, 287).trim() || null : null,
              purchaseId: line.length > 312 ? line.substring(287, 312).trim() || null : null,
              cashBackAmount: line.length > 321 ? this.parseAmount(line.substring(312, 321).trim()) : null,
              cashBackAmountSign: line.length > 322 ? line.substring(321, 322).trim() || null : null,
              posDataCode: line.length > 335 ? line.substring(322, 335).trim() || null : null,
              transactionTypeIdentifier: line.length > 338 ? line.substring(334, 338).trim() || null : null,
              cardTypeExtended: line.length > 341 ? line.substring(338, 341).trim() || null : null,
              productId: line.length > 343 ? line.substring(341, 343).trim() || null : null,
              submittedInterchange: line.length > 348 ? line.substring(343, 348).trim() || null : null,
              systemTraceAuditNumber: line.length > 354 ? line.substring(348, 354).trim() || null : null,
              discoverTransactionType: line.length > 356 ? line.substring(354, 356).trim() || null : null,
              localTransactionTime: line.length > 362 ? line.substring(356, 362).trim() || null : null,
              discoverProcessingCode: line.length > 368 ? line.substring(362, 368).trim() || null : null,
              commercialCardServiceIndicator: line.length > 369 ? line.substring(368, 369).trim() || null : null,
              
              // Fee and regulatory fields (positions 370+)
              mastercardCrossBorderFee: line.length > 378 ? this.parseAmount(line.substring(369, 378).trim()) : null,
              cardBrandFeeCode: line.length > 379 ? line.substring(378, 379).trim() || null : null,
              dccIndicator: line.length > 380 ? line.substring(379, 380).trim() || null : null,
              regulatedIndicator: line.length > 381 ? line.substring(380, 381).trim() || null : null,
              visaIntegrityFee: line.length > 390 ? this.parseAmount(line.substring(381, 390).trim()) : null,
              foreignExchangeFlag: line.length > 391 ? line.substring(390, 391).trim() || null : null,
              visaFeeProgramIndicator: line.length > 394 ? line.substring(391, 394).trim() || null : null,
              transactionFeeDebitCreditIndicator: line.length > 396 ? line.substring(394, 396).trim() || null : null,
              transactionFeeAmount: line.length > 413 ? this.parseAmount(line.substring(396, 413).trim()) : null,
              transactionFeeAmountCardholder: line.length > 424 ? this.parseAmount(line.substring(413, 424).trim()) : null,
              
              // IASF and additional fees (positions 425+)
              iasfFeeType: line.length > 426 ? line.substring(424, 426).trim() || null : null,
              iasfFeeAmount: line.length > 437 ? this.parseAmount(line.substring(426, 437).trim()) : null,
              iasfFeeDebitCreditIndicator: line.length > 438 ? line.substring(437, 438).trim() || null : null,
              merchantAssignedReferenceNumber: line.length > 450 ? line.substring(438, 450).trim() || null : null,
              netDepositAdjustmentAmount: line.length > 465 ? this.parseAmount(line.substring(450, 465).trim()) : null,
              netDepositAdjustmentDc: line.length > 466 ? line.substring(465, 466).trim() || null : null,
              mcCashBackFee: line.length > 481 ? line.substring(466, 481).trim() || null : null,
              mcCashBackFeeSign: line.length > 482 ? line.substring(481, 482).trim() || null : null,
              
              // American Express fields (positions 483-628) - Add based on line length
              amexIndustrySeNumber: line.length > 492 ? line.substring(482, 492).trim() || null : null,
              amexMerchantSellerId: line.length > 512 ? line.substring(492, 512).trim() || null : null,
              amexMerchantSellerName: line.length > 537 ? line.substring(512, 537).trim() || null : null,
              amexMerchantSellerAddress: line.length > 562 ? line.substring(537, 562).trim() || null : null,
              amexMerchantSellerPhone: line.length > 578 ? line.substring(562, 578).trim() || null : null,
              amexMerchantSellerPostalCode: line.length > 588 ? line.substring(578, 588).trim() || null : null,
              amexMerchantSellerEmail: line.length > 628 ? line.substring(588, 628).trim() || null : null,
              
              // Advanced transaction classification (positions 629-650+)
              mastercardTransactionIntegrityClass: line.length > 630 ? line.substring(628, 630).trim() || null : null,
              equipmentSourceIdentification: line.length > 633 ? line.substring(630, 633).trim() || null : null,
              operatorId: line.length > 636 ? line.substring(633, 636).trim() || null : null,
              requestedPaymentService: line.length > 637 ? line.substring(636, 637).trim() || null : null,
              totalAuthorizedAmount: line.length > 649 ? this.parseAmount(line.substring(637, 649).trim()) : null,
              interchangeFeeAmount: line.length > 666 ? this.parseAmount(line.substring(649, 666).trim()) : null,
              mastercardWalletIdentifier: line.length > 669 ? line.substring(666, 669).trim() || null : null,
              visaSpecialConditionIndicator: line.length > 670 ? line.substring(669, 670).trim() || null : null,
              interchangePercentRate: line.length > 676 ? this.parseAmount(line.substring(670, 676).trim()) : null,
              interchangePerItemRate: line.length > 682 ? this.parseAmount(line.substring(676, 682).trim()) : null,
              
              // System and audit fields
              sourceFileId: fileId,
              sourceRowNumber: rawLine.line_number,
              mmsRawLine: line, // Store complete raw line in the MMS-RAW-Line field
              rawData: {
                recordType: rawLine.record_type,
                recordDescription: rawLine.record_description,
                lineNumber: rawLine.line_number,
                filename: rawLine.source_file_id,
                lineLength: line.length,
                processingTimestamp: new Date().toISOString(),
                allLinesInFile: insertedRawLines.length,
                recordTypesFound: Object.keys(recordTypeStats)
              }
            };

            // Create or update the TDDF record in the database (overwrite on matching reference number)
            const createdRecord = await this.upsertTddfRecord(tddfRecord);
            tddfRecordsCreated++;

            // Mark the raw line as processed
            await this.markRawImportLineProcessed(
              rawLine.id, 
              'tddf_records', 
              createdRecord.id.toString()
            );

            console.log(`✅ [DT PROCESSED] Line ${rawLine.line_number}: Created TDDF record ID ${createdRecord.id} - Amount: $${tddfRecord.transactionAmount}`);

          } catch (lineError: any) {
            errorCount++;
            console.error(`❌ [DT ERROR] Line ${rawLine.line_number}:`, lineError);
            
            // Mark the raw line as processed with error
            await this.markRawImportLineSkipped(rawLine.id, `processing_error: ${lineError.message}`);
          }
        }
      }

      // STEP 2.5: Skip all non-DT records in the same file
      console.log(`\n=== STEP 2.5: NON-DT RECORD PROCESSING DISABLED ===`);
      console.log(`✅ [STEP 2.5] Old non-DT skipping logic REMOVED`);
      console.log(`🚀 [STEP 2.5] BH and P1 records will be processed by the 4-step pipeline instead of being skipped`);
      console.log(`📋 [STEP 2.5] This method will only process DT records - BH/P1 processing moved to processTddfFileFromContent`);

      // Update statistics
      tddfRecordsCreated = processed;
      errorCount = errors;
      
      // Get record type statistics from database for this file
      if (fileId) {
        const recordTypeQuery = await pool.query(`
          SELECT record_type, COUNT(*) as count 
          FROM "${tableName}" 
          WHERE source_file_id = $1 
          GROUP BY record_type
          ORDER BY record_type
        `, [fileId]);
        
        for (const row of recordTypeQuery.rows) {
          recordTypeStats[row.record_type] = parseInt(row.count);
        }
        
        // Get total raw lines count
        const totalLinesQuery = await pool.query(`
          SELECT COUNT(*) as count FROM "${tableName}" WHERE source_file_id = $1
        `, [fileId]);
        rowCount = parseInt(totalLinesQuery.rows[0]?.count || '0');
        insertedRawLines = Array(rowCount); // Create array with proper length
      }

      // STEP 3: Generate comprehensive summary
      console.log(`\n=== STEP 3: COMPREHENSIVE PROCESSING SUMMARY ===`);
      console.log(`📋 Record Type Breakdown:`);
      if (Object.keys(recordTypeStats).length > 0) {
        for (const [recordType, count] of Object.entries(recordTypeStats)) {
          const description = recordTypeDefinitions[recordType] || 'Unknown';
          console.log(`   ${recordType}: ${count} lines - ${description}`);
        }
      } else {
        console.log(`   No record types found for this file`);
      }
      
      // Calculate Transaction Type Identifier statistics
      const f64Count = await pool.query(`
        SELECT COUNT(*) as count FROM ${getTableName('tddf_records')} 
        WHERE source_file_id = $1 AND transaction_type_identifier = 'F64'
      `, [fileId]);
      
      const totalWithIdentifier = await pool.query(`
        SELECT COUNT(*) as count FROM ${getTableName('tddf_records')} 
        WHERE source_file_id = $1 AND transaction_type_identifier IS NOT NULL AND transaction_type_identifier != ''
      `, [fileId]);
      
      console.log(`\n📊 Processing Results:`);
      console.log(`   Total lines processed: ${rowCount}`);
      console.log(`   Raw lines stored: ${insertedRawLines.length}`);
      console.log(`   DT records processed: ${tddfRecordsCreated}`);
      console.log(`   Lines skipped: ${rowCount - tddfRecordsCreated}`);
      console.log(`   Errors encountered: ${errorCount}`);
      console.log(`\n🏷️  Transaction Type Identifier Summary:`);
      console.log(`   F64 identifiers: ${f64Count.rows[0].count} (MCC 6540 VerifyVend)`);
      console.log(`   Total with identifiers: ${totalWithIdentifier.rows[0].count}`);
      console.log(`   Blank identifiers: ${tddfRecordsCreated - parseInt(totalWithIdentifier.rows[0].count)} (Other MCC codes)`);
      
      console.log(`\n✅ All lines stored in TDDF raw import table for future reprocessing`);
      console.log(`🔗 Linked to upload record: ${fileId}`);
      console.log(`📁 Ready for future expansion to other record types`);
      
      // STEP 2.5: REPLACED WITH NEW 4-STEP PROCESSING PIPELINE
      console.log(`\n=== STEP 2.5: AUTOMATIC RECORD TYPE PROCESSING ===`);
      console.log(`✅ [STEP 2.5] Old non-DT skipping logic REMOVED - using new 4-step pipeline`);
      console.log(`🚀 [STEP 2.5] BH and P1 records will be automatically processed in the 4-step pipeline`);
      console.log(`📋 [STEP 2.5] Processing order: Raw Storage → DT Processing → BH Processing → P1 Processing`);
      
      console.log(`=================== ENHANCED TDDF PROCESSING COMPLETE ===================`);

      return {
        rowsProcessed: rowCount,
        tddfRecordsCreated,
        errors: errorCount
      };

    } catch (error) {
      console.error("Error processing TDDF file:", error);
      
      // STEP 2.5: ERROR-PATH PROCESSING - Use 4-step pipeline even on errors
      console.log(`\n=== STEP 2.5: ERROR-PATH PROCESSING ===`);
      console.log(`✅ [STEP 2.5 ERROR-PATH] Old non-DT skipping logic REMOVED from error path`);
      console.log(`🚀 [STEP 2.5 ERROR-PATH] Future enhancement: 4-step pipeline will handle BH/P1 processing even on partial errors`);
      
      console.log(`=================== ENHANCED TDDF PROCESSING COMPLETED WITH ERROR ===================`);
      
      throw error;
    }
  }

  // Helper method to get file by ID
  async getFileById(fileId: string): Promise<any> {
    try {
      const result = await pool.query(`
        SELECT * FROM ${getTableName('uploaded_files')} 
        WHERE id = $1
      `, [fileId]);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error(`Error getting file by ID ${fileId}:`, error);
      throw error;
    }
  }

  // Helper method to get completed files with pending DT records
  async getCompletedFilesWithPendingDTRecords() {
    try {
      const result = await pool.query(`
        SELECT DISTINCT uf.id, uf.original_filename
        FROM ${getTableName('uploaded_files')} uf
        INNER JOIN ${getTableName('tddf_raw_import')} tri ON uf.id = tri.source_file_id
        WHERE uf.processing_status = 'completed'
        AND uf.file_type = 'tddf'
        AND tri.record_type = 'DT'
        AND tri.processing_status = 'pending'
        ORDER BY uf.original_filename
      `);
      
      return result.rows;
    } catch (error: any) {
      console.error('Error getting completed files with pending DT records:', error);
      throw error;
    }
  }

  // Helper method to skip non-DT records for a specific file
  async skipNonDTRecordsForFile(fileId: string) {
    try {
      console.log(`\n=== SKIPPING NON-DT RECORDS FOR FILE: ${fileId} ===`);
      
      // Get all non-DT records from the database for this file
      const result = await pool.query(`
        SELECT * FROM ${getTableName('tddf_raw_import')} 
        WHERE source_file_id = $1 
          AND record_type != 'DT' 
          AND processing_status = 'pending'
        ORDER BY line_number
      `, [fileId]);
      
      const nonDtRecords = result.rows;
      
      console.log(`Found ${nonDtRecords.length} non-DT records to skip for file ${fileId}`);
      
      let skippedCount = 0;
      
      for (const rawLine of nonDtRecords) {
        try {
          console.log(`[NON-DT SKIP] Line ${rawLine.line_number}: ${rawLine.record_description} - Skipping`);
          
          // Mark the raw line as skipped
          await this.markRawImportLineSkipped(rawLine.id, 'non_dt_record');
          skippedCount++;
          
        } catch (skipError: any) {
          console.error(`❌ [SKIP ERROR] Line ${rawLine.line_number}:`, skipError);
        }
      }
      
      console.log(`\n=== NON-DT SKIPPING COMPLETE FOR ${fileId} ===`);
      console.log(`Non-DT records skipped: ${skippedCount}`);
      
      return skippedCount;
    } catch (error: any) {
      console.error(`Error skipping non-DT records for file ${fileId}:`, error);
      throw error;
    }
  }

  // Helper method to process pending DT records for a specific file
  async processPendingDTRecordsForFile(fileId: string) {
    try {
      console.log(`\n=== PROCESSING DT RECORDS FOR FILE: ${fileId} ===`);
      
      // Get all DT records from the database for this file
      const result = await pool.query(`
        SELECT * FROM ${getTableName('tddf_raw_import')} 
        WHERE source_file_id = $1 
          AND record_type = 'DT' 
          AND processing_status = 'pending'
        ORDER BY line_number
      `, [fileId]);
      
      const dtRecords = result.rows;
      
      console.log(`Found ${dtRecords.length} pending DT records to process for file ${fileId}`);
      
      let tddfRecordsCreated = 0;
      let errorCount = 0;
      
      for (const rawLine of dtRecords) {
        try {
          console.log(`[DT PROCESSING] Processing line ${rawLine.line_number}: ${rawLine.record_description}`);
          
          // Parse the DT record using the existing parsing logic
          const line = rawLine.raw_line;
          
          // Parse comprehensive TDDF fixed-width format based on full specification
          const tddfRecord: InsertTddfRecord = {
            // Core TDDF header fields (positions 1-23)
            sequenceNumber: line.substring(0, 7).trim() || null,
            entryRunNumber: line.substring(7, 13).trim() || null,
            sequenceWithinRun: line.substring(13, 17).trim() || null,
            recordIdentifier: line.substring(17, 19).trim() || null,
            bankNumber: line.substring(19, 23).trim() || null,
            
            // Account and merchant fields (positions 24-61)
            merchantAccountNumber: line.substring(23, 39).trim() || null,
            associationNumber1: line.substring(39, 45).trim() || null,
            groupNumber: line.substring(45, 51).trim() || null,
            transactionCode: line.substring(51, 55).trim() || null,
            associationNumber2: line.substring(55, 61).trim() || null,
            
            // Core transaction fields (positions 62-142)
            referenceNumber: line.substring(61, 84).trim() || null,
            transactionDate: this.parseTddfDate(line.substring(84, 92).trim()),
            transactionAmount: this.parseAuthAmount(line.substring(92, 103).trim()),
            batchJulianDate: line.substring(103, 108).trim() || null,
            netDeposit: this.parseAmount(line.substring(108, 123).trim()),
            cardholderAccountNumber: line.substring(123, 142).trim() || null,
            
            // Transaction details (positions 143-187)
            bestInterchangeEligible: line.substring(142, 144).trim() || null,
            transactionDataConditionCode: line.substring(144, 146).trim() || null,
            downgradeReason1: line.substring(146, 150).trim() || null,
            downgradeReason2: line.substring(150, 154).trim() || null,
            downgradeReason3: line.substring(154, 164).trim() || null,
            onlineEntry: line.substring(164, 165).trim() || null,
            authorizationAmount: this.parseAuthAmount(line.substring(191, 203).trim()),
            
            // Additional transaction fields (positions 204-334)
            posEntryMethod: line.substring(203, 205).trim() || null,
            authorizationCode: line.substring(205, 211).trim() || null,
            processingCode: line.substring(211, 217).trim() || null,
            authorizationResponseCode: line.substring(217, 219).trim() || null,
            acquirerReferenceNumber: line.substring(219, 242).trim() || null,
            authorizationDate: this.parseTddfDate(line.substring(242, 250).trim()),
            authorizationTime: line.substring(250, 256).trim() || null,
            localTransactionTime: line.substring(256, 262).trim() || null,
            cardTypeCode: line.substring(262, 264).trim() || null,
            cardApplicationId: line.substring(264, 280).trim() || null,
            terminalCapability: line.substring(280, 282).trim() || null,
            
            // Transaction type and routing (positions 334-372)
            transactionTypeIdentifier: line.substring(334, 338).trim() || null,
            debitCreditIndicator: line.substring(338, 339).trim() || null,
            transactionOrigination: line.substring(339, 340).trim() || null,
            
            // Additional processing fields
            sourceFileId: fileId,
            recordedAt: new Date(),
            
            // Store raw data for reference
            rawData: {
              recordType: rawLine.record_type,
              recordDescription: rawLine.record_description,
              lineNumber: rawLine.line_number,
              filename: fileId,
              lineLength: line.length,
              processingTimestamp: new Date().toISOString(),
              recordTypesFound: ['DT']
            }
          };

          // Create or update the TDDF record in the database (overwrite on matching reference number)
          const createdRecord = await this.upsertTddfRecord(tddfRecord);
          tddfRecordsCreated++;

          // Mark the raw line as processed
          await this.markRawImportLineProcessed(
            rawLine.id, 
            'tddf_records', 
            createdRecord.id.toString()
          );

          console.log(`✅ [DT PROCESSED] Line ${rawLine.line_number}: Created TDDF record ID ${createdRecord.id} - Amount: $${tddfRecord.transactionAmount}`);

        } catch (lineError: any) {
          errorCount++;
          console.error(`❌ [DT ERROR] Line ${rawLine.line_number}:`, lineError);
          
          // Mark the raw line as processed with error
          await this.markRawImportLineSkipped(rawLine.id, `processing_error: ${lineError.message}`);
        }
      }
      
      console.log(`\n=== FILE PROCESSING COMPLETE FOR ${fileId} ===`);
      console.log(`TDDF records created: ${tddfRecordsCreated}`);
      console.log(`Errors encountered: ${errorCount}`);
      
      return {
        processed: tddfRecordsCreated,
        errors: errorCount
      };
    } catch (error: any) {
      console.error(`Error processing pending DT records for file ${fileId}:`, error);
      throw error;
    }
  }

  // Hierarchical TDDF migration methods implementation
  async getPendingDtCount(): Promise<number> {
    try {
      const tableName = getTableName('tddf_raw_import');
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM "${tableName}" 
        WHERE processing_status = 'pending' AND record_type = 'DT'
      `);
      return parseInt(result.rows[0].count);
    } catch (error: any) {
      console.error('Error getting pending DT count:', error);
      return 0;
    }
  }

  async getHierarchicalRecordBreakdown(startTime: Date, endTime: Date): Promise<{
    dtCount: number;
    bhCount: number;
    p1Count: number;
    otherCount: number;
  }> {
    try {
      const tableName = getTableName('tddf_raw_import');
      const result = await pool.query(`
        SELECT 
          record_type,
          COUNT(*) as count
        FROM "${tableName}" 
        WHERE created_at >= $1 AND created_at < $2
        GROUP BY record_type
      `, [startTime, endTime]);
      
      const breakdown = {
        dtCount: 0,
        bhCount: 0,
        p1Count: 0,
        otherCount: 0
      };
      
      for (const row of result.rows) {
        const count = parseInt(row.count);
        switch (row.record_type) {
          case 'DT':
            breakdown.dtCount = count;
            break;
          case 'BH':
            breakdown.bhCount = count;
            break;
          case 'P1':
          case 'P2':
            breakdown.p1Count += count;
            break;
          default:
            // G2, E1, DR, and other record types
            breakdown.otherCount += count;
            break;
        }
      }
      
      return breakdown;
    } catch (error: any) {
      console.error('Error getting hierarchical record breakdown:', error);
      return {
        dtCount: 0,
        bhCount: 0,
        p1Count: 0,
        otherCount: 0
      };
    }
  }

  async getHierarchicalTddfCount(): Promise<number> {
    try {
      const tableName = getTableName('tddf_transaction_records');
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      return parseInt(result.rows[0].count);
    } catch (error: any) {
      console.error('Error getting hierarchical TDDF count:', error);
      return 0;
    }
  }

  async getLegacyTddfCount(): Promise<number> {
    try {
      const tableName = getTableName('tddf_records');
      const result = await pool.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
      return parseInt(result.rows[0].count);
    } catch (error: any) {
      console.error('Error getting legacy TDDF count:', error);
      return 0;
    }
  }

  async getRecordsPeakFromDatabase(): Promise<{peakRecords: number, allSamples: Array<{timestamp: string, totalRecords: number}>}> {
    try {
      const tableName = getTableName('processing_metrics');
      
      // Get data with LAG calculation to match chart's rate calculation method
      const result = await pool.query(`
        SELECT 
          timestamp,
          dt_processed, bh_processed, p1_processed, e1_processed, g2_processed, 
          ad_processed, dr_processed, p2_processed, other_processed,
          dt_skipped, bh_skipped, p1_skipped, e1_skipped, g2_skipped,
          ad_skipped, dr_skipped, p2_skipped, other_skipped,
          LAG(dt_processed) OVER (ORDER BY timestamp) as prev_dt_processed,
          LAG(bh_processed) OVER (ORDER BY timestamp) as prev_bh_processed,
          LAG(p1_processed) OVER (ORDER BY timestamp) as prev_p1_processed,
          LAG(e1_processed) OVER (ORDER BY timestamp) as prev_e1_processed,
          LAG(g2_processed) OVER (ORDER BY timestamp) as prev_g2_processed,
          LAG(ad_processed) OVER (ORDER BY timestamp) as prev_ad_processed,
          LAG(dr_processed) OVER (ORDER BY timestamp) as prev_dr_processed,
          LAG(p2_processed) OVER (ORDER BY timestamp) as prev_p2_processed,
          LAG(other_processed) OVER (ORDER BY timestamp) as prev_other_processed,
          LAG(dt_skipped + bh_skipped + p1_skipped + e1_skipped + g2_skipped + ad_skipped + dr_skipped + p2_skipped + other_skipped) OVER (ORDER BY timestamp) as prev_total_skipped,
          LAG(timestamp) OVER (ORDER BY timestamp) as prev_timestamp
        FROM "${tableName}"
        WHERE timestamp >= NOW() - INTERVAL '10 minutes'
          AND metric_type = 'scanly_watcher_snapshot'
        ORDER BY timestamp ASC
      `);
      
      const rateData = result.rows.map((row, index) => {
        if (index === 0 || !row.prev_timestamp) {
          // First row - no rate calculation possible
          return {
            timestamp: row.timestamp,
            dtRecords: 0,
            bhRecords: 0,
            p1Records: 0,
            otherRecords: 0,
            skippedRecords: 0,
            totalRate: 0
          };
        }
        
        // Calculate rates based on difference from previous data point (same as chart)
        const timeDiffMinutes = (new Date(row.timestamp) - new Date(row.prev_timestamp)) / (1000 * 60);
        
        if (timeDiffMinutes <= 0) {
          return {
            timestamp: row.timestamp,
            dtRecords: 0,
            bhRecords: 0,
            p1Records: 0,
            otherRecords: 0,
            skippedRecords: 0,
            totalRate: 0
          };
        }
        
        const dtRate = Math.max(0, ((row.dt_processed || 0) - (row.prev_dt_processed || 0)) / timeDiffMinutes);
        const bhRate = Math.max(0, ((row.bh_processed || 0) - (row.prev_bh_processed || 0)) / timeDiffMinutes);
        const p1Rate = Math.max(0, ((row.p1_processed || 0) - (row.prev_p1_processed || 0)) / timeDiffMinutes);
        const p2Rate = Math.max(0, ((row.p2_processed || 0) - (row.prev_p2_processed || 0)) / timeDiffMinutes);
        
        // Combine P1 and P2 rates (matching chart calculation)
        const combinedP1P2Rate = p1Rate + p2Rate;
        
        // Calculate "otherRecords" as sum of all other types EXCLUDING P2 (matching chart calculation)
        const e1Rate = Math.max(0, ((row.e1_processed || 0) - (row.prev_e1_processed || 0)) / timeDiffMinutes);
        const g2Rate = Math.max(0, ((row.g2_processed || 0) - (row.prev_g2_processed || 0)) / timeDiffMinutes);
        const adRate = Math.max(0, ((row.ad_processed || 0) - (row.prev_ad_processed || 0)) / timeDiffMinutes);
        const drRate = Math.max(0, ((row.dr_processed || 0) - (row.prev_dr_processed || 0)) / timeDiffMinutes);
        const otherProcessedRate = Math.max(0, ((row.other_processed || 0) - (row.prev_other_processed || 0)) / timeDiffMinutes);
        const otherRecords = e1Rate + g2Rate + adRate + drRate + otherProcessedRate;
        
        // Calculate total skipped rate
        const currentTotalSkipped = (row.dt_skipped || 0) + (row.bh_skipped || 0) + (row.p1_skipped || 0) + 
                                  (row.e1_skipped || 0) + (row.g2_skipped || 0) + (row.ad_skipped || 0) + 
                                  (row.dr_skipped || 0) + (row.p2_skipped || 0) + (row.other_skipped || 0);
        const skippedRate = Math.max(0, (currentTotalSkipped - (row.prev_total_skipped || 0)) / timeDiffMinutes);
        
        const totalRate = dtRate + bhRate + combinedP1P2Rate + otherRecords + skippedRate;
        
        return {
          timestamp: row.timestamp,
          dtRecords: Math.round(dtRate),
          bhRecords: Math.round(bhRate),
          p1Records: Math.round(combinedP1P2Rate),
          otherRecords: Math.round(otherRecords),
          skippedRecords: Math.round(skippedRate),
          totalRate: Math.round(totalRate)
        };
      }).filter(item => item.totalRate > 0); // Filter out zero rates (like chart does)
      
      // Calculate peak the same way as chart: max of (dtRecords + bhRecords + p1Records + otherRecords + skippedRecords)
      const peakRecords = rateData.length > 0 ? 
        Math.max(...rateData.map(d => d.dtRecords + d.bhRecords + d.p1Records + d.otherRecords + d.skippedRecords)) : 0;
      
      const allSamples = rateData.map(item => ({
        timestamp: item.timestamp,
        totalRecords: item.totalRate
      }));
      
      console.log(`[RECORDS PEAK] Rate-based calculation (matching chart):`, rateData.slice(-3).map(s => 
        `${s.timestamp}: DT:${s.dtRecords}, BH:${s.bhRecords}, P1/P2:${s.p1Records}, Other:${s.otherRecords}, Skip:${s.skippedRecords}, Total:${s.totalRate}/min`));
      console.log(`[RECORDS PEAK] Peak rate value: ${peakRecords} records/min (matching chart calculation)`);
      
      return { peakRecords, allSamples };
    } catch (error: any) {
      console.error('Error getting records peak from database:', error);
      return { peakRecords: 0, allSamples: [] };
    }
  }

  async processPendingDtRecordsHierarchical(batchSize: number): Promise<{ processed: number; errors: number; sampleRecord?: any }> {
    console.log(`[TDDF TRANSACTIONAL] Starting hierarchical migration with transactional integrity`);
    
    try {
      const tableName = getTableName('tddf_raw_import');
      
      // Get pending DT records
      const result = await pool.query(`
        SELECT * FROM "${tableName}" 
        WHERE processing_status = 'pending' AND record_type = 'DT'
        ORDER BY line_number
        LIMIT $1
      `, [batchSize]);
      
      const pendingRecords = result.rows;
      console.log(`[HIERARCHICAL MIGRATION] Processing ${pendingRecords.length} pending DT records with transactional integrity`);
      
      let processed = 0;
      let errors = 0;
      let sampleRecord = null;
      
      const transactionTableName = getTableName('tddf_transaction_records');
      
      // Process each record within its own transaction for atomic integrity
      for (const rawLine of pendingRecords) {
        // Begin transaction for this TDDF record
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          console.log(`[TDDF TRANSACTION] Starting transaction for line ${rawLine.line_number}`);
          
          const line = rawLine.raw_line;
          
          // Parse DT record into hierarchical transaction record format
          const transactionRecord = {
            sequence_number: line.substring(0, 17).trim() || null,
            entry_run_number: line.substring(2, 9).trim() || null,
            sequence_within_run: line.substring(9, 17).trim() || null,
            record_identifier: line.substring(17, 23).trim() || null,
            bank_number: line.substring(23, 24).trim() || null,
            merchant_account_number: line.substring(23, 39).trim() || null,
            association_number_1: line.substring(39, 45).trim() || null,
            group_number: line.substring(45, 50).trim() || null,
            transaction_code: line.substring(50, 54).trim() || null,
            association_number_2: line.substring(54, 61).trim() || null,
            reference_number: line.substring(61, 84).trim() || null,
            transaction_date: this.parseTddfDate(line.substring(84, 92).trim()) || null,
            transaction_amount: this.parseAuthAmount(line.substring(92, 103).trim()) || 0,
            batch_julian_date: line.substring(103, 106).trim() || null,
            net_deposit: this.parseAuthAmount(line.substring(106, 117).trim()) || null,
            cardholder_account_number: line.substring(117, 135).trim() || null,
            best_interchange_eligible: line.substring(135, 136).trim() || null,
            transaction_data_condition_code: line.substring(136, 137).trim() || null,
            downgrade_reason_1: line.substring(137, 139).trim() || null,
            downgrade_reason_2: line.substring(139, 141).trim() || null,
            downgrade_reason_3: line.substring(141, 143).trim() || null,
            online_entry: line.substring(143, 144).trim() || null,
            ach_flag: line.substring(144, 145).trim() || null,
            auth_source: line.substring(145, 146).trim() || null,
            cardholder_id_method: line.substring(146, 148).trim() || null,
            cat_indicator: line.substring(148, 149).trim() || null,
            reimbursement_attribute: line.substring(149, 150).trim() || null,
            mail_order_telephone_indicator: line.substring(150, 151).trim() || null,
            auth_char_ind: line.substring(151, 152).trim() || null,
            banknet_reference_number: line.substring(152, 175).trim() || null,
            draft_a_flag: line.substring(175, 176).trim() || null,
            auth_currency_code: line.substring(176, 179).trim() || null,
            auth_amount: this.parseAuthAmount(line.substring(191, 203).trim()) || null,
            validation_code: line.substring(203, 207).trim() || null,
            auth_response_code: line.substring(207, 209).trim() || null,
            network_identifier_debit: line.substring(209, 213).trim() || null,
            switch_settled_indicator: line.substring(213, 214).trim() || null,
            pos_entry_mode: line.substring(214, 217).trim() || null,
            debit_credit_indicator: line.substring(217, 218).trim() || null,
            reversal_flag: line.substring(218, 219).trim() || null,
            merchant_name: line.length > 241 ? line.substring(219, 241).trim() || null : null,
            source_file_id: rawLine.source_file_id,
            source_row_number: rawLine.line_number,
            recorded_at: new Date(),
            raw_data: {
              recordType: rawLine.record_type,
              recordDescription: rawLine.record_description,
              lineNumber: rawLine.line_number,
              filename: rawLine.source_file_id,
              lineLength: line.length,
              processingTimestamp: new Date().toISOString()
            },
            mms_raw_line: line,
            created_at: new Date(),
            updated_at: new Date()
          };
          
          // Insert into hierarchical transaction records table within transaction
          const insertResult = await client.query(`
            INSERT INTO "${transactionTableName}" (
              sequence_number, entry_run_number, sequence_within_run, record_identifier, bank_number,
              merchant_account_number, association_number_1, group_number, transaction_code, 
              association_number_2, reference_number, transaction_date, transaction_amount,
              batch_julian_date, net_deposit, cardholder_account_number, best_interchange_eligible,
              transaction_data_condition_code, downgrade_reason_1, downgrade_reason_2, downgrade_reason_3,
              online_entry, ach_flag, auth_source, cardholder_id_method, cat_indicator,
              reimbursement_attribute, mail_order_telephone_indicator, auth_char_ind, banknet_reference_number,
              draft_a_flag, auth_currency_code, auth_amount, validation_code, auth_response_code,
              network_identifier_debit, switch_settled_indicator, pos_entry_mode, debit_credit_indicator,
              reversal_flag, merchant_name, source_file_id, source_row_number, recorded_at, raw_data,
              mms_raw_line, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
              $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
              $39, $40, $41, $42, $43, $44, $45, $46, $47, $48
            ) RETURNING id
          `, [
            transactionRecord.sequence_number, transactionRecord.entry_run_number, 
            transactionRecord.sequence_within_run, transactionRecord.record_identifier,
            transactionRecord.bank_number, transactionRecord.merchant_account_number,
            transactionRecord.association_number_1, transactionRecord.group_number,
            transactionRecord.transaction_code, transactionRecord.association_number_2,
            transactionRecord.reference_number, transactionRecord.transaction_date,
            transactionRecord.transaction_amount, transactionRecord.batch_julian_date,
            transactionRecord.net_deposit, transactionRecord.cardholder_account_number,
            transactionRecord.best_interchange_eligible, transactionRecord.transaction_data_condition_code,
            transactionRecord.downgrade_reason_1, transactionRecord.downgrade_reason_2,
            transactionRecord.downgrade_reason_3, transactionRecord.online_entry,
            transactionRecord.ach_flag, transactionRecord.auth_source,
            transactionRecord.cardholder_id_method, transactionRecord.cat_indicator,
            transactionRecord.reimbursement_attribute, transactionRecord.mail_order_telephone_indicator,
            transactionRecord.auth_char_ind, transactionRecord.banknet_reference_number,
            transactionRecord.draft_a_flag, transactionRecord.auth_currency_code,
            transactionRecord.auth_amount, transactionRecord.validation_code,
            transactionRecord.auth_response_code, transactionRecord.network_identifier_debit,
            transactionRecord.switch_settled_indicator, transactionRecord.pos_entry_mode,
            transactionRecord.debit_credit_indicator, transactionRecord.reversal_flag,
            transactionRecord.merchant_name, transactionRecord.source_file_id,
            transactionRecord.source_row_number, transactionRecord.recorded_at,
            JSON.stringify(transactionRecord.raw_data), transactionRecord.mms_raw_line,
            transactionRecord.created_at, transactionRecord.updated_at
          ]);
          
          const newRecordId = insertResult.rows[0].id;
          console.log(`[TDDF TRANSACTION] Successfully inserted TDDF record ID ${newRecordId} for line ${rawLine.line_number}`);
          
          // Mark raw line as processed within the same transaction
          await client.query(`
            UPDATE "${tableName}" 
            SET processing_status = 'processed',
                processed_table = $1,
                processed_record_id = $2,
                processed_at = NOW()
            WHERE id = $3
          `, ['tddf_transaction_records', newRecordId.toString(), rawLine.id]);
          
          console.log(`[TDDF TRANSACTION] Marked raw line ${rawLine.id} as processed`);
          
          // Commit transaction - ensures atomic operation
          await client.query('COMMIT');
          console.log(`[TDDF TRANSACTION] Transaction committed successfully for line ${rawLine.line_number}`);
          
          processed++;
          if (!sampleRecord) {
            sampleRecord = {
              id: newRecordId,
              reference_number: transactionRecord.reference_number,
              transaction_amount: transactionRecord.transaction_amount,
              merchant_name: transactionRecord.merchant_name
            };
          }
          
          console.log(`✅ [HIERARCHICAL] Migrated DT record ${rawLine.line_number}: Amount $${transactionRecord.transaction_amount}, Merchant: ${transactionRecord.merchant_name}`);
          
          // Record processing metrics for hierarchical migration every 10 records
          if (processed % 10 === 0) {
            await this.recordTddfProcessingMetrics(processed, pendingRecords.length);
          }
          
        } catch (lineError: any) {
          // Rollback transaction on any error
          await client.query('ROLLBACK');
          console.error(`❌ [TDDF TRANSACTION] Transaction rolled back for line ${rawLine.line_number}:`, lineError);
          
          errors++;
          console.error(`❌ [HIERARCHICAL ERROR] Line ${rawLine.line_number}:`, lineError);
          
          // Mark as failed using pool connection (outside transaction)
          await pool.query(`
            UPDATE "${tableName}" 
            SET processing_status = 'skipped',
                skip_reason = $1,
                processed_at = NOW()
            WHERE id = $2
          `, [`hierarchical_migration_error: ${lineError.message}`, rawLine.id]);
          
        } finally {
          // Always release the connection back to the pool
          client.release();
          console.log(`[TDDF TRANSACTION] Connection released for line ${rawLine.line_number}`);
        }
      }
      
      return { processed, errors, sampleRecord };
      
    } catch (error: any) {
      console.error('Error processing hierarchical TDDF migration:', error);
      throw error;
    }
  }

  // FIXED METHOD: This method now properly handles Base64 content detection and decoding
  async storeTddfFileAsRawImport(content: string, fileId: string, filename: string): Promise<{ rowsStored: number; recordTypes: { [key: string]: number }; errors: number }> {
    try {
      console.log(`[TDDF RAW IMPORT] Starting raw import for file: ${filename}`);
      
      // FIXED: Use content directly - it has already been processed by parent method
      const fileContent = content;
      console.log(`📋 [RAW_IMPORT] Processing TDDF content - Length: ${fileContent.length}`);
      console.log(`📋 [RAW_IMPORT] Sample TDDF line: "${fileContent.substring(0, 150)}"`);
      
      // Validate content looks like TDDF
      if (fileContent.length < 100) {
        console.warn(`⚠️  [RAW_IMPORT] Content appears too short for valid TDDF (${fileContent.length} chars)`);
      } else if (!fileContent.includes('BH') && !fileContent.includes('DT')) {
        console.warn(`⚠️  [RAW_IMPORT] Content may not be valid TDDF (no BH/DT record types found)`);
      }
      
      const lines = fileContent.split('\n').filter(line => line.trim() !== '');
      const tableName = getTableName('tddf_raw_import');
      const recordTypes: { [key: string]: number } = {};
      let rowsStored = 0;
      let errors = 0;
      
      console.log(`📁 [RAW_IMPORT] Storing ${lines.length} raw TDDF lines for file: ${filename}`);
      
      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];  // Store exactly as received - no processing
        const lineNumber = i + 1;
        
        try {
          // VALIDATION: Check line length - TDDF records should be at least 150 characters
          if (rawLine.length < 150) {
            console.warn(`⚠️  Line ${lineNumber}: Too short (${rawLine.length} chars) - likely corrupted`);
            const recordType = 'BAD';
            recordTypes[recordType] = (recordTypes[recordType] || 0) + 1;
            
            // Store BAD record with skip reason
            await pool.query(`
              INSERT INTO "${tableName}" 
              (source_file_id, line_number, raw_line, record_type, processing_status, skip_reason, created_at)
              VALUES ($1, $2, $3, $4, 'skipped', 'line_too_short', NOW())
            `, [fileId, lineNumber, rawLine, recordType]);
            rowsStored++;
            continue;
          }
          
          // Extract record type from positions 18-19 (0-based: 17-18) from raw TDDF line
          const recordType = rawLine.length >= 19 ? rawLine.substring(17, 19).trim() : 'UNK';
          
          // VALIDATION: For DT records, check transaction code patterns (positions 52-55)
          if (recordType === 'DT' && rawLine.length >= 55) {
            const transactionCode = rawLine.substring(51, 55).trim();
            
            // Detect corrupted transaction codes
            const hasInvalidChars = /[^A-Za-z0-9]/.test(transactionCode);
            const hasConsecutiveRepeats = /(.)\1{3,}/.test(transactionCode); // 4+ repeated chars
            const isBlank = transactionCode.length === 0;
            
            if (hasInvalidChars || hasConsecutiveRepeats || isBlank) {
              console.warn(`⚠️  Line ${lineNumber}: Invalid transaction code "${transactionCode}" - marking as BAD`);
              recordTypes['BAD'] = (recordTypes['BAD'] || 0) + 1;
              
              // Store BAD record with invalid transaction code reason
              await pool.query(`
                INSERT INTO "${tableName}" 
                (source_file_id, line_number, raw_line, record_type, processing_status, skip_reason, created_at)
                VALUES ($1, $2, $3, $4, 'skipped', 'invalid_transaction_code', NOW())
              `, [fileId, lineNumber, rawLine, 'BAD']);
              rowsStored++;
              continue;
            }
          }
          
          // Count record types for reporting
          recordTypes[recordType] = (recordTypes[recordType] || 0) + 1;
          
          // Store the authentic raw TDDF line exactly as received
          await pool.query(`
            INSERT INTO "${tableName}" 
            (source_file_id, line_number, raw_line, record_type, processing_status, created_at)
            VALUES ($1, $2, $3, $4, 'pending', NOW())
          `, [fileId, lineNumber, rawLine, recordType]);
          
          rowsStored++;
          
          // Log progress every 100 lines for large files
          if (rowsStored % 100 === 0) {
            console.log(`📄 [RAW_IMPORT] Stored ${rowsStored} raw lines...`);
          }
        } catch (lineError: any) {
          console.error(`❌ Error storing raw line ${lineNumber}:`, lineError);
          errors++;
        }
      }
      
      console.log(`✅ [RAW_IMPORT] Successfully stored ${rowsStored} authentic TDDF lines with record types:`, recordTypes);
      if (errors > 0) {
        console.warn(`⚠️  [RAW_IMPORT] ${errors} errors occurred during raw line storage`);
      }
      
      return { rowsStored, recordTypes, errors };
    } catch (error: any) {
      console.error('Error storing TDDF file as raw import:', error);
      throw error;
    }
  }

  // ===== REPROCESSING SKIPPED RECORDS OPERATIONS =====
  
  async getSkippedRecordsSummary(): Promise<{ skipReasons: Array<{ skipReason: string; recordType: string; count: number }>, totalSkipped: number }> {
    try {
      const tableName = getTableName('tddf_raw_import');
      const result = await pool.query(`
        SELECT skip_reason, record_type, COUNT(*) as count 
        FROM "${tableName}" 
        WHERE processing_status = 'skipped' 
        GROUP BY skip_reason, record_type 
        ORDER BY count DESC
      `);
      
      const totalResult = await pool.query(`
        SELECT COUNT(*) as total 
        FROM "${tableName}" 
        WHERE processing_status = 'skipped'
      `);
      
      return {
        skipReasons: result.rows.map(row => ({
          skipReason: row.skip_reason,
          recordType: row.record_type,
          count: parseInt(row.count)
        })),
        totalSkipped: parseInt(totalResult.rows[0]?.total || '0')
      };
    } catch (error: any) {
      console.error('Error getting skipped records summary:', error);
      throw error;
    }
  }

  async reprocessSkippedRecordsByReason(skipReason: string, recordType?: string, maxRecords: number = 1000): Promise<{ processed: number; errors: number; details: string[] }> {
    console.log(`[REPROCESS] Starting reprocessing for reason: ${skipReason}, type: ${recordType || 'ALL'}, max: ${maxRecords}`);
    
    try {
      const tableName = getTableName('tddf_raw_import');
      
      // Build query conditions
      let whereClause = `WHERE processing_status = 'skipped' AND skip_reason = $1`;
      const params: any[] = [skipReason];
      
      if (recordType) {
        whereClause += ` AND record_type = $2`;
        params.push(recordType);
        params.push(maxRecords);
      } else {
        params.push(maxRecords);
      }
      
      // Get skipped records to reprocess
      const result = await pool.query(`
        SELECT * FROM "${tableName}" 
        ${whereClause}
        ORDER BY line_number
        LIMIT $${params.length}
      `, params);
      
      const skippedRecords = result.rows;
      console.log(`[REPROCESS] Found ${skippedRecords.length} skipped records to reprocess`);
      
      let processed = 0;
      let errors = 0;
      const details: string[] = [];
      
      // Reset records to pending status first
      for (const record of skippedRecords) {
        try {
          await pool.query(`
            UPDATE "${tableName}" 
            SET processing_status = 'pending', 
                skip_reason = NULL, 
                processed_at = NULL,
                updated_at = NOW()
            WHERE id = $1
          `, [record.id]);
          
          console.log(`[REPROCESS] Reset record ${record.id} (${record.record_type}) to pending status`);
          details.push(`Reset ${record.record_type} record ${record.id} to pending`);
          processed++;
        } catch (error: any) {
          console.error(`[REPROCESS] Error resetting record ${record.id}:`, error);
          details.push(`Error resetting record ${record.id}: ${error.message}`);
          errors++;
        }
      }
      
      // Trigger processing using switch-based method
      if (processed > 0) {
        try {
          console.log(`[REPROCESS] Triggering switch-based processing for ${processed} reset records`);
          const processingResult = await this.processPendingTddfRecordsSwitchBased(undefined, processed);
          details.push(`Switch-based processing completed: ${processingResult.totalProcessed} processed, ${processingResult.totalSkipped} skipped, ${processingResult.totalErrors} errors`);
        } catch (error: any) {
          console.error(`[REPROCESS] Error in switch-based processing:`, error);
          details.push(`Error in switch-based processing: ${error.message}`);
          errors++;
        }
      }
      
      console.log(`[REPROCESS] Completed: ${processed} processed, ${errors} errors`);
      return { processed, errors, details };
    } catch (error: any) {
      console.error('Error reprocessing skipped records:', error);
      throw error;
    }
  }

  async fixSchemaIssuesAndReprocess(): Promise<{ schemaFixesApplied: number; recordsReprocessed: number; details: string[] }> {
    console.log(`[SCHEMA_FIX] Starting schema fixes and reprocessing`);
    
    try {
      const details: string[] = [];
      let schemaFixesApplied = 0;
      
      // Fix 1: Ensure sequence_number column exists in tddf_other_records
      try {
        const otherRecordsTable = getTableName('tddf_other_records');
        await pool.query(`ALTER TABLE "${otherRecordsTable}" ADD COLUMN IF NOT EXISTS sequence_number TEXT`);
        details.push('Added sequence_number column to tddf_other_records table');
        schemaFixesApplied++;
      } catch (error: any) {
        details.push(`Schema fix sequence_number error: ${error.message}`);
      }
      
      // Fix 2: Add any other missing columns that might be causing errors
      try {
        const otherRecordsTable = getTableName('tddf_other_records');
        await pool.query(`ALTER TABLE "${otherRecordsTable}" ADD COLUMN IF NOT EXISTS bank_number TEXT`);
        await pool.query(`ALTER TABLE "${otherRecordsTable}" ADD COLUMN IF NOT EXISTS entry_run_number TEXT`);
        details.push('Added missing bank_number and entry_run_number columns');
        schemaFixesApplied++;
      } catch (error: any) {
        details.push(`Schema fix additional columns error: ${error.message}`);
      }
      
      // Reprocess records that failed due to schema issues
      const schemaErrorReasons = [
        'scanly_watcher_G2_error: column "sequence_number" of relation "dev_tddf_other_records" does not exist',
        'scanly_watcher_E1_error: column "sequence_number" of relation "dev_tddf_other_records" does not exist'
      ];
      
      let totalReprocessed = 0;
      
      for (const skipReason of schemaErrorReasons) {
        try {
          const result = await this.reprocessSkippedRecordsByReason(skipReason, undefined, 500);
          totalReprocessed += result.processed;
          details.push(`Reprocessed ${result.processed} records for reason: ${skipReason}`);
        } catch (error: any) {
          details.push(`Error reprocessing ${skipReason}: ${error.message}`);
        }
      }
      
      console.log(`[SCHEMA_FIX] Completed: ${schemaFixesApplied} fixes, ${totalReprocessed} reprocessed`);
      return { schemaFixesApplied, recordsReprocessed: totalReprocessed, details };
    } catch (error: any) {
      console.error('Error fixing schema and reprocessing:', error);
      throw error;
    }
  }

  async reprocessEmergencySkippedRecords(batchSize: number = 500): Promise<{ totalProcessed: number; totalErrors: number; breakdown: Record<string, { processed: number; errors: number }> }> {
    console.log(`[EMERGENCY_REPROCESS] Starting emergency/load management reprocessing (batch: ${batchSize})`);
    
    try {
      const emergencySkipReasons = [
        'scanly_watcher_phase4_other_types',
        'scanly_watcher_phase3_p1_specialized', 
        'production_stability_skip',
        'emergency_system_overload_skip',
        'load_management_optimization',
        'manual_emergency_batch_3_p1_skipped',
        'manual_emergency_batch_4_other_types'
      ];
      
      let totalProcessed = 0;
      let totalErrors = 0;
      const breakdown: Record<string, { processed: number; errors: number }> = {};
      
      for (const skipReason of emergencySkipReasons) {
        try {
          console.log(`[EMERGENCY_REPROCESS] Processing skip reason: ${skipReason}`);
          const result = await this.reprocessSkippedRecordsByReason(skipReason, undefined, batchSize);
          
          breakdown[skipReason] = {
            processed: result.processed,
            errors: result.errors
          };
          
          totalProcessed += result.processed;
          totalErrors += result.errors;
          
          console.log(`[EMERGENCY_REPROCESS] ${skipReason}: ${result.processed} processed, ${result.errors} errors`);
        } catch (error: any) {
          console.error(`[EMERGENCY_REPROCESS] Error processing ${skipReason}:`, error);
          breakdown[skipReason] = { processed: 0, errors: 1 };
          totalErrors++;
        }
      }
      
      console.log(`[EMERGENCY_REPROCESS] Completed: ${totalProcessed} processed, ${totalErrors} errors`);
      return { totalProcessed, totalErrors, breakdown };
    } catch (error: any) {
      console.error('Error reprocessing emergency skipped records:', error);
      throw error;
    }
  }

  async getSkippedRecordsErrorLog(limit: number = 100): Promise<Array<{ skipReason: string; recordType: string; errorDetails: string; count: number; sampleRawData: string }>> {
    try {
      const tableName = getTableName('tddf_raw_import');
      const result = await pool.query(`
        SELECT 
          skip_reason, 
          record_type, 
          COUNT(*) as count,
          MAX(raw_line) as sample_raw_data
        FROM "${tableName}" 
        WHERE processing_status = 'skipped' 
          AND skip_reason IS NOT NULL
        GROUP BY skip_reason, record_type 
        ORDER BY count DESC
        LIMIT $1
      `, [limit]);
      
      return result.rows.map(row => ({
        skipReason: row.skip_reason,
        recordType: row.record_type,
        errorDetails: this.extractErrorDetailsFromSkipReason(row.skip_reason),
        count: parseInt(row.count),
        sampleRawData: row.sample_raw_data || ''
      }));
    } catch (error: any) {
      console.error('Error getting skipped records error log:', error);
      throw error;
    }
  }

  private extractErrorDetailsFromSkipReason(skipReason: string): string {
    if (skipReason.includes('column') && skipReason.includes('does not exist')) {
      return 'Database schema error - missing column';
    }
    if (skipReason.includes('invalid input syntax')) {
      return 'Data type conversion error';
    }
    if (skipReason.includes('date/time field value out of range')) {
      return 'Invalid date format in source data';
    }
    if (skipReason.includes('emergency') || skipReason.includes('overload')) {
      return 'Emergency processing skip due to system load';
    }
    if (skipReason.includes('production_stability')) {
      return 'Production stability protection skip';
    }
    if (skipReason.includes('unknown_record_type')) {
      return 'Unrecognized TDDF record type';
    }
    return skipReason;
  }

  async refreshTddfMerchantsCache(): Promise<{ rebuilt: number; updated: Date; performance: { buildTimeMs: number; recordsProcessed: number } }> {
    const startTime = Date.now();
    try {
      const tddfRecordsTableName = getTableName('tddf_records');
      const cacheTableName = getTableName('tddf_merchants_cache');

      console.log('[TDDF CACHE] Starting cache rebuild...');

      // Clear existing cache
      await pool.query(`DELETE FROM "${cacheTableName}"`);

      // Build merchant aggregates from TDDF records
      const rebuildQuery = `
        INSERT INTO "${cacheTableName}" (
          merchant_name,
          merchant_account_number,
          mcc_code,
          transaction_type_identifier,
          terminal_count,
          total_transactions,
          total_amount,
          last_transaction_date,
          pos_relative_code,
          first_transaction_date,
          average_transaction_amount,
          last_updated
        )
        SELECT 
          merchant_name,
          merchant_account_number,
          mcc_code,
          transaction_type_identifier,
          COUNT(DISTINCT terminal_id) as terminal_count,
          COUNT(*) as total_transactions,
          SUM(CAST(transaction_amount AS NUMERIC)) as total_amount,
          MAX(transaction_date) as last_transaction_date,
          SUBSTRING(merchant_account_number, 1, 5) as pos_relative_code,
          MIN(transaction_date) as first_transaction_date,
          AVG(CAST(transaction_amount AS NUMERIC)) as average_transaction_amount,
          NOW() as last_updated
        FROM "${tddfRecordsTableName}"
        WHERE merchant_name IS NOT NULL 
          AND merchant_account_number IS NOT NULL
          AND terminal_id IS NOT NULL 
          AND terminal_id != ''
        GROUP BY 
          merchant_name, 
          merchant_account_number, 
          mcc_code, 
          transaction_type_identifier,
          SUBSTRING(merchant_account_number, 1, 5)
      `;

      const result = await pool.query(rebuildQuery);
      const rebuiltCount = result.rowCount || 0;
      const buildTimeMs = Date.now() - startTime;
      const updated = new Date();

      console.log(`[TDDF CACHE] ✅ Cache rebuilt: ${rebuiltCount} merchants in ${buildTimeMs}ms`);

      return {
        rebuilt: rebuiltCount,
        updated,
        performance: {
          buildTimeMs,
          recordsProcessed: rebuiltCount
        }
      };
    } catch (error) {
      console.error('[TDDF CACHE] Error rebuilding cache:', error);
      throw error;
    }
  }

  // Process TSYS Merchant Risk report files
  async processMerchantRiskFileFromContent(
    base64Content: string, 
    fileId: string, 
    originalFilename: string
  ): Promise<{ rowsProcessed: number; merchantsUpdated: number; errors: number }> {
    console.log(`=================== MERCHANT RISK FILE PROCESSING (TSYS) ===================`);
    console.log(`Processing TSYS Merchant Risk file: ${originalFilename} (${fileId})`);
    
    // Decode base64 content
    const csvContent = Buffer.from(base64Content, 'base64').toString('utf8');
    
    return new Promise((resolve, reject) => {
      console.log("Starting TSYS Merchant Risk CSV parsing...");
      
      // Parse CSV content with proper header detection
      const parser = parseCSV({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        relax: true,
        skip_records_with_empty_values: false
      });
      
      const riskUpdates: any[] = [];
      let rowCount = 0;
      let errorCount = 0;
      let merchantsUpdated = 0;
      
      parser.on("data", (row) => {
        rowCount++;
        try {
          console.log(`\n--- Processing TSYS Risk row ${rowCount} ---`);
          console.log(`Row data: ${JSON.stringify(row)}`);
          
          // Map TSYS Merchant Risk fields to database schema
          const riskData = {
            // Core merchant identifier (required)
            merchant_id: row['MID'] || row['Merchant ID'] || row['merchant_id'] || null,
            
            // TSYS Merchant Risk fields
            bank: row['Bank'] || row['bank'] || null,
            associate_merchant_number: row['Associate Merchant Number'] || row['associate_merchant_number'] || null,
            dba_name_cwob: row['DBA Name CWOB'] || row['dba_name_cwob'] || null,
            cwob_debit_risk: row['CWOB Debit Risk'] || row['cwob_debit_risk'] || null,
            vwob_ebt_return: row['VWOB EBT Return'] || row['vwob_ebt_return'] || null,
            
            // Bypass controls
            bypass_ea: this.parseBooleanField(row['Bypass EA'] || row['bypass_ea']),
            bypass_co: this.parseBooleanField(row['Bypass Co'] || row['bypass_co']),
            bypass_force: this.parseBooleanField(row['Bypass Force'] || row['bypass_force']),
            bypass_ex: this.parseBooleanField(row['Bypass Ex'] || row['bypass_ex']),
            
            // Status and dates
            merchant_record_status: row['Merchant Record Status'] || row['merchant_record_status'] || null,
            board_date: this.parseDate(row['Board Date'] || row['board_date']),
            
            // Financial amounts
            daily_sale_amount: this.parseDecimal(row['Daily Sale Amount'] || row['daily_sale_amount']),
            daily_credit_amount: this.parseDecimal(row['Daily Credit Amount'] || row['daily_credit_amount']),
            daily_negative_amount: this.parseDecimal(row['Daily Negative Amount'] || row['daily_negative_amount']),
            
            // Threshold and limit controls
            threshold_control_1: this.parseDecimal(row['Threshold Control 1'] || row['threshold_control_1']),
            threshold_control_2: this.parseDecimal(row['Threshold Control 2'] || row['threshold_control_2']),
            daily_auth_limit: this.parseDecimal(row['Daily Auth Limit'] || row['daily_auth_limit']),
            
            // Fee structures
            discount_rate: this.parseDecimal(row['Discount Rate'] || row['discount_rate']),
            transaction_fee: this.parseDecimal(row['Transaction Fee'] || row['transaction_fee']),
            monthly_fee: this.parseDecimal(row['Monthly Fee'] || row['monthly_fee']),
            
            // Risk assessment fields
            visa_mcc: row['Visa MCC'] || row['visa_mcc'] || null,
            risk_score: this.parseDecimal(row['Risk Score'] || row['risk_score']),
            risk_level: this.parseRiskLevel(row['Risk Level'] || row['risk_level']),
            last_risk_assessment: this.parseDate(row['Last Risk Assessment'] || row['last_risk_assessment']),
            risk_flags: this.parseArrayField(row['Risk Flags'] || row['risk_flags']),
            compliance_status: row['Compliance Status'] || row['compliance_status'] || null,
            review_required: this.parseBooleanField(row['Review Required'] || row['review_required']),
            risk_notes: row['Risk Notes'] || row['risk_notes'] || null
          };
          
          // Validate required merchant identifier
          if (!riskData.merchant_id) {
            console.log(`[SKIP] Row ${rowCount}: Missing merchant ID`);
            errorCount++;
            return;
          }
          
          console.log(`[RISK DATA] MID: ${riskData.merchant_id}, Risk Level: ${riskData.risk_level}, Risk Score: ${riskData.risk_score}`);
          riskUpdates.push(riskData);
          
        } catch (rowError) {
          console.error(`Error processing risk row ${rowCount}:`, rowError);
          errorCount++;
        }
      });
      
      parser.on("error", (error) => {
        console.error("CSV parsing error:", error);
        reject(new Error(`CSV parsing failed: ${error.message}`));
      });
      
      parser.on("end", async () => {
        try {
          console.log(`\n=================== TSYS RISK DATA PROCESSING ===================`);
          console.log(`Parsed ${riskUpdates.length} risk records for merchant updates`);
          
          // Get environment-specific table name
          const merchantsTableName = getTableName('merchants');
          
          // Process each risk update
          for (const riskData of riskUpdates) {
            try {
              // Find existing merchant by ID
              const existingMerchant = await db.execute(sql`
                SELECT id FROM ${sql.identifier(merchantsTableName)} 
                WHERE id = ${riskData.merchant_id}
              `);
              
              if (existingMerchant.rows.length === 0) {
                console.log(`[SKIP] Merchant ${riskData.merchant_id} not found in database`);
                errorCount++;
                continue;
              }
              
              // Update merchant with risk data
              const updateFields: string[] = [];
              const updateValues: any[] = [];
              let paramIndex = 1;
              
              // Build dynamic update query with only non-null values
              Object.entries(riskData).forEach(([key, value]) => {
                if (key !== 'merchant_id' && value !== null && value !== undefined) {
                  updateFields.push(`${key} = $${paramIndex}`);
                  updateValues.push(value);
                  paramIndex++;
                }
              });
              
              if (updateFields.length === 0) {
                console.log(`[SKIP] No risk data to update for merchant ${riskData.merchant_id}`);
                continue;
              }
              
              // Add merchant ID for WHERE clause
              updateValues.push(riskData.merchant_id);
              
              // Execute update
              await db.execute(sql.raw(`
                UPDATE "${merchantsTableName}" 
                SET ${updateFields.join(', ')}, 
                    last_risk_assessment = NOW()
                WHERE id = $${paramIndex}
              `), updateValues);
              
              console.log(`[SUCCESS] Updated merchant ${riskData.merchant_id} with ${updateFields.length} risk fields`);
              merchantsUpdated++;
              
            } catch (updateError) {
              console.error(`Error updating merchant ${riskData.merchant_id}:`, updateError);
              errorCount++;
            }
          }
          
          console.log(`\n=================== TSYS RISK PROCESSING COMPLETE ===================`);
          console.log(`Successfully updated ${merchantsUpdated} merchants with risk data`);
          console.log(`Errors: ${errorCount}`);
          
          resolve({ 
            rowsProcessed: rowCount, 
            merchantsUpdated, 
            errors: errorCount 
          });
          
        } catch (processingError) {
          console.error("Risk data processing error:", processingError);
          reject(processingError);
        }
      });
      
      // Start parsing
      parser.write(csvContent);
      parser.end();
    });
  }
  
  // Helper methods for TSYS risk data parsing
  private parseBooleanField(value: any): boolean | null {
    if (value === null || value === undefined || value === '') return null;
    const str = String(value).toLowerCase().trim();
    return str === 'true' || str === 'yes' || str === '1' || str === 'y';
  }
  
  private parseDecimal(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = parseFloat(String(value));
    return isNaN(num) ? null : num;
  }
  
  private parseRiskLevel(value: any): string | null {
    if (value === null || value === undefined || value === '') return null;
    const level = String(value).toLowerCase().trim();
    const validLevels = ['low', 'medium', 'high', 'critical'];
    return validLevels.includes(level) ? level : null;
  }
  
  private parseArrayField(value: any): string[] | null {
    if (value === null || value === undefined || value === '') return null;
    try {
      // Handle JSON array format
      if (String(value).startsWith('[')) {
        return JSON.parse(String(value));
      }
      // Handle comma-separated format
      return String(value).split(',').map(s => s.trim()).filter(s => s.length > 0);
    } catch {
      return null;
    }
  }

  async getTddfMerchantsCacheStats(): Promise<{ totalMerchants: number; lastUpdated: Date; oldestRecord: Date; averageUpdateAge: number }> {
    try {
      const cacheTableName = getTableName('tddf_merchants_cache');

      const statsQuery = `
        SELECT 
          COUNT(*) as total_merchants,
          MAX(last_updated) as last_updated,
          MIN(created_at) as oldest_record,
          EXTRACT(EPOCH FROM (NOW() - AVG(last_updated))) / 60 as average_update_age_minutes
        FROM "${cacheTableName}"
      `;

      const result = await pool.query(statsQuery);
      const row = result.rows[0];

      return {
        totalMerchants: parseInt(row.total_merchants) || 0,
        lastUpdated: row.last_updated || new Date(),
        oldestRecord: row.oldest_record || new Date(),
        averageUpdateAge: parseFloat(row.average_update_age_minutes) || 0
      };
    } catch (error) {
      console.error('[TDDF CACHE] Error getting cache stats:', error);
      throw error;
    }
  }

  // MCC TSYS Merchant Schema Configuration operations
  async getMccSchemaFields(): Promise<MerchantMccSchema[]> {
    try {
      const tableName = getTableName('Merchant_MCC_Schema');
      const result = await pool.query(`
        SELECT * FROM ${tableName}
        ORDER BY position
      `);
      return result.rows.map(row => ({
        id: row.id,
        position: row.position,
        fieldName: row.field_name,
        key: row.key,
        tabPosition: row.tab_position,
        fieldLength: row.field_length,
        format: row.format,
        description: row.description,
        mmsEnabled: row.mms_enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('[MCC SCHEMA] Error getting fields:', error);
      throw error;
    }
  }

  async upsertMccSchemaField(fieldData: InsertMerchantMccSchema): Promise<MerchantMccSchema> {
    try {
      const tableName = getTableName('Merchant_MCC_Schema');
      const result = await pool.query(`
        INSERT INTO ${tableName} (position, field_name, key, tab_position, field_length, format, description, mms_enabled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (position)
        DO UPDATE SET
          field_name = EXCLUDED.field_name,
          key = EXCLUDED.key,
          tab_position = EXCLUDED.tab_position,
          field_length = EXCLUDED.field_length,
          format = EXCLUDED.format,
          description = EXCLUDED.description,
          mms_enabled = EXCLUDED.mms_enabled,
          updated_at = NOW()
        RETURNING *
      `, [
        fieldData.position,
        fieldData.fieldName,
        fieldData.key || null,
        fieldData.tabPosition || null,
        fieldData.fieldLength,
        fieldData.format,
        fieldData.description || null,
        fieldData.mmsEnabled
      ]);
      
      const row = result.rows[0];
      return {
        id: row.id,
        position: row.position,
        fieldName: row.field_name,
        key: row.key,
        tabPosition: row.tab_position,
        fieldLength: row.field_length,
        format: row.format,
        description: row.description,
        mmsEnabled: row.mms_enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('[MCC SCHEMA] Error upserting field:', error);
      throw error;
    }
  }

  async updateMccSchemaField(id: number, fieldData: Partial<InsertMerchantMccSchema>): Promise<MerchantMccSchema> {
    try {
      const tableName = getTableName('Merchant_MCC_Schema');
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (fieldData.position !== undefined) {
        updates.push(`position = $${paramIndex++}`);
        values.push(fieldData.position);
      }
      if (fieldData.fieldName !== undefined) {
        updates.push(`field_name = $${paramIndex++}`);
        values.push(fieldData.fieldName);
      }
      if (fieldData.key !== undefined) {
        updates.push(`key = $${paramIndex++}`);
        values.push(fieldData.key);
      }
      if (fieldData.tabPosition !== undefined) {
        updates.push(`tab_position = $${paramIndex++}`);
        values.push(fieldData.tabPosition);
      }
      if (fieldData.fieldLength !== undefined) {
        updates.push(`field_length = $${paramIndex++}`);
        values.push(fieldData.fieldLength);
      }
      if (fieldData.format !== undefined) {
        updates.push(`format = $${paramIndex++}`);
        values.push(fieldData.format);
      }
      if (fieldData.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(fieldData.description);
      }
      if (fieldData.mmsEnabled !== undefined) {
        updates.push(`mms_enabled = $${paramIndex++}`);
        values.push(fieldData.mmsEnabled);
      }
      updates.push(`updated_at = NOW()`);
      values.push(id);

      const result = await pool.query(`
        UPDATE ${tableName}
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        throw new Error(`Field with id ${id} not found`);
      }

      const row = result.rows[0];
      return {
        id: row.id,
        position: row.position,
        fieldName: row.field_name,
        key: row.key,
        tabPosition: row.tab_position,
        fieldLength: row.field_length,
        format: row.format,
        description: row.description,
        mmsEnabled: row.mms_enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('[MCC SCHEMA] Error updating field:', error);
      throw error;
    }
  }

  async deleteMccSchemaFields(ids: number[]): Promise<void> {
    try {
      const tableName = getTableName('Merchant_MCC_Schema');
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
      await pool.query(`
        DELETE FROM ${tableName}
        WHERE id IN (${placeholders})
      `, ids);
    } catch (error) {
      console.error('[MCC SCHEMA] Error deleting fields:', error);
      throw error;
    }
  }

  async bulkUpsertMccSchemaFields(fields: InsertMerchantMccSchema[]): Promise<{ inserted: number; updated: number }> {
    try {
      const tableName = getTableName('Merchant_MCC_Schema');
      let inserted = 0;
      let updated = 0;

      for (const field of fields) {
        const checkResult = await pool.query(`
          SELECT position FROM ${tableName} WHERE position = $1
        `, [field.position]);

        await pool.query(`
          INSERT INTO ${tableName} (position, field_name, key, tab_position, field_length, format, description, mms_enabled)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (position)
          DO UPDATE SET
            field_name = EXCLUDED.field_name,
            key = EXCLUDED.key,
            tab_position = EXCLUDED.tab_position,
            field_length = EXCLUDED.field_length,
            format = EXCLUDED.format,
            description = EXCLUDED.description,
            mms_enabled = EXCLUDED.mms_enabled,
            updated_at = NOW()
        `, [
          field.position,
          field.fieldName,
          field.key || null,
          field.tabPosition || null,
          field.fieldLength,
          field.format,
          field.description || null,
          field.mmsEnabled
        ]);

        if (checkResult.rows.length > 0) {
          updated++;
        } else {
          inserted++;
        }
      }

      return { inserted, updated };
    } catch (error) {
      console.error('[MCC SCHEMA] Error bulk upserting fields:', error);
      throw error;
    }
  }

  // @ENVIRONMENT-CRITICAL - Dev Upload operations for compressed storage testing
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async createDevUpload(insertDevUpload: InsertDevUpload): Promise<DevUpload> {
    const devUploadsTableName = getTableName('dev_uploads');
    const result = await pool.query(`
      INSERT INTO ${devUploadsTableName} (id, file_name, file_size, upload_date, content_type, compressed_data)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [insertDevUpload.id, insertDevUpload.fileName, insertDevUpload.fileSize, insertDevUpload.uploadDate, insertDevUpload.contentType, insertDevUpload.compressedData]);
    return result.rows[0];
  }

  // @ENVIRONMENT-CRITICAL - Dev Upload operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getDevUploads(): Promise<DevUpload[]> {
    const devUploadsTableName = getTableName('dev_uploads');
    const result = await pool.query(`
      SELECT * FROM ${devUploadsTableName} 
      ORDER BY upload_date DESC
    `);
    return result.rows;
  }

  // @ENVIRONMENT-CRITICAL - Dev Upload operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getDevUploadById(id: string): Promise<DevUpload | undefined> {
    const devUploadsTableName = getTableName('dev_uploads');
    const result = await pool.query(`
      SELECT * FROM ${devUploadsTableName} 
      WHERE id = $1
    `, [id]);
    return result.rows[0] || undefined;
  }

  // @ENVIRONMENT-CRITICAL - Orphaned upload recovery operations
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async getOrphanedUploads(): Promise<any[]> {
    try {
      const uploadsTableName = getTableName('uploaded_files');
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      console.log('[ORPHANED-RECOVERY] Searching for orphaned uploads...');
      
      const result = await pool.query(`
        SELECT 
          id,
          original_filename as "fileName",
          file_type as "fileType",
          file_size as "fileSize",
          uploaded_at as "uploadedAt",
          processing_status as "processingStatus",
          processing_errors as "processingErrors",
          raw_lines_count as "rawLinesCount"
        FROM ${uploadsTableName}
        WHERE deleted = false 
          AND (
            (processing_status = 'uploading' AND uploaded_at < $1) OR
            (raw_lines_count = 0 OR raw_lines_count IS NULL)
          )
          AND processing_status NOT IN ('error', 'completed')
          AND NOT (storage_path LIKE 'placeholder_%')
        ORDER BY uploaded_at DESC
        LIMIT 50
      `, [fiveMinutesAgo]);

      console.log(`[ORPHANED-RECOVERY] Found ${result.rows.length} orphaned uploads`);
      return result.rows;
    } catch (error) {
      console.error('[ORPHANED-RECOVERY] Error fetching orphaned uploads:', error);
      return [];
    }
  }

  // @ENVIRONMENT-CRITICAL - Orphaned upload recovery operations  
  // @DEPLOYMENT-CHECK - Uses environment-aware table naming
  async recoverOrphanedUploads(fileIds: string[]): Promise<number> {
    try {
      const uploadsTableName = getTableName('uploaded_files');
      console.log(`[ORPHANED-RECOVERY] Attempting recovery of ${fileIds.length} orphaned uploads...`);
      
      // First, check which files need content reprocessing (rawLinesCount = 0)
      const filesNeedingReprocessing = await pool.query(`
        SELECT id, original_filename, storage_path, file_type, raw_lines_count
        FROM ${uploadsTableName}
        WHERE id = ANY($1::text[])
          AND deleted = false
          AND raw_lines_count = 0
      `, [fileIds]);

      let reprocessedFiles = 0;

      // Handle files that have placeholder storage paths (incomplete uploads)
      for (const file of filesNeedingReprocessing.rows) {
        try {
          console.log(`[ORPHANED-RECOVERY] Analyzing file: ${file.original_filename} (path: ${file.storage_path})`);
          
          // Check if this is a placeholder entry (incomplete two-phase upload)
          if (file.storage_path.startsWith('placeholder_')) {
            console.log(`[ORPHANED-RECOVERY] Found placeholder entry: ${file.original_filename}`);
            console.log(`[ORPHANED-RECOVERY] This indicates an incomplete two-phase upload - file content was never uploaded`);
            
            // Mark the file as permanently failed since content is missing
            await pool.query(`
              UPDATE ${uploadsTableName}
              SET 
                processing_status = 'error',
                processing_errors = '[ORPHANED-RECOVERY] Incomplete upload - file content never received in two-phase upload process',
                processing_notes = CASE 
                  WHEN processing_notes IS NOT NULL 
                  THEN processing_notes || ' [FAILED: Placeholder entry without content]'
                  ELSE '[FAILED: Placeholder entry - content never uploaded]'
                END
              WHERE id = $1
            `, [file.id]);
            
            console.log(`[ORPHANED-RECOVERY] Marked ${file.original_filename} as failed due to missing content`);
            reprocessedFiles++;
            continue;
          }

          // For files with actual storage paths, try to read content
          const fs = await import('fs/promises');
          let content = '';
          
          try {
            content = await fs.readFile(file.storage_path, 'utf8');
          } catch (readError) {
            console.error(`[ORPHANED-RECOVERY] Could not read file ${file.storage_path}:`, readError);
            
            // Mark as error since file should exist but can't be read
            await pool.query(`
              UPDATE ${uploadsTableName}
              SET 
                processing_status = 'error',
                processing_errors = $1
              WHERE id = $2
            `, [`File read error: ${readError.message}`, file.id]);
            continue;
          }

          if (!content.trim()) {
            console.log(`[ORPHANED-RECOVERY] File ${file.original_filename} is empty, marking as error`);
            await pool.query(`
              UPDATE ${uploadsTableName}
              SET 
                processing_status = 'error',
                processing_errors = 'File is empty'
              WHERE id = $1
            `, [file.id]);
            continue;
          }

          // Process raw data extraction for valid files
          const lines = content.split('\n').filter(line => line.trim().length > 0);
          const rawLinesCount = lines.length;
          
          // Update the file with raw data information
          await pool.query(`
            UPDATE ${uploadsTableName}
            SET 
              raw_lines_count = $1,
              processing_notes = CASE 
                WHEN processing_notes IS NOT NULL 
                THEN processing_notes || ' [REPROCESSED: Extracted ' || $1 || ' raw lines]'
                ELSE '[REPROCESSED: Extracted ' || $1 || ' raw lines during recovery]'
              END
            WHERE id = $2
          `, [rawLinesCount, file.id]);

          // For TDDF files, also populate the raw import table
          if (file.file_type === 'tddf') {
            const tddfRawImportTableName = getTableName('tddf_raw_import');
            
            // Check if raw data already exists
            const existingRaw = await pool.query(`
              SELECT COUNT(*) as count FROM ${tddfRawImportTableName} WHERE upload_id = $1
            `, [file.id]);

            if (existingRaw.rows[0].count === '0') {
              // Insert raw lines into tddf_raw_import
              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const recordType = line.length >= 2 ? line.substring(18, 20).trim() : '';
                
                await pool.query(`
                  INSERT INTO ${tddfRawImportTableName} 
                  (upload_id, line_number, raw_line, record_type, processing_status)
                  VALUES ($1, $2, $3, $4, 'pending')
                `, [file.id, i + 1, line, recordType]);
              }
              console.log(`[ORPHANED-RECOVERY] Inserted ${lines.length} raw lines for TDDF file ${file.original_filename}`);
            }
          }

          reprocessedFiles++;
          console.log(`[ORPHANED-RECOVERY] Successfully reprocessed ${file.original_filename} with ${rawLinesCount} lines`);

        } catch (fileError) {
          console.error(`[ORPHANED-RECOVERY] Error reprocessing file ${file.original_filename}:`, fileError);
        }
      }

      // Now update status for recoverable files (excluding placeholder failures)
      const result = await pool.query(`
        UPDATE ${uploadsTableName}
        SET 
          processing_status = 'queued',
          processing_errors = CASE 
            WHEN processing_errors IS NOT NULL 
            THEN processing_errors || ' [RECOVERED: Reset to queued status]'
            ELSE '[RECOVERED: Reset from orphaned status to queued]'
          END,
          processing_server_id = NULL
        WHERE id = ANY($1::text[])
          AND deleted = false
          AND processing_status != 'error'
          AND NOT (storage_path LIKE 'placeholder_%')
        RETURNING id
      `, [fileIds]);

      const statusRecovered = result.rows.length;
      console.log(`[ORPHANED-RECOVERY] Recovery summary: ${reprocessedFiles} files reprocessed, ${statusRecovered} files status updated`);
      return statusRecovered;
      
    } catch (error) {
      console.error('[ORPHANED-RECOVERY] Error recovering orphaned uploads:', error);
      throw error;
    }
  }

  // MMS Uploader storage operations
  async createUploaderUpload(insertUploaderUpload: Partial<InsertUploaderUpload>): Promise<UploaderUpload> {
    try {
      console.log(`[UPLOADER] Creating new upload: ${insertUploaderUpload.filename}`);
      
      const uploaderTableName = getTableName('uploader_uploads');
      
      // Generate unique ID if not provided
      const id = insertUploaderUpload.id || `uploader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const result = await pool.query(`
        INSERT INTO ${uploaderTableName} (
          id, filename, file_type, file_size, created_at, upload_status, 
          current_phase, created_by, server_id, session_id, keep_for_review
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        id,
        insertUploaderUpload.filename,
        insertUploaderUpload.file_type || 'tddf', // Default to 'tddf' if not specified
        insertUploaderUpload.file_size || null,
        insertUploaderUpload.start_time || new Date(),
        insertUploaderUpload.upload_status || 'started',
        insertUploaderUpload.current_phase || 'started',
        insertUploaderUpload.created_by || 'system',
        insertUploaderUpload.server_id || null,
        insertUploaderUpload.session_id || null,
        insertUploaderUpload.keepForReview || false
      ]);
      
      console.log(`[UPLOADER] Created upload ${id} in phase: ${result.rows[0].current_phase}`);
      return result.rows[0] as UploaderUpload;
      
    } catch (error) {
      console.error('[UPLOADER] Error creating uploader upload:', error);
      throw error;
    }
  }

  async getUploaderUploads(options?: { phase?: string; sessionId?: string; limit?: number; offset?: number }): Promise<UploaderUpload[]> {
    try {
      const uploaderTableName = getTableName('uploader_uploads');
      let query = `SELECT * FROM ${uploaderTableName}`;
      const params: any[] = [];
      const conditions: string[] = [];
      
      if (options?.phase) {
        conditions.push(`current_phase = $${params.length + 1}`);
        params.push(options.phase);
      }
      
      if (options?.sessionId) {
        conditions.push(`session_id = $${params.length + 1}`);
        params.push(options.sessionId);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      query += ` ORDER BY start_time DESC`;
      
      if (options?.limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(options.limit);
      }
      
      if (options?.offset) {
        query += ` OFFSET $${params.length + 1}`;
        params.push(options.offset);
      }
      
      console.log(`[UPLOADER-STORAGE-DEBUG] Executing query: ${query}`);
      console.log(`[UPLOADER-STORAGE-DEBUG] Query params:`, params);
      
      const result = await pool.query(query, params);
      
      console.log(`[UPLOADER-STORAGE-DEBUG] Query returned ${result.rows.length} rows`);
      if (result.rows.length > 0) {
        console.log(`[UPLOADER-STORAGE-DEBUG] First row:`, result.rows[0]);
      }
      
      // Convert snake_case database fields to camelCase for frontend compatibility
      return result.rows.map(row => ({
        ...row,
        currentPhase: row.current_phase,
        lastUpdated: row.last_updated,
        uploadStartedAt: row.upload_started_at,
        uploadStatus: row.upload_status,
        uploadProgress: row.upload_progress,
        chunkedUpload: row.chunked_upload,
        chunkCount: row.chunk_count,
        chunksUploaded: row.chunks_uploaded,
        uploadedAt: row.uploaded_at,
        storagePath: row.storage_path,
        s3Bucket: row.s3_bucket,
        s3Key: row.s3_key,
        s3Url: row.s3_url,
        s3Etag: row.s3_etag,
        fileSize: row.file_size,
        identifiedAt: row.identified_at,
        detectedFileType: row.detected_file_type,
        userClassifiedType: row.user_classified_type,
        finalFileType: row.final_file_type,
        lineCount: row.line_count,
        dataSize: row.data_size,
        keepForReview: row.keep_for_review,
        hasHeaders: row.has_headers,
        fileFormat: row.file_format,
        compressionUsed: row.compression_used,
        encodingDetected: row.encoding_detected,
        validationErrors: row.validation_errors,
        processingNotes: row.processing_notes,
        createdBy: row.created_by,
        serverId: row.server_id,
        sessionId: row.session_id,
        failedAt: row.failed_at,
        completedAt: row.completed_at,
        startTime: row.start_time
      })) as UploaderUpload[];
      
    } catch (error) {
      console.error('[UPLOADER] Error getting uploader uploads:', error);
      throw error;
    }
  }

  async getUploaderUploadsCount(options?: { phase?: string; sessionId?: string }): Promise<number> {
    try {
      const uploaderTableName = getTableName('uploader_uploads');
      let query = `SELECT COUNT(*) as count FROM ${uploaderTableName}`;
      const params: any[] = [];
      const conditions: string[] = [];
      
      if (options?.phase) {
        conditions.push(`current_phase = $${params.length + 1}`);
        params.push(options.phase);
      }
      
      if (options?.sessionId) {
        conditions.push(`session_id = $${params.length + 1}`);
        params.push(options.sessionId);
      }
      
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      const result = await pool.query(query, params);
      return parseInt(result.rows[0].count) || 0;
      
    } catch (error) {
      console.error('[UPLOADER] Error getting uploader uploads count:', error);
      throw error;
    }
  }

  async getUploaderUploadById(id: string): Promise<UploaderUpload | undefined> {
    try {
      const uploaderTableName = getTableName('uploader_uploads');
      const result = await pool.query(`
        SELECT * FROM ${uploaderTableName} 
        WHERE id = $1
      `, [id]);
      
      if (!result.rows[0]) return undefined;
      
      const row = result.rows[0];
      // Convert snake_case database fields to camelCase for frontend compatibility
      return {
        ...row,
        currentPhase: row.current_phase,
        lastUpdated: row.last_updated,
        uploadStartedAt: row.upload_started_at,
        uploadStatus: row.upload_status,
        uploadProgress: row.upload_progress,
        chunkedUpload: row.chunked_upload,
        chunkCount: row.chunk_count,
        chunksUploaded: row.chunks_uploaded,
        uploadedAt: row.uploaded_at,
        storagePath: row.storage_path,
        s3Bucket: row.s3_bucket,
        s3Key: row.s3_key,
        s3Url: row.s3_url,
        s3Etag: row.s3_etag,
        fileSize: row.file_size,
        identifiedAt: row.identified_at,
        detectedFileType: row.detected_file_type,
        userClassifiedType: row.user_classified_type,
        finalFileType: row.final_file_type,
        lineCount: row.line_count,
        dataSize: row.data_size,
        keepForReview: row.keep_for_review,
        hasHeaders: row.has_headers,
        fileFormat: row.file_format,
        compressionUsed: row.compression_used,
        encodingDetected: row.encoding_detected,
        validationErrors: row.validation_errors,
        processingNotes: row.processing_notes,
        createdBy: row.created_by,
        serverId: row.server_id,
        sessionId: row.session_id,
        failedAt: row.failed_at,
        completedAt: row.completed_at,
        startTime: row.start_time
      } as UploaderUpload;
      
    } catch (error) {
      console.error('[UPLOADER] Error getting uploader upload by ID:', error);
      throw error;
    }
  }

  async updateUploaderUpload(id: string, updates: Partial<UploaderUpload>): Promise<UploaderUpload> {
    try {
      const uploaderTableName = getTableName('uploader_uploads');
      
      // Map camelCase field names to snake_case database column names
      const fieldNameMap: Record<string, string> = {
        currentPhase: 'current_phase',
        lastUpdated: 'last_updated',
        uploadStartedAt: 'upload_started_at',
        uploadStatus: 'upload_status',
        uploadProgress: 'upload_progress',
        chunkedUpload: 'chunked_upload',
        chunkCount: 'chunk_count',
        chunksUploaded: 'chunks_uploaded',
        uploadedAt: 'uploaded_at',
        storagePath: 'storage_path',
        storageKey: 'storage_key',
        s3Bucket: 's3_bucket',
        s3Key: 's3_key',
        s3Url: 's3_url',
        s3Etag: 's3_etag',
        fileSize: 'file_size',
        identifiedAt: 'identified_at',
        detectedFileType: 'detected_file_type',
        userClassifiedType: 'user_classified_type',
        finalFileType: 'final_file_type',
        lineCount: 'line_count',
        dataSize: 'data_size',
        keepForReview: 'keep_for_review',
        hasHeaders: 'has_headers',
        fileFormat: 'file_format',
        compressionUsed: 'compression_used',
        encodingDetected: 'encoding_detected',
        validationErrors: 'validation_errors',
        processingNotes: 'processing_notes',
        createdBy: 'created_by',
        serverId: 'server_id',
        sessionId: 'session_id',
        failedAt: 'failed_at',
        completedAt: 'completed_at',
        // Legacy Step 6 columns (need to clear for merchant files)
        fileType: 'file_type',
        status: 'status',
        processingStatus: 'processing_status',
        // Encoding phase fields
        encodingStartedAt: 'encoding_started_at',
        encodingCompletedAt: 'encoding_completed_at',
        encodingTimeMs: 'encoding_time_ms',
        encodingStatus: 'encoding_status',
        jsonRecordsCreated: 'json_records_created',
        tddfRecordsCreated: 'tddf_records_created',
        fieldSeparationStrategy: 'field_separation_strategy',
        encodingErrors: 'encoding_errors',
        healthMetadata: 'health_metadata',
        // Additional phase tracking fields
        uploadStart: 'upload_start',
        uploadComplete: 'upload_complete',
        uploadedLineCount: 'uploaded_line_count',
        identifyStart: 'identify_start',
        identifyComplete: 'identify_complete',
        encodingStart: 'encoding_start',
        encodingComplete: 'encoding_complete',
        encodedLines: 'encoded_lines',
        businessDay: 'business_day', // Business day from filename
        businessday: 'business_day', // Business day (lowercase fallback)
        // MMS Watcher field mappings
        encodingNotes: 'encoding_notes',
        canRetry: 'can_retry',
        lastFailureReason: 'last_failure_reason',
        retryCount: 'retry_count',
        lastRetryAt: 'last_retry_at'
      };
      
      // Build dynamic update query
      const fields = Object.keys(updates).filter(key => key !== 'id');
      const setClause = fields.map((field, index) => {
        const dbFieldName = fieldNameMap[field] || field;
        return `${dbFieldName} = $${index + 2}`;
      }).join(', ');
      
      if (fields.length === 0) {
        throw new Error('No fields to update');
      }
      
      // Debug logging to identify field mapping
      console.log(`[UPLOADER-DEBUG] Update fields for ${id}:`, fields);
      console.log(`[UPLOADER-DEBUG] SET clause: ${setClause}`);
      console.log(`[UPLOADER-DEBUG] Updates object:`, JSON.stringify(updates, null, 2));
      
      // Update query - last_updated is included in updates object if needed
      const query = `
        UPDATE ${uploaderTableName} 
        SET ${setClause}
        WHERE id = $1
        RETURNING *
      `;
      
      const values = [id, ...fields.map(field => updates[field as keyof UploaderUpload])];
      logger.uploader(`Full query: ${query}`);
      logger.uploader(`Values:`, values);
      
      const result = await pool.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Upload with ID ${id} not found`);
      }
      
      console.log(`[UPLOADER] Updated upload ${id}: ${JSON.stringify(updates)}`);
      return result.rows[0] as UploaderUpload;
      
    } catch (error) {
      console.error('[UPLOADER] Error updating uploader upload:', error);
      throw error;
    }
  }

  async updateUploaderPhase(id: string, phase: string, phaseData?: Record<string, any>): Promise<UploaderUpload> {
    try {
      console.log(`[UPLOADER] Transitioning upload ${id} to phase: ${phase}`);
      
      const updates: Partial<UploaderUpload> = {
        currentPhase: phase,
        lastUpdated: new Date()
      };
      
      // Add phase-specific timestamp and data
      switch (phase) {
        case 'uploading':
          updates.uploadStartedAt = new Date();
          updates.uploadStatus = 'uploading';
          if (phaseData?.progress) updates.uploadProgress = phaseData.progress;
          if (phaseData?.chunkedUpload) updates.chunkedUpload = phaseData.chunkedUpload;
          if (phaseData?.chunkCount) updates.chunkCount = phaseData.chunkCount;
          break;
          
        case 'uploaded':
          updates.uploadedAt = new Date();
          updates.uploadStatus = 'uploaded';
          if (phaseData?.storagePath) updates.storagePath = phaseData.storagePath;
          if (phaseData?.fileSize) updates.fileSize = phaseData.fileSize;
          break;
          
        case 'identified':
          updates.identifiedAt = new Date();
          if (phaseData?.detectedFileType) updates.detectedFileType = phaseData.detectedFileType;
          if (phaseData?.finalFileType) updates.finalFileType = phaseData.finalFileType;
          if (phaseData?.lineCount) updates.lineCount = phaseData.lineCount;
          if (phaseData?.hasHeaders !== undefined) updates.hasHeaders = phaseData.hasHeaders;
          if (phaseData?.fileFormat) updates.fileFormat = phaseData.fileFormat;
          if (phaseData?.encodingDetected) updates.encodingDetected = phaseData.encodingDetected;
          if (phaseData?.validationErrors) updates.validationErrors = phaseData.validationErrors;
          if (phaseData?.processingNotes) updates.processingNotes = phaseData.processingNotes;
          break;
          
        case 'completed':
          updates.completedAt = new Date();
          updates.uploadStatus = 'completed';
          if (phaseData?.processingNotes) updates.processingNotes = phaseData.processingNotes;
          break;
      }
      
      return await this.updateUploaderUpload(id, updates);
      
    } catch (error) {
      console.error('[UPLOADER] Error updating upload phase:', error);
      throw error;
    }
  }

  async deleteUploaderUploads(uploadIds: string[]): Promise<void> {
    try {
      if (!uploadIds || uploadIds.length === 0) {
        return;
      }

      const uploaderTableName = getTableName('uploader_uploads');
      
      // Build placeholders for parameterized query
      const placeholders = uploadIds.map((_, index) => `$${index + 1}`).join(', ');
      
      const result = await pool.query(`
        DELETE FROM ${uploaderTableName} 
        WHERE id IN (${placeholders})
      `, uploadIds);
      
      console.log(`[UPLOADER] Deleted ${result.rowCount} uploader uploads`);
      
    } catch (error) {
      console.error('[UPLOADER] Error deleting uploader uploads:', error);
      throw error;
    }
  }

  async cancelUploaderEncoding(uploadIds: string[]): Promise<{ success: boolean; canceledCount: number; errors: string[] }> {
    try {
      if (!uploadIds || uploadIds.length === 0) {
        return { success: true, canceledCount: 0, errors: [] };
      }

      const uploaderTableName = getTableName('uploader_uploads');
      const errors: string[] = [];
      let canceledCount = 0;
      
      console.log(`[UPLOADER] Attempting to cancel encoding for ${uploadIds.length} files`);
      
      // Check that all files are in encoding phase
      const placeholders = uploadIds.map((_, index) => `$${index + 1}`).join(', ');
      const checkResult = await pool.query(`
        SELECT id, filename, current_phase FROM ${uploaderTableName} 
        WHERE id IN (${placeholders})
      `, uploadIds);
      
      const nonEncodingFiles = checkResult.rows.filter((row: any) => row.current_phase !== 'encoding');
      if (nonEncodingFiles.length > 0) {
        const nonEncodingIds = nonEncodingFiles.map((row: any) => `${row.filename} (${row.current_phase})`);
        errors.push(`Some files are not in encoding phase: ${nonEncodingIds.join(', ')}`);
      }
      
      // Filter to only encoding files
      const encodingFiles = checkResult.rows.filter((row: any) => row.current_phase === 'encoding');
      const encodingIds = encodingFiles.map((row: any) => row.id);
      
      if (encodingIds.length === 0) {
        return { success: false, canceledCount: 0, errors: ['No files in encoding phase found'] };
      }
      
      // Reset encoding files back to identified phase
      const encodingPlaceholders = encodingIds.map((_, index) => `$${index + 1}`).join(', ');
      const updateResult = await pool.query(`
        UPDATE ${uploaderTableName} 
        SET 
          current_phase = 'identified',
          encoding_status = NULL,
          encoding_complete = NULL,
          encoding_completion_time = NULL,
          encoding_at = NULL,
          encoding_time_ms = NULL,
          processing_notes = COALESCE(processing_notes, '') || ' | Encoding canceled by user - reset to identified phase',
          last_updated = NOW()
        WHERE id IN (${encodingPlaceholders})
      `, encodingIds);
      
      canceledCount = updateResult.rowCount || 0;
      
      console.log(`[UPLOADER] Successfully canceled encoding for ${canceledCount} files`);
      console.log(`[UPLOADER] Reset files: ${encodingFiles.map((f: any) => f.filename).join(', ')}`);
      
      return { 
        success: true, 
        canceledCount, 
        errors: errors.length > 0 ? errors : [] 
      };
      
    } catch (error: any) {
      console.error('[UPLOADER] Error canceling encoding:', error);
      return { 
        success: false, 
        canceledCount: 0, 
        errors: [error.message || 'Unknown error occurred'] 
      };
    }
  }

  async setPreviousLevel(uploadIds: string[]): Promise<{ success: boolean; updatedCount: number; errors: string[] }> {
    try {
      if (!uploadIds || uploadIds.length === 0) {
        return { success: true, updatedCount: 0, errors: [] };
      }

      const uploaderTableName = getTableName('uploader_uploads');
      const errors: string[] = [];
      let updatedCount = 0;
      
      console.log(`[UPLOADER] Setting files back to uploaded phase for ${uploadIds.length} files`);
      
      // Get current phase of all files
      const placeholders = uploadIds.map((_, index) => `$${index + 1}`).join(', ');
      const checkResult = await pool.query(`
        SELECT id, filename, current_phase FROM ${uploaderTableName} 
        WHERE id IN (${placeholders})
      `, uploadIds);
      
      for (const row of checkResult.rows) {
        const currentPhase = row.current_phase;
        
        // Don't allow going back if already at uploaded or earlier phases
        if (['started', 'uploading', 'uploaded'].includes(currentPhase)) {
          errors.push(`${row.filename}: Already at '${currentPhase}' phase - cannot reset to uploaded`);
          continue;
        }
        
        // Reset to uploaded phase
        const updateResult = await pool.query(`
          UPDATE ${uploaderTableName}
          SET
            current_phase = 'uploaded',
            processing_notes = COALESCE(processing_notes, '') || ' | Reset to uploaded phase by user from ' || $1,
            last_updated = NOW()
          WHERE id = $2
        `, [currentPhase, row.id]);
        
        if (updateResult.rowCount) {
          updatedCount++;
          console.log(`[UPLOADER] ${row.filename}: ${currentPhase} → uploaded`);
        }
      }
      
      console.log(`[UPLOADER] Successfully reset ${updatedCount} files to uploaded phase`);
      
      return { 
        success: true, 
        updatedCount, 
        errors: errors.length > 0 ? errors : [] 
      };
      
    } catch (error: any) {
      console.error('[UPLOADER] Error setting previous level:', error);
      return { 
        success: false, 
        updatedCount: 0, 
        errors: [error.message || 'Unknown error occurred'] 
      };
    }
  }

  async getAssociatedP1Record(dtRecordId: number): Promise<any | null> {
    try {
      const tddfJsonTableName = getTableName('tddf_jsonb');
      
      // First get the DT record details
      const dtResult = await pool.query(`
        SELECT 
          filename,
          line_number,
          extracted_fields->>'merchantAccountNumber' as merchant_account,
          extracted_fields->>'entryRunNumber' as entry_run
        FROM ${tddfJsonTableName}
        WHERE id = $1 AND record_type = 'DT'
      `, [dtRecordId]);
      
      if (!dtResult.rows[0]) {
        console.log(`[P1-LOOKUP] DT record ${dtRecordId} not found`);
        return null;
      }
      
      const dtRecord = dtResult.rows[0];
      
      // Look for P1 record with line_number = dt_line + 1, same filename, merchant, and entry run
      const p1Result = await pool.query(`
        SELECT 
          id,
          filename,
          line_number,
          raw_line,
          extracted_fields
        FROM ${tddfJsonTableName}
        WHERE filename = $1
          AND line_number = $2
          AND record_type = 'P1'
          AND extracted_fields->>'merchantAccountNumber' = $3
          AND extracted_fields->>'entryRunNumber' = $4
      `, [
        dtRecord.filename,
        dtRecord.line_number + 1,
        dtRecord.merchant_account,
        dtRecord.entry_run
      ]);
      
      if (p1Result.rows.length === 0) {
        console.log(`[P1-LOOKUP] No P1 record found for DT ${dtRecordId} (line ${dtRecord.line_number})`);
        return null;
      }
      
      console.log(`[P1-LOOKUP] Found P1 record for DT ${dtRecordId}: P1 line ${p1Result.rows[0].line_number}`);
      return p1Result.rows[0];
      
    } catch (error) {
      console.error('[P1-LOOKUP] Error fetching associated P1 record:', error);
      throw error;
    }
  }












  async exportTransactionsToCSV(
    merchantId?: string, 
    startDate?: string, 
    endDate?: string,
    type?: string,
    transactionId?: string
  ): Promise<string> {
    try {
      // Use ACH transactions table
      const achTransactionsTableName = getTableName('api_achtransactions');
      
      let whereConditions: string[] = [];
      let queryParams: any[] = [];
      let paramIndex = 1;
      
      if (merchantId) {
        whereConditions.push(`merchant_id = $${paramIndex++}`);
        queryParams.push(merchantId);
      }
      
      if (startDate) {
        whereConditions.push(`transaction_date >= $${paramIndex++}`);
        queryParams.push(startDate);
      }
      
      if (endDate) {
        whereConditions.push(`transaction_date <= $${paramIndex++}`);
        queryParams.push(endDate);
      }
      
      if (type) {
        whereConditions.push(`description = $${paramIndex++}`);
        queryParams.push(type);
      }
      
      if (transactionId) {
        whereConditions.push(`id = $${paramIndex++}`);
        queryParams.push(transactionId);
      }
      
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      
      const query = `
        SELECT 
          id as "Transaction ID",
          merchant_id as "Merchant ID",
          merchant_name as "Merchant Name",
          account_number as "Account Number",
          amount as "Amount",
          transaction_date as "Date",
          description as "Type",
          code as "Code",
          company as "Company",
          trace_number as "Trace Number"
        FROM ${achTransactionsTableName}
        ${whereClause}
        ORDER BY transaction_date DESC, created_at DESC
      `;
      
      const result = await pool.query(query, queryParams);
      
      // Generate CSV file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `transactions_export_${timestamp}.csv`;
      const filepath = path.join(os.tmpdir(), filename);
      
      return new Promise((resolve, reject) => {
        const writeStream = createWriteStream(filepath);
        const csvStream = formatCSV({ headers: true });
        
        csvStream.pipe(writeStream);
        
        result.rows.forEach(row => {
          csvStream.write(row);
        });
        
        csvStream.end();
        
        writeStream.on('finish', () => {
          resolve(filepath);
        });
        
        writeStream.on('error', reject);
      });
      
    } catch (error) {
      console.error('Error exporting transactions to CSV:', error);
      throw error;
    }
  }



  async exportBatchSummaryToCSV(targetDate: string): Promise<string> {
    try {
      const achTransactionsTableName = getTableName('api_achtransactions');
      
      const query = `
        SELECT 
          merchant_name as "Merchant Name",
          COUNT(*) as "Transaction Count",
          SUM(amount) as "Total Amount",
          MIN(transaction_date) as "First Transaction",
          MAX(transaction_date) as "Last Transaction"
        FROM ${achTransactionsTableName}
        WHERE DATE(transaction_date) = $1
        GROUP BY merchant_name
        ORDER BY SUM(amount) DESC
      `;
      
      const result = await pool.query(query, [targetDate]);
      
      // Generate CSV file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `batch_summary_${targetDate}_${timestamp}.csv`;
      const filepath = path.join(os.tmpdir(), filename);
      
      return new Promise((resolve, reject) => {
        const writeStream = createWriteStream(filepath);
        const csvStream = formatCSV({ headers: true });
        
        csvStream.pipe(writeStream);
        
        result.rows.forEach(row => {
          csvStream.write(row);
        });
        
        csvStream.end();
        
        writeStream.on('finish', () => {
          resolve(filepath);
        });
        
        writeStream.on('error', reject);
      });
      
    } catch (error) {
      console.error('Error exporting batch summary to CSV:', error);
      throw error;
    }
  }

  async exportAllDataForDateToCSV(targetDate: string): Promise<{ filePaths: string[]; zipPath: string }> {
    try {
      const filePaths: string[] = [];
      
      // Export transactions for the date
      const transactionsFile = await this.exportTransactionsToCSV(undefined, targetDate, targetDate);
      filePaths.push(transactionsFile);
      
      // Export merchants for the date
      const merchantsFile = await this.exportMerchantsToCSV(targetDate, targetDate);
      filePaths.push(merchantsFile);
      
      // Export batch summary for the date
      const batchSummaryFile = await this.exportBatchSummaryToCSV(targetDate);
      filePaths.push(batchSummaryFile);
      
      // Create ZIP file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const zipFilename = `all_data_${targetDate}_${timestamp}.zip`;
      const zipPath = path.join(os.tmpdir(), zipFilename);
      
      return new Promise((resolve, reject) => {
        const output = createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', () => {
          console.log(`Archive created: ${zipPath} (${archive.pointer()} total bytes)`);
          resolve({ filePaths, zipPath });
        });
        
        archive.on('error', (err) => {
          reject(err);
        });
        
        archive.pipe(output);
        
        // Add files to archive
        archive.file(transactionsFile, { name: `transactions_${targetDate}.csv` });
        archive.file(merchantsFile, { name: `merchants_${targetDate}.csv` });
        archive.file(batchSummaryFile, { name: `batch_summary_${targetDate}.csv` });
        
        archive.finalize();
      });
      
    } catch (error) {
      console.error('Error exporting all data to CSV:', error);
      throw error;
    }
  }

}

// Default to database storage
let storage: IStorage = new DatabaseStorage();

/**
 * Set a different storage implementation (used for fallback when database is unavailable)
 * @param newStorage The new storage implementation to use
 */
// Track if we're using the fallback storage
export let isFallbackStorage = false;

export function setStorageImplementation(newStorage: IStorage) {
  storage = newStorage;
  
  // Set the flag when using fallback storage
  isFallbackStorage = newStorage.constructor.name === 'MemStorageFallback';
}

export { storage };