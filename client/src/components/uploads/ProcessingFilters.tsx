import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, FileText, Filter, RefreshCw, Activity, CheckCircle, AlertCircle, Upload } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ProcessingStatusData {
  uploads: any[];
  processorStatus: {
    isRunning: boolean;
    currentlyProcessingFile?: any;
    queuedFiles: any[];
  };
  filters: {
    status: string[];
    fileType: string[];
    sortBy: string[];
  };
}

interface QueueStatusData {
  queuedFiles: any[];
  currentlyProcessing?: any;
  recentlyCompleted: any[];
  queueLength: number;
  estimatedWaitTime: number;
}

export default function ProcessingFilters() {
  const [activeStatusFilter, setActiveStatusFilter] = useState('all');
  const [activeFileTypeFilter, setActiveFileTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('uploadDate');

  // Fetch processing status with filters
  const { data: processingData, isLoading, refetch } = useQuery<ProcessingStatusData>({
    queryKey: ["/api/uploads/processing-status", activeStatusFilter, activeFileTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: activeStatusFilter,
        fileType: activeFileTypeFilter,
        limit: '20'
      });
      const response = await fetch(`/api/uploads/processing-status?${params}`);
      return response.json();
    },
    refetchInterval: 5000, // Update every 5 seconds
  });

  // Fetch queue status
  const { data: queueData } = useQuery<QueueStatusData>({
    queryKey: ["/api/uploads/queue-status"],
    refetchInterval: 2000, // Update every 2 seconds for real-time queue info
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/10 text-green-700 border-green-200';
      case 'processing': return 'bg-blue-500/10 text-blue-700 border-blue-200';
      case 'queued': return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
      case 'error': return 'bg-red-500/10 text-red-700 border-red-200';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-3 w-3" />;
      case 'processing': return <RefreshCw className="h-3 w-3 animate-spin" />;
      case 'queued': return <Clock className="h-3 w-3" />;
      case 'error': return <AlertCircle className="h-3 w-3" />;
      default: return <FileText className="h-3 w-3" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time Processing Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Activity className="mr-2 h-4 w-4" />
              Processing Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Processor:</span>
                <Badge variant={processingData?.processorStatus?.isRunning ? "outline" : "secondary"}>
                  {processingData?.processorStatus?.isRunning ? 
                    <span className="flex items-center"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Running</span> : 
                    "Idle"
                  }
                </Badge>
              </div>
              {processingData?.processorStatus?.currentlyProcessingFile && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Current:</span>
                  <div className="font-medium truncate">
                    {processingData.processorStatus.currentlyProcessingFile.originalFilename}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <Clock className="mr-2 h-4 w-4" />
              Queue Status
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Files in Queue:</span>
                <span className="font-medium">{queueData?.queueLength || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs text-muted-foreground">Est. Wait:</span>
                <span className="text-xs">{Math.round((queueData?.estimatedWaitTime || 0) / 60)}m</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center">
              <CheckCircle className="mr-2 h-4 w-4" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1">
              {queueData?.recentlyCompleted.slice(0, 2).map((file) => (
                <div key={file.id} className="text-xs">
                  <div className="truncate font-medium">{file.originalFilename}</div>
                  <div className="text-muted-foreground">
                    {file.processingCompletedAt ? 
                      formatDistanceToNow(new Date(file.processingCompletedAt), { addSuffix: true }) :
                      'Recently'
                    }
                  </div>
                </div>
              )) || <div className="text-xs text-muted-foreground">No recent activity</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-medium flex items-center">
              <Filter className="mr-2 h-5 w-5" />
              Processing Filters
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeStatusFilter} onValueChange={setActiveStatusFilter}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="all">All Files</TabsTrigger>
              <TabsTrigger value="queued">Queued</TabsTrigger>
              <TabsTrigger value="processing">Processing</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="error">Errors</TabsTrigger>
            </TabsList>

            <div className="flex gap-4 mt-4">
              <Select value={activeFileTypeFilter} onValueChange={setActiveFileTypeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="File Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="merchant">Merchant Files</SelectItem>
                  <SelectItem value="transaction">Transaction Files</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uploadDate">Upload Date</SelectItem>
                  <SelectItem value="processedDate">Processed Date</SelectItem>
                  <SelectItem value="filename">Filename</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <TabsContent value={activeStatusFilter} className="mt-6">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  {(!processingData?.uploads || processingData.uploads.length === 0) ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Upload className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No files found matching the current filters</p>
                    </div>
                  ) : (
                    processingData.uploads.map((file) => (
                      <Card key={file.id} className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium truncate">{file.originalFilename}</h3>
                              <Badge variant="outline" className="text-xs">
                                {file.fileType}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                              <span>Uploaded: {formatDistanceToNow(new Date(file.uploadedAt), { addSuffix: true })}</span>
                              {file.processedAt && (
                                <span>Processed: {formatDistanceToNow(new Date(file.processedAt), { addSuffix: true })}</span>
                              )}
                              {file.processingStartedAt && !file.processedAt && (
                                <span>Started: {formatDistanceToNow(new Date(file.processingStartedAt), { addSuffix: true })}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={`${getStatusColor(file.processingStatus)} flex items-center gap-1`}>
                              {getStatusIcon(file.processingStatus)}
                              {file.processingStatus || 'queued'}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}