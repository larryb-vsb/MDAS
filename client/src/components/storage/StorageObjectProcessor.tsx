import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Play, FileText, Database, Loader2, ChevronLeft, ChevronRight, MousePointer, CheckSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface StorageObject {
  id: string;
  upload_id: string;
  object_key: string;
  file_size: number;
  line_count: number;
  processing_status: string;
  created_at: string;
  original_filename?: string;
  file_type?: string;
}

interface ProcessingResponse {
  success: boolean;
  message: string;
  recordsProcessed?: number;
  processingTime?: number;
  objectId: string;
}

export default function StorageObjectProcessor() {
  const [selectedObjects, setSelectedObjects] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for available storage objects
  const { data: storageObjects, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/storage/objects/available'],
    queryFn: async (): Promise<StorageObject[]> => {
      const response = await fetch('/api/storage/objects/available');
      if (!response.ok) {
        throw new Error('Failed to fetch storage objects');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Step 4: Identification mutation
  const identifyMutation = useMutation({
    mutationFn: async (objectId: string) => {
      const response = await fetch(`/api/storage/objects/${objectId}/identify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to identify storage object');
      }
      return response.json();
    },
    onSuccess: (data: ProcessingResponse) => {
      toast({
        title: "Step 4 Complete",
        description: `Object identified successfully. ${data.recordsProcessed || 0} records processed.`,
      });
      setSelectedObjects([]);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/storage/tddf-object-totals'] });
    },
    onError: (error: any) => {
      toast({
        title: "Identification Failed",
        description: error.message || "Failed to identify storage object",
        variant: "destructive",
      });
    }
  });

  // Step 5: Encoding mutation
  const encodeMutation = useMutation({
    mutationFn: async (objectId: string) => {
      const response = await fetch(`/api/storage/objects/${objectId}/encode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to encode storage object');
      }
      return response.json();
    },
    onSuccess: (data: ProcessingResponse) => {
      toast({
        title: "Step 5 Complete",
        description: `Object encoded successfully. ${data.recordsProcessed || 0} JSONB records created.`,
      });
      setSelectedObjects([]);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/storage/tddf-object-totals'] });
    },
    onError: (error: any) => {
      toast({
        title: "Encoding Failed",
        description: error.message || "Failed to encode storage object",
        variant: "destructive",
      });
    }
  });

  // Combined Steps 4-5 mutation
  const processFullMutation = useMutation({
    mutationFn: async (objectId: string) => {
      const response = await fetch(`/api/storage/objects/${objectId}/process-full`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to process storage object');
      }
      return response.json();
    },
    onSuccess: (data: ProcessingResponse) => {
      toast({
        title: "Steps 4-5 Complete",
        description: `Object processed successfully. ${data.recordsProcessed || 0} JSONB records created.`,
      });
      setSelectedObjects([]);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/storage/tddf-object-totals'] });
    },
    onError: (error: any) => {
      toast({
        title: "Processing Failed",
        description: error.message || "Failed to process storage object",
        variant: "destructive",
      });
    }
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Pagination logic
  const paginatedObjects = useMemo(() => {
    if (!storageObjects) return [];
    const startIndex = (currentPage - 1) * itemsPerPage;
    return storageObjects.slice(startIndex, startIndex + itemsPerPage);
  }, [storageObjects, currentPage, itemsPerPage]);

  const totalPages = Math.ceil((storageObjects?.length || 0) / itemsPerPage);

  // Selection handlers
  const handleObjectSelection = (objectId: string) => {
    if (selectionMode === 'single') {
      setSelectedObjects(selectedObjects.includes(objectId) ? [] : [objectId]);
    } else {
      setSelectedObjects(prev => 
        prev.includes(objectId) 
          ? prev.filter(id => id !== objectId)
          : [...prev, objectId]
      );
    }
  };

  const handleSelectAll = () => {
    if (selectedObjects.length === paginatedObjects.length) {
      setSelectedObjects([]);
    } else {
      setSelectedObjects(paginatedObjects.map(obj => obj.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedObjects([]);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Storage Object Processor
          </CardTitle>
          <CardDescription>Process individual storage objects through steps 4-5</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading storage objects...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Storage Object Processor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load storage objects: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Storage Object Processor
        </CardTitle>
        <CardDescription>
          Browse and process individual storage objects through identification (Step 4) and encoding (Step 5)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!storageObjects || storageObjects.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No storage objects available for processing. Objects must have line_count greater than 0 and be in active status.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-4">
                {/* Selection Mode Buttons */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Selection:</span>
                  <Button
                    variant={selectionMode === 'single' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setSelectionMode('single');
                      setSelectedObjects(selectedObjects.slice(0, 1));
                    }}
                    className="h-8"
                  >
                    <MousePointer className="h-3 w-3 mr-1" />
                    Single
                  </Button>
                  <Button
                    variant={selectionMode === 'multiple' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectionMode('multiple')}
                    className="h-8"
                  >
                    <CheckSquare className="h-3 w-3 mr-1" />
                    Multiple
                  </Button>
                </div>

                {/* Items Per Page */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Per Page:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                    setItemsPerPage(Number(value));
                    setCurrentPage(1);
                  }}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {selectedObjects.length} selected • {storageObjects.length} total
                </Badge>
              </div>
            </div>

            {/* Selection Controls */}
            {selectionMode === 'multiple' && (
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-8"
                >
                  {selectedObjects.length === paginatedObjects.length ? 'Deselect All' : 'Select All on Page'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={selectedObjects.length === 0}
                  className="h-8"
                >
                  Clear Selection
                </Button>
              </div>
            )}
            
            {/* Objects Grid */}
            <div className="grid gap-3">
              {paginatedObjects.map((obj) => (
                <div
                  key={obj.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedObjects.includes(obj.id)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => handleObjectSelection(obj.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {selectionMode === 'multiple' && (
                        <Checkbox
                          checked={selectedObjects.includes(obj.id)}
                          onCheckedChange={() => handleObjectSelection(obj.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            ID: {obj.id}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {obj.processing_status}
                          </Badge>
                        </div>
                        
                        <div className="text-sm font-medium mb-1">
                          {obj.original_filename || `Object ${obj.id}`}
                        </div>
                        
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>Size: {formatFileSize(obj.file_size)} • Lines: {obj.line_count?.toLocaleString()}</div>
                          <div>Upload ID: {obj.upload_id}</div>
                          <div>Storage Key: {obj.object_key}</div>
                          <div>Type: {obj.file_type || 'TDDF'}</div>
                        </div>
                      </div>
                    </div>
                    
                    {selectedObjects.includes(obj.id) && (
                      <div className="ml-4 flex items-center">
                        <Badge className="bg-blue-100 text-blue-800">Selected</Badge>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-8"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const pageNum = currentPage <= 3 ? i + 1 : currentPage - 2 + i;
                    if (pageNum > totalPages) return null;
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCurrentPage(pageNum)}
                        className="h-8 w-8"
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="h-8"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Processing Controls */}
            {selectedObjects.length > 0 && (
              <div className="border-t pt-4 space-y-4">
                <div className="text-sm font-medium">
                  Processing Options for {selectedObjects.length} selected object{selectedObjects.length > 1 ? 's' : ''}
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      selectedObjects.forEach(id => identifyMutation.mutate(id));
                    }}
                    disabled={identifyMutation.isPending}
                    className="bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100"
                  >
                    {identifyMutation.isPending ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FileText className="h-3 w-3 mr-1" />
                        Step 4: Identify ({selectedObjects.length})
                      </>
                    )}
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      selectedObjects.forEach(id => encodeMutation.mutate(id));
                    }}
                    disabled={encodeMutation.isPending}
                    className="bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100"
                  >
                    {encodeMutation.isPending ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Database className="h-3 w-3 mr-1" />
                        Step 5: Encode ({selectedObjects.length})
                      </>
                    )}
                  </Button>
                  
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      selectedObjects.forEach(id => processFullMutation.mutate(id));
                    }}
                    disabled={processFullMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {processFullMutation.isPending ? (
                      <>
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="h-3 w-3 mr-1" />
                        Steps 4-5: Full Process ({selectedObjects.length})
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}