/**
 * In-memory storage fallback when database is unavailable
 * This provides a minimal implementation that allows the application to run
 * even when the database is down or misconfigured.
 */

import { v4 as uuidv4 } from 'uuid';
import session from 'express-session';
import createMemoryStore from 'memorystore';
import { User, InsertUser, AuditLog, InsertAuditLog } from "@shared/schema";
import { IStorage } from "./storage";

const MemoryStore = createMemoryStore(session);

export class MemStorageFallback implements IStorage {
  private users: User[] = [];
  private merchants: any[] = [];
  private transactions: any[] = [];
  private auditLogs: AuditLog[] = [];
  readonly sessionStore: session.Store;

  constructor() {
    // Initialize session store
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000
    });

    // Create a default admin user
    this.createDefaultAdminUser();
  }

  private async createDefaultAdminUser() {
    try {
      // Only create if no users exist
      if (this.users.length === 0) {
        // For fallback mode, use a simplified password hash that will work with our verification logic
        const password = 'admin123';
        const hash = Buffer.from(password).toString('base64');
        const hashedPassword = `${hash}.salt`;
        
        // Create admin user directly to ensure it works
        const adminUser: User = {
          id: 1,
          username: 'admin',
          password: hashedPassword,
          email: 'admin@example.com',
          firstName: 'Admin',
          lastName: 'User',
          role: 'admin',
          createdAt: new Date(),
          lastLogin: null
        };
        
        this.users.push(adminUser);
        console.log('Created default admin user in memory fallback storage: admin/admin123');
      }
    } catch (error) {
      console.error('Error creating default admin user:', error);
    }
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.find(user => user.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const user = this.users.find(user => user.username === username);
    if (user) {
      console.log(`Found user in fallback storage: ${user.username} (id: ${user.id})`);
    } else {
      console.log(`User not found in fallback storage: ${username}`);
      console.log(`Available users in fallback storage: ${this.users.map(u => u.username).join(', ')}`);
    }
    return user;
  }

  async getUsers(): Promise<User[]> {
    return [...this.users];
  }

  async createUser(userData: InsertUser): Promise<User> {
    const newId = this.users.length > 0 
      ? Math.max(...this.users.map(u => u.id)) + 1 
      : 1;
    
    const newUser: User = {
      id: newId,
      username: userData.username,
      password: userData.password,
      email: userData.email || null,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
      role: userData.role || 'user',
      createdAt: new Date(),
      lastLogin: null
    };

    this.users.push(newUser);
    return newUser;
  }

  async updateUser(userId: number, userData: Partial<Omit<InsertUser, 'password'>>): Promise<User> {
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    const updatedUser = {
      ...this.users[userIndex],
      ...userData
    };

    this.users[userIndex] = updatedUser;
    return updatedUser;
  }

  async updateUserLastLogin(userId: number): Promise<void> {
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      this.users[userIndex].lastLogin = new Date();
    }
  }

  async updateUserPassword(userId: number, newPassword: string): Promise<void> {
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      throw new Error('User not found');
    }

    this.users[userIndex].password = await this.hashPassword(newPassword);
  }

  async deleteUser(userId: number): Promise<void> {
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex !== -1) {
      this.users.splice(userIndex, 1);
    }
  }

  async hashPassword(password: string): Promise<string> {
    // In our fallback, we'll use a simple hash for demonstration
    // This is NOT secure for production use but works for a fallback
    const hash = Buffer.from(password).toString('base64');
    return `${hash}.salt`;
  }

  async verifyPassword(supplied: string, stored: string): Promise<boolean> {
    try {
      // Simple verification method for our fallback storage
      const [hash, _] = stored.split('.');
      const suppliedHash = Buffer.from(supplied).toString('base64');
      
      const result = hash === suppliedHash;
      console.log(`Password verification result for fallback storage: ${result}`);
      
      return result;
    } catch (error) {
      console.error('Error verifying password in fallback storage:', error);
      return false;
    }
  }

  // Merchant operations with minimal implementation
  async getMerchants(page: number, limit: number, status?: string, lastUpload?: string): Promise<{
    merchants: any[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    let filteredMerchants = [...this.merchants];
    
    if (status) {
      filteredMerchants = filteredMerchants.filter(m => m.status === status);
    }
    
    const totalItems = filteredMerchants.length;
    const totalPages = Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return {
      merchants: filteredMerchants.slice(startIndex, endIndex),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit
      }
    };
  }

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
    const merchant = this.merchants.find(m => m.id === merchantId);
    
    if (!merchant) {
      throw new Error('Merchant not found');
    }
    
    const merchantTransactions = this.transactions.filter(t => t.merchantId === merchantId);
    
    // Format merchant with proper field names and defaults
    const formattedMerchant = {
      id: merchant.id,
      name: merchant.name || '',
      clientMID: merchant.clientMID || null,
      otherClientNumber1: merchant.otherClientNumber1 || null,
      otherClientNumber2: merchant.otherClientNumber2 || null,
      clientSinceDate: merchant.clientSinceDate ? merchant.clientSinceDate.toISOString() : null,
      status: merchant.status || 'Pending',
      merchantType: merchant.merchantType || 0,
      salesChannel: merchant.salesChannel || null,
      address: merchant.address || '',
      city: merchant.city || '',
      state: merchant.state || '',
      zipCode: merchant.zipCode || '',
      country: merchant.country || null,
      category: merchant.category || '',
      editDate: merchant.editDate ? merchant.editDate.toISOString() : null
    };
    
    // Format transactions for display
    const formattedTransactions = merchantTransactions.map(t => ({
      transactionId: t.id,
      merchantId: t.merchantId,
      amount: parseFloat(t.amount?.toString() || '0'),
      date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
      type: t.type || 'Credit'
    }));
    
    // Simple mock analytics
    return {
      merchant: formattedMerchant,
      transactions: formattedTransactions,
      analytics: {
        dailyStats: {
          transactions: 0,
          revenue: 0
        },
        monthlyStats: {
          transactions: 0,
          revenue: 0
        },
        transactionHistory: []
      }
    };
  }

  async createMerchant(merchantData: any): Promise<any> {
    const newMerchant = {
      id: uuidv4(),
      ...merchantData,
      createdAt: new Date()
    };
    
    this.merchants.push(newMerchant);
    return newMerchant;
  }

  async updateMerchant(merchantId: string, merchantData: any): Promise<any> {
    const merchantIndex = this.merchants.findIndex(m => m.id === merchantId);
    
    if (merchantIndex === -1) {
      throw new Error('Merchant not found');
    }
    
    const updatedMerchant = {
      ...this.merchants[merchantIndex],
      ...merchantData,
      editDate: new Date()
    };
    
    this.merchants[merchantIndex] = updatedMerchant;
    return updatedMerchant;
  }

  async deleteMerchants(merchantIds: string[]): Promise<void> {
    this.merchants = this.merchants.filter(m => !merchantIds.includes(m.id));
  }

  // Transaction operations with minimal implementation
  async getTransactions(
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
  }> {
    let filteredTransactions = [...this.transactions];
    
    if (merchantId) {
      filteredTransactions = filteredTransactions.filter(t => t.merchantId === merchantId);
    }
    
    if (type) {
      filteredTransactions = filteredTransactions.filter(t => t.type === type);
    }
    
    if (startDate) {
      const startDateObj = new Date(startDate);
      filteredTransactions = filteredTransactions.filter(t => new Date(t.date) >= startDateObj);
    }
    
    if (endDate) {
      const endDateObj = new Date(endDate);
      filteredTransactions = filteredTransactions.filter(t => new Date(t.date) <= endDateObj);
    }
    
    const totalItems = filteredTransactions.length;
    const totalPages = Math.ceil(totalItems / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return {
      transactions: filteredTransactions.slice(startIndex, endIndex),
      pagination: {
        currentPage: page,
        totalPages,
        totalItems,
        itemsPerPage: limit
      }
    };
  }

  async addTransaction(merchantId: string, transactionData: { amount: string, type: string, date: string }): Promise<any> {
    const newTransaction = {
      id: uuidv4(),
      merchantId,
      ...transactionData,
      date: new Date(transactionData.date)
    };
    
    this.transactions.push(newTransaction);
    return newTransaction;
  }

  async deleteTransactions(transactionIds: string[]): Promise<void> {
    this.transactions = this.transactions.filter(t => !transactionIds.includes(t.id));
  }

  async exportTransactionsToCSV(
    merchantId?: string, 
    startDate?: string, 
    endDate?: string,
    type?: string
  ): Promise<string> {
    return "No data available in fallback mode";
  }

  // Dashboard stats
  async getDashboardStats(): Promise<{
    totalMerchants: number;
    newMerchants: number;
    dailyTransactions: number;
    monthlyRevenue: number;
  }> {
    return {
      totalMerchants: this.merchants.length,
      newMerchants: 0,
      dailyTransactions: 0,
      monthlyRevenue: 0
    };
  }

  // File processing operations (minimal stubs)
  async processUploadedFile(filePath: string, type: string, originalFilename: string): Promise<string> {
    return "File processing not available in fallback mode";
  }

  async combineAndProcessUploads(fileIds: string[]): Promise<void> {
    // No implementation in fallback
  }

  async generateTransactionsExport(): Promise<string> {
    return "Export not available in fallback mode";
  }

  async generateMerchantsExport(): Promise<string> {
    return "Export not available in fallback mode";
  }

  // Audit log implementation for fallback mode
  async createAuditLog(auditLogData: InsertAuditLog): Promise<AuditLog> {
    try {
      const newId = this.auditLogs.length + 1;
      const timestamp = new Date();
      
      const auditLog: AuditLog = {
        id: newId,
        entityType: auditLogData.entityType,
        entityId: auditLogData.entityId,
        action: auditLogData.action,
        userId: auditLogData.userId,
        username: auditLogData.username,
        timestamp: timestamp,
        oldValues: auditLogData.oldValues || null,
        newValues: auditLogData.newValues || null,
        changedFields: auditLogData.changedFields || [],
        ipAddress: auditLogData.ipAddress || null,
        userAgent: auditLogData.userAgent || null,
        notes: auditLogData.notes || null
      };
      
      this.auditLogs.push(auditLog);
      return auditLog;
    } catch (error) {
      console.error("Error creating audit log in fallback mode:", error);
      throw new Error("Failed to create audit log entry in fallback mode");
    }
  }
  
  async getAuditLogs(entityType?: string, entityId?: string, page: number = 1, limit: number = 20): Promise<{
    logs: AuditLog[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    }
  }> {
    try {
      // Filter logs based on provided parameters
      let filteredLogs = this.auditLogs;
      
      if (entityType) {
        filteredLogs = filteredLogs.filter(log => log.entityType === entityType);
      }
      
      if (entityId) {
        filteredLogs = filteredLogs.filter(log => log.entityId === entityId);
      }
      
      // Sort by timestamp descending (newest first)
      filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      // Calculate pagination
      const totalItems = filteredLogs.length;
      const totalPages = Math.ceil(totalItems / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = Math.min(startIndex + limit, totalItems);
      
      // Get page of logs
      const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
      
      return {
        logs: paginatedLogs,
        pagination: {
          currentPage: page,
          totalPages,
          totalItems,
          itemsPerPage: limit
        }
      };
    } catch (error) {
      console.error("Error fetching audit logs in fallback mode:", error);
      throw new Error("Failed to retrieve audit logs in fallback mode");
    }
  }
  
  async getEntityAuditHistory(entityType: string, entityId: string): Promise<AuditLog[]> {
    try {
      // Get all logs for the specified entity
      const logs = this.auditLogs.filter(log => 
        log.entityType === entityType && log.entityId === entityId
      );
      
      // Sort by timestamp descending (newest first)
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return logs;
    } catch (error) {
      console.error(`Error fetching audit history for ${entityType} ${entityId} in fallback mode:`, error);
      throw new Error(`Failed to retrieve audit history for ${entityType} in fallback mode`);
    }
  }
}