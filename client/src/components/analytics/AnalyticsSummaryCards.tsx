import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, DollarSign, LineChart, CreditCard, Landmark, Package } from "lucide-react";

interface SummaryData {
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
}

interface AnalyticsSummaryCardsProps {
  data: SummaryData | undefined;
  isLoading: boolean;
}

export default function AnalyticsSummaryCards({ data, isLoading }: AnalyticsSummaryCardsProps) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="h-4 w-32 bg-muted rounded"></div>
              <div className="h-4 w-4 bg-muted rounded-full"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 w-24 bg-muted rounded mb-2"></div>
              <div className="h-3 w-20 bg-muted rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Transactions
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.totalTransactions.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              All transaction types combined
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <p className="text-xs text-muted-foreground">
              Total value processed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Average Transaction
            </CardTitle>
            <LineChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.avgTransactionValue.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per transaction average
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Transaction Types
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">
              ACH, Card Auth, Batch
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction Type Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-blue-200 dark:border-blue-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              ACH Deposits to Sub-Merchants
            </CardTitle>
            <Landmark className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {data.achDeposits.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              ${data.achAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} total
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Compliance deposits
            </p>
          </CardContent>
        </Card>

        <Card className="border-green-200 dark:border-green-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Card Authorizations
            </CardTitle>
            <CreditCard className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {data.cardAuthorizations.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              ${data.cardAuthAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} total
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              TDDF DT records
            </p>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Batch Deposits
            </CardTitle>
            <DollarSign className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {data.batchDeposits.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              ${data.batchDepositAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} net
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              TDDF BH records
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}