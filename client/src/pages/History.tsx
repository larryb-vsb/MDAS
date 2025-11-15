import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Calendar, TrendingUp, FileText, DollarSign, RefreshCw, Download, ChevronDown, ChevronUp, Home, Database } from 'lucide-react';
import { useRoute, useLocation } from 'wouter';
import { format, parse, startOfMonth, startOfQuarter, getQuarter } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
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

interface BreadcrumbItem {
  label: string;
  path: string;
}

type ViewType = 'landing' | 'monthly' | 'quarterly' | 'daily';

interface ParsedRoute {
  viewType: ViewType;
  year?: number;
  month?: number;
  monthName?: string;
  quarter?: number;
  day?: number;
  date?: Date;
}

export default function History() {
  const [, params] = useRoute('/history/:path*');
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [showRecordTypes, setShowRecordTypes] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Initialize theme from user preference
  useEffect(() => {
    if (user?.themePreference) {
      setIsDarkMode(user.themePreference === 'dark');
    }
  }, [user]);

  // Parse the URL path to determine what to display
  const parsedRoute: ParsedRoute = useMemo(() => {
    if (!params?.path) {
      return { viewType: 'landing' };
    }

    const pathParts = params.path.split('/').filter(Boolean);
    
    if (pathParts.length === 0) {
      return { viewType: 'landing' };
    }

    // Parse year (first part should always be year)
    const year = parseInt(pathParts[0]);
    if (isNaN(year)) {
      return { viewType: 'landing' };
    }

    // Only year provided
    if (pathParts.length === 1) {
      return { viewType: 'landing', year };
    }

    const secondPart = pathParts[1];

    // Check for quarterly view (Q1, Q2, Q3, Q4)
    if (secondPart.match(/^Q[1-4]$/i)) {
      const quarter = parseInt(secondPart.substring(1));
      return { 
        viewType: 'quarterly', 
        year, 
        quarter,
        date: startOfQuarter(new Date(year, (quarter - 1) * 3, 1))
      };
    }

    // Check for month (either number 1-12 or month name)
    let month: number | undefined;
    let monthName: string | undefined;

    // Try parsing as number first
    const monthNum = parseInt(secondPart);
    if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
      month = monthNum;
    } else {
      // Try parsing as month name (january, jan, february, feb, etc.)
      const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
      ];
      const shortMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      
      const lowerSecondPart = secondPart.toLowerCase();
      const fullMonthIndex = monthNames.indexOf(lowerSecondPart);
      const shortMonthIndex = shortMonthNames.indexOf(lowerSecondPart);
      
      if (fullMonthIndex !== -1) {
        month = fullMonthIndex + 1;
        monthName = monthNames[fullMonthIndex];
      } else if (shortMonthIndex !== -1) {
        month = shortMonthIndex + 1;
        monthName = monthNames[shortMonthIndex];
      }
    }

    if (!month) {
      return { viewType: 'landing', year };
    }

    // Check for daily view (third part would be day)
    if (pathParts.length === 3) {
      const day = parseInt(pathParts[2]);
      if (!isNaN(day) && day >= 1 && day <= 31) {
        const date = new Date(year, month - 1, day);
        return { 
          viewType: 'daily', 
          year, 
          month, 
          monthName,
          day,
          date
        };
      }
    }

    // Monthly view
    const date = new Date(year, month - 1, 1);
    return { 
      viewType: 'monthly', 
      year, 
      month,
      monthName,
      date
    };
  }, [params]);

  // Generate breadcrumbs based on parsed route
  const breadcrumbs: BreadcrumbItem[] = useMemo(() => {
    const crumbs: BreadcrumbItem[] = [
      { label: 'History', path: '/history' }
    ];

    if (parsedRoute.year) {
      crumbs.push({ label: parsedRoute.year.toString(), path: `/history/${parsedRoute.year}` });
    }

    if (parsedRoute.viewType === 'quarterly' && parsedRoute.quarter) {
      crumbs.push({ label: `Q${parsedRoute.quarter}`, path: `/history/${parsedRoute.year}/Q${parsedRoute.quarter}` });
    }

    if (parsedRoute.month) {
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const monthName = parsedRoute.monthName || monthNames[parsedRoute.month - 1];
      crumbs.push({ label: monthName.charAt(0).toUpperCase() + monthName.slice(1), path: `/history/${parsedRoute.year}/${monthName}` });
    }

    if (parsedRoute.day) {
      crumbs.push({ label: parsedRoute.day.toString(), path: `/history/${parsedRoute.year}/${parsedRoute.monthName || parsedRoute.month}/${parsedRoute.day}` });
    }

    return crumbs;
  }, [parsedRoute]);

  // Fetch monthly data if we're in monthly view
  const { data: monthlyData, isLoading: monthlyLoading, error: monthlyError, refetch: refetchMonthly } = useQuery({
    queryKey: ['history-monthly', parsedRoute.year, parsedRoute.month],
    queryFn: async (): Promise<MonthlyTotals> => {
      if (!parsedRoute.date) throw new Error('Invalid date');
      const response = await fetch(`/api/tddf1/monthly-totals?month=${format(parsedRoute.date, 'yyyy-MM')}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch monthly data');
      return response.json();
    },
    enabled: parsedRoute.viewType === 'monthly' && !!parsedRoute.date
  });

  const { data: comparisonData, isLoading: comparisonLoading } = useQuery({
    queryKey: ['history-comparison', parsedRoute.year, parsedRoute.month],
    queryFn: async (): Promise<MonthlyComparison> => {
      if (!parsedRoute.date) throw new Error('Invalid date');
      const response = await fetch(`/api/tddf1/monthly-comparison?month=${format(parsedRoute.date, 'yyyy-MM')}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch comparison data');
      return response.json();
    },
    enabled: parsedRoute.viewType === 'monthly' && !!parsedRoute.date
  });

  // Mutation for rebuilding cache
  const rebuildMutation = useMutation({
    mutationFn: async () => {
      if (!parsedRoute.year || !parsedRoute.month) throw new Error('Invalid date');
      
      const response = await fetch(`/api/pre-cache/monthly-cache/${parsedRoute.year}/${parsedRoute.month}/rebuild`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to rebuild cache');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Cache Rebuild Started",
        description: `Rebuilding cache in background. Check Pre-Cache Management for progress.`,
        duration: 5000,
      });
      
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['history-monthly'] });
        queryClient.invalidateQueries({ queryKey: ['history-comparison'] });
      }, 3000);
    },
    onError: (error: Error) => {
      toast({
        title: "Rebuild Failed",
        description: error.message,
        variant: "destructive",
        duration: 5000,
      });
    }
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['history-monthly'] });
    queryClient.invalidateQueries({ queryKey: ['history-comparison'] });
    queryClient.removeQueries({ queryKey: ['history-monthly'] });
    queryClient.removeQueries({ queryKey: ['history-comparison'] });
    refetchMonthly();
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

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!comparisonData) return [];
    
    const maxDays = Math.max(
      comparisonData.currentMonth.dailyBreakdown.length,
      comparisonData.previousMonth.dailyBreakdown.length
    );

    return Array.from({ length: maxDays }, (_, i) => {
      const dayNum = i + 1;
      const currentDay = comparisonData.currentMonth.dailyBreakdown.find(d => d.dayOfMonth === dayNum);
      const previousDay = comparisonData.previousMonth.dailyBreakdown.find(d => d.dayOfMonth === dayNum);

      return {
        day: dayNum,
        currentAuth: currentDay?.transactionValue || 0,
        currentDeposit: currentDay?.netDepositBh || 0,
        previousAuth: previousDay?.transactionValue || 0,
        previousDeposit: previousDay?.netDepositBh || 0,
      };
    });
  }, [comparisonData]);

  const renderBreadcrumbs = () => (
    <div className={`flex items-center space-x-2 text-sm mb-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
      <Home className="h-4 w-4" />
      {breadcrumbs.map((crumb, index) => (
        <div key={crumb.path} className="flex items-center space-x-2">
          {index > 0 && <ChevronRight className="h-4 w-4" />}
          {index === breadcrumbs.length - 1 ? (
            <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{crumb.label}</span>
          ) : (
            <button
              onClick={() => setLocation(crumb.path)}
              className={`hover:underline ${isDarkMode ? 'hover:text-white' : 'hover:text-gray-900'}`}
              data-testid={`breadcrumb-${crumb.label.toLowerCase()}`}
            >
              {crumb.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );

  const renderLandingPage = () => (
    <div className="space-y-6">
      <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
        <CardHeader>
          <CardTitle className={isDarkMode ? 'text-white' : ''}>
            Available History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
            Navigate by year, month, quarter, or day using the URL patterns:
          </p>
          <ul className={`mt-4 space-y-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            <li>• <code className={`px-2 py-1 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>/history/2025</code> - View all data for 2025</li>
            <li>• <code className={`px-2 py-1 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>/history/2025/november</code> - Monthly view</li>
            <li>• <code className={`px-2 py-1 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>/history/2025/11</code> - Monthly view (numeric)</li>
            <li>• <code className={`px-2 py-1 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>/history/2025/Q1</code> - Quarterly view</li>
            <li>• <code className={`px-2 py-1 rounded ${isDarkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>/history/2025/november/14</code> - Daily view</li>
          </ul>

          <div className="mt-8">
            <h3 className={`text-lg font-semibold mb-4 ${isDarkMode ? 'text-white' : ''}`}>Quick Links</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Button
                variant="outline"
                onClick={() => setLocation('/history/2025/november')}
                className="w-full"
                data-testid="link-november-2025"
              >
                November 2025
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/history/2025/october')}
                className="w-full"
                data-testid="link-october-2025"
              >
                October 2025
              </Button>
              <Button
                variant="outline"
                onClick={() => setLocation('/history/2025/Q4')}
                className="w-full"
                data-testid="link-q4-2025"
              >
                Q4 2025
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderMonthlyView = () => {
    if (monthlyLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
      );
    }

    if (monthlyError || !monthlyData) {
      return (
        <Card className={`${isDarkMode ? 'bg-red-900/20 border-red-700' : 'bg-red-50 border-red-200'} p-8`}>
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className={`text-6xl ${isDarkMode ? 'text-red-400' : 'text-red-500'}`}>⚠️</div>
            <h3 className={`text-xl font-semibold ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>
              Failed to Load Data
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-600'} max-w-md`}>
              {monthlyError instanceof Error ? monthlyError.message : 'An unexpected error occurred.'}
            </p>
            <Button
              onClick={() => refetchMonthly()}
              className={`${isDarkMode ? 'bg-red-700 hover:bg-red-600' : 'bg-red-600 hover:bg-red-700'} text-white`}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <div className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className={isDarkMode ? 'bg-gradient-to-br from-blue-900 to-blue-800 border-blue-700' : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-blue-100' : 'text-blue-700'}`}>
                Total Files
              </CardTitle>
              <FileText className={`h-4 w-4 ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl sm:text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-blue-900'}`}>
                {formatNumber(monthlyData.totalFiles)}
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-blue-200' : 'text-blue-600'} mt-1`}>
                TDDF files processed
              </p>
            </CardContent>
          </Card>

          <Card className={isDarkMode ? 'bg-gradient-to-br from-green-900 to-green-800 border-green-700' : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-green-100' : 'text-green-700'}`}>
                Total Records
              </CardTitle>
              <TrendingUp className={`h-4 w-4 ${isDarkMode ? 'text-green-300' : 'text-green-600'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl sm:text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-green-900'}`}>
                {formatNumber(monthlyData.totalRecords)}
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-green-200' : 'text-green-600'} mt-1`}>
                All record types
              </p>
            </CardContent>
          </Card>

          <Card className={isDarkMode ? 'bg-gradient-to-br from-purple-900 to-purple-800 border-purple-700' : 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200'}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-purple-100' : 'text-purple-700'}`}>
                Transaction Authorizations
              </CardTitle>
              <DollarSign className={`h-4 w-4 ${isDarkMode ? 'text-purple-300' : 'text-purple-600'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-purple-900'}`}>
                {formatCurrency(monthlyData.totalTransactionValue)}
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-purple-200' : 'text-purple-600'} mt-1`}>
                DT record totals
              </p>
            </CardContent>
          </Card>

          <Card className={isDarkMode ? 'bg-gradient-to-br from-orange-900 to-orange-800 border-orange-700' : 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200'}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-orange-100' : 'text-orange-700'}`}>
                Net Deposits
              </CardTitle>
              <DollarSign className={`h-4 w-4 ${isDarkMode ? 'text-orange-300' : 'text-orange-600'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-xl sm:text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-orange-900'}`}>
                {formatCurrency(monthlyData.totalNetDepositBh)}
              </div>
              <p className={`text-xs ${isDarkMode ? 'text-orange-200' : 'text-orange-600'} mt-1`}>
                BH batch totals
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Record Type Breakdown */}
        <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className={isDarkMode ? 'text-white' : ''}>Record Type Breakdown</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRecordTypes(!showRecordTypes)}
                data-testid="button-toggle-record-types"
              >
                {showRecordTypes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {showRecordTypes && (
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {Object.entries(monthlyData.recordTypeBreakdown).map(([type, count]) => (
                  <div key={type} className={`text-center p-3 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{type}</div>
                    <div className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatNumber(count)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Monthly Comparison Chart */}
        {comparisonData && !comparisonLoading && (
          <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardHeader>
              <CardTitle className={isDarkMode ? 'text-white' : ''}>Monthly Financial Trends Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <RechartsLineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                  <XAxis 
                    dataKey="day" 
                    label={{ value: 'Day of Month', position: 'insideBottom', offset: -5 }}
                    stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
                  />
                  <YAxis 
                    stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                      border: `1px solid ${isDarkMode ? '#374151' : '#e5e7eb'}`,
                      borderRadius: '8px',
                      color: isDarkMode ? '#f3f4f6' : '#111827'
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="currentAuth" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    name={`${comparisonData.currentMonth.month} Authorizations`}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="currentDeposit" 
                    stroke="#06b6d4" 
                    strokeWidth={2}
                    name={`${comparisonData.currentMonth.month} Net Deposit`}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="previousAuth" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name={`${comparisonData.previousMonth.month} Authorizations`}
                    dot={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="previousDeposit" 
                    stroke="#06b6d4" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name={`${comparisonData.previousMonth.month} Net Deposit`}
                    dot={false}
                  />
                </RechartsLineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Daily Breakdown Table */}
        <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <CardTitle className={isDarkMode ? 'text-white' : ''}>Daily Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                    <th className={`text-left p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Date</th>
                    <th className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Files</th>
                    <th className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Records</th>
                    <th className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>DT Authorizations</th>
                    <th className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>BH Net Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.dailyBreakdown.map((day) => (
                    <tr 
                      key={day.date} 
                      className={`border-b ${isDarkMode ? 'border-gray-700 hover:bg-gray-700' : 'border-gray-100 hover:bg-gray-50'} cursor-pointer`}
                      onClick={() => {
                        const date = new Date(day.date);
                        const dayNum = date.getDate();
                        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
                        const monthName = parsedRoute.monthName || monthNames[(parsedRoute.month || 1) - 1];
                        setLocation(`/history/${parsedRoute.year}/${monthName}/${dayNum}`);
                      }}
                      data-testid={`row-day-${day.date}`}
                    >
                      <td className={`p-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{format(new Date(day.date), 'MMM dd, yyyy')}</td>
                      <td className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{day.files}</td>
                      <td className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{formatNumber(day.records)}</td>
                      <td className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{formatCurrency(day.transactionValue)}</td>
                      <td className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{formatCurrency(day.netDepositBh)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderQuarterlyView = () => (
    <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
      <CardHeader>
        <CardTitle className={isDarkMode ? 'text-white' : ''}>
          Quarterly View - Q{parsedRoute.quarter} {parsedRoute.year}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
          Quarterly aggregation coming soon. This will show combined data for all months in Q{parsedRoute.quarter} {parsedRoute.year}.
        </p>
        <div className="mt-4">
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Navigate to individual months:
          </p>
          <div className="flex gap-2 mt-2">
            {[0, 1, 2].map(offset => {
              const monthNum = (parsedRoute.quarter! - 1) * 3 + offset + 1;
              const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
              return (
                <Button
                  key={monthNum}
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation(`/history/${parsedRoute.year}/${monthNames[monthNum - 1]}`)}
                  data-testid={`link-month-${monthNum}`}
                >
                  {monthNames[monthNum - 1].charAt(0).toUpperCase() + monthNames[monthNum - 1].slice(1)}
                </Button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderDailyView = () => (
    <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
      <CardHeader>
        <CardTitle className={isDarkMode ? 'text-white' : ''}>
          Daily View - {parsedRoute.date && format(parsedRoute.date, 'MMMM dd, yyyy')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={isDarkMode ? 'text-gray-300' : 'text-gray-600'}>
          Daily detail view coming soon. This will show all activity for {parsedRoute.date && format(parsedRoute.date, 'MMMM dd, yyyy')}.
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} transition-colors`}>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header with Breadcrumbs and Actions */}
        <div className="mb-6">
          {renderBreadcrumbs()}
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {parsedRoute.viewType === 'landing' && 'History'}
              {parsedRoute.viewType === 'monthly' && parsedRoute.date && format(parsedRoute.date, 'MMMM yyyy')}
              {parsedRoute.viewType === 'quarterly' && `Q${parsedRoute.quarter} ${parsedRoute.year}`}
              {parsedRoute.viewType === 'daily' && parsedRoute.date && format(parsedRoute.date, 'MMMM dd, yyyy')}
            </h1>

            <div className="flex gap-2">
              {parsedRoute.viewType === 'monthly' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={monthlyLoading}
                    data-testid="button-refresh"
                  >
                    <RefreshCw className={`h-4 w-4 ${monthlyLoading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline ml-1">Refresh</span>
                  </Button>
                  
                  {user?.role === 'admin' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => rebuildMutation.mutate()}
                      disabled={rebuildMutation.isPending}
                      data-testid="button-rebuild-cache"
                    >
                      <Database className={`h-4 w-4 ${rebuildMutation.isPending ? 'animate-pulse' : ''}`} />
                      <span className="hidden sm:inline ml-1">Rebuild</span>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        {parsedRoute.viewType === 'landing' && renderLandingPage()}
        {parsedRoute.viewType === 'monthly' && renderMonthlyView()}
        {parsedRoute.viewType === 'quarterly' && renderQuarterlyView()}
        {parsedRoute.viewType === 'daily' && renderDailyView()}
      </div>
    </div>
  );
}
