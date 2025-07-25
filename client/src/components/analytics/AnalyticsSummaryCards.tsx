import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, DollarSign, LineChart, Users } from "lucide-react";

interface SummaryData {
  totalTransactions: number;
  totalRevenue: number;
  avgTransactionValue: number;
  growthRate: number;
  totalMerchants?: number;
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
            <span className={data.growthRate >= 0 ? "text-green-500" : "text-red-500"}>
              {data.growthRate >= 0 ? "+" : ""}{data.growthRate.toFixed(1)}%
            </span>
            {" "}from previous period
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            ACH Volume
          </CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            ${data.totalRevenue.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            <span className={data.growthRate >= 0 ? "text-green-500" : "text-red-500"}>
              {data.growthRate >= 0 ? "+" : ""}{data.growthRate.toFixed(1)}%
            </span>
            {" "}from previous period
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
            <span className={data.growthRate * 0.8 >= 0 ? "text-green-500" : "text-red-500"}>
              {data.growthRate * 0.8 >= 0 ? "+" : ""}{(data.growthRate * 0.8).toFixed(1)}%
            </span>
            {" "}from previous period
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">
            Total Merchants
          </CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {data.totalMerchants?.toLocaleString() || 0}
          </div>
          <p className="text-xs text-muted-foreground">
            Active merchants in system
          </p>
        </CardContent>
      </Card>
    </div>
  );
}