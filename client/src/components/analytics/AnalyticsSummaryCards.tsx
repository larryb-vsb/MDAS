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
      {/* ACH Summary - Primary focus */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              ACH Deposits to Sub-Merchants
            </CardTitle>
            <Landmark className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.achDeposits.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Compliance deposits processed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total ACH Amount
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.achAmount.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
            <p className="text-xs text-muted-foreground">
              Total ACH value processed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Average ACH Deposit
            </CardTitle>
            <LineChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.achDeposits > 0 ? (data.achAmount / data.achDeposits).toFixed(2) : '0.00'}
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

      {/* MCC / TDDF Transaction Volumes */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">MCC Transaction & Deposit Volumes</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                MCC Transaction Volume
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
                MCC Deposit Volume
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
    </div>
  );
}