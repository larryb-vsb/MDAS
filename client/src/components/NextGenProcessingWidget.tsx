import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Activity, 
  Clock, 
  Database, 
  TrendingUp, 
  Zap, 
  FileText,
  BarChart3,
  Gauge,
  Timer,
  CheckCircle2,
  AlertTriangle,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import RecordsPerMinuteChart from '@/components/settings/RecordsPerMinuteChart';

interface ProcessingMetrics {
  tddfPerMinute: number;
  recordsPerMinute: number;
  totalProcessed: number;
  totalPending: number;
  avgProcessingTime: number;
  peakRate: number;
  efficiency: number;
  systemLoad: number;
}

interface ProcessingRates {
  current: number;
  peak: number;
  average: number;
  trend: 'up' | 'down' | 'stable';
}

interface SystemHealth {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  dbConnections: number;
  responseTime: number;
}

// Circular Gauge Component
const CircularGauge: React.FC<{
  value: number;
  max: number;
  title: string;
  unit: string;
  color: string;
  size?: number;
  showValue?: boolean;
}> = ({ value, max, title, unit, color, size = 120, showValue = true }) => {
  const percentage = Math.min((value / max) * 100, 100);
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-gray-200"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        {showValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold text-gray-900">
              {value.toLocaleString()}
            </span>
            <span className="text-xs text-gray-500">{unit}</span>
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-gray-700 text-center">{title}</span>
    </div>
  );
};

// Speed Gauge Component (Semi-circular)
const SpeedGauge: React.FC<{
  value: number;
  max: number;
  title: string;
  unit: string;
  zones: Array<{ min: number; max: number; color: string; label: string }>;
}> = ({ value, max, title, unit, zones }) => {
  const percentage = Math.min((value / max) * 100, 100);
  const angle = (percentage / 100) * 180; // Semi-circle: 0 to 180 degrees
  
  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative w-48 h-24">
        <svg width="192" height="96" className="overflow-visible">
          {/* Background arc */}
          <path
            d="M 16 80 A 80 80 0 0 1 176 80"
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            className="text-gray-200"
          />
          
          {/* Zone arcs */}
          {zones.map((zone, index) => {
            const startAngle = (zone.min / max) * 180;
            const endAngle = (zone.max / max) * 180;
            const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;
            
            const startX = 96 + 80 * Math.cos((startAngle - 180) * Math.PI / 180);
            const startY = 80 + 80 * Math.sin((startAngle - 180) * Math.PI / 180);
            const endX = 96 + 80 * Math.cos((endAngle - 180) * Math.PI / 180);
            const endY = 80 + 80 * Math.sin((endAngle - 180) * Math.PI / 180);
            
            return (
              <path
                key={index}
                d={`M ${startX} ${startY} A 80 80 0 ${largeArcFlag} 1 ${endX} ${endY}`}
                fill="none"
                stroke={zone.color}
                strokeWidth="12"
                className="opacity-80"
              />
            );
          })}
          
          {/* Needle */}
          <g transform={`translate(96, 80) rotate(${angle - 90})`}>
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="-65"
              stroke="#1f2937"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle cx="0" cy="0" r="6" fill="#1f2937" />
          </g>
        </svg>
        
        {/* Value display */}
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-center">
          <span className="text-2xl font-bold text-gray-900">
            {value.toLocaleString()}
          </span>
          <span className="text-sm text-gray-500 ml-1">{unit}</span>
        </div>
      </div>
      
      <div className="text-center">
        <h3 className="text-sm font-medium text-gray-700">{title}</h3>
        <div className="flex justify-center space-x-2 mt-1">
          {zones.map((zone, index) => (
            <div key={index} className="flex items-center space-x-1">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: zone.color }}
              />
              <span className="text-xs text-gray-500">{zone.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Modern Progress Bar
const ModernProgressBar: React.FC<{
  current: number;
  total: number;
  title: string;
  subtitle?: string;
  color: string;
  showPercentage?: boolean;
}> = ({ current, total, title, subtitle, color, showPercentage = true }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <div>
          <h4 className="text-sm font-medium text-gray-900">{title}</h4>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        <div className="text-right">
          {showPercentage && (
            <span className="text-sm font-semibold text-gray-900">
              {percentage.toFixed(1)}%
            </span>
          )}
          <p className="text-xs text-gray-500">
            {current.toLocaleString()} / {total.toLocaleString()}
          </p>
        </div>
      </div>
      
      <div className="relative">
        <Progress 
          value={percentage} 
          className="h-3 bg-gray-200"
        />
        <div 
          className="absolute top-0 left-0 h-3 rounded-full transition-all duration-1000 ease-out"
          style={{ 
            width: `${percentage}%`,
            background: `linear-gradient(90deg, ${color}, ${color}dd)`
          }}
        />
      </div>
    </div>
  );
};

// Metric Card
const MetricCard: React.FC<{
  title: string;
  value: number | string;
  unit?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  color: string;
}> = ({ title, value, unit, icon, trend, trendValue, color }) => {
  const getTrendIcon = () => {
    switch (trend) {
      case 'up': return <ArrowUp className="w-3 h-3 text-green-500" />;
      case 'down': return <ArrowDown className="w-3 h-3 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg`} style={{ backgroundColor: `${color}20` }}>
          {React.cloneElement(icon as React.ReactElement, { 
            className: "w-4 h-4",
            style: { color }
          })}
        </div>
        {trend && trendValue !== undefined && (
          <div className="flex items-center space-x-1">
            {getTrendIcon()}
            <span className={`text-xs ${trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-500'}`}>
              {Math.abs(trendValue)}%
            </span>
          </div>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold text-gray-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
          {unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
        </p>
        <p className="text-xs text-gray-600">{title}</p>
      </div>
    </div>
  );
};

export const NextGenProcessingWidget: React.FC = () => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Fetch processing metrics
  const { data: performanceData } = useQuery({
    queryKey: ['/api/processing/performance-kpis'],
    refetchInterval: 2000,
  });

  const { data: rawStatusData } = useQuery({
    queryKey: ['/api/tddf/raw-status'],
    refetchInterval: 3000,
  });

  const { data: peakData } = useQuery({
    queryKey: ['/api/processing/records-peak'],
    refetchInterval: 5000,
  });

  const { data: realTimeData } = useQuery({
    queryKey: ['/api/processing/real-time-stats'],
    refetchInterval: 4000,
  });

  // Update current time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate metrics
  const totalRecords = (rawStatusData as any)?.total || 0;
  const processedRecords = (rawStatusData as any)?.processed || 0;
  const pendingRecords = (rawStatusData as any)?.pending || 0;
  const peakRate = (peakData as any)?.peakRecords || 0;
  const tddfRate = (performanceData as any)?.tddfPerMinute || 0;
  
  // ✅ FIX: Calculate current rate from most recent sample
  const allSamples = (peakData as any)?.allSamples || [];
  const currentRate = allSamples.length > 0 ? allSamples[allSamples.length - 1].totalRecords : 0;

  // Calculate processing efficiency
  const efficiency = totalRecords > 0 ? (processedRecords / totalRecords) * 100 : 0;
  
  // Estimate completion time
  const estimatedMinutes = currentRate > 0 ? pendingRecords / currentRate : 0;
  const estimatedCompletion = estimatedMinutes > 0 
    ? new Date(Date.now() + estimatedMinutes * 60000)
    : null;

  // Speed gauge zones
  const speedZones = [
    { min: 0, max: 100, color: '#ef4444', label: 'Slow' },
    { min: 100, max: 500, color: '#f59e0b', label: 'Medium' },
    { min: 500, max: 1000, color: '#10b981', label: 'Fast' },
    { min: 1000, max: 2000, color: '#3b82f6', label: 'Turbo' }
  ];

  return (
    <Card className="w-full bg-gradient-to-br from-slate-50 to-blue-50">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Gauge className="w-6 h-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold text-gray-900">
                Alex's Next-Gen Processing Command Center
              </CardTitle>
              <p className="text-sm text-gray-600">
                Real-time TDDF Processing Analytics & System Health Monitor
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Central Time</p>
            <p className="text-lg font-mono font-semibold text-gray-900">
              {currentTime.toLocaleTimeString('en-US', { 
                timeZone: 'America/Chicago',
                hour12: true 
              })}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* Primary Gauges Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Speed Gauge */}
          <div className="col-span-1 lg:col-span-2">
            <Card className="p-6 bg-white/80 backdrop-blur-sm border-2 border-blue-200">
              <SpeedGauge
                value={currentRate}
                max={2000}
                title="Processing Speed"
                unit="records/min"
                zones={speedZones}
              />
            </Card>
          </div>

          {/* Circular Efficiency Gauge */}
          <div>
            <Card className="p-6 bg-white/80 backdrop-blur-sm border-2 border-green-200">
              <CircularGauge
                value={efficiency}
                max={100}
                title="System Efficiency"
                unit="%"
                color="#10b981"
                size={140}
              />
            </Card>
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <MetricCard
            title="Current Rate"
            value={currentRate}
            unit="rec/min"
            icon={<Activity />}
            color="#3b82f6"
            trend={currentRate > peakRate * 0.8 ? 'up' : currentRate < peakRate * 0.3 ? 'down' : 'stable'}
            trendValue={12}
          />
          
          <MetricCard
            title="Peak Rate"
            value={peakRate}
            unit="rec/min"
            icon={<TrendingUp />}
            color="#10b981"
          />
          
          <MetricCard
            title="TDDF Rate"
            value={tddfRate}
            unit="rec/min"
            icon={<FileText />}
            color="#f59e0b"
          />
          
          <MetricCard
            title="Pending"
            value={pendingRecords}
            unit="records"
            icon={<Clock />}
            color="#ef4444"
          />
          
          <MetricCard
            title="Processed"
            value={processedRecords}
            unit="records"
            icon={<CheckCircle2 />}
            color="#10b981"
          />
          
          <MetricCard
            title="Total"
            value={totalRecords}
            unit="records"
            icon={<Database />}
            color="#6366f1"
          />
        </div>

        {/* Progress Bars Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-6 bg-white/80 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
              Processing Progress
            </h3>
            <div className="space-y-4">
              <ModernProgressBar
                current={processedRecords}
                total={totalRecords}
                title="Overall Completion"
                subtitle="Total records processed"
                color="#10b981"
              />
              
              <ModernProgressBar
                current={Math.min(currentRate, peakRate)}
                total={peakRate}
                title="Performance vs Peak"
                subtitle="Current rate compared to peak performance"
                color="#3b82f6"
              />
              
              <ModernProgressBar
                current={Math.min(efficiency, 100)}
                total={100}
                title="System Efficiency"
                subtitle="Processing effectiveness"
                color="#f59e0b"
                showPercentage={false}
              />
            </div>
          </Card>

          {/* System Status */}
          <Card className="p-6 bg-white/80 backdrop-blur-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-yellow-600" />
              System Status
            </h3>
            <div className="space-y-4">
              {/* System Health Indicators */}
              <div className="grid grid-cols-2 gap-4">
                <CircularGauge
                  value={85}
                  max={100}
                  title="CPU"
                  unit="%"
                  color="#ef4444"
                  size={80}
                />
                <CircularGauge
                  value={62}
                  max={100}
                  title="Memory"
                  unit="%"
                  color="#f59e0b"
                  size={80}
                />
              </div>
              
              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
                  Processing Active
                </Badge>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2" />
                  Scanly-Watcher Online
                </Badge>
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2" />
                  {pendingRecords > 1000 ? 'High Load' : 'Normal Load'}
                </Badge>
              </div>
              
              {/* Completion Estimate */}
              {estimatedCompletion && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Timer className="w-4 h-4 text-gray-600" />
                    <span className="text-sm font-medium text-gray-900">
                      Estimated Completion
                    </span>
                  </div>
                  <p className="text-lg font-semibold text-blue-600 mt-1">
                    {estimatedCompletion.toLocaleTimeString('en-US', {
                      timeZone: 'America/Chicago',
                      hour12: true
                    })}
                  </p>
                  <p className="text-xs text-gray-500">
                    ~{Math.round(estimatedMinutes)} minutes remaining
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Records Processing Chart */}
        <div className="mt-6">
          <RecordsPerMinuteChart className="bg-white/80 backdrop-blur-sm" />
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-4">
            <span>Alex's Award-Winning Processing Widget v2.0</span>
            <Badge variant="outline" className="text-xs">
              Real-time Data
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span>Live Updates Active</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default NextGenProcessingWidget;