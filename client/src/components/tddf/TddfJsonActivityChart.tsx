import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { Calendar, TrendingUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';

interface ActivityData {
  date?: string;
  transaction_date?: string;
  transaction_count: number;
}

interface ActivityResponse {
  records: ActivityData[];
  fromCache: boolean;
  queryTime: number;
  metadata?: {
    aggregationLevel?: string;
    totalRecords?: number;
    performanceMetrics?: {
      totalQueryTime?: number;
      aggregationTime?: number;
    };
  };
  cacheInfo?: {
    tableName: string;
    recordCount: number;
    lastUpdated: string;
    ageMinutes: number;
    dateRange: {
      earliest: string;
      latest: string;
    };
  };
}

interface TddfJsonActivityChartProps {
  currentYear: number;
  enableDebugLogging?: boolean;
}

export default function TddfJsonActivityChart({ currentYear, enableDebugLogging = false }: TddfJsonActivityChartProps) {
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area'>('bar');
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Fetch the same activity data as the heat map
  const { data: activityResponse, isLoading, error } = useQuery<ActivityResponse>({
    queryKey: ['/api/tddf-json/activity', currentYear, 'DT'],
    queryFn: async () => {
      const response = await fetch(`/api/tddf-json/activity?year=${currentYear}&recordType=DT`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch activity data');
      return response.json();
    },
    enabled: true,
    staleTime: Infinity, // Never refresh automatically - "never re-fresh" policy
    gcTime: Infinity, // Keep in cache forever
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  // Process data for different view modes
  const chartData = useMemo(() => {
    if (!activityResponse?.records) return [];

    const records = activityResponse.records.map(item => ({
      date: item.date || item.transaction_date?.split('T')[0],
      count: item.transaction_count || 0
    })).filter(item => item.date);

    if (viewMode === 'daily') {
      return records.map(item => ({
        date: item.date,
        displayDate: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: item.count
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    if (viewMode === 'weekly') {
      const weeklyData = new Map<string, number>();
      
      records.forEach(item => {
        const date = new Date(item.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        
        weeklyData.set(weekKey, (weeklyData.get(weekKey) || 0) + item.count);
      });

      return Array.from(weeklyData.entries()).map(([date, count]) => ({
        date,
        displayDate: `Week of ${new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        count
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    if (viewMode === 'monthly') {
      const monthlyData = new Map<string, number>();
      
      records.forEach(item => {
        const date = new Date(item.date);
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-01`;
        
        monthlyData.set(monthKey, (monthlyData.get(monthKey) || 0) + item.count);
      });

      return Array.from(monthlyData.entries()).map(([date, count]) => ({
        date,
        displayDate: new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        count
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    return [];
  }, [activityResponse, viewMode]);

  const totalTransactions = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.count, 0);
  }, [chartData]);

  const averageDaily = useMemo(() => {
    return chartData.length > 0 ? Math.round(totalTransactions / chartData.length) : 0;
  }, [chartData, totalTransactions]);

  const peakActivity = useMemo(() => {
    return chartData.reduce((max, item) => Math.max(max, item.count), 0);
  }, [chartData]);

  if (enableDebugLogging) {
    console.log('[TDDF-CHART] Activity response:', activityResponse);
    console.log('[TDDF-CHART] Chart data:', chartData);
    console.log('[TDDF-CHART] Current year:', currentYear);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex flex-col items-center gap-2">
          <BarChart3 className="w-6 h-6 animate-pulse text-blue-500" />
          <span className="text-sm text-gray-500">Loading chart data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700 text-sm">Failed to load chart data</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <p className="font-medium text-gray-900">{data.payload.displayDate}</p>
          <p className="text-sm text-blue-600">
            <span className="font-medium">{data.value.toLocaleString()}</span> transactions
          </p>
        </div>
      );
    }
    return null;
  };

  const renderChart = () => {
    const chartProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="displayDate" 
              tick={{ fontSize: 12 }}
              interval={Math.max(1, Math.floor(chartData.length / 10))}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              type="monotone" 
              dataKey="count" 
              stroke="#3b82f6" 
              strokeWidth={2}
              dot={{ fill: '#3b82f6', strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, stroke: '#3b82f6', strokeWidth: 2 }}
            />
          </LineChart>
        );
      
      case 'area':
        return (
          <AreaChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="displayDate" 
              tick={{ fontSize: 12 }}
              interval={Math.max(1, Math.floor(chartData.length / 10))}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey="count" 
              stroke="#3b82f6" 
              fill="#3b82f6"
              fillOpacity={0.3}
              strokeWidth={2}
            />
          </AreaChart>
        );
      
      default: // bar
        return (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="displayDate" 
              tick={{ fontSize: 12 }}
              interval={Math.max(1, Math.floor(chartData.length / 8))}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey="count" 
              fill="#3b82f6"
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Chart Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Chart Type:</label>
            <Select value={chartType} onValueChange={(value: 'bar' | 'line' | 'area') => setChartType(value)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar</SelectItem>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="area">Area</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">View:</label>
            <Select value={viewMode} onValueChange={(value: 'daily' | 'weekly' | 'monthly') => setViewMode(value)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            <span>Peak: {peakActivity.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>Avg: {averageDaily.toLocaleString()}/day</span>
          </div>
          <div className="font-medium">
            Total: {totalTransactions.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>

      {/* Cache Status Footer */}
      {activityResponse?.fromCache && (
        <div className="text-xs text-gray-500 text-center">
          Data served from cache • Query time: {activityResponse.queryTime}ms
          {activityResponse.metadata?.aggregationLevel && 
            ` • ${activityResponse.metadata.aggregationLevel} aggregation`
          }
        </div>
      )}
    </div>
  );
}