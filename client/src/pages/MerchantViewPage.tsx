import { useState, useEffect } from 'react';
import { useLocation, useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Calendar, Search, Filter, Terminal, FileText, CreditCard, Building2 } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';

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
    const suggestedDates = errorData?.suggestedDates || [];
    const merchantName = errorData?.merchantName || `Merchant ${merchantId}`;
    
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
        </div>
      </div>
    );
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
          <Card>
            <CardHeader>
              <CardTitle>Batch Records (BH)</CardTitle>
              <CardDescription>
                Batch header records containing net deposits and transaction summaries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch ID</TableHead>
                      <TableHead>Entry Run #</TableHead>
                      <TableHead className="text-right">Transactions</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Net Deposit</TableHead>
                      <TableHead>Batch Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBatches.map((batch: BatchRecord) => (
                      <TableRow key={batch.entryRunNumber}>
                        <TableCell className="font-mono">{batch.batchId}</TableCell>
                        <TableCell>
                          <Button
                            variant="link"
                            className="p-0 h-auto font-mono"
                            onClick={() => setSelectedBatch(
                              selectedBatch === batch.entryRunNumber ? null : batch.entryRunNumber
                            )}
                          >
                            {batch.entryRunNumber}
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(batch.transactionCount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(batch.totalAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(batch.netDeposit)}</TableCell>
                        <TableCell>{batch.batchDate}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedBatch(batch.entryRunNumber);
                              setActiveTab('transactions');
                            }}
                          >
                            View DT Records
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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