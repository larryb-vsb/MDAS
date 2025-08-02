import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, TrendingUp, FileText, DollarSign, ArrowLeft, RefreshCw, LineChart, Download, ChevronDown, ChevronUp, Sun, Moon, LogOut } from 'lucide-react';
import { useLocation } from 'wouter';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';

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
  const [showRecordTypes, setShowRecordTypes] = useState(false);
  const { user, logoutMutation } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(user?.darkMode || false);

  // Load dark mode from user profile
  useEffect(() => {
    if (user?.darkMode !== undefined) {
      setIsDarkMode(user.darkMode);
    }
  }, [user]);

  // Mutation to update user dark mode preference
  const updateDarkModeMutation = useMutation({
    mutationFn: async (darkMode: boolean) => {
      return await apiRequest(`/api/user/dark-mode`, {
        method: 'PUT',
        body: { darkMode }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    }
  });

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

  const generatePDFReport = () => {
    if (!monthlyData || !comparisonData) return;
    
    // Create comprehensive HTML content that includes chart data and tables
    const chartData = comparisonData.chartData || [];
    const maxValue = Math.max(...chartData.map(d => Math.max(d.current || 0, d.previous || 0)));
    
    // Generate ASCII-style chart representation
    const generateChartBars = () => {
      return chartData.map(point => {
        const currentBar = '█'.repeat(Math.round((point.current || 0) / maxValue * 20));
        const previousBar = '▓'.repeat(Math.round((point.previous || 0) / maxValue * 20));
        return `${point.day.toString().padStart(2, '0')}: ${currentBar.padEnd(22, ' ')} ($${((point.current || 0) / 1000).toFixed(0)}k)
    ${previousBar.padEnd(22, ' ')} ($${((point.previous || 0) / 1000).toFixed(0)}k prev)`;
      }).join('\n');
    };
    
    const reportContent = `
===============================================================================
                            MMS MONTHLY REPORT
                         ${format(currentMonth, 'MMMM yyyy')}
===============================================================================
Generated on: ${format(new Date(), 'PPP')}

EXECUTIVE SUMMARY
================================================================================
Net Deposits Processed:           ${formatCurrency(monthlyData.totalNetDepositBh)}
Transaction Authorizations:       ${formatCurrency(monthlyData.totalTransactionValue)}
Total Records Processed:          ${formatNumber(monthlyData.totalRecords)}
Total Files Processed:            ${formatNumber(monthlyData.totalFiles)}

MONTH-OVER-MONTH COMPARISON
================================================================================
Current Month (${format(currentMonth, 'MMM yyyy')}):
- Transaction Value: ${formatCurrency(comparisonData.currentMonth.transactionValue)}
- Net Deposits:      ${formatCurrency(comparisonData.currentMonth.netDeposit)}
- Total Records:     ${formatNumber(comparisonData.currentMonth.records)}
- Processing Days:   ${comparisonData.currentMonth.days}

Previous Month (${format(subMonths(currentMonth, 1), 'MMM yyyy')}):
- Transaction Value: ${formatCurrency(comparisonData.previousMonth.transactionValue)}
- Net Deposits:      ${formatCurrency(comparisonData.previousMonth.netDeposit)}
- Total Records:     ${formatNumber(comparisonData.previousMonth.records)}
- Processing Days:   ${comparisonData.previousMonth.days}

DAILY TRANSACTION VALUE CHART (Current vs Previous Month)
================================================================================
Day: Current Month ████████████████████ Previous Month ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
${generateChartBars()}

RECORD TYPE BREAKDOWN
================================================================================
${Object.entries(monthlyData.recordTypeBreakdown)
  .sort(([,a], [,b]) => (b as number) - (a as number))
  .map(([type, count]) => {
    const typeDescriptions = {
      'BH': 'Batch Headers',
      'DT': 'Detail Transactions', 
      'P1': 'Purchasing Card 1',
      'P2': 'Purchasing Card 2',
      'E1': 'Electronic Check',
      'G2': 'General Data 2',
      'AD': 'Merchant Adjustment',
      'DR': 'Direct Marketing'
    };
    const desc = typeDescriptions[type as keyof typeof typeDescriptions] || 'Unknown';
    return `${type} (${desc}): ${formatNumber(count as number).padStart(12, ' ')}`;
  }).join('\n')}

DAILY PROCESSING BREAKDOWN
================================================================================
Date          Files  Records      DT Transaction Value    BH Net Deposit
${monthlyData.dailyBreakdown.map(day => {
  const dateStr = format(new Date(day.date), 'MMM dd, yyyy');
  const filesStr = day.files.toString().padStart(5, ' ');
  const recordsStr = formatNumber(day.records).padStart(10, ' ');
  const dtStr = formatCurrency(day.transactionValue).padStart(18, ' ');
  const bhStr = formatCurrency(day.netDepositBh).padStart(15, ' ');
  return `${dateStr}  ${filesStr}  ${recordsStr}  ${dtStr}  ${bhStr}`;
}).join('\n')}

PERFORMANCE METRICS
================================================================================
Average Files per Day:             ${(monthlyData.totalFiles / monthlyData.dailyBreakdown.length).toFixed(1)}
Average Records per File:          ${(monthlyData.totalRecords / monthlyData.totalFiles).toFixed(0)}
Average Transaction Value per Day: ${formatCurrency(monthlyData.totalTransactionValue / monthlyData.dailyBreakdown.length)}
Peak Processing Day:               ${monthlyData.dailyBreakdown.reduce((max, day) => 
  day.records > max.records ? day : max).date}

===============================================================================
                              END OF REPORT
===============================================================================
Report generated by MMS (Merchant Management System)
For questions or support, contact your system administrator.
`;

    // Create blob and download
    const blob = new Blob([reportContent], { type: 'text/plain; charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MMS-Monthly-Report-${format(currentMonth, 'yyyy-MM')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    updateDarkModeMutation.mutate(newDarkMode);
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} p-3 sm:p-6 space-y-4 sm:space-y-6 transition-colors`}>
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
            <h1 className={`text-xl sm:text-3xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <span className="hidden sm:inline">MMS Monthly Overview</span>
              <span className="sm:hidden">MMS Monthly</span>
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

          <div className="flex items-center space-x-1 sm:space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleDarkMode}
              disabled={updateDarkModeMutation.isPending}
              className="flex items-center space-x-1"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">{isDarkMode ? 'Light' : 'Dark'}</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={generatePDFReport}
              className="flex items-center space-x-1"
              disabled={!monthlyData || !comparisonData}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Report</span>
            </Button>
            
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
          {/* Main Financial Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Net Deposits Processed - First Position */}
            <Card className={`${isDarkMode ? 'bg-indigo-900 border-indigo-700' : 'bg-indigo-50 border-indigo-200'} transition-colors`}>
              <CardHeader className="pb-3">
                <CardTitle className={`text-sm sm:text-base font-medium ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'} flex items-center`}>
                  <DollarSign className="h-5 w-5 mr-2" />
                  Net Deposits Processed
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl sm:text-4xl font-bold ${isDarkMode ? 'text-indigo-100' : 'text-indigo-900'} mb-2`}>
                  {formatCurrency(monthlyData.totalNetDepositBh)}
                </div>
                <p className={`text-sm ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>Batch Header (BH) totals</p>
              </CardContent>
            </Card>

            {/* Transaction Authorizations Processed */}
            <Card className={`${isDarkMode ? 'bg-purple-900 border-purple-700' : 'bg-purple-50 border-purple-200'} transition-colors`}>
              <CardHeader className="pb-3">
                <CardTitle className={`text-sm sm:text-base font-medium ${isDarkMode ? 'text-purple-300' : 'text-purple-700'} flex items-center`}>
                  <DollarSign className="h-5 w-5 mr-2" />
                  <span className="hidden sm:inline">Transaction Authorizations Processed</span>
                  <span className="sm:hidden">Authorizations Processed</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl sm:text-4xl font-bold ${isDarkMode ? 'text-purple-100' : 'text-purple-900'} mb-2`}>
                  {formatCurrency(monthlyData.totalTransactionValue)}
                </div>
                <p className={`text-sm ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>Detail Transaction (DT) totals</p>
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
          <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
            <CardHeader>
              <CardTitle className={`flex items-center text-base sm:text-lg ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
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
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#f0f0f0'} />
                      <XAxis 
                        dataKey="dayOfMonth" 
                        stroke={isDarkMode ? '#9ca3af' : '#666'}
                        fontSize={12}
                        tickFormatter={(value) => `Day ${value}`}
                        tick={{ fill: isDarkMode ? '#d1d5db' : '#666' }}
                      />
                      <YAxis 
                        stroke={isDarkMode ? '#9ca3af' : '#666'}
                        fontSize={12}
                        tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                        tick={{ fill: isDarkMode ? '#d1d5db' : '#666' }}
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
                          backgroundColor: isDarkMode ? '#1f2937' : '#fff',
                          border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                          color: isDarkMode ? '#f3f4f6' : '#1f2937'
                        }}
                      />
                      <Legend 
                        wrapperStyle={{
                          color: isDarkMode ? '#d1d5db' : '#374151'
                        }}
                      />
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
          <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
            <CardHeader>
              <CardTitle className={`flex items-center text-base sm:text-lg ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                Daily Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className={`border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                      <th className={`text-left py-1 sm:py-2 px-2 sm:px-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Date</th>
                      <th className={`text-right py-1 sm:py-2 px-1 sm:px-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="hidden sm:inline">Files</span>
                        <span className="sm:hidden">F</span>
                      </th>
                      <th className={`text-right py-1 sm:py-2 px-1 sm:px-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="hidden sm:inline">Records</span>
                        <span className="sm:hidden">Rec</span>
                      </th>
                      <th className={`text-right py-1 sm:py-2 px-1 sm:px-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="hidden sm:inline">DT Transaction Value</span>
                        <span className="sm:hidden">DT Value</span>
                      </th>
                      <th className={`text-right py-1 sm:py-2 px-1 sm:px-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="hidden sm:inline">BH Net Deposit</span>
                        <span className="sm:hidden">BH Net</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.dailyBreakdown.map((day) => (
                      <tr key={day.date} className={`border-b ${isDarkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'} transition-colors`}>
                        <td className={`py-1 sm:py-2 px-2 sm:px-4 font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                          <span className="hidden sm:inline">{format(new Date(day.date), 'MMM dd, yyyy')}</span>
                          <span className="sm:hidden">{format(new Date(day.date), 'MMM dd')}</span>
                        </td>
                        <td className={`py-1 sm:py-2 px-1 sm:px-4 text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{day.files}</td>
                        <td className={`py-1 sm:py-2 px-1 sm:px-4 text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span className="hidden sm:inline">{formatNumber(day.records)}</span>
                          <span className="sm:hidden">{day.records > 1000 ? `${(day.records/1000).toFixed(1)}k` : day.records}</span>
                        </td>
                        <td className={`py-1 sm:py-2 px-1 sm:px-4 text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span className="hidden sm:inline">{formatCurrency(day.transactionValue)}</span>
                          <span className="sm:hidden">${(day.transactionValue/1000).toFixed(0)}k</span>
                        </td>
                        <td className={`py-1 sm:py-2 px-1 sm:px-4 text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
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

          {/* Bottom Section - Total Files and Record Types */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Total Files - Moved to Bottom */}
            <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-blue-200'} transition-colors`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-blue-300' : 'text-blue-700'} flex items-center`}>
                  <FileText className="h-4 w-4 mr-1" />
                  Total Files
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-blue-200' : 'text-blue-900'}`}>{formatNumber(monthlyData.totalFiles)}</div>
                <p className={`text-xs ${isDarkMode ? 'text-blue-400' : 'text-blue-600'} mt-1`}>MMS files processed</p>
              </CardContent>
            </Card>

            {/* Total Records */}
            <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-green-50 border-green-200'} transition-colors`}>
              <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-green-300' : 'text-green-700'} flex items-center`}>
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Total Records
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-green-200' : 'text-green-900'}`}>{formatNumber(monthlyData.totalRecords)}</div>
                <p className={`text-xs ${isDarkMode ? 'text-green-400' : 'text-green-600'} mt-1`}>All record types</p>
              </CardContent>
            </Card>
          </div>

          {/* Collapsible Record Type Breakdown */}
          <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
            <CardHeader className="cursor-pointer" onClick={() => setShowRecordTypes(!showRecordTypes)}>
              <CardTitle className={`flex items-center justify-between text-base sm:text-lg ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                <div className="flex items-center">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                  <span className="hidden sm:inline">Record Type Breakdown</span>
                  <span className="sm:hidden">Record Types</span>
                </div>
                {showRecordTypes ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </CardTitle>
            </CardHeader>
            {showRecordTypes && (
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-4">
                  {Object.entries(monthlyData.recordTypeBreakdown).map(([type, count]) => {
                    const colors = {
                      'BH': isDarkMode ? 'bg-blue-800 text-blue-200 border-blue-600' : 'bg-blue-100 text-blue-800 border-blue-200',
                      'DT': isDarkMode ? 'bg-green-800 text-green-200 border-green-600' : 'bg-green-100 text-green-800 border-green-200',
                      'P1': isDarkMode ? 'bg-cyan-800 text-cyan-200 border-cyan-600' : 'bg-cyan-100 text-cyan-800 border-cyan-200',
                      'P2': isDarkMode ? 'bg-pink-800 text-pink-200 border-pink-600' : 'bg-pink-100 text-pink-800 border-pink-200',
                      'E1': isDarkMode ? 'bg-orange-800 text-orange-200 border-orange-600' : 'bg-orange-100 text-orange-800 border-orange-200',
                      'G2': isDarkMode ? 'bg-purple-800 text-purple-200 border-purple-600' : 'bg-purple-100 text-purple-800 border-purple-200',
                      'AD': isDarkMode ? 'bg-indigo-800 text-indigo-200 border-indigo-600' : 'bg-indigo-100 text-indigo-800 border-indigo-200',
                      'DR': isDarkMode ? 'bg-red-800 text-red-200 border-red-600' : 'bg-red-100 text-red-800 border-red-200'
                    };
                    
                    return (
                      <div key={type} className="text-center">
                        <Badge 
                          variant="outline" 
                          className={`${colors[type as keyof typeof colors] || (isDarkMode ? 'bg-gray-700 text-gray-200 border-gray-600' : 'bg-gray-100 text-gray-800 border-gray-200')} w-full justify-center py-1 sm:py-2 text-xs sm:text-sm`}
                        >
                          {type}
                        </Badge>
                        <p className={`text-xs sm:text-sm font-semibold mt-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>{formatNumber(count)}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Big Logout Button for MonthlyD Users */}
          {user?.role === "MonthlyD" && (
            <div className="pt-8">
              <Card className={`${isDarkMode ? 'bg-red-900 border-red-700' : 'bg-red-50 border-red-200'} transition-colors`}>
                <CardContent className="py-6">
                  <div className="text-center">
                    <Button 
                      onClick={handleLogout}
                      disabled={logoutMutation.isPending}
                      size="lg"
                      variant="destructive"
                      className="text-lg px-8 py-4 h-auto"
                    >
                      <LogOut className="h-6 w-6 mr-3" />
                      {logoutMutation.isPending ? 'Logging out...' : 'Logout'}
                    </Button>
                    <p className={`text-sm mt-3 ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>
                      Click here to securely log out of your session
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      ) : (
        <Card className={`${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} transition-colors`}>
          <CardContent className="py-6 sm:py-8">
            <div className={`text-center ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Calendar className="h-8 w-8 sm:h-12 sm:w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm sm:text-base">No data available for {format(currentMonth, 'MMMM yyyy')}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}