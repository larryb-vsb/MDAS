import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

interface RefreshStatusProps {
  lastRefreshed?: string;
  lastFinished?: string;
  duration?: number;
  ageMinutes?: number;
  refreshStatus?: 'fresh' | 'cached' | 'stale' | 'manual_refresh' | 'loading';
  recordCount?: number;
  compact?: boolean;
}

export const RefreshStatusIndicator: React.FC<RefreshStatusProps> = ({
  lastRefreshed,
  lastFinished,
  duration,
  ageMinutes = 0,
  refreshStatus = 'cached',
  recordCount,
  compact = false
}) => {
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return 'Never';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Invalid date';
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    } catch {
      return 'Invalid date';
    }
  };

  const getStatusColor = () => {
    switch (refreshStatus) {
      case 'fresh': return 'bg-green-500';
      case 'cached': return 'bg-blue-500';
      case 'stale': return 'bg-orange-500';
      case 'manual_refresh': return 'bg-purple-500';
      case 'loading': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getStatusIcon = () => {
    switch (refreshStatus) {
      case 'fresh': return <CheckCircle2 className="h-3 w-3" />;
      case 'cached': return <Clock className="h-3 w-3" />;
      case 'stale': return <AlertTriangle className="h-3 w-3" />;
      case 'manual_refresh': return <RefreshCw className="h-3 w-3" />;
      case 'loading': return <RefreshCw className="h-3 w-3 animate-spin" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
        <span>{ageMinutes}m ago</span>
        {duration && <span>({duration}ms)</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
        <span className="text-sm">
          Last refreshed: {formatDateTime(lastRefreshed || lastFinished)}
        </span>
      </div>
      
      {(duration || ageMinutes > 0) && (
        <div className="text-xs text-muted-foreground">
          {duration && `Duration: ${duration}ms`}
          {duration && ageMinutes > 0 && ' • '}
          {ageMinutes > 0 && `${ageMinutes} min ago`}
        </div>
      )}
      
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs">
          {getStatusIcon()}
          <span className="ml-1 capitalize">
            {refreshStatus.replace('_', ' ')}
          </span>
        </Badge>
        {recordCount && (
          <Badge variant="outline" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            {recordCount.toLocaleString()} records
          </Badge>
        )}
      </div>
    </div>
  );
};

export default RefreshStatusIndicator;