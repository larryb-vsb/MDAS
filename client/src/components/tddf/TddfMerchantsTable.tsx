import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eye, Search, ExternalLink, Monitor, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTableDate } from "@/lib/date-utils";

// TerminalIdDisplay component for linking terminals
function TerminalIdDisplay({ terminalId }: { terminalId?: string }) {
  const { data: terminals } = useQuery({
    queryKey: ['/api/terminals'],
    queryFn: () => fetch('/api/terminals', { credentials: 'include' }).then(res => res.json()),
  });

  if (!terminalId) {
    return (
      <span className="text-xs text-muted-foreground font-mono">
        N/A
      </span>
    );
  }

  // Find terminal by VAR mapping pattern: V8912064 → 78912064
  const terminal = terminals?.find((t: any) => {
    if (!terminalId) return false;
    // Extract numeric part from V Number and add "7" prefix for comparison
    const vNumberNumeric = t.v_number?.replace('V', '');
    const expectedTerminalId = '7' + vNumberNumeric;
    return expectedTerminalId === terminalId;
  });

  // If terminal found and V Number matches Terminal ID
  if (terminal) {
    return (
      <Link href={`/terminals/${terminal.id}?referrer=tddf-merchants`}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 p-1 text-xs font-mono text-blue-600 hover:text-blue-800 hover:bg-blue-50"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          {terminal.v_number}
        </Button>
      </Link>
    );
  }

  // If no matching V Number found - convert Terminal ID to V Number and link to orphan terminal
  let displayValue = terminalId;
  if (terminalId.startsWith('7') && terminalId.length >= 8) {
    displayValue = 'V' + terminalId.substring(1);
  }

  return (
    <Link href={`/orphan-terminals/${terminalId}?referrer=tddf-merchants`}>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 p-1 text-xs font-mono text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 hover:text-orange-800"
      >
        <ExternalLink className="h-3 w-3 mr-1" />
        {displayValue}
      </Button>
    </Link>
  );
}

interface TddfMerchant {
  merchantName: string;
  merchantAccountNumber: string;
  mccCode: string;
  transactionTypeIdentifier: string;
  terminalCount: number;
  totalTransactions: number;
  totalAmount: number;
  lastTransactionDate: string;
  posRelativeCode?: string;
}

interface TddfTerminal {
  terminalId: string;
  transactionCount: number;
  totalAmount: number;
  lastTransactionDate: string;
}

interface TddfMerchantsResponse {
  data: TddfMerchant[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export default function TddfMerchantsTable() {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("totalTransactions");
  const [sortOrder, setSortOrder] = useState("desc");
  const [detailsRecord, setDetailsRecord] = useState<TddfMerchant | null>(null);
  
  // Advanced filtering states
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [minTransactions, setMinTransactions] = useState("");
  const [maxTransactions, setMaxTransactions] = useState("");
  const [minTerminals, setMinTerminals] = useState("");
  const [maxTerminals, setMaxTerminals] = useState("");

  // Cache refresh mutation
  const refreshCacheMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/tddf-merchants/refresh-cache", {});
      const data = await response.json();
      return data;
    },
    onSuccess: (data) => {
      // Handle the response structure correctly
      const rebuilt = data.rebuilt || 0;
      const buildTimeMs = data.performance?.buildTimeMs || 0;
      
      toast({
        title: "Cache Refreshed",
        description: `Successfully rebuilt ${rebuilt} merchants in ${buildTimeMs}ms`,
      });
      // Invalidate and refetch the merchants data
      queryClient.invalidateQueries({ queryKey: ["/api/tddf/merchants"] });
    },
    onError: (error: any) => {
      toast({
        title: "Cache Refresh Failed",
        description: error.message || "Failed to refresh merchant cache",
        variant: "destructive",
      });
    },
  });

  const { data, isLoading, error, refetch } = useQuery<TddfMerchantsResponse>({
    queryKey: ["/api/tddf/merchants", currentPage, itemsPerPage, search, sortBy, sortOrder, minAmount, maxAmount, minTransactions, maxTransactions, minTerminals, maxTerminals],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      if (search) params.append('search', search);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);
      if (minAmount) params.append('minAmount', minAmount);
      if (maxAmount) params.append('maxAmount', maxAmount);
      if (minTransactions) params.append('minTransactions', minTransactions);
      if (maxTransactions) params.append('maxTransactions', maxTransactions);
      if (minTerminals) params.append('minTerminals', minTerminals);
      if (maxTerminals) params.append('maxTerminals', maxTerminals);
      
      const response = await fetch(`/api/tddf/merchants?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch TDDF merchants');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Terminal pagination and sorting state
  const [terminalPage, setTerminalPage] = useState(1);
  const [terminalItemsPerPage, setTerminalItemsPerPage] = useState(10);
  const [terminalSortBy, setTerminalSortBy] = useState('transactionCount');
  const [terminalSortOrder, setTerminalSortOrder] = useState('desc');

  // Query for terminals when details modal is open
  const { data: terminalsData, isLoading: terminalsLoading } = useQuery<TddfTerminal[]>({
    queryKey: ["/api/tddf/merchants", detailsRecord?.merchantAccountNumber, "terminals"],
    queryFn: async () => {
      if (!detailsRecord?.merchantAccountNumber) return [];
      
      console.log('[TDDF TERMINALS] Fetching terminals for merchant:', detailsRecord.merchantAccountNumber);
      
      const response = await fetch(`/api/tddf/merchants/${detailsRecord.merchantAccountNumber}/terminals`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch merchant terminals');
      }
      
      const result = await response.json();
      console.log('[TDDF TERMINALS] Terminal response:', result);
      return result;
    },
    enabled: !!detailsRecord?.merchantAccountNumber, // Only run when modal is open with merchant data
  });

  // Client-side sorting and pagination for terminals
  const sortedTerminals = terminalsData ? [...terminalsData].sort((a, b) => {
    let aValue = a[terminalSortBy as keyof TddfTerminal];
    let bValue = b[terminalSortBy as keyof TddfTerminal];
    
    // Handle different data types
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
    }
    
    if (aValue < bValue) return terminalSortOrder === 'asc' ? -1 : 1;
    if (aValue > bValue) return terminalSortOrder === 'asc' ? 1 : -1;
    return 0;
  }) : [];

  // Paginated terminals
  const totalTerminals = sortedTerminals.length;
  const terminalTotalPages = Math.ceil(totalTerminals / terminalItemsPerPage);
  const terminalStartIndex = (terminalPage - 1) * terminalItemsPerPage;
  const paginatedTerminals = sortedTerminals.slice(terminalStartIndex, terminalStartIndex + terminalItemsPerPage);

  // Handle terminal sorting
  const handleTerminalSort = (field: string) => {
    if (terminalSortBy === field) {
      setTerminalSortOrder(terminalSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setTerminalSortBy(field);
      setTerminalSortOrder('desc');
    }
    setTerminalPage(1); // Reset to first page when sorting
  };

  // Reset terminal pagination when modal opens with new merchant
  const resetTerminalPagination = () => {
    setTerminalPage(1);
    setTerminalSortBy('transactionCount');
    setTerminalSortOrder('desc');
  };

  // Reset terminal pagination when opening a new merchant modal
  useEffect(() => {
    if (detailsRecord) {
      resetTerminalPagination();
    }
  }, [detailsRecord?.merchantAccountNumber]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return formatTableDate(date.toISOString());
    } catch (error) {
      return 'N/A';
    }
  };

  const merchants = data?.data || [];
  const totalRecords = data?.pagination?.totalItems || 0;
  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  const handleSearch = (value: string) => {
    setSearch(value);
    setCurrentPage(1); // Reset to first page when searching
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>
            TDDF Merchants ({totalRecords})
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show:</span>
            <Select
              value={itemsPerPage.toString()}
              onValueChange={(value) => {
                setItemsPerPage(parseInt(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((option) => (
                  <SelectItem key={option} value={option.toString()}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search and Filter Controls */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Primary Search Bar */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search merchants, MCC code, account number..."
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => refreshCacheMutation.mutate()}
                disabled={refreshCacheMutation.isPending}
                className="whitespace-nowrap"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshCacheMutation.isPending ? 'animate-spin' : ''}`} />
                {refreshCacheMutation.isPending ? 'Refreshing...' : 'Refresh from TDDF data'}
              </Button>
              <Button 
                variant={showAdvancedFilters ? "default" : "outline"}
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className="whitespace-nowrap"
              >
                Advanced Filters
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearch("");
                  setSortBy("totalTransactions");
                  setSortOrder("desc");
                  setCurrentPage(1);
                  setMinAmount("");
                  setMaxAmount("");
                  setMinTransactions("");
                  setMaxTransactions("");
                  setMinTerminals("");
                  setMaxTerminals("");
                  setShowAdvancedFilters(false);
                }}
                className="whitespace-nowrap"
              >
                Clear All
              </Button>
            </div>
          </div>
          
          {/* Sorting Controls */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex gap-2 flex-wrap">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merchantName">Merchant Name</SelectItem>
                  <SelectItem value="merchantAccountNumber">Account Number</SelectItem>
                  <SelectItem value="mccCode">MCC Code</SelectItem>
                  <SelectItem value="transactionTypeIdentifier">Transaction Type</SelectItem>
                  <SelectItem value="terminalCount">Terminal Count</SelectItem>
                  <SelectItem value="totalTransactions">Total Transactions</SelectItem>
                  <SelectItem value="totalAmount">Total Amount</SelectItem>
                  <SelectItem value="lastTransactionDate">Last Transaction</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortOrder} onValueChange={setSortOrder}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">
                    {sortBy === 'merchantName' || sortBy === 'merchantAccountNumber' || sortBy === 'mccCode' || sortBy === 'transactionTypeIdentifier' 
                      ? 'A to Z' 
                      : sortBy === 'lastTransactionDate' 
                      ? 'Oldest First' 
                      : 'Lowest First'}
                  </SelectItem>
                  <SelectItem value="desc">
                    {sortBy === 'merchantName' || sortBy === 'merchantAccountNumber' || sortBy === 'mccCode' || sortBy === 'transactionTypeIdentifier' 
                      ? 'Z to A' 
                      : sortBy === 'lastTransactionDate' 
                      ? 'Newest First' 
                      : 'Highest First'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Quick Sort Buttons */}
            <div className="flex gap-1 flex-wrap">
              <Button 
                variant={sortBy === 'merchantName' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => {
                  setSortBy('merchantName');
                  setSortOrder(sortBy === 'merchantName' && sortOrder === 'asc' ? 'desc' : 'asc');
                }}
              >
                Name {sortBy === 'merchantName' && (sortOrder === 'asc' ? '↑' : '↓')}
              </Button>
              <Button 
                variant={sortBy === 'totalTransactions' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => {
                  setSortBy('totalTransactions');
                  setSortOrder(sortBy === 'totalTransactions' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}
              >
                Transactions {sortBy === 'totalTransactions' && (sortOrder === 'asc' ? '↑' : '↓')}
              </Button>
              <Button 
                variant={sortBy === 'totalAmount' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => {
                  setSortBy('totalAmount');
                  setSortOrder(sortBy === 'totalAmount' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}
              >
                Amount {sortBy === 'totalAmount' && (sortOrder === 'asc' ? '↑' : '↓')}
              </Button>
              <Button 
                variant={sortBy === 'terminalCount' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => {
                  setSortBy('terminalCount');
                  setSortOrder(sortBy === 'terminalCount' && sortOrder === 'desc' ? 'asc' : 'desc');
                }}
              >
                Terminals {sortBy === 'terminalCount' && (sortOrder === 'asc' ? '↑' : '↓')}
              </Button>
            </div>
          </div>
          
          {/* Advanced Filters Panel */}
          {showAdvancedFilters && (
            <div className="border rounded-lg p-4 bg-muted/10 space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">Advanced Filtering Options</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Amount Range Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Total Amount Range</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Min $"
                      value={minAmount}
                      onChange={(e) => setMinAmount(e.target.value)}
                      className="text-xs"
                      type="number"
                    />
                    <Input
                      placeholder="Max $"
                      value={maxAmount}
                      onChange={(e) => setMaxAmount(e.target.value)}
                      className="text-xs"
                      type="number"
                    />
                  </div>
                </div>
                
                {/* Transaction Count Range Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Transaction Count Range</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Min"
                      value={minTransactions}
                      onChange={(e) => setMinTransactions(e.target.value)}
                      className="text-xs"
                      type="number"
                    />
                    <Input
                      placeholder="Max"
                      value={maxTransactions}
                      onChange={(e) => setMaxTransactions(e.target.value)}
                      className="text-xs"
                      type="number"
                    />
                  </div>
                </div>
                
                {/* Terminal Count Range Filter */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Terminal Count Range</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Min"
                      value={minTerminals}
                      onChange={(e) => setMinTerminals(e.target.value)}
                      className="text-xs"
                      type="number"
                    />
                    <Input
                      placeholder="Max"
                      value={maxTerminals}
                      onChange={(e) => setMaxTerminals(e.target.value)}
                      className="text-xs"
                      type="number"
                    />
                  </div>
                </div>
              </div>
              
              {/* Apply Advanced Filters Button */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setMinAmount("");
                    setMaxAmount("");
                    setMinTransactions("");
                    setMaxTransactions("");
                    setMinTerminals("");
                    setMaxTerminals("");
                  }}
                >
                  Clear Filters
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setCurrentPage(1); // Reset to first page when applying filters
                  }}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="text-muted-foreground">Loading TDDF merchants...</div>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-600">
            Error loading merchants: {error.message}
          </div>
        ) : merchants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No merchants found
          </div>
        ) : (
          <div className="space-y-4">
            {/* Merchants Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3">
                      <button 
                        className="flex items-center gap-1 hover:text-primary font-medium"
                        onClick={() => {
                          setSortBy('merchantName');
                          setSortOrder(sortBy === 'merchantName' && sortOrder === 'asc' ? 'desc' : 'asc');
                        }}
                      >
                        Merchant Name
                        {sortBy === 'merchantName' && (
                          <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button 
                        className="flex items-center gap-1 hover:text-primary font-medium"
                        onClick={() => {
                          setSortBy('merchantAccountNumber');
                          setSortOrder(sortBy === 'merchantAccountNumber' && sortOrder === 'asc' ? 'desc' : 'asc');
                        }}
                      >
                        Account Number
                        {sortBy === 'merchantAccountNumber' && (
                          <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button 
                        className="flex items-center gap-1 hover:text-primary font-medium"
                        onClick={() => {
                          setSortBy('mccCode');
                          setSortOrder(sortBy === 'mccCode' && sortOrder === 'asc' ? 'desc' : 'asc');
                        }}
                      >
                        MCC Code
                        {sortBy === 'mccCode' && (
                          <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button 
                        className="flex items-center gap-1 hover:text-primary font-medium"
                        onClick={() => {
                          setSortBy('transactionTypeIdentifier');
                          setSortOrder(sortBy === 'transactionTypeIdentifier' && sortOrder === 'asc' ? 'desc' : 'asc');
                        }}
                      >
                        Transaction Type
                        {sortBy === 'transactionTypeIdentifier' && (
                          <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button 
                        className="flex items-center gap-1 hover:text-primary font-medium"
                        onClick={() => {
                          setSortBy('terminalCount');
                          setSortOrder(sortBy === 'terminalCount' && sortOrder === 'desc' ? 'asc' : 'desc');
                        }}
                      >
                        Terminal Count
                        {sortBy === 'terminalCount' && (
                          <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button 
                        className="flex items-center gap-1 hover:text-primary font-medium"
                        onClick={() => {
                          setSortBy('totalTransactions');
                          setSortOrder(sortBy === 'totalTransactions' && sortOrder === 'desc' ? 'asc' : 'desc');
                        }}
                      >
                        Total Transactions
                        {sortBy === 'totalTransactions' && (
                          <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button 
                        className="flex items-center gap-1 hover:text-primary font-medium"
                        onClick={() => {
                          setSortBy('totalAmount');
                          setSortOrder(sortBy === 'totalAmount' && sortOrder === 'desc' ? 'asc' : 'desc');
                        }}
                      >
                        Total Amount
                        {sortBy === 'totalAmount' && (
                          <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button 
                        className="flex items-center gap-1 hover:text-primary font-medium"
                        onClick={() => {
                          setSortBy('lastTransactionDate');
                          setSortOrder(sortBy === 'lastTransactionDate' && sortOrder === 'desc' ? 'asc' : 'desc');
                        }}
                      >
                        Last Transaction
                        {sortBy === 'lastTransactionDate' && (
                          <span className="text-xs">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                        )}
                      </button>
                    </th>
                    <th className="text-left p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.map((merchant, index) => (
                    <tr key={`${merchant.merchantAccountNumber}-${index}`} className="border-b hover:bg-muted/20">
                      <td className="p-3 font-medium max-w-48 truncate">
                        {merchant.merchantName || 'N/A'}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {merchant.merchantAccountNumber || 'N/A'}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {merchant.mccCode || 'N/A'}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {merchant.transactionTypeIdentifier || 'N/A'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{merchant.terminalCount}</span>
                          {merchant.terminalCount > 0 && merchant.posRelativeCode && (
                            <Link href={`/terminals?search=${merchant.posRelativeCode}`}>
                              <Button variant="outline" size="sm" className="h-6 w-6 p-0">
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono">
                        {merchant.totalTransactions.toLocaleString()}
                      </td>
                      <td className="p-3 font-mono">
                        {formatCurrency(merchant.totalAmount)}
                      </td>
                      <td className="p-3 text-xs">
                        {formatDate(merchant.lastTransactionDate)}
                      </td>
                      <td className="p-3">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setDetailsRecord(merchant)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * itemsPerPage) + 1} to{" "}
                  {Math.min(currentPage * itemsPerPage, totalRecords)} of {totalRecords} merchants
                </div>
                <div className="flex space-x-2">
                  <Button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    variant="outline"
                    size="sm"
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    variant="outline"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Details Modal */}
        <Dialog open={!!detailsRecord} onOpenChange={() => setDetailsRecord(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>TDDF Merchant Details</DialogTitle>
            </DialogHeader>
            {detailsRecord && (
              <Tabs defaultValue="merchant" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="merchant">Merchant Information</TabsTrigger>
                  <TabsTrigger value="terminals">
                    <Monitor className="h-4 w-4 mr-2" />
                    Terminals ({detailsRecord.terminalCount})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="merchant" className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Merchant Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">Merchant Name:</span>
                          <p className="font-medium">{detailsRecord.merchantName || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">Account Number:</span>
                          <p className="font-mono text-sm">{detailsRecord.merchantAccountNumber || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">MCC Code:</span>
                          <p className="font-mono text-sm">{detailsRecord.mccCode || 'N/A'}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">Transaction Type Identifier:</span>
                          <p className="font-mono text-sm">{detailsRecord.transactionTypeIdentifier || 'N/A'}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">Terminal Count:</span>
                          <p className="font-mono">{detailsRecord.terminalCount}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">Total Transactions:</span>
                          <p className="font-mono">{detailsRecord.totalTransactions.toLocaleString()}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">Total Amount:</span>
                          <p className="font-mono text-lg">{formatCurrency(detailsRecord.totalAmount)}</p>
                        </div>
                        <div>
                          <span className="text-sm font-medium text-muted-foreground">Last Transaction Date:</span>
                          <p className="text-sm">{formatDate(detailsRecord.lastTransactionDate)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {detailsRecord.posRelativeCode && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Terminal Integration</h3>
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">POS Relative Code:</p>
                            <p className="font-mono text-sm">{detailsRecord.posRelativeCode}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Used for linking with terminal records via POS Merchant Number
                            </p>
                          </div>
                          <Link href={`/terminals?search=${detailsRecord.posRelativeCode}`}>
                            <Button variant="outline">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Terminals
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="terminals" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Associated Terminals</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        Terminals linked to merchant account {detailsRecord.merchantAccountNumber}
                      </p>
                    </CardHeader>
                    <CardContent>
                      {terminalsLoading ? (
                        <div className="flex items-center justify-center h-64">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        </div>
                      ) : terminalsData && terminalsData.length > 0 ? (
                        <div className="rounded-lg overflow-hidden border border-gray-200">
                          {/* Terminal Controls */}
                          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 mb-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Show:</span>
                              <Select
                                value={terminalItemsPerPage.toString()}
                                onValueChange={(value) => {
                                  setTerminalItemsPerPage(parseInt(value));
                                  setTerminalPage(1);
                                }}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[10, 25, 50, 100].map((option) => (
                                    <SelectItem key={option} value={option.toString()}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <span className="text-sm text-muted-foreground">
                                terminals per page
                              </span>
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Showing {terminalStartIndex + 1}-{Math.min(terminalStartIndex + terminalItemsPerPage, totalTerminals)} of {totalTerminals} terminals
                            </div>
                          </div>

                          <Table>
                            <TableHeader className="bg-gray-50">
                              <TableRow>
                                <TableHead 
                                  className="cursor-pointer hover:bg-gray-100"
                                  onClick={() => handleTerminalSort('terminalId')}
                                >
                                  Terminal {terminalSortBy === 'terminalId' && (terminalSortOrder === 'asc' ? '↑' : '↓')}
                                </TableHead>
                                <TableHead 
                                  className="text-right cursor-pointer hover:bg-gray-100"
                                  onClick={() => handleTerminalSort('transactionCount')}
                                >
                                  Transaction Count {terminalSortBy === 'transactionCount' && (terminalSortOrder === 'asc' ? '↑' : '↓')}
                                </TableHead>
                                <TableHead 
                                  className="text-right cursor-pointer hover:bg-gray-100"
                                  onClick={() => handleTerminalSort('totalAmount')}
                                >
                                  Total Amount {terminalSortBy === 'totalAmount' && (terminalSortOrder === 'asc' ? '↑' : '↓')}
                                </TableHead>
                                <TableHead 
                                  className="cursor-pointer hover:bg-gray-100"
                                  onClick={() => handleTerminalSort('lastTransactionDate')}
                                >
                                  Last Transaction {terminalSortBy === 'lastTransactionDate' && (terminalSortOrder === 'asc' ? '↑' : '↓')}
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paginatedTerminals.map((terminal, index) => (
                                <TableRow key={`${terminal.terminalId}-${index}`}>
                                  <TableCell>
                                    <TerminalIdDisplay terminalId={terminal.terminalId} />
                                  </TableCell>
                                  <TableCell className="text-right">{terminal.transactionCount?.toLocaleString() || 0}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(terminal.totalAmount || 0)}</TableCell>
                                  <TableCell>{formatDate(terminal.lastTransactionDate)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>

                          {/* Terminal Pagination */}
                          {terminalTotalPages > 1 && (
                            <div className="flex items-center justify-between mt-4">
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setTerminalPage(Math.max(1, terminalPage - 1))}
                                  disabled={terminalPage === 1}
                                >
                                  Previous
                                </Button>
                                <span className="text-sm text-muted-foreground">
                                  Page {terminalPage} of {terminalTotalPages}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setTerminalPage(Math.min(terminalTotalPages, terminalPage + 1))}
                                  disabled={terminalPage === terminalTotalPages}
                                >
                                  Next
                                </Button>
                              </div>
                              <div className="flex items-center space-x-1">
                                {/* Page numbers */}
                                {Array.from({ length: Math.min(5, terminalTotalPages) }, (_, i) => {
                                  const pageNum = terminalPage <= 3 ? i + 1 : terminalPage - 2 + i;
                                  if (pageNum > terminalTotalPages) return null;
                                  return (
                                    <Button
                                      key={pageNum}
                                      variant={pageNum === terminalPage ? "default" : "outline"}
                                      size="sm"
                                      onClick={() => setTerminalPage(pageNum)}
                                      className="w-8 h-8 p-0"
                                    >
                                      {pageNum}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <Monitor className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                          <p className="text-gray-500">No terminals found for this merchant</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}