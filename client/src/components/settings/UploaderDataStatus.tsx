import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, CheckCircle, AlertCircle, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface UploaderMetrics {
  lastUploadDate?: string;
  lastCompletedUpload?: string;
  totalFiles: number;
  completedFiles: number;
  recentFiles: number;
  newDataReady: boolean;
  storageService: string;
  lastProcessingDate?: string;
}

const UploaderDataStatus = () => {
  // Query uploader dashboard metrics
  const { data: uploaderMetrics, isLoading } = useQuery({
    queryKey: ['/api/uploader/dashboard-metrics'],
    queryFn: async () => {
      const response = await fetch('/api/uploader/dashboard-metrics');
      if (!response.ok) {
        // If 404, return default values
        if (response.status === 404) {
          return {
            totalFiles: 0,
            completedFiles: 0,
            recentFiles: 0,
            newDataReady: false,
            storageService: 'Unknown'
          };
        }
        throw new Error('Failed to fetch uploader metrics');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  // Query last TDDF JSON processing datetime
  const { data: lastProcessingData } = useQuery({
    queryKey: ['/api/tddf-json/last-processing-datetime'],
    queryFn: async () => {
      const response = await fetch('/api/tddf-json/last-processing-datetime');
      if (!response.ok) throw new Error('Failed to fetch last processing datetime');
      return response.json();
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-blue-600">
        <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        Loading uploader status...
      </div>
    );
  }

  const metrics = uploaderMetrics as UploaderMetrics;
  const hasRecentData = metrics?.recentFiles > 0;
  const dataReadyStatus = metrics?.newDataReady || hasRecentData;

  return (
    <div className="space-y-3">
      {/* Status Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <Upload className="h-4 w-4 text-blue-600" />
          <div className="text-sm">
            <div className="font-medium text-blue-900">Total Files</div>
            <div className="text-blue-700">{metrics?.totalFiles || 0} uploaded</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <div className="text-sm">
            <div className="font-medium text-blue-900">Completed</div>
            <div className="text-green-700">{metrics?.completedFiles || 0} processed</div>
          </div>
        </div>
      </div>

      {/* New Data Ready Flag */}
      <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-200">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${dataReadyStatus ? 'bg-green-500' : 'bg-gray-400'}`}></div>
          <span className="text-sm font-medium text-blue-900">New Data Ready</span>
        </div>
        <Badge variant={dataReadyStatus ? "default" : "secondary"} className={dataReadyStatus ? "bg-green-500" : ""}>
          {dataReadyStatus ? "Yes" : "No"}
        </Badge>
      </div>

      {/* Last Upload Date */}
      {(metrics?.lastUploadDate || metrics?.lastCompletedUpload) && (
        <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-200">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">Last Upload</span>
          </div>
          <div className="text-sm text-blue-700">
            {new Date(metrics.lastUploadDate || metrics.lastCompletedUpload!).toLocaleString('en-US', {
              timeZone: 'America/Chicago',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })} CST
          </div>
        </div>
      )}

      {/* Last Processing Date */}
      {lastProcessingData?.lastProcessingDateTime && (
        <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-200">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium text-blue-900">Last Processing</span>
          </div>
          <div className="text-sm text-purple-700">
            {new Date(lastProcessingData.lastProcessingDateTime).toLocaleString('en-US', {
              timeZone: 'America/Chicago',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            })} CST
          </div>
        </div>
      )}

      {/* Storage Service */}
      {metrics?.storageService && (
        <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-200">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-600 rounded-sm flex items-center justify-center">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
            <span className="text-sm font-medium text-blue-900">Storage</span>
          </div>
          <Badge variant="outline" className="text-blue-700 border-blue-300">
            {metrics.storageService}
          </Badge>
        </div>
      )}

      {/* Recent Activity Indicator */}
      {metrics?.recentFiles > 0 && (
        <div className="flex items-center justify-between p-2 bg-green-50 rounded border border-green-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-900">Recent Activity</span>
          </div>
          <div className="text-sm text-green-700">
            {metrics.recentFiles} new files in last 24h
          </div>
        </div>
      )}
    </div>
  );
};

export default UploaderDataStatus;