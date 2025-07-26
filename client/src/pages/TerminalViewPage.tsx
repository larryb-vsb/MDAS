import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TddfTransactionDetailModal } from "@/components/tddf/TddfTransactionDetailModal";
import { ArrowLeft, Activity, CreditCard, Calendar, TrendingUp, Wifi, Shield, RefreshCw, Eye, FileText } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { Terminal, Transaction } from "@shared/schema";
import { formatTddfDate, formatTableDate } from "@/lib/date-utils";
import TerminalActivityHeatMap from "@/components/terminals/TerminalActivityHeatMap";
// import TerminalTransactionsViewer from "@/components/terminals/TerminalTransactionsViewer";

export default function TerminalViewPage() {
  const params = useParams();
  const [, navigate] = useLocation();
  const [timeRange, setTimeRange] = useState("12months");
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [showTransactionDetail, setShowTransactionDetail] = useState(false);
  
  const terminalId = params.id ? parseInt(params.id) : null;

  // Fetch terminal details with forced refresh
  const { data: terminal, isLoading: terminalLoading, refetch } = useQuery({
    queryKey: [`/api/terminals/${terminalId}`],
    enabled: !!terminalId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch(`/api/terminals/${terminalId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch terminal');
      }
      return response.json();
    }
  });

  // Debug logging
  console.log('[TERMINAL DEBUG] Terminal ID:', terminalId);
  console.log('[TERMINAL DEBUG] Terminal data:', terminal);
  console.log('[TERMINAL DEBUG] VAR Number from data:', terminal?.vNumber);

  // Card Type Detection Function - Converts plain card type codes to formatted badges
  function getCardTypeBadges(cardType: string) {
    const cardTypeUpper = cardType?.trim().toUpperCase();
    
    // Mastercard identification (MC, MD, MB)
    if (cardTypeUpper === 'MC') {
      return { label: 'MC', className: 'bg-red-100 text-red-800 border-red-200' };
    }
    if (cardTypeUpper === 'MD') {
      return { label: 'MC-D', className: 'bg-red-100 text-red-800 border-red-200' };
    }
    if (cardTypeUpper === 'MB') {
      return { label: 'MC-B', className: 'bg-red-100 text-red-800 border-red-200' };
    }
    
    // Visa identification (VS, VD, VB, etc.)
    if (cardTypeUpper === 'VS') {
      return { label: 'VISA', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    if (cardTypeUpper === 'VD') {
      return { label: 'VISA-D', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    if (cardTypeUpper === 'VB') {
      return { label: 'VISA-B', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    if (cardTypeUpper?.startsWith('V')) {
      return { label: 'VISA', className: 'bg-blue-100 text-blue-800 border-blue-200' };
    }
    
    // American Express identification (AM, AX, etc.)
    if (cardTypeUpper === 'AM' || cardTypeUpper?.startsWith('AX')) {
      return { label: 'AMEX', className: 'bg-green-100 text-green-800 border-green-200' };
    }
    
    // Discover identification (DS, DI, etc.)
    if (cardTypeUpper === 'DS' || cardTypeUpper === 'DI' || cardTypeUpper?.startsWith('DISC')) {
      return { label: 'DISC', className: 'bg-orange-100 text-orange-800 border-orange-200' };
    }

    // Debit specific codes
    if (cardTypeUpper === 'DB' || cardTypeUpper === 'DEBIT') {
      return { label: 'DEBIT', className: 'bg-purple-100 text-purple-800 border-purple-200' };
    }
    
    // Default fallback
    return { label: cardType || 'UNKNOWN', className: 'bg-gray-100 text-gray-800 border-gray-200' };
  }

  // Manual refresh function
  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [`/api/terminals/${terminalId}`] });
    await refetch();
  };

  // Extract Terminal ID from VAR Number for TDDF linking
  // VAR V8357055 maps to Terminal ID 78357055 (add "7" prefix after removing "V")
  const terminalIdFromVar = terminal?.vNumber ? '7' + terminal.vNumber.replace('V', '') : null;
  
  // Fetch TDDF transactions linked to this terminal via Terminal ID field
  const { data: tddfTransactions = [], isLoading: tddfLoading } = useQuery({
    queryKey: ["/api/tddf/by-terminal", terminalIdFromVar],
    enabled: !!terminalIdFromVar,
    queryFn: async () => {
      const response = await fetch(`/api/tddf/by-terminal/${terminalIdFromVar}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch TDDF transactions');
      }
      return response.json();
    }
  });

  // Debug logging for TDDF transactions
  console.log('[TDDF DEBUG] Terminal VAR:', terminal?.vNumber);
  console.log('[TDDF DEBUG] Extracted Terminal ID:', terminalIdFromVar);
  console.log('[TDDF DEBUG] TDDF Transactions:', tddfTransactions);

  // Fetch regular transactions (filtered by POS Merchant Number)
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions/by-merchant", terminal?.posMerchantNumber],
    enabled: !!terminal?.posMerchantNumber,
  });

  // Calculate activity metrics including TDDF transactions
  const activityMetrics = useMemo(() => {
    const validTransactions = Array.isArray(transactions) ? transactions : [];
    const validTddfTransactions = Array.isArray(tddfTransactions) ? tddfTransactions : [];
    const allTransactions = [...validTransactions, ...validTddfTransactions];
    
    if (!allTransactions.length) {
      return {
        totalTransactions: 0,
        totalVolume: 0,
        avgDailyTransactions: 0,
        avgTransactionAmount: 0,
        activeDays: 0,
        lastActivityDate: null
      };
    }

    const totalTransactions = allTransactions.length;
    const totalVolume = allTransactions.reduce((sum, t) => {
      // Handle both regular transactions and TDDF records
      const amount = t.amount || t.transactionAmount || 0;
      return sum + parseFloat(amount.toString());
    }, 0);
    const avgTransactionAmount = totalVolume / totalTransactions;

    // Calculate daily activity
    const transactionsByDate = allTransactions.reduce((acc, transaction) => {
      // Handle both regular transactions and TDDF records
      const transactionDate = transaction.date || transaction.transactionDate || transaction.recordedAt;
      const date = new Date(transactionDate).toDateString();
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const activeDays = Object.keys(transactionsByDate).length;
    const avgDailyTransactions = activeDays > 0 ? totalTransactions / activeDays : 0;
    
    const lastActivityDate = allTransactions.length > 0 
      ? new Date(Math.max(...allTransactions.map(t => {
          const transactionDate = t.date || t.transactionDate || t.recordedAt;
          return new Date(transactionDate).getTime();
        })))
      : null;

    return {
      totalTransactions,
      totalVolume,
      avgDailyTransactions,
      avgTransactionAmount,
      activeDays,
      lastActivityDate,
      dailyActivity: transactionsByDate
    };
  }, [transactions, tddfTransactions]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "Active": "default",
      "Inactive": "secondary", 
      "Maintenance": "outline",
      "Deployed": "default"
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getTerminalTypeIcon = (type?: string | null) => {
    switch (type) {
      case "mobile": return <Wifi className="h-4 w-4" />;
      case "countertop": return <CreditCard className="h-4 w-4" />;
      case "virtual": return <Shield className="h-4 w-4" />;
      default: return <CreditCard className="h-4 w-4" />;
    }
  };

  if (terminalLoading) {
    return (
      <MainLayout>
        <div className="p-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading terminal details...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!terminal) {
    return (
      <MainLayout>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Terminal Not Found</CardTitle>
            </CardHeader>
            <CardContent>
              <p>The requested terminal could not be found.</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => navigate("/terminals")}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Terminals
              </Button>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate("/terminals")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-3">
                {getTerminalTypeIcon(terminal.terminalType)}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-blue-600">VAR Number</span>
                  </div>
                  <h1 className="text-3xl font-bold tracking-tight text-blue-900">
                    {terminal.vNumber || "Not specified"}
                  </h1>
                </div>
                {getStatusBadge(terminal.status)}
              </div>
              <p className="text-muted-foreground mt-1">
                {terminal.dbaName || "Terminal Details & Analytics"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh}
              disabled={terminalLoading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30days">Last 30 Days</SelectItem>
                <SelectItem value="3months">Last 3 Months</SelectItem>
                <SelectItem value="6months">Last 6 Months</SelectItem>
                <SelectItem value="12months">Last 12 Months</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Terminal Info Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {activityMetrics.totalTransactions.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Across {activityMetrics.activeDays} active days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${activityMetrics.totalVolume.toLocaleString(undefined, { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Avg: ${activityMetrics.avgTransactionAmount.toFixed(2)} per transaction
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Daily Average</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {activityMetrics.avgDailyTransactions.toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground">
                Transactions per active day
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Activity</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {activityMetrics.lastActivityDate 
                  ? formatTableDate(activityMetrics.lastActivityDate.toISOString()).split(' ')[0]
                  : "No Activity"
                }
              </div>
              <p className="text-xs text-muted-foreground">
                {activityMetrics.lastActivityDate 
                  ? formatTableDate(activityMetrics.lastActivityDate.toISOString()).split(' ')[1] + " " + 
                    formatTableDate(activityMetrics.lastActivityDate.toISOString()).split(' ')[2]
                  : "No transactions found"
                }
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="activity" className="space-y-4">
          <TabsList>
            <TabsTrigger value="activity">Activity Heat Map</TabsTrigger>
            <TabsTrigger value="transactions">Transaction History</TabsTrigger>
            <TabsTrigger value="details">Terminal Details</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Transaction Activity Heat Map</CardTitle>
                <CardDescription>
                  Daily transaction volume over time - darker squares indicate more transactions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TerminalActivityHeatMap 
                  transactions={tddfTransactions || []} 
                  timeRange={timeRange} 
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            {/* TDDF Transactions Section */}
            <Card>
              <CardHeader>
                <CardTitle>TDDF Transaction History</CardTitle>
                <CardDescription>
                  TDDF records linked to this terminal via Terminal ID mapping (VAR {terminal?.vNumber} = Terminal ID {terminalIdFromVar})
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tddfLoading ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Loading TDDF transactions...</p>
                  </div>
                ) : tddfTransactions.length > 0 ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Found {tddfTransactions.length} TDDF transactions for Terminal ID {terminalIdFromVar}
                    </p>
                    <div className="border rounded-lg">
                      <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="text-left p-3 font-medium">Date</th>
                              <th className="text-left p-3 font-medium">Reference</th>
                              <th className="text-left p-3 font-medium">Merchant</th>
                              <th className="text-right p-3 font-medium">Amount</th>
                              <th className="text-left p-3 font-medium">Auth #</th>
                              <th className="text-left p-3 font-medium">Card Type</th>
                              <th className="text-center p-3 font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tddfTransactions.map((transaction: any) => (
                              <tr key={transaction.id} className="border-t hover:bg-muted/25">
                                <td className="p-3">
                                  {transaction.transactionDate 
                                    ? formatTddfDate(transaction.transactionDate)
                                    : 'N/A'
                                  }
                                </td>
                                <td className="p-3 font-mono text-xs">
                                  {transaction.referenceNumber || 'N/A'}
                                </td>
                                <td className="p-3 max-w-32 truncate">
                                  {transaction.merchantName || 'N/A'}
                                </td>
                                <td className="p-3 text-right font-medium">
                                  ${parseFloat(transaction.transactionAmount || 0).toFixed(2)}
                                </td>
                                <td className="p-3 font-mono text-xs">
                                  {transaction.authorizationNumber || 'N/A'}
                                </td>
                                <td className="p-3">
                                  {transaction.cardType ? (
                                    <span 
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border ${getCardTypeBadges(transaction.cardType).className} flex-shrink-0`}
                                    >
                                      <CreditCard className="h-3 w-3" />
                                      {getCardTypeBadges(transaction.cardType).label}
                                    </span>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">N/A</Badge>
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => {
                                      setSelectedTransaction(transaction);
                                      setShowTransactionDetail(true);
                                    }}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">
                      No TDDF transactions found for Terminal ID {terminalIdFromVar}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      VAR {terminal?.vNumber} maps to Terminal ID {terminalIdFromVar} in TDDF records
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Terminal Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Prominent V Number Display */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-sm font-medium text-blue-800">VAR Number</p>
                        <p className="text-lg font-bold text-blue-900">{terminal.vNumber || "Not specified"}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="font-medium">POS Merchant #:</span>
                    <span>{terminal.posMerchantNumber}</span>
                    
                    <span className="font-medium">DBA Name:</span>
                    <span>{terminal.dbaName || "Not specified"}</span>
                    
                    <span className="font-medium">Terminal Type:</span>
                    <span className="capitalize">{terminal.terminalType || "Not specified"}</span>
                    
                    <span className="font-medium">Status:</span>
                    <span>{getStatusBadge(terminal.status)}</span>
                    
                    <span className="font-medium">MCC:</span>
                    <span>{terminal.mcc || "Not specified"}</span>
                    
                    <span className="font-medium">Location:</span>
                    <span>{terminal.location || "Not specified"}</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>System Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="font-medium">Board Date:</span>
                    <span>{terminal.boardDate ? formatTableDate(terminal.boardDate.toString()) : "Not specified"}</span>
                    
                    <span className="font-medium">Created:</span>
                    <span>{terminal.createdAt ? formatTableDate(terminal.createdAt.toString()) : "Not available"}</span>
                    
                    <span className="font-medium">Last Update:</span>
                    <span>{terminal.lastUpdate ? formatTableDate(terminal.lastUpdate.toString()) : "Never"}</span>
                    
                    <span className="font-medium">Updated By:</span>
                    <span>{terminal.updatedBy || "System"}</span>
                    
                    <span className="font-medium">Update Source:</span>
                    <span>{terminal.updateSource || "Not specified"}</span>
                    
                    <span className="font-medium">Sync Status:</span>
                    <span>{terminal.syncStatus || "Unknown"}</span>
                  </div>
                  
                  {/* Additional TSYS Fields */}
                  <div className="border-t pt-3 mt-3">
                    <h4 className="font-medium mb-2 text-sm">TSYS Configuration</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <span className="font-medium">BIN:</span>
                      <span>{terminal.bin || "Not specified"}</span>
                      
                      <span className="font-medium">Agent:</span>
                      <span>{terminal.agent || "Not specified"}</span>
                      
                      <span className="font-medium">Chain:</span>
                      <span>{terminal.chain || "Not specified"}</span>
                      
                      <span className="font-medium">Store:</span>
                      <span>{terminal.store || "Not specified"}</span>
                      
                      <span className="font-medium">Terminal #:</span>
                      <span className="font-mono">{terminal.genericField1 || "Not specified"}</span>
                      
                      <span className="font-medium">SSL:</span>
                      <span>{terminal.ssl || "Not specified"}</span>
                      
                      <span className="font-medium">Tokenization:</span>
                      <span>{terminal.tokenization || "Not specified"}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {(terminal.description || terminal.notes) && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes & Description</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {terminal.description && (
                    <div>
                      <h4 className="font-medium mb-2">Description:</h4>
                      <p className="text-sm text-muted-foreground">{terminal.description}</p>
                    </div>
                  )}
                  {terminal.notes && (
                    <div>
                      <h4 className="font-medium mb-2">Notes:</h4>
                      <p className="text-sm text-muted-foreground">{terminal.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Transaction Detail Modal */}
      <TddfTransactionDetailModal
        isOpen={showTransactionDetail}
        onClose={() => setShowTransactionDetail(false)}
        transaction={selectedTransaction}
        terminal={terminal as any}
      />
    </MainLayout>
  );
}