import React from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { RefreshCw } from "lucide-react";

interface TransactionData {
  name: string;
  transactions: number;
  amount: number;
}

export default function TransactionChart() {
  const { data: analyticsData, isLoading } = useQuery<{ transactionData: TransactionData[] }>({
    queryKey: ["/api/analytics"],
    refetchInterval: 60000, // Refresh every minute
  });

  const formatDollar = (value: number) => {
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Get total from transaction data
  const totalTransactions = analyticsData?.transactionData?.reduce(
    (sum, item) => sum + item.transactions, 
    0
  ) || 0;
  
  const totalAmount = analyticsData?.transactionData?.reduce(
    (sum, item) => sum + item.amount, 
    0
  ) || 0;

  // Get percentage change (using the first and last data points)
  const calculateChange = (data: TransactionData[] | undefined, field: keyof TransactionData) => {
    if (!data || data.length < 2) return 0;
    
    const firstValue = data[0][field] as number;
    const lastValue = data[data.length - 1][field] as number;
    
    if (firstValue === 0) return 0;
    return ((lastValue - firstValue) / firstValue) * 100;
  };

  const transactionChange = calculateChange(analyticsData?.transactionData, 'transactions');
  const amountChange = calculateChange(analyticsData?.transactionData, 'amount');
  
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded shadow-sm p-3">
          <p className="font-medium">{label}</p>
          <p className="text-sm text-blue-600">
            Transactions: {payload[0].value}
          </p>
          <p className="text-sm text-green-600">
            Volume: {formatDollar(payload[1].value)}
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
          <CardTitle className="text-md font-medium">Transaction Volume</CardTitle>
          <CardDescription>Number of transactions processed over time</CardDescription>
        </CardHeader>
        <CardContent className="min-h-80 flex items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-md font-medium">Transaction Volume</CardTitle>
        <CardDescription>Number of transactions processed over time</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Total Transactions</div>
            <div className="text-2xl font-bold flex items-center">
              {totalTransactions.toLocaleString()}
              {transactionChange !== 0 && (
                <span className={`text-sm ml-2 ${transactionChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {transactionChange > 0 ? '+' : ''}{transactionChange.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Total Volume</div>
            <div className="text-2xl font-bold flex items-center">
              {formatDollar(totalAmount)}
              {amountChange !== 0 && (
                <span className={`text-sm ml-2 ${amountChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {amountChange > 0 ? '+' : ''}{amountChange.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={analyticsData?.transactionData || []}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="name"
                tick={{ fontSize: 12 }}
                tickMargin={10}
              />
              <YAxis 
                yAxisId="left"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => value.toLocaleString()}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="transactions"
                name="Transactions"
                stroke="#4f46e5"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="amount"
                name="Volume ($)"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}