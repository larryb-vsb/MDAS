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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  CheckCircle,
  FileText,
  Archive,
  RotateCcw,
  ClipboardCheck,
  XCircle
} from "lucide-react";
import { useState } from 'react';
import { useMutation, useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { BusinessDayHeatmap } from "@/components/storage/BusinessDayHeatmap";

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
    archivedCount: number;
    failedCount: number;
  };
  purgeQueue: {
    totalQueued: number;
    totalSizeMB: number;
    oldestEntry: string;
    newestEntry: string;
    avgSizeMB: number;
  };
  archiveStats: {
    totalArchived: number;
    totalSizeMB: number;
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
  filename?: string;
  fileSizeMB: string;
  lineCount: number;
  createdAt: string;
  status: string;
  uploadId?: string;
  currentPhase: string;
  fileType?: string;
  businessDay?: string;
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

function getFileTypeBadge(filename: string): { label: string; color: string } {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv')) {
    if (lower.includes('merchantbatch') || lower.includes('merchantdem') || lower.includes('client')) {
      return { label: 'csv', color: 'bg-green-100 text-green-700' };
    }
    if (lower.includes('ah0314') || lower.includes('ach')) {
      return { label: 'ach', color: 'bg-purple-100 text-purple-700' };
    }
    return { label: 'csv', color: 'bg-green-100 text-green-700' };
  }
  if (lower.endsWith('.tsyso')) {
    return { label: 'tddf', color: 'bg-blue-100 text-blue-700' };
  }
  if (lower.includes('tddf') || lower.includes('_2400_')) {
    return { label: 'tddf', color: 'bg-blue-100 text-blue-700' };
  }
  if (lower.endsWith('.txt')) {
    return { label: 'txt', color: 'bg-gray-100 text-gray-700' };
  }
  return { label: 'file', color: 'bg-gray-100 text-gray-700' };
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
          <Button
            onClick={() => {
              const allRemovable = new Set<string>();
              duplicateGroups.forEach(group => {
                group.objects.filter(obj => !obj.isNewest).forEach(obj => {
                  allRemovable.add(obj.id);
                });
              });
              setSelectedForRemoval(allRemovable);
              toast({
                title: "What-If Analysis",
                description: `Selected ${allRemovable.size} removable duplicates (${summary.totalSavingsMB} MB potential savings)`
              });
            }}
            variant="secondary"
            disabled={duplicatesLoading || summary.totalDuplicatesRemovable === 0}
          >
            <Activity className="w-4 h-4 mr-2" />
            Run What-If
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
                            {object.fileSizeMB} • {(object.lineCount || 0).toLocaleString()} lines • {formatDate(object.createdAt)}
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

// Replit Storage Card Component
interface ReplitStorageInfo {
  bucketName: string;
  environment: string;
  folderPrefix: string;
  available: boolean;
  totalObjects: number;
  devUploaderObjects: number;
  prodUploaderObjects: number;
  databaseFiles: number;
  syncStatus: string;
  error?: string;
}

function ReplitStorageCard() {
  const { data: storageInfo, isLoading } = useQuery<ReplitStorageInfo>({
    queryKey: ['/api/storage/replit-storage-info']
  });

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="bg-gray-100 h-20"></CardHeader>
        <CardContent className="bg-gray-50 h-24"></CardContent>
      </Card>
    );
  }

  if (!storageInfo) {
    return null;
  }

  // Handle unavailable or error states
  if (!storageInfo.available || storageInfo.syncStatus === 'unavailable' || storageInfo.syncStatus === 'error') {
    return (
      <Card className="border-orange-200 bg-orange-50/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
            Replit Storage - Unavailable
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {storageInfo.error || 'Storage service is not configured or unavailable'}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-3 border rounded-lg bg-white">
              <div className="text-sm font-medium text-muted-foreground">
                Environment: <Badge variant="outline">{storageInfo.environment}</Badge>
              </div>
            </div>
            <div className="text-center p-3 border rounded-lg bg-white">
              <div className="text-sm font-medium text-muted-foreground">
                Bucket: {storageInfo.bucketName}
              </div>
            </div>
            <div className="text-center p-3 border rounded-lg bg-white">
              <Badge variant="destructive">
                {storageInfo.syncStatus === 'error' ? 'Error' : 'Unavailable'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine sync status badge
  let syncBadge;
  if (storageInfo.syncStatus === 'synced') {
    syncBadge = <Badge variant="default" className="text-sm bg-green-600">✓ Synced</Badge>;
  } else if (storageInfo.syncStatus === 'out-of-sync') {
    syncBadge = <Badge variant="destructive" className="text-sm">⚠ Out of Sync</Badge>;
  } else {
    syncBadge = <Badge variant="secondary" className="text-sm">Unknown</Badge>;
  }

  // Show environment-specific object count
  const currentEnvCount = storageInfo.environment === 'production' 
    ? storageInfo.prodUploaderObjects 
    : storageInfo.devUploaderObjects;

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          Replit Storage
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Bucket: {storageInfo.bucketName}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-3 border rounded-lg bg-white">
            <div className="text-2xl font-bold text-blue-600">{storageInfo.totalObjects}</div>
            <p className="text-xs text-muted-foreground">Total Object Storage</p>
            <p className="text-xs text-gray-500 mt-1">
              Dev: {storageInfo.devUploaderObjects} | Prod: {storageInfo.prodUploaderObjects}
            </p>
          </div>
          <div className="text-center p-3 border rounded-lg bg-white">
            <div className="text-2xl font-bold text-purple-600">{storageInfo.databaseFiles}</div>
            <p className="text-xs text-muted-foreground">Files (Database)</p>
            <p className="text-xs text-gray-500 mt-1">
              {storageInfo.environment} env
            </p>
          </div>
          <div className="text-center p-3 border rounded-lg bg-white">
            {syncBadge}
            <p className="text-xs text-muted-foreground mt-1">Sync Status</p>
            <p className="text-xs text-gray-500 mt-1">
              {currentEnvCount} in {storageInfo.environment}
            </p>
          </div>
          <div className="text-center p-3 border rounded-lg bg-white">
            <div className="text-sm font-medium text-muted-foreground">
              Environment: <Badge variant="outline">{storageInfo.environment}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Folder: {storageInfo.folderPrefix}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StorageManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState('all');
  const [businessDayFilter, setBusinessDayFilter] = useState('all');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [scanRunning, setScanRunning] = useState(false);
  const [purgeRunning, setPurgeRunning] = useState(false);
  
  // Group selection and delete state
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  const [selectedPurgeItems, setSelectedPurgeItems] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  
  // Audit state
  const [showAuditDialog, setShowAuditDialog] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditingId, setAuditingId] = useState<string | null>(null);

  // Stats query
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['/api/storage/master-keys/stats'],
    queryFn: () => apiRequest('/api/storage/master-keys/stats')
  });

  // Business days query for filter dropdown
  const { data: businessDaysData } = useQuery({
    queryKey: ['/api/storage/master-keys/business-days'],
    queryFn: () => apiRequest('/api/storage/master-keys/business-days')
  });

  const businessDays = (businessDaysData as any)?.businessDays || [];

  // Objects list query - build URL with params since default fetcher only uses queryKey[0]
  const objectsListParams = new URLSearchParams({
    limit: '50',
    offset: String(currentPage * 50),
    status: statusFilter,
    search: searchTerm,
    businessDay: businessDayFilter === 'all' ? '' : businessDayFilter,
    fileType: fileTypeFilter
  });
  const objectsListUrl = `/api/storage/master-keys/list?${objectsListParams.toString()}`;
  
  const { data: objectsData, isLoading: objectsLoading, refetch: refetchList } = useQuery({
    queryKey: ['/api/storage/master-keys/list', statusFilter, searchTerm, businessDayFilter, fileTypeFilter, currentPage]
  , queryFn: () => fetch(objectsListUrl, { credentials: 'include' }).then(res => res.json())
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

  // Purge queue query (soft-deleted items)
  const { data: purgeQueueData, refetch: refetchPurgeQueue } = useQuery({
    queryKey: ['/api/storage/master-keys/purge-queue']
  });
  const purgeQueueList = purgeQueueData as { objects: any[], total: number } | undefined;

  // Restore from purge queue mutation
  const restoreObjectsMutation = useMutation({
    mutationFn: (objectIds: string[]) => apiRequest('/api/storage/master-keys/restore-objects', {
      method: 'POST',
      body: JSON.stringify({ objectIds })
    }),
    onSuccess: (data: any) => {
      toast({
        title: "Objects Restored",
        description: data.message
      });
      refetchPurgeQueue();
      refetchStats();
      refetchList();
      setSelectedPurgeItems(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Restore Failed",
        description: error.message || "Failed to restore objects",
        variant: "destructive"
      });
    }
  });

  // Permanent delete from purge queue mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: (objectIds: string[]) => apiRequest('/api/storage/master-keys/permanent-delete', {
      method: 'POST',
      body: JSON.stringify({ objectIds })
    }),
    onSuccess: (data: any) => {
      toast({
        title: "Permanently Deleted",
        description: data.message
      });
      refetchPurgeQueue();
      refetchStats();
      setSelectedPurgeItems(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to permanently delete objects",
        variant: "destructive"
      });
    }
  });

  // Audit file mutation
  const auditFileMutation = useMutation({
    mutationFn: (uploadId: string) => apiRequest('/api/storage/master-keys/audit-file', {
      method: 'POST',
      body: JSON.stringify({ uploadId })
    }),
    onSuccess: (data: any) => {
      setAuditResult(data);
      setShowAuditDialog(true);
      setAuditingId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Audit Failed",
        description: error.message || "Failed to audit file",
        variant: "destructive"
      });
      setAuditingId(null);
    }
  });

  const handleAuditFile = (uploadId: string) => {
    setAuditingId(uploadId);
    auditFileMutation.mutate(uploadId);
  };

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
      case 'complete':
      case 'step-6-complete':
        return 'bg-green-100 text-green-800';
      case 'orphaned':
        return 'bg-orange-100 text-orange-800';
      case 'processing':
      case 'processing-step-6':
        return 'bg-blue-100 text-blue-800';
      case 'archived':
        return 'bg-purple-100 text-purple-800';
      case 'encoded':
        return 'bg-cyan-100 text-cyan-800';
      case 'identified':
        return 'bg-yellow-100 text-yellow-800';
      case 'uploaded':
        return 'bg-indigo-100 text-indigo-800';
      case 'purged':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-600';
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
          <TabsTrigger value="purge" className="flex items-center gap-2">
            <Trash2 className="w-4 h-4" />
            Purge Queue
          </TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Replit Storage Status Card */}
          <ReplitStorageCard />

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
              {/* File Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Files</CardTitle>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{storageStats?.masterKeys?.totalObjects?.toLocaleString() ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                      {storageStats?.masterKeys?.linkedToUploads ?? 0} with storage path
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Size</CardTitle>
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{storageStats?.masterKeys?.totalStorageMB?.toFixed(1) ?? '0.0'} MB</div>
                    <p className="text-xs text-muted-foreground">
                      {storageStats?.masterKeys?.totalLines?.toLocaleString() ?? 0} total lines
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Deleted Files</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-600">{storageStats?.masterKeys?.orphanedObjects ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                      {storageStats?.masterKeys?.markedForPurge ?? 0} archived
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Completed</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">{storageStats?.masterKeys?.processingComplete ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                      Fully processed files
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Failed</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{storageStats?.masterKeys?.failedCount ?? 0}</div>
                    <p className="text-xs text-muted-foreground">
                      Files with errors
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Archive Statistics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-purple-500" />
                    Archive Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{storageStats?.archiveStats?.totalArchived ?? 0}</div>
                      <p className="text-sm text-muted-foreground">Files archived</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold">{storageStats?.archiveStats?.totalSizeMB?.toFixed(1) ?? '0.0'} MB</div>
                      <p className="text-sm text-muted-foreground">Archive size</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <div className="text-2xl font-bold">{storageStats?.archiveStats?.avgSizeMB?.toFixed(1) ?? '0.0'} MB</div>
                      <p className="text-sm text-muted-foreground">Average file size</p>
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
                  {!storageStats?.recentActivity || storageStats.recentActivity.length === 0 ? (
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
          {/* Compact Stats Bar */}
          <div className="flex items-center gap-6 p-3 bg-muted/50 rounded-lg text-sm">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{storageStats?.masterKeys?.totalObjects?.toLocaleString() || 0}</span>
              <span className="text-muted-foreground">Files</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{storageStats?.masterKeys?.totalStorageMB?.toFixed(1) || 0} MB</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{storageStats?.masterKeys?.totalLines?.toLocaleString() || 0}</span>
              <span className="text-muted-foreground">Lines</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="font-medium">{storageStats?.masterKeys?.processingComplete?.toLocaleString() || 0}</span>
              <span className="text-muted-foreground">Complete</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-orange-500" />
              <span className="font-medium">{storageStats?.archiveStats?.totalArchived?.toLocaleString() || 0}</span>
              <span className="text-muted-foreground">Archived</span>
            </div>
          </div>

          {/* Business Day Heatmap */}
          <div className="mt-4">
            <h3 className="text-sm font-medium mb-2">Files by Business Day</h3>
            <BusinessDayHeatmap 
              onDateClick={(date) => {
                if (businessDayFilter === date) {
                  setBusinessDayFilter('all');
                } else {
                  setBusinessDayFilter(date);
                }
                setCurrentPage(0);
              }}
              selectedDate={businessDayFilter !== 'all' ? businessDayFilter : null}
            />
            {businessDayFilter !== 'all' && (
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="secondary" className="flex items-center gap-1">
                  Filtered: {new Date(businessDayFilter + 'T00:00:00').toLocaleDateString('en-US', { 
                    weekday: 'short', 
                    month: 'short', 
                    day: 'numeric',
                    year: 'numeric'
                  })}
                  <button 
                    onClick={() => setBusinessDayFilter('all')}
                    className="ml-1 hover:text-destructive"
                  >
                    <XCircle className="h-3 w-3" />
                  </button>
                </Badge>
              </div>
            )}
          </div>

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
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="encoded">Encoded</SelectItem>
                  <SelectItem value="identified">Identified</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="orphaned">Deleted</SelectItem>
                </SelectContent>
              </Select>
              <Select value={fileTypeFilter} onValueChange={(value) => {
                setFileTypeFilter(value);
                setCurrentPage(0);
              }}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="File type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="tddf">TDDF</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="ach">ACH</SelectItem>
                  <SelectItem value="txt">TXT</SelectItem>
                </SelectContent>
              </Select>
              <Select value={businessDayFilter} onValueChange={(value) => {
                setBusinessDayFilter(value);
                setCurrentPage(0);
              }}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Filter by business day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Business Days</SelectItem>
                  {businessDays.map((item: { date: string; count: number }) => (
                    <SelectItem key={item.date} value={item.date}>
                      {new Date(item.date + 'T00:00:00').toLocaleDateString('en-US', { 
                        weekday: 'short', 
                        month: 'short', 
                        day: 'numeric'
                      })} ({item.count})
                    </SelectItem>
                  ))}
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
                      ? `Select All on Page` 
                      : `${selectedObjects.size} selected`}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    Showing {currentPage * 50 + 1}-{Math.min((currentPage + 1) * 50, objectsList.pagination?.total || 0)} of {objectsList.pagination?.total?.toLocaleString() || 0}
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
                {objectsList?.objects?.map((obj) => (
                  <Card key={obj.id} className={selectedObjects.has(obj.id) ? 'ring-2 ring-blue-500' : ''}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <Checkbox
                          checked={selectedObjects.has(obj.id)}
                          onCheckedChange={(checked) => handleSelectObject(obj.id, checked as boolean)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" title={obj.objectKey}>
                            {obj.filename || obj.objectKey}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span>{obj.fileSizeMB}</span>
                            <span>•</span>
                            <span>{obj.lineCount?.toLocaleString() || 'N/A'} lines</span>
                            <span>•</span>
                            <span>{formatDate(obj.createdAt)}</span>
                            {obj.businessDay && (
                              <>
                                <span>•</span>
                                <span className="text-blue-600 font-medium">
                                  Biz Day: {new Date(obj.businessDay).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const badge = getFileTypeBadge(obj.filename || obj.objectKey);
                            const isTddf = badge.label === 'tddf' && (obj.currentPhase === 'completed' || obj.status === 'completed');
                            return (
                              <>
                                {isTddf && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAuditFile(obj.uploadId || obj.id);
                                    }}
                                    disabled={auditingId === (obj.uploadId || obj.id)}
                                    title="Audit file records"
                                    className="h-8 w-8"
                                  >
                                    {auditingId === (obj.uploadId || obj.id) ? (
                                      <Clock className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <ClipboardCheck className="w-4 h-4 text-blue-500" />
                                    )}
                                  </Button>
                                )}
                                <Badge variant="secondary" className={`text-xs ${badge.color}`}>
                                  {badge.label}
                                </Badge>
                              </>
                            );
                          })()}
                          <Badge className={getStatusColor(obj.currentPhase || obj.status)}>
                            {obj.currentPhase || obj.status}
                          </Badge>
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
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-orange-500" />
                    Purge Queue
                  </CardTitle>
                  <CardDescription>
                    {purgeQueueList?.total || 0} deleted items waiting for permanent deletion
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {selectedPurgeItems.size > 0 && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restoreObjectsMutation.mutate(Array.from(selectedPurgeItems))}
                        disabled={restoreObjectsMutation.isPending}
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Restore ({selectedPurgeItems.size})
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => permanentDeleteMutation.mutate(Array.from(selectedPurgeItems))}
                        disabled={permanentDeleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Forever ({selectedPurgeItems.size})
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!purgeQueueList?.objects?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Trash2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>Purge queue is empty</p>
                  <p className="text-sm">Deleted items will appear here before permanent deletion</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 border-b">
                    <Checkbox
                      checked={selectedPurgeItems.size === purgeQueueList.objects.length && purgeQueueList.objects.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedPurgeItems(new Set(purgeQueueList.objects.map(obj => obj.id)));
                        } else {
                          setSelectedPurgeItems(new Set());
                        }
                      }}
                    />
                    <span className="text-sm font-medium">Select All</span>
                    <span className="text-sm text-muted-foreground ml-auto">
                      {purgeQueueList.objects.length} items
                    </span>
                  </div>
                  {purgeQueueList.objects.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedPurgeItems.has(item.id)}
                        onCheckedChange={(checked) => {
                          const newSet = new Set(selectedPurgeItems);
                          if (checked) {
                            newSet.add(item.id);
                          } else {
                            newSet.delete(item.id);
                          }
                          setSelectedPurgeItems(newSet);
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          Deleted by {item.deletedBy || 'system'} on {item.deletedAt ? new Date(item.deletedAt).toLocaleDateString() : 'unknown'}
                          {item.fileSize && ` • ${(item.fileSize / 1024 / 1024).toFixed(2)} MB`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => restoreObjectsMutation.mutate([item.id])}
                          disabled={restoreObjectsMutation.isPending}
                          title="Restore"
                        >
                          <RotateCcw className="w-4 h-4 text-green-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => permanentDeleteMutation.mutate([item.id])}
                          disabled={permanentDeleteMutation.isPending}
                          title="Delete Forever"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {/* Audit Results Dialog */}
      <Dialog open={showAuditDialog} onOpenChange={setShowAuditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5" />
              File Audit Results
            </DialogTitle>
            <DialogDescription>
              Comparing file records against database entries
            </DialogDescription>
          </DialogHeader>
          {auditResult && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="font-medium text-sm truncate" title={auditResult.filename}>
                  {auditResult.filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  Processed: {auditResult.processedAt ? new Date(auditResult.processedAt).toLocaleString() : 'Unknown'}
                </p>
              </div>

              <div className={`p-4 rounded-lg border-2 ${
                auditResult.auditStatus === 'pass' 
                  ? 'bg-green-50 border-green-200' 
                  : auditResult.auditStatus === 'warning'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {auditResult.auditStatus === 'pass' ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : auditResult.auditStatus === 'warning' ? (
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span className={`font-semibold ${
                    auditResult.auditStatus === 'pass' 
                      ? 'text-green-700' 
                      : auditResult.auditStatus === 'warning'
                      ? 'text-yellow-700'
                      : 'text-red-700'
                  }`}>
                    {auditResult.auditStatus === 'pass' ? 'AUDIT PASSED' : 
                     auditResult.auditStatus === 'warning' ? 'WARNING' : 'AUDIT FAILED'}
                  </span>
                </div>
                <p className="text-sm">{auditResult.message}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-700">{auditResult.expectedDataRecords?.toLocaleString()}</p>
                  <p className="text-xs text-blue-600">Expected Records</p>
                  <p className="text-xs text-muted-foreground">(from {auditResult.lineCount?.toLocaleString()} lines)</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-purple-700">{auditResult.actualDbRecords?.toLocaleString()}</p>
                  <p className="text-xs text-purple-600">Database Records</p>
                  <p className="text-xs text-muted-foreground">
                    {auditResult.discrepancy !== 0 && (
                      <span className={auditResult.discrepancy > 0 ? 'text-green-600' : 'text-red-600'}>
                        ({auditResult.discrepancy > 0 ? '+' : ''}{auditResult.discrepancy})
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {auditResult.recordBreakdown && (
                <div className="border rounded-lg p-3">
                  <p className="text-sm font-medium mb-2">Record Type Breakdown</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">DT:</span>
                      <span className="font-medium">{auditResult.recordBreakdown.dt?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">TS:</span>
                      <span className="font-medium">{auditResult.recordBreakdown.ts?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">MO:</span>
                      <span className="font-medium">{auditResult.recordBreakdown.mo?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">MM:</span>
                      <span className="font-medium">{auditResult.recordBreakdown.mm?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">HD:</span>
                      <span className="font-medium">{auditResult.recordBreakdown.hd?.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">TR:</span>
                      <span className="font-medium">{auditResult.recordBreakdown.tr?.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => setShowAuditDialog(false)}
              >
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </MainLayout>
  );
}