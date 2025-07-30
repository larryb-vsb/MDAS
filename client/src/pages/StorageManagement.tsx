import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Database, HardDrive, Trash2, Search, RefreshCw, FileX, CheckCircle, Clock, Activity } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface MasterObjectStats {
  masterKeys: {
    totalObjects: number;
    linkedToUploads: number;
    processingComplete: number;
    orphanedObjects: number;
    markedForPurge: number;
    totalStorageBytes: number;
    totalStorageMB: number;
    totalLines: number;
  };
  purgeQueue: {
    totalQueued: number;
    orphanedQueued: number;
    expiredQueued: number;
    readyForPurge: number;
    alreadyPurged: number;
  };
  recentActivity: Array<{
    date: string;
    objects_created: number;
  }>;
  lastUpdated: string;
}

interface MasterObjectKey {
  id: string;
  object_key: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  line_count: number;
  upload_id?: string;
  current_phase: string;
  processing_status: string;
  marked_for_purge: boolean;
  created_at: string;
  last_accessed_at?: string;
  last_modified_at?: string;
  purge_after_date?: string;
}

interface MasterObjectList {
  objects: MasterObjectKey[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  filters: {
    status: string;
    search: string;
  };
  lastUpdated: string;
}

export default function StorageManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(0);
  const [scanRunning, setScanRunning] = useState(false);
  const [purgeRunning, setPurgeRunning] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get storage statistics
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['/api/storage/master-keys/stats'],
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  // Get master object keys list
  const { data: objectsList, isLoading: listLoading, refetch: refetchList } = useQuery({
    queryKey: ['/api/storage/master-keys/list', {
      limit: 50,
      offset: currentPage * 50,
      status: statusFilter,
      search: searchTerm
    }]
  });

  // Scan for orphaned objects mutation
  const scanMutation = useMutation({
    mutationFn: () => apiRequest('/api/storage/master-keys/scan-orphaned', {
      method: 'POST'
    }),
    onSuccess: () => {
      toast({
        title: "Scan Complete",
        description: "Orphaned object scan completed successfully"
      });
      refetchStats();
      refetchList();
      setScanRunning(false);
    },
    onError: (error: any) => {
      toast({
        title: "Scan Failed",
        description: error.message || "Failed to scan for orphaned objects",
        variant: "destructive"
      });
      setScanRunning(false);
    }
  });

  // Purge operation mutation
  const purgeMutation = useMutation({
    mutationFn: (dryRun: boolean) => apiRequest('/api/storage/master-keys/purge', {
      method: 'POST',
      body: JSON.stringify({ dryRun })
    }),
    onSuccess: (data: any) => {
      toast({
        title: data.dryRun ? "Dry Run Complete" : "Purge Complete",
        description: data.message
      });
      refetchStats();
      refetchList();
      setPurgeRunning(false);
    },
    onError: (error: any) => {
      toast({
        title: "Purge Failed",
        description: error.message || "Failed to execute purge operation",
        variant: "destructive"
      });
      setPurgeRunning(false);
    }
  });

  const handleScan = () => {
    setScanRunning(true);
    scanMutation.mutate();
  };

  const handlePurge = (dryRun: boolean) => {
    setPurgeRunning(true);
    purgeMutation.mutate(dryRun);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'bg-green-100 text-green-800';
      case 'orphaned': return 'bg-orange-100 text-orange-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'purged': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Storage Management</h1>
          <p className="text-muted-foreground">
            Master object keys database and orphaned storage cleanup system
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => refetchStats()}
            variant="outline"
            size="sm"
            disabled={statsLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${statsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="objects">Objects</TabsTrigger>
          <TabsTrigger value="purge">Purge Queue</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="bg-gray-100 h-20"></CardHeader>
                  <CardContent className="bg-gray-50 h-24"></CardContent>
                </Card>
              ))}
            </div>
          ) : stats ? (
            <>
              {/* Master Keys Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Objects</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.masterKeys.totalObjects.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.masterKeys.linkedToUploads} linked to uploads
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats.masterKeys.totalStorageMB.toFixed(1)} MB</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.masterKeys.totalLines.toLocaleString()} total lines
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Orphaned Objects</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">{stats.masterKeys.orphanedObjects}</div>
                    <p className="text-xs text-muted-foreground">
                      {stats.masterKeys.markedForPurge} marked for purge
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Processing Status</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{stats.masterKeys.processingComplete}</div>
                    <p className="text-xs text-muted-foreground">
                      Complete processing
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Purge Queue Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5" />
                    Purge Queue Status
                  </CardTitle>
                  <CardDescription>
                    Objects scheduled for deletion and purge operations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold">{stats.purgeQueue.totalQueued}</div>
                      <p className="text-sm text-muted-foreground">Total Queued</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">{stats.purgeQueue.orphanedQueued}</div>
                      <p className="text-sm text-muted-foreground">Orphaned</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{stats.purgeQueue.expiredQueued}</div>
                      <p className="text-sm text-muted-foreground">Expired</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{stats.purgeQueue.readyForPurge}</div>
                      <p className="text-sm text-muted-foreground">Ready</p>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-600">{stats.purgeQueue.alreadyPurged}</div>
                      <p className="text-sm text-muted-foreground">Purged</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              {stats.recentActivity.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity (Last 7 Days)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {stats.recentActivity.map((activity) => (
                        <div key={activity.date} className="flex justify-between items-center">
                          <span>{formatDate(activity.date)}</span>
                          <Badge variant="outline">{activity.objects_created} objects created</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-32">
                <p className="text-muted-foreground">No statistics available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="objects" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Object Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search by filename or object key..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="complete">Complete</SelectItem>
                    <SelectItem value="orphaned">Orphaned</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="purged">Purged</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => refetchList()} variant="outline">
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Objects List */}
          <Card>
            <CardHeader>
              <CardTitle>Master Object Keys</CardTitle>
              <CardDescription>
                {objectsList ? `${objectsList.pagination.total} total objects` : 'Loading...'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {listLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse bg-gray-100 h-16 rounded"></div>
                  ))}
                </div>
              ) : objectsList?.objects.length ? (
                <div className="space-y-4">
                  {objectsList.objects.map((obj) => (
                    <div key={obj.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate max-w-md">{obj.original_filename}</span>
                          <Badge className={getStatusColor(obj.processing_status)}>
                            {obj.processing_status}
                          </Badge>
                          {obj.marked_for_purge && (
                            <Badge variant="destructive">
                              <Trash2 className="w-3 h-3 mr-1" />
                              Marked for Purge
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{formatFileSize(obj.file_size)}</span>
                          <span>{obj.line_count.toLocaleString()} lines</span>
                          <span>{formatDate(obj.created_at)}</span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <span className="font-mono bg-gray-100 px-2 py-1 rounded text-xs">
                          {obj.object_key}
                        </span>
                        {obj.upload_id && (
                          <span className="ml-4">
                            Upload ID: {obj.upload_id}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Pagination */}
                  {objectsList.pagination.hasMore && (
                    <div className="flex justify-center pt-4">
                      <Button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        variant="outline"
                      >
                        Load More
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileX className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No objects found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Scan Operations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5" />
                  Orphaned Object Scan
                </CardTitle>
                <CardDescription>
                  Scan storage for objects without database links and populate master object keys
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This operation will scan object storage for files that exist in storage but have no 
                  corresponding database records. Found orphaned objects will be added to the master 
                  object keys database and marked for cleanup.
                </p>
                <Button 
                  onClick={handleScan}
                  disabled={scanRunning}
                  className="w-full"
                >
                  {scanRunning ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Start Scan
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Purge Operations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Purge Operations
                </CardTitle>
                <CardDescription>
                  Clean up orphaned objects and expired files from storage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Execute purge operations to permanently delete objects marked for removal. 
                  Use dry run to preview what would be deleted without making changes.
                </p>
                <div className="space-y-2">
                  <Button 
                    onClick={() => handlePurge(true)}
                    disabled={purgeRunning}
                    variant="outline"
                    className="w-full"
                  >
                    {purgeRunning ? (
                      <>
                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Dry Run (Preview)
                      </>
                    )}
                  </Button>
                  <Button 
                    onClick={() => handlePurge(false)}
                    disabled={purgeRunning}
                    variant="destructive"
                    className="w-full"
                  >
                    {purgeRunning ? (
                      <>
                        <Clock className="w-4 h-4 mr-2 animate-spin" />
                        Running...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Execute Purge
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <Database className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="font-medium">Database</p>
                  <p className="text-sm text-green-600">Connected</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <HardDrive className="w-8 h-8 mx-auto mb-2 text-blue-500" />
                  <p className="font-medium">Object Storage</p>
                  <p className="text-sm text-blue-600">Available</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <Activity className="w-8 h-8 mx-auto mb-2 text-purple-500" />
                  <p className="font-medium">Processing</p>
                  <p className="text-sm text-purple-600">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}