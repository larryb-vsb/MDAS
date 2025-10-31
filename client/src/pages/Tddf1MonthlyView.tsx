import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, TrendingUp, FileText, DollarSign, ArrowLeft, RefreshCw, LineChart, Download, ChevronDown, ChevronUp, Sun, Moon, LogOut, Database } from 'lucide-react';
import { useLocation } from 'wouter';
import { format, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, pdf } from '@react-pdf/renderer';
import { useToast } from '@/hooks/use-toast';

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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { user, logoutMutation } = useAuth();

  // Initialize theme from user preference on component mount
  useEffect(() => {
    if (user?.themePreference) {
      setIsDarkMode(user.themePreference === 'dark');
    }
  }, [user]);

  // Mutation to update user theme preference
  const updateThemeMutation = useMutation({
    mutationFn: async (theme: 'light' | 'dark') => {
      if (!user) return;
      return apiRequest(`/api/users/${user.id}`, {
        method: 'PUT',
        body: {
          ...user,
          themePreference: theme
        }
      });
    },
    onSuccess: () => {
      // Refresh user data to get updated preferences
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    }
  });

  const handleThemeToggle = () => {
    const newTheme = isDarkMode ? 'light' : 'dark';
    setIsDarkMode(!isDarkMode);
    updateThemeMutation.mutate(newTheme);
  };

  const { data: monthlyData, isLoading, refetch } = useQuery({
    queryKey: ['tddf1-monthly', format(currentMonth, 'yyyy-MM')],
    queryFn: async (): Promise<MonthlyTotals> => {
      const response = await fetch(`/api/tddf1/monthly-totals?month=${format(currentMonth, 'yyyy-MM')}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch monthly data');
      return response.json();
    }
  });

  const { data: comparisonData, isLoading: comparisonLoading } = useQuery({
    queryKey: ['tddf1-monthly-comparison', format(currentMonth, 'yyyy-MM')],
    queryFn: async (): Promise<MonthlyComparison> => {
      const response = await fetch(`/api/tddf1/monthly-comparison?month=${format(currentMonth, 'yyyy-MM')}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch monthly comparison data');
      return response.json();
    }
  });

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const handleRefresh = () => {
    // Clear all TDDF1 queries to force fresh data
    queryClient.invalidateQueries({ queryKey: ['tddf1-monthly'] });
    queryClient.invalidateQueries({ queryKey: ['tddf1-monthly-comparison'] });
    queryClient.removeQueries({ queryKey: ['tddf1-monthly'] });
    queryClient.removeQueries({ queryKey: ['tddf1-monthly-comparison'] });
    refetch();
  };

  // Mutation for rebuilding cache
  const rebuildMutation = useMutation({
    mutationFn: async () => {
      const month = format(currentMonth, 'yyyy-MM');
      const response = await fetch(`/api/tddf1/rebuild-totals-cache?month=${month}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) throw new Error('Failed to rebuild cache');
      return response.json();
    },
    onSuccess: () => {
      // Clear and refetch data after successful rebuild
      queryClient.invalidateQueries({ queryKey: ['tddf1-monthly'] });
      queryClient.invalidateQueries({ queryKey: ['tddf1-monthly-comparison'] });
      queryClient.removeQueries({ queryKey: ['tddf1-monthly'] });
      queryClient.removeQueries({ queryKey: ['tddf1-monthly-comparison'] });
      refetch();
    }
  });

  const handleRebuildCache = () => {
    rebuildMutation.mutate();
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

  // PDF Styles
  const pdfStyles = StyleSheet.create({
    page: {
      flexDirection: 'column',
      backgroundColor: '#FFFFFF',
      padding: 30,
      fontFamily: 'Helvetica',
    },
    header: {
      marginBottom: 20,
      paddingBottom: 10,
      borderBottomWidth: 2,
      borderBottomColor: '#2563EB',
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: '#1E40AF',
      marginBottom: 5,
    },
    subtitle: {
      fontSize: 14,
      color: '#6B7280',
      marginBottom: 10,
    },
    section: {
      marginTop: 20,
      marginBottom: 15,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: '#1F2937',
      marginBottom: 10,
      paddingBottom: 5,
      borderBottomWidth: 1,
      borderBottomColor: '#E5E7EB',
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginBottom: 15,
    },
    summaryItem: {
      width: '48%',
      marginBottom: 10,
      padding: 10,
      backgroundColor: '#F9FAFB',
      borderRadius: 5,
    },
    summaryLabel: {
      fontSize: 12,
      color: '#6B7280',
      marginBottom: 3,
    },
    summaryValue: {
      fontSize: 18,
      fontWeight: 'bold',
      color: '#1F2937',
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: '#F3F4F6',
      padding: 8,
      borderRadius: 3,
      marginBottom: 5,
    },
    tableHeaderText: {
      fontSize: 11,
      fontWeight: 'bold',
      color: '#374151',
      flex: 1,
    },
    tableRow: {
      flexDirection: 'row',
      padding: 6,
      borderBottomWidth: 1,
      borderBottomColor: '#F3F4F6',
    },
    tableCell: {
      fontSize: 10,
      color: '#4B5563',
      flex: 1,
    },
    chartContainer: {
      backgroundColor: '#F9FAFB',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 5,
      padding: 15,
      marginTop: 10,
    },
    chartContent: {
      alignItems: 'center',
    },
    chartTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#374151',
      marginBottom: 10,
      textAlign: 'center',
    },
    chartStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: 15,
      flexWrap: 'wrap',
    },
    chartStatItem: {
      fontSize: 10,
      color: '#6B7280',
      textAlign: 'center',
      minWidth: '30%',
      marginBottom: 5,
    },
    summarySection: {
      marginTop: 15,
      padding: 15,
      backgroundColor: '#F9FAFB',
      borderWidth: 1,
      borderColor: '#E5E7EB',
      borderRadius: 4,
    },
    summaryTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: '#374151',
      marginBottom: 10,
      textAlign: 'center',
    },
    summaryText: {
      fontSize: 10,
      color: '#4B5563',
      marginBottom: 8,
      lineHeight: 1.4,
    },
    chartNote: {
      fontSize: 9,
      color: '#6B7280',
      textAlign: 'center',
      fontStyle: 'italic',
    },
    footer: {
      position: 'absolute',
      bottom: 30,
      left: 30,
      right: 30,
      textAlign: 'center',
      color: '#6B7280',
      fontSize: 10,
      borderTopWidth: 1,
      borderTopColor: '#E5E7EB',
      paddingTop: 10,
    },
  });

  // PDF Document Component
  const PDFReport = ({ data, comparisonData }: { data: MonthlyTotals; comparisonData: MonthlyComparison }) => (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        {/* Header */}
        <View style={pdfStyles.header}>
          <Text style={pdfStyles.title}>
            MMS Monthly Report - {format(currentMonth, 'MMMM yyyy')}
          </Text>
          <Text style={pdfStyles.subtitle}>
            Generated on {format(new Date(), 'PPP')} at {format(new Date(), 'p')}
          </Text>
        </View>

        {/* Executive Summary */}
        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Executive Summary</Text>
          <View style={pdfStyles.summaryGrid}>
            <View style={pdfStyles.summaryItem}>
              <Text style={pdfStyles.summaryLabel}>Net Deposits (BH)</Text>
              <Text style={pdfStyles.summaryValue}>{formatCurrency(data.totalNetDepositBh)}</Text>
            </View>
            <View style={pdfStyles.summaryItem}>
              <Text style={pdfStyles.summaryLabel}>Transaction Amounts (DT)</Text>
              <Text style={pdfStyles.summaryValue}>{formatCurrency(data.totalTransactionValue)}</Text>
            </View>
            <View style={pdfStyles.summaryItem}>
              <Text style={pdfStyles.summaryLabel}>Total Records</Text>
              <Text style={pdfStyles.summaryValue}>{formatNumber(data.totalRecords)}</Text>
            </View>
            <View style={pdfStyles.summaryItem}>
              <Text style={pdfStyles.summaryLabel}>Total Files</Text>
              <Text style={pdfStyles.summaryValue}>{formatNumber(data.totalFiles)}</Text>
            </View>
          </View>
        </View>

        {/* Daily Processing Activity */}
        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Daily Processing Activity</Text>
          <View style={pdfStyles.chartContainer}>
            {/* Simple line chart representation using text */}
            <View style={pdfStyles.chartContent}>
              <Text style={pdfStyles.chartTitle}>
                Daily Transaction Volume Trends
              </Text>
              <View style={pdfStyles.chartStats}>
                <Text style={pdfStyles.chartStatItem}>
                  Peak Day: {data.dailyBreakdown.length > 0 ? 
                    format(new Date(data.dailyBreakdown.reduce((max, day) => 
                      day.transactionValue > max.transactionValue ? day : max, 
                      data.dailyBreakdown[0]
                    ).date), 'MMM dd') : 'N/A'}
                </Text>
                <Text style={pdfStyles.chartStatItem}>
                  Peak Amount: {data.dailyBreakdown.length > 0 ? 
                    formatCurrency(data.dailyBreakdown.reduce((max, day) => 
                      day.transactionValue > max.transactionValue ? day : max, 
                      data.dailyBreakdown[0]
                    ).transactionValue) : '$0'}
                </Text>
                <Text style={pdfStyles.chartStatItem}>
                  Average Daily: {data.dailyBreakdown.length > 0 ? 
                    formatCurrency(data.totalTransactionValue / data.dailyBreakdown.length) : '$0'}
                </Text>
              </View>
              {/* Executive Summary */}
              <View style={pdfStyles.summarySection}>
                <Text style={pdfStyles.summaryTitle}>
                  Executive Summary
                </Text>
                <Text style={pdfStyles.summaryText}>
                  Monthly processing completed with {data.totalFiles} files containing {data.totalRecords.toLocaleString()} records. 
                  Total transaction value of {formatCurrency(data.totalTransactionValue)} and net deposits of {formatCurrency(data.totalNetDepositBh)} processed successfully.
                </Text>
                <Text style={pdfStyles.summaryText}>
                  Average daily processing: {data.dailyBreakdown.length > 0 ? 
                    Math.round(data.totalRecords / data.dailyBreakdown.length).toLocaleString() : '0'} records per day.
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Detailed Daily Breakdown */}
        <View style={pdfStyles.section}>
          <Text style={pdfStyles.sectionTitle}>Detailed Daily Breakdown</Text>
          <View style={pdfStyles.tableHeader}>
            <Text style={pdfStyles.tableHeaderText}>Date</Text>
            <Text style={pdfStyles.tableHeaderText}>Files</Text>
            <Text style={pdfStyles.tableHeaderText}>Records</Text>
            <Text style={pdfStyles.tableHeaderText}>DT Amount</Text>
            <Text style={pdfStyles.tableHeaderText}>BH Deposit</Text>
          </View>
          {data.dailyBreakdown.slice(0, 15).map((day) => (
            <View key={day.date} style={pdfStyles.tableRow}>
              <Text style={pdfStyles.tableCell}>{format(new Date(day.date), 'EEE, MMM dd')}</Text>
              <Text style={pdfStyles.tableCell}>{day.files}</Text>
              <Text style={pdfStyles.tableCell}>{formatNumber(day.records)}</Text>
              <Text style={pdfStyles.tableCell}>{formatCurrency(day.transactionValue)}</Text>
              <Text style={pdfStyles.tableCell}>{formatCurrency(day.netDepositBh)}</Text>
            </View>
          ))}
          {data.dailyBreakdown.length > 15 && (
            <View style={pdfStyles.tableRow}>
              <Text style={[pdfStyles.tableCell, { fontStyle: 'italic' }]}>
                ... and {data.dailyBreakdown.length - 15} more days
              </Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <Text style={pdfStyles.footer}>
          MMS - Merchant Management System | Confidential Financial Report
        </Text>
      </Page>
    </Document>
  );

  const { toast } = useToast();

  const generatePDFReport = async () => {
    if (!monthlyData) {
      toast({
        title: "No Data Available",
        description: "Monthly data is not loaded yet. Please wait and try again.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      toast({
        title: "Generating PDF Report",
        description: "Please wait while we create your monthly report...",
      });

      // Ensure comparison data is available
      const safeComparisonData = comparisonData || {
        currentMonth: { month: format(currentMonth, 'yyyy-MM'), dailyBreakdown: [] },
        previousMonth: { month: format(subMonths(currentMonth, 1), 'yyyy-MM'), dailyBreakdown: [] }
      };

      const doc = <PDFReport data={monthlyData} comparisonData={safeComparisonData} />;
      const blob = await pdf(doc).toBlob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MMS-Monthly-Report-${format(currentMonth, 'yyyy-MM')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "PDF Report Generated",
        description: `Monthly report for ${format(currentMonth, 'MMMM yyyy')} has been downloaded`,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      console.error('Error details:', {
        monthlyData: !!monthlyData,
        comparisonData: !!comparisonData,
        errorMessage: error.message,
        errorStack: error.stack
      });
      toast({
        title: "PDF Generation Failed",
        description: `Error: ${error.message || 'Unknown error'}. Please try again.`,
        variant: "destructive",
      });
    }
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
              <span className="hidden sm:inline">Monthly Merchant Processing</span>
              <span className="sm:hidden">Monthly Processing</span>
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
              onClick={handleThemeToggle}
              className="flex items-center space-x-1"
              disabled={updateThemeMutation.isPending}
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span className="hidden sm:inline">{isDarkMode ? 'Light' : 'Dark'}</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={generatePDFReport}
              className="flex items-center space-x-1 bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700"
              disabled={!monthlyData}
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">PDF Report</span>
              <span className="sm:hidden">PDF</span>
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
            
            {user?.username === 'admin' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRebuildCache}
                className="flex items-center space-x-1"
                disabled={rebuildMutation.isPending}
              >
                <Database className={`h-4 w-4 ${rebuildMutation.isPending ? 'animate-pulse' : ''}`} />
                <span className="hidden sm:inline">Rebuild Cache</span>
                <span className="sm:hidden">Rebuild</span>
              </Button>
            )}
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
            {/* Transaction Authorizations Processed - First Position */}
            <Card className={`${isDarkMode ? 'bg-purple-900 border-purple-700' : 'bg-purple-50 border-purple-200'} transition-colors`}>
              <CardHeader className="pb-1">
                <CardTitle className={`text-sm sm:text-base font-medium ${isDarkMode ? 'text-purple-300' : 'text-purple-700'} flex items-center`}>
                  <DollarSign className="h-5 w-5 mr-2" />
                  <span className="hidden sm:inline">Transaction Authorizations Processed</span>
                  <span className="sm:hidden">Authorizations Processed</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className={`text-3xl sm:text-4xl font-bold ${isDarkMode ? 'text-purple-100' : 'text-purple-900'} mb-1`}>
                  {formatCurrency(monthlyData.totalTransactionValue)}
                </div>
                <p className={`text-sm ${isDarkMode ? 'text-purple-400' : 'text-purple-600'}`}>Detail Transaction (DT) totals</p>
              </CardContent>
            </Card>

            {/* Net Deposits Processed - Second Position */}
            <Card className={`${isDarkMode ? 'bg-indigo-900 border-indigo-700' : 'bg-indigo-50 border-indigo-200'} transition-colors`}>
              <CardHeader className="pb-1">
                <CardTitle className={`text-sm sm:text-base font-medium ${isDarkMode ? 'text-indigo-300' : 'text-indigo-700'} flex items-center`}>
                  <DollarSign className="h-5 w-5 mr-2" />
                  Net Deposits Processed
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className={`text-3xl sm:text-4xl font-bold ${isDarkMode ? 'text-indigo-100' : 'text-indigo-900'} mb-1`}>
                  {formatCurrency(monthlyData.totalNetDepositBh)}
                </div>
                <p className={`text-sm ${isDarkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>Batch Header (BH) totals</p>
              </CardContent>
            </Card>
          </div>



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
                ) : comparisonData && comparisonData.currentMonth && comparisonData.currentMonth.dailyBreakdown ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart 
                      data={(() => {
                        // Ensure we have valid data before processing
                        if (!comparisonData.currentMonth.dailyBreakdown || comparisonData.currentMonth.dailyBreakdown.length === 0) {
                          return [];
                        }

                        // Group current month data by day (since API returns individual file entries)
                        const currentDayGroups = comparisonData.currentMonth.dailyBreakdown.reduce((acc, entry) => {
                          const day = new Date(entry.date).getDate();
                          if (!acc[day]) {
                            acc[day] = { transactionValue: 0, netDepositBh: 0, date: entry.date };
                          }
                          acc[day].transactionValue += entry.transactionValue;
                          acc[day].netDepositBh += entry.netDepositBh;
                          return acc;
                        }, {} as Record<number, { transactionValue: number; netDepositBh: number; date: string }>);

                        // Group previous month data by day - handle case where previous month has no data
                        const previousDayGroups = (comparisonData.previousMonth && comparisonData.previousMonth.dailyBreakdown || []).reduce((acc, entry) => {
                          const day = new Date(entry.date).getDate();
                          if (!acc[day]) {
                            acc[day] = { transactionValue: 0, netDepositBh: 0, date: entry.date };
                          }
                          acc[day].transactionValue += entry.transactionValue;
                          acc[day].netDepositBh += entry.netDepositBh;
                          return acc;
                        }, {} as Record<number, { transactionValue: number; netDepositBh: number; date: string }>);

                        // Create chart data for all days in the month
                        const maxDays = Math.max(
                          Math.max(...Object.keys(currentDayGroups).map(Number), 0),
                          Math.max(...Object.keys(previousDayGroups).map(Number), 0),
                          31 // Maximum possible days in a month
                        );
                        
                        const combinedData = [];
                        for (let day = 1; day <= maxDays; day++) {
                          const currentDay = currentDayGroups[day];
                          const previousDay = previousDayGroups[day];
                          
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
                        // Only show days that have current month data OR previous month data, but filter correctly
                        return combinedData.filter(d => 
                          d.currentTransactionValue > 0 || d.currentNetDepositBh > 0 || 
                          d.previousTransactionValue > 0 || d.previousNetDepositBh > 0
                        );
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
                            'currentTransactionValue': `${format(currentMonth, 'MMM yyyy')} - DT Authorizations`,
                            'currentNetDepositBh': `${format(currentMonth, 'MMM yyyy')} - BH Net Deposit`,
                            'previousTransactionValue': `${format(subMonths(currentMonth, 1), 'MMM yyyy')} - DT Authorizations`,
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
                        name={`${format(currentMonth, 'MMM yyyy')} Authorizations`}
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
                        name={`${format(subMonths(currentMonth, 1), 'MMM yyyy')} Authorizations`}
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
                    <div className="text-gray-500">
                      {comparisonData ? 'No daily breakdown data available for comparison' : 'No comparison data available'}
                    </div>
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
                        <span className="hidden sm:inline">DT Authorizations</span>
                        <span className="sm:hidden">DT Auth</span>
                      </th>
                      <th className={`text-right py-1 sm:py-2 px-1 sm:px-4 font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        <span className="hidden sm:inline">BH Net Deposit</span>
                        <span className="sm:hidden">BH Net</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Group daily breakdown by date and aggregate
                      const dailyAggregated = monthlyData.dailyBreakdown.reduce((acc, entry) => {
                        const dateKey = entry.date;
                        if (!acc[dateKey]) {
                          acc[dateKey] = {
                            date: dateKey,
                            files: 0,
                            records: 0,
                            transactionValue: 0,
                            netDepositBh: 0
                          };
                        }
                        acc[dateKey].files += entry.files;
                        acc[dateKey].records += entry.records;
                        acc[dateKey].transactionValue += entry.transactionValue;
                        acc[dateKey].netDepositBh += entry.netDepositBh;
                        return acc;
                      }, {} as Record<string, { date: string; files: number; records: number; transactionValue: number; netDepositBh: number }>);

                      // Convert to array and sort by date
                      return Object.values(dailyAggregated)
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                    })().map((day, index) => {
                      const isHighActivity = day.files > 3;
                      const rowBgClass = isHighActivity 
                        ? (isDarkMode ? 'bg-yellow-900/30 hover:bg-yellow-900/40' : 'bg-yellow-50 hover:bg-yellow-100')
                        : (isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50');
                      
                      return (
                        <tr key={`${day.date}-aggregated`} className={`border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-100'} ${rowBgClass} transition-colors`}>
                          <td className={`py-1 sm:py-2 px-2 sm:px-4 font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            <span className="hidden sm:inline">{format(new Date(day.date), 'EEE, MMM dd, yyyy')}</span>
                            <span className="sm:hidden">{format(new Date(day.date), 'EEE, MMM dd')}</span>
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
                      )
                    })}
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

      {/* Big Logout Button at Bottom */}
      <div className="mt-8 mb-4">
        <Button 
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          size="lg"
          variant="destructive"
          className="w-full py-4 text-lg font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
        >
          <LogOut className="h-6 w-6 mr-3" />
          {logoutMutation.isPending ? 'Logging out...' : 'Log Out'}
        </Button>
      </div>
    </div>
  );
}