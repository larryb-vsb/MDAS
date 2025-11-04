import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Building2, 
  Calendar,
  ChevronLeft, 
  ChevronRight,
  CreditCard,
  DollarSign,
  Hash,
  Terminal,
  Clock,
  Search,
  Filter
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";

interface MerchantDailyData {
  merchantName: string;
  summary: {
    totalTransactions: number;
    totalAmount: number;
    totalNetDeposits: number;
    totalBatches: number;
  };
  batches: Array<{
    batchId: string;
    entryRunNumber: string;
    netDeposit: number;
    transactionCount: number;
    totalAmount: number;
    batchDate: string;
  }>;
  allTransactions: Array<{
    id: string;
    transactionAmount: number;
    netDeposit: number;
    referenceNumber?: string;
    authorizationNumber?: string;
    cardType?: string;
    terminalId?: string;
    mccCode?: string;
    transactionTypeIndicator?: string;
    entryRunNumber?: string;
    merchantName?: string;
    transactionDate: string;
  }>;
}

interface TerminalSummary {
  terminalId: string;
  transactionCount: number;
  totalAmount: number;
  cardTypes: string[];
  mccCodes: string[];
  transactionTypeIndicators: string[];
  firstSeen: string;
  lastSeen: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Chicago'
  });
}

function formatNumber(num: number) {
  return new Intl.NumberFormat().format(num);
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export default function Tddf1MerchantDailyView() {
  const params = useParams();
  const [, navigate] = useLocation();
  
  const merchantId = params.merchantId;
  const selectedDate = params.date || new Date().toISOString().split('T')[0];
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<string>("");
  const [selectedTerminal, setSelectedTerminal] = useState<string>("");
  const [activeTab, setActiveTab] = useState("overview");

  // Navigate between dates
  const navigateDate = (direction: 'prev' | 'next') => {
    const currentDate = new Date(selectedDate);
    const newDate = new Date(currentDate);
    
    if (direction === 'prev') {
      newDate.setDate(currentDate.getDate() - 1);
    } else {
      newDate.setDate(currentDate.getDate() + 1);
    }
    
    const newDateStr = newDate.toISOString().split('T')[0];
    navigate(`/tddf1-merchant/${merchantId}/${newDateStr}`);
  };

  // Fetch merchant data for the specific date
  const { data: merchantData, isLoading, error } = useQuery({
    queryKey: ['/api/tddf1/merchant-view', merchantId, selectedDate],
    queryFn: async () => {
      const response = await fetch(`/api/tddf1/merchant-view?merchantId=${merchantId}&processingDate=${selectedDate}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(JSON.stringify(errorData));
      }
      return response.json() as Promise<MerchantDailyData>;
    },
    enabled: !!merchantId && !!selectedDate
  });

  // Fetch terminal summary data
  const { data: terminalData } = useQuery({
    queryKey: ['/api/tddf1/merchant-terminals', merchantId, selectedDate],
    queryFn: async () => {
      const response = await fetch(`/api/tddf1/merchant-terminals?merchantId=${merchantId}&processingDate=${selectedDate}`);
      if (!response.ok) return [];
      return response.json() as Promise<TerminalSummary[]>;
    },
    enabled: !!merchantId && !!selectedDate && !!merchantData
  });

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Loading merchant data...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  // Handle error response with suggested dates
  if (error && !isLoading) {
    let errorData;
    try {
      errorData = JSON.parse((error as Error).message);
    } catch {
      errorData = { error: (error as Error).message };
    }
    
    const suggestedDates = errorData?.suggestedDates || [];
    const merchantName = errorData?.merchantName || `Merchant ${merchantId}`;
    
    return (
      <MainLayout>
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
                          navigate(`/tddf1-merchant/${merchantId}/${dateStr}`);
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
            
            {/* Day Navigation for error state */}
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigateDate('prev')}>
                <ChevronLeft className="h-4 w-4" />
                Previous Day
              </Button>
              
              <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
                <Calendar className="h-4 w-4" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    navigate(`/tddf1-merchant/${merchantId}/${e.target.value}`);
                  }}
                  className="border-none p-0 h-auto w-40"
                />
              </div>
              
              <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
                Next Day
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!merchantData) {
    return (
      <MainLayout>
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
      </MainLayout>
    );
  }

  // Get unique terminals from transactions
  const uniqueTerminals = Array.from(
    new Set(merchantData.allTransactions.map(tx => tx.terminalId).filter(Boolean))
  ).sort();

  // Filter transactions
  const filteredTransactions = merchantData.allTransactions.filter((tx) => {
    if (selectedBatch && tx.entryRunNumber !== selectedBatch) return false;
    if (selectedTerminal && tx.terminalId !== selectedTerminal) return false;
    if (searchTerm) {
      return tx.referenceNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             tx.authorizationNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
             tx.terminalId?.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  });

  return (
    <MainLayout>
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
              <ChevronLeft className="h-4 w-4" />
              Previous Day
            </Button>
            
            <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
              <Calendar className="h-4 w-4" />
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  navigate(`/tddf1-merchant/${merchantId}/${e.target.value}`);
                }}
                className="border-none p-0 h-auto w-40"
              />
            </div>
            
            <Button variant="outline" size="sm" onClick={() => navigateDate('next')}>
              Next Day
              <ChevronRight className="h-4 w-4" />
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
              <div className="text-2xl font-bold">{formatNumber(merchantData.summary.totalTransactions)}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Transaction Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(merchantData.summary.totalAmount)}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Net Deposits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(merchantData.summary.totalNetDeposits)}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatNumber(merchantData.summary.totalBatches)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="transactions">
              Transactions ({formatNumber(filteredTransactions.length)})
            </TabsTrigger>
            <TabsTrigger value="terminals">
              Terminals ({terminalData?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Batches Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Batch Summary</CardTitle>
                <CardDescription>
                  Batch header records showing net deposits by entry run number
                </CardDescription>
              </CardHeader>
              <CardContent>
                {merchantData.batches.length > 0 ? (
                  <div className="space-y-2">
                    {merchantData.batches.map((batch) => (
                      <div key={batch.batchId} className="flex justify-between items-center p-3 border rounded-lg">
                        <div>
                          <div className="font-medium">Batch #{batch.entryRunNumber}</div>
                          <div className="text-sm text-muted-foreground">
                            {batch.transactionCount} transactions
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(batch.netDeposit)}</div>
                          <div className="text-sm text-muted-foreground">Net Deposit</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No batch data available for this date.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            {/* Transaction Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by reference, auth number, or terminal..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  
                  <div className="w-48">
                    <select
                      className="w-full p-2 border rounded-md"
                      value={selectedBatch}
                      onChange={(e) => setSelectedBatch(e.target.value)}
                      data-testid="filter-batch"
                    >
                      <option value="">All Batches</option>
                      {merchantData.batches.map((batch) => (
                        <option key={batch.batchId} value={batch.entryRunNumber}>
                          Batch #{batch.entryRunNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="w-48">
                    <select
                      className="w-full p-2 border rounded-md"
                      value={selectedTerminal}
                      onChange={(e) => setSelectedTerminal(e.target.value)}
                      data-testid="filter-terminal"
                    >
                      <option value="">All Terminals</option>
                      {uniqueTerminals.map((terminalId) => (
                        <option key={terminalId} value={terminalId}>
                          Terminal {terminalId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Transactions List */}
            <Card>
              <CardHeader>
                <CardTitle>Transaction Details</CardTitle>
                <CardDescription>
                  Individual transaction records with enhanced field extraction
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredTransactions.length > 0 ? (
                  <div className="space-y-2">
                    {filteredTransactions.map((transaction) => (
                      <div key={transaction.id} className="border rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <div className="font-medium">{formatCurrency(transaction.transactionAmount)}</div>
                            <div className="text-sm text-muted-foreground">
                              {transaction.cardType} • {transaction.terminalId}
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-sm">
                              Ref: {transaction.referenceNumber || 'N/A'}
                            </div>
                            <div className="text-sm">
                              Auth: {transaction.authorizationNumber || 'N/A'}
                            </div>
                          </div>
                          
                          <div>
                            <div className="flex gap-2">
                              {transaction.mccCode && (
                                <Badge 
                                  variant={transaction.mccCode === '6540' ? 'default' : 'secondary'}
                                  className="text-xs"
                                >
                                  MCC {transaction.mccCode}
                                </Badge>
                              )}
                              {transaction.transactionTypeIndicator && (
                                <Badge 
                                  variant={transaction.transactionTypeIndicator === 'F64' ? 'default' : 'outline'}
                                  className="text-xs"
                                >
                                  {transaction.transactionTypeIndicator}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Batch #{transaction.entryRunNumber}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No transactions found matching your criteria.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="terminals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Terminal Activity</CardTitle>
                <CardDescription>
                  Terminal summary with MCC codes and transaction type indicators
                </CardDescription>
              </CardHeader>
              <CardContent>
                {terminalData && terminalData.length > 0 ? (
                  <div className="space-y-4">
                    {terminalData.map((terminal) => (
                      <div key={terminal.terminalId} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="font-medium">Terminal {terminal.terminalId}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatNumber(terminal.transactionCount)} transactions • {formatCurrency(terminal.totalAmount)}
                            </div>
                          </div>
                          
                          <div className="text-right text-sm text-muted-foreground">
                            <div>First: {new Date(terminal.firstSeen).toLocaleTimeString()}</div>
                            <div>Last: {new Date(terminal.lastSeen).toLocaleTimeString()}</div>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex gap-2 flex-wrap">
                            <div className="text-sm font-medium">Card Types:</div>
                            {terminal.cardTypes.map((type, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {type}
                              </Badge>
                            ))}
                          </div>
                          
                          <div className="flex gap-2 flex-wrap">
                            <div className="text-sm font-medium">MCC Codes:</div>
                            {terminal.mccCodes.map((mcc, index) => (
                              <Badge 
                                key={index} 
                                variant={mcc === '6540' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {mcc}
                              </Badge>
                            ))}
                          </div>
                          
                          <div className="flex gap-2 flex-wrap">
                            <div className="text-sm font-medium">Transaction Types:</div>
                            {terminal.transactionTypeIndicators.map((type, index) => (
                              <Badge 
                                key={index} 
                                variant={type === 'F64' ? 'default' : 'outline'}
                                className="text-xs"
                              >
                                {type}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No terminal data available for this date.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}