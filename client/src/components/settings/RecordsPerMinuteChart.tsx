import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { logger } from '@shared/logger';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Clock } from 'lucide-react';
import { useState } from 'react';

interface RecordsPerMinuteData {
  timestamp: string;
  recordsPerMinute: number;
  dtRecords: number;
  bhRecords: number;
  p1Records: number;
  otherRecords: number;
  skippedRecords: number;
  rawLines: number;
  status?: string;
  formattedTime: string;
  formattedDateTime: string;
}

interface RecordsPerMinuteHistoryResponse {
  data: RecordsPerMinuteData[];
  period?: string;
  dataSource?: string;
  lastUpdate?: string;
  totalPoints?: number;
  timeRange?: string;
  lastUpdated?: string;
}

interface RecordsPerMinuteChartProps {
  hours?: number;
  className?: string;
}

export default function RecordsPerMinuteChart({ hours = 1, className = "" }: RecordsPerMinuteChartProps) {
  const [timeRange, setTimeRange] = useState(5/60); // Default to 5 minutes (5/60 hours)
  
  const { data: historyData, isLoading, error } = useQuery<RecordsPerMinuteHistoryResponse>({
    queryKey: ['/api/processing/performance-chart-history', timeRange],
    queryFn: async () => {
      logger.charts(`Fetching data for timeRange: ${timeRange} hours (${timeRange * 60} minutes)`);
      const response = await fetch(`/api/processing/performance-chart-history?hours=${timeRange}`);
      if (!response.ok) throw new Error('Failed to fetch data');
      const data = await response.json();
      logger.charts(`Received ${data.data?.length || 0} data points for ${timeRange} hours`);
      logger.charts(`API period response: ${data.period}`);
      return data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds to match Scanly-Watcher recording
    staleTime: 25000, // Match KPI refresh timing
  });

  // Time range options
  const timeRangeOptions = [
    { value: 1/60, label: '1 Minute', shortLabel: '1m' },
    { value: 2/60, label: '2 Minutes', shortLabel: '2m' },
    { value: 5/60, label: '5 Minutes', shortLabel: '5m' },
    { value: 10/60, label: '10 Minutes', shortLabel: '10m' },
    { value: 30/60, label: '30 Minutes', shortLabel: '30m' },
    { value: 1, label: '1 Hour', shortLabel: '1h' },
    { value: 2, label: '2 Hours', shortLabel: '2h' },
    { value: 6, label: '6 Hours', shortLabel: '6h' },
    { value: 12, label: '12 Hours', shortLabel: '12h' },
    { value: 24, label: '24 Hours', shortLabel: '24h' }
  ];

  // Enhanced Y-axis formatting with better scale labels
  const formatYAxis = (value: number) => {
    if (value >= 10000) {
      return `${(value / 1000).toFixed(0)}k`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    } else if (value >= 100) {
      return value.toString();
    } else if (value > 0) {
      return value.toFixed(0);
    }
    return '0';
  };

  // Generate better Y-axis ticks
  const getYAxisTicks = () => {
    if (!historyData?.data.length) return [0, 50, 100];
    const maxValue = Math.max(...historyData.data.map(d => (d.dtRecords || 0) + (d.bhRecords || 0) + (d.p1Records || 0) + (d.otherRecords || 0) + (d.skippedRecords || 0)));
    
    if (maxValue <= 10) return [0, 2, 4, 6, 8, 10];
    if (maxValue <= 50) return [0, 10, 20, 30, 40, 50];
    if (maxValue <= 100) return [0, 25, 50, 75, 100];
    if (maxValue <= 500) return [0, 100, 200, 300, 400, 500];
    
    const step = Math.ceil(maxValue / 5 / 10) * 10;
    return Array.from({ length: 6 }, (_, i) => i * step);
  };

  // Format time for X-axis (short format with AM/PM)
  const formatTimeOnly = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  // Get the current date for bottom display
  const getCurrentDate = () => {
    if (!historyData?.data.length) return '';
    const latestData = historyData.data[historyData.data.length - 1];
    const date = new Date(latestData.timestamp);
    return date.toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Group samples by minute and aggregate the data
  const getDataWithShortTime = () => {
    if (!historyData?.data.length) return [];
    
    // Group data by minute
    const groupedByMinute = historyData.data.reduce((acc, item) => {
      const date = new Date(item.timestamp);
      const minuteKey = new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()).toISOString();
      
      if (!acc[minuteKey]) {
        acc[minuteKey] = {
          timestamp: minuteKey,
          dtRecords: 0,
          bhRecords: 0,
          p1Records: 0,
          otherRecords: 0,
          skippedRecords: 0,
          rawLines: 0,
          count: 0
        };
      }
      
      // Sum up all records for this minute
      acc[minuteKey].dtRecords += item.dtRecords || 0;
      acc[minuteKey].bhRecords += item.bhRecords || 0;
      acc[minuteKey].p1Records += item.p1Records || 0;
      acc[minuteKey].otherRecords += item.otherRecords || 0;
      acc[minuteKey].skippedRecords += item.skippedRecords || 0;
      acc[minuteKey].rawLines += item.rawLines || 0;
      acc[minuteKey].count += 1;
      
      return acc;
    }, {} as Record<string, any>);
    
    // Convert back to array and add formatted time
    // Sort with most recent first (left side) for better chronological reading
    return Object.values(groupedByMinute).map((item: any) => ({
      ...item,
      shortTime: formatTimeOnly(item.timestamp),
      recordsPerMinute: item.dtRecords + item.bhRecords + item.p1Records + item.otherRecords + item.skippedRecords
    })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const totalTddf = data.dtRecords + data.bhRecords + data.p1Records + data.otherRecords + data.skippedRecords;
      
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
          <p className="font-semibold mb-2">{label}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium text-purple-600">Total TDDF:</span>
              <span className="font-semibold">{totalTddf.toLocaleString()} records/min</span>
            </div>
            <div className="h-px bg-gray-200 my-2"></div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
                DT:
              </span>
              <span>{data.dtRecords.toLocaleString()} records/min</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-sm"></div>
                BH:
              </span>
              <span>{data.bhRecords.toLocaleString()} records/min</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
                P1/P2:
              </span>
              <span>{data.p1Records.toLocaleString()} records/min</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-500 rounded-sm"></div>
                Other:
              </span>
              <span>{data.otherRecords.toLocaleString()} records/min</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                Skipped:
              </span>
              <span>{data.skippedRecords.toLocaleString()} records/min</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center">
              <TrendingUp className="mr-2 h-4 w-4" />
              Records Processed per Minute
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeRange.toString()} onValueChange={(value) => setTimeRange(Number(value))}>
                <SelectTrigger className="w-16 h-6 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeRangeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.shortLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            Loading chart data...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !historyData?.data || historyData.data.length === 0) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center justify-between">
            <div className="flex items-center">
              <TrendingUp className="mr-2 h-4 w-4" />
              Records Processed per Minute
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeRange.toString()} onValueChange={(value) => setTimeRange(Number(value))}>
                <SelectTrigger className="w-16 h-6 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeRangeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.shortLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="h-32 flex items-center justify-center text-sm text-muted-foreground">
            {error ? 'Error loading data' : 'No processing activity in selected time range'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = getDataWithShortTime();
  const maxValue = Math.max(...historyData.data.map(d => (d.dtRecords || 0) + (d.bhRecords || 0) + (d.p1Records || 0) + (d.otherRecords || 0) + (d.skippedRecords || 0)));
  const avgValue = historyData.data.reduce((sum, d) => sum + ((d.dtRecords || 0) + (d.bhRecords || 0) + (d.p1Records || 0) + (d.otherRecords || 0) + (d.skippedRecords || 0)), 0) / historyData.data.length;
  const currentDate = getCurrentDate();

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center">
            <TrendingUp className="mr-2 h-4 w-4" />
            Records Processed per Minute
          </div>
          <div className="flex items-center gap-2">
            {/* Time Range Selector */}
            <Select value={timeRange.toString()} onValueChange={(value) => setTimeRange(Number(value))}>
              <SelectTrigger className="w-16 h-6 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timeRangeOptions.map(option => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.shortLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="text-center">
              <div className="font-semibold text-orange-600">{maxValue.toLocaleString()}</div>
              <div className="text-muted-foreground">Peak</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-blue-600">{Math.round(avgValue).toLocaleString()}</div>
              <div className="text-muted-foreground">Average</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-green-600">{chartData.length}</div>
              <div className="text-muted-foreground">Samples</div>
            </div>
          </div>

          {/* Enhanced Chart with better scaling */}
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{
                  top: 10,
                  right: 10,
                  left: 35,
                  bottom: 50,
                }}
              >
                <CartesianGrid strokeDasharray="2 2" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="shortTime"
                  tick={{ fontSize: 9, textAnchor: 'middle' }}
                  angle={0}
                  textAnchor="middle"
                  interval={Math.max(Math.floor(chartData.length / 8), 0)}
                />
                <YAxis 
                  tickFormatter={formatYAxis}
                  tick={{ fontSize: 10 }}
                  ticks={getYAxisTicks()}
                  domain={[0, 'dataMax']}
                />
                <Tooltip content={<CustomTooltip />} />
                
                {/* Stacked bars */}
                <Bar dataKey="dtRecords" stackId="records" fill="#3b82f6" name="DT Records" />
                <Bar dataKey="bhRecords" stackId="records" fill="#10b981" name="BH Records" />
                <Bar dataKey="p1Records" stackId="records" fill="#f59e0b" name="P1/P2 Records" />
                <Bar dataKey="otherRecords" stackId="records" fill="#6b7280" name="Other Records" />
                <Bar dataKey="skippedRecords" stackId="records" fill="#ef4444" name="Skipped Records" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart Footer */}
          <div className="flex items-center justify-between border-t pt-2">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Real-time • 4s zoom • Last updated: {new Date().toLocaleTimeString()}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                DT
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                BH
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-amber-500 rounded-full" />
                P1/P2
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full" />
                Other
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                Skip
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}