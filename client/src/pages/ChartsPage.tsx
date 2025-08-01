import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, TrendingUp, DollarSign, Calendar, Users } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { format, subDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';

interface ChartData {
  dailyData: Array<{
    date: string;
    transactionAmount: number;
    authAmount: number;
    transactionCount: number;
    uniqueMerchants: number;
  }>;
  merchantTrends: Array<{
    merchantName: string;
    merchantNumber: string;
    totalAmount: number;
    transactionCount: number;
    avgAmount: number;
  }>;
  authAmountTrends: Array<{
    date: string;
    transactionAmount: number;
    authAmount: number;
    difference: number;
    percentDifference: number;
  }>;
  cardTypeTrends: Array<{
    cardType: string;
    count: number;
    totalAmount: number;
    percentage: number;
  }>;
  summary: {
    totalRecords: number;
    totalTransactionAmount: number;
    totalAuthAmount: number;
    uniqueMerchants: number;
    dateRange: {
      startDate: string;
      endDate: string;
    };
    processingTimeMs: number;
    lastRefreshDatetime: string;
  };
}

const CARD_TYPE_COLORS = {
  'VISA': '#1f4e79',
  'MC': '#eb001b',
  'AMEX': '#006fcf',
  'DISC': '#ff6000',
  'Other': '#64748b'
};

export default function ChartsPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch charts data
  const { data: chartsData, isLoading, error } = useQuery<ChartData>({
    queryKey: ['/api/charts/60day-trends'],
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: () => apiRequest('/api/charts/refresh', {
      method: 'POST',
      body: JSON.stringify({ requestedBy: 'admin' })
    }),
    onMutate: () => {
      setIsRefreshing(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/charts/60day-trends'] });
      toast({
        title: "Charts Refreshed",
        description: "60-day trends data has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Refresh Failed",
        description: error.message || "Failed to refresh charts data.",
        variant: "destructive"
      });
    },
    onSettled: () => {
      setIsRefreshing(false);
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading 60-day trend charts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Charts</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Failed to load charts data. Please try refreshing the page.</p>
            <Button 
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/charts/60day-trends'] })}
              className="mt-4"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!chartsData) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>No Data Available</CardTitle>
          </CardHeader>
          <CardContent>
            <p>No TDDF data available for charts. Please ensure TDDF files have been uploaded and processed.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { dailyData, merchantTrends, authAmountTrends, cardTypeTrends, summary } = chartsData;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TDDF Analytics Charts</h1>
          <p className="text-muted-foreground mt-1">
            60-day trends and statistics from TDDF DT records
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-sm">
            Last updated: {format(new Date(summary.lastRefreshDatetime), 'MMM d, yyyy h:mm a')}
          </Badge>
          <Button
            onClick={() => refreshMutation.mutate()}
            disabled={isRefreshing}
            size="sm"
          >
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalRecords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              From {format(new Date(summary.dateRange.startDate), 'MMM d')} to {format(new Date(summary.dateRange.endDate), 'MMM d')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transaction Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${summary.totalTransactionAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Auth: ${summary.totalAuthAmount.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unique Merchants</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.uniqueMerchants}</div>
            <p className="text-xs text-muted-foreground">
              Active in 60 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Data Freshness</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.processingTimeMs}ms</div>
            <p className="text-xs text-muted-foreground">
              Query processing time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Trends Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Transaction Trends</CardTitle>
          <CardDescription>Transaction and authorization amounts over the last 60 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => format(new Date(value), 'MMM d')}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                  formatter={(value: number, name: string) => [
                    name === 'transactionCount' ? value.toLocaleString() : `$${value.toLocaleString()}`,
                    name === 'transactionAmount' ? 'Transaction Amount' :
                    name === 'authAmount' ? 'Auth Amount' :
                    name === 'transactionCount' ? 'Transaction Count' : 'Unique Merchants'
                  ]}
                />
                <Legend />
                <Line type="monotone" dataKey="transactionAmount" stroke="#8884d8" name="Transaction Amount" strokeWidth={2} />
                <Line type="monotone" dataKey="authAmount" stroke="#82ca9d" name="Auth Amount" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Count and Merchant Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Daily Transaction Count</CardTitle>
            <CardDescription>Number of transactions processed each day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => format(new Date(value), 'M/d')}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip 
                    labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                    formatter={(value: number) => [value.toLocaleString(), 'Transactions']}
                  />
                  <Bar dataKey="transactionCount" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Card Type Distribution</CardTitle>
            <CardDescription>Breakdown of transactions by card type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={cardTypeTrends}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ cardType, percentage }) => `${cardType} (${percentage.toFixed(1)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {cardTypeTrends.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CARD_TYPE_COLORS[entry.cardType as keyof typeof CARD_TYPE_COLORS] || CARD_TYPE_COLORS.Other} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value.toLocaleString(), 'Transactions']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Merchants */}
      <Card>
        <CardHeader>
          <CardTitle>Top Merchants by Volume</CardTitle>
          <CardDescription>Leading merchants by total transaction amount (last 60 days)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={merchantTrends.slice(0, 10)} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis 
                  dataKey="merchantName" 
                  type="category" 
                  tick={{ fontSize: 11 }}
                  width={120}
                />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Total Amount']}
                />
                <Bar dataKey="totalAmount" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Auth vs Transaction Amount Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Authorization vs Transaction Amount Trends</CardTitle>
          <CardDescription>Comparison of authorized amounts vs final transaction amounts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={authAmountTrends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => format(new Date(value), 'MMM d')}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                  formatter={(value: number, name: string) => [
                    name === 'percentDifference' ? `${value.toFixed(2)}%` : `$${value.toLocaleString()}`,
                    name === 'transactionAmount' ? 'Transaction Amount' :
                    name === 'authAmount' ? 'Auth Amount' :
                    name === 'difference' ? 'Difference' : 'Percent Difference'
                  ]}
                />
                <Legend />
                <Line type="monotone" dataKey="transactionAmount" stroke="#8884d8" name="Transaction Amount" strokeWidth={2} />
                <Line type="monotone" dataKey="authAmount" stroke="#82ca9d" name="Auth Amount" strokeWidth={2} />
                <Line type="monotone" dataKey="difference" stroke="#ffc658" name="Difference" strokeWidth={1} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}