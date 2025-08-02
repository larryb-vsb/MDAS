import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, TrendingUp, FileText, DollarSign, ArrowLeft, RefreshCw, LineChart } from 'lucide-react';
import { useLocation } from 'wouter';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MonthlyTotals {
  month: string;
  totalFiles: number;
  totalRecords: number;
  totalTransactionValue: number;
  totalNetDepositBh: number;
  recordTypeBreakdown: Record<string, number>;
  dailyBreakdown: Array<{
    date: string;
    files: number;
    records: number;
    transactionValue: number;
    netDepositBh: number;
  }>;
}

interface MonthlyComparison {
  currentMonth: {
    month: string;
    dailyBreakdown: Array<{
      date: string;
      files: number;
      records: number;
      transactionValue: number;
      netDepositBh: number;
      dayOfMonth: number;
    }>;
  };
  previousMonth: {
    month: string;
    dailyBreakdown: Array<{
      date: string;
      files: number;
      records: number;
      transactionValue: number;
      netDepositBh: number;
      dayOfMonth: number;
    }>;
  };
}

export default function Tddf1MonthlyView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: monthlyData, isLoading, refetch } = useQuery({
    queryKey: ['tddf1-monthly', format(currentMonth, 'yyyy-MM')],
    queryFn: async (): Promise<MonthlyTotals> => {
      const response = await fetch(`/api/tddf1/monthly-totals?month=${format(currentMonth, 'yyyy-MM')}`);
      if (!response.ok) throw new Error('Failed to fetch monthly data');
      return response.json();
    }
  });

  const { data: comparisonData, isLoading: comparisonLoading } = useQuery({
    queryKey: ['tddf1-monthly-comparison', format(currentMonth, 'yyyy-MM')],
    queryFn: async (): Promise<MonthlyComparison> => {
      const response = await fetch(`/api/tddf1/monthly-comparison?month=${format(currentMonth, 'yyyy-MM')}`);
      if (!response.ok) throw new Error('Failed to fetch monthly comparison data');
      return response.json();
    }
  });

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const handleRefresh = () => {
    refetch();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header with Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button 
            onClick={() => setLocation('/tddf1')} 
            variant="outline" 
            size="sm"
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Daily
          </Button>
          <Calendar className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">TDDF1 Monthly Overview</h1>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateMonth('prev')}
            className="flex items-center space-x-1"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Previous</span>
          </Button>
          
          <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-200">
            <span className="text-lg font-semibold text-blue-900">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateMonth('next')}
            className="flex items-center space-x-1"
          >
            <span>Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="flex items-center space-x-1"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : monthlyData ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-700 flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  Total Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-900">{formatNumber(monthlyData.totalFiles)}</div>
                <p className="text-xs text-blue-600 mt-1">TDDF files processed</p>
              </CardContent>
            </Card>

            <Card className="bg-green-50 border-green-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-700 flex items-center">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Total Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-900">{formatNumber(monthlyData.totalRecords)}</div>
                <p className="text-xs text-green-600 mt-1">All record types</p>
              </CardContent>
            </Card>

            <Card className="bg-purple-50 border-purple-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-purple-700 flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  DT Transaction Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-900">{formatCurrency(monthlyData.totalTransactionValue)}</div>
                <p className="text-xs text-purple-600 mt-1">Detail Transaction totals</p>
              </CardContent>
            </Card>

            <Card className="bg-indigo-50 border-indigo-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-indigo-700 flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  BH Net Deposit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-indigo-900">{formatCurrency(monthlyData.totalNetDepositBh)}</div>
                <p className="text-xs text-indigo-600 mt-1">Batch Header totals</p>
              </CardContent>
            </Card>
          </div>

          {/* Record Type Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="h-5 w-5 mr-2" />
                Record Type Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
                {Object.entries(monthlyData.recordTypeBreakdown).map(([type, count]) => {
                  const colors = {
                    'BH': 'bg-blue-100 text-blue-800 border-blue-200',
                    'DT': 'bg-green-100 text-green-800 border-green-200',
                    'P1': 'bg-cyan-100 text-cyan-800 border-cyan-200',
                    'P2': 'bg-pink-100 text-pink-800 border-pink-200',
                    'E1': 'bg-orange-100 text-orange-800 border-orange-200',
                    'G2': 'bg-purple-100 text-purple-800 border-purple-200',
                    'AD': 'bg-indigo-100 text-indigo-800 border-indigo-200',
                    'DR': 'bg-red-100 text-red-800 border-red-200'
                  };
                  
                  return (
                    <div key={type} className="text-center">
                      <Badge 
                        variant="outline" 
                        className={`${colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200'} w-full justify-center py-2`}
                      >
                        {type}
                      </Badge>
                      <p className="text-sm font-semibold mt-1">{formatNumber(count)}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Monthly Comparison Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <LineChart className="h-5 w-5 mr-2" />
                Monthly Financial Trends Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {comparisonLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-gray-500">Loading comparison data...</div>
                  </div>
                ) : comparisonData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart 
                      data={(() => {
                        // Create combined dataset with proper day alignment
                        const maxDays = Math.max(
                          comparisonData.currentMonth.dailyBreakdown.length,
                          comparisonData.previousMonth.dailyBreakdown.length
                        );
                        
                        const combinedData = [];
                        for (let day = 1; day <= maxDays; day++) {
                          const currentDay = comparisonData.currentMonth.dailyBreakdown.find(d => d.dayOfMonth === day);
                          const previousDay = comparisonData.previousMonth.dailyBreakdown.find(d => d.dayOfMonth === day);
                          
                          combinedData.push({
                            dayOfMonth: day,
                            currentTransactionValue: currentDay?.transactionValue || 0,
                            currentNetDepositBh: currentDay?.netDepositBh || 0,
                            previousTransactionValue: previousDay?.transactionValue || 0,
                            previousNetDepositBh: previousDay?.netDepositBh || 0,
                            currentDate: currentDay?.date,
                            previousDate: previousDay?.date
                          });
                        }
                        return combinedData;
                      })()}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="dayOfMonth" 
                        stroke="#666"
                        fontSize={12}
                        tickFormatter={(value) => `Day ${value}`}
                      />
                      <YAxis 
                        stroke="#666"
                        fontSize={12}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                      />
                      <Tooltip 
                        formatter={(value: number, name: string) => {
                          const displayNames: Record<string, string> = {
                            'currentTransactionValue': `${format(currentMonth, 'MMM yyyy')} - DT Transaction Value`,
                            'currentNetDepositBh': `${format(currentMonth, 'MMM yyyy')} - BH Net Deposit`,
                            'previousTransactionValue': `${format(subMonths(currentMonth, 1), 'MMM yyyy')} - DT Transaction Value`,
                            'previousNetDepositBh': `${format(subMonths(currentMonth, 1), 'MMM yyyy')} - BH Net Deposit`
                          };
                          return [formatCurrency(value), displayNames[name] || name];
                        }}
                        labelFormatter={(value) => `Day ${value} of Month`}
                        contentStyle={{
                          backgroundColor: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}
                      />
                      <Legend />
                      {/* Current Month Lines - Solid */}
                      <Line 
                        type="monotone" 
                        dataKey="currentTransactionValue" 
                        stroke="#8b5cf6" 
                        strokeWidth={3}
                        name={`${format(currentMonth, 'MMM yyyy')} Transaction Value`}
                        dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 2 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="currentNetDepositBh" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        name={`${format(currentMonth, 'MMM yyyy')} Net Deposit`}
                        dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
                      />
                      {/* Previous Month Lines - Dashed */}
                      <Line 
                        type="monotone" 
                        dataKey="previousTransactionValue" 
                        stroke="#d946ef" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name={`${format(subMonths(currentMonth, 1), 'MMM yyyy')} Transaction Value`}
                        dot={{ fill: '#d946ef', strokeWidth: 2, r: 3 }}
                        activeDot={{ r: 5, stroke: '#d946ef', strokeWidth: 2 }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="previousNetDepositBh" 
                        stroke="#06b6d4" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name={`${format(subMonths(currentMonth, 1), 'MMM yyyy')} Net Deposit`}
                        dot={{ fill: '#06b6d4', strokeWidth: 2, r: 3 }}
                        activeDot={{ r: 5, stroke: '#06b6d4', strokeWidth: 2 }}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-gray-500">No comparison data available</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Daily Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Daily Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-4 font-medium text-gray-700">Date</th>
                      <th className="text-right py-2 px-4 font-medium text-gray-700">Files</th>
                      <th className="text-right py-2 px-4 font-medium text-gray-700">Records</th>
                      <th className="text-right py-2 px-4 font-medium text-gray-700">DT Transaction Value</th>
                      <th className="text-right py-2 px-4 font-medium text-gray-700">BH Net Deposit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.dailyBreakdown.map((day) => (
                      <tr key={day.date} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-4 font-medium text-gray-900">
                          {format(new Date(day.date), 'MMM dd, yyyy')}
                        </td>
                        <td className="py-2 px-4 text-right text-gray-700">{day.files}</td>
                        <td className="py-2 px-4 text-right text-gray-700">{formatNumber(day.records)}</td>
                        <td className="py-2 px-4 text-right text-gray-700">{formatCurrency(day.transactionValue)}</td>
                        <td className="py-2 px-4 text-right text-gray-700">{formatCurrency(day.netDepositBh)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No data available for {format(currentMonth, 'MMMM yyyy')}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}