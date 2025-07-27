import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Search, ArrowUpDown, Building2, CreditCard, Monitor, ExternalLink, Eye } from "lucide-react";
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
      <MerchantActivityHeatMap merchantAccountNumber={merchant.merchantAccountNumber} />

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
          <MerchantTransactions merchantAccountNumber={merchant.merchantAccountNumber} />
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

// Terminal ID Display Component - same logic as TDDF page
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
    const vNumberNumeric = t.vNumber?.replace('V', '');
    const expectedTerminalId = '7' + vNumberNumeric;
    return expectedTerminalId === terminalId;
  });

  // If terminal found and V Number matches Terminal ID
  if (terminal) {
    return (
      <Link href={`/terminals/${terminal.id}?referrer=mms-merchants`}>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 p-1 text-xs font-mono text-blue-600 hover:text-blue-800 hover:bg-blue-50"
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          {terminal.vNumber}
        </Button>
      </Link>
    );
  }

  // If no matching V Number found, display Terminal ID with light orange styling as link to orphan terminal
  return (
    <Link href={`/orphan-terminals/${terminalId}?referrer=mms-merchants`}>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 p-1 text-xs font-mono text-orange-600 bg-orange-50 border border-orange-200 hover:bg-orange-100 hover:text-orange-800"
      >
        <ExternalLink className="h-3 w-3 mr-1" />
        {terminalId}
      </Button>
    </Link>
  );
}

// Card Type Detection Function - Returns single badge per transaction using Card Type field (251-256)
function getCardTypeBadges(record: any) {
  const isDebit = record.debitCreditIndicator === 'D';
  const cardType = record.cardType?.trim();
  
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
  if (record.amexMerchantSellerPostalCode) {
    return [{
      label: 'AMEX',
      className: 'bg-green-100 text-green-800 border-green-200'
    }];
  }
  
  // Priority 3: Check for Visa-specific fields
  if (record.visaIntegrityFee || record.visaFeeProgramIndicator || record.visaSpecialConditionIndicator) {
    return [{
      label: isDebit ? 'VISA-D' : 'VISA',
      className: 'bg-blue-100 text-blue-800 border-blue-200'
    }];
  }
  
  // Priority 4: Check for Mastercard-specific fields
  if (record.mastercardTransactionIntegrityClass || record.mastercardWalletIdentifier || record.mcCashBackFee) {
    return [{
      label: isDebit ? 'MC-D' : 'MC',
      className: 'bg-red-100 text-red-800 border-red-200'
    }];
  }
  
  // Priority 5: Check for Discover-specific fields
  if (record.discoverTransactionType || record.discoverProcessingCode) {
    return [{
      label: 'DISC',
      className: 'bg-purple-100 text-purple-800 border-purple-200'
    }];
  }
  
  // Priority 6: Fallback to transaction code analysis
  const transactionCode = record.transactionCode;
  
  if (transactionCode === '0330') {
    // Network-specific transaction with network identifier
    const networkId = record.networkIdentifierDebit;
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
function MerchantTransactions({ merchantAccountNumber }: { merchantAccountNumber: string }) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [detailsRecord, setDetailsRecord] = useState<any>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/tddf/merchant', merchantAccountNumber, currentPage, itemsPerPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());
      
      const response = await fetch(`/api/tddf/merchant/${merchantAccountNumber}?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch merchant transactions');
      }
      return response.json();
    }
  });

  const transactions = Array.isArray(data) ? data : data?.data || [];
  const totalRecords = data?.pagination?.totalItems || transactions.length;
  const totalPages = Math.ceil(totalRecords / itemsPerPage);

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
            <p className="text-sm text-muted-foreground">
              All DT transactions for merchant account {merchantAccountNumber}
            </p>
          </div>
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
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-500">No transactions found for this merchant</p>
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
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">Reference</th>
                    <th className="text-left p-3">Terminal</th>
                    <th className="text-right p-3">Amount</th>
                    <th className="text-left p-3">Card Type</th>
                    <th className="text-left p-3">Auth #</th>
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
                        {formatTableDate(transaction.transactionDate)}
                      </td>
                      <td className="p-3 font-mono text-xs">
                        {transaction.referenceNumber}
                      </td>
                      <td className="p-3">
                        <TerminalIdDisplay terminalId={transaction.terminalId} />
                      </td>
                      <td className="p-3 text-right font-mono text-sm font-medium text-green-600">
                        {formatCurrency(transaction.transactionAmount)}
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
                        {transaction.authorizationNumber || 'N/A'}
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
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Transaction Details - ID: {detailsRecord?.id}</DialogTitle>
            </DialogHeader>
            {detailsRecord && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Transaction Information</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">ID:</span> {detailsRecord.id}</div>
                      <div><span className="font-medium">Reference:</span> {detailsRecord.referenceNumber}</div>
                      <div><span className="font-medium">Date:</span> {formatTableDate(detailsRecord.transactionDate)}</div>
                      <div><span className="font-medium">Amount:</span> {formatCurrency(detailsRecord.transactionAmount)}</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Card & Terminal</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">Card Type:</span> {detailsRecord.cardType || 'N/A'}</div>
                      <div><span className="font-medium">Terminal ID:</span> {detailsRecord.terminalId || 'N/A'}</div>
                      <div><span className="font-medium">Auth Number:</span> {detailsRecord.authorizationNumber || 'N/A'}</div>
                      <div><span className="font-medium">D/C Indicator:</span> {detailsRecord.debitCreditIndicator || 'N/A'}</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Merchant Data</h4>
                    <div className="space-y-2 text-sm">
                      <div><span className="font-medium">Account:</span> {detailsRecord.merchantAccountNumber}</div>
                      <div><span className="font-medium">Name:</span> {detailsRecord.merchantName || 'N/A'}</div>
                      <div><span className="font-medium">MCC Code:</span> {detailsRecord.mccCode || 'N/A'}</div>
                      <div><span className="font-medium">Transaction Code:</span> {detailsRecord.transactionCode || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// Terminals tab component
function MerchantTerminals({ merchantAccountNumber }: { merchantAccountNumber: string }) {
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
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead>Terminal</TableHead>
                  <TableHead className="text-right">Transaction Count</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead>Last Transaction</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terminals.map((terminal: any, index: number) => (
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}