// Dashboard statistics types
export interface DashboardStats {
  totalMerchants: number;
  newMerchants: number;
  dailyTransactions: number;
  monthlyRevenue: number;
  
  // Enhanced metrics
  transactionGrowth: number; // Percentage growth in transactions (month-over-month)
  revenueGrowth: number; // Percentage growth in revenue (month-over-month)
  activeRate: number; // Percentage of active merchants
  avgTransactionValue: number; // Average transaction value
  totalTransactions: number; // Total transactions (all time or monthly)
  totalRevenue: number; // Total revenue (all time or monthly)
}

// Merchant batch info
export interface MerchantBatchInfo {
  filename: string | null;
  date: Date | null;
}

// Merchant transaction info
export interface MerchantTransactionInfo {
  amount: number | null;
  date: Date | null;
}

// Merchant stats types (legacy - kept for compatibility)
export interface MerchantStats {
  transactions: number;
  revenue: number;
}

// Merchant type
export interface Merchant {
  id: string;
  name: string;
  clientMID?: string | null;
  status: string;
  lastUpload: string;
  lastBatch?: MerchantBatchInfo;
  lastTransaction?: MerchantTransactionInfo;
}

// Pagination type
export interface Pagination {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
}

// Merchant demographics file type
export interface MerchantDemographics {
  merchantId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  category: string;
  status: string;
}

// Transaction type
export interface Transaction {
  transactionId: string;
  merchantId: string;
  amount: number;
  date: string;
  type: string;
}

// Upload response type
export interface UploadResponse {
  fileId: string;
  fileName: string;
  recordsProcessed: number;
  success: boolean;
}
