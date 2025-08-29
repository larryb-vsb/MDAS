import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Activity, Clock, Database, FileText, RefreshCw, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { formatDistanceToNow } from 'date-fns';

interface ProcessingStatus {
  activeProcessing: boolean;
  currentFile?: {
    id: string;
    filename: string;
    currentPhase: string;
    progress?: number;
    startTime?: string;
    estimatedCompletion?: string;
  };
  queuedFiles: number;
  recentlyCompleted: number;
  systemStatus: 'healthy' | 'busy' | 'error';
  tddfRecordsCount: number;
  lastActivity?: string;
}

const ProcessingMonitor: React.FC = () => {
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch processing status
  const { data: processingStatus, refetch, isLoading } = useQuery<ProcessingStatus>({
    queryKey: ['/api/uploader/processing-status'],
    queryFn: () => apiRequest('/api/uploader/processing-status'),
    refetchInterval: autoRefresh ? 3000 : false, // Refresh every 3 seconds when auto-refresh is on
    enabled: true
  });

  // Fetch recent uploads for active processing detection
  const { data: uploads } = useQuery({
    queryKey: ['/api/uploader'],
    queryFn: () => apiRequest('/api/uploader?limit=20'),
    refetchInterval: autoRefresh ? 3000 : false
  });

  // Calculate derived status from uploads data
  const activeFiles = uploads?.uploads?.filter((u: any) => 
    ['encoding', 'processing', 'uploading'].includes(u.currentPhase)
  ) || [];

  const recentlyCompleted = uploads?.uploads?.filter((u: any) => 
    ['completed', 'encoded'].includes(u.currentPhase) && 
    u.lastUpdated && 
    new Date(u.lastUpdated) > new Date(Date.now() - 60 * 60 * 1000) // Last hour
  ) || [];

  const queuedFiles = uploads?.uploads?.filter((u: any) => 
    ['uploaded', 'identified'].includes(u.currentPhase)
  ) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'busy': return 'text-blue-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getPhaseIcon = (phase: string) => {
    switch (phase) {
      case 'encoding': return Database;
      case 'processing': return Zap;
      case 'uploading': return FileText;
      default: return Activity;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Real-Time Processing Monitor</h3>
          <p className="text-sm text-muted-foreground">
            Live monitoring of TDDF file processing on King server
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className="h-4 w-4 mr-2" />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
        </div>
      </div>

      {/* System Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Processing</p>
                <p className="text-2xl font-bold text-blue-600">{activeFiles.length}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Queued Files</p>
                <p className="text-2xl font-bold text-orange-600">{queuedFiles.length}</p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Recently Completed</p>
                <p className="text-2xl font-bold text-green-600">{recentlyCompleted.length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">King Server Status</p>
                <p className="text-sm font-semibold text-green-600">Connected</p>
              </div>
              <Database className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Processing Details */}
      {activeFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Active Processing
            </CardTitle>
            <CardDescription>
              Files currently being processed on the King server
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeFiles.map((file: any) => {
                const Icon = getPhaseIcon(file.currentPhase);
                return (
                  <div key={file.id} className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-medium">{file.filename}</div>
                        <div className="text-sm text-muted-foreground">
                          {file.fileSize && `${Math.round(file.fileSize / 1024 / 1024 * 100) / 100} MB`}
                          {file.lineCount && ` • ${file.lineCount.toLocaleString()} lines`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="bg-blue-100 text-blue-800">
                        {file.currentPhase}
                      </Badge>
                      {file.lastUpdated && (
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(file.lastUpdated))} ago
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Queue Status */}
      {queuedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Processing Queue
            </CardTitle>
            <CardDescription>
              Files waiting to be processed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {queuedFiles.slice(0, 5).map((file: any) => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-orange-600" />
                    <div>
                      <div className="font-medium text-sm">{file.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {file.finalFileType?.toUpperCase()} • {file.fileSize && `${Math.round(file.fileSize / 1024 / 1024 * 100) / 100} MB`}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-orange-100 text-orange-800">
                    {file.currentPhase}
                  </Badge>
                </div>
              ))}
              {queuedFiles.length > 5 && (
                <div className="text-center text-sm text-muted-foreground pt-2">
                  ... and {queuedFiles.length - 5} more files in queue
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Completions */}
      {recentlyCompleted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              Recently Completed
            </CardTitle>
            <CardDescription>
              Files completed in the last hour
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentlyCompleted.slice(0, 3).map((file: any) => (
                <div key={file.id} className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <div>
                      <div className="font-medium text-sm">{file.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {file.jsonRecordsCreated && `${file.jsonRecordsCreated} records created`}
                        {file.encodingComplete && ` • Completed ${formatDistanceToNow(new Date(file.encodingComplete))} ago`}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-green-100 text-green-800">
                    {file.currentPhase}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {activeFiles.length === 0 && queuedFiles.length === 0 && recentlyCompleted.length === 0 && (
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <Activity className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Active Processing</h3>
              <p className="text-gray-500">
                Upload TDDF files to see real-time processing status here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Footer */}
      <div className="text-center text-xs text-muted-foreground">
        {autoRefresh && `Auto-refreshing every 3 seconds • `}
        Last updated: {new Date().toLocaleTimeString()} • King Server Connected
      </div>
    </div>
  );
};

export default ProcessingMonitor;