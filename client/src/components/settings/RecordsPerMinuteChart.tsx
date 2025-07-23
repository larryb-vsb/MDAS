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
  formattedDateTime: string;
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

export default function RecordsPerMinuteChart({ hours = 1, className = "" }: RecordsPerMinuteChartProps) {
  const [timeRange, setTimeRange] = useState(10/60); // Default to 10 minutes (10/60 hours)
  const [zoomLevel, setZoomLevel] = useState(4); // Default to 4x zoom
  const [timeOffset, setTimeOffset] = useState(0); // Hours to offset from current time
  
  const { data: historyData, isLoading, error } = useQuery<RecordsPerMinuteHistoryResponse>({
    queryKey: ['/api/processing/records-per-minute-history', timeRange, timeOffset],
    queryFn: async () => {
      const response = await fetch(`/api/processing/records-per-minute-history?hours=${timeRange}&timeOffset=${timeOffset}`);
      if (!response.ok) throw new Error('Failed to fetch data');
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
  });

  // Time range options
  const timeRangeOptions = [
    { value: 10/60, label: '10 Minutes', shortLabel: '10m' },
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
    if (currentIndex > 0) {
      setZoomLevel(levels[currentIndex - 1]);
    }
  };

  const handleZoomOut = () => {
    const levels = getZoomLevels();
    const currentIndex = levels.indexOf(zoomLevel);
    if (currentIndex < levels.length - 1) {
      setZoomLevel(levels[currentIndex + 1]);
    }
  };

  const handleTimeLeft = () => {
    // Left arrow = go forward toward live data (decrease timeOffset)
    const step = Math.max(1, Math.floor(timeRange / 4));
    setTimeOffset(prev => Math.max(0, prev - step));
  };

  const handleTimeRight = () => {
    // Right arrow = go back in time (increase timeOffset to go further back)
    const step = Math.max(1, Math.floor(timeRange / 4));
    setTimeOffset(prev => prev + step);
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

  // Add short time format to data - keep latest time slots on left when zooming
  const getDataWithShortTime = () => {
    if (!historyData?.data.length) return [];
    const data = historyData.data;
    const totalPoints = data.length;
    const pointsToShow = Math.max(Math.floor(totalPoints / zoomLevel), 2);
    
    // Take the most recent data points and reverse them to show latest time on left
    const startIndex = Math.max(0, totalPoints - pointsToShow);
    const recentData = data.slice(startIndex);
    
    // Reverse the data so latest time appears on the left side of chart
    return recentData.reverse().map(item => ({
      ...item,
      shortTime: formatTimeOnly(item.timestamp)
    }));
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

  const zoomedData = getDataWithShortTime();
  const maxValue = Math.max(...historyData.data.map(d => d.recordsPerMinute));
  const avgValue = historyData.data.reduce((sum, d) => sum + d.recordsPerMinute, 0) / historyData.data.length;
  const currentDate = getCurrentDate();
  const zoomLevels = getZoomLevels();
  const canZoomIn = zoomLevel < Math.max(...zoomLevels);
  const canZoomOut = zoomLevel > Math.min(...zoomLevels);
  const canGoLeft = timeOffset > 0; // Left arrow: can go forward toward live data (timeOffset = 0)
  const canGoRight = timeOffset < 168; // Right arrow: can go back in time (max 1 week back)

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
                onClick={handleTimeLeft}
                disabled={!canGoLeft}
                title={`Go forward ${Math.max(1, Math.floor(timeRange / 4))} hour${Math.max(1, Math.floor(timeRange / 4)) > 1 ? 's' : ''} toward live data`}
              >
                <ChevronLeft className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleTimeRight}
                disabled={!canGoRight}
                title={`Go back ${Math.max(1, Math.floor(timeRange / 4))} hour${Math.max(1, Math.floor(timeRange / 4)) > 1 ? 's' : ''} in time`}
              >
                <ChevronRight className="h-3 w-3" />
              </Button>
              {timeOffset > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setTimeOffset(0)}
                  title="Jump to live data"
                >
                  Live
                </Button>
              )}
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
          {/* Zoom Level Indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>Zoom: {zoomLevel}x</span>  
            {timeOffset > 0 && <span>• {timeOffset}h ago</span>}
            <span>• {zoomedData.length} samples</span>
          </div>
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
                  bottom: 50,
                }}
              >
                <CartesianGrid strokeDasharray="2 2" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="shortTime"
                  tick={{ fontSize: 9, angle: 0, textAnchor: 'middle' }}
                  interval="preserveStartEnd"
                  axisLine={{ stroke: '#e0e0e0' }}
                  tickLine={{ stroke: '#e0e0e0' }}
                  height={25}
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
          
          {/* Date display centered */}
          <div className="text-center text-sm font-medium text-muted-foreground py-1">
            {currentDate}
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