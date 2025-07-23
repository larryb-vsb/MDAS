import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Clock, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface RecordsPerMinuteData {
  timestamp: string;
  recordsPerMinute: number;
  dtRecords: number;
  bhRecords: number;
  p1Records: number;
  otherRecords: number;
  status: string;
  formattedTime: string;
}

interface RecordsPerMinuteHistoryResponse {
  data: RecordsPerMinuteData[];
  totalPoints: number;
  timeRange: string;
  lastUpdated: string;
}

interface RecordsPerMinuteChartProps {
  hours?: number;
  className?: string;
}

export default function RecordsPerMinuteChart({ hours = 6, className = "" }: RecordsPerMinuteChartProps) {
  const [timeRange, setTimeRange] = useState(hours);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [timeOffset, setTimeOffset] = useState(0); // Hours to offset from current time
  
  const { data: historyData, isLoading, error } = useQuery<RecordsPerMinuteHistoryResponse>({
    queryKey: ['/api/processing/records-per-minute-history', timeRange, timeOffset],
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
  });

  // Time range options
  const timeRangeOptions = [
    { value: 1, label: '1 Hour', shortLabel: '1h' },
    { value: 3, label: '3 Hours', shortLabel: '3h' },
    { value: 6, label: '6 Hours', shortLabel: '6h' },
    { value: 12, label: '12 Hours', shortLabel: '12h' },
    { value: 24, label: '24 Hours', shortLabel: '24h' },
    { value: 72, label: '3 Days', shortLabel: '3d' }
  ];

  // Calculate zoom levels based on data
  const getZoomLevels = () => {
    if (!historyData?.data.length) return [1];
    const dataPoints = historyData.data.length;
    const levels = [1];
    if (dataPoints > 10) levels.push(2);
    if (dataPoints > 20) levels.push(4);
    if (dataPoints > 40) levels.push(8);
    return levels;
  };

  // Apply zoom to data
  const getZoomedData = () => {
    if (!historyData?.data.length) return [];
    const data = historyData.data;
    const totalPoints = data.length;
    const pointsToShow = Math.max(Math.floor(totalPoints / zoomLevel), 2);
    const startIndex = Math.max(0, totalPoints - pointsToShow);
    return data.slice(startIndex);
  };

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
    const maxValue = Math.max(...historyData.data.map(d => d.recordsPerMinute));
    const minValue = Math.min(...historyData.data.map(d => d.recordsPerMinute));
    
    if (maxValue <= 10) return [0, 2, 4, 6, 8, 10];
    if (maxValue <= 50) return [0, 10, 20, 30, 40, 50];
    if (maxValue <= 100) return [0, 25, 50, 75, 100];
    if (maxValue <= 500) return [0, 100, 200, 300, 400, 500];
    
    const step = Math.ceil(maxValue / 5 / 10) * 10;
    return Array.from({ length: 6 }, (_, i) => i * step);
  };

  // Navigation handlers
  const handleZoomIn = () => {
    const levels = getZoomLevels();
    const currentIndex = levels.indexOf(zoomLevel);
    if (currentIndex < levels.length - 1) {
      setZoomLevel(levels[currentIndex + 1]);
    }
  };

  const handleZoomOut = () => {
    const levels = getZoomLevels();
    const currentIndex = levels.indexOf(zoomLevel);
    if (currentIndex > 0) {
      setZoomLevel(levels[currentIndex - 1]);
    }
  };

  const handleTimeBack = () => {
    setTimeOffset(prev => prev + Math.floor(timeRange / 4));
  };

  const handleTimeForward = () => {
    setTimeOffset(prev => Math.max(0, prev - Math.floor(timeRange / 4)));
  };

  const formatTooltip = (value: number, name: string) => {
    if (name === 'DT Records') {
      return [`${value.toLocaleString()} records/min`, 'DT'];
    }
    if (name === 'BH Records') {
      return [`${value.toLocaleString()} records/min`, 'BH'];
    }
    if (name === 'P1 Records') {
      return [`${value.toLocaleString()} records/min`, 'P1'];
    }
    if (name === 'Other Records') {
      return [`${value.toLocaleString()} records/min`, 'Other'];
    }
    return [value, name];
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center">
            <TrendingUp className="mr-2 h-4 w-4" />
            Records Processed per Minute
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

  if (error || !historyData || historyData.data.length === 0) {
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
                <SelectTrigger className="w-20 h-6 text-xs">
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

  const zoomedData = getZoomedData();
  const maxValue = Math.max(...historyData.data.map(d => d.recordsPerMinute));
  const avgValue = historyData.data.reduce((sum, d) => sum + d.recordsPerMinute, 0) / historyData.data.length;
  const zoomLevels = getZoomLevels();
  const canZoomIn = zoomLevel < Math.max(...zoomLevels);
  const canZoomOut = zoomLevel > Math.min(...zoomLevels);
  const canGoBack = timeOffset < 168; // Max 1 week back
  const canGoForward = timeOffset > 0;

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
            
            {/* Navigation Controls */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleTimeBack}
                disabled={!canGoBack}
                title="Go back in time"
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleTimeForward}
                disabled={!canGoForward}
                title="Go forward in time"
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleZoomOut}
                disabled={!canZoomOut}
                title="Zoom out"
              >
                <ZoomOut className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleZoomIn}
                disabled={!canZoomIn}
                title="Zoom in"
              >
                <ZoomIn className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {/* Enhanced Summary Stats */}
          <div className="grid grid-cols-4 gap-3 text-xs">
            <div className="text-center">
              <div className="font-semibold text-orange-600">{maxValue.toLocaleString()}</div>
              <div className="text-muted-foreground">Peak</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-blue-600">{Math.round(avgValue).toLocaleString()}</div>
              <div className="text-muted-foreground">Average</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-green-600">{zoomedData.length}</div>
              <div className="text-muted-foreground">Points {zoomLevel > 1 ? `(${zoomLevel}x)` : ''}</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-purple-600">
                {timeOffset > 0 ? `-${timeOffset}h` : 'Live'}
              </div>
              <div className="text-muted-foreground">Time</div>
            </div>
          </div>

          {/* Enhanced Chart with better scaling */}
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={zoomedData}
                margin={{
                  top: 10,
                  right: 10,
                  left: 35,
                  bottom: 20,
                }}
              >
                <CartesianGrid strokeDasharray="2 2" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="formattedTime"
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                  axisLine={{ stroke: '#e0e0e0' }}
                  tickLine={{ stroke: '#e0e0e0' }}
                />
                <YAxis 
                  domain={[0, 125]}
                  ticks={[0, 25, 50, 75, 100, 125]}
                  tickFormatter={formatYAxis}
                  tick={{ fontSize: 9 }}
                  axisLine={{ stroke: '#e0e0e0' }}
                  tickLine={{ stroke: '#e0e0e0' }}
                  width={30}
                  label={{ 
                    value: 'Records/min', 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { textAnchor: 'middle', fontSize: '10px', fill: '#666' }
                  }}
                />
                <Tooltip 
                  formatter={formatTooltip}
                  labelStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                  contentStyle={{ 
                    fontSize: '11px', 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e0e0e0',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Bar 
                  dataKey="dtRecords" 
                  stackId="records"
                  fill="#3b82f6"
                  radius={[0, 0, 0, 0]}
                  name="DT Records"
                />
                <Bar 
                  dataKey="bhRecords" 
                  stackId="records"
                  fill="#10b981"
                  radius={[0, 0, 0, 0]}
                  name="BH Records"
                />
                <Bar 
                  dataKey="p1Records" 
                  stackId="records"
                  fill="#f59e0b"
                  radius={[0, 0, 0, 0]}
                  name="P1 Records"
                />
                <Bar 
                  dataKey="otherRecords" 
                  stackId="records"
                  fill="#ef4444"
                  radius={[2, 2, 0, 0]}
                  name="Other Records"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* Status indicator with record type legend */}
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span>
              {timeRange <= 6 ? 'Real-time' : 'Historical'} • 
              {zoomLevel > 1 ? ` ${zoomLevel}x zoom` : ' Overview'} • 
              Last updated: {historyData.lastUpdated}
            </span>
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
                P1
              </span>
              <span className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-500 rounded-full" />
                Other
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}