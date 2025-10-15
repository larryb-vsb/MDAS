import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Search, Calendar as CalendarIcon, CreditCard } from "lucide-react";
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

// DT Record interface
interface DtRecord {
  id: string;
  file_id: string;
  record_type: string;
  line_number: number;
  raw_data: string;
  parsed_data: any;
  created_at: string;
  filename: string;
  business_day: string;
  file_processing_time?: string;
  scheduledSlot?: string;
  scheduledSlotLabel?: string;
  slotDayOffset?: number;
}

interface DtRecordsResponse {
  data: DtRecord[];
  total: number;
}

// Helper functions for DT record display (copied from TddfApiDataPage)
function getCardTypeBadges(cardType: string) {
  const badges: Record<string, { label: string; className: string }> = {
    'VD': { label: 'Visa Debit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'VC': { label: 'Visa Credit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'MD': { label: 'Mastercard Debit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'MC': { label: 'Mastercard Credit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'AX': { label: 'American Express', className: 'bg-green-50 text-green-700 border-green-200' },
    'DS': { label: 'Discover', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    'DI': { label: 'Diners Club', className: 'bg-gray-50 text-gray-700 border-gray-200' },
    'JC': { label: 'JCB', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  };
  return badges[cardType] || { label: cardType, className: 'bg-gray-50 text-gray-700 border-gray-200' };
}

function extractCardType(record: any): string | null {
  let cardType = record.parsed_data?.cardType || record.record_data?.cardType;
  
  if (!cardType && record.raw_data && record.raw_data.length >= 254) {
    cardType = record.raw_data.substring(252, 254).trim() || null;
  }
  
  return cardType ? cardType.toUpperCase().trim() : null;
}

function extractMerchantAccountNumber(record: any): string | null {
  let merchantAccountNumber = record.parsed_data?.merchantAccountNumber || 
                              record.record_data?.merchantAccountNumber ||
                              record.parsed_data?.merchant_account_number ||
                              record.record_data?.merchant_account_number;
  
  if (!merchantAccountNumber && (record.record_type === 'BH' || record.record_type === '10')) {
    merchantAccountNumber = record.parsed_data?.acquirerBin || 
                           record.record_data?.acquirerBin ||
                           record.parsed_data?.AcquirerBIN ||
                           record.record_data?.AcquirerBIN;
  }
  
  // Normalize account number by removing leading zeros and padding to 16 digits
  if (merchantAccountNumber) {
    const cleaned = merchantAccountNumber.toString().replace(/^0+/, '');
    merchantAccountNumber = cleaned.padStart(16, '0');
  }
  
  return merchantAccountNumber;
}

function extractTransactionDate(record: any): string | null {
  const transactionDate = record.parsed_data?.TransactionDate || 
                         record.record_data?.TransactionDate ||
                         record.parsed_data?.transactionDate ||
                         record.record_data?.transactionDate;
  
  if (transactionDate) {
    try {
      const date = new Date(transactionDate);
      if (!isNaN(date.getTime())) {
        return format(date, 'yyyy-MM-dd');
      }
    } catch (e) {
      return null;
    }
  }
  return null;
}

function extractTransactionAmount(record: any): number | null {
  const transactionAmount = record.parsed_data?.TransactionAmount || 
                           record.record_data?.TransactionAmount ||
                           record.parsed_data?.transactionAmount ||
                           record.record_data?.transactionAmount ||
                           record.parsed_data?.transaction_amount ||
                           record.record_data?.transaction_amount;
  
  if (transactionAmount !== null && transactionAmount !== undefined) {
    return Number(transactionAmount);
  }
  return null;
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

// MCC/TDDF Transactions Tab Component
function MccTddfTransactionsTab() {
  const [merchantLookup, setMerchantLookup] = useState<Record<string, string>>({});

  // Fetch last 100 DT records
  const { data, isLoading, error } = useQuery<DtRecordsResponse>({
    queryKey: ["/api/tddf-records/dt-latest"],
  });

  // Fetch merchant lookup data
  const { data: lookupData } = useQuery<Record<string, string>>({
    queryKey: ['/api/merchants/lookup-map'],
    enabled: (data?.data?.length ?? 0) > 0,
  });

  // Update merchant lookup when data changes
  useEffect(() => {
    if (lookupData) {
      setMerchantLookup(lookupData);
    }
  }, [lookupData]);

  const getMerchantName = (merchantAccount: string | null): string | null => {
    if (!merchantAccount) return null;
    return merchantLookup[merchantAccount] || null;
  };

  // Handle refresh
  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/tddf-records/dt-latest"] });
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-600">
            Showing last 100 DT (Detail Transaction) records
          </p>
        </div>

        <Button 
          variant="outline"
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-2"
          data-testid="button-refresh-dt"
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
              Failed to load DT records. Please try again.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Type</TableHead>
                    <TableHead>Transaction Details</TableHead>
                    <TableHead className="w-40">File</TableHead>
                    <TableHead className="w-16">Line</TableHead>
                    <TableHead className="w-32">Business Day</TableHead>
                    <TableHead className="w-24">Scheduled Slot</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.data && data.data.length > 0 ? (
                    data.data.map((record) => (
                      <TableRow key={record.id} data-testid={`row-dt-${record.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge 
                              className="bg-blue-500 hover:bg-blue-600 text-white"
                              data-testid={`badge-dt-${record.id}`}
                            >
                              DT
                            </Badge>
                            {/* Card type badge */}
                            {(() => {
                              const cardType = extractCardType(record);
                              return cardType ? (
                                <span 
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getCardTypeBadges(cardType).className}`}
                                  data-testid={`badge-card-type-${cardType.toLowerCase()}`}
                                >
                                  <CreditCard className="h-3 w-3" />
                                  {getCardTypeBadges(cardType).label}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="flex items-center gap-3 text-sm">
                            {/* Merchant Account and Name */}
                            {(() => {
                              const merchantAccountNumber = extractMerchantAccountNumber(record);
                              const merchantName = getMerchantName(merchantAccountNumber);
                              return merchantAccountNumber ? (
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-blue-600">
                                    {merchantAccountNumber}
                                  </span>
                                  {merchantName && (
                                    <span className="text-xs font-semibold text-green-600">
                                      {merchantName}
                                    </span>
                                  )}
                                </div>
                              ) : null;
                            })()}
                            
                            {/* Transaction Date and Amount */}
                            {(() => {
                              const transactionDate = extractTransactionDate(record);
                              const transactionAmount = extractTransactionAmount(record);
                              return (transactionDate || transactionAmount !== null) ? (
                                <div className="ml-auto flex items-center gap-3">
                                  {transactionDate && (
                                    <span className="flex items-center gap-1 text-blue-600 font-medium">
                                      <CalendarIcon className="h-4 w-4" />
                                      {transactionDate}
                                    </span>
                                  )}
                                  {transactionAmount !== null && (
                                    <span className="font-medium text-gray-700">
                                      ${Number(transactionAmount).toFixed(2)}
                                    </span>
                                  )}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="truncate text-sm" title={record.filename}>
                          {record.filename || 'Unknown'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{record.line_number || 'N/A'}</TableCell>
                        <TableCell className="text-sm">
                          {record.business_day ? format(new Date(record.business_day), 'MMM d, yyyy') : 'N/A'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {record.scheduledSlotLabel || 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                        No DT records found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {/* Footer */}
              {data && data.total > 0 && (
                <div className="p-4 border-t">
                  <div className="text-sm text-gray-600">
                    Showing {data.total} most recent DT transaction records
                  </div>
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
            <MccTddfTransactionsTab />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
