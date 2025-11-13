import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import MainLayout from "@/components/layout/MainLayout";
import AnalyticsTransactionChart from "@/components/analytics/AnalyticsTransactionChart";
import MerchantCategoryChart from "@/components/analytics/MerchantCategoryChart";
import AnalyticsSummaryCards from "@/components/analytics/AnalyticsSummaryCards";
import TransactionTypeChart from "@/components/analytics/TransactionTypeChart";
import TransactionValueChart from "@/components/analytics/TransactionValueChart";
import MerchantGrowthChart from "@/components/analytics/MerchantGrowthChart";
import MerchantActivityChart from "@/components/analytics/MerchantActivityChart";
import TimeSeriesBreakdown from "@/components/analytics/TimeSeriesBreakdown";

interface AnalyticsData {
  transactionData: Array<{
    name: string;
    transactions: number;
    revenue: number;
    achDeposits: number;
    achAmount: number;
    cardAuthorizations: number;
    cardAuthAmount: number;
    batchDeposits: number;
    batchDepositAmount: number;
    year?: number;
  }>;
  merchantCategoryData: Array<{
    name: string;
    value: number;
    amount?: number;
  }>;
  summary: {
    totalTransactions: number;
    totalRevenue: number;
    avgTransactionValue: number;
    growthRate: number;
    totalMerchants?: number;
    achDeposits: number;
    achAmount: number;
    cardAuthorizations: number;
    cardAuthAmount: number;
    batchDeposits: number;
    batchDepositAmount: number;
  };
}

export default function Analytics() {
  const [timeframe, setTimeframe] = useState("year");
  const [viewType, setViewType] = useState("overview");
  
  // Fetching real analytics data from the API
  const {
    data: analyticsData,
    isLoading,
    isError,
    refetch
  } = useQuery<AnalyticsData>({
    queryKey: [`/api/analytics?timeframe=${timeframe}`, timeframe],
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
  
  return (
    <MainLayout>
      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground">
              View performance metrics and transaction trends
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select Timeframe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
        
        <Separator />
        
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading analytics data...</span>
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load analytics data. Please try again later.
            </AlertDescription>
          </Alert>
        ) : analyticsData ? (
          <>
            <AnalyticsSummaryCards 
              data={analyticsData.summary} 
              isLoading={isLoading} 
            />
            
            <Tabs value={viewType} onValueChange={setViewType} className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="transactions">Transactions</TabsTrigger>
                  <TabsTrigger value="revenue">Revenue</TabsTrigger>
                  <TabsTrigger value="merchants">Merchants</TabsTrigger>
                </TabsList>
              </div>
              
              <TabsContent value="overview" className="mt-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <AnalyticsTransactionChart 
                    data={analyticsData.transactionData}
                    isLoading={isLoading}
                    title="ACH Deposit Volume"
                    description="Number of ACH deposits to sub-merchants over time"
                    dataKey="achDeposits"
                    color="#3b82f6"
                    tooltipLabel="ACH Deposits"
                  />
                  <AnalyticsTransactionChart 
                    data={analyticsData.transactionData}
                    isLoading={isLoading}
                    title="ACH Deposit Amount"
                    description="Total ACH deposit amounts processed over time"
                    dataKey="achAmount"
                    color="#10b981"
                    tooltipLabel="Amount ($)"
                  />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <TransactionTypeChart 
                    data={analyticsData.transactionData}
                    isLoading={isLoading}
                  />
                  <MerchantCategoryChart 
                    data={analyticsData.merchantCategoryData}
                    isLoading={isLoading}
                    title="Merchant Categories"
                    description="Distribution of merchants by category"
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="transactions" className="mt-6">
                <TimeSeriesBreakdown 
                  data={analyticsData.transactionData}
                  isLoading={isLoading}
                  title="ACH Transaction Breakdown by Time"
                  description="Analysis of ACH deposit counts and amounts by time period"
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <TransactionTypeChart 
                    data={analyticsData.transactionData}
                    isLoading={isLoading}
                  />
                  <TransactionValueChart 
                    data={analyticsData.transactionData}
                    isLoading={isLoading}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="revenue" className="mt-6">
                <AnalyticsTransactionChart 
                  data={analyticsData.transactionData}
                  isLoading={isLoading}
                  title="ACH Revenue Trends"
                  description="Detailed view of ACH deposit amounts over time"
                  dataKey="achAmount"
                  color="#10b981"
                  tooltipLabel="ACH Amount ($)"
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <TransactionValueChart 
                    data={analyticsData.transactionData}
                    isLoading={isLoading}
                    title="Monthly Average Transaction Value"
                    description="How transaction values fluctuate monthly"
                  />
                  <TransactionTypeChart 
                    data={analyticsData.transactionData}
                    isLoading={isLoading}
                    title="Revenue Distribution"
                    description="Credit vs Debit contribution to revenue"
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="merchants" className="mt-6">
                <MerchantCategoryChart 
                  data={analyticsData.merchantCategoryData}
                  isLoading={isLoading}
                  title="Merchant Categories"
                  description="Distribution of merchants by category"
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <MerchantGrowthChart 
                    isLoading={isLoading}
                    totalMerchants={analyticsData.summary.totalMerchants || 0}
                  />
                  <MerchantActivityChart 
                    data={analyticsData.merchantCategoryData}
                    isLoading={isLoading}
                    totalMerchants={analyticsData.summary.totalMerchants || 0}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </MainLayout>
  );
}