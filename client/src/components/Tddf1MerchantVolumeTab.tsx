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
import { RefreshCw, ArrowUpDown, Building2, Terminal, CreditCard, Search, ExternalLink, Calendar as CalendarIcon } from "lucide-react";
import { useLocation } from "wouter";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { format } from "date-fns";

interface DailyMerchantVolume {
  merchantId: string;
  merchantName: string;
  date: string;
  authorizationTotal: number;
  dtCount: number;  // Aligned with backend sortBy key
  netDepositTotal: number;
  bhCount: number;  // Aligned with backend sortBy key
  recordBreakdown: {
    BH: number;
    DT: number;
    G2: number;
    E1: number;
    P1: number;
    P2: number;
    DR: number;
    AD: number;
  };
  totalRecords: number;
  uniqueTerminals: number;
}

interface Tddf1DailyMerchantsResponse {
  data: DailyMerchantVolume[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
  date: string;
}

interface Tddf1MerchantVolumeTabProps {
  selectedDate?: Date;
  isDarkMode?: boolean;
  onMerchantFocus?: (merchantId: string, merchantName: string) => void;
}

// Record type badge configuration
const getRecordTypeBadge = (type: string, count: number) => {
  const config: Record<string, { label: string; className: string }> = {
    'BH': { label: 'BH', className: 'bg-blue-100 text-blue-800 border-blue-300' },
    'DT': { label: 'DT', className: 'bg-green-100 text-green-800 border-green-300' },
    'G2': { label: 'G2', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    'E1': { label: 'E1', className: 'bg-purple-100 text-purple-800 border-purple-300' },
    'P1': { label: 'P1', className: 'bg-pink-100 text-pink-800 border-pink-300' },
    'P2': { label: 'P2', className: 'bg-orange-100 text-orange-800 border-orange-300' },
    'DR': { label: 'DR', className: 'bg-red-100 text-red-800 border-red-300' },
    'AD': { label: 'AD', className: 'bg-gray-100 text-gray-800 border-gray-300' },
  };
  
  return config[type] || { label: type, className: 'bg-gray-100 text-gray-700 border-gray-200' };
};

const Tddf1MerchantVolumeTab = ({ selectedDate, isDarkMode, onMerchantFocus }: Tddf1MerchantVolumeTabProps = {}) => {
  const [, setLocation] = useLocation();
  
  // State for filters and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("authorizationTotal");
  const [sortOrder, setSortOrder] = useState("desc");

  // Reset page to 1 when search query, itemsPerPage, or selectedDate changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage, selectedDate]);

  // Format date for API
  const dateString = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');

  // Query TDDF1 daily merchants
  const { data, isLoading, error, refetch } = useQuery<Tddf1DailyMerchantsResponse>({
    queryKey: ['/api/tddf1/merchants-by-date', dateString, currentPage, itemsPerPage, searchQuery, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      const response = await fetch(`/api/tddf1/merchants-by-date/${dateString}?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch daily TDDF1 merchants');
      }
      return response.json();
    }
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleMerchantClick = (merchantId: string) => {
    setLocation(`/tddf1-merchant-daily-view/${merchantId}`);
  };

  const merchants = data?.data || [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              TDDF1 Merchants ({pagination?.totalItems || 0})
              <Badge variant="outline" className="ml-2">
                <CalendarIcon className="h-3 w-3 mr-1" />
                {format(selectedDate || new Date(), 'MMM d, yyyy')}
              </Badge>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="bg-white hover:bg-gray-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Search and Controls */}
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search merchants by name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white border-gray-200 focus:border-blue-300 focus:ring-blue-200"
              />
            </div>
            <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(parseInt(value))}>
              <SelectTrigger className="w-32 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 per page</SelectItem>
                <SelectItem value="20">20 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Merchants Table */}
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600">Error loading merchants: {error.message}</p>
            </div>
          ) : merchants.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <p className="text-gray-500">No merchants found</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('merchantName')}
                          className="h-auto p-0 font-medium flex items-center gap-1"
                        >
                          Merchant Name
                          <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('bhCount')}
                          className="h-auto p-0 font-medium flex items-center gap-1"
                        >
                          Batches (BH)
                          <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('netDepositTotal')}
                          className="h-auto p-0 font-medium flex items-center gap-1"
                        >
                          Net Deposit
                          <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('authorizationTotal')}
                          className="h-auto p-0 font-medium flex items-center gap-1"
                        >
                          Authorization (DT)
                          <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('dtCount')}
                          className="h-auto p-0 font-medium flex items-center gap-1"
                        >
                          Number DT Records
                          <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead>Record Breakdown</TableHead>
                      <TableHead>
                        <Button
                          variant="ghost"
                          onClick={() => handleSort('totalRecords')}
                          className="h-auto p-0 font-medium flex items-center gap-1"
                        >
                          Total Records
                          <ArrowUpDown className="h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {merchants.map((merchant, index) => (
                      <TableRow 
                        key={index}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-blue-500" />
                            <span>{merchant.merchantName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                            {formatNumber(merchant.bhCount)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-blue-600">
                          {formatCurrency(merchant.netDepositTotal)}
                        </TableCell>
                        <TableCell className="font-medium text-green-600">
                          {formatCurrency(merchant.authorizationTotal)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {formatNumber(merchant.dtCount)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(merchant.recordBreakdown).map(([type, count]) => {
                              if (count === 0) return null;
                              const badge = getRecordTypeBadge(type, count);
                              return (
                                <Badge 
                                  key={type} 
                                  variant="outline" 
                                  className={`text-xs ${badge.className}`}
                                >
                                  {badge.label}: {count}
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-gray-600">
                          {formatNumber(merchant.totalRecords)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMerchantClick(merchant.merchantId)}
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex flex-col items-center space-y-4 md:flex-row md:justify-between md:space-y-0 mt-6">
                  <p className="text-sm text-gray-600">
                    Showing {((pagination.currentPage - 1) * pagination.itemsPerPage) + 1} to{' '}
                    {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{' '}
                    {pagination.totalItems} merchants
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(pagination.totalPages, currentPage + 1))}
                      disabled={currentPage === pagination.totalPages}
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
};

export default Tddf1MerchantVolumeTab;
export { Tddf1MerchantVolumeTab };