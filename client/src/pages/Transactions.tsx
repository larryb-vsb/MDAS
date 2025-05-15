import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

// Types
interface Transaction {
  id: string;
  transactionId: string; // Added to match the API response
  merchantId: string;
  merchantName: string;
  amount: number;
  date: string;
  type: string;
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
  const [limit, setLimit] = useState(20);
  const [merchantId, setMerchantId] = useState<string | undefined>(undefined);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [transactionType, setTransactionType] = useState<string | undefined>(undefined);
  
  // Selected transactions for deletion
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Fetch transactions with filters
  const { data, isLoading, error, refetch } = useQuery<TransactionsResponse>({
    queryKey: ['/api/transactions', page, limit, merchantId, startDate, endDate, transactionType],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      
      if (merchantId) params.append('merchantId', merchantId);
      if (startDate) params.append('startDate', startDate.toISOString());
      if (endDate) params.append('endDate', endDate.toISOString());
      if (transactionType) params.append('type', transactionType);
      
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
  
  const handleFilterChange = (customMerchantId?: string) => {
    // Reset to page 1 when filters change
    console.log("Applying filter - merchantId:", customMerchantId !== undefined ? customMerchantId : merchantId);
    setPage(1);
    // If a custom merchantId is provided, use it for the refetch
    const params = new URLSearchParams();
    params.append('page', '1');
    params.append('limit', limit.toString());
    
    if (customMerchantId !== undefined) {
      if (customMerchantId !== null) params.append('merchantId', customMerchantId);
    } else if (merchantId) {
      params.append('merchantId', merchantId);
    }
    
    if (startDate) params.append('startDate', startDate.toISOString());
    if (endDate) params.append('endDate', endDate.toISOString());
    if (transactionType) params.append('type', transactionType);
    
    // Manual fetch to avoid React Query update timing issues
    fetch(`/api/transactions?${params.toString()}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch transactions');
        }
        return response.json();
      })
      .then(data => {
        // Force update React Query cache and trigger refetch
        refetch();
      })
      .catch(error => {
        console.error("Error fetching transactions:", error);
      });
  };
  
  const handleLimitChange = (newLimit: string) => {
    setLimit(parseInt(newLimit));
    setPage(1); // Reset to page 1 when limit changes
  };

  return (
    <MainLayout>
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
                    // Pass the new merchant ID directly to handleFilterChange
                    handleFilterChange(newMerchantId);
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
              
              {/* Start date filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Start Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={(date) => {
                        setStartDate(date);
                        handleFilterChange();
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              {/* End date filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium">End Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={(date) => {
                        setEndDate(date);
                        handleFilterChange();
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
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
                  <SelectValue placeholder="20" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
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
                      <TableHead>Transaction ID</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
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
                        <TableCell>{formatDate(transaction.date)}</TableCell>
                        <TableCell className={cn(
                          "text-right",
                          transaction.amount >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {formatCurrency(transaction.amount)}
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