import { useState, useEffect } from 'react';
import { useLocation, useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Calendar, Search, Filter, Terminal, FileText, CreditCard, Building2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { useMerchantLookup } from '@/hooks/useMerchantLookup';
import { format, subDays } from 'date-fns';

interface MerchantViewData {
  merchantName: string;
  summary: {
    totalTransactions: number;
    totalAmount: number;
    totalNetDeposits: number;
    totalBatches: number;
  };
  batches: BatchRecord[];
  allTransactions: TransactionRecord[];
}

interface TerminalData {
  terminals: TerminalSummary[];
}

interface MerchantViewProps {
  merchantId: string;
  processingDate: string;
  merchantName?: string;
}

interface TransactionRecord {
  id: number;
  recordType: string;
  lineNumber: number;
  sequenceNumber: string;
  entryRunNumber: string;
  merchantAccountNumber: string;
  merchantName: string;
  transactionAmount: number;
  netDeposit?: number;
  transactionDate: string;
  referenceNumber: string;
  authorizationNumber?: string;
  cardType?: string;
  terminalId?: string;
  batchJulianDate?: string;
  fileName: string;
  extractedFields: Record<string, any>;
  rawLine: string;
  relatedRecords?: TransactionRecord[];
}

interface BatchRecord {
  batchId: string;
  entryRunNumber: string;
  merchantAccountNumber: string;
  netDeposit: number;
  transactionCount: number;
  totalAmount: number;
  batchDate: string;
  bhRecord?: TransactionRecord;
  dtRecords: TransactionRecord[];
  relatedRecords: TransactionRecord[];
}

interface TerminalSummary {
  terminalId: string;
  transactionCount: number;
  totalAmount: number;
  cardTypes: string[];
  mccCodes?: string[];
  transactionTypes?: string[];
  firstSeen: string;
  lastSeen: string;
}

// Helper functions for BH record processing
function extractMerchantAccountNumber(record: any): string | null {
  let merchantAccountNumber = record.parsed_data?.merchantAccountNumber || 
                              record.record_data?.merchantAccountNumber ||
                              record.parsed_data?.merchant_account_number ||
                              record.record_data?.merchant_account_number;
  
  if (!merchantAccountNumber && (record.record_type === 'BH' || record.record_type === '10')) {
    merchantAccountNumber = record.parsed_data?.acquirerBin || 
                           record.record_data?.acquirerBin ||
                           record.parsed_data?.acquirer_bin ||
                           record.record_data?.acquirer_bin;
  }
  
  return merchantAccountNumber ? merchantAccountNumber.toString().trim() : null;
}

function extractBatchDate(record: any): string | null {
  const batchDate = record.parsed_data?.batchDate || 
                    record.record_data?.batchDate ||
                    record.parsed_data?.batch_date ||
                    record.record_data?.batch_date;
  
  const batchJulianDate = record.parsed_data?.batchJulianDate || 
                          record.record_data?.batchJulianDate ||
                          record.parsed_data?.batch_julian_date ||
                          record.record_data?.batch_julian_date;
  
  return batchDate || batchJulianDate || null;
}

function groupRecordsHierarchically(records: any[]) {
  const batches: Array<{
    batchHeader: any | null;
    transactions: Array<{
      dtRecord: any;
      extensions: any[];
    }>;
    trailer: any | null;
  }> = [];

  let currentBatch: any = null;
  let currentTransaction: any = null;

  for (const record of records) {
    const recordType = record.record_type;

    if (['01', 'BH', '10', '02'].includes(recordType)) {
      if (currentBatch) {
        batches.push(currentBatch);
      }
      currentBatch = {
        batchHeader: record,
        transactions: [],
        trailer: null
      };
      currentTransaction = null;
    }
    else if (['47', 'DT'].includes(recordType)) {
      if (!currentBatch) {
        currentBatch = {
          batchHeader: null,
          transactions: [],
          trailer: null
        };
      }
      currentTransaction = {
        dtRecord: record,
        extensions: []
      };
      currentBatch.transactions.push(currentTransaction);
    }
    else if (['98', 'TR', '99'].includes(recordType)) {
      if (currentBatch) {
        currentBatch.trailer = record;
      }
    }
    else {
      if (currentTransaction) {
        currentTransaction.extensions.push(record);
      }
    }
  }

  if (currentBatch) {
    batches.push(currentBatch);
  }

  return batches;
}

// Merchant Batches Tab Component
function MerchantBatchesTab({ merchantId }: { merchantId: string }) {
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const { getMerchantName } = useMerchantLookup();
  
  // Calculate 60 days ago from today
  const sixtyDaysAgo = format(subDays(new Date(), 60), 'yyyy-MM-dd');
  
  // Query for BH records from last 60 days
  const { data: recentBatches, isLoading: recentLoading } = useQuery<any[]>({
    queryKey: ['/api/tddf-api/merchant-batches', merchantId, sixtyDaysAgo],
    queryFn: async () => {
      const params = new URLSearchParams({
        record_type: 'BH',
        merchant_account: merchantId,
        date_from: sixtyDaysAgo,
        limit: '1000'
      });
      
      const response: any = await apiRequest(`/api/tddf-api/all-records?${params}`);
      return response?.records || [];
    },
    enabled: !!merchantId
  });
  
  // Fallback query for most recent batch if no recent batches found
  const { data: lastBatch, isLoading: lastLoading } = useQuery<any[]>({
    queryKey: ['/api/tddf-api/merchant-last-batch', merchantId],
    queryFn: async () => {
      const params = new URLSearchParams({
        record_type: 'BH',
        merchant_account: merchantId,
        limit: '1'
      });
      
      const response: any = await apiRequest(`/api/tddf-api/all-records?${params}`);
      return response?.records || [];
    },
    enabled: !!merchantId && !recentLoading && (!recentBatches || recentBatches.length === 0)
  });

  const toggleBatch = (index: number) => {
    const batchKey = `batch-${index}`;
    setExpandedBatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(batchKey)) {
        newSet.delete(batchKey);
      } else {
        newSet.add(batchKey);
      }
      return newSet;
    });
  };

  // Show loading state while either query is loading
  if (recentLoading || lastLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin mr-3" />
          <span>Loading batch records...</span>
        </CardContent>
      </Card>
    );
  }

  const batches = recentBatches && recentBatches.length > 0 ? recentBatches : (lastBatch || []);
  const isShowingFallback = batches === lastBatch && lastBatch && lastBatch.length > 0;

  // Only show empty state after both queries have completed
  if (!batches || batches.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Batch Records (BH)</CardTitle>
          <CardDescription>Last 60 days of batch header records from TDDF API data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No batch records found for this merchant
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Records (BH) - Raw TDDF Tree View</CardTitle>
        <CardDescription>
          {isShowingFallback ? (
            <span className="flex items-center gap-2">
              <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                Last Known Batch
              </Badge>
              No batches in last 60 days - showing most recent batch
            </span>
          ) : (
            `Last 60 days of batch header records (${batches.length} batches)`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {batches.map((bhRecord: any, index: number) => {
            const batchKey = `batch-${index}`;
            const isExpanded = expandedBatches.has(batchKey);
            const merchantAccountNumber = extractMerchantAccountNumber(bhRecord);
            const merchantName = getMerchantName(merchantAccountNumber);
            const batchDate = extractBatchDate(bhRecord);
            const netDeposit = bhRecord.parsed_data?.netDeposit || bhRecord.record_data?.netDeposit;
            
            return (
              <Card key={index} className="border-l-4 border-l-green-500">
                <CardHeader className="pb-2">
                  <div 
                    className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -m-3 p-3 rounded"
                    onClick={() => toggleBatch(index)}
                    data-testid={`bh-batch-header-${index}`}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-600" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    )}
                    
                    <Badge className="bg-green-500 text-white">
                      {bhRecord.record_type}
                    </Badge>
                    <span className="font-medium">Batch Header</span>
                    <span className="text-sm text-gray-600">Line {bhRecord.line_number}</span>
                    
                    {/* Merchant Account Number and Name */}
                    {merchantAccountNumber && (
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-blue-600" data-testid="bh-merchant-account">
                          • {merchantAccountNumber}
                        </span>
                        {merchantName && (
                          <span className="text-xs font-semibold text-green-600 ml-3" data-testid="bh-merchant-name">
                            {merchantName}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Batch Date */}
                    {batchDate && (
                      <Badge variant="outline" className="ml-2" data-testid="bh-batch-date">
                        {batchDate}
                      </Badge>
                    )}
                    
                    {/* Net Deposit */}
                    {netDeposit && (
                      <span className="ml-auto text-sm font-medium text-gray-700" data-testid="bh-net-deposit">
                        Net: {formatCurrency(netDeposit / 100)}
                      </span>
                    )}
                  </div>
                </CardHeader>

                {/* Expanded BH Record Details */}
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="ml-6 space-y-2">
                      <div className="bg-muted/30 p-4 rounded-md">
                        <h4 className="font-medium mb-3">Parsed Fields</h4>
                        <div className="space-y-2">
                          {Object.entries(bhRecord.parsed_data || bhRecord.record_data || {}).map(([key, value]) => (
                            <div key={key} className="flex justify-between items-start py-1 text-sm">
                              <span className="font-medium capitalize text-muted-foreground">{key.replace(/_/g, ' ')}:</span>
                              <span className="text-right max-w-md break-all ml-4">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {bhRecord.raw_data && (
                        <div className="bg-muted/30 p-4 rounded-md mt-3">
                          <h4 className="font-medium mb-2">Raw Data</h4>
                          <pre className="text-xs font-mono whitespace-pre-wrap break-all">{bhRecord.raw_data}</pre>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function MerchantViewPage() {
  const [, params] = useRoute('/merchant/:merchantId/:processingDate');
  const [, navigate] = useLocation();
  
  const merchantId = params?.merchantId || '';
  const processingDate = params?.processingDate || '';
  
  const [selectedDate, setSelectedDate] = useState(processingDate);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        weekday: 'short',
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  // Get merchant transaction data
  const { data: merchantData, isLoading, error } = useQuery<MerchantViewData>({
    queryKey: ['/api/tddf1/merchant-view', merchantId, selectedDate],
    enabled: !!merchantId && !!selectedDate,
    retry: false, // Don't retry on 404 errors
  });

  // Get terminal summary data
  const { data: terminalData } = useQuery<TerminalData>({
    queryKey: ['/api/tddf1/merchant-terminals', merchantId, selectedDate],
    enabled: !!merchantId && !!selectedDate,
  });

  // Navigation handlers
  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate);
    const newDate = new Date(currentDate);
    
    if (direction === 'prev') {
      newDate.setDate(currentDate.getDate() - 1);
    } else {
      newDate.setDate(currentDate.getDate() + 1);
    }
    
    const newDateStr = newDate.toISOString().split('T')[0];
    setSelectedDate(newDateStr);
    navigate(`/merchant/${merchantId}/${newDateStr}`);
  };

  // Filter functions
  const filteredBatches = merchantData?.batches?.filter((batch: BatchRecord) => {
    if (selectedBatch && batch.entryRunNumber !== selectedBatch) return false;
    if (searchTerm) {
      return batch.entryRunNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
             batch.batchId.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  }) || [];

  const filteredTransactions = merchantData?.allTransactions?.filter((tx: TransactionRecord) => {
    if (selectedBatch && tx.entryRunNumber !== selectedBatch) return false;
    if (searchTerm) {
      return tx.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             tx.authorizationNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             tx.terminalId?.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  }) || [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading merchant data...</p>
        </div>
      </div>
    );
  }

  // Handle error response with suggested dates
  if (error && !isLoading) {
    const errorData = (error as any)?.response?.data;
    
    // Check if this is a 404 error with enhanced response or a generic error
    if (errorData && (errorData.suggestedDates || errorData.merchantName)) {
      const suggestedDates = errorData.suggestedDates || [];
      const merchantName = errorData.merchantName || `Merchant ${merchantId}`;
      
      return (
      <div className="container mx-auto p-6">
        <div className="text-center space-y-6">
          <div className="flex items-center gap-4 justify-center">
            <Button variant="outline" asChild>
              <Link href="/tddf1">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to TDDF1
              </Link>
            </Button>
          </div>
          
          <div>
            <h2 className="text-2xl font-bold mb-2">No Data Found</h2>
            <p className="text-muted-foreground mb-4">
              No transaction data found for {merchantName} on {formatDate(selectedDate)}
            </p>
          </div>
          
          {suggestedDates.length > 0 && (
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="text-lg">Available Data Dates</CardTitle>
                <CardDescription>
                  Transaction data is available for {merchantName} on the following dates:
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {suggestedDates.slice(0, 10).map((dateInfo: any) => (
                    <Button
                      key={dateInfo.date}
                      variant="outline"
                      className="justify-between"
                      onClick={() => {
                        const dateStr = new Date(dateInfo.date).toISOString().split('T')[0];
                        setSelectedDate(dateStr);
                        navigate(`/merchant/${merchantId}/${dateStr}`);
                      }}
                    >
                      <span>{formatDate(dateInfo.date)}</span>
                      <Badge variant="secondary">
                        {formatNumber(dateInfo.recordCount)} transactions
                      </Badge>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          
          {suggestedDates.length === 0 && (
            <div className="bg-muted/50 rounded-lg p-6">
              <p className="text-muted-foreground">
                This merchant doesn't have any transaction data in the system.
              </p>
            </div>
          )}
          
          {/* Day Navigation for enhanced error state */}
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
              ← Previous Day
            </Button>
            
            <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
              <Calendar className="h-4 w-4" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  navigate(`/merchant/${merchantId}/${e.target.value}`);
                }}
                className="border-none p-0 h-auto"
              />
            </div>
            
            <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
              Next Day →
            </Button>
          </div>
        </div>
      </div>
    );
    } else {
      // Handle generic errors
      return (
        <div className="container mx-auto p-6">
          <div className="text-center">
            <div className="flex items-center gap-4 justify-center mb-6">
              <Button variant="outline" asChild>
                <Link href="/tddf1">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to TDDF1
                </Link>
              </Button>
            </div>
            
            <h2 className="text-2xl font-bold mb-4">Error Loading Data</h2>
            <p className="text-muted-foreground mb-4">
              Failed to load data for merchant {merchantId} on {formatDate(selectedDate)}
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              {errorData?.error || 'An unexpected error occurred'}
            </p>
            
            {/* Day Navigation for error state */}
            <div className="flex items-center justify-center gap-2 mb-6">
              <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
                ← Previous Day
              </Button>
              
              <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
                <Calendar className="h-4 w-4" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    navigate(`/merchant/${merchantId}/${e.target.value}`);
                  }}
                  className="border-none p-0 h-auto"
                />
              </div>
              
              <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
                Next Day →
              </Button>
            </div>
          </div>
        </div>
      );
    }
  }

  if (!merchantData) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Data Found</h2>
          <p className="text-muted-foreground mb-4">
            No transaction data found for merchant {merchantId} on {formatDate(selectedDate)}
          </p>
          <Button asChild>
            <Link href="/tddf1">← Back to TDDF1 Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" asChild>
            <Link href="/tddf1">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to TDDF1
            </Link>
          </Button>
          
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6" />
              {merchantData.merchantName || `Merchant ${merchantId}`}
            </h1>
            <p className="text-muted-foreground">
              Account: {merchantId} • {formatDate(selectedDate)}
            </p>
          </div>
        </div>

        {/* Date Navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
            ← Previous Day
          </Button>
          
          <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
            <Calendar className="h-4 w-4" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                navigate(`/merchant/${merchantId}/${e.target.value}`);
              }}
              className="border-none p-0 h-auto"
            />
          </div>
          
          <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
            Next Day →
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(merchantData.summary?.totalTransactions || 0)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transaction Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(merchantData.summary?.totalAmount || 0)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Deposits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(merchantData.summary?.totalNetDeposits || 0)}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Batches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(merchantData.summary?.totalBatches || 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by reference number, auth number, or terminal ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <select 
                value={selectedBatch || ''} 
                onChange={(e) => setSelectedBatch(e.target.value || null)}
                className="px-3 py-2 border border-input rounded-md"
              >
                <option value="">All Batches</option>
                {merchantData.batches?.map((batch: BatchRecord) => (
                  <option key={batch.entryRunNumber} value={batch.entryRunNumber}>
                    Batch {batch.entryRunNumber}
                  </option>
                ))}
              </select>
              
              {(selectedBatch || searchTerm) && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setSelectedBatch(null);
                    setSearchTerm('');
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <FileText className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="batches">
            <Filter className="h-4 w-4 mr-2" />
            Batches ({merchantData.batches?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <CreditCard className="h-4 w-4 mr-2" />
            Transactions ({filteredTransactions.length})
          </TabsTrigger>
          <TabsTrigger value="terminals">
            <Terminal className="h-4 w-4 mr-2" />
            Terminals ({terminalData?.terminals?.length || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Batch Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Batch Summary</CardTitle>
                <CardDescription>Batch header (BH) records for this merchant</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredBatches.slice(0, 5).map((batch: BatchRecord) => (
                    <div key={batch.entryRunNumber} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">Batch {batch.entryRunNumber}</div>
                        <div className="text-sm text-muted-foreground">
                          {batch.transactionCount} transactions
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(batch.totalAmount)}</div>
                        <div className="text-sm text-muted-foreground">
                          Net: {formatCurrency(batch.netDeposit)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Latest detail transaction (DT) records</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {filteredTransactions.slice(0, 5).map((tx: TransactionRecord) => (
                    <div key={tx.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">
                          {tx.cardType && <Badge variant="outline" className="mr-2">{tx.cardType}</Badge>}
                          {tx.extractedFields?.mccCode && (
                            <Badge 
                              variant={tx.extractedFields.mccCode === '6540' ? 'default' : 'secondary'} 
                              className="mr-2 text-xs"
                            >
                              MCC {tx.extractedFields.mccCode}
                            </Badge>
                          )}
                          {tx.extractedFields?.transactionTypeIndicator && tx.extractedFields.transactionTypeIndicator.trim() && (
                            <Badge 
                              variant={tx.extractedFields.transactionTypeIndicator === 'F64' ? 'destructive' : 'outline'} 
                              className="mr-2 text-xs"
                            >
                              {tx.extractedFields.transactionTypeIndicator}
                            </Badge>
                          )}
                          {tx.authorizationNumber || tx.referenceNumber}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Terminal: {tx.terminalId || 'N/A'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatCurrency(tx.transactionAmount)}</div>
                        <div className="text-sm text-muted-foreground">
                          {tx.transactionDate}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="batches" className="space-y-4">
          <MerchantBatchesTab merchantId={merchantId} />
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction Records (DT)</CardTitle>
              <CardDescription>
                Detailed transaction records with authorization and processing information
                {selectedBatch && ` • Filtered to Batch ${selectedBatch}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ref Number</TableHead>
                      <TableHead>Auth Number</TableHead>
                      <TableHead>Card Type</TableHead>
                      <TableHead>Terminal</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Transaction Date</TableHead>
                      <TableHead>Entry Run #</TableHead>
                      <TableHead>Record Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map((tx: TransactionRecord) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs">{tx.referenceNumber}</TableCell>
                        <TableCell className="font-mono">{tx.authorizationNumber || '-'}</TableCell>
                        <TableCell>
                          {tx.cardType && <Badge variant="outline">{tx.cardType}</Badge>}
                        </TableCell>
                        <TableCell className="font-mono">{tx.terminalId || '-'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(tx.transactionAmount)}</TableCell>
                        <TableCell>{tx.transactionDate}</TableCell>
                        <TableCell>
                          <Button
                            variant="link"
                            className="p-0 h-auto font-mono text-xs"
                            onClick={() => setSelectedBatch(tx.entryRunNumber)}
                          >
                            {tx.entryRunNumber}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant={tx.recordType === 'DT' ? 'default' : 'secondary'}>
                            {tx.recordType}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="terminals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Terminal Analysis</CardTitle>
              <CardDescription>
                Transaction activity breakdown by terminal for {formatDate(selectedDate)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Terminal ID</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead>Card Types</TableHead>
                      <TableHead>MCC Codes</TableHead>
                      <TableHead>Transaction Types</TableHead>
                      <TableHead>Activity Period</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {terminalData?.terminals?.map((terminal: TerminalSummary) => (
                      <TableRow key={terminal.terminalId}>
                        <TableCell className="font-mono">{terminal.terminalId}</TableCell>
                        <TableCell className="text-right">{formatNumber(terminal.transactionCount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(terminal.totalAmount)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {terminal.cardTypes.map((cardType) => (
                              <Badge key={cardType} variant="outline" className="text-xs">
                                {cardType}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {terminal.mccCodes?.map((mccCode) => (
                              <Badge 
                                key={mccCode} 
                                variant={mccCode === '6540' ? 'default' : 'secondary'} 
                                className="text-xs"
                              >
                                {mccCode}
                              </Badge>
                            )) || <span className="text-muted-foreground text-xs">N/A</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {terminal.transactionTypes?.map((txType) => (
                              <Badge 
                                key={txType} 
                                variant={txType === 'F64' ? 'destructive' : 'outline'} 
                                className="text-xs"
                              >
                                {txType || 'STD'}
                              </Badge>
                            )) || <span className="text-muted-foreground text-xs">N/A</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="space-y-1">
                            <div>From: {terminal.firstSeen}</div>
                            <div>To: {terminal.lastSeen}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}