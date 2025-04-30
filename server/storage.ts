import { createReadStream, createWriteStream, promises as fsPromises } from "fs";
import path from "path";
import os from "os";
import { parse as parseCSV } from "csv-parse";
import { format as formatCSV } from "fast-csv";
import { 
  merchants as merchantsTable, 
  transactions as transactionsTable,
  Merchant,
  Transaction,
  InsertMerchant,
  InsertTransaction,
  merchantsSchema,
  transactionsSchema
} from "@shared/schema";

// Interface for storage operations
export interface IStorage {
  // Merchant operations
  getMerchants(page: number, limit: number, status?: string, lastUpload?: string): Promise<{
    merchants: Merchant[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }>;
  
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

// In-memory storage implementation
export class MemStorage implements IStorage {
  private merchants: Map<string, Merchant>;
  private transactions: Map<string, Transaction>;
  private uploadedFiles: Map<string, { path: string; type: string; processed: boolean; filename: string }>;
  private lastMerchantId: number;

  constructor() {
    this.merchants = new Map();
    this.transactions = new Map();
    this.uploadedFiles = new Map();
    this.lastMerchantId = 1000;
    
    // Initialize with some demo data
    this.initializeData();
  }

  // Initialize with some demo data
  private async initializeData() {
    // Add some sample merchants
    const demoMerchants: Merchant[] = [
      {
        id: "M2358",
        name: "City Supermarket",
        status: "Active",
        address: "123 Main St",
        city: "New York",
        state: "NY",
        zipCode: "10001",
        category: "Grocery",
        lastUploadDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days ago
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
        lastUploadDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // Yesterday
        createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString() // 45 days ago
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
        lastUploadDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days ago
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
        lastUploadDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 2 weeks ago
        createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days ago
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
        lastUploadDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() // 15 days ago
      }
    ];

    // Add merchants to storage
    for (const merchant of demoMerchants) {
      this.merchants.set(merchant.id, merchant);
    }

    // Add some sample transactions
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneMonthAgoDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    const today = todayDate.toISOString();
    const oneMonthAgo = oneMonthAgoDate.toISOString();

    // Generate random transactions for each merchant
    for (let i = 0; i < 5000; i++) {
      const merchantIds = Array.from(this.merchants.keys());
      const randomMerchantIndex = Math.floor(Math.random() * merchantIds.length);
      const merchantId = merchantIds[randomMerchantIndex];
      
      // Random date between one month ago and now
      const randomDate = new Date(
        oneMonthAgoDate.getTime() + Math.random() * (todayDate.getTime() - oneMonthAgoDate.getTime())
      ).toISOString();
      
      const transaction: Transaction = {
        id: `T${Math.floor(Math.random() * 1000000)}`,
        merchantId,
        amount: Math.round(Math.random() * 1000 * 100) / 100, // Random amount up to $1000 with 2 decimal places
        date: randomDate,
        type: Math.random() > 0.2 ? "Sale" : "Refund"
      };
      
      this.transactions.set(transaction.id, transaction);
    }
  }

  // Get merchants with pagination and filtering
  async getMerchants(
    page: number = 1, 
    limit: number = 10, 
    status: string = "All", 
    lastUpload: string = "Any time"
  ): Promise<{
    merchants: Merchant[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalItems: number;
      itemsPerPage: number;
    };
  }> {
    let filteredMerchants = Array.from(this.merchants.values());
    
    // Apply status filter
    if (status !== "All") {
      filteredMerchants = filteredMerchants.filter(merchant => merchant.status === status);
    }
    
    // Apply last upload filter
    if (lastUpload !== "Any time") {
      const now = new Date();
      let cutoffDate: Date;
      
      switch(lastUpload) {
        case "Last 24 hours":
          cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "Last 7 days":
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "Last 30 days":
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "Never":
          filteredMerchants = filteredMerchants.filter(merchant => !merchant.lastUploadDate);
          break;
        default:
          cutoffDate = new Date(0); // Beginning of time
      }
      
      if (lastUpload !== "Never") {
        filteredMerchants = filteredMerchants.filter(merchant => 
          merchant.lastUploadDate && new Date(merchant.lastUploadDate) >= cutoffDate
        );
      }
    }
    
    // Calculate pagination
    const totalItems = filteredMerchants.length;
    const totalPages = Math.ceil(totalItems / limit);
    const offset = (page - 1) * limit;
    
    // Get paginated merchants
    const paginatedMerchants = filteredMerchants.slice(offset, offset + limit);
    
    // Calculate stats for each merchant
    const merchantsWithStats = await Promise.all(paginatedMerchants.map(async (merchant) => {
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
  }

  // Calculate stats for a merchant
  private async getMerchantStats(merchantId: string): Promise<{
    daily: { transactions: number; revenue: number };
    monthly: { transactions: number; revenue: number };
  }> {
    const allTransactions = Array.from(this.transactions.values())
      .filter(tx => tx.merchantId === merchantId);
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    
    // Calculate daily stats
    const dailyTransactions = allTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= today;
    });
    
    const dailyRevenue = dailyTransactions.reduce((sum, tx) => {
      return sum + (tx.type === "Sale" ? tx.amount : -tx.amount);
    }, 0);
    
    // Calculate monthly stats
    const monthlyTransactions = allTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate >= oneMonthAgo;
    });
    
    const monthlyRevenue = monthlyTransactions.reduce((sum, tx) => {
      return sum + (tx.type === "Sale" ? tx.amount : -tx.amount);
    }, 0);
    
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
  }

  // Get dashboard stats
  async getDashboardStats(): Promise<{
    totalMerchants: number;
    newMerchants: number;
    dailyTransactions: number;
    monthlyRevenue: number;
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    
    // Calculate total merchants
    const totalMerchants = this.merchants.size;
    
    // Calculate new merchants in the last 30 days
    const newMerchants = Array.from(this.merchants.values()).filter(merchant => {
      return new Date(merchant.createdAt) >= oneMonthAgo;
    }).length;
    
    // Calculate daily transactions
    const dailyTransactions = Array.from(this.transactions.values()).filter(tx => {
      return new Date(tx.date) >= today;
    }).length;
    
    // Calculate monthly revenue
    const monthlyRevenue = Array.from(this.transactions.values())
      .filter(tx => new Date(tx.date) >= oneMonthAgo)
      .reduce((sum, tx) => {
        return sum + (tx.type === "Sale" ? tx.amount : -tx.amount);
      }, 0);
    
    return {
      totalMerchants,
      newMerchants,
      dailyTransactions,
      monthlyRevenue: Number(monthlyRevenue.toFixed(2))
    };
  }

  // Process an uploaded CSV file
  async processUploadedFile(
    filePath: string, 
    type: string, 
    originalFilename: string
  ): Promise<string> {
    // Generate a unique file ID
    const fileId = `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Store file info
    this.uploadedFiles.set(fileId, {
      path: filePath,
      type,
      processed: false,
      filename: originalFilename
    });
    
    return fileId;
  }

  // Combine and process uploaded files
  async combineAndProcessUploads(fileIds: string[]): Promise<void> {
    const merchantFiles = fileIds
      .filter(id => this.uploadedFiles.has(id) && this.uploadedFiles.get(id)?.type === "merchant")
      .map(id => this.uploadedFiles.get(id)?.path || "");
    
    const transactionFiles = fileIds
      .filter(id => this.uploadedFiles.has(id) && this.uploadedFiles.get(id)?.type === "transaction")
      .map(id => this.uploadedFiles.get(id)?.path || "");
    
    // Process merchant demographics files
    for (const filePath of merchantFiles) {
      await this.processMerchantFile(filePath);
    }
    
    // Process transaction files
    for (const filePath of transactionFiles) {
      await this.processTransactionFile(filePath);
    }
    
    // Mark files as processed
    for (const fileId of fileIds) {
      if (this.uploadedFiles.has(fileId)) {
        const fileInfo = this.uploadedFiles.get(fileId)!;
        this.uploadedFiles.set(fileId, { ...fileInfo, processed: true });
      }
    }
  }

  // Process a merchant demographics CSV file
  private async processMerchantFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = createReadStream(filePath).pipe(
        parseCSV({
          columns: true,
          skip_empty_lines: true
        })
      );
      
      const merchants: InsertMerchant[] = [];
      
      parser.on("data", (row) => {
        try {
          // Validate and transform the row data
          const merchantData: InsertMerchant = {
            id: row.merchantId || `M${++this.lastMerchantId}`,
            name: row.name || "Unknown Merchant",
            status: row.status || "Pending",
            address: row.address || "",
            city: row.city || "",
            state: row.state || "",
            zipCode: row.zip || "",
            category: row.category || "Other",
            createdAt: new Date().toISOString(),
            lastUploadDate: new Date().toISOString()
          };
          
          merchants.push(merchantData);
        } catch (error) {
          console.error("Error processing merchant row:", error);
          // Continue with next row
        }
      });
      
      parser.on("error", (error) => {
        reject(error);
      });
      
      parser.on("end", () => {
        // Update merchants in storage
        for (const merchant of merchants) {
          this.merchants.set(merchant.id, merchant);
        }
        
        resolve();
      });
    });
  }

  // Process a transaction CSV file
  private async processTransactionFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const parser = createReadStream(filePath).pipe(
        parseCSV({
          columns: true,
          skip_empty_lines: true
        })
      );
      
      const transactions: InsertTransaction[] = [];
      
      parser.on("data", (row) => {
        try {
          // Check if merchant exists, if not create a placeholder
          const merchantId = row.merchantId;
          if (merchantId && !this.merchants.has(merchantId)) {
            this.merchants.set(merchantId, {
              id: merchantId,
              name: `Merchant ${merchantId}`,
              status: "Pending",
              address: "",
              city: "",
              state: "",
              zipCode: "",
              category: "Other",
              createdAt: new Date().toISOString(),
              lastUploadDate: new Date().toISOString()
            });
          }
          
          // Validate and transform the row data
          const transactionData: InsertTransaction = {
            id: row.transactionId || `T${Math.floor(Math.random() * 1000000)}`,
            merchantId: row.merchantId,
            amount: parseFloat(row.amount) || 0,
            date: row.date ? new Date(row.date).toISOString() : new Date().toISOString(),
            type: row.type || "Sale"
          };
          
          transactions.push(transactionData);
          
          // Update merchant's last upload date
          if (merchantId && this.merchants.has(merchantId)) {
            const merchant = this.merchants.get(merchantId)!;
            this.merchants.set(merchantId, {
              ...merchant,
              lastUploadDate: new Date().toISOString()
            });
          }
        } catch (error) {
          console.error("Error processing transaction row:", error);
          // Continue with next row
        }
      });
      
      parser.on("error", (error) => {
        reject(error);
      });
      
      parser.on("end", () => {
        // Update transactions in storage
        for (const transaction of transactions) {
          this.transactions.set(transaction.id, transaction);
        }
        
        resolve();
      });
    });
  }

  // Generate a combined transactions export file
  async generateTransactionsExport(): Promise<string> {
    const tempFilePath = path.join(os.tmpdir(), `combined_transactions_${Date.now()}.csv`);
    
    return new Promise((resolve, reject) => {
      // Get all transactions
      const allTransactions = Array.from(this.transactions.values());
      
      // Create a CSV writer
      const writer = formatCSV({ headers: true });
      const outputStream = createWriteStream(tempFilePath);
      
      writer.pipe(outputStream);
      
      // Write transactions to CSV
      for (const transaction of allTransactions) {
        const merchant = this.merchants.get(transaction.merchantId);
        
        writer.write({
          transaction_id: transaction.id,
          merchant_id: transaction.merchantId,
          merchant_name: merchant ? merchant.name : "Unknown Merchant",
          amount: transaction.amount.toFixed(2),
          date: new Date(transaction.date).toISOString().split("T")[0],
          type: transaction.type
        });
      }
      
      writer.end();
      
      outputStream.on("finish", () => {
        resolve(tempFilePath);
      });
      
      outputStream.on("error", (error) => {
        reject(error);
      });
    });
  }

  // Generate a merchants export file
  async generateMerchantsExport(): Promise<string> {
    const tempFilePath = path.join(os.tmpdir(), `merchant_demographics_${Date.now()}.csv`);
    
    return new Promise((resolve, reject) => {
      // Get all merchants
      const allMerchants = Array.from(this.merchants.values());
      
      // Create a CSV writer
      const writer = formatCSV({ headers: true });
      const outputStream = createWriteStream(tempFilePath);
      
      writer.pipe(outputStream);
      
      // Write merchants to CSV
      for (const merchant of allMerchants) {
        writer.write({
          merchant_id: merchant.id,
          name: merchant.name,
          status: merchant.status,
          address: merchant.address,
          city: merchant.city,
          state: merchant.state,
          zip_code: merchant.zipCode,
          category: merchant.category,
          created_at: new Date(merchant.createdAt).toISOString().split("T")[0],
          last_upload: merchant.lastUploadDate 
            ? new Date(merchant.lastUploadDate).toISOString().split("T")[0] 
            : ""
        });
      }
      
      writer.end();
      
      outputStream.on("finish", () => {
        resolve(tempFilePath);
      });
      
      outputStream.on("error", (error) => {
        reject(error);
      });
    });
  }
}

export const storage = new MemStorage();
