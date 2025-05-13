import { createReadStream, createWriteStream, promises as fsPromises, existsSync } from "fs";
import path from "path";
import os from "os";
import { parse as parseCSV } from "csv-parse";
import { format as formatCSV } from "fast-csv";
import { 
  merchants as merchantsTable, 
  transactions as transactionsTable,
  uploadedFiles as uploadedFilesTable,
  users as usersTable,
  Merchant,
  Transaction,
  InsertMerchant,
  InsertTransaction,
  InsertUploadedFile,
  User,
  InsertUser
} from "@shared/schema";
import { db } from "./db";
import { eq, gt, gte, and, or, count, desc, sql, between, like } from "drizzle-orm";
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
  
  // Session store for authentication
  sessionStore: session.Store;

  // Merchant operations
  getMerchants(page: number, limit: number, status?: string, lastUpload?: string): Promise<{
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
  deleteMerchants(merchantIds: string[]): Promise<void>;
  
  // Transaction operations
  getTransactions(
    page: number, 
    limit: number, 
    merchantId?: string, 
    startDate?: string, 
    endDate?: string,
    type?: string
  ): Promise<{
    transactions: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;
  addTransaction(merchantId: string, transactionData: { amount: number, type: string, date: string }): Promise<any>;
  deleteTransactions(transactionIds: string[]): Promise<void>;
  exportTransactionsToCSV(
    merchantId?: string, 
    startDate?: string, 
    endDate?: string,
    type?: string
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
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
    return user || undefined;
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
          amount: Math.round(Math.random() * 1000 * 100) / 100, // Random amount up to $1000 with 2 decimal places
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
    lastUpload: string = "Any time"
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
      
      // Apply status filter
      if (status !== "All") {
        query = query.where(eq(merchantsTable.status, status));
      }
      
      // Apply last upload filter
      if (lastUpload !== "Any time") {
        const now = new Date();
        let cutoffDate: Date;
        
        switch(lastUpload) {
          case "Last 24 hours":
            cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            query = query.where(gte(merchantsTable.lastUploadDate, cutoffDate));
            break;
          case "Last 7 days":
            cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            query = query.where(gte(merchantsTable.lastUploadDate, cutoffDate));
            break;
          case "Last 30 days":
            cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            query = query.where(gte(merchantsTable.lastUploadDate, cutoffDate));
            break;
          case "Never":
            query = query.where(sql`${merchantsTable.lastUploadDate} IS NULL`);
            break;
        }
      }
      
      // Get total count for pagination
      const countResult = await db.select({ count: count() }).from(merchantsTable);
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
      
      // Generate transaction history by month for the last 6 months
      const transactionHistory = await this.getTransactionHistoryByMonth(merchantId, 6);
      
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
          status: merchant.status,
          address: merchant.address || '',
          city: merchant.city || '',
          state: merchant.state || '',
          zipCode: merchant.zipCode || '',
          category: merchant.category || ''
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
  
  // Create a new merchant 
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
      
      return newMerchant;
    } catch (error) {
      console.error("Error creating merchant:", error);
      throw error;
    }
  }
  
  // Update merchant details
  async updateMerchant(merchantId: string, merchantData: Partial<InsertMerchant>): Promise<any> {
    try {
      // Check if merchant exists
      const [existingMerchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
      
      if (!existingMerchant) {
        throw new Error(`Merchant with ID ${merchantId} not found`);
      }
      
      // Update merchant
      await db.update(merchantsTable)
        .set(merchantData)
        .where(eq(merchantsTable.id, merchantId));
      
      // Get updated merchant
      const [updatedMerchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
      
      return updatedMerchant;
    } catch (error) {
      console.error(`Error updating merchant ${merchantId}:`, error);
      throw error;
    }
  }
  
  // Delete multiple merchants
  async deleteMerchants(merchantIds: string[]): Promise<void> {
    try {
      // Delete related transactions first to maintain referential integrity
      for (const merchantId of merchantIds) {
        // Delete transactions associated with this merchant
        await db.delete(transactionsTable)
          .where(eq(transactionsTable.merchantId, merchantId));
        
        // Delete the merchant
        await db.delete(merchantsTable)
          .where(eq(merchantsTable.id, merchantId));
      }
      
      console.log(`Successfully deleted ${merchantIds.length} merchants and their transactions`);
    } catch (error) {
      console.error('Error deleting merchants:', error);
      throw error;
    }
  }
  
  // Add a new transaction for a merchant
  async addTransaction(merchantId: string, transactionData: { amount: number, type: string, date: string }): Promise<any> {
    try {
      // Check if the merchant exists
      const [merchant] = await db.select().from(merchantsTable).where(eq(merchantsTable.id, merchantId));
      
      if (!merchant) {
        throw new Error(`Merchant with ID ${merchantId} not found`);
      }
      
      // Generate a unique transaction ID
      const transactionId = `T${Math.floor(Math.random() * 1000000)}`;
      
      // Adjust amount based on transaction type
      let adjustedAmount = transactionData.amount;
      if (transactionData.type.toLowerCase() === 'credit') {
        // Credit should be positive
        adjustedAmount = Math.abs(adjustedAmount);
        console.log(`Ensuring Credit transaction amount is positive: ${adjustedAmount}`);
      } else if (transactionData.type.toLowerCase() === 'debit') {
        // Debit should be negative
        adjustedAmount = -Math.abs(adjustedAmount);
        console.log(`Ensuring Debit transaction amount is negative: ${adjustedAmount}`);
      }
      
      // Create the transaction
      const transaction: InsertTransaction = {
        id: transactionId,
        merchantId,
        amount: adjustedAmount.toString(), // Convert to string for database
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
      
      // Format the transaction for response
      return {
        transactionId: insertedTransaction.id,
        merchantId: insertedTransaction.merchantId,
        amount: parseFloat(insertedTransaction.amount),
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
    type?: string
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
      
      // Apply filters
      if (merchantId) {
        query = query.where(eq(transactionsTable.merchantId, merchantId));
      }
      
      if (startDate) {
        const startDateObj = new Date(startDate);
        query = query.where(gte(transactionsTable.date, startDateObj));
      }
      
      if (endDate) {
        const endDateObj = new Date(endDate);
        // Set time to end of day
        endDateObj.setHours(23, 59, 59, 999);
        query = query.where(sql`${transactionsTable.date} <= ${endDateObj}`);
      }
      
      if (type) {
        query = query.where(eq(transactionsTable.type, type));
      }
      
      // Get total count for pagination
      const countQuery = db.select({ count: count() })
        .from(transactionsTable)
        .leftJoin(merchantsTable, eq(transactionsTable.merchantId, merchantsTable.id));
      
      // Apply the same filters to count query
      if (merchantId) {
        countQuery.where(eq(transactionsTable.merchantId, merchantId));
      }
      
      if (startDate) {
        const startDateObj = new Date(startDate);
        countQuery.where(gte(transactionsTable.date, startDateObj));
      }
      
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        countQuery.where(sql`${transactionsTable.date} <= ${endDateObj}`);
      }
      
      if (type) {
        countQuery.where(eq(transactionsTable.type, type));
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
          id: transaction.id,
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
  
  // Export transactions to CSV
  async exportTransactionsToCSV(
    merchantId?: string,
    startDate?: string,
    endDate?: string,
    type?: string
  ): Promise<string> {
    try {
      // Get all transactions matching the filters (without pagination)
      const query = db.select({
        transaction: transactionsTable,
        merchantName: merchantsTable.name
      })
      .from(transactionsTable)
      .leftJoin(merchantsTable, eq(transactionsTable.merchantId, merchantsTable.id))
      .orderBy(desc(transactionsTable.date));
      
      // Apply filters
      if (merchantId) {
        query.where(eq(transactionsTable.merchantId, merchantId));
      }
      
      if (startDate) {
        const startDateObj = new Date(startDate);
        query.where(gte(transactionsTable.date, startDateObj));
      }
      
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);
        query.where(sql`${transactionsTable.date} <= ${endDateObj}`);
      }
      
      if (type) {
        query.where(eq(transactionsTable.type, type));
      }
      
      const results = await query;
      
      // Format results for CSV
      const csvData = results.map(result => {
        const { transaction, merchantName } = result;
        const dateObj = new Date(transaction.date);
        
        return {
          TranSeqNumber: transaction.id.replace('T', ''),
          TranAccountNumber: transaction.merchantId,
          TranDate: dateObj.toISOString().split('T')[0],
          TranType: transaction.type,
          TranAmount: parseFloat(transaction.amount.toString()).toFixed(2),
          NetTranAmount: parseFloat(transaction.amount.toString()).toFixed(2),
          TranCategory: transaction.type === "Credit" ? "Income" : (transaction.type === "Debit" ? "Expense" : "Sale"),
          TranPostDate: dateObj.toISOString().split('T')[0],
          TranTrailer1: merchantName || '',
          TranTrailer2: '',
          TranTrailer3: '',
          TranTrailer4: '',
          TranTrailer5: '',
          TranTrailer6: ''
        };
      });
      
      // Generate a temp file path
      const tempFilePath = path.join(os.tmpdir(), `transactions_export_${Date.now()}.csv`);
      
      // Write CSV data to file
      return new Promise((resolve, reject) => {
        const writableStream = createWriteStream(tempFilePath);
        const csvStream = formatCSV({ headers: true, delimiter: ',' });
        
        csvStream.pipe(writableStream);
        
        for (const row of csvData) {
          csvStream.write(row);
        }
        
        csvStream.end();
        
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
  
  // Delete multiple transactions
  async deleteTransactions(transactionIds: string[]): Promise<void> {
    try {
      if (transactionIds.length === 0) {
        return;
      }
      
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
  private async getTransactionHistoryByMonth(merchantId: string, months: number): Promise<{
    name: string;
    transactions: number;
    revenue: number;
  }[]> {
    try {
      const now = new Date();
      const result = [];
      
      for (let i = 0; i < months; i++) {
        const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
        
        // Get transactions for this month
        const monthTransactions = await db.select()
          .from(transactionsTable)
          .where(and(
            eq(transactionsTable.merchantId, merchantId),
            between(transactionsTable.date, month, nextMonth)
          ));
        
        // Calculate revenue
        const revenue = monthTransactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount.toString());
          // For Credit/Debit types, use the amount directly (since it should already have the correct sign)
          if (tx.type === "Credit" || tx.type === "Debit") {
            return sum + amount;
          }
          // For other types like "Sale", continue using previous logic
          return sum + (tx.type === "Sale" ? amount : -amount);
        }, 0);
        
        // Add to result
        result.push({
          name: month.toLocaleString('default', { month: 'short' }),
          transactions: monthTransactions.length,
          revenue: Number(revenue.toFixed(2))
        });
      }
      
      // Reverse to get chronological order
      return result.reverse();
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
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      
      // Get all transactions for this merchant for totals
      const allTransactions = await db.select()
        .from(transactionsTable)
        .where(eq(transactionsTable.merchantId, merchantId));
      
      // Get daily transactions (from today)
      const dailyTransactions = allTransactions.filter(tx => 
        new Date(tx.date) >= today
      );
        
      // Calculate daily revenue
      const dailyRevenue = dailyTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        // For Credit/Debit types, use the amount directly (since it should already have the correct sign)
        if (tx.type === "Credit" || tx.type === "Debit") {
          return sum + amount;
        }
        // For other types like "Sale", continue using previous logic
        return sum + (tx.type === "Sale" ? amount : -amount);
      }, 0);
      
      // Get monthly transactions (from last 30 days)
      const monthlyTransactions = allTransactions.filter(tx => 
        new Date(tx.date) >= oneMonthAgo
      );
        
      // Calculate monthly revenue
      const monthlyRevenue = monthlyTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        // For Credit/Debit types, use the amount directly (since it should already have the correct sign)
        if (tx.type === "Credit" || tx.type === "Debit") {
          return sum + amount;
        }
        // For other types like "Sale", continue using previous logic
        return sum + (tx.type === "Sale" ? amount : -amount);
      }, 0);
      
      // If no recent transactions but there are all-time transactions, show all-time totals
      // This ensures merchants with transactions will show some data
      if (monthlyTransactions.length === 0 && allTransactions.length > 0) {
        // Calculate all-time revenue
        const allTimeRevenue = allTransactions.reduce((sum, tx) => {
          const amount = parseFloat(tx.amount.toString());
          // For Credit/Debit types, use the amount directly (since it should already have the correct sign)
          if (tx.type === "Credit" || tx.type === "Debit") {
            return sum + amount;
          }
          // For other types like "Sale", continue using previous logic
          return sum + (tx.type === "Sale" ? amount : -amount);
        }, 0);
        
        return {
          daily: {
            transactions: 0,
            revenue: 0
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
  }> {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      
      // Get total merchants count
      const merchantCount = await db.select({ count: count() }).from(merchantsTable);
      const totalMerchants = parseInt(merchantCount[0].count.toString(), 10);
      
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
      
      // Get monthly transactions and calculate revenue
      const monthlyTransactions = await db.select()
        .from(transactionsTable)
        .where(gte(transactionsTable.date, oneMonthAgo));
        
      const monthlyRevenue = monthlyTransactions.reduce((sum, tx) => {
        const amount = parseFloat(tx.amount.toString());
        // For Credit/Debit types, use the amount directly (since it should already have the correct sign)
        if (tx.type === "Credit" || tx.type === "Debit") {
          return sum + amount;
        }
        // For other types like "Sale", continue using previous logic
        return sum + (tx.type === "Sale" ? amount : -amount);
      }, 0);
      
      return {
        totalMerchants,
        newMerchants,
        dailyTransactions,
        monthlyRevenue: Number(monthlyRevenue.toFixed(2))
      };
    } catch (error) {
      console.error("Error getting dashboard stats:", error);
      return {
        totalMerchants: 0,
        newMerchants: 0,
        dailyTransactions: 0,
        monthlyRevenue: 0
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
      // Get file information for the provided IDs
      const files = await db.select()
        .from(uploadedFilesTable)
        .where(sql`${uploadedFilesTable.id} IN (${fileIds.join(',')})`);
      
      console.log(`Retrieved ${files.length} files for processing: ${JSON.stringify(files.map(f => ({ id: f.id, type: f.fileType, name: f.originalFilename })))}`);
      
      // Organize files by type
      const merchantFiles = files.filter(file => file.fileType === "merchant");
      const transactionFiles = files.filter(file => file.fileType === "transaction");
      
      console.log(`Found ${merchantFiles.length} merchant files and ${transactionFiles.length} transaction files`);
      
      // Process merchant demographics files
      for (const file of merchantFiles) {
        try {
          console.log(`Processing merchant file ID: ${file.id}, Path: ${file.storagePath}, Filename: ${file.originalFilename}`);
          await this.processMerchantFile(file.storagePath);
          
          // Mark this specific file as successfully processed
          await db.update(uploadedFilesTable)
            .set({ 
              processed: true,
              processingErrors: null 
            })
            .where(eq(uploadedFilesTable.id, file.id));
            
        } catch (error) {
          console.error(`Error processing merchant file ${file.id} (${file.originalFilename}):`, error);
          
          // Mark this file as processed but with errors
          await db.update(uploadedFilesTable)
            .set({ 
              processed: true, 
              processingErrors: error instanceof Error ? error.message : "Unknown error during processing" 
            })
            .where(eq(uploadedFilesTable.id, file.id));
        }
      }
      
      // Process transaction files
      for (const file of transactionFiles) {
        try {
          console.log(`Processing transaction file ID: ${file.id}, Path: ${file.storagePath}, Filename: ${file.originalFilename}`);
          await this.processTransactionFile(file.storagePath);
          
          // Mark this specific file as successfully processed
          await db.update(uploadedFilesTable)
            .set({ 
              processed: true,
              processingErrors: null 
            })
            .where(eq(uploadedFilesTable.id, file.id));
            
        } catch (error) {
          console.error(`Error processing transaction file ${file.id} (${file.originalFilename}):`, error);
          
          // Mark this file as processed but with errors
          await db.update(uploadedFilesTable)
            .set({ 
              processed: true, 
              processingErrors: error instanceof Error ? error.message : "Unknown error during processing" 
            })
            .where(eq(uploadedFilesTable.id, file.id));
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
      
      console.log("Starting CSV parsing...");
      const parser = createReadStream(filePath).pipe(
        parseCSV({
          columns: true,
          skip_empty_lines: true
        })
      );
      
      const merchants: InsertMerchant[] = [];
      let rowCount = 0;
      let errorCount = 0;
      
      parser.on("data", (row) => {
        rowCount++;
        try {
          console.log(`Processing row ${rowCount}:`, JSON.stringify(row));
          
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
          
          // Create merchant object with mapped fields from CSV
          const merchantData: Partial<InsertMerchant> = {
            id: merchantId,
            createdAt: new Date(),
            lastUploadDate: new Date(),
            editDate: new Date()
          };
          
          // Apply field mappings - map CSV fields to database fields
          for (const [dbField, csvField] of Object.entries(merchantFieldMappings)) {
            if (csvField && row[csvField] !== undefined) {
              // For date fields, parse the date
              if (dbField === 'clientSinceDate') {
                try {
                  if (row[csvField] && row[csvField].trim() !== '') {
                    merchantData[dbField as keyof InsertMerchant] = new Date(row[csvField]) as any;
                  } else {
                    merchantData[dbField as keyof InsertMerchant] = null as any;
                  }
                } catch (e) {
                  console.warn(`Failed to parse date for ${dbField}: ${row[csvField]}`);
                  merchantData[dbField as keyof InsertMerchant] = null as any;
                }
              } else {
                merchantData[dbField as keyof InsertMerchant] = row[csvField] as any;
              }
            }
          }
          
          // Apply defaults for missing fields
          for (const [field, defaultValue] of Object.entries(defaultMerchantValues)) {
            if (!merchantData[field as keyof InsertMerchant]) {
              merchantData[field as keyof InsertMerchant] = defaultValue as any;
            }
          }
          
          // Make sure name exists (required field)
          if (!merchantData.name) {
            merchantData.name = `Unknown Merchant ${merchantId}`;
          }
          
          // Log the mapped merchant data
          console.log(`Mapped merchant data:`, JSON.stringify(merchantData));
          
          merchants.push(merchantData as InsertMerchant);
        } catch (error) {
          errorCount++;
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
        console.log(`CSV parsing complete. Processed ${rowCount} rows with ${errorCount} errors.`);
        console.log(`Processing ${merchants.length} valid merchants...`);
        
        try {
          // Insert or update merchants in database
          let updatedCount = 0;
          let insertedCount = 0;
          
          for (const merchant of merchants) {
            // Check if merchant exists
            const existingMerchant = await db.select()
              .from(merchantsTable)
              .where(eq(merchantsTable.id, merchant.id));
              
            if (existingMerchant.length > 0) {
              // Update existing merchant
              console.log(`Updating existing merchant: ${merchant.id} - ${merchant.name}`);
              updatedCount++;
              
              await db.update(merchantsTable)
                .set({
                  name: merchant.name,
                  clientMID: merchant.clientMID,
                  otherClientNumber1: merchant.otherClientNumber1,
                  otherClientNumber2: merchant.otherClientNumber2,
                  clientSinceDate: merchant.clientSinceDate,
                  status: merchant.status,
                  address: merchant.address,
                  city: merchant.city,
                  state: merchant.state,
                  zipCode: merchant.zipCode,
                  country: merchant.country,
                  category: merchant.category,
                  lastUploadDate: merchant.lastUploadDate,
                  editDate: new Date()
                })
                .where(eq(merchantsTable.id, merchant.id));
            } else {
              // Insert new merchant
              console.log(`Inserting new merchant: ${merchant.id} - ${merchant.name}`);
              insertedCount++;
              
              await db.insert(merchantsTable).values(merchant);
            }
          }
          
          console.log(`Merchant processing complete. Updated: ${updatedCount}, Inserted: ${insertedCount}`);
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
            amount: 0,
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
                        transaction.amount = typeof transaction.amount === 'string' 
                          ? positiveAmount.toString() 
                          : positiveAmount;
                        console.log(`Adjusted negative amount to positive for Credit transaction: ${transaction.amount}`);
                      }
                    } else if (code === "27") { // Debit - should be negative
                      // If amount is positive, make it negative
                      if (amountNum > 0) {
                        const negativeAmount = -Math.abs(amountNum);
                        transaction.amount = typeof transaction.amount === 'string' 
                          ? negativeAmount.toString() 
                          : negativeAmount;
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
                      
                      // First check if core names (without business types) match exactly
                      if (cleanMerchantName === cleanTransactionName) {
                        console.log(`[NAME MATCH] Core names match exactly: "${cleanMerchantName}" = "${cleanTransactionName}"`);
                        return true;
                      }
                      
                      // Check if either name contains the other (ignoring case)
                      return merchantName.includes(transactionName) || 
                             transactionName.includes(merchantName) ||
                             cleanMerchantName.includes(cleanTransactionName) ||
                             cleanTransactionName.includes(cleanMerchantName) ||
                             // Check for abbreviated names (like "LLC" to match with full versions)
                             (merchantName.includes("llc") && transactionName.includes("llc")) ||
                             (merchantName.includes("inc") && transactionName.includes("inc"));
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
                  status: "Active",
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
                  status: "Active",
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
            
            // Insert transaction
            console.log(`[TRANSACTION] Inserting: ${transaction.id} for merchant ${transaction.merchantId}, amount: ${transaction.amount}`);
            await db.insert(transactionsTable).values(transaction);
            insertedCount++;
            insertedTransactionsList.push({
              id: transaction.id,
              merchantId: transaction.merchantId,
              amount: transaction.amount
            });
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
}

// Default to database storage
let storage: IStorage = new DatabaseStorage();

/**
 * Set a different storage implementation (used for fallback when database is unavailable)
 * @param newStorage The new storage implementation to use
 */
export function setStorageImplementation(newStorage: IStorage) {
  storage = newStorage;
}

export { storage };