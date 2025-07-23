import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, Clock } from 'lucide-react';

interface RecordsPerMinuteData {
  timestamp: string;
  recordsPerMinute: number;
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
  const { data: historyData, isLoading, error } = useQuery<RecordsPerMinuteHistoryResponse>({
    queryKey: ['/api/processing/records-per-minute-history', hours],
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 15000,
  });

  const formatYAxis = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    }
    return value.toString();
  };

  const formatTooltip = (value: number, name: string) => {
    if (name === 'recordsPerMinute') {
      return [`${value.toLocaleString()} records/min`, 'Processing Rate'];
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
          <CardTitle className="text-sm font-medium flex items-center">
            <TrendingUp className="mr-2 h-4 w-4" />
            Records Processed per Minute
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

  const maxValue = Math.max(...historyData.data.map(d => d.recordsPerMinute));
  const avgValue = historyData.data.reduce((sum, d) => sum + d.recordsPerMinute, 0) / historyData.data.length;

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center">
            <TrendingUp className="mr-2 h-4 w-4" />
            Records Processed per Minute
          </div>
          <div className="flex items-center text-xs text-muted-foreground">
            <Clock className="mr-1 h-3 w-3" />
            Last {hours}h
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {/* Summary Stats */}
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div className="text-center">
              <div className="font-semibold text-orange-600">{maxValue.toLocaleString()}</div>
              <div className="text-muted-foreground">Peak</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-blue-600">{Math.round(avgValue).toLocaleString()}</div>
              <div className="text-muted-foreground">Average</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-green-600">{historyData.totalPoints}</div>
              <div className="text-muted-foreground">Data Points</div>
            </div>
          </div>

          {/* Chart */}
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={historyData.data}
                margin={{
                  top: 5,
                  right: 5,
                  left: 5,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="formattedTime"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  axisLine={false}
                />
                <YAxis 
                  tickFormatter={formatYAxis}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  width={35}
                />
                <Tooltip 
                  formatter={formatTooltip}
                  labelStyle={{ fontSize: '12px' }}
                  contentStyle={{ fontSize: '12px' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="recordsPerMinute" 
                  stroke="#ea9d2f" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, fill: '#ea9d2f' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}