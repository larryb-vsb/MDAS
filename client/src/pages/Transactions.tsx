import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import MainLayout from "@/components/layout/MainLayout";

// ACH Transaction interface matching backend
interface AchTransaction {
  id: string;
  merchant_name: string;
  merchant_id: string;
  account_number: string;
  amount: string;
  transaction_date: string;
  code: string;
  description: string;
  company: string;
  trace_number: string;
  created_at: string;
  updated_at: string;
  file_source: string;
}

interface TransactionsResponse {
  data: AchTransaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Helper function to format currency
const formatCurrency = (amount: string | number) => {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numAmount);
};

// Helper function to format date
const formatDate = (dateString: string) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return format(date, "MMM d, yyyy");
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
  const getPageNumbers = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    
    if (totalPages <= maxPagesToShow) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= maxPagesToShow; i++) {
          pageNumbers.push(i);
        }
      } else if (currentPage >= totalPages - 2) {
        for (let i = totalPages - maxPagesToShow + 1; i <= totalPages; i++) {
          pageNumbers.push(i);
        }
      } else {
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

// ACH Transactions Tab Component
function AchTransactionsTab() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [sortBy, setSortBy] = useState<string>('transaction_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");

  // Fetch ACH transactions
  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('sortBy', sortBy);
    params.append('sortOrder', sortOrder);
    if (search) params.append('search', search);
    return `/api/transactions?${params.toString()}`;
  };

  const { data, isLoading, error } = useQuery<TransactionsResponse>({
    queryKey: [buildQueryUrl()],
  });

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
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

  // Handle search
  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  // Handle refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
  };

  // Handle limit change
  const handleLimitChange = (newLimit: string) => {
    setLimit(parseInt(newLimit));
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search merchant, trace #, company..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="w-80"
              data-testid="input-search-transactions"
            />
            <Button onClick={handleSearch} variant="outline" size="sm" data-testid="button-search">
              <Search className="h-4 w-4" />
            </Button>
          </div>
          
          <Select value={limit.toString()} onValueChange={handleLimitChange}>
            <SelectTrigger className="w-32" data-testid="select-limit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10 per page</SelectItem>
              <SelectItem value="25">25 per page</SelectItem>
              <SelectItem value="50">50 per page</SelectItem>
              <SelectItem value="100">100 per page</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          variant="outline"
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2"
          data-testid="button-refresh"
        >
          <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600">
              Failed to load transactions. Please try again.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('trace_number')}
                      data-testid="header-trace-number"
                    >
                      <div className="flex items-center gap-2">
                        Trace Number {getSortIcon('trace_number')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('merchant_name')}
                      data-testid="header-merchant-name"
                    >
                      <div className="flex items-center gap-2">
                        Merchant Name {getSortIcon('merchant_name')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('transaction_date')}
                      data-testid="header-transaction-date"
                    >
                      <div className="flex items-center gap-2">
                        Date {getSortIcon('transaction_date')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('code')}
                      data-testid="header-code"
                    >
                      <div className="flex items-center gap-2">
                        Type {getSortIcon('code')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50 text-right" 
                      onClick={() => handleSort('amount')}
                      data-testid="header-amount"
                    >
                      <div className="flex items-center gap-2 justify-end">
                        Amount {getSortIcon('amount')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-50" 
                      onClick={() => handleSort('company')}
                      data-testid="header-company"
                    >
                      <div className="flex items-center gap-2">
                        Company {getSortIcon('company')}
                      </div>
                    </TableHead>
                    <TableHead data-testid="header-description">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data && data.data.length > 0 ? (
                    data.data.map((transaction) => (
                      <TableRow key={transaction.id} data-testid={`row-transaction-${transaction.id}`}>
                        <TableCell className="font-mono text-sm" data-testid={`cell-trace-${transaction.id}`}>
                          {transaction.trace_number}
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`cell-merchant-${transaction.id}`}>
                          {transaction.merchant_name}
                        </TableCell>
                        <TableCell data-testid={`cell-date-${transaction.id}`}>
                          {formatDate(transaction.transaction_date)}
                        </TableCell>
                        <TableCell data-testid={`cell-code-${transaction.id}`}>
                          <span className={cn(
                            "inline-block px-2 py-1 rounded text-xs font-semibold",
                            transaction.code?.toLowerCase().includes('credit') || transaction.code?.toLowerCase().includes('batch')
                              ? "bg-green-100 text-green-800" 
                              : "bg-blue-100 text-blue-800"
                          )}>
                            {transaction.code || 'N/A'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-semibold" data-testid={`cell-amount-${transaction.id}`}>
                          {formatCurrency(transaction.amount)}
                        </TableCell>
                        <TableCell data-testid={`cell-company-${transaction.id}`}>
                          {transaction.company}
                        </TableCell>
                        <TableCell data-testid={`cell-description-${transaction.id}`}>
                          {transaction.description}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                        No transactions found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {data && data.totalPages > 1 && (
                <div className="p-4 border-t flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, data.total)} of {data.total} transactions
                  </div>
                  <TransactionPagination
                    currentPage={page}
                    totalPages={data.totalPages}
                    onPageChange={setPage}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Main Transactions Page
export default function Transactions() {
  return (
    <MainLayout>
      <div className="container mx-auto py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Transactions</h1>
          <p className="text-gray-600 mt-2">View and manage transaction data</p>
        </div>

        <Tabs defaultValue="ach" className="space-y-6">
          <TabsList>
            <TabsTrigger value="ach" data-testid="tab-ach-transactions">
              ACH Transactions
            </TabsTrigger>
            <TabsTrigger value="mcc" data-testid="tab-mcc-tddf">
              MCC/TDDF
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ach">
            <AchTransactionsTab />
          </TabsContent>

          <TabsContent value="mcc">
            <Card>
              <CardHeader>
                <CardTitle>MCC/TDDF Transactions</CardTitle>
                <CardDescription>
                  MCC and TDDF transaction data will be available here
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <p className="text-lg font-medium mb-2">Coming Soon</p>
                  <p className="text-sm">MCC/TDDF transaction view will be added in a future update</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
