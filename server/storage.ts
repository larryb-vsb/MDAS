import { createReadStream, createWriteStream, promises as fsPromises, existsSync, writeFileSync, mkdirSync } from "fs";
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
  auditLogs,
  systemLogs,
  securityLogs,
  Merchant,
  Transaction,
  InsertMerchant,
  InsertTransaction,
  InsertUploadedFile,
  User,
  InsertUser,
  AuditLog,
  InsertAuditLog,
  SystemLog,
  InsertSystemLog,
  SecurityLog,
  InsertSecurityLog
} from "@shared/schema";
import { db } from "./db";
import { eq, gt, gte, lt, lte, and, or, count, desc, sql, between, like, ilike, isNotNull } from "drizzle-orm";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";

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
  
  // Log operations
  getSystemLogs(params: any): Promise<any>;
  getSecurityLogs(params: any): Promise<any>;
  formatLogsToCSV(logs: any[]): string;
  
  // Session store for authentication
  sessionStore: session.Store;

  // Merchant operations
  getMerchants(page: number, limit: number, status?: string, lastUpload?: string, search?: string): Promise<{
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
  
  // System error logging
  logSystemError(
    errorMessage: string, 
    errorDetails?: any, 
    source?: string, 
    username?: string
  ): Promise<AuditLog>;
}

// Database storage implementation
export class DatabaseStorage implements IStorage {
  private lastMerchantId: number;
  sessionStore: session.Store;
  
  constructor() {
    this.lastMerchantId = 1000;
    // Initialize PostgreSQL session store
    const PostgresStore = connectPgSimple(session);
    this.sessionStore = new PostgresStore({
      pool,
      createTableIfMissing: true
    });
    
    // Initialize with some demo data if database is empty
    this.checkAndInitializeData();
  }
  
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user || undefined;
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    console.log(`[DEBUG storage] Looking up user by username: ${username}`);
    try {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
      if (user) {
        console.log(`[DEBUG storage] Found user: ${JSON.stringify({
          id: user.id,
          username: user.username,
          role: user.role,
          passwordLength: user.password?.length || 0
        })}`);
      } else {
        console.log(`[DEBUG storage] User not found: ${username}`);
      }
      return user || undefined;
    } catch (error) {
      console.error(`[DEBUG storage] Error looking up user:`, error);
      return undefined;
    }
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(usersTable).values(insertUser).returning();
    return user;
  }
  
  async updateUserLastLogin(userId: number): Promise<void> {
    await db.update(usersTable)
      .set({ lastLogin: new Date() })
      .where(eq(usersTable.id, userId));
  }
  
  // Additional user management methods
  async getUsers(): Promise<User[]> {
    return await db.select().from(usersTable).orderBy(usersTable.username);
  }
  
  async updateUser(userId: number, userData: Partial<Omit<InsertUser, 'password'>>): Promise<User> {
    const [updatedUser] = await db
      .update(usersTable)
      .set({
        ...userData,
        // If role is not provided, keep the existing one
        role: userData.role || undefined
      })
      .where(eq(usersTable.id, userId))
      .returning();
    
    return updatedUser;
  }
  
  async updateUserPassword(userId: number, newPassword: string): Promise<void> {
    const hashedPassword = await this.hashPassword(newPassword);
    
    await db
      .update(usersTable)
      .set({ password: hashedPassword })
      .where(eq(usersTable.id, userId));
  }
  
  async deleteUser(userId: number): Promise<void> {
    await db
      .delete(usersTable)
      .where(eq(usersTable.id, userId));
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
  
  // Check if we need to initialize data
  private async checkAndInitializeData() {
    try {
      // Check if merchants table is empty
      const merchantCount = await db.select({ count: count() }).from(merchantsTable);
      
      // Check if any users exist
      const userCount = await db.select({ count: count() }).from(usersTable);
      
      if (parseInt(merchantCount[0].count.toString(), 10) === 0) {
        console.log("Database is empty, initializing with sample data...");
        await this.initializeData();
      }
      
      // Create default admin user if no users exist
      if (parseInt(userCount[0].count.toString(), 10) === 0) {
        console.log("No users found, creating default admin user...");
        
        // Create a hashed password for the admin user (password: "admin123")
        // Using a pre-generated bcrypt hash for "admin123" to avoid ESM/require issues
        const hashedPassword = "$2b$10$i2crE7gf8xhy0CDddFI6Y.U608XawvKYQ7FyDuGFJR/pM/lDNTTJe";
        
        await db.insert(usersTable).values({
          username: "admin",
          password: hashedPassword,
          firstName: "System",
          lastName: "Administrator",
          email: "admin@example.com",
          role: "admin",
          createdAt: new Date()
        });
        
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
          name: "City Supermarket",
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
          name: "Fresh Foods Market",
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
          name: "Tech Corner",
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
          name: "Fashion Corner",
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
          name: "Health & Care",
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
      
      // Insert merchants into database
      for (const merchant of demoMerchants) {
        await db.insert(merchantsTable).values(merchant);
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
        
        await db.insert(transactionsTable).values(transaction);
      }
    } catch (error) {
      console.error("Error initializing data:", error);
    }
  }

  // Get merchants with pagination and filtering
  async getMerchants(
    page: number = 1, 
    limit: number = 10, 
    status: string = "All", 
    lastUpload: string = "Any time",
    search: string = ""
  ): Promise<{
    merchants: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    try {
      // Create a base query
      let query = db.select().from(merchantsTable);
      let countQuery = db.select({ count: count() }).from(merchantsTable);
      
      // Build conditions array for WHERE clause
      const conditions = [];
      
      // Apply status filter
      if (status !== "All") {
        conditions.push(eq(merchantsTable.status, status));
      }
      
      // Apply last upload filter
      if (lastUpload !== "Any time") {
        const now = new Date();
        let cutoffDate: Date;
        
        switch(lastUpload) {
          case "Last 24 hours":
            cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            conditions.push(gte(merchantsTable.lastUploadDate, cutoffDate));
            break;
          case "Last 7 days":
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            conditions.push(gte(merchantsTable.lastUploadDate, cutoffDate));
            break;
          case "Last 30 days":
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            conditions.push(gte(merchantsTable.lastUploadDate, cutoffDate));
            break;
          case "Never":
            conditions.push(sql`${merchantsTable.lastUploadDate} IS NULL`);
            break;
        }
      }
      
      // Apply search filter (search by name or ID/MID)
      if (search && search.trim() !== "") {
        const searchTerm = `%${search.trim()}%`;
        // Build individual search conditions using case-insensitive search
        const nameCondition = ilike(merchantsTable.name, searchTerm);
        const idCondition = ilike(merchantsTable.id, searchTerm);
        const midCondition = ilike(merchantsTable.clientMID, searchTerm);
        
        conditions.push(or(nameCondition, idCondition, midCondition));
      }
      
      // Apply all conditions to both queries
      if (conditions.length > 0) {
        const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
        query = query.where(whereClause);
        countQuery = countQuery.where(whereClause);
      }
      
      // Get total count for pagination (with filters applied)
      const countResult = await countQuery;
      const totalItems = parseInt(countResult[0].count.toString(), 10);
      const totalPages = Math.ceil(totalItems / limit);
      const offset = (page - 1) * limit;
      
      // Apply pagination
      query = query.limit(limit).offset(offset);
      
      // Execute query
      const merchants = await query;
      
      // Calculate stats for each merchant and format lastUploadDate
      const merchantsWithStats = await Promise.all(merchants.map(async (merchant) => {
        const stats = await this.getMerchantStats(merchant.id);
        
        // Format last upload date
        let lastUpload = "Never";
        if (merchant.lastUploadDate) {
          const lastUploadDate = new Date(merchant.lastUploadDate);
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
          dailyStats: stats.daily,
          monthlyStats: stats.monthly
        };
      }));
      
      return {
        merchants: merchantsWithStats,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error("Error fetching merchants:", error);
      return {
        merchants: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          itemsPerPage: limit
        }
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
  }> {
    try {
      // Get merchant details
      const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
      
      if (!merchant) {
        throw new Error(`Merchant with ID ${merchantId} not found`);
      }
      
      // Get merchant transactions
      const transactions = await db.select()
        .from(transactionsTable)
        .where(eq(transactionsTable.merchantId, merchantId))
        .orderBy(desc(transactionsTable.date))
        .limit(100);
      
      // Get merchant stats
      const stats = await this.getMerchantStats(merchantId);
      
      // Generate transaction history by month for the last 12 months
      const transactionHistory = await this.getTransactionHistoryByMonth(merchantId, 12);
      
      console.log("Transaction history for charts:", JSON.stringify(transactionHistory));
      
      // Format transactions for display
      const formattedTransactions = transactions.map(t => ({
        transactionId: t.id,
        merchantId: t.merchantId,
        amount: parseFloat(t.amount.toString()),
        date: t.date.toISOString(),
        type: t.type
      }));
      
      return {
        merchant: {
          id: merchant.id,
          name: merchant.name,
          clientMID: merchant.clientMID || null,
          otherClientNumber1: merchant.otherClientNumber1 || null,
          otherClientNumber2: merchant.otherClientNumber2 || null,
          clientSinceDate: merchant.clientSinceDate ? merchant.clientSinceDate.toISOString() : null,
          status: merchant.status,
          merchantType: merchant.merchantType || 'none',
          salesChannel: merchant.salesChannel || null,
          address: merchant.address || '',
          city: merchant.city || '',
          state: merchant.state || '',
          zipCode: merchant.zipCode || '',
          country: merchant.country || null,
          category: merchant.category || '',
          editDate: merchant.editDate ? merchant.editDate.toISOString() : null
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
      // Generate a unique merchant ID if not provided
      if (!merchantData.id) {
        merchantData.id = `M${++this.lastMerchantId}`;
      }
      
      // Set default values if not provided
      if (!merchantData.status) {
        merchantData.status = "Pending";
      }
      
      if (!merchantData.createdAt) {
        merchantData.createdAt = new Date();
      }
      
      // Insert the merchant into the database
      const [newMerchant] = await db.insert(merchantsTable)
        .values(merchantData)
        .returning();
      
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
  
  // Update merchant details with audit logging
  async updateMerchant(merchantId: string, merchantData: Partial<InsertMerchant>): Promise<any> {
    try {
      // Check if merchant exists and get original values
      const [existingMerchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
      
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
        // Update merchant
        await db.update(merchantsTable)
          .set(merchantData)
          .where(eq(merchantsTable.id, merchantId));
        
        // Get updated merchant
        const [updatedMerchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
        
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
  
  // Delete multiple merchants with audit logging
  async deleteMerchants(merchantIds: string[], username: string = 'System'): Promise<void> {
    try {
      // Delete related transactions first to maintain referential integrity
      for (const merchantId of merchantIds) {
        // Get merchant data before deletion for audit log
        const [existingMerchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
        
        if (existingMerchant) {
          // Get transaction count for this merchant
          const [{ count: transactionCount }] = await db
            .select({ count: count() })
            .from(transactionsTable)
            .where(eq(transactionsTable.merchantId, merchantId));
          
          // Delete transactions associated with this merchant
          await db.delete(transactionsTable)
            .where(eq(transactionsTable.merchantId, merchantId));
          
          // Delete the merchant
          await db.delete(merchantsTable)
            .where(eq(merchantsTable.id, merchantId));
          
          // Create audit log entry
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
          
          // Create the audit log entry
          await this.createAuditLog(auditLogData);
        }
      }
      
      console.log(`Successfully deleted ${merchantIds.length} merchants and their transactions`);
    } catch (error) {
      console.error('Error deleting merchants:', error);
      throw error;
    }
  }
  
  // Add a new transaction for a merchant with audit logging
  async addTransaction(merchantId: string, transactionData: { amount: string, type: string, date: string }, username: string = 'System'): Promise<any> {
    try {
      // Check if the merchant exists
      const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
      
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
      
      // Insert the transaction
      const [insertedTransaction] = await db.insert(transactionsTable)
        .values(transaction)
        .returning();
      
      // Update the merchant's lastUploadDate
      await db.update(merchantsTable)
        .set({ lastUploadDate: new Date() })
        .where(eq(merchantsTable.id, merchantId));
      
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
  
  // Get transactions with pagination and filtering
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
    try {
      // Create base query
      let query = db.select({
        transaction: transactionsTable,
        merchantName: merchantsTable.name
      })
      .from(transactionsTable)
      .leftJoin(merchantsTable, eq(transactionsTable.merchantId, merchantsTable.id));
      
      // Build filter conditions
      const conditions = [];
      
      if (merchantId) {
        conditions.push(eq(transactionsTable.merchantId, merchantId));
      }
      
      if (startDate) {
        const startDateObj = new Date(startDate);
        conditions.push(gte(transactionsTable.date, startDateObj));
      }
      
      if (endDate) {
        const endDateObj = new Date(endDate);
        // Set time to end of day
        endDateObj.setHours(23, 59, 59, 999);
        conditions.push(sql`${transactionsTable.date} <= ${endDateObj}`);
      }
      
      if (type) {
        conditions.push(eq(transactionsTable.type, type));
      }
      
      if (transactionId) {
        conditions.push(ilike(transactionsTable.id, `%${transactionId}%`));
      }
      
      // Apply conditions to query
      if (conditions.length > 0) {
        const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
        query = query.where(whereClause);
      }
      
      // Get total count for pagination with same filters
      let countQuery = db.select({ count: count() })
        .from(transactionsTable)
        .leftJoin(merchantsTable, eq(transactionsTable.merchantId, merchantsTable.id));
      
      // Apply the same conditions to count query
      if (conditions.length > 0) {
        const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
        countQuery = countQuery.where(whereClause);
      }
      
      const countResult = await countQuery;
      const totalItems = parseInt(countResult[0].count.toString(), 10);
      const totalPages = Math.ceil(totalItems / limit);
      const offset = (page - 1) * limit;
      
      // Apply pagination and ordering
      query = query
        .orderBy(desc(transactionsTable.date))
        .limit(limit)
        .offset(offset);
      
      // Execute query
      const results = await query;
      
      // Format results
      const transactions = results.map(result => {
        const { transaction, merchantName } = result;
        return {
          id: transaction.id, // Keep id for backward compatibility
          transactionId: transaction.id, // Add transactionId to match getMerchantById format
          merchantId: transaction.merchantId,
          merchantName: merchantName,
          amount: parseFloat(transaction.amount.toString()),
          date: transaction.date.toISOString(),
          type: transaction.type,
          // Additional fields for CSV export
          sequenceNumber: transaction.id.replace('T', ''),
          accountNumber: transaction.merchantId,
          netAmount: parseFloat(transaction.amount.toString()),
          category: transaction.type === "Credit" ? "Income" : (transaction.type === "Debit" ? "Expense" : "Sale"),
          postDate: transaction.date.toISOString().split('T')[0]
        };
      });
      
      return {
        transactions,
        pagination: {
          currentPage: page,
          totalPages,
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

  // Export transactions to CSV
  async exportTransactionsToCSV(
    merchantId?: string,
    startDate?: string,
    endDate?: string,
    type?: string,
    transactionId?: string
  ): Promise<string> {
    try {
      // Get all transactions matching the filters (without pagination)
      let query = db.select({
        transaction: transactionsTable,
        merchantName: merchantsTable.name
      })
      .from(transactionsTable)
      .leftJoin(merchantsTable, eq(transactionsTable.merchantId, merchantsTable.id))
      .orderBy(desc(transactionsTable.date));
      
      // Build filter conditions
      const conditions = [];
      
      if (merchantId) {
        conditions.push(eq(transactionsTable.merchantId, merchantId));
      }
      
      if (startDate) {
        const startDateObj = new Date(startDate);
        conditions.push(gte(transactionsTable.date, startDateObj));
      }
      
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        conditions.push(sql`${transactionsTable.date} <= ${endDateObj}`);
      }
      
      if (type) {
        conditions.push(eq(transactionsTable.type, type));
      }
      
      if (transactionId) {
        conditions.push(ilike(transactionsTable.id, `%${transactionId}%`));
      }
      
      // Apply conditions to query
      if (conditions.length > 0) {
        const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
        query = query.where(whereClause);
      }
      
      const results = await query;
      
      // Format results for CSV
      const csvData = results.map(result => {
        const { transaction, merchantName } = result;
        const dateObj = new Date(transaction.date);
        const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
        const tranType = transaction.type === "Credit" ? "C" : (transaction.type === "Debit" ? "D" : transaction.type.charAt(0).toUpperCase());
        
        return {
          'TranSeqN': transaction.id.replace('T', ''),
          'TranAccou': transaction.merchantId,
          'TranDate': formattedDate,
          'TranType': tranType,
          'TranAmou': parseFloat(transaction.amount.toString()).toFixed(2),
          'NetTranAr': parseFloat(transaction.amount.toString()).toFixed(2),
          'TranCategory': transaction.type === "Credit" ? "ACH-PURCH" : (transaction.type === "Debit" ? "ACH-PURCH" : "ACH-PURCH"),
          'TranPostD': formattedDate,
          'TranTraile': merchantName || 'MICHIGAN ASPIRE III LL',
          'TranTraile1': '',
          'TranTraile2': '',
          'TranTraile3': '',
          'TranTraile4': '',
          'TranTraile5': ''
        };
      });
      
      // Generate a temp file path
      const tempFilePath = path.join(os.tmpdir(), `transactions_export_${Date.now()}.csv`);
      
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
      console.error('Error exporting transactions to CSV:', error);
      throw new Error('Failed to export transactions to CSV');
    }
  }

  // Export batch summary to CSV - groups transactions by ClientMID for a given day
  async exportBatchSummaryToCSV(
    targetDate: string
  ): Promise<string> {
    try {
      // Parse the target date and set to beginning and end of day
      const startDate = new Date(targetDate);
      startDate.setUTCHours(0, 0, 0, 0);
      
      const endDate = new Date(targetDate);
      endDate.setUTCHours(23, 59, 59, 999);
      
      // Get all transactions for the specified date using the same pattern as exportTransactionsToCSV
      let query = db.select({
        transaction: transactionsTable,
        merchant: merchantsTable
      })
      .from(transactionsTable)
      .leftJoin(merchantsTable, eq(transactionsTable.merchantId, merchantsTable.id));
      
      // Build filter conditions for the specific date
      const conditions = [
        gte(transactionsTable.date, startDate),
        sql`${transactionsTable.date} <= ${endDate}`
      ];
      
      query = query.where(and(...conditions));
      
      const results = await query;
      
      // Group transactions by ClientMID
      const summaryMap = new Map();
      
      results.forEach(record => {
        const transaction = record.transaction;
        const merchant = record.merchant;
        const clientMidKey = merchant?.clientMid || transaction.merchantId; // Use merchantId as fallback
        
        if (!summaryMap.has(clientMidKey)) {
          summaryMap.set(clientMidKey, {
            clientMid: clientMidKey,
            transactionCount: 0,
            dailyTotal: 0,
            feeTotal: 0,
            feesWithh: 0
          });
        }
        
        const summary = summaryMap.get(clientMidKey);
        summary.transactionCount += 1;
        summary.dailyTotal += parseFloat(transaction.amount.toString());
      });
      
      // Convert map to array and format for CSV
      const csvData = Array.from(summaryMap.values()).map(summary => {
        // Use the target date for AsOfDate
        const dateObj = new Date(targetDate);
        const asOfDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
        
        return {
          'ClientMid': summary.clientMid,
          'AsOfDate': asOfDate,
          'BatchNum': '', // Empty as shown in image
          'TranCoun': summary.transactionCount,
          'DailyTotal': summary.dailyTotal.toFixed(2),
          'FeeTotal': summary.feeTotal.toFixed(2),
          'FeesWithh': summary.feesWithh.toFixed(2)
        };
      });
      
      // Generate a temp file path
      const tempFilePath = path.join(os.tmpdir(), `batch_summary_export_${Date.now()}.csv`);
      
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
      console.error('Error exporting batch summary to CSV:', error);
      throw new Error('Failed to export batch summary to CSV');
    }
  }

  // Export merchants to CSV
  async exportMerchantsToCSV(
    startDate?: string,
    endDate?: string
  ): Promise<string> {
    try {
      // Get all merchants matching the filters
      let query = db.select().from(merchantsTable).orderBy(merchantsTable.name);
      
      // Build filter conditions if date range is provided
      const conditions = [];
      
      if (startDate) {
        const startDateObj = new Date(startDate);
        conditions.push(gte(merchantsTable.createdAt, startDateObj));
      }
      
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        conditions.push(sql`${merchantsTable.createdAt} <= ${endDateObj}`);
      }
      
      // Apply conditions to query
      if (conditions.length > 0) {
        const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
        query = query.where(whereClause);
      }
      
      const results = await query;
      
      // Format results for CSV - matching the format from the provided image
      const csvData = results.map(merchant => {
        // Use the export date or asOfDate for AsOfDate field
        const asOfDate = endDate || startDate || new Date().toISOString().split('T')[0];
        const formattedAsOfDate = new Date(asOfDate).toLocaleDateString('en-US');
        
        return {
          'AsOfDate': formattedAsOfDate,
          'ClientNum': merchant.otherClientNumber1 || '',
          'ClientLega': merchant.name || '',
          'ClientMID': merchant.clientMID || merchant.id,
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

  // Export all data types for a specific date as a ZIP file
  async exportAllDataForDateToCSV(
    targetDate: string
  ): Promise<{ filePaths: string[]; zipPath: string }> {
    try {
      console.log(`Creating ZIP export with all data types for date: ${targetDate}`);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dateForFileName = targetDate.replace(/[/]/g, '-');
      
      const tempDir = path.join(process.cwd(), 'tmp_exports');
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }
      
      // Generate all three export types (these return file paths)
      const merchantsFilePath = await this.exportAllMerchantsForDateToCSV(targetDate);
      const transactionsFilePath = await this.exportTransactionsToCSV(undefined, targetDate, targetDate);
      const batchSummaryFilePath = await this.exportBatchSummaryToCSV(targetDate);
      
      // Read the content from the generated files
      const merchantsContent = await fsPromises.readFile(merchantsFilePath, 'utf8');
      const transactionsContent = await fsPromises.readFile(transactionsFilePath, 'utf8');
      const batchSummaryContent = await fsPromises.readFile(batchSummaryFilePath, 'utf8');
      
      // Create individual CSV files for the ZIP
      const merchantsFile = path.join(tempDir, `merchants_${dateForFileName}_${timestamp}.csv`);
      const transactionsFile = path.join(tempDir, `transactions_${dateForFileName}_${timestamp}.csv`);
      const batchSummaryFile = path.join(tempDir, `batch_summary_${dateForFileName}_${timestamp}.csv`);
      
      writeFileSync(merchantsFile, merchantsContent);
      writeFileSync(transactionsFile, transactionsContent);
      writeFileSync(batchSummaryFile, batchSummaryContent);
      
      // Clean up the temporary source files
      try {
        await fsPromises.unlink(merchantsFilePath);
        await fsPromises.unlink(transactionsFilePath);
        await fsPromises.unlink(batchSummaryFilePath);
      } catch (cleanupError) {
        console.warn('Warning: Could not clean up source export files:', cleanupError);
      }
      
      // Create ZIP file
      const zipFileName = `all_exports_${dateForFileName}_${timestamp}.zip`;
      const zipFilePath = path.join(tempDir, zipFileName);
      
      return new Promise((resolve, reject) => {
        const output = createWriteStream(zipFilePath);
        const archive = archiver('zip', {
          zlib: { level: 9 }
        });
        
        output.on('close', () => {
          console.log(`ZIP export created successfully: ${zipFilePath} (${archive.pointer()} total bytes)`);
          // Clean up individual CSV files
          try {
            fsPromises.unlink(merchantsFile);
            fsPromises.unlink(transactionsFile);
            fsPromises.unlink(batchSummaryFile);
          } catch (cleanupError) {
            console.warn('Warning: Could not clean up temporary CSV files:', cleanupError);
          }
          resolve({
            filePaths: [`merchants_${targetDate}.csv`, `transactions_${targetDate}.csv`, `batch_summary_${targetDate}.csv`],
            zipPath: zipFilePath
          });
        });
        
        output.on('error', (err) => {
          console.error('Error creating ZIP file:', err);
          reject(err);
        });
        
        archive.on('error', (err) => {
          console.error('Archive error:', err);
          reject(err);
        });
        
        archive.pipe(output);
        
        // Add files to the archive with meaningful names
        archive.file(merchantsFile, { name: `merchants_${targetDate}.csv` });
        archive.file(transactionsFile, { name: `transactions_${targetDate}.csv` });
        archive.file(batchSummaryFile, { name: `batch_summary_${targetDate}.csv` });
        
        archive.finalize();
      });
      
    } catch (error) {
      console.error('Error creating ZIP export:', error);
      throw new Error(`Failed to create ZIP export: ${error.message}`);
    }
  }

  async exportAllMerchantsForDateToCSV(
    targetDate: string
  ): Promise<string> {
    try {
      // Get all merchants (no date filtering - we want all merchants as of the target date)
      const query = db.select().from(merchantsTable).orderBy(merchantsTable.name);
      const results = await query;
      
      // Format results for CSV with the target date as AsOfDate
      const formattedAsOfDate = new Date(targetDate).toLocaleDateString('en-US');
      
      const csvData = results.map(merchant => ({
        'AsOfDate': formattedAsOfDate,
        'ClientNum': merchant.otherClientNumber1 || '',
        'ClientLega': merchant.name || '',
        'ClientMID': merchant.clientMID || merchant.id,
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
  
  // Delete multiple transactions
  async deleteTransactions(transactionIds: string[], username: string = 'System'): Promise<void> {
    try {
      if (transactionIds.length === 0) {
        return;
      }
      
      // Get transaction data before deletion for audit logs
      const transactionsToDelete = await db.select({
        transaction: transactionsTable,
        merchantName: merchantsTable.name
      })
      .from(transactionsTable)
      .leftJoin(merchantsTable, eq(transactionsTable.merchantId, merchantsTable.id))
      .where(or(...transactionIds.map(id => eq(transactionsTable.id, id))));
      
      // Create audit logs for each transaction before deleting them
      for (const result of transactionsToDelete) {
        const { transaction, merchantName } = result;
        
        // Prepare audit log data
        const auditLogData: InsertAuditLog = {
          entityType: 'transaction',
          entityId: transaction.id,
          action: 'delete',
          userId: null,
          username: username,
          oldValues: {
            id: transaction.id,
            merchantId: transaction.merchantId,
            merchantName: merchantName,
            amount: transaction.amount,
            date: transaction.date.toISOString(),
            type: transaction.type
          },
          newValues: null, // No new values for deletion
          changedFields: [],
          notes: `Deleted ${transaction.type} transaction of ${transaction.amount} for merchant: ${merchantName || transaction.merchantId}`
        };
        
        // Create audit log entry
        await this.createAuditLog(auditLogData);
      }
      
      // Delete the transactions
      await db.delete(transactionsTable).where(
        or(...transactionIds.map(id => eq(transactionsTable.id, id)))
      );
      
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
      // Fetch all transactions for this merchant to analyze available dates
      const allMerchantTransactions = await db.select()
        .from(transactionsTable)
        .where(eq(transactionsTable.merchantId, merchantId));
        
      console.log(`Found ${allMerchantTransactions.length} total transactions for merchant ${merchantId}`);
      
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
        
        // Get transactions for this month
        const monthTransactions = await db.select()
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.merchantId, merchantId),
            between(transactionsTable.date, month, nextMonth)
          ));
        
        console.log(`Found ${monthTransactions.length} transactions in ${month.toLocaleString('default', { month: 'short' })} ${month.getFullYear()} for merchant ${merchantId}`);
        
        // Calculate revenue
        const revenue = monthTransactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount.toString());
          // Credit means money into the account (positive)
          // Debit means money out of the account (negative)
          if (tx.type === "Credit") {
            return sum + amount;
          } else if (tx.type === "Debit") {
            return sum - amount;
          }
          // For other types like "Sale", continue using previous logic
          return sum + (tx.type === "Sale" ? amount : -amount);
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
      // Get all transactions for this merchant
      const allTransactions = await db.select()
        .from(transactionsTable)
        .where(eq(transactionsTable.merchantId, merchantId));
        
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
        // Credit means money into the account (positive)
        // Debit means money out of the account (negative)
        if (tx.type === "Credit") {
          return sum + amount;
        } else if (tx.type === "Debit") {
          return sum - amount;
        }
        // For other types like "Sale", continue using previous logic
        return sum + (tx.type === "Sale" ? amount : -amount);
      }, 0);
      
      // Get monthly transactions (from last 30 days of the latest date)
      const monthlyTransactions = allTransactions.filter(tx => {
        const txDate = new Date(tx.date);
        return txDate >= oneMonthAgo && txDate <= today;
      });
        
      // Calculate monthly revenue
      const monthlyRevenue = monthlyTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        // Credit means money into the account (positive)
        // Debit means money out of the account (negative)
        if (tx.type === "Credit") {
          return sum + amount;
        } else if (tx.type === "Debit") {
          return sum - amount;
        }
        // For other types like "Sale", continue using previous logic
        return sum + (tx.type === "Sale" ? amount : -amount);
      }, 0);
      
      console.log(`Found ${monthlyTransactions.length} monthly transactions and ${dailyTransactions.length} daily transactions`);
        
      // If no transactions in the 30-day window, use all transactions with a fair distribution
      if (monthlyTransactions.length === 0 && allTransactions.length > 0) {
        // Calculate all-time revenue
        const allTimeRevenue = allTransactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount.toString());
          // Credit means money into the account (positive)
          // Debit means money out of the account (negative)
          if (tx.type === "Credit") {
            return sum + amount;
          } else if (tx.type === "Debit") {
            return sum - amount;
          }
          // For other types like "Sale", continue using previous logic
          return sum + (tx.type === "Sale" ? amount : -amount);
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
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      // Time periods for comparisons
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
      
      // Get total merchants count
      const merchantCount = await db.select({ count: count() }).from(merchantsTable);
      const totalMerchants = parseInt(merchantCount[0].count.toString(), 10);
      
      // Count active merchants (merchants with status 'Active')
      const activeMerchantsResult = await db.select({ count: count() })
        .from(merchantsTable)
        .where(eq(merchantsTable.status, 'Active'));
      const activeMerchants = parseInt(activeMerchantsResult[0].count.toString(), 10);
      
      // Calculate active rate (percentage of merchants that are active)
      const activeRate = totalMerchants > 0 ? (activeMerchants / totalMerchants) * 100 : 0;
      
      // Get new merchants in the last 30 days
      const newMerchantsResult = await db.select({ count: count() })
        .from(merchantsTable)
        .where(gte(merchantsTable.createdAt, oneMonthAgo));
      const newMerchants = parseInt(newMerchantsResult[0].count.toString(), 10);
      
      // Get daily transaction count
      const dailyTransactionsResult = await db.select({ count: count() })
        .from(transactionsTable)
        .where(gte(transactionsTable.date, today));
      const dailyTransactions = parseInt(dailyTransactionsResult[0].count.toString(), 10);
      
      // Get monthly transactions (current month)
      const monthlyTransactions = await db.select()
        .from(transactionsTable)
        .where(gte(transactionsTable.date, oneMonthAgo));
      
      // Get previous month transactions
      const prevMonthTransactions = await db.select()
        .from(transactionsTable)
        .where(
          and(
            gte(transactionsTable.date, twoMonthsAgo),
            lt(transactionsTable.date, oneMonthAgo)
          )
        );
        
      // Calculate monthly revenue (current month)
      const monthlyRevenue = monthlyTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        // For Credit/Debit types, use the amount directly
        if (tx.type === "Credit" || tx.type === "Debit") {
          return sum + (tx.type === "Credit" ? amount : 0); // Only count Credit transactions as revenue
        }
        // For other types like "Sale", continue using previous logic
        return sum + (tx.type === "Sale" ? amount : 0);
      }, 0);
      
      // Calculate previous month revenue
      const prevMonthlyRevenue = prevMonthTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        if (tx.type === "Credit" || tx.type === "Debit") {
          return sum + (tx.type === "Credit" ? amount : 0);
        }
        return sum + (tx.type === "Sale" ? amount : 0);
      }, 0);
      
      // Calculate growth rates
      const transactionGrowth = prevMonthTransactions.length > 0 
        ? ((monthlyTransactions.length - prevMonthTransactions.length) / prevMonthTransactions.length) * 100 
        : 0;
        
      const revenueGrowth = prevMonthlyRevenue > 0 
        ? ((monthlyRevenue - prevMonthlyRevenue) / prevMonthlyRevenue) * 100 
        : 0;
      
      // Calculate average transaction value
      const avgTransactionValue = monthlyTransactions.length > 0 
        ? monthlyRevenue / monthlyTransactions.length 
        : 0;
      
      // Get total transactions (all time)
      const totalTransactionsResult = await db.select({ count: count() }).from(transactionsTable);
      const totalTransactions = parseInt(totalTransactionsResult[0].count.toString(), 10);
      
      // Calculate total revenue (all time)
      const allTransactions = await db.select().from(transactionsTable);
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
        monthlyRevenue: Number(monthlyRevenue.toFixed(2)),
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
      
      // Store file info in database
      await db.insert(uploadedFilesTable).values({
        id: fileId,
        originalFilename,
        storagePath: filePath,
        fileType: type,
        uploadedAt: new Date(),
        processed: false
      });
      
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
          // Get the individual file information
          const fileResults = await db.select()
            .from(uploadedFilesTable)
            .where(eq(uploadedFilesTable.id, fileId));
          
          if (fileResults.length === 0) {
            console.warn(`File with ID ${fileId} not found`);
            continue;
          }
          
          const file = fileResults[0];
          console.log(`Processing file: ID=${file.id}, Type=${file.fileType}, Name=${file.originalFilename}`);
          
          // Process based on file type
          if (file.fileType === 'merchant') {
            try {
              await this.processMerchantFile(file.storagePath);
              
              // Mark as successfully processed
              await db.update(uploadedFilesTable)
                .set({ 
                  processed: true,
                  processingErrors: null 
                })
                .where(eq(uploadedFilesTable.id, file.id));
                
              console.log(`Merchant file ${file.id} successfully processed`);
            } catch (error) {
              console.error(`Error processing merchant file ${file.id}:`, error);
              
              // Mark with error
              await db.update(uploadedFilesTable)
                .set({ 
                  processed: true, 
                  processingErrors: error instanceof Error ? error.message : "Unknown error during processing" 
                })
                .where(eq(uploadedFilesTable.id, file.id));
            }
          } else if (file.fileType === 'transaction') {
            try {
              await this.processTransactionFile(file.storagePath);
              
              // Mark as successfully processed
              await db.update(uploadedFilesTable)
                .set({ 
                  processed: true,
                  processingErrors: null 
                })
                .where(eq(uploadedFilesTable.id, file.id));
                
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
              
              // Mark with error
              await db.update(uploadedFilesTable)
                .set({ 
                  processed: true, 
                  processingErrors: errorMessage
                })
                .where(eq(uploadedFilesTable.id, file.id));
            }
          } else {
            console.warn(`Unknown file type: ${file.fileType} for file ID ${file.id}`);
            
            // Mark with error for unknown type
            await db.update(uploadedFilesTable)
                .set({ 
                  processed: true, 
                  processingErrors: `Unknown file type: ${file.fileType}` 
                })
                .where(eq(uploadedFilesTable.id, file.id));
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

  // Process a merchant demographics CSV file
  async processMerchantFile(filePath: string): Promise<void> {
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
            merchantId = `M${++this.lastMerchantId}`;
            console.log(`No merchant ID found in row ${rowCount}, generated: ${merchantId}`);
          } else {
            // Normalize the merchant ID (add prefix if needed)
            merchantId = normalizeMerchantId(merchantId);
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
            // Check if merchant exists
            const existingMerchant = await db.select()
              .from(merchantsTable)
              .where(eq(merchantsTable.id, merchant.id));
              
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
              
              // Always update the edit date to current date/time
              const updateData = {
                name: merchant.name,
                clientMID: merchant.clientMID,
                otherClientNumber1: merchant.otherClientNumber1,
                otherClientNumber2: merchant.otherClientNumber2,
                clientSinceDate: merchant.clientSinceDate,
                status: merchant.status,
                merchantType: merchant.merchantType,
                salesChannel: merchant.salesChannel,
                address: merchant.address,
                city: merchant.city,
                state: merchant.state,
                zipCode: merchant.zipCode,
                country: merchant.country,
                category: merchant.category,
                lastUploadDate: merchant.lastUploadDate,
                asOfDate: merchant.asOfDate,
                editDate: new Date(), // Always update the edit date
                updatedBy: "system" // Set updatedBy to system
              };
              
              console.log(`Update data: ${JSON.stringify(updateData)}`);
              
              await db.update(merchantsTable)
                .set(updateData)
                .where(eq(merchantsTable.id, merchant.id));
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
              
              await db.insert(merchantsTable).values(merchant);
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
          resolve();
        } catch (error) {
          console.error("Error updating merchants in database:", error);
          reject(error);
        }
      });
    });
  }

  // Process a transaction CSV file
  async processTransactionFile(filePath: string): Promise<void> {
    console.log(`Processing transaction file: ${filePath}`);
    
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
      
      const transactions: InsertTransaction[] = [];
      let rowCount = 0;
      let errorCount = 0;
      let sampleRow: any = null;
      let detectedFormat: string = 'default';
      
      // Function to detect file format based on headers
      const detectFileFormat = (row: any): string => {
        // Check for the new format (Name, Account, Amount, Date, Code, Descr)
        if (row.Name !== undefined && 
            row.Account !== undefined && 
            row.Amount !== undefined && 
            row.Date !== undefined && 
            row.Code !== undefined && 
            row.Descr !== undefined) {
          console.log("Detected new transaction format with Name/Account/Code/Descr");
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
          merchantId = normalizeMerchantId(merchantId);
          
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
          if (detectedFormat === 'format1' && row.Name) {
            originalMerchantName = row.Name.trim();
            console.log(`Found merchant name in transaction: ${originalMerchantName}`);
            // Store the merchant name in the transaction object for later use
            (transaction as any).originalMerchantName = originalMerchantName;
          }
          
          // Select the appropriate field mapping based on detected format
          const fieldMappings = detectedFormat === 'format1' 
            ? alternateTransactionMappings.format1
            : transactionFieldMappings;
          
          // Apply field mappings from CSV based on detected format
          for (const [dbField, csvField] of Object.entries(fieldMappings)) {
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
                  // Remove any currency symbols and commas
                  const cleanAmount = row[csvField].toString().replace(/[$,]/g, '');
                  const amount = parseFloat(cleanAmount);
                  
                  if (isNaN(amount)) {
                    console.error(`Invalid amount format in row ${rowCount}: ${row[csvField]}`);
                    transaction[dbField as keyof InsertTransaction] = 0 as any;
                  } else {
                    transaction[dbField as keyof InsertTransaction] = amount as any;
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
          transactions.push(transaction as InsertTransaction);
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
              
              // First get all existing merchant names for more efficient matching
              const allExistingMerchants = await db.select().from(merchantsTable);
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
            // Check if merchant exists by ID
            const existingMerchant = await db.select()
              .from(merchantsTable)
              .where(eq(merchantsTable.id, transaction.merchantId));
              
            // Create placeholder merchant if needed
            if (existingMerchant.length === 0) {
              console.log(`No merchant found with ID: ${transaction.merchantId}, checking for similar merchants...`);
              
              // Get the merchant name from the Name column if available
              const merchantNameFromTransaction = merchantNameMapping.get(transaction.merchantId);
              
              // Try to find a merchant with a similar ID pattern
              const similarMerchants = await db.select()
                .from(merchantsTable)
                .where(like(merchantsTable.id, `${transaction.merchantId.substring(0, 2)}%`))
                .limit(5);
              
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
                
                await db.insert(merchantsTable).values(newMerchant);
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
                
                await db.insert(merchantsTable).values(newMerchant);
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
                
                await db.insert(merchantsTable).values(newMerchant);
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
              
              await db.update(merchantsTable)
                .set({ lastUploadDate: new Date() })
                .where(eq(merchantsTable.id, transaction.merchantId));
            }
            
            // Insert transaction with auto-increment for duplicates
            console.log(`[TRANSACTION] Inserting: ${transaction.id} for merchant ${transaction.merchantId}, amount: ${transaction.amount}`);
            
            let finalTransaction = { ...transaction };
            let insertAttempts = 0;
            let originalId = transaction.id;
            let duplicateInfo: { increments: number; wasSkipped: boolean } | undefined;
            
            while (insertAttempts < 100) { // Prevent infinite loop
              try {
                await db.insert(transactionsTable).values(finalTransaction);
                
                // Update file processor statistics
                const { fileProcessor } = await import("./services/file-processor");
                if (duplicateInfo) {
                  fileProcessor.updateProcessingStats(finalTransaction.id, duplicateInfo);
                } else {
                  fileProcessor.updateProcessingStats(finalTransaction.id);
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
                // Check if it's a duplicate key error
                if (insertError.code === '23505' && insertError.constraint === 'transactions_pkey') {
                  // First, check if the existing transaction has the same date
                  console.log(`[DUPLICATE DETECTED] Transaction ID ${originalId} already exists. Checking date match...`);
                  
                  try {
                    const existingTransaction = await db.select()
                      .from(transactionsTable)
                      .where(eq(transactionsTable.id, originalId))
                      .limit(1);
                    
                    if (existingTransaction.length > 0) {
                      const existing = existingTransaction[0];
                      const existingDate = new Date(existing.date);
                      const newDate = new Date(finalTransaction.date);
                      
                      // Compare dates (only date part, not time)
                      const existingDateStr = existingDate.toISOString().split('T')[0];
                      const newDateStr = newDate.toISOString().split('T')[0];
                      
                      if (existingDateStr === newDateStr) {
                        // Same date - check if we should update values or skip
                        console.log(`[DATE MATCH] Transaction ${originalId} has same date (${existingDateStr}). Checking for updates...`);
                        
                        // Check if amounts are different
                        const existingAmount = parseFloat(existing.amount.toString());
                        const newAmount = parseFloat(finalTransaction.amount.toString());
                        
                        if (Math.abs(existingAmount - newAmount) > 0.01 || existing.type !== finalTransaction.type) {
                          // Values are different, update the existing transaction
                          console.log(`[UPDATE] Updating transaction ${originalId}: Amount ${existingAmount} -> ${newAmount}, Type ${existing.type} -> ${finalTransaction.type}`);
                          
                          await db.update(transactionsTable)
                            .set({
                              amount: finalTransaction.amount,
                              type: finalTransaction.type,
                              merchantId: finalTransaction.merchantId
                            })
                            .where(eq(transactionsTable.id, originalId));
                          
                          console.log(`[UPDATE SUCCESS] Transaction ${originalId} updated successfully`);
                          insertedCount++; // Count as processed
                          insertedTransactionsList.push({
                            id: originalId,
                            merchantId: finalTransaction.merchantId,
                            amount: finalTransaction.amount
                          });
                          break; // Exit the retry loop
                        } else {
                          // Same values, skip this transaction
                          console.log(`[SKIP] Transaction ${originalId} with same date and values already exists. Skipping...`);
                          
                          // Set duplicate info for statistics (skipped)
                          duplicateInfo = { increments: 0, wasSkipped: true };
                          
                          // Update file processor statistics for skipped transaction
                          const { fileProcessor } = await import("./services/file-processor");
                          fileProcessor.updateProcessingStats(originalId, duplicateInfo);
                          
                          break; // Exit the retry loop without counting as inserted
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
          console.log(`Merchants created: ${createdMerchants}`);
          console.log(`Merchants updated: ${updatedMerchants}`);
          
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
          resolve();
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

  // Generate CSV export of all transactions
  async generateTransactionsExport(): Promise<string> {
    try {
      // Get all transactions
      const transactions = await db.select({
        id: transactionsTable.id,
        merchantId: transactionsTable.merchantId,
        amount: transactionsTable.amount,
        date: transactionsTable.date,
        type: transactionsTable.type,
        merchantName: merchantsTable.name
      }).from(transactionsTable)
        .leftJoin(merchantsTable, eq(transactionsTable.merchantId, merchantsTable.id))
        .orderBy(desc(transactionsTable.date));
        
      // Create a temporary file to store the CSV
      const tempFilePath = path.join(os.tmpdir(), `transactions_export_${Date.now()}.csv`);
      const csvFileStream = createWriteStream(tempFilePath);
      
      // Format transactions for CSV
      const formattedTransactions = transactions.map(transaction => ({
        Transaction_ID: transaction.id,
        Merchant_ID: transaction.merchantId,
        Merchant_Name: transaction.merchantName,
        Amount: transaction.amount,
        Date: new Date(transaction.date).toISOString().split("T")[0],
        Type: transaction.type
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
      // Get all merchants
      const merchants = await db.select().from(merchantsTable);
      
      // Create a temporary file to store the CSV
      const tempFilePath = path.join(os.tmpdir(), `merchants_export_${Date.now()}.csv`);
      const csvFileStream = createWriteStream(tempFilePath);
      
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
  
  // Create audit log entry
  async createAuditLog(auditLogData: InsertAuditLog): Promise<AuditLog> {
    try {
      // Insert the audit log and return the inserted record
      const [newAuditLog] = await db.insert(auditLogs)
        .values(auditLogData)
        .returning();
      
      return newAuditLog;
    } catch (error) {
      console.error("Error creating audit log:", error);
      throw new Error("Failed to create audit log entry");
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
        
      // Execute query
      const result = await db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(desc(auditLogs.timestamp))
        .limit(limit)
        .offset(offset);
        
      return result;
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
        
      // Execute count query
      const [{ value: count }] = await db
        .select({ value: count() })
        .from(auditLogs)
        .where(whereClause || sql`1=1`);
      
      return count;
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
        
      // Execute query
      const logs = await db
        .select()
        .from(systemLogs)
        .where(whereClause)
        .orderBy(desc(systemLogs.timestamp))
        .limit(limit)
        .offset(offset);
      
      // Get total count for pagination
      const [{ count }] = await db
        .select({ count: sql`count(*)` })
        .from(systemLogs)
        .where(whereClause);
      
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
  
  // Direct method to get system logs without complex filtering
  async getSystemLogsDirectly(): Promise<any[]> {
    try {
      // Simple direct query to get system logs
      const logs = await db
        .select()
        .from(systemLogs)
        .orderBy(desc(systemLogs.timestamp))
        .limit(20);
      
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
        
      // Execute count query
      const [{ value: count }] = await db
        .select({ value: count() })
        .from(systemLogs)
        .where(whereClause || sql`1=1`);
      
      return count;
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
        
      // Execute query
      const logs = await db
        .select()
        .from(securityLogs)
        .where(whereClause)
        .orderBy(desc(securityLogs.timestamp))
        .limit(limit)
        .offset(offset);
      
      // Get total count for pagination
      const [{ count }] = await db
        .select({ count: sql`count(*)` })
        .from(securityLogs)
        .where(whereClause || sql`1=1`);
      
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
        
      // Execute count query
      const [{ value: count }] = await db
        .select({ value: count() })
        .from(securityLogs)
        .where(whereClause || sql`1=1`);
      
      return count;
    } catch (error) {
      console.error('Error getting security logs count:', error);
      return 0;
    }
  }
  
  // Get complete audit history for a specific entity
  async getEntityAuditHistory(entityType: string, entityId: string): Promise<AuditLog[]> {
    try {
      const logs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.entityType, entityType),
            eq(auditLogs.entityId, entityId)
          )
        )
        .orderBy(desc(auditLogs.timestamp));
      
      return logs;
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