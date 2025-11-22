import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronRight, Calendar, TrendingUp, FileText, DollarSign, RefreshCw, Download, ChevronDown, ChevronUp, Home, Database, ChevronLeft, BarChart3, Table as TableIcon, Building2, Activity } from 'lucide-react';
import { useRoute, useLocation } from 'wouter';
import { format, parse, startOfMonth, startOfQuarter, getQuarter, addMonths, subMonths, addDays, subDays } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { LineChart as RechartsLineChart, Line, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '@/hooks/use-toast';
import clsx from 'clsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tddf1MerchantVolumeTab } from '@/components/Tddf1MerchantVolumeTab';
import { FilterBar } from '@/components/history/FilterBar';
import { MonthPicker } from '@/components/history/MonthPicker';

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

interface QuarterlyTotals {
  quarter: string;
  year: string;
  months: string[];
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

interface QuarterlyComparison {
  currentQuarter: {
    quarter: string;
    year: string;
    monthlyBreakdown: Array<{
      month: string;
      monthValue: string;
      records: number;
      transactionValue: number;
      netDepositBh: number;
    }>;
  };
  previousQuarter: {
    quarter: string;
    year: string;
    monthlyBreakdown: Array<{
      month: string;
      monthValue: string;
      records: number;
      transactionValue: number;
      netDepositBh: number;
    }>;
  };
}

interface BreadcrumbItem {
  label: string;
  path: string;
}

interface DailyBreakdown {
  date: string;
  totalRecords: number;
  recordTypeBreakdown: Record<string, number>;
  totalTransactionValue: number;
  netDeposits?: number;
  fileCount: number;
  filesProcessed: Array<{
    fileName: string;
    tableName: string;
    recordCount: number;
  }>;
  batchCount?: number;
  authorizationCount?: number;
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
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [showRecordTypes, setShowRecordTypes] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [chartType, setChartType] = useState<'line' | 'bar'>('bar');
  const [visibleSeries, setVisibleSeries] = useState({
    currentAuth: true,
    currentDeposit: true,
    previousAuth: true,
    previousDeposit: true
  });
  
  // Quarterly pagination state (20 rows per page for ~90 days of data)
  const [quarterlyPage, setQuarterlyPage] = useState(1);
  const quarterlyRowsPerPage = 20;
  
  // Filter state synced with URL
  const [filters, setFilters] = useState<{
    group?: string;
    association?: string;
    merchant?: string;
    merchantName?: string;
    terminal?: string;
  }>({});

  // Fetch merchant name for chart title when merchant filter is active
  const { data: merchantData } = useQuery<Array<{id: number; name: string; accountNumber: string; status: string}>>({
    queryKey: ['/api/merchants/for-filter'],
    enabled: !!filters.merchantName,
  });

  const selectedMerchantName = useMemo(() => {
    if (!filters.merchantName || !merchantData) return null;
    const merchant = merchantData.find(m => m.id.toString() === filters.merchantName);
    return merchant?.name || null;
  }, [filters.merchantName, merchantData]);

  // Initialize theme from user preference
  useEffect(() => {
    if (user?.themePreference) {
      setIsDarkMode(user.themePreference === 'dark');
    }
  }, [user]);
  
  // Parse URL query params for filters
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const newFilters: typeof filters = {};
    
    const group = searchParams.get('group');
    const association = searchParams.get('association');
    const merchant = searchParams.get('merchant');
    const merchantName = searchParams.get('merchantName');
    const terminal = searchParams.get('terminal');
    
    if (group) newFilters.group = group;
    if (association) newFilters.association = association;
    if (merchant) newFilters.merchant = merchant;
    if (merchantName) newFilters.merchantName = merchantName;
    if (terminal) newFilters.terminal = terminal;
    
    setFilters(newFilters);
  }, [location]);

  // Parse the URL path to determine what to display
  const parsedRoute: ParsedRoute = useMemo(() => {
    // Remove /history prefix and get the remaining path
    const pathWithoutPrefix = location.replace(/^\/history\/?/, '');
    
    if (!pathWithoutPrefix || pathWithoutPrefix === '') {
      return { viewType: 'landing' };
    }

    const pathParts = pathWithoutPrefix.split('/').filter(Boolean);
    
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
  }, [location]);

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
    queryKey: ['history-monthly', parsedRoute.year, parsedRoute.month, filters],
    queryFn: async (): Promise<MonthlyTotals> => {
      if (!parsedRoute.date) throw new Error('Invalid date');
      const params = new URLSearchParams({ month: format(parsedRoute.date, 'yyyy-MM') });
      if (filters.group) params.append('group', filters.group);
      if (filters.association) params.append('association', filters.association);
      if (filters.merchant) params.append('merchant', filters.merchant);
      if (filters.terminal) params.append('terminal', filters.terminal);
      
      const response = await fetch(`/api/tddf1/monthly-totals?${params}`, {
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
    queryKey: ['history-comparison', parsedRoute.year, parsedRoute.month, filters.merchant],
    queryFn: async (): Promise<MonthlyComparison> => {
      if (!parsedRoute.date) throw new Error('Invalid date');
      
      // Build query params with filters
      const params = new URLSearchParams({ month: format(parsedRoute.date, 'yyyy-MM') });
      if (filters.group) params.append('group', filters.group);
      if (filters.association) params.append('association', filters.association);
      if (filters.merchant) params.append('merchant', filters.merchant);
      if (filters.terminal) params.append('terminal', filters.terminal);
      
      const response = await fetch(`/api/tddf1/monthly-comparison?${params.toString()}`, {
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

  // Fetch quarterly data if we're in quarterly view
  const { data: quarterlyData, isLoading: quarterlyLoading, error: quarterlyError, refetch: refetchQuarterly } = useQuery({
    queryKey: ['history-quarterly', parsedRoute.year, parsedRoute.quarter, filters],
    queryFn: async (): Promise<QuarterlyTotals> => {
      if (!parsedRoute.year || !parsedRoute.quarter) throw new Error('Invalid quarter');
      const params = new URLSearchParams({ 
        year: parsedRoute.year.toString(), 
        quarter: parsedRoute.quarter.toString() 
      });
      if (filters.group) params.append('group', filters.group);
      if (filters.association) params.append('association', filters.association);
      if (filters.merchant) params.append('merchant', filters.merchant);
      if (filters.terminal) params.append('terminal', filters.terminal);
      
      const response = await fetch(`/api/tddf1/quarterly-totals?${params}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch quarterly data');
      return response.json();
    },
    enabled: parsedRoute.viewType === 'quarterly' && !!parsedRoute.year && !!parsedRoute.quarter
  });

  const { data: quarterlyComparisonData, isLoading: quarterlyComparisonLoading } = useQuery({
    queryKey: ['history-quarterly-comparison', parsedRoute.year, parsedRoute.quarter, filters.merchant],
    queryFn: async (): Promise<QuarterlyComparison> => {
      if (!parsedRoute.year || !parsedRoute.quarter) throw new Error('Invalid quarter');
      
      const params = new URLSearchParams({ 
        year: parsedRoute.year.toString(), 
        quarter: parsedRoute.quarter.toString() 
      });
      if (filters.group) params.append('group', filters.group);
      if (filters.association) params.append('association', filters.association);
      if (filters.merchant) params.append('merchant', filters.merchant);
      if (filters.terminal) params.append('terminal', filters.terminal);
      
      const response = await fetch(`/api/tddf1/quarterly-comparison?${params.toString()}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch quarterly comparison data');
      return response.json();
    },
    enabled: parsedRoute.viewType === 'quarterly' && !!parsedRoute.year && !!parsedRoute.quarter
  });

  // Fetch daily data if we're in daily view
  const dateString = parsedRoute.date ? format(parsedRoute.date, 'yyyy-MM-dd') : '';
  const { data: dailyData, isLoading: dailyLoading, refetch: refetchDaily } = useQuery<DailyBreakdown>({
    queryKey: ['history-daily', dateString],
    queryFn: async (): Promise<DailyBreakdown> => {
      const response = await fetch(`/api/tddf1/day-breakdown?date=${dateString}`, {
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch daily data');
      return response.json();
    },
    enabled: parsedRoute.viewType === 'daily' && !!parsedRoute.date && !!dateString
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

  // Helper to preserve query parameters when navigating
  const navigateWithFilters = useCallback((path: string) => {
    const searchParams = new URLSearchParams(window.location.search);
    const queryString = searchParams.toString();
    setLocation(queryString ? `${path}?${queryString}` : path);
  }, [setLocation]);

  const handlePreviousMonth = () => {
    if (!parsedRoute.date) return;
    const prevMonth = subMonths(parsedRoute.date, 1);
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthName = monthNames[prevMonth.getMonth()];
    navigateWithFilters(`/history/${prevMonth.getFullYear()}/${monthName}`);
  };

  const handleNextMonth = () => {
    if (!parsedRoute.date) return;
    const nextMonth = addMonths(parsedRoute.date, 1);
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthName = monthNames[nextMonth.getMonth()];
    navigateWithFilters(`/history/${nextMonth.getFullYear()}/${monthName}`);
  };

  const handlePreviousYear = () => {
    if (!parsedRoute.year || !parsedRoute.quarter) return;
    const prevYear = parsedRoute.year - 1;
    navigateWithFilters(`/history/${prevYear}/Q${parsedRoute.quarter}`);
  };

  const handleNextYear = () => {
    if (!parsedRoute.year || !parsedRoute.quarter) return;
    const nextYear = parsedRoute.year + 1;
    navigateWithFilters(`/history/${nextYear}/Q${parsedRoute.quarter}`);
  };

  const handleBackToDashboard = () => {
    setLocation('/dashboard');
  };
  
  const handleFilterChange = useCallback((newFilters: typeof filters) => {
    setFilters(newFilters);
    
    // Update URL with filter params
    const searchParams = new URLSearchParams();
    if (newFilters.group) searchParams.set('group', newFilters.group);
    if (newFilters.association) searchParams.set('association', newFilters.association);
    if (newFilters.merchant) searchParams.set('merchant', newFilters.merchant);
    if (newFilters.merchantName) searchParams.set('merchantName', newFilters.merchantName);
    if (newFilters.terminal) searchParams.set('terminal', newFilters.terminal);
    
    const queryString = searchParams.toString();
    const newUrl = queryString ? `${location.split('?')[0]}?${queryString}` : location.split('?')[0];
    window.history.replaceState({}, '', newUrl);
  }, [location]);
  
  const handleMonthPickerSelect = (year: number, month: number) => {
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthName = monthNames[month - 1];
    setLocation(`/history/${year}/${monthName}`);
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

  const toggleSeries = (series: keyof typeof visibleSeries) => {
    setVisibleSeries(prev => ({
      ...prev,
      [series]: !prev[series]
    }));
  };

  // Navigation helpers for daily view
  const handlePreviousDay = () => {
    if (!parsedRoute.date) return;
    const prevDay = subDays(parsedRoute.date, 1);
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthName = monthNames[prevDay.getMonth()];
    setLocation(`/history/${prevDay.getFullYear()}/${monthName}/${prevDay.getDate()}`);
  };

  const handleNextDay = () => {
    if (!parsedRoute.date) return;
    const nextDay = addDays(parsedRoute.date, 1);
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const monthName = monthNames[nextDay.getMonth()];
    setLocation(`/history/${nextDay.getFullYear()}/${monthName}/${nextDay.getDate()}`);
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!comparisonData) return [];
    
    // For bar charts, always show all 31 days. For line charts, use max of actual data
    const maxDays = chartType === 'bar' ? 31 : Math.max(
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
  }, [comparisonData, chartType]);

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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {(() => {
                const now = new Date();
                const yesterday = subDays(now, 1);
                const thisMonth = now;
                const lastMonth = subMonths(now, 1);
                const currentYear = now.getFullYear();
                
                const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
                
                const quickLinks = [
                  {
                    label: 'Today',
                    path: `/history/${now.getFullYear()}/${monthNames[now.getMonth()]}/${now.getDate()}`,
                    testId: 'link-today'
                  },
                  {
                    label: 'Yesterday',
                    path: `/history/${yesterday.getFullYear()}/${monthNames[yesterday.getMonth()]}/${yesterday.getDate()}`,
                    testId: 'link-yesterday'
                  },
                  {
                    label: 'This Month',
                    path: `/history/${thisMonth.getFullYear()}/${monthNames[thisMonth.getMonth()]}`,
                    testId: 'link-this-month'
                  },
                  {
                    label: 'Last Month',
                    path: `/history/${lastMonth.getFullYear()}/${monthNames[lastMonth.getMonth()]}`,
                    testId: 'link-last-month'
                  },
                  {
                    label: 'Q1',
                    path: `/history/${currentYear}/Q1`,
                    testId: 'link-q1'
                  },
                  {
                    label: 'Q2',
                    path: `/history/${currentYear}/Q2`,
                    testId: 'link-q2'
                  },
                  {
                    label: 'Q3',
                    path: `/history/${currentYear}/Q3`,
                    testId: 'link-q3'
                  },
                  {
                    label: 'Q4',
                    path: `/history/${currentYear}/Q4`,
                    testId: 'link-q4'
                  }
                ];
                
                return quickLinks.map((link) => (
                  <Button
                    key={link.testId}
                    variant="outline"
                    onClick={() => navigateWithFilters(link.path)}
                    className="w-full"
                    data-testid={link.testId}
                  >
                    {link.label}
                  </Button>
                ));
              })()}
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

    const metricsConfig = [
      {
        title: 'Transaction Authorizations',
        value: formatCurrency(monthlyData.totalTransactionValue),
        subtitle: 'DT record totals',
        icon: DollarSign,
        gradient: isDarkMode ? 'bg-gradient-to-br from-purple-900 to-purple-800 border-purple-700' : 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200',
        titleColor: isDarkMode ? 'text-purple-100' : 'text-purple-700',
        valueColor: isDarkMode ? 'text-white' : 'text-purple-900',
        subtitleColor: isDarkMode ? 'text-purple-200' : 'text-purple-600',
        iconColor: isDarkMode ? 'text-purple-300' : 'text-purple-600',
        valueFontSize: 'text-xl sm:text-2xl',
        testId: 'metric-transaction-auth'
      },
      {
        title: 'Net Deposits',
        value: formatCurrency(monthlyData.totalNetDepositBh),
        subtitle: 'BH batch totals',
        icon: DollarSign,
        gradient: isDarkMode ? 'bg-gradient-to-br from-orange-900 to-orange-800 border-orange-700' : 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200',
        titleColor: isDarkMode ? 'text-orange-100' : 'text-orange-700',
        valueColor: isDarkMode ? 'text-white' : 'text-orange-900',
        subtitleColor: isDarkMode ? 'text-orange-200' : 'text-orange-600',
        iconColor: isDarkMode ? 'text-orange-300' : 'text-orange-600',
        valueFontSize: 'text-xl sm:text-2xl',
        testId: 'metric-net-deposits'
      },
      {
        title: 'Total Files',
        value: formatNumber(monthlyData.totalFiles),
        subtitle: 'TDDF files processed',
        icon: FileText,
        gradient: isDarkMode ? 'bg-gradient-to-br from-blue-900 to-blue-800 border-blue-700' : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200',
        titleColor: isDarkMode ? 'text-blue-100' : 'text-blue-700',
        valueColor: isDarkMode ? 'text-white' : 'text-blue-900',
        subtitleColor: isDarkMode ? 'text-blue-200' : 'text-blue-600',
        iconColor: isDarkMode ? 'text-blue-300' : 'text-blue-600',
        valueFontSize: 'text-2xl sm:text-3xl',
        testId: 'metric-total-files'
      },
      {
        title: 'Total Records',
        value: formatNumber(monthlyData.totalRecords),
        subtitle: 'All record types',
        icon: TrendingUp,
        gradient: isDarkMode ? 'bg-gradient-to-br from-green-900 to-green-800 border-green-700' : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200',
        titleColor: isDarkMode ? 'text-green-100' : 'text-green-700',
        valueColor: isDarkMode ? 'text-white' : 'text-green-900',
        subtitleColor: isDarkMode ? 'text-green-200' : 'text-green-600',
        iconColor: isDarkMode ? 'text-green-300' : 'text-green-600',
        valueFontSize: 'text-2xl sm:text-3xl',
        testId: 'metric-total-records'
      }
    ];

    return (
      <div className="space-y-6">
        {/* Filter Bar */}
        {parsedRoute.date && (
          <FilterBar
            month={format(parsedRoute.date, 'yyyy-MM')}
            filters={filters}
            onFilterChange={handleFilterChange}
            isDarkMode={isDarkMode}
          />
        )}
        
        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {metricsConfig.map((metric) => {
            const IconComponent = metric.icon;
            return (
              <Card key={metric.testId} className={metric.gradient}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className={`text-sm font-medium ${metric.titleColor}`}>
                    {metric.title}
                  </CardTitle>
                  <IconComponent className={`h-4 w-4 ${metric.iconColor}`} />
                </CardHeader>
                <CardContent>
                  <div className={`${metric.valueFontSize} font-bold ${metric.valueColor}`}>
                    {metric.value}
                  </div>
                  <p className={`text-xs ${metric.subtitleColor} mt-1`}>
                    {metric.subtitle}
                  </p>
                </CardContent>
              </Card>
            );
          })}
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
        {comparisonData && !comparisonLoading && monthlyData && monthlyData.totalRecords > 0 && (
          <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between mb-4">
                <CardTitle className={isDarkMode ? 'text-white' : ''}>
                  Monthly Financial Trends Comparison
                  {selectedMerchantName && ` - ${selectedMerchantName}`}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={chartType === 'line' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartType('line')}
                    data-testid="button-line-chart"
                    className="flex items-center gap-1"
                  >
                    <Activity className="h-4 w-4" />
                    Line
                  </Button>
                  <Button
                    variant={chartType === 'bar' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartType('bar')}
                    data-testid="button-bar-chart"
                    className="flex items-center gap-1"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Bar
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="current-auth" 
                    checked={visibleSeries.currentAuth}
                    onCheckedChange={() => toggleSeries('currentAuth')}
                    data-testid="checkbox-current-auth"
                  />
                  <label 
                    htmlFor="current-auth" 
                    className={`text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <span className="inline-block w-3 h-3 mr-1 rounded" style={{backgroundColor: '#8b5cf6'}}></span>
                    {comparisonData.currentMonth.month} Authorizations
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="current-deposit" 
                    checked={visibleSeries.currentDeposit}
                    onCheckedChange={() => toggleSeries('currentDeposit')}
                    data-testid="checkbox-current-deposit"
                  />
                  <label 
                    htmlFor="current-deposit" 
                    className={`text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <span className="inline-block w-3 h-3 mr-1 rounded" style={{backgroundColor: '#06b6d4'}}></span>
                    {comparisonData.currentMonth.month} Net Deposit
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="previous-auth" 
                    checked={visibleSeries.previousAuth}
                    onCheckedChange={() => toggleSeries('previousAuth')}
                    data-testid="checkbox-previous-auth"
                  />
                  <label 
                    htmlFor="previous-auth" 
                    className={`text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <span className="inline-block w-3 h-3 mr-1 rounded" style={{backgroundColor: '#a78bfa'}}></span>
                    {comparisonData.previousMonth.month} Authorizations
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="previous-deposit" 
                    checked={visibleSeries.previousDeposit}
                    onCheckedChange={() => toggleSeries('previousDeposit')}
                    data-testid="checkbox-previous-deposit"
                  />
                  <label 
                    htmlFor="previous-deposit" 
                    className={`text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <span className="inline-block w-3 h-3 mr-1 rounded" style={{backgroundColor: '#22d3ee'}}></span>
                    {comparisonData.previousMonth.month} Net Deposit
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                {chartType === 'line' ? (
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
                    {visibleSeries.currentAuth && (
                      <Line 
                        type="monotone" 
                        dataKey="currentAuth" 
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        name={`${comparisonData.currentMonth.month} Authorizations`}
                        dot={false}
                      />
                    )}
                    {visibleSeries.currentDeposit && (
                      <Line 
                        type="monotone" 
                        dataKey="currentDeposit" 
                        stroke="#06b6d4" 
                        strokeWidth={2}
                        name={`${comparisonData.currentMonth.month} Net Deposit`}
                        dot={false}
                      />
                    )}
                    {visibleSeries.previousAuth && (
                      <Line 
                        type="monotone" 
                        dataKey="previousAuth" 
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name={`${comparisonData.previousMonth.month} Authorizations`}
                        dot={false}
                      />
                    )}
                    {visibleSeries.previousDeposit && (
                      <Line 
                        type="monotone" 
                        dataKey="previousDeposit" 
                        stroke="#06b6d4" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name={`${comparisonData.previousMonth.month} Net Deposit`}
                        dot={false}
                      />
                    )}
                  </RechartsLineChart>
                ) : (
                  <RechartsBarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                    <XAxis 
                      dataKey="day" 
                      label={{ value: 'Day of Month', position: 'insideBottom', offset: -5 }}
                      stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
                    />
                    <YAxis 
                      domain={[0, 'auto']}
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
                    {visibleSeries.currentAuth && (
                      <Bar 
                        dataKey="currentAuth" 
                        fill="#8b5cf6" 
                        name={`${comparisonData.currentMonth.month} Authorizations`}
                        maxBarSize={20}
                      />
                    )}
                    {visibleSeries.currentDeposit && (
                      <Bar 
                        dataKey="currentDeposit" 
                        fill="#06b6d4" 
                        name={`${comparisonData.currentMonth.month} Net Deposit`}
                        maxBarSize={20}
                      />
                    )}
                    {visibleSeries.previousAuth && (
                      <Bar 
                        dataKey="previousAuth" 
                        fill="#a78bfa" 
                        name={`${comparisonData.previousMonth.month} Authorizations`}
                        maxBarSize={20}
                      />
                    )}
                    {visibleSeries.previousDeposit && (
                      <Bar 
                        dataKey="previousDeposit" 
                        fill="#22d3ee" 
                        name={`${comparisonData.previousMonth.month} Net Deposit`}
                        maxBarSize={20}
                      />
                    )}
                  </RechartsBarChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* No Data Message when merchant filter is active but has no data */}
        {filters.merchantName && monthlyData && monthlyData.totalRecords === 0 && (
          <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardContent className="py-12">
              <div className="text-center">
                <Database className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  No Data Available
                </h3>
                <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedMerchantName || 'This merchant'} has no transaction data for {parsedRoute.monthName} {parsedRoute.year}.
                </p>
              </div>
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
                  {monthlyData.dailyBreakdown.map((day) => {
                    const shouldHighlight = day.files > 2;
                    return (
                      <tr 
                        key={day.date} 
                        className={clsx(
                          'border-b cursor-pointer',
                          shouldHighlight 
                            ? isDarkMode 
                              ? 'bg-amber-900/40 hover:bg-amber-900/60 border-amber-800' 
                              : 'bg-amber-50 hover:bg-amber-100 border-amber-200'
                            : isDarkMode 
                              ? 'border-gray-700 hover:bg-gray-700' 
                              : 'border-gray-100 hover:bg-gray-50'
                        )}
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderQuarterlyView = () => {
    if (quarterlyLoading) {
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

    if (quarterlyError || !quarterlyData) {
      return (
        <Card className={`${isDarkMode ? 'bg-red-900/20 border-red-700' : 'bg-red-50 border-red-200'} p-8`}>
          <div className="flex flex-col items-center justify-center text-center space-y-4">
            <div className={`text-6xl ${isDarkMode ? 'text-red-400' : 'text-red-500'}`}>⚠️</div>
            <h3 className={`text-xl font-semibold ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>
              Failed to Load Data
            </h3>
            <p className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-600'} max-w-md`}>
              {quarterlyError instanceof Error ? quarterlyError.message : 'An unexpected error occurred.'}
            </p>
            <Button
              onClick={() => refetchQuarterly()}
              className={`${isDarkMode ? 'bg-red-700 hover:bg-red-600' : 'bg-red-600 hover:bg-red-700'} text-white`}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </Card>
      );
    }

    const metricsConfig = [
      {
        title: 'Transaction Authorizations',
        value: formatCurrency(quarterlyData.totalTransactionValue),
        subtitle: 'DT record totals',
        icon: DollarSign,
        gradient: isDarkMode ? 'bg-gradient-to-br from-purple-900 to-purple-800 border-purple-700' : 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200',
        titleColor: isDarkMode ? 'text-purple-100' : 'text-purple-700',
        valueColor: isDarkMode ? 'text-white' : 'text-purple-900',
        subtitleColor: isDarkMode ? 'text-purple-200' : 'text-purple-600',
        iconColor: isDarkMode ? 'text-purple-300' : 'text-purple-600',
        valueFontSize: 'text-xl sm:text-2xl',
        testId: 'metric-transaction-auth'
      },
      {
        title: 'Net Deposits',
        value: formatCurrency(quarterlyData.totalNetDepositBh),
        subtitle: 'BH batch totals',
        icon: DollarSign,
        gradient: isDarkMode ? 'bg-gradient-to-br from-orange-900 to-orange-800 border-orange-700' : 'bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200',
        titleColor: isDarkMode ? 'text-orange-100' : 'text-orange-700',
        valueColor: isDarkMode ? 'text-white' : 'text-orange-900',
        subtitleColor: isDarkMode ? 'text-orange-200' : 'text-orange-600',
        iconColor: isDarkMode ? 'text-orange-300' : 'text-orange-600',
        valueFontSize: 'text-xl sm:text-2xl',
        testId: 'metric-net-deposits'
      },
      {
        title: 'Total Files',
        value: formatNumber(quarterlyData.totalFiles),
        subtitle: 'TDDF files processed',
        icon: FileText,
        gradient: isDarkMode ? 'bg-gradient-to-br from-blue-900 to-blue-800 border-blue-700' : 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200',
        titleColor: isDarkMode ? 'text-blue-100' : 'text-blue-700',
        valueColor: isDarkMode ? 'text-white' : 'text-blue-900',
        subtitleColor: isDarkMode ? 'text-blue-200' : 'text-blue-600',
        iconColor: isDarkMode ? 'text-blue-300' : 'text-blue-600',
        valueFontSize: 'text-2xl sm:text-3xl',
        testId: 'metric-total-files'
      },
      {
        title: 'Total Records',
        value: formatNumber(quarterlyData.totalRecords),
        subtitle: 'All record types',
        icon: TrendingUp,
        gradient: isDarkMode ? 'bg-gradient-to-br from-green-900 to-green-800 border-green-700' : 'bg-gradient-to-br from-green-50 to-green-100 border-green-200',
        titleColor: isDarkMode ? 'text-green-100' : 'text-green-700',
        valueColor: isDarkMode ? 'text-white' : 'text-green-900',
        subtitleColor: isDarkMode ? 'text-green-200' : 'text-green-600',
        iconColor: isDarkMode ? 'text-green-300' : 'text-green-600',
        valueFontSize: 'text-2xl sm:text-3xl',
        testId: 'metric-total-records'
      }
    ];

    // Calculate pagination for daily breakdown
    const totalPages = Math.ceil((quarterlyData.dailyBreakdown?.length || 0) / quarterlyRowsPerPage);
    const paginatedDailyData = quarterlyData.dailyBreakdown.slice(
      (quarterlyPage - 1) * quarterlyRowsPerPage,
      quarterlyPage * quarterlyRowsPerPage
    );

    return (
      <div className="space-y-6">
        {/* Filter Bar */}
        {quarterlyData.months[0] && (
          <FilterBar
            month={quarterlyData.months[0]}
            filters={filters}
            onFilterChange={handleFilterChange}
            isDarkMode={isDarkMode}
          />
        )}
        
        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {metricsConfig.map((metric) => {
            const IconComponent = metric.icon;
            return (
              <Card key={metric.testId} className={metric.gradient}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className={`text-sm font-medium ${metric.titleColor}`}>
                    {metric.title}
                  </CardTitle>
                  <IconComponent className={`h-4 w-4 ${metric.iconColor}`} />
                </CardHeader>
                <CardContent>
                  <div className={`${metric.valueFontSize} font-bold ${metric.valueColor}`}>
                    {metric.value}
                  </div>
                  <p className={`text-xs ${metric.subtitleColor} mt-1`}>
                    {metric.subtitle}
                  </p>
                </CardContent>
              </Card>
            );
          })}
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
                {Object.entries(quarterlyData.recordTypeBreakdown).map(([type, count]) => (
                  <div key={type} className={`text-center p-3 rounded-lg ${isDarkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                    <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{type}</div>
                    <div className={`text-xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatNumber(count)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Quarterly Comparison Chart */}
        {quarterlyComparisonData && !quarterlyComparisonLoading && quarterlyData && quarterlyData.totalRecords > 0 && (
          <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardHeader>
              <div className="flex items-center justify-between mb-4">
                <CardTitle className={isDarkMode ? 'text-white' : ''}>
                  Quarterly Financial Trends Comparison
                  {selectedMerchantName && ` - ${selectedMerchantName}`}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={chartType === 'line' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartType('line')}
                    data-testid="button-line-chart"
                    className="flex items-center gap-1"
                  >
                    <Activity className="h-4 w-4" />
                    Line
                  </Button>
                  <Button
                    variant={chartType === 'bar' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setChartType('bar')}
                    data-testid="button-bar-chart"
                    className="flex items-center gap-1"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Bar
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="current-auth" 
                    checked={visibleSeries.currentAuth}
                    onCheckedChange={() => toggleSeries('currentAuth')}
                    data-testid="checkbox-current-auth"
                  />
                  <label 
                    htmlFor="current-auth" 
                    className={`text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <span className="inline-block w-3 h-3 mr-1 rounded" style={{backgroundColor: '#8b5cf6'}}></span>
                    {quarterlyComparisonData.currentQuarter.quarter} {quarterlyComparisonData.currentQuarter.year} Authorizations
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="current-deposit" 
                    checked={visibleSeries.currentDeposit}
                    onCheckedChange={() => toggleSeries('currentDeposit')}
                    data-testid="checkbox-current-deposit"
                  />
                  <label 
                    htmlFor="current-deposit" 
                    className={`text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <span className="inline-block w-3 h-3 mr-1 rounded" style={{backgroundColor: '#06b6d4'}}></span>
                    {quarterlyComparisonData.currentQuarter.quarter} {quarterlyComparisonData.currentQuarter.year} Net Deposit
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="previous-auth" 
                    checked={visibleSeries.previousAuth}
                    onCheckedChange={() => toggleSeries('previousAuth')}
                    data-testid="checkbox-previous-auth"
                  />
                  <label 
                    htmlFor="previous-auth" 
                    className={`text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <span className="inline-block w-3 h-3 mr-1 rounded" style={{backgroundColor: '#a78bfa'}}></span>
                    {quarterlyComparisonData.previousQuarter.quarter} {quarterlyComparisonData.previousQuarter.year} Authorizations
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="previous-deposit" 
                    checked={visibleSeries.previousDeposit}
                    onCheckedChange={() => toggleSeries('previousDeposit')}
                    data-testid="checkbox-previous-deposit"
                  />
                  <label 
                    htmlFor="previous-deposit" 
                    className={`text-sm font-medium cursor-pointer ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    <span className="inline-block w-3 h-3 mr-1 rounded" style={{backgroundColor: '#22d3ee'}}></span>
                    {quarterlyComparisonData.previousQuarter.quarter} {quarterlyComparisonData.previousQuarter.year} Net Deposit
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                {chartType === 'line' ? (
                  <RechartsLineChart 
                    data={[
                      ...quarterlyComparisonData.currentQuarter.monthlyBreakdown.map((m, i) => ({
                        month: m.month,
                        currentAuth: m.transactionValue,
                        currentDeposit: m.netDepositBh,
                        previousAuth: quarterlyComparisonData.previousQuarter.monthlyBreakdown[i]?.transactionValue || 0,
                        previousDeposit: quarterlyComparisonData.previousQuarter.monthlyBreakdown[i]?.netDepositBh || 0
                      }))
                    ]}
                    margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                    <XAxis 
                      dataKey="month" 
                      label={{ value: 'Month', position: 'insideBottom', offset: -10 }}
                      stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
                    />
                    <YAxis 
                      domain={[0, 'auto']}
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
                    {visibleSeries.currentAuth && (
                      <Line 
                        type="monotone" 
                        dataKey="currentAuth" 
                        stroke="#8b5cf6" 
                        strokeWidth={2}
                        name={`${quarterlyComparisonData.currentQuarter.quarter} ${quarterlyComparisonData.currentQuarter.year} Authorizations`}
                      />
                    )}
                    {visibleSeries.currentDeposit && (
                      <Line 
                        type="monotone" 
                        dataKey="currentDeposit" 
                        stroke="#06b6d4" 
                        strokeWidth={2}
                        name={`${quarterlyComparisonData.currentQuarter.quarter} ${quarterlyComparisonData.currentQuarter.year} Net Deposit`}
                      />
                    )}
                    {visibleSeries.previousAuth && (
                      <Line 
                        type="monotone" 
                        dataKey="previousAuth" 
                        stroke="#a78bfa" 
                        strokeWidth={2}
                        name={`${quarterlyComparisonData.previousQuarter.quarter} ${quarterlyComparisonData.previousQuarter.year} Authorizations`}
                      />
                    )}
                    {visibleSeries.previousDeposit && (
                      <Line 
                        type="monotone" 
                        dataKey="previousDeposit" 
                        stroke="#22d3ee" 
                        strokeWidth={2}
                        name={`${quarterlyComparisonData.previousQuarter.quarter} ${quarterlyComparisonData.previousQuarter.year} Net Deposit`}
                      />
                    )}
                  </RechartsLineChart>
                ) : (
                  <RechartsBarChart 
                    data={[
                      ...quarterlyComparisonData.currentQuarter.monthlyBreakdown.map((m, i) => ({
                        month: m.month,
                        currentAuth: m.transactionValue,
                        currentDeposit: m.netDepositBh,
                        previousAuth: quarterlyComparisonData.previousQuarter.monthlyBreakdown[i]?.transactionValue || 0,
                        previousDeposit: quarterlyComparisonData.previousQuarter.monthlyBreakdown[i]?.netDepositBh || 0
                      }))
                    ]}
                    margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                    <XAxis 
                      dataKey="month" 
                      label={{ value: 'Month', position: 'insideBottom', offset: -10 }}
                      stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
                    />
                    <YAxis 
                      domain={[0, 'auto']}
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
                    {visibleSeries.currentAuth && (
                      <Bar 
                        dataKey="currentAuth" 
                        fill="#8b5cf6" 
                        name={`${quarterlyComparisonData.currentQuarter.quarter} ${quarterlyComparisonData.currentQuarter.year} Authorizations`}
                        maxBarSize={20}
                      />
                    )}
                    {visibleSeries.currentDeposit && (
                      <Bar 
                        dataKey="currentDeposit" 
                        fill="#06b6d4" 
                        name={`${quarterlyComparisonData.currentQuarter.quarter} ${quarterlyComparisonData.currentQuarter.year} Net Deposit`}
                        maxBarSize={20}
                      />
                    )}
                    {visibleSeries.previousAuth && (
                      <Bar 
                        dataKey="previousAuth" 
                        fill="#a78bfa" 
                        name={`${quarterlyComparisonData.previousQuarter.quarter} ${quarterlyComparisonData.previousQuarter.year} Authorizations`}
                        maxBarSize={20}
                      />
                    )}
                    {visibleSeries.previousDeposit && (
                      <Bar 
                        dataKey="previousDeposit" 
                        fill="#22d3ee" 
                        name={`${quarterlyComparisonData.previousQuarter.quarter} ${quarterlyComparisonData.previousQuarter.year} Net Deposit`}
                        maxBarSize={20}
                      />
                    )}
                  </RechartsBarChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* No Data Message when merchant filter is active but has no data */}
        {filters.merchantName && quarterlyData && quarterlyData.totalRecords === 0 && (
          <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
            <CardContent className="py-12">
              <div className="text-center">
                <Database className={`mx-auto h-12 w-12 mb-4 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`} />
                <h3 className={`text-lg font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  No Data Available
                </h3>
                <p className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {selectedMerchantName || 'This merchant'} has no transaction data for Q{parsedRoute.quarter} {parsedRoute.year}.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily Breakdown Table with Pagination */}
        <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className={isDarkMode ? 'text-white' : ''}>Daily Breakdown</CardTitle>
              <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                Showing {((quarterlyPage - 1) * quarterlyRowsPerPage) + 1}-{Math.min(quarterlyPage * quarterlyRowsPerPage, quarterlyData.dailyBreakdown.length)} of {quarterlyData.dailyBreakdown.length} days
              </div>
            </div>
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
                  {paginatedDailyData.map((day) => {
                    const shouldHighlight = day.files > 2;
                    return (
                      <tr 
                        key={day.date} 
                        className={clsx(
                          'border-b cursor-pointer',
                          shouldHighlight 
                            ? isDarkMode 
                              ? 'bg-amber-900/40 hover:bg-amber-900/60 border-amber-800' 
                              : 'bg-amber-50 hover:bg-amber-100 border-amber-200'
                            : isDarkMode 
                              ? 'border-gray-700 hover:bg-gray-700' 
                              : 'border-gray-100 hover:bg-gray-50'
                        )}
                        onClick={() => {
                          const date = new Date(day.date);
                          const dayNum = date.getDate();
                          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
                          const monthIdx = date.getMonth();
                          setLocation(`/history/${parsedRoute.year}/${monthNames[monthIdx]}/${dayNum}`);
                        }}
                        data-testid={`row-day-${day.date}`}
                      >
                        <td className={`p-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{format(new Date(day.date), 'MMM dd, yyyy')}</td>
                        <td className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{day.files}</td>
                        <td className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{formatNumber(day.records)}</td>
                        <td className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{formatCurrency(day.transactionValue)}</td>
                        <td className={`text-right p-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{formatCurrency(day.netDepositBh)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuarterlyPage(p => Math.max(1, p - 1))}
                  disabled={quarterlyPage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Page {quarterlyPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuarterlyPage(p => Math.min(totalPages, p + 1))}
                  disabled={quarterlyPage === totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderDailyView = () => {
    if (!parsedRoute.date) return null;

    // Record type configuration for visualization
    const recordTypeConfig: Record<string, { label: string; color: string; bgColor: string; textColor: string; description: string }> = {
      BH: { label: 'BH', color: 'bg-blue-500', bgColor: 'bg-blue-50 dark:bg-blue-900/20', textColor: 'text-blue-700 dark:text-blue-300', description: 'Batch Headers' },
      DT: { label: 'DT', color: 'bg-green-500', bgColor: 'bg-green-50 dark:bg-green-900/20', textColor: 'text-green-700 dark:text-green-300', description: 'Detail Transactions' },
      G2: { label: 'G2', color: 'bg-purple-500', bgColor: 'bg-purple-50 dark:bg-purple-900/20', textColor: 'text-purple-700 dark:text-purple-300', description: 'Gateway Records' },
      E1: { label: 'E1', color: 'bg-yellow-500', bgColor: 'bg-yellow-50 dark:bg-yellow-900/20', textColor: 'text-yellow-700 dark:text-yellow-300', description: 'Extension Records' },
      P1: { label: 'P1', color: 'bg-pink-500', bgColor: 'bg-pink-50 dark:bg-pink-900/20', textColor: 'text-pink-700 dark:text-pink-300', description: 'Purchasing 1' },
      P2: { label: 'P2', color: 'bg-orange-500', bgColor: 'bg-orange-50 dark:bg-orange-900/20', textColor: 'text-orange-700 dark:text-orange-300', description: 'Purchasing 2' },
      DR: { label: 'DR', color: 'bg-red-500', bgColor: 'bg-red-50 dark:bg-red-900/20', textColor: 'text-red-700 dark:text-red-300', description: 'Disputes/Rejects' },
      AD: { label: 'AD', color: 'bg-gray-500', bgColor: 'bg-gray-50 dark:bg-gray-900/20', textColor: 'text-gray-700 dark:text-gray-300', description: 'Additional Data' }
    };

    return (
      <div className="space-y-4">
        {/* Date Selector Header */}
        <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className={isDarkMode ? 'text-white' : ''}>
                    {format(parsedRoute.date, 'EEEE, MMMM dd, yyyy')}
                  </CardTitle>
                  <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {dailyData ? `${dailyData.totalRecords.toLocaleString()} records • ${dailyData.fileCount} files` : 'Loading...'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousDay}
                    data-testid="button-prev-day"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextDay}
                    data-testid="button-next-day"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className={clsx('grid w-full grid-cols-3', isDarkMode ? 'bg-gray-800' : '')}>
            <TabsTrigger value="overview" data-testid="tab-daily-overview">
              <BarChart3 className="h-4 w-4 mr-2" />
              Daily Overview
            </TabsTrigger>
            <TabsTrigger value="table" data-testid="tab-table-view">
              <TableIcon className="h-4 w-4 mr-2" />
              Table View
            </TabsTrigger>
            <TabsTrigger value="merchants" data-testid="tab-merchant-volume">
              <Building2 className="h-4 w-4 mr-2" />
              Merchant Volume
            </TabsTrigger>
          </TabsList>

          {/* Daily Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            {/* Metrics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Total Files
                  </CardTitle>
                  <FileText className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {dailyLoading ? '...' : dailyData?.fileCount.toLocaleString() || '0'}
                  </div>
                </CardContent>
              </Card>

              <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Total Records
                  </CardTitle>
                  <Activity className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {dailyLoading ? '...' : dailyData?.totalRecords.toLocaleString() || '0'}
                  </div>
                </CardContent>
              </Card>

              <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Authorizations
                  </CardTitle>
                  <TrendingUp className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {dailyLoading ? '...' : formatCurrency(dailyData?.totalTransactionValue || 0)}
                  </div>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>DT Transaction Amounts</p>
                </CardContent>
              </Card>

              <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Net Deposits
                  </CardTitle>
                  <DollarSign className={`h-4 w-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {dailyLoading ? '...' : formatCurrency(dailyData?.netDeposits || 0)}
                  </div>
                  <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>BH Net Deposits</p>
                </CardContent>
              </Card>
            </div>

            {/* Record Type Breakdown */}
            <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
              <CardHeader>
                <CardTitle className={isDarkMode ? 'text-white' : ''}>Record Type Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                {dailyLoading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : dailyData?.recordTypeBreakdown && Object.keys(dailyData.recordTypeBreakdown).length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {Object.entries(dailyData.recordTypeBreakdown)
                      .filter(([_, count]) => count > 0)
                      .map(([type, count]) => {
                        const config = recordTypeConfig[type] || {
                          label: type,
                          bgColor: 'bg-gray-50',
                          textColor: 'text-gray-700',
                          description: type
                        };

                        return (
                          <div
                            key={type}
                            className={`text-center rounded-lg p-4 border ${config.bgColor}`}
                          >
                            <div className={`text-2xl font-bold ${config.textColor}`}>
                              {count.toLocaleString()}
                            </div>
                            <div className={`text-sm font-bold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                              {config.label}
                            </div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                              {config.description}
                            </div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {((count / (dailyData.totalRecords || 1)) * 100).toFixed(1)}%
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <div className={`text-center py-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No record type data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Table View Tab */}
          <TabsContent value="table" className="space-y-4">
            <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
              <CardHeader>
                <CardTitle className={isDarkMode ? 'text-white' : ''}>
                  Files Processed - {format(parsedRoute.date, 'MMM d, yyyy')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyLoading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : dailyData?.filesProcessed && dailyData.filesProcessed.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className={isDarkMode ? 'border-gray-700' : 'border-gray-200'}>
                          <TableHead className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>File Name</TableHead>
                          <TableHead className={`text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Record Count</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailyData.filesProcessed.map((file, idx) => (
                          <TableRow 
                            key={idx}
                            className={isDarkMode ? 'border-gray-700' : 'border-gray-200'}
                          >
                            <TableCell className={isDarkMode ? 'text-white' : 'text-gray-900'}>{file.fileName}</TableCell>
                            <TableCell className={`text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {file.recordCount.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    No files processed on this date
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Record Type Table */}
            {dailyData?.recordTypeBreakdown && Object.keys(dailyData.recordTypeBreakdown).length > 0 && (
              <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
                <CardHeader>
                  <CardTitle className={isDarkMode ? 'text-white' : ''}>Record Type Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className={isDarkMode ? 'border-gray-700' : 'border-gray-200'}>
                          <TableHead className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>Record Type</TableHead>
                          <TableHead className={`text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Count</TableHead>
                          <TableHead className={`text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Percentage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(dailyData.recordTypeBreakdown)
                          .filter(([_, count]) => (count as number) > 0)
                          .sort(([_, a], [__, b]) => (b as number) - (a as number))
                          .map(([type, count]) => {
                            const config = recordTypeConfig[type];
                            const countNum = count as number;
                            return (
                              <TableRow 
                                key={type}
                                className={isDarkMode ? 'border-gray-700' : 'border-gray-200'}
                              >
                                <TableCell className={isDarkMode ? 'text-white' : 'text-gray-900'}>
                                  <span className={config ? config.textColor : ''}>
                                    {config?.label || type} - {config?.description || type}
                                  </span>
                                </TableCell>
                                <TableCell className={`text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {countNum.toLocaleString()}
                                </TableCell>
                                <TableCell className={`text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                  {((countNum / (dailyData.totalRecords || 1)) * 100).toFixed(2)}%
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Merchant Volume Tab */}
          <TabsContent value="merchants" className="space-y-4">
            <Tddf1MerchantVolumeTab selectedDate={parsedRoute.date} isDarkMode={isDarkMode} />
          </TabsContent>
        </Tabs>

        {/* Toolbox */}
        <Card className={isDarkMode ? 'bg-gray-800 border-gray-700' : ''}>
          <CardHeader>
            <CardTitle className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Toolbox</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchDaily()}
                disabled={dailyLoading}
                data-testid="button-refresh-daily"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${dailyLoading ? 'animate-spin' : ''}`} />
                Refresh Data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-gray-900' : 'bg-gray-50'} transition-colors`}>
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header with Breadcrumbs and Actions */}
        <div className="mb-6">
          {renderBreadcrumbs()}
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4 w-full sm:w-auto">
              <h1 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {parsedRoute.viewType === 'landing' && 'History'}
                {parsedRoute.viewType === 'monthly' && parsedRoute.date && format(parsedRoute.date, 'MMMM yyyy')}
                {parsedRoute.viewType === 'quarterly' && `Q${parsedRoute.quarter} ${parsedRoute.year}`}
                {parsedRoute.viewType === 'daily' && parsedRoute.date && format(parsedRoute.date, 'MMMM dd, yyyy')}
              </h1>
              
              {parsedRoute.viewType === 'quarterly' && parsedRoute.year && (
                <div className="flex gap-2">
                  {/* Year Navigation */}
                  <div className="flex gap-1 border-r pr-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePreviousYear}
                      data-testid="button-prev-year"
                      title="Previous Year"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextYear}
                      data-testid="button-next-year"
                      title="Next Year"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Quarter Navigation */}
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((q) => (
                      <Button
                        key={q}
                        variant={parsedRoute.quarter === q ? "default" : "outline"}
                        size="sm"
                        onClick={() => navigateWithFilters(`/history/${parsedRoute.year}/Q${q}`)}
                        data-testid={`button-quarter-${q}`}
                        title={`Go to Q${q}`}
                      >
                        Q{q}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              
              {parsedRoute.viewType === 'monthly' && parsedRoute.date && (
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousMonth}
                    data-testid="button-prev-month"
                    title="Previous Month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextMonth}
                    data-testid="button-next-month"
                    title="Next Month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <MonthPicker
                    currentDate={parsedRoute.date}
                    onMonthSelect={handleMonthPickerSelect}
                    isDarkMode={isDarkMode}
                  />
                </div>
              )}
              
              {parsedRoute.viewType === 'daily' && parsedRoute.date && (
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreviousDay}
                    data-testid="button-header-prev-day"
                    title="Previous Day"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextDay}
                    data-testid="button-header-next-day"
                    title="Next Day"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackToDashboard}
                data-testid="button-back-dashboard"
              >
                <Home className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Dashboard</span>
              </Button>
              
              {(parsedRoute.viewType === 'monthly' || parsedRoute.viewType === 'quarterly') && (filters.group || filters.association || filters.merchant || filters.merchantName || filters.terminal) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    handleFilterChange({
                      group: undefined,
                      association: undefined,
                      merchant: undefined,
                      merchantName: undefined,
                      terminal: undefined
                    });
                  }}
                  data-testid="button-clear-filters"
                >
                  <span className="hidden sm:inline">Clear Filters</span>
                  <span className="sm:hidden">Clear</span>
                </Button>
              )}
              
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
