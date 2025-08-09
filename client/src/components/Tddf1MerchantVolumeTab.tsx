import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ArrowUpDown, Building2, Terminal, CreditCard, Search, ExternalLink } from "lucide-react";
import { useLocation } from "wouter";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface Tddf1Merchant {
  merchant_id: string;
  merchant_name: string;
  total_transactions: number;
  total_amount: number;
  total_net_deposits: number;
  unique_terminals: number;
  first_seen_date: string;
  last_seen_date: string;
  record_count: number;
  last_updated: string;
  source_files: string[];
  last_processed_file: string;
}

interface Tddf1MerchantsResponse {
  data: Tddf1Merchant[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

function Tddf1MerchantVolumeTab() {
  const [, setLocation] = useLocation();
  
  // State for filters and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("total_transactions");
  const [sortOrder, setSortOrder] = useState("desc");

  // Reset page to 1 when search query or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  // Query TDDF1 merchants
  const { data, isLoading, error, refetch } = useQuery<Tddf1MerchantsResponse>({
    queryKey: ['/api/tddf1/merchants', currentPage, itemsPerPage, searchQuery, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      const response = await fetch(`/api/tddf1/merchants?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch TDDF1 merchants');
      }
      return response.json();
    }
  });

  const merchants = data?.data || [];
  const pagination = data?.pagination;

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return <ArrowUpDown className="h-4 w-4" />;
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const handleMerchantClick = (merchant: Tddf1Merchant) => {
    // Navigate to merchant daily view with the last seen date
    const dateStr = merchant.last_seen_date;
    setLocation(`/merchant/${merchant.merchant_id}/${dateStr}`);
  };

  const formatTableDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading TDDF1 merchants...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-600 mb-4">Failed to load TDDF1 merchants</p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            TDDF1 Merchants Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{formatNumber(pagination?.totalItems || 0)}</div>
              <div className="text-sm text-muted-foreground">Total Merchants</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {formatNumber(merchants.reduce((sum, m) => sum + m.total_transactions, 0))}
              </div>
              <div className="text-sm text-muted-foreground">Total Transactions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {formatCurrency(merchants.reduce((sum, m) => sum + m.total_amount, 0))}
              </div>
              <div className="text-sm text-muted-foreground">Total Amount</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">
                {formatNumber(merchants.reduce((sum, m) => sum + m.unique_terminals, 0))}
              </div>
              <div className="text-sm text-muted-foreground">Total Terminals</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters and Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search merchants by ID or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 per page</SelectItem>
                  <SelectItem value="20">20 per page</SelectItem>
                  <SelectItem value="50">50 per page</SelectItem>
                  <SelectItem value="100">100 per page</SelectItem>
                </SelectContent>
              </Select>
              
              <Button 
                onClick={() => refetch()} 
                variant="outline" 
                size="sm"
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Merchants Table */}
      <Card>
        <CardContent className="p-0">
          {merchants.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No merchants found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search criteria' : 'No TDDF1 merchant data available'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('merchant_id')}
                        className="h-auto p-0 font-medium"
                      >
                        Merchant ID {getSortIcon('merchant_id')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('merchant_name')}
                        className="h-auto p-0 font-medium"
                      >
                        Merchant Name {getSortIcon('merchant_name')}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('total_transactions')}
                        className="h-auto p-0 font-medium"
                      >
                        Transactions {getSortIcon('total_transactions')}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('total_amount')}
                        className="h-auto p-0 font-medium"
                      >
                        Amount {getSortIcon('total_amount')}
                      </Button>
                    </TableHead>
                    <TableHead className="text-right">
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('unique_terminals')}
                        className="h-auto p-0 font-medium"
                      >
                        Terminals {getSortIcon('unique_terminals')}
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort('last_seen_date')}
                        className="h-auto p-0 font-medium"
                      >
                        Last Seen {getSortIcon('last_seen_date')}
                      </Button>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {merchants.map((merchant) => (
                    <TableRow 
                      key={merchant.merchant_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleMerchantClick(merchant)}
                    >
                      <TableCell className="font-mono text-sm">
                        {merchant.merchant_id}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {merchant.merchant_name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">
                          {formatNumber(merchant.total_transactions)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(merchant.total_amount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Terminal className="h-3 w-3 text-muted-foreground" />
                          {formatNumber(merchant.unique_terminals)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatTableDate(merchant.last_seen_date)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMerchantClick(merchant);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to{' '}
                    {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
                    {pagination.totalItems} merchants
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(pagination.currentPage - 1)}
                      disabled={pagination.currentPage === 1}
                    >
                      Previous
                    </Button>
                    
                    <span className="text-sm">
                      Page {pagination.currentPage} of {pagination.totalPages}
                    </span>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(pagination.currentPage + 1)}
                      disabled={pagination.currentPage === pagination.totalPages}
                    >
                      Next
                    </Button>
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

export default Tddf1MerchantVolumeTab;