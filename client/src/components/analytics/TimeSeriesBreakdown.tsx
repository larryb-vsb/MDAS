import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { RefreshCw, HelpCircle } from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TransactionData {
  name: string;
  transactions: number;
  revenue: number;
}

interface TimeSeriesBreakdownProps {
  data: TransactionData[] | undefined;
  isLoading: boolean;
  title?: string;
  description?: string;
}

// Time periods for filtering
type TimePeriod = "day" | "week" | "month" | "year";

export default function TimeSeriesBreakdown({
  data: initialData,
  isLoading: initialLoading,
  title = "Transaction Time Series",
  description = "Transaction count and amounts by time period",
}: TimeSeriesBreakdownProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("month");
  const [viewType, setViewType] = useState<"count" | "amount">("count");
  
  // Fetch data from API based on selected time period
  const { data: timeframeData, isLoading: timeframeLoading } = useQuery<{ transactionData: TransactionData[] }>({
    queryKey: ["/api/analytics", timePeriod],
    queryFn: () => fetch(`/api/analytics?timeframe=${timePeriod}`).then(res => res.json()),
    enabled: !!timePeriod
  });
  
  // Combine loading states
  const isLoading = initialLoading || timeframeLoading;
  
  // Get the data to display based on the API response or initial data
  const timeSeriesData = timeframeData?.transactionData || initialData || [];
  
  // Calculate totals for the selected view
  const totalCount = timeSeriesData.reduce((sum: number, item: TransactionData) => sum + item.transactions, 0);
  const totalAmount = timeSeriesData.reduce((sum: number, item: TransactionData) => sum + item.revenue, 0);
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded shadow-sm p-3">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-blue-500">
            {`Transactions: ${payload[0].value.toLocaleString()}`}
          </p>
          <p className="text-sm text-green-500">
            {`Amount: ${formatCurrency(payload[1].value)}`}
          </p>
        </div>
      );
    }
    return null;
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="h-[400px] flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">View transaction data by different time periods</p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button 
                variant={timePeriod === "day" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setTimePeriod("day")}
              >
                Day
              </Button>
              <Button 
                variant={timePeriod === "week" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setTimePeriod("week")}
              >
                Week
              </Button>
              <Button 
                variant={timePeriod === "month" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setTimePeriod("month")}
              >
                Month
              </Button>
              <Button 
                variant={timePeriod === "year" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setTimePeriod("year")}
              >
                Year
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button 
                variant={viewType === "count" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setViewType("count")}
              >
                Count
              </Button>
              <Button 
                variant={viewType === "amount" ? "default" : "outline"} 
                size="sm" 
                onClick={() => setViewType("amount")}
              >
                Amount
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-muted/20 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground">Total Transactions</h3>
              <p className="text-2xl font-bold">{totalCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">
                For selected {timePeriod} period
              </p>
            </div>
            <div className="bg-muted/20 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-muted-foreground">Total Amount</h3>
              <p className="text-2xl font-bold">{formatCurrency(totalAmount)}</p>
              <p className="text-xs text-muted-foreground">
                ACH settlement for {timePeriod} period
              </p>
            </div>
          </div>
          
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              {viewType === "count" ? (
                <BarChart
                  data={timeSeriesData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 20,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: '#E0E0E0' }}
                  />
                  <YAxis 
                    yAxisId="left"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: '#E0E0E0' }}
                    tickFormatter={(value) => value.toLocaleString()}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: '#E0E0E0' }}
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar 
                    yAxisId="left"
                    dataKey="transactions" 
                    name="Transaction Count" 
                    fill="#8884d8" 
                    radius={[4, 4, 0, 0]} 
                  />
                  <Bar 
                    yAxisId="right"
                    dataKey="revenue" 
                    name="Transaction Amount" 
                    fill="#82ca9d" 
                    radius={[4, 4, 0, 0]} 
                  />
                </BarChart>
              ) : (
                <AreaChart
                  data={timeSeriesData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 20,
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: '#E0E0E0' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: '#E0E0E0' }}
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="transactions"
                    name="Transaction Count"
                    stroke="#8884d8"
                    fill="#8884d880"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Transaction Amount"
                    stroke="#82ca9d"
                    fill="#82ca9d80"
                    strokeWidth={2}
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}