import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatTableDate } from "@/lib/date-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Eye, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import MainLayout from "@/components/layout/MainLayout";
import { useToast } from "@/hooks/use-toast";
import { RawDataTooltip } from "@/components/raw-data-tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Types
interface Transaction {
  id: string;
  transactionId: string; // Added to match the API response
  merchantId: string;
  merchantName: string;
  amount: number;
  date: string;
  type: string;
  // Raw data preservation fields
  rawData?: Record<string, any> | null;
  sourceFileId?: string | null;
  sourceRowNumber?: number | null;
  recordedAt?: string | null;
}

interface TransactionsResponse {
  transactions: Transaction[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

interface MerchantOption {
  id: string;
  name: string;
}

// Helper function to format date for display
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return format(date, "MMM d, yyyy");
};

// Helper function to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

// Pagination component
const TransactionPagination = ({
  currentPage,
  totalPages,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) => {
  // Generate array of pages to show
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Show a subset of pages
      if (currentPage <= 3) {
        // Show first 5 pages
        for (let i = 1; i <= maxPagesToShow; i++) {
          pageNumbers.push(i);
        }
      } else if (currentPage >= totalPages - 2) {
        // Show last 5 pages
        for (let i = totalPages - maxPagesToShow + 1; i <= totalPages; i++) {
          pageNumbers.push(i);
        }
      } else {
        // Show current page and 2 pages on either side
        for (let i = currentPage - 2; i <= currentPage + 2; i++) {
          pageNumbers.push(i);
        }
      }
    }
    
    return pageNumbers;
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious 
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
          />
        </PaginationItem>
        
        {getPageNumbers().map(page => (
          <PaginationItem key={page}>
            <PaginationLink
              onClick={() => onPageChange(page)}
              isActive={page === currentPage}
              className="cursor-pointer"
            >
              {page}
            </PaginationLink>
          </PaginationItem>
        ))}
        
        {totalPages > 5 && currentPage < totalPages - 2 && (
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
        )}
        
        <PaginationItem>
          <PaginationNext 
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
};

export default function Transactions() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Filtering and pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [merchantId, setMerchantId] = useState<string | undefined>(undefined);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [transactionType, setTransactionType] = useState<string | undefined>(undefined);
  const [transactionId, setTransactionId] = useState<string>("");
  
  // Sorting state
  const [sortBy, setSortBy] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Text input state for dates
  const [startDateText, setStartDateText] = useState("");
  const [endDateText, setEndDateText] = useState("");
  
  // Filter change handler
  const handleFilterChange = () => {
    // Reset to page 1 when filters change
    setPage(1);
  };
  
  // Update text inputs when dates change programmatically (from quick filters)
  useEffect(() => {
    setStartDateText(startDate ? format(startDate, "yyyy-MM-dd") : "");
  }, [startDate]);
  
  useEffect(() => {
    setEndDateText(endDate ? format(endDate, "yyyy-MM-dd") : "");
  }, [endDate]);
  
  // Handle date validation on blur (when user finishes typing)
  const handleStartDateBlur = () => {
    if (!startDateText.trim()) {
      setStartDate(undefined);
      handleFilterChange();
      return;
    }
    
    try {
      // Try to parse various date formats
      let parsedDate: Date | null = null;
      
      // Handle YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(startDateText)) {
        parsedDate = new Date(startDateText + 'T00:00:00.000Z');
      }
      // Handle MM/DD/YYYY format
      else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(startDateText)) {
        const [month, day, year] = startDateText.split('/');
        parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`);
      }
      // Handle MM-DD-YYYY format
      else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(startDateText)) {
        const [month, day, year] = startDateText.split('-');
        parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00.000Z`);
      }
      
      if (parsedDate && !isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
        setStartDate(parsedDate);
        setStartDateText(format(parsedDate, "yyyy-MM-dd")); // Correct the format
        handleFilterChange();
      } else {
        // Invalid date, reset to previous valid date or empty
        setStartDateText(startDate ? format(startDate, "yyyy-MM-dd") : "");
      }
    } catch (error) {
      // Invalid date, reset to previous valid date or empty
      setStartDateText(startDate ? format(startDate, "yyyy-MM-dd") : "");
    }
  };
  
  const handleEndDateBlur = () => {
    if (!endDateText.trim()) {
      setEndDate(undefined);
      handleFilterChange();
      return;
    }
    
    try {
      // Try to parse various date formats
      let parsedDate: Date | null = null;
      
      // Handle YYYY-MM-DD format
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDateText)) {
        parsedDate = new Date(endDateText + 'T23:59:59.999Z');
      }
      // Handle MM/DD/YYYY format
      else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(endDateText)) {
        const [month, day, year] = endDateText.split('/');
        parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59.999Z`);
      }
      // Handle MM-DD-YYYY format
      else if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(endDateText)) {
        const [month, day, year] = endDateText.split('-');
        parsedDate = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T23:59:59.999Z`);
      }
      
      if (parsedDate && !isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
        setEndDate(parsedDate);
        setEndDateText(format(parsedDate, "yyyy-MM-dd")); // Correct the format
        handleFilterChange();
      } else {
        // Invalid date, reset to previous valid date or empty
        setEndDateText(endDate ? format(endDate, "yyyy-MM-dd") : "");
      }
    } catch (error) {
      // Invalid date, reset to previous valid date or empty
      setEndDateText(endDate ? format(endDate, "yyyy-MM-dd") : "");
    }
  };
  
  // Selected transactions for deletion
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Transaction inspection state
  const [inspectionTransaction, setInspectionTransaction] = useState<Transaction | null>(null);
  
  // Fetch transactions with filters
  const { data, isLoading, error, refetch } = useQuery<TransactionsResponse>({
    queryKey: ['/api/transactions', page, limit, merchantId, startDate, endDate, transactionType, transactionId, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      
      if (merchantId) params.append('merchantId', merchantId);
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) params.append('endDate', endDate.toISOString());
      if (transactionType) params.append('type', transactionType);
      if (transactionId.trim()) params.append('transactionId', transactionId.trim());
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);
      
      console.log('Frontend query state:', { 
        page, limit, merchantId, transactionType,
        startDate: startDate?.toISOString(), 
        endDate: endDate?.toISOString(),
        startDateRaw: startDate,
        endDateRaw: endDate
      });
      console.log('API URL:', `/api/transactions?${params.toString()}`);
      
      const response = await fetch(`/api/transactions?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transactions');
      }
      return response.json();
    }
  });
  
  // Fetch merchants for filter dropdown
  const { data: merchantsData } = useQuery<MerchantOption[]>({
    queryKey: ['/api/merchants'],
    queryFn: async () => {
      // Fetch all merchants to populate the filter dropdown
      const response = await fetch('/api/merchants?limit=1000&fields=id,name');
      if (!response.ok) {
        throw new Error('Failed to fetch merchant options');
      }
      const data = await response.json();
      // Map merchants and sort them alphabetically by name
      return data.merchants
        .map((m: any) => ({ id: m.id, name: m.name }))
        .sort((a: MerchantOption, b: MerchantOption) => a.name.localeCompare(b.name));
    }
  });
  
  // Delete transactions mutation
  const deleteMutation = useMutation({
    mutationFn: async (transactionIds: string[]) => {
      const response = await fetch('/api/transactions/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactionIds }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete transactions');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Transactions Deleted",
        description: `${selectedTransactions.length} transaction(s) deleted successfully`,
        variant: "default",
      });
      setSelectedTransactions([]);
      setShowDeleteDialog(false);
      refetch(); // Refetch the transactions list
    },
    onError: (error: Error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleExport = () => {
    // Construct export URL with current filters
    const params = new URLSearchParams();
    
    if (merchantId) params.append('merchantId', merchantId);
    if (startDate) params.append('startDate', startDate.toISOString());
    if (endDate) params.append('endDate', endDate.toISOString());
    if (transactionType) params.append('type', transactionType);
    if (transactionId.trim()) params.append('transactionId', transactionId.trim());
    
    // Open the URL in a new tab or trigger download
    window.open(`/api/transactions/export?${params.toString()}`, '_blank');
  };
  
  // Handle deletion
  const handleDeleteTransactions = () => {
    if (selectedTransactions.length === 0) {
      toast({
        title: "No Transactions Selected",
        description: "Please select at least one transaction to delete",
        variant: "destructive",
      });
      return;
    }
    deleteMutation.mutate(selectedTransactions);
  };
  
  const handleLimitChange = (newLimit: string) => {
    setLimit(parseInt(newLimit));
    setPage(1); // Reset to page 1 when limit changes
  };

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortBy === column) {
      // Same column, toggle order
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to desc for most columns, asc for text columns
      setSortBy(column);
      setSortOrder(column === 'transactionId' || column === 'merchantName' ? 'asc' : 'desc');
    }
    setPage(1); // Reset to page 1 when sorting changes
  };

  // Get sort icon for a column
  const getSortIcon = (column: string) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }
    return sortOrder === 'asc' ? 
      <ArrowUp className="h-4 w-4 text-blue-600" /> : 
      <ArrowDown className="h-4 w-4 text-blue-600" />;
  };

  // Handle refresh functionality
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
  };

  return (
    <MainLayout>
      {/* Transaction Inspection Modal */}
      <Dialog open={!!inspectionTransaction} onOpenChange={(open) => !open && setInspectionTransaction(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
          </DialogHeader>
          {inspectionTransaction && (
            <div className="space-y-6">
              {/* Summary Section */}
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-3">Transaction Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <label className="text-blue-700 font-medium">Transaction ID</label>
                    <p className="font-mono">{inspectionTransaction.transactionId}</p>
                  </div>
                  <div>
                    <label className="text-blue-700 font-medium">Amount</label>
                    <p className={cn(
                      "font-semibold",
                      inspectionTransaction.type === "Debit" ? "text-red-600" : "text-green-600"
                    )}>
                      {formatCurrency(inspectionTransaction.type === "Debit" ? 
                        -Math.abs(inspectionTransaction.amount) : 
                        Math.abs(inspectionTransaction.amount))}
                    </p>
                  </div>
                  <div>
                    <label className="text-blue-700 font-medium">Type</label>
                    <p>
                      <span className={cn(
                        "inline-block px-2 py-1 rounded text-xs font-semibold",
                        inspectionTransaction.type === "Credit" ? "bg-green-100 text-green-800" : 
                        inspectionTransaction.type === "Debit" ? "bg-red-100 text-red-800" : 
                        "bg-blue-100 text-blue-800"
                      )}>
                        {inspectionTransaction.type}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="text-blue-700 font-medium">Date</label>
                    <p>{formatTableDate(inspectionTransaction.date)}</p>
                  </div>
                </div>
              </div>

              {/* Merchant Information */}
              <div className="bg-gray-50 p-4 rounded-lg border">
                <h3 className="font-semibold text-gray-900 mb-3">Merchant Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-gray-700 font-medium">Merchant Name</label>
                    <p>{inspectionTransaction.merchantName}</p>
                  </div>
                  <div>
                    <label className="text-gray-700 font-medium">Merchant ID</label>
                    <p className="font-mono">{inspectionTransaction.merchantId}</p>
                  </div>
                </div>
              </div>

              {/* System Information */}
              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <h3 className="font-semibold text-amber-900 mb-3">System & Audit Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <label className="text-amber-700 font-medium">Source Row</label>
                    <p className="font-mono">{inspectionTransaction.sourceRowNumber || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-amber-700 font-medium">Source File ID</label>
                    <p className="font-mono">{inspectionTransaction.sourceFileId || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-amber-700 font-medium">Recorded At</label>
                    <p>{inspectionTransaction.recordedAt ? formatTableDate(inspectionTransaction.recordedAt) : 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Raw Data Section */}
              {inspectionTransaction.rawData && (
                <div className="bg-slate-50 p-4 rounded-lg border">
                  <h3 className="font-semibold text-slate-900 mb-3">Raw Transaction Data</h3>
                  <div className="bg-white p-3 rounded border overflow-x-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify(inspectionTransaction.rawData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedTransactions.length} selected transaction(s).
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteTransactions}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Transactions</h1>
          <div className="flex space-x-2">
            <Button 
              variant="outline"
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button 
              variant="destructive"
              disabled={selectedTransactions.length === 0}
              onClick={() => setShowDeleteDialog(true)}
            >
              Delete Selected
            </Button>
            <Button onClick={handleExport} className="bg-gradient-to-r from-blue-500 to-blue-700">
              Export CSV
            </Button>
          </div>
        </div>
        
        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Filter transactions by merchant, date range, and type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Merchant filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Merchant</label>
                <Select 
                  value={merchantId || "all"}
                  onValueChange={(value) => {
                    const newMerchantId = value === "all" ? undefined : value;
                    console.log("Selected merchant ID:", newMerchantId);
                    setMerchantId(newMerchantId);
                    handleFilterChange();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Merchants" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Merchants</SelectItem>
                    {merchantsData?.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Transaction ID filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Transaction ID</label>
                <Input
                  type="text"
                  value={transactionId}
                  onChange={(e) => {
                    setTransactionId(e.target.value);
                    handleFilterChange();
                  }}
                  className="w-full"
                  placeholder="Enter Transaction ID"
                />
              </div>
              
              {/* Date range filter */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Date Range</label>
                
                {/* Quick filter buttons */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const today = new Date();
                      const year = today.getFullYear();
                      const month = today.getMonth();
                      const day = today.getDate();
                      const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
                      const endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
                      setStartDate(startOfDay);
                      setEndDate(endOfDay);
                      handleFilterChange();
                    }}
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const today = new Date();
                      const startOfWeek = new Date(today);
                      startOfWeek.setDate(today.getDate() - today.getDay());
                      startOfWeek.setHours(0, 0, 0, 0);
                      const endOfDay = new Date(today);
                      endOfDay.setHours(23, 59, 59, 999);
                      setStartDate(startOfWeek);
                      setEndDate(endOfDay);
                      handleFilterChange();
                    }}
                  >
                    This Week
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const today = new Date();
                      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                      startOfMonth.setHours(0, 0, 0, 0);
                      const endOfDay = new Date(today);
                      endOfDay.setHours(23, 59, 59, 999);
                      setStartDate(startOfMonth);
                      setEndDate(endOfDay);
                      handleFilterChange();
                    }}
                  >
                    This Month
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Set to 2024 since that's where all the transaction data is
                      const startOf2024 = new Date('2024-01-01T00:00:00.000Z');
                      const endOf2024 = new Date('2024-12-31T23:59:59.999Z');
                      setStartDate(startOf2024);
                      setEndDate(endOf2024);
                      handleFilterChange();
                    }}
                  >
                    2024 (All Data)
                  </Button>
                </div>

                {/* Start and End Date inputs */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Start Date</label>
                    <Input
                      type="text"
                      value={startDateText}
                      onChange={(e) => setStartDateText(e.target.value)}
                      onBlur={handleStartDateBlur}
                      className="w-full"
                      placeholder="YYYY-MM-DD or MM/DD/YYYY"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">End Date</label>
                    <Input
                      type="text"
                      value={endDateText}
                      onChange={(e) => setEndDateText(e.target.value)}
                      onBlur={handleEndDateBlur}
                      className="w-full"
                      placeholder="YYYY-MM-DD or MM/DD/YYYY"
                    />
                  </div>
                </div>
              </div>
              
              {/* Transaction type filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Transaction Type</label>
                <Select
                  value={transactionType}
                  onValueChange={(value) => {
                    setTransactionType(value === "all" ? undefined : value);
                    handleFilterChange();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                    <SelectItem value="Debit">Debit</SelectItem>
                    <SelectItem value="Sale">Sale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Clear filters button */}
            <div className="mt-4 flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setMerchantId(undefined);
                  setStartDate(undefined);
                  setEndDate(undefined);
                  setTransactionType(undefined);
                  setTransactionId("");
                  setStartDateText("");
                  setEndDateText("");
                  setSortBy('date');
                  setSortOrder('desc');
                  handleFilterChange();
                }}
              >
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Transactions table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Transaction List</CardTitle>
              <CardDescription>
                {data?.pagination?.totalItems
                  ? `Showing ${data.pagination.totalItems} transactions`
                  : "Loading transactions..."}
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Show:</span>
              <Select
                value={limit.toString()}
                onValueChange={handleLimitChange}
              >
                <SelectTrigger className="w-[80px]">
                  <SelectValue placeholder="10" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              // Loading state
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex space-x-4">
                    <Skeleton className="h-12 w-full" />
                  </div>
                ))}
              </div>
            ) : error ? (
              // Error state
              <div className="text-center py-8 text-red-500">
                <p>Error loading transactions. Please try again.</p>
              </div>
            ) : data?.transactions.length === 0 ? (
              // Empty state
              <div className="text-center py-8 text-gray-500">
                <p>No transactions found matching your filters.</p>
              </div>
            ) : (
              // Data table
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={
                            data?.transactions && data.transactions.length > 0 && 
                            selectedTransactions.length === data.transactions.length
                          }
                          onCheckedChange={(checked) => {
                            if (checked && data?.transactions) {
                              setSelectedTransactions(data.transactions.map(t => t.transactionId));
                            } else {
                              setSelectedTransactions([]);
                            }
                          }}
                          aria-label="Select all transactions"
                        />
                      </TableHead>
                      <TableHead>
                        <button
                          className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded transition-colors"
                          onClick={() => handleSort('transactionId')}
                        >
                          Transaction ID
                          {getSortIcon('transactionId')}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded transition-colors"
                          onClick={() => handleSort('merchantName')}
                        >
                          Merchant
                          {getSortIcon('merchantName')}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded transition-colors"
                          onClick={() => handleSort('type')}
                        >
                          Type
                          {getSortIcon('type')}
                        </button>
                      </TableHead>
                      <TableHead>
                        <button
                          className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded transition-colors"
                          onClick={() => handleSort('date')}
                        >
                          Date
                          {getSortIcon('date')}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">
                        <button
                          className="flex items-center gap-2 hover:bg-gray-50 p-1 rounded transition-colors ml-auto"
                          onClick={() => handleSort('amount')}
                        >
                          Amount
                          {getSortIcon('amount')}
                        </button>
                      </TableHead>
                      <TableHead className="w-[50px]">CSV</TableHead>
                      <TableHead className="w-[50px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.transactions.map((transaction) => (
                      <TableRow key={transaction.transactionId}>
                        <TableCell>
                          <Checkbox
                            checked={selectedTransactions.includes(transaction.transactionId)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedTransactions([...selectedTransactions, transaction.transactionId]);
                              } else {
                                setSelectedTransactions(
                                  selectedTransactions.filter(id => id !== transaction.transactionId)
                                );
                              }
                            }}
                            aria-label={`Select transaction ${transaction.transactionId}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {transaction.transactionId}
                        </TableCell>
                        <TableCell>
                          <Link href={`/merchants/${transaction.merchantId}`} className="text-blue-600 hover:underline">
                            {transaction.merchantName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <span className={cn(
                            "inline-block px-2 py-1 rounded text-xs font-semibold",
                            transaction.type === "Credit" ? "bg-green-100 text-green-800" : 
                            transaction.type === "Debit" ? "bg-red-100 text-red-800" : 
                            "bg-blue-100 text-blue-800"
                          )}>
                            {transaction.type}
                          </span>
                        </TableCell>
                        <TableCell>{formatTableDate(transaction.date)}</TableCell>
                        <TableCell className={cn(
                          "text-right",
                          transaction.type === "Debit" ? "text-red-600" : "text-green-600"
                        )}>
                          {formatCurrency(transaction.type === "Debit" ? -Math.abs(transaction.amount) : Math.abs(transaction.amount))}
                        </TableCell>
                        <TableCell className="text-center">
                          <RawDataTooltip 
                            rawData={transaction.rawData || null}
                            sourceRowNumber={transaction.sourceRowNumber || undefined}
                            recordedAt={(transaction as any).recordedAt}
                            sourceFileName={(transaction as any).sourceFileName}
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInspectionTransaction(transaction)}
                            className="h-8 w-8 p-0"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            
            {/* Pagination */}
            {data && data.pagination.totalPages > 1 && (
              <div className="mt-6 flex justify-center">
                <TransactionPagination
                  currentPage={page}
                  totalPages={data.pagination.totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}