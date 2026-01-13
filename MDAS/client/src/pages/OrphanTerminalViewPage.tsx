import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, RefreshCw, Activity, CreditCard, Calendar, Eye } from "lucide-react";
import { Link } from "wouter";
import SimpleActivityHeatMap from "@/components/shared/SimpleActivityHeatMap";
import { TddfTransactionDetailModal } from "@/components/tddf/TddfTransactionDetailModal";

interface OrphanTerminalDetails {
  terminalId: string;
  transactionCount: number;
  totalAmount: number;
  firstSeen: string;
  lastSeen: string;
  merchantName?: string;
  mccCode?: string;
  averageTransaction: number;
  dailyAverage: number;
  activeDays: number;
}

interface TddfTransaction {
  id: number;
  referenceNumber: string;
  merchantName: string;
  transactionAmount: string;
  transactionDate: string;
  cardType: string;
  authorizationNumber: string;
  mccCode: string;
}

export default function OrphanTerminalViewPage() {
  const { terminalId } = useParams<{ terminalId: string }>();
  const [location, navigate] = useLocation();
  const [detailsRecord, setDetailsRecord] = useState<TddfTransaction | null>(null);
  
  // Get referrer from URL params to handle back navigation
  const urlParams = new URLSearchParams(window.location.search);
  const referrer = urlParams.get('referrer');
  
  // Debug logging
  console.log('[BACK NAV DEBUG] Current location:', location);
  console.log('[BACK NAV DEBUG] window.location.search:', window.location.search);
  console.log('[BACK NAV DEBUG] Referrer:', referrer);
  
  const getBackUrl = () => {
    switch (referrer) {
      case 'tddf':
        return '/tddf';
      default:
        return '/orphan-terminals';
    }
  };
  
  const getBackLabel = () => {
    switch (referrer) {
      case 'tddf':
        return 'Back to TDDF Records';
      default:
        return 'Back';
    }
  };

  // Fetch orphan terminal details
  const { data: terminalDetails, isLoading: detailsLoading, refetch: refetchDetails } = useQuery({
    queryKey: ['/api/tddf/orphan-terminals', terminalId],
    queryFn: async () => {
      const response = await fetch(`/api/tddf/orphan-terminals/${terminalId}`, { 
        credentials: 'include' 
      });
      if (!response.ok) throw new Error('Failed to fetch orphan terminal details');
      return response.json();
    },
    enabled: !!terminalId,
  });

  // Fetch TDDF transactions for this terminal
  const { data: transactions = [], isLoading: transactionsLoading, refetch: refetchTransactions } = useQuery({
    queryKey: ['/api/tddf/by-terminal', terminalId],
    queryFn: async () => {
      const response = await fetch(`/api/tddf/by-terminal/${terminalId}`, { 
        credentials: 'include' 
      });
      if (!response.ok) throw new Error('Failed to fetch TDDF transactions');
      return response.json();
    },
    enabled: !!terminalId,
  });

  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleRefresh = () => {
    refetchDetails();
    refetchTransactions();
  };

  if (detailsLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center items-center min-h-96">
          <div className="text-muted-foreground">Loading orphan terminal details...</div>
        </div>
      </MainLayout>
    );
  }

  if (!terminalDetails) {
    return (
      <MainLayout>
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold mb-2">Orphan Terminal Not Found</h2>
          <p className="text-muted-foreground mb-4">
            Terminal ID {terminalId} not found in orphan terminals
          </p>
          <Button 
            variant="outline"
            onClick={() => navigate(getBackUrl())}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {getBackLabel()}
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate(getBackUrl())}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {getBackLabel()}
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">Terminal ID</h1>
                <span className="text-3xl font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded border border-orange-200 font-mono">
                  {terminalDetails.terminalId}
                </span>
                <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                  Orphan
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">
                {terminalDetails.merchantName || 'Unknown Merchant'}
              </p>
            </div>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Activity className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Transactions</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold">{terminalDetails.transactionCount}</p>
                    <p className="ml-2 text-sm text-muted-foreground">
                      Across {terminalDetails.activeDays} active days
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="text-2xl">💰</div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Total Volume</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold">{formatCurrency(terminalDetails.totalAmount)}</p>
                    <p className="ml-2 text-sm text-muted-foreground">
                      Avg {formatCurrency(terminalDetails.averageTransaction)} per transaction
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="text-2xl">📊</div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Daily Average</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold">{terminalDetails.dailyAverage.toFixed(1)}</p>
                    <p className="ml-2 text-sm text-muted-foreground">
                      Transactions per active day
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Calendar className="h-8 w-8 text-orange-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-muted-foreground">Last Activity</p>
                  <div className="flex items-baseline">
                    <p className="text-2xl font-bold">
                      {formatDate(terminalDetails.lastSeen).split(',')[0]}
                    </p>
                    <p className="ml-2 text-sm text-muted-foreground">
                      {formatDate(terminalDetails.lastSeen).split(',')[1]}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="activity" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="activity">Activity Heat Map</TabsTrigger>
            <TabsTrigger value="transactions">Transaction History</TabsTrigger>
            <TabsTrigger value="details">Terminal Details</TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-6">
            <SimpleActivityHeatMap 
              data={(transactions || []).map((t: any) => ({ 
                date: t.transaction_date || t.transactionDate, 
                count: 1 
              }))}
              title="Terminal Activity Heat Map"
              description="Daily transaction volume over time - darker squares indicate more transactions"
              isLoading={transactionsLoading}
            />
          </TabsContent>

          <TabsContent value="transactions" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Transaction History</CardTitle>
              </CardHeader>
              <CardContent>
                {transactionsLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="text-muted-foreground">Loading transaction history...</div>
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No transaction history found
                  </div>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50">
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
                        {transactions.map((transaction: TddfTransaction) => (
                          <tr key={transaction.id} className="border-t hover:bg-muted/25">
                            <td className="p-3 text-sm">
                              {formatDate(transaction.transactionDate)}
                            </td>
                            <td className="p-3 font-mono text-xs max-w-32 truncate">
                              {transaction.referenceNumber}
                            </td>
                            <td className="p-3 max-w-32 truncate">
                              {transaction.merchantName}
                            </td>
                            <td className="p-3 text-right font-medium">
                              {formatCurrency(transaction.transactionAmount)}
                            </td>
                            <td className="p-3 font-mono text-xs">
                              {transaction.authorizationNumber || 'N/A'}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline" className="text-xs">
                                <CreditCard className="h-3 w-3 mr-1" />
                                {transaction.cardType || 'N/A'}
                              </Badge>
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
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Terminal Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Terminal ID</label>
                      <p className="text-lg font-mono text-orange-600 bg-orange-50 px-2 py-1 rounded border border-orange-200 inline-block">
                        {terminalDetails.terminalId}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Merchant Name</label>
                      <p className="text-lg">{terminalDetails.merchantName || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">MCC Code</label>
                      <p className="text-lg font-mono">{terminalDetails.mccCode || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">First Seen</label>
                      <p className="text-lg">{formatDate(terminalDetails.firstSeen)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Last Seen</label>
                      <p className="text-lg">{formatDate(terminalDetails.lastSeen)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Status</label>
                      <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50">
                        <Activity className="h-3 w-3 mr-1" />
                        Orphan Terminal
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Transaction Detail Modal */}
        {detailsRecord && (
          <TddfTransactionDetailModal
            isOpen={!!detailsRecord}
            onClose={() => setDetailsRecord(null)}
            record={detailsRecord}
          />
        )}
      </div>
    </MainLayout>
  );
}