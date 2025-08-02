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

  // Fetch activity data for all record types
  const { data: allActivityData, isLoading, error } = useQuery<{ [key: string]: ActivityResponse }>({
    queryKey: ['/api/tddf-json/activity-all-types', currentYear],
    queryFn: async () => {
      const recordTypes = ['DT', 'BH', 'P1', 'P2', 'E1', 'G2', 'AD', 'DR', 'CK', 'LG', 'GE'];
      const responses = await Promise.all(
        recordTypes.map(async (type) => {
          try {
            const response = await fetch(`/api/tddf-json/activity?year=${currentYear}&recordType=${type}`, {
              credentials: 'include'
            });
            if (!response.ok) return { type, data: { records: [] } };
            const data = await response.json();
            return { type, data };
          } catch (error) {
            return { type, data: { records: [] } };
          }
        })
      );
      
      const result: { [key: string]: ActivityResponse } = {};
      responses.forEach(({ type, data }) => {
        result[type] = data;
      });
      return result;
    },
    enabled: true,
    staleTime: Infinity, // Never refresh automatically - "never re-fresh" policy
    gcTime: Infinity, // Keep in cache forever
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchInterval: false,
  });

  // Process data for different view modes with stacked record types
  const chartData = useMemo(() => {
    if (!allActivityData) return [];

    // Combine all record types into a single dataset
    const allDates = new Set<string>();
    const recordTypes = ['DT', 'BH', 'P1', 'P2', 'E1', 'G2', 'AD', 'DR', 'CK', 'LG', 'GE'];
    
    // Collect all unique dates
    recordTypes.forEach(type => {
      const response = allActivityData[type];
      if (response?.records) {
        response.records.forEach(item => {
          const date = item.date || item.transaction_date?.split('T')[0];
          if (date) allDates.add(date);
        });
      }
    });

    // Create a map for each date with all record type counts
    const dateDataMap = new Map<string, any>();
    
    Array.from(allDates).forEach(date => {
      const dayData: any = {
        date,
        displayDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: 0
      };
      
      recordTypes.forEach(type => {
        const response = allActivityData[type];
        const record = response?.records?.find(r => 
          (r.date || r.transaction_date?.split('T')[0]) === date
        );
        const count = record?.transaction_count || 0;
        dayData[type] = count;
        dayData.total += count;
      });
      
      dateDataMap.set(date, dayData);
    });

    let processedData = Array.from(dateDataMap.values())
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Apply view mode aggregation
    if (viewMode === 'weekly') {
      const weeklyData = new Map<string, any>();
      
      processedData.forEach(item => {
        const date = new Date(item.date);
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!weeklyData.has(weekKey)) {
          weeklyData.set(weekKey, {
            date: weekKey,
            displayDate: `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
            total: 0,
            ...Object.fromEntries(recordTypes.map(type => [type, 0]))
          });
        }
        
        const weekData = weeklyData.get(weekKey)!;
        recordTypes.forEach(type => {
          weekData[type] += item[type] || 0;
        });
        weekData.total += item.total;
      });

      return Array.from(weeklyData.values())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    if (viewMode === 'monthly') {
      const monthlyData = new Map<string, any>();
      
      processedData.forEach(item => {
        const date = new Date(item.date);
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-01`;
        
        if (!monthlyData.has(monthKey)) {
          monthlyData.set(monthKey, {
            date: monthKey,
            displayDate: new Date(monthKey).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            total: 0,
            ...Object.fromEntries(recordTypes.map(type => [type, 0]))
          });
        }
        
        const monthData = monthlyData.get(monthKey)!;
        recordTypes.forEach(type => {
          monthData[type] += item[type] || 0;
        });
        monthData.total += item.total;
      });

      return Array.from(monthlyData.values())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }

    return processedData;
  }, [allActivityData, viewMode]);

  const totalTransactions = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.total, 0);
  }, [chartData]);

  const averageDaily = useMemo(() => {
    return chartData.length > 0 ? Math.round(totalTransactions / chartData.length) : 0;
  }, [chartData, totalTransactions]);

  const peakActivity = useMemo(() => {
    return chartData.reduce((max, item) => Math.max(max, item.total), 0);
  }, [chartData]);

  if (enableDebugLogging) {
    console.log('[TDDF-CHART] All activity data:', allActivityData);
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
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-lg max-w-xs">
          <p className="font-medium text-gray-900 mb-2">{data.displayDate}</p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-sm" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-sm text-gray-700">{entry.dataKey}:</span>
                </div>
                <span className="text-sm font-medium">{entry.value.toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t pt-1 mt-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-gray-900">Total:</span>
                <span className="text-sm font-bold">{data.total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Define colors for each record type
  const recordTypeColors = {
    'DT': '#3b82f6', // Blue
    'BH': '#10b981', // Green
    'P1': '#f59e0b', // Orange
    'P2': '#f97316', // Orange-Red
    'E1': '#6b7280', // Gray
    'G2': '#8b5cf6', // Purple
    'AD': '#ef4444', // Red
    'DR': '#06b6d4', // Cyan
    'CK': '#84cc16', // Lime
    'LG': '#ec4899', // Pink
    'GE': '#64748b'  // Slate
  };

  const renderChart = () => {
    const chartProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    const recordTypes = ['DT', 'BH', 'P1', 'P2', 'E1', 'G2', 'AD', 'DR', 'CK', 'LG', 'GE'];
    const activeTypes = recordTypes.filter(type => 
      chartData.some(item => item[type] > 0)
    );

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
            {activeTypes.map(type => (
              <Line 
                key={type}
                type="monotone" 
                dataKey={type} 
                stroke={recordTypeColors[type as keyof typeof recordTypeColors]} 
                strokeWidth={2}
                dot={{ strokeWidth: 0, r: 2 }}
                activeDot={{ r: 4, stroke: recordTypeColors[type as keyof typeof recordTypeColors], strokeWidth: 2 }}
              />
            ))}
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
            {activeTypes.map(type => (
              <Area 
                key={type}
                type="monotone" 
                dataKey={type} 
                stackId="1"
                stroke={recordTypeColors[type as keyof typeof recordTypeColors]} 
                fill={recordTypeColors[type as keyof typeof recordTypeColors]}
                fillOpacity={0.7}
                strokeWidth={1}
              />
            ))}
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
            {activeTypes.map(type => (
              <Bar 
                key={type}
                dataKey={type} 
                stackId="1"
                fill={recordTypeColors[type as keyof typeof recordTypeColors]}
                radius={type === activeTypes[activeTypes.length - 1] ? [2, 2, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
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
      {allActivityData && Object.values(allActivityData).some(data => data.fromCache) && (
        <div className="text-xs text-gray-500 text-center">
          Data served from cache • Multiple record types aggregated
        </div>
      )}
    </div>
  );
}