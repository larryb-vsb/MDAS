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
    <div className="min-h-screen bg-gray-50 p-3 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header with Navigation - Mobile Optimized */}
      <div className="space-y-4">
        {/* Mobile Header Row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <Button 
              onClick={() => setLocation('/tddf1')} 
              variant="outline" 
              size="sm"
              className="flex items-center gap-1 sm:gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Daily</span>
              <span className="sm:hidden">Back</span>
            </Button>
            <Calendar className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600" />
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">
              <span className="hidden sm:inline">TDDF1 Monthly Overview</span>
              <span className="sm:hidden">TDDF1 Monthly</span>
            </h1>
          </div>
        </div>
        
        {/* Navigation Controls Row - Mobile Optimized */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-1 sm:space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('prev')}
              className="flex items-center space-x-1"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>
            
            <div className="bg-blue-50 px-2 sm:px-4 py-1 sm:py-2 rounded-lg border border-blue-200">
              <span className="text-sm sm:text-lg font-semibold text-blue-900">
                <span className="hidden sm:inline">{format(currentMonth, 'MMMM yyyy')}</span>
                <span className="sm:hidden">{format(currentMonth, 'MMM yyyy')}</span>
              </span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigateMonth('next')}
              className="flex items-center space-x-1"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="flex items-center space-x-1"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-6 sm:h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : monthlyData ? (
        <>
          {/* Summary Cards - Mobile Optimized */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-blue-700 flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  Total Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold text-blue-900">{formatNumber(monthlyData.totalFiles)}</div>
                <p className="text-xs text-blue-600 mt-1">TDDF files processed</p>
              </CardContent>
            </Card>

            <Card className="bg-green-50 border-green-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-green-700 flex items-center">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Total Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl sm:text-2xl font-bold text-green-900">{formatNumber(monthlyData.totalRecords)}</div>
                <p className="text-xs text-green-600 mt-1">All record types</p>
              </CardContent>
            </Card>

            <Card className="bg-purple-50 border-purple-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-purple-700 flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">DT Transaction Value</span>
                  <span className="sm:hidden">DT Transaction</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg sm:text-2xl font-bold text-purple-900">{formatCurrency(monthlyData.totalTransactionValue)}</div>
                <p className="text-xs text-purple-600 mt-1">Detail Transaction totals</p>
              </CardContent>
            </Card>

            <Card className="bg-indigo-50 border-indigo-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs sm:text-sm font-medium text-indigo-700 flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  BH Net Deposit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg sm:text-2xl font-bold text-indigo-900">{formatCurrency(monthlyData.totalNetDepositBh)}</div>
                <p className="text-xs text-indigo-600 mt-1">Batch Header totals</p>
              </CardContent>
            </Card>
          </div>

          {/* Record Type Breakdown - Mobile Optimized */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-base sm:text-lg">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                <span className="hidden sm:inline">Record Type Breakdown</span>
                <span className="sm:hidden">Record Types</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-4">
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
                        className={`${colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200'} w-full justify-center py-1 sm:py-2 text-xs sm:text-sm`}
                      >
                        {type}
                      </Badge>
                      <p className="text-xs sm:text-sm font-semibold mt-1">{formatNumber(count)}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Monthly Comparison Chart - Mobile Optimized */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-base sm:text-lg">
                <LineChart className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                <span className="hidden sm:inline">Monthly Financial Trends Comparison</span>
                <span className="sm:hidden">Monthly Trends</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 sm:h-80">
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

          {/* Daily Breakdown - Mobile Optimized */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-base sm:text-lg">
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Daily Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-1 sm:py-2 px-2 sm:px-4 font-medium text-gray-700">Date</th>
                      <th className="text-right py-1 sm:py-2 px-1 sm:px-4 font-medium text-gray-700">
                        <span className="hidden sm:inline">Files</span>
                        <span className="sm:hidden">F</span>
                      </th>
                      <th className="text-right py-1 sm:py-2 px-1 sm:px-4 font-medium text-gray-700">
                        <span className="hidden sm:inline">Records</span>
                        <span className="sm:hidden">Rec</span>
                      </th>
                      <th className="text-right py-1 sm:py-2 px-1 sm:px-4 font-medium text-gray-700">
                        <span className="hidden sm:inline">DT Transaction Value</span>
                        <span className="sm:hidden">DT Value</span>
                      </th>
                      <th className="text-right py-1 sm:py-2 px-1 sm:px-4 font-medium text-gray-700">
                        <span className="hidden sm:inline">BH Net Deposit</span>
                        <span className="sm:hidden">BH Net</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.dailyBreakdown.map((day) => (
                      <tr key={day.date} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-1 sm:py-2 px-2 sm:px-4 font-medium text-gray-900">
                          <span className="hidden sm:inline">{format(new Date(day.date), 'MMM dd, yyyy')}</span>
                          <span className="sm:hidden">{format(new Date(day.date), 'MMM dd')}</span>
                        </td>
                        <td className="py-1 sm:py-2 px-1 sm:px-4 text-right text-gray-700">{day.files}</td>
                        <td className="py-1 sm:py-2 px-1 sm:px-4 text-right text-gray-700">
                          <span className="hidden sm:inline">{formatNumber(day.records)}</span>
                          <span className="sm:hidden">{day.records > 1000 ? `${(day.records/1000).toFixed(1)}k` : day.records}</span>
                        </td>
                        <td className="py-1 sm:py-2 px-1 sm:px-4 text-right text-gray-700">
                          <span className="hidden sm:inline">{formatCurrency(day.transactionValue)}</span>
                          <span className="sm:hidden">${(day.transactionValue/1000).toFixed(0)}k</span>
                        </td>
                        <td className="py-1 sm:py-2 px-1 sm:px-4 text-right text-gray-700">
                          <span className="hidden sm:inline">{formatCurrency(day.netDepositBh)}</span>
                          <span className="sm:hidden">${(day.netDepositBh/1000).toFixed(0)}k</span>
                        </td>
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
          <CardContent className="py-6 sm:py-8">
            <div className="text-center text-gray-500">
              <Calendar className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm sm:text-base">No data available for {format(currentMonth, 'MMMM yyyy')}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}