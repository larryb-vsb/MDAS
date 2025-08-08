import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, TrendingUp, Users, DollarSign, CreditCard, Building2, X } from 'lucide-react';
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
}

export function Tddf1MerchantVolumeTab({ selectedDate, isDarkMode }: Tddf1MerchantVolumeTabProps) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('totalAmount');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [excludedMerchants, setExcludedMerchants] = useState<string[]>([]);

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

  // Refetch top merchants when exclusions change
  useEffect(() => {
    refetchTopMerchants();
  }, [excludedMerchants, refetchTopMerchants]);

  const getSortIcon = (column: string) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Merchants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats?.totalMerchants || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Avg: {formatCurrency(stats?.avgAmountPerMerchant || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats?.totalTransactions || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Volume: {formatCurrency(stats?.totalAmount || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats?.totalAmount || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Net Deposits: {formatCurrency(stats?.totalNetDeposits || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Terminals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(stats?.totalTerminals || 0)}</div>
            <p className="text-xs text-muted-foreground">
              Max: {formatCurrency(stats?.maxMerchantVolume || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 Merchant Volume Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Top 5 Merchants by Volume
          </CardTitle>
          <CardDescription>
            Highest volume merchants with exclusion capability for deeper analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {excludedMerchants.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">Excluded Merchants:</h4>
              <div className="flex flex-wrap gap-2">
                {excludedMerchants.map(merchantId => (
                  <Badge key={merchantId} variant="secondary" className="flex items-center gap-1">
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

          <div className="space-y-3">
            {topMerchants?.map((merchant, index) => (
              <div key={merchant.merchantId} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Badge variant="outline">#{index + 1}</Badge>
                  <div>
                    <div className="font-medium">{merchant.merchantName}</div>
                    <div className="text-sm text-muted-foreground">ID: {merchant.merchantId}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-medium">{formatCurrency(merchant.totalAmount)}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatNumber(merchant.totalTransactions)} txns
                    </div>
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExcludeMerchant(merchant.merchantId)}
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
      <Card>
        <CardHeader>
          <CardTitle>All Merchants</CardTitle>
          <CardDescription>
            Complete merchant volume data with search and sorting
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search merchants by ID or name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('merchantId')}
                  >
                    Merchant ID {getSortIcon('merchantId')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('merchantName')}
                  >
                    Name {getSortIcon('merchantName')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort('totalTransactions')}
                  >
                    Transactions {getSortIcon('totalTransactions')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort('totalAmount')}
                  >
                    Total Amount {getSortIcon('totalAmount')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort('totalNetDeposits')}
                  >
                    Net Deposits {getSortIcon('totalNetDeposits')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 text-right"
                    onClick={() => handleSort('uniqueTerminals')}
                  >
                    Terminals {getSortIcon('uniqueTerminals')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
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
                    <TableRow key={merchant.merchantId}>
                      <TableCell className="font-medium">{merchant.merchantId}</TableCell>
                      <TableCell>
                        <div>
                          <div>{merchant.merchantName || 'N/A'}</div>
                          {merchant.amexMerchantSellerName && (
                            <div className="text-xs text-muted-foreground">
                              Amex: {merchant.amexMerchantSellerName}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(merchant.totalTransactions)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(merchant.totalAmount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(merchant.totalNetDeposits)}</TableCell>
                      <TableCell className="text-right">{formatNumber(merchant.uniqueTerminals)}</TableCell>
                      <TableCell>{new Date(merchant.lastSeenDate).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {merchantsData?.pagination && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
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
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={merchantsData.pagination.currentPage === merchantsData.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
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