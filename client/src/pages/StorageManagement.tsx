import { apiRequest, useQueryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { 
  Database, 
  HardDrive, 
  Activity, 
  AlertTriangle, 
  AlertCircle,
  RefreshCw, 
  Clock, 
  Trash2, 
  Search,
  ChevronLeft,
  ChevronRight,
  Copy,
  CheckCircle
} from "lucide-react";
import { useState } from 'react';
import { useMutation, useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import TddfObjectTotals from "@/components/storage/TddfObjectTotals";
import StorageObjectProcessor from "@/components/storage/StorageObjectProcessor";

// TypeScript interfaces for Storage Management
interface StorageStats {
  masterKeys: {
    totalObjects: number;
    linkedToUploads: number;
    totalStorageMB: number;
    totalLines: number;
    orphanedObjects: number;
    markedForPurge: number;
    processingComplete: number;
  };
  purgeQueue: {
    totalQueued: number;
    totalSizeMB: number;
    oldestEntry: string;
    newestEntry: string;
    avgSizeMB: number;
  };
  recentActivity: Array<{
    action: string;
    objectKey: string;
    timestamp: string;
  }>;
}

interface StorageObject {
  id: string;
  objectKey: string;
  fileSizeMB: string;
  lineCount: number;
  createdAt: string;
  status: string;
  uploadId?: string;
  currentPhase: string;
}

interface StorageList {
  objects: StorageObject[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface DuplicateObject {
  id: string;
  objectKey: string;
  fileSizeMB: string;
  lineCount: number;
  createdAt: string;
  uploadId?: string;
  currentPhase: string;
  isNewest: boolean;
}

interface DuplicateGroup {
  filename: string;
  occurrenceCount: number;
  potentialSavingsMB: string;
  objects: DuplicateObject[];
}

interface DuplicatesSummary {
  totalDuplicateGroups: number;
  totalDuplicateObjects: number;
  totalDuplicatesRemovable: number;
  totalSavingsBytes: number;
  totalSavingsMB: string;
  totalSavingsGB: string;
}

function DuplicatesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(new Set());
  const [isRemoving, setIsRemoving] = useState(false);

  // Query duplicate detection data
  const { data: duplicatesData, isLoading: duplicatesLoading, refetch: refetchDuplicates } = useQuery({
    queryKey: ['/api/storage/master-keys/duplicates'],
    queryFn: () => apiRequest('/api/storage/master-keys/duplicates')
  });

  // Remove duplicates mutation
  const removeDuplicatesMutation = useMutation({
    mutationFn: (objectIds: string[]) => apiRequest('/api/storage/master-keys/remove-duplicates', {
      method: 'POST',
      body: JSON.stringify({ objectIds })
    }),
    onSuccess: (data: any) => {
      toast({
        title: "Duplicates Removed",
        description: `Successfully removed ${data.removedCount} duplicate objects, saved ${data.spaceFreed}`
      });
      setSelectedForRemoval(new Set());
      refetchDuplicates();
      setIsRemoving(false);
    },
    onError: (error: any) => {
      toast({
        title: "Removal Failed",
        description: error.message || "Failed to remove duplicate objects",
        variant: "destructive"
      });
      setIsRemoving(false);
    }
  });

  const handleSelectObject = (objectId: string, checked: boolean) => {
    const newSelection = new Set(selectedForRemoval);
    if (checked) {
      newSelection.add(objectId);
    } else {
      newSelection.delete(objectId);
    }
    setSelectedForRemoval(newSelection);
  };

  const handleSelectAll = (group: DuplicateGroup, checked: boolean) => {
    const newSelection = new Set(selectedForRemoval);
    const removableObjects = group.objects.filter(obj => !obj.isNewest);
    
    if (checked) {
      removableObjects.forEach(obj => newSelection.add(obj.id));
    } else {
      removableObjects.forEach(obj => newSelection.delete(obj.id));
    }
    setSelectedForRemoval(newSelection);
  };

  const handleRemoveSelected = () => {
    if (selectedForRemoval.size === 0) return;
    
    setIsRemoving(true);
    removeDuplicatesMutation.mutate(Array.from(selectedForRemoval));
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

  if (duplicatesLoading) {
    return (
      <div className="space-y-6">
        <Card className="animate-pulse">
          <CardHeader className="bg-gray-100 h-20"></CardHeader>
          <CardContent className="bg-gray-50 h-32"></CardContent>
        </Card>
      </div>
    );
  }

  const duplicateGroups: DuplicateGroup[] = (duplicatesData as any)?.duplicateGroups || [];
  const summary: DuplicatesSummary = (duplicatesData as any)?.summary || {
    totalDuplicateGroups: 0,
    totalDuplicateObjects: 0,
    totalDuplicatesRemovable: 0,
    totalSavingsBytes: 0,
    totalSavingsMB: '0',
    totalSavingsGB: '0'
  };

  return (
    <div className="space-y-6">
      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duplicate Groups</CardTitle>
            <Copy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalDuplicateGroups}</div>
            <p className="text-xs text-muted-foreground">
              {summary.totalDuplicateObjects} total duplicates
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Removable Objects</CardTitle>
            <Trash2 className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{summary.totalDuplicatesRemovable}</div>
            <p className="text-xs text-muted-foreground">
              Safe to remove
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Savings</CardTitle>
            <HardDrive className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary.totalSavingsMB} MB</div>
            <p className="text-xs text-muted-foreground">
              {summary.totalSavingsGB} GB potential savings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Selected</CardTitle>
            <CheckCircle className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{selectedForRemoval.size}</div>
            <p className="text-xs text-muted-foreground">
              Objects marked for removal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => refetchDuplicates()}
            variant="outline"
            disabled={duplicatesLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${duplicatesLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRemoveSelected}
            variant="destructive"
            disabled={selectedForRemoval.size === 0 || isRemoving}
          >
            {isRemoving ? (
              <>
                <Clock className="w-4 h-4 mr-2 animate-spin" />
                Removing...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Remove Selected ({selectedForRemoval.size})
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Duplicate Groups */}
      {duplicateGroups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
            <h3 className="text-lg font-medium mb-2">No Duplicates Found</h3>
            <p className="text-muted-foreground">
              All storage objects are unique. No cleanup needed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {duplicateGroups.map((group, groupIndex) => (
            <Card key={groupIndex}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Copy className="w-5 h-5 text-orange-500" />
                      {group.filename}
                    </CardTitle>
                    <CardDescription>
                      {group.occurrenceCount} copies • Potential savings: {group.potentialSavingsMB}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={group.objects.filter(obj => !obj.isNewest).every(obj => selectedForRemoval.has(obj.id))}
                      onCheckedChange={(checked) => handleSelectAll(group, checked as boolean)}
                    />
                    <span className="text-sm text-muted-foreground">Select All Removable</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {group.objects.map((object, objIndex) => (
                    <div key={objIndex} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {object.isNewest ? (
                          <div className="w-5 h-5 flex items-center justify-center">
                            <AlertCircle className="w-4 h-4 text-green-500" />
                          </div>
                        ) : (
                          <Checkbox
                            checked={selectedForRemoval.has(object.id)}
                            onCheckedChange={(checked) => handleSelectObject(object.id, checked as boolean)}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {object.objectKey.split('/').pop()}
                            </p>
                            {object.isNewest && (
                              <Badge variant="secondary" className="bg-green-100 text-green-800">
                                Keep (Newest)
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {object.fileSizeMB} • {object.lineCount.toLocaleString()} lines • {formatDate(object.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className={object.currentPhase === 'encoded' ? 'bg-green-50' : 'bg-blue-50'}>
                          {object.currentPhase}
                        </Badge>
                        {object.uploadId && (
                          <span className="font-mono">{object.uploadId.split('_')[1]?.slice(0, 8)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StorageManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [scanRunning, setScanRunning] = useState(false);
  const [purgeRunning, setPurgeRunning] = useState(false);
  
  // Group selection and delete state
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

  // Stats query
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['/api/storage/master-keys/stats'],
    queryFn: () => apiRequest('/api/storage/master-keys/stats')
  });

  // Objects list query
  const { data: objectsData, isLoading: objectsLoading, refetch: refetchList } = useQuery({
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

  // Delete selected objects mutation
  const deleteObjectsMutation = useMutation({
    mutationFn: (objectIds: string[]) => apiRequest('/api/storage/master-keys/delete-objects', {
      method: 'POST',
      body: JSON.stringify({ objectIds })
    }),
    onSuccess: (data: any) => {
      toast({
        title: "Objects Deleted",
        description: `Successfully deleted ${data.deletedCount} storage objects`
      });
      setSelectedObjects(new Set());
      refetchStats();
      refetchList();
      setIsDeleting(false);
      setShowDeleteConfirmation(false);
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete storage objects",
        variant: "destructive"
      });
      setIsDeleting(false);
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

  // Selection handlers
  const handleSelectObject = (objectId: string, checked: boolean) => {
    const newSelection = new Set(selectedObjects);
    if (checked) {
      newSelection.add(objectId);
    } else {
      newSelection.delete(objectId);
    }
    setSelectedObjects(newSelection);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && objectsList?.objects) {
      setSelectedObjects(new Set(objectsList.objects.map(obj => obj.id)));
    } else {
      setSelectedObjects(new Set());
    }
  };

  const handleDeleteSelected = () => {
    if (selectedObjects.size > 0) {
      setShowDeleteConfirmation(true);
    }
  };

  const confirmDelete = () => {
    setIsDeleting(true);
    deleteObjectsMutation.mutate(Array.from(selectedObjects));
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

  const storageStats = (stats as any) as StorageStats;
  const objectsList = objectsData as StorageList || { objects: [], pagination: { total: 0, page: 0, limit: 0, totalPages: 0 } };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Storage Management</h1>
          <p className="text-muted-foreground">
            Master object keys database and orphaned storage cleanup system
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              refetchStats();
              refetchList();
            }}
            variant="outline"
            disabled={statsLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${statsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="objects">Objects</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
          <TabsTrigger value="purge">Purge Queue</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* TDDF Object Totals Section */}
          <TddfObjectTotals />
          
          {/* Storage Object Processor Section */}
          <StorageObjectProcessor />
          
          {statsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="bg-gray-100 h-20"></CardHeader>
                  <CardContent className="bg-gray-50 h-24"></CardContent>
                </Card>
              ))}
            </div>
          ) : storageStats ? (
            <>
              {/* Master Keys Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Objects</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{storageStats.masterKeys.totalObjects.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      {storageStats.masterKeys.linkedToUploads} linked to uploads
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{storageStats.masterKeys.totalStorageMB.toFixed(1)} MB</div>
                    <p className="text-xs text-muted-foreground">
                      {storageStats.masterKeys.totalLines.toLocaleString()} total lines
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Orphaned Objects</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">{storageStats.masterKeys.orphanedObjects}</div>
                    <p className="text-xs text-muted-foreground">
                      {storageStats.masterKeys.markedForPurge} marked for purge
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Processing Status</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{storageStats.masterKeys.processingComplete}</div>
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
                    <Trash2 className="w-5 h-5 text-orange-500" />
                    Purge Queue Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{storageStats.purgeQueue.totalQueued}</div>
                      <p className="text-sm text-muted-foreground">Objects queued</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold">{storageStats.purgeQueue.totalSizeMB?.toFixed(1) || '0.0'} MB</div>
                      <p className="text-sm text-muted-foreground">Total size</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold">{storageStats.purgeQueue.avgSizeMB?.toFixed(1) || '0.0'} MB</div>
                      <p className="text-sm text-muted-foreground">Average size</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-500" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {storageStats.recentActivity.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No recent activity</p>
                  ) : (
                    <div className="space-y-2">
                      {storageStats.recentActivity.map((activity, index) => (
                        <div key={index} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <span className="font-medium">{activity.action}</span>
                            <p className="text-sm text-muted-foreground truncate max-w-md">
                              {activity.objectKey}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(activity.timestamp)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">No statistics available</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="duplicates" className="space-y-6">
          <DuplicatesTab />
        </TabsContent>

        <TabsContent value="objects" className="space-y-6">
          {/* Filters and Group Actions */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search objects..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
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
            </div>

            {/* Group Selection Controls */}
            {objectsList?.objects && objectsList.objects.length > 0 && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <Checkbox
                    checked={selectedObjects.size === objectsList.objects.length && objectsList.objects.length > 0}
                    onCheckedChange={handleSelectAll}
                  />
                  <span className="text-sm font-medium">
                    {selectedObjects.size === 0 
                      ? `Select All (${objectsList.objects.length})` 
                      : `${selectedObjects.size} selected`}
                  </span>
                </div>
                {selectedObjects.size > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                    disabled={isDeleting}
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Selected ({selectedObjects.size})
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Objects List */}
          {objectsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="h-16 bg-gray-50"></CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {(objectsList?.objects || []).map((obj) => (
                  <Card key={obj.id} className={selectedObjects.has(obj.id) ? 'ring-2 ring-blue-500' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <Checkbox
                          checked={selectedObjects.has(obj.id)}
                          onCheckedChange={(checked) => handleSelectObject(obj.id, checked as boolean)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {obj.objectKey}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {obj.fileSizeMB} • {obj.lineCount?.toLocaleString() || 'N/A'} lines • {formatDate(obj.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getStatusColor(obj.status)}>
                            {obj.status}
                          </Badge>
                          {obj.uploadId && (
                            <Badge variant="outline">
                              {obj.uploadId.split('_')[1]?.slice(0, 8)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {currentPage * 50 + 1} to {Math.min((currentPage + 1) * 50, objectsList.pagination?.total || 0)} of {objectsList.pagination?.total || 0} objects
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage >= (objectsList.pagination?.totalPages || 0) - 1}
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="purge" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Purge Queue Management</CardTitle>
              <CardDescription>
                Manage orphaned objects marked for permanent deletion
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Objects in the purge queue are no longer accessible and can be safely deleted to free up storage space.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handlePurge(true)}
                  variant="outline"
                  disabled={purgeRunning}
                >
                  {purgeRunning ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Dry Run
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handlePurge(false)}
                  variant="destructive"
                  disabled={purgeRunning}
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
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
          {/* Scan Operations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Orphaned Object Detection</CardTitle>
                <CardDescription>
                  Scan for storage objects that are no longer linked to uploaded files
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={handleScan}
                  disabled={scanRunning}
                  className="w-full"
                >
                  {scanRunning ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
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
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Selected Objects</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedObjects.size} selected storage object{selectedObjects.size !== 1 ? 's' : ''}? 
              This action cannot be undone and will permanently remove the objects from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <Clock className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete {selectedObjects.size} Object{selectedObjects.size !== 1 ? 's' : ''}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </MainLayout>
  );
}