import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RefreshCw, ArrowUpDown, Building2, CreditCard, Monitor, ExternalLink, Eye, Search, Calendar, X } from "lucide-react";
import { useLocation, Link } from "wouter";
import { formatTableDate } from "@/lib/date-utils";
import MerchantActivityHeatMap from "@/components/merchants/MerchantActivityHeatMap";

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

interface TddfMerchantsResponse {
  data: TddfMerchant[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

export default function MMSMerchants() {
  const [, setLocation] = useLocation();
  
  // State for filters and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState("totalTransactions");
  const [sortOrder, setSortOrder] = useState("desc");
  const [selectedMerchant, setSelectedMerchant] = useState<TddfMerchant | null>(null);

  // Reset page to 1 when search query or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  // Query TDDF merchants
  const { data, isLoading, error } = useQuery<TddfMerchantsResponse>({
    queryKey: ['/api/tddf/merchants', currentPage, itemsPerPage, searchQuery, sortBy, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);
      
      const response = await fetch(`/api/tddf/merchants?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch TDDF merchants');
      }
      return response.json();
    },
    refetchInterval: 30000,
  });

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const pagination = data?.pagination;
  const merchants = data?.data || [];

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              MMS Merchants
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage merchants from TDDF transaction data
            </p>
          </div>
        </div>

        {selectedMerchant ? (
          <MerchantDetailView 
            merchant={selectedMerchant} 
            onBack={() => setSelectedMerchant(null)}
          />
        ) : (
          <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-gray-50">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 border-b">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-600" />
                TDDF Merchants ({pagination?.totalItems || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {/* Search and Controls */}
              <div className="flex flex-col space-y-4 md:flex-row md:items-center md:space-x-4 md:space-y-0 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search merchants by name, account number, or MCC..."
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
                <div className="rounded-lg overflow-hidden border border-gray-200 bg-white">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('merchantName')}
                        >
                          <div className="flex items-center gap-2">
                            Merchant Name
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('merchantAccountNumber')}
                        >
                          <div className="flex items-center gap-2">
                            Account Number
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('mccCode')}
                        >
                          <div className="flex items-center gap-2">
                            MCC Code
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 select-none text-right"
                          onClick={() => handleSort('totalTransactions')}
                        >
                          <div className="flex items-center gap-2 justify-end">
                            Transactions
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 select-none text-right"
                          onClick={() => handleSort('totalAmount')}
                        >
                          <div className="flex items-center gap-2 justify-end">
                            Total Amount
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 select-none text-right"
                          onClick={() => handleSort('terminalCount')}
                        >
                          <div className="flex items-center gap-2 justify-end">
                            Terminals
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort('lastTransactionDate')}
                        >
                          <div className="flex items-center gap-2">
                            Last Transaction
                            <ArrowUpDown className="h-4 w-4" />
                          </div>
                        </TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {merchants.map((merchant, index) => (
                        <TableRow 
                          key={`${merchant.merchantAccountNumber}-${index}`}
                          className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                          onClick={() => setSelectedMerchant(merchant)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-blue-600" />
                              {merchant.merchantName}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {merchant.merchantAccountNumber}
                          </TableCell>
                          <TableCell>
                            <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">
                              {merchant.mccCode || 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {merchant.totalTransactions.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatCurrency(merchant.totalAmount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <Monitor className="h-4 w-4 text-gray-500" />
                              {merchant.terminalCount}
                            </div>
                          </TableCell>
                          <TableCell>
                            {formatTableDate(merchant.lastTransactionDate)}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedMerchant(merchant);
                              }}
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

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
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}

// Merchant Detail View Component
interface MerchantDetailViewProps {
  merchant: TddfMerchant;
  onBack: () => void;
}

function MerchantDetailView({ merchant, onBack }: MerchantDetailViewProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleDateFilter = (date: string | null) => {
    setSelectedDate(date);
    // Switch to transactions tab when date is selected
    if (date) {
      setActiveTab("transactions");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to Merchants
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            {merchant.merchantName}
          </h1>
          <p className="text-muted-foreground">
            Account: {merchant.merchantAccountNumber}
          </p>
        </div>
      </div>

      {/* Transaction Activity Heat Map - Visible on all tabs */}
      <MerchantActivityHeatMap 
        merchantAccountNumber={merchant.merchantAccountNumber} 
        onDateFilter={handleDateFilter}
        selectedDate={selectedDate}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="transactions" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Transactions
          </TabsTrigger>
          <TabsTrigger value="terminals" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Terminals
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <MerchantOverview merchant={merchant} />
        </TabsContent>

        <TabsContent value="transactions">
          <MerchantTransactions 
            merchantAccountNumber={merchant.merchantAccountNumber} 
            selectedDate={selectedDate}
            onClearFilter={() => setSelectedDate(null)}
          />
        </TabsContent>

        <TabsContent value="terminals">
          <MerchantTerminals merchantAccountNumber={merchant.merchantAccountNumber} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Overview tab component
function MerchantOverview({ merchant }: { merchant: TddfMerchant }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Merchant Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Merchant Name</label>
            <p className="text-lg font-semibold">{merchant.merchantName}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Account Number</label>
            <p className="font-mono">{merchant.merchantAccountNumber}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">MCC Code</label>
            <p>{merchant.mccCode || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Transaction Type</label>
            <p>{merchant.transactionTypeIdentifier || 'N/A'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">POS Relative Code</label>
            <p>{merchant.posRelativeCode || 'N/A'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transaction Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Total Transactions</label>
            <p className="text-2xl font-bold text-blue-600">{merchant.totalTransactions.toLocaleString()}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Total Amount</label>
            <p className="text-2xl font-bold text-green-600">
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(merchant.totalAmount)}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Terminal Count</label>
            <p className="text-xl font-semibold">{merchant.terminalCount}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Last Transaction</label>
            <p>{formatTableDate(merchant.lastTransactionDate)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Terminal ID Display Component - Lookup first, then convert if not found
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

  // First: Try to find terminal by VAR mapping pattern: V7565296 → 77565296
  const terminal = terminals?.find((t: any) => {
    if (!terminalId || !t.v_number) return false;
    // Extract numeric part from V Number and add "7" prefix for comparison
    const vNumberNumeric = t.v_number.replace('V', '');
    const expectedTerminalId = '7' + vNumberNumeric;
    return expectedTerminalId === terminalId;
  });

  // If terminal found and V Number matches Terminal ID - link to actual terminal page
  if (terminal) {
    return (
      <Link href={`/terminals/${terminal.id}?referrer=mms-merchants`}>
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
    <Link href={`/orphan-terminals/${terminalId}?referrer=mms-merchants`}>
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

// Card Type Detection Function - Returns single badge per transaction using Card Type field (251-256)
function getCardTypeBadges(record: any) {
  const isDebit = (record.debit_credit_indicator || record.debitCreditIndicator) === 'D';
  const cardType = (record.card_type || record.cardType)?.trim();
  
  // Priority 1: Check cardType field (positions 251-256) - most accurate identification
  if (cardType) {
    // Mastercard identification (MC, MD, MB)
    if (cardType === 'MC') {
      return [{ label: 'MC', className: 'bg-red-100 text-red-800 border-red-200' }];
    }
    if (cardType === 'MD') {
      return [{ label: 'MC-D', className: 'bg-red-100 text-red-800 border-red-200' }];
    }
    if (cardType === 'MB') {
      return [{ label: 'MC-B', className: 'bg-red-100 text-red-800 border-red-200' }];
    }
    
    // Visa identification (VS, VD, VB, etc.)
    if (cardType === 'VS') {
      return [{ label: 'VISA', className: 'bg-blue-100 text-blue-800 border-blue-200' }];
    }
    if (cardType === 'VD') {
      return [{ label: 'VISA-D', className: 'bg-blue-100 text-blue-800 border-blue-200' }];
    }
    if (cardType === 'VB') {
      return [{ label: 'VISA-B', className: 'bg-blue-100 text-blue-800 border-blue-200' }];
    }
    if (cardType.startsWith('V')) {
      return [{ label: 'VISA', className: 'bg-blue-100 text-blue-800 border-blue-200' }];
    }
    
    // American Express identification (AM, AX, etc.)
    if (cardType === 'AM' || cardType.startsWith('AX')) {
      return [{ label: 'AMEX', className: 'bg-green-100 text-green-800 border-green-200' }];
    }
    
    // Discover identification (DS, DC, etc.)
    if (cardType === 'DS' || cardType.startsWith('DC')) {
      return [{ label: 'DISC', className: 'bg-purple-100 text-purple-800 border-purple-200' }];
    }
    
    // Other specific card types
    if (cardType.startsWith('MC') || cardType.startsWith('M')) {
      return [{ label: 'MC', className: 'bg-red-100 text-red-800 border-red-200' }];
    }
  }
  
  // Priority 2: Check for AMEX data fields (fallback)
  if (record.amex_merchant_seller_postal_code || record.amexMerchantSellerPostalCode) {
    return [{
      label: 'AMEX',
      className: 'bg-green-100 text-green-800 border-green-200'
    }];
  }
  
  // Priority 3: Check for Visa-specific fields
  if (record.visa_integrity_fee || record.visaIntegrityFee || record.visa_fee_program_indicator || record.visaFeeProgramIndicator || record.visa_special_condition_indicator || record.visaSpecialConditionIndicator) {
    return [{
      label: isDebit ? 'VISA-D' : 'VISA',
      className: 'bg-blue-100 text-blue-800 border-blue-200'
    }];
  }
  
  // Priority 4: Check for Mastercard-specific fields
  if (record.mastercard_transaction_integrity_class || record.mastercardTransactionIntegrityClass || record.mastercard_wallet_identifier || record.mastercardWalletIdentifier || record.mc_cash_back_fee || record.mcCashBackFee) {
    return [{
      label: isDebit ? 'MC-D' : 'MC',
      className: 'bg-red-100 text-red-800 border-red-200'
    }];
  }
  
  // Priority 5: Check for Discover-specific fields
  if (record.discover_transaction_type || record.discoverTransactionType || record.discover_processing_code || record.discoverProcessingCode) {
    return [{
      label: 'DISC',
      className: 'bg-purple-100 text-purple-800 border-purple-200'
    }];
  }
  
  // Priority 6: Fallback to transaction code analysis
  const transactionCode = record.transaction_code || record.transactionCode;
  
  if (transactionCode === '0330') {
    // Network-specific transaction with network identifier
    const networkId = record.network_identifier_debit || record.networkIdentifierDebit;
    if (networkId === 'IL' || networkId === 'ME') {
      return [{
        label: 'DEBIT',
        className: 'bg-purple-100 text-purple-800 border-purple-200'
      }];
    }
  }
  
  // Priority 7: Generic fallback for standard transactions
  if (transactionCode === '0101') {
    return [{
      label: isDebit ? 'DEBIT' : 'CREDIT',
      className: 'bg-gray-100 text-gray-800 border-gray-200'
    }];
  }
  
  // Default fallback
  return [{
    label: isDebit ? 'DEBIT' : 'CREDIT',
    className: 'bg-gray-100 text-gray-800 border-gray-200'
  }];
}

// Transactions tab component
interface MerchantTransactionsProps {
  merchantAccountNumber: string;
  selectedDate?: string | null;
  onClearFilter?: () => void;
}

function MerchantTransactions({ merchantAccountNumber, selectedDate, onClearFilter }: MerchantTransactionsProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [detailsRecord, setDetailsRecord] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<string>('transaction_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/tddf/merchant', merchantAccountNumber, currentPage, itemsPerPage, sortBy, sortOrder, selectedDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      if (selectedDate) {
        params.append('dateFilter', selectedDate);
      }
      
      const response = await fetch(`/api/tddf/merchant/${merchantAccountNumber}?${params.toString()}`, {
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error('Failed to fetch merchant transactions');
      }
      return response.json();
    }
  });

  const transactions = Array.isArray(data) ? data : data?.data || [];
  const totalRecords = data?.pagination?.totalItems || transactions.length;
  const totalPages = Math.ceil(totalRecords / itemsPerPage);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const handleRefreshCache = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/tddf/merchant/${merchantAccountNumber}/refresh`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        // Invalidate and refetch the data
        queryClient.invalidateQueries({ 
          queryKey: ['/api/tddf/merchant', merchantAccountNumber] 
        });
      } else {
        console.error('Failed to refresh cache');
      }
    } catch (error) {
      console.error('Error refreshing cache:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatCurrency = (amount?: string | number) => {
    if (amount === undefined || amount === null) return 'N/A';
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount);
  };

  const handleSelectRecord = (recordId: number, checked: boolean) => {
    const newSelected = new Set(selectedRecords);
    if (checked) {
      newSelected.add(recordId);
    } else {
      newSelected.delete(recordId);
    }
    setSelectedRecords(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && transactions) {
      setSelectedRecords(new Set(transactions.map((record: any) => record.id)));
    } else {
      setSelectedRecords(new Set());
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-12">
            <p className="text-red-600">Error loading transactions: {error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>TDDF Transactions ({totalRecords})</CardTitle>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                All DT transactions for merchant account {merchantAccountNumber}
              </p>
              {data?.cacheInfo && (
                <div className="text-xs text-muted-foreground">
                  • Cache updated: {new Date(data.cacheInfo.lastUpdated).toLocaleString()}
                  {data.cacheInfo.isStale && <span className="text-orange-600"> (stale)</span>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshCache}
              disabled={isRefreshing}
              className="flex items-center gap-2"
            >
              {isRefreshing ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {isRefreshing ? 'Refreshing...' : 'Refresh Cache'}
            </Button>
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
                  {[10, 20, 50, 100, 200].map((option) => (
                    <SelectItem key={option} value={option.toString()}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filter Status Display */}
        {selectedDate && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-blue-800">
                Filtered by date: <strong>{new Date(selectedDate).toLocaleDateString()}</strong>
                {transactions.length > 0 && (
                  <span className="ml-2">({transactions.length} transaction{transactions.length !== 1 ? 's' : ''} found)</span>
                )}
              </span>
            </div>
            <Button
              onClick={onClearFilter}
              size="sm"
              variant="outline"
              className="text-blue-600 border-blue-300 hover:bg-blue-100"
            >
              <X className="h-4 w-4 mr-1" />
              Clear Filter
            </Button>
          </div>
        )}

        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500">
              {selectedDate ? 'No transactions found for the selected date' : 'No transactions found for this merchant'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Transaction Records Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 w-12">
                      <input
                        type="checkbox"
                        checked={selectedRecords.size === transactions.length && transactions.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="rounded border-border"
                      />
                    </th>
                    <th className="text-left p-3">
                      <button
                        onClick={() => handleSort('transaction_date')}
                        className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded transition-colors"
                      >
                        Date
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button
                        onClick={() => handleSort('reference_number')}
                        className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded transition-colors"
                      >
                        Reference
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button
                        onClick={() => handleSort('terminal_identification')}
                        className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded transition-colors"
                      >
                        Terminal
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-right p-3">
                      <button
                        onClick={() => handleSort('transaction_amount')}
                        className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded transition-colors ml-auto"
                      >
                        Amount
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button
                        onClick={() => handleSort('card_type')}
                        className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded transition-colors"
                      >
                        Card Type
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-left p-3">
                      <button
                        onClick={() => handleSort('authorization_number')}
                        className="flex items-center gap-1 hover:bg-gray-100 p-1 rounded transition-colors"
                      >
                        Auth #
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </th>
                    <th className="text-center p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction: any) => (
                    <tr key={transaction.id} className="border-b hover:bg-muted/20">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedRecords.has(transaction.id)}
                          onChange={(e) => handleSelectRecord(transaction.id, e.target.checked)}
                          className="rounded border-border"
                        />
                      </td>
                      <td className="p-3 text-sm">
                        {formatTableDate(transaction.transaction_date || transaction.transactionDate)}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {transaction.reference_number || transaction.referenceNumber}
                      </td>
                      <td className="p-3">
                        <TerminalIdDisplay terminalId={transaction.terminal_id || transaction.terminalId} />
                      </td>
                      <td className="p-3 text-right font-mono text-sm font-medium text-green-600">
                        {formatCurrency(transaction.transaction_amount || transaction.transactionAmount)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          {getCardTypeBadges(transaction).map((badge, index) => (
                            <span 
                              key={index}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border ${badge.className} flex-shrink-0`}
                            >
                              <CreditCard className="h-3 w-3" />
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {transaction.authorization_number || transaction.authorizationNumber || 'N/A'}
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          onClick={() => setDetailsRecord(transaction)}
                          variant="ghost"
                          size="sm"
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
                  {Math.min(currentPage * itemsPerPage, totalRecords)} of {totalRecords} records
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
                  <span className="flex items-center px-3 text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
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

        {/* Transaction Details Modal */}
        <Dialog open={!!detailsRecord} onOpenChange={(open) => !open && setDetailsRecord(null)}>
          <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                TDDF Transaction Detail
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Complete transaction information from TDDF processing
              </p>
            </DialogHeader>
            {detailsRecord && (
              <Tabs defaultValue="summary" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="summary">Summary</TabsTrigger>
                  <TabsTrigger value="raw">Raw Details</TabsTrigger>
                </TabsList>
                
                <TabsContent value="summary" className="mt-4 space-y-6 overflow-y-auto max-h-[60vh]">
                  {/* Transaction Summary */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h3 className="font-semibold mb-3 text-blue-900">Transaction Summary</h3>
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Reference Date</div>
                        <div className="font-medium">{formatTableDate(detailsRecord.transaction_date || detailsRecord.transactionDate)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Amount</div>
                        <div className="font-medium text-green-600">{formatCurrency(detailsRecord.transaction_amount || detailsRecord.transactionAmount)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Card Type</div>
                        <div className="flex items-center gap-1">
                          {getCardTypeBadges(detailsRecord).map((badge, index) => (
                            <span 
                              key={index}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Authorization #</div>
                        <div className="font-medium font-mono">{detailsRecord.authorization_number || detailsRecord.authorizationNumber || 'N/A'}</div>
                      </div>
                    </div>
                  </div>

                  {/* Merchant Information */}
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold mb-3">Merchant Information</h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Name:</span>
                          <div className="font-medium">{detailsRecord.merchant_name || detailsRecord.merchantName || 'N/A'}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Account:</span>
                          <div className="font-medium font-mono">{detailsRecord.merchant_account_number || detailsRecord.merchantAccountNumber}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">MCC Code:</span>
                          <div className="font-medium">{detailsRecord.mcc_code || detailsRecord.mccCode || 'N/A'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-semibold mb-3">Terminal Information</h4>
                      <div className="space-y-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Terminal ID:</span>
                          <div className="font-medium font-mono">{detailsRecord.terminal_id || detailsRecord.terminalId || 'N/A'}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">VAR Number:</span>
                          <div className="font-medium font-mono">V{detailsRecord.terminal_id || detailsRecord.terminalId || 'N/A'}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Transaction Type:</span>
                          <div className="font-medium">{detailsRecord.transaction_type_identifier || detailsRecord.transactionTypeIdentifier || 'N/A'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TDDF Record Details */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-3">TDDF Record Details</h4>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Reference Number:</span>
                        <div className="font-medium font-mono text-xs break-all">{detailsRecord.reference_number || detailsRecord.referenceNumber}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Record ID:</span>
                        <div className="font-medium">{detailsRecord.id}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Recorded At:</span>
                        <div className="font-medium">{formatTableDate(detailsRecord.recorded_at || detailsRecord.recordedAt)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Processing Status:</span>
                        <div className="font-medium">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800 border border-green-200">
                            Processed
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Transaction Code:</span>
                        <div className="font-medium font-mono">{detailsRecord.transaction_code || detailsRecord.transactionCode || 'N/A'}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">D/C Indicator:</span>
                        <div className="font-medium">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                            (detailsRecord.debit_credit_indicator || detailsRecord.debitCreditIndicator) === 'D' 
                              ? 'bg-purple-100 text-purple-800 border-purple-200' 
                              : 'bg-blue-100 text-blue-800 border-blue-200'
                          }`}>
                            {(detailsRecord.debit_credit_indicator || detailsRecord.debitCreditIndicator) === 'D' ? 'Debit' : (detailsRecord.debit_credit_indicator || detailsRecord.debitCreditIndicator) === 'C' ? 'Credit' : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="raw" className="mt-4 space-y-4 overflow-y-auto max-h-[60vh]">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-blue-600 text-white font-medium">
                        RAW
                      </span>
                      <span className="text-sm font-medium text-blue-900">Raw Line Data</span>
                    </div>
                    <p className="text-xs text-blue-700">Original fixed-width TDDF record data from source file</p>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <div className="text-xs text-muted-foreground mb-2">
                      Fixed-width TDDF record - {(detailsRecord.mms_raw_line || detailsRecord.mmsRawLine)?.length || 0} characters
                    </div>
                    <div className="bg-white p-3 rounded border font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre-wrap break-all">
                      {(detailsRecord.mms_raw_line || detailsRecord.mmsRawLine) || 'Raw line data not available'}
                    </div>
                  </div>

                  {/* Field Position Reference */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-3 text-sm">Key Field Positions (TDDF Specification)</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <div><span className="font-medium">Reference Number:</span> 62-84</div>
                        <div><span className="font-medium">Transaction Amount:</span> 85-96</div>
                        <div><span className="font-medium">Merchant Name:</span> 218-242</div>
                        <div><span className="font-medium">Card Type:</span> 253-254</div>
                        <div><span className="font-medium">Authorization Number:</span> 243-250</div>
                      </div>
                      <div className="space-y-1">
                        <div><span className="font-medium">Terminal ID:</span> 277-284</div>
                        <div><span className="font-medium">MCC Code:</span> 273-276</div>
                        <div><span className="font-medium">Transaction Date:</span> 71-76</div>
                        <div><span className="font-medium">D/C Indicator:</span> 216</div>
                        <div><span className="font-medium">Transaction Type ID:</span> 335-338</div>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Terminals tab component
function MerchantTerminals({ merchantAccountNumber }: { merchantAccountNumber: string }) {
  // Terminal pagination and sorting state
  const [terminalPage, setTerminalPage] = useState(1);
  const [terminalItemsPerPage, setTerminalItemsPerPage] = useState(10);
  const [terminalSortBy, setTerminalSortBy] = useState('transactionCount');
  const [terminalSortOrder, setTerminalSortOrder] = useState('desc');

  // Reset terminal pagination when merchant changes
  useEffect(() => {
    setTerminalPage(1);
    setTerminalSortBy('transactionCount');
    setTerminalSortOrder('desc');
  }, [merchantAccountNumber]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/tddf/merchants', merchantAccountNumber, 'terminals'],
    queryFn: async () => {
      console.log('[TERMINALS DEBUG] Fetching terminals for merchant:', merchantAccountNumber);
      const response = await fetch(`/api/tddf/merchants/${merchantAccountNumber}/terminals`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch merchant terminals');
      }
      const result = await response.json();
      console.log('[TERMINALS DEBUG] Terminal response:', result);
      return result;
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-12">
            <p className="text-red-600">Error loading terminals: {error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const terminals = Array.isArray(data) ? data : [];

  // Client-side sorting and pagination for terminals
  const sortedTerminals = terminals ? [...terminals].sort((a, b) => {
    let aValue = a[terminalSortBy as keyof typeof a];
    let bValue = b[terminalSortBy as keyof typeof b];
    
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Associated Terminals</CardTitle>
        <p className="text-sm text-muted-foreground">
          Terminals linked to merchant account {merchantAccountNumber}
        </p>
      </CardHeader>
      <CardContent>
        {terminals.length === 0 ? (
          <div className="text-center py-12">
            <Monitor className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500">No terminals found for this merchant</p>
          </div>
        ) : (
          <div className="rounded-lg overflow-hidden border border-gray-200">
            {/* Terminal Controls */}
            <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <Select
                  value={terminalItemsPerPage.toString()}
                  onValueChange={(value) => {
                    setTerminalItemsPerPage(parseInt(value));
                    setTerminalPage(1); // Reset to first page
                  }}
                >
                  <SelectTrigger className="w-16">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
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
                  <TableHead>Terminal</TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleTerminalSort('transactionCount')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Transaction Count
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="text-right cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleTerminalSort('totalAmount')}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Total Amount
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleTerminalSort('lastTransactionDate')}
                  >
                    <div className="flex items-center gap-1">
                      Last Transaction
                      <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTerminals.map((terminal: any, index: number) => (
                  <TableRow key={`${terminal.terminalId}-${index}`}>
                    <TableCell>
                      <TerminalIdDisplay terminalId={terminal.terminalId} />
                    </TableCell>
                    <TableCell className="text-right">{terminal.transactionCount?.toLocaleString() || 0}</TableCell>
                    <TableCell className="text-right font-medium text-green-600">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }).format(parseFloat(terminal.totalAmount) || 0)}
                    </TableCell>
                    <TableCell>{formatTableDate(terminal.lastTransactionDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Pagination Controls */}
            {terminalTotalPages > 1 && (
              <div className="flex items-center justify-center space-x-2 py-4 border-t bg-gray-50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTerminalPage(terminalPage - 1)}
                  disabled={terminalPage === 1}
                >
                  Previous
                </Button>
                
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
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTerminalPage(terminalPage + 1)}
                  disabled={terminalPage === terminalTotalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}