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
  // DATA ISOLATION: Query ONLY from Uploader Page Pre-Cache table 
  // This ensures instant loading and no dynamic processing interference
  const { data: uploaderMetrics, isLoading } = useQuery({
    queryKey: ['/api/uploader/pre-cache-metrics'],
    queryFn: async () => {
      const response = await fetch('/api/uploader/pre-cache-metrics');
      if (!response.ok) {
        // If 404, return default values
        if (response.status === 404) {
          return {
            totalFiles: 0,
            completedFiles: 0,
            recentFiles: 0,
            newDataReady: false,
            storageService: 'Replit Object Storage',
            lastUploadDate: null,
            lastCompletedUpload: null,
            lastProcessingDate: null
          };
        }
        throw new Error('Failed to fetch uploader pre-cache metrics');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds - faster refresh for pre-cached data
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  // Get Last New Data Date from uploader page API - fallback for when pre-cache is empty
  const { data: lastNewDataDate } = useQuery({
    queryKey: ['/api/uploader/last-new-data-date'],
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000, // Refresh every minute
  });

  // DATA ISOLATION: No separate processing date query - all data comes from pre-cache table

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

  // Calculate session control monitoring values from pre-cache data
  const totalSessions = metrics?.totalFiles || 0;
  const uploadedFiles = metrics?.completedFiles || 0;
  const activeUploads = 0; // Will be populated from pre-cache data
  const pendingSessions = Math.max(totalSessions - uploadedFiles, 0);

  return (
    <div className="space-y-3">
      {/* Session Control Monitoring - 4 main cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Total Sessions */}
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-center">
          <div className="text-2xl font-bold text-blue-900">{totalSessions}</div>
          <div className="text-sm text-blue-700">Total Sessions</div>
        </div>
        
        {/* Uploaded Files */}
        <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-center">
          <div className="text-2xl font-bold text-green-900">{uploadedFiles}</div>
          <div className="text-sm text-green-700">Uploaded Files</div>
        </div>
        
        {/* Active Uploads */}
        <div className="p-3 bg-purple-50 rounded-lg border border-purple-200 text-center">
          <div className="text-2xl font-bold text-purple-900">{activeUploads}</div>
          <div className="text-sm text-purple-700">Active Uploads</div>
        </div>
        
        {/* Pending Sessions */}
        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200 text-center">
          <div className="text-2xl font-bold text-orange-900">{pendingSessions}</div>
          <div className="text-sm text-orange-700">Pending Sessions</div>
        </div>
      </div>

      {/* Last New Data Date - Always show green box with fallback data */}
      <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-center">
        {(() => {
          // Use pre-cache data first, then fallback to uploader page API
          const dateToUse = metrics?.lastUploadDate || metrics?.lastCompletedUpload || (lastNewDataDate as any)?.date;
          
          if (dateToUse) {
            return (
              <>
                <div className="text-lg font-bold text-green-900">
                  {new Date(dateToUse).toLocaleDateString('en-US', {
                    timeZone: 'America/Chicago',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}, {new Date(dateToUse).toLocaleTimeString('en-US', {
                    timeZone: 'America/Chicago',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  })}
                </div>
                <div className="text-sm text-green-700">Last New Data Date</div>
                <div className="text-xs text-green-600">({totalSessions} total uploads)</div>
              </>
            );
          } else {
            return (
              <>
                <div className="text-lg font-bold text-green-900">No Data Available</div>
                <div className="text-sm text-green-700">Last New Data Date</div>
                <div className="text-xs text-green-600">(0 total uploads)</div>
              </>
            );
          }
        })()}
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
      {metrics?.lastProcessingDate && (
        <div className="flex items-center justify-between p-2 bg-white rounded border border-blue-200">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium text-blue-900">Last Processing</span>
          </div>
          <div className="text-sm text-purple-700">
            {new Date(metrics.lastProcessingDate).toLocaleString('en-US', {
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