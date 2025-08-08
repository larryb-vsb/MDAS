import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, TrendingUp, Users, DollarSign, CreditCard, Building2, X, MousePointer2 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';

interface Merchant {
  merchantId: string;
  merchantName?: string;
  amexMerchantSellerName?: string;
  totalTransactions: number;
  totalAmount: number;
  totalNetDeposits: number;
  uniqueTerminals: number;
  firstSeenDate: string;
  lastSeenDate: string;
  recordCount: number;
  lastUpdated: string;
  sourceFiles: string[];
  lastProcessedFile?: string;
}

interface MerchantStats {
  totalMerchants: number;
  totalTransactions: number;
  totalAmount: number;
  totalNetDeposits: number;
  totalTerminals: number;
  avgAmountPerMerchant: number;
  maxMerchantVolume: number;
  minMerchantVolume: number;
}

interface TopMerchant {
  merchantId: string;
  merchantName: string;
  totalTransactions: number;
  totalAmount: number;
  totalNetDeposits: number;
  uniqueTerminals: number;
  lastSeenDate: string;
}

interface Tddf1MerchantVolumeTabProps {
  selectedDate: Date;
  isDarkMode: boolean;
  onMerchantFocus?: (merchantId: string, merchantName: string) => void;
}

export function Tddf1MerchantVolumeTab({ selectedDate, isDarkMode, onMerchantFocus }: Tddf1MerchantVolumeTabProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('totalAmount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [excludedMerchants, setExcludedMerchants] = useState<string[]>([]);
  const [, setLocation] = useLocation();

  // Fetch merchant statistics
  const { data: stats } = useQuery<MerchantStats>({
    queryKey: ['/api/tddf1/merchants/stats'],
    refetchInterval: 30000
  });

  // Fetch top 5 merchants by volume (excluding selected ones)
  const { data: topMerchants, refetch: refetchTopMerchants } = useQuery<TopMerchant[]>({
    queryKey: ['/api/tddf1/merchants/top-volume', excludedMerchants],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: '5'
      });
      
      if (excludedMerchants.length > 0) {
        excludedMerchants.forEach(id => params.append('excludeIds', id));
      }
      
      const response = await fetch(`/api/tddf1/merchants/top-volume?${params}`);
      if (!response.ok) throw new Error('Failed to fetch top merchants');
      return response.json();
    },
    refetchInterval: 30000
  });

  // Fetch paginated merchant list
  const { data: merchantsData, isLoading } = useQuery({
    queryKey: ['/api/tddf1/merchants', page, search, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        sortBy,
        sortOrder
      });
      
      if (search) {
        params.set('search', search);
      }
      
      const response = await fetch(`/api/tddf1/merchants?${params}`);
      if (!response.ok) throw new Error('Failed to fetch merchants');
      return response.json();
    },
    refetchInterval: 30000
  });

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleExcludeMerchant = (merchantId: string) => {
    setExcludedMerchants(prev => [...prev, merchantId]);
  };

  const handleIncludeMerchant = (merchantId: string) => {
    setExcludedMerchants(prev => prev.filter(id => id !== merchantId));
  };

  const handleMerchantClick = (merchant: TopMerchant) => {
    // Create a date string for today to simulate daily analysis
    const dateStr = new Date().toISOString().split('T')[0];
    
    // Call focus callback if provided (for daily tab integration)
    if (onMerchantFocus) {
      onMerchantFocus(merchant.merchantId, merchant.merchantName);
    }
    
    // Navigate to merchant view page 
    setLocation(`/merchant/${merchant.merchantId}/${dateStr}`);
  };

  const getDisplayName = (merchant: TopMerchant) => {
    // Extract meaningful name from the merchant name field
    if (merchant.merchantName && merchant.merchantName !== `Merchant ${merchant.merchantId}`) {
      return merchant.merchantName;
    }
    
    // Create a more readable format
    return `Merchant ${merchant.merchantId.slice(-8)}`;
  };

  // Refetch top merchants when exclusions change
  useEffect(() => {
    refetchTopMerchants();
  }, [excludedMerchants, refetchTopMerchants]);

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="space-y-3">
      {/* Summary Statistics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className={`transition-colors ${isDarkMode ? 'bg-gray-900 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className={`text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Total Merchants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className={`text-lg font-bold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatNumber(stats?.totalMerchants || 0)}</div>
            <p className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Avg: {formatCurrency(stats?.avgAmountPerMerchant || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className={`transition-colors ${isDarkMode ? 'bg-gray-900 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className={`text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Total Transactions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className={`text-lg font-bold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatNumber(stats?.totalTransactions || 0)}</div>
            <p className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Volume: {formatCurrency(stats?.totalAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className={`transition-colors ${isDarkMode ? 'bg-gray-900 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className={`text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className={`text-lg font-bold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatCurrency(stats?.totalAmount || 0)}</div>
            <p className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Net Deposits: {formatCurrency(stats?.totalNetDeposits || 0)}
            </p>
          </CardContent>
        </Card>

        <Card className={`transition-colors ${isDarkMode ? 'bg-gray-900 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-3">
            <CardTitle className={`text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Terminals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className={`text-lg font-bold transition-colors ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatNumber(stats?.totalTerminals || 0)}</div>
            <p className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              Max: {formatCurrency(stats?.maxMerchantVolume || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 Merchant Volume Analysis */}
      <Card className={`transition-colors ${isDarkMode ? 'bg-gray-900 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
        <CardHeader className="pb-3">
          <CardTitle className={`flex items-center gap-2 text-sm font-medium transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            <TrendingUp className="h-4 w-4" />
            Top 5 Merchants by Volume
          </CardTitle>
          <CardDescription className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Click merchant names to focus on daily analysis. Shows accumulated net batch and authorization DT values.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {excludedMerchants.length > 0 && (
            <div className="mb-3">
              <h4 className={`text-xs font-medium mb-2 transition-colors ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>Excluded Merchants:</h4>
              <div className="flex flex-wrap gap-2">
                {excludedMerchants.map(merchantId => (
                  <Badge key={merchantId} variant="secondary" className={`flex items-center gap-1 text-xs transition-colors ${isDarkMode ? 'bg-gray-700 text-gray-300 border-gray-600' : 'bg-gray-200 text-gray-700 border-gray-300'}`}>
                    {merchantId}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto p-0.5"
                      onClick={() => handleIncludeMerchant(merchantId)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {topMerchants?.map((merchant, index) => (
              <div key={merchant.merchantId} className={`flex items-center justify-between p-3 border rounded-lg transition-all hover:shadow-md ${isDarkMode ? 'border-gray-600 bg-gray-800 hover:bg-gray-750 hover:border-gray-500' : 'border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300'}`}>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-xs font-medium">#{index + 1}</Badge>
                  <div className="flex-1">
                    <div 
                      className={`text-sm font-medium cursor-pointer transition-colors hover:underline flex items-center gap-2 ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                      onClick={() => handleMerchantClick(merchant)}
                    >
                      {getDisplayName(merchant)}
                      <MousePointer2 className="h-3 w-3" />
                    </div>
                    <div className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      ID: {merchant.merchantId.slice(-8)}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-sm font-medium transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                      {formatCurrency(merchant.totalAmount)}
                    </div>
                    <div className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Net Deposits: {formatCurrency(merchant.totalNetDeposits)}
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={`text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {formatNumber(merchant.totalTransactions)} txns
                    </div>
                    <div className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {merchant.uniqueTerminals} terms
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExcludeMerchant(merchant.merchantId);
                    }}
                    className="text-xs px-2 py-1"
                  >
                    Exclude
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Merchant List */}
      <Card className={`transition-colors ${isDarkMode ? 'bg-gray-900 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
        <CardHeader className="pb-3">
          <CardTitle className={`text-sm font-medium transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>All Merchants</CardTitle>
          <CardDescription className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Complete merchant volume data with search and sorting
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Search */}
          <div className="mb-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search merchants by ID or name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className={`pl-8 text-sm transition-colors ${isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}`}
              />
            </div>
          </div>

          {/* Table */}
          <div className={`rounded-md border transition-colors ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
            <Table>
              <TableHeader>
                <TableRow className={`transition-colors ${isDarkMode ? 'bg-gray-800 border-b-gray-600' : 'bg-gray-50 border-b-gray-200'}`}>
                  <TableHead 
                    className={`cursor-pointer py-2 text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => handleSort('merchantId')}
                  >
                    Merchant ID {getSortIcon('merchantId')}
                  </TableHead>
                  <TableHead 
                    className={`cursor-pointer py-2 text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => handleSort('merchantName')}
                  >
                    Name {getSortIcon('merchantName')}
                  </TableHead>
                  <TableHead 
                    className={`cursor-pointer py-2 text-xs font-medium text-right transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => handleSort('totalTransactions')}
                  >
                    Transactions {getSortIcon('totalTransactions')}
                  </TableHead>
                  <TableHead 
                    className={`cursor-pointer py-2 text-xs font-medium text-right transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => handleSort('totalAmount')}
                  >
                    Total Amount {getSortIcon('totalAmount')}
                  </TableHead>
                  <TableHead 
                    className={`cursor-pointer py-2 text-xs font-medium text-right transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => handleSort('totalNetDeposits')}
                  >
                    Net Deposits {getSortIcon('totalNetDeposits')}
                  </TableHead>
                  <TableHead 
                    className={`cursor-pointer py-2 text-xs font-medium text-right transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => handleSort('uniqueTerminals')}
                  >
                    Terminals {getSortIcon('uniqueTerminals')}
                  </TableHead>
                  <TableHead 
                    className={`cursor-pointer py-2 text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
                    onClick={() => handleSort('lastSeenDate')}
                  >
                    Last Seen {getSortIcon('lastSeenDate')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Loading merchants...
                    </TableCell>
                  </TableRow>
                ) : merchantsData?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      No merchants found
                    </TableCell>
                  </TableRow>
                ) : (
                  merchantsData?.data.map((merchant: Merchant) => (
                    <TableRow key={merchant.merchantId} className={`transition-colors ${isDarkMode ? 'hover:bg-gray-800 border-b-gray-700' : 'hover:bg-gray-50 border-b-gray-100'}`}>
                      <TableCell className={`py-2 text-xs font-medium transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{merchant.merchantId}</TableCell>
                      <TableCell className="py-2">
                        <div>
                          <div className={`text-xs transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{merchant.merchantName || 'N/A'}</div>
                          {merchant.amexMerchantSellerName && (
                            <div className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              Amex: {merchant.amexMerchantSellerName}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={`py-2 text-right text-xs transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{formatNumber(merchant.totalTransactions)}</TableCell>
                      <TableCell className={`py-2 text-right text-xs transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{formatCurrency(merchant.totalAmount)}</TableCell>
                      <TableCell className={`py-2 text-right text-xs transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{formatCurrency(merchant.totalNetDeposits)}</TableCell>
                      <TableCell className={`py-2 text-right text-xs transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{formatNumber(merchant.uniqueTerminals)}</TableCell>
                      <TableCell className={`py-2 text-xs transition-colors ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{new Date(merchant.lastSeenDate).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {merchantsData?.pagination && (
            <div className="flex items-center justify-between mt-3">
              <div className={`text-xs transition-colors ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Showing {((merchantsData.pagination.currentPage - 1) * merchantsData.pagination.itemsPerPage) + 1} to{' '}
                {Math.min(merchantsData.pagination.currentPage * merchantsData.pagination.itemsPerPage, merchantsData.pagination.totalItems)} of{' '}
                {merchantsData.pagination.totalItems} merchants
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={merchantsData.pagination.currentPage === 1}
                  onClick={() => setPage(page - 1)}
                  className="text-xs px-2 py-1"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={merchantsData.pagination.currentPage === merchantsData.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  className="text-xs px-2 py-1"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}