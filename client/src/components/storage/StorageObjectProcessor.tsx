import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Play, FileText, Database, Loader2 } from 'lucide-react';
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
  const [selectedObject, setSelectedObject] = useState<StorageObject | null>(null);
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
      setSelectedObject(null);
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
      setSelectedObject(null);
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
      setSelectedObject(null);
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
          Select and process individual storage objects through identification (Step 4) and encoding (Step 5)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!storageObjects || storageObjects.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No storage objects available for processing. Objects must have line_count greater than 0 and be in active status.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">
              Found {storageObjects.length} storage objects available for processing
            </div>
            
            <div className="grid gap-3">
              {storageObjects.map((obj) => (
                <div
                  key={obj.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedObject?.id === obj.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedObject(obj)}
                >
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span className="font-medium">
                          {obj.original_filename || obj.object_key.split('/').pop()}
                        </span>
                        <Badge variant="secondary">{obj.file_type || 'TDDF'}</Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatFileSize(obj.file_size)} • {obj.line_count.toLocaleString()} lines
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Object ID: {obj.id} • Upload ID: {obj.upload_id}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-200">
                      {obj.processing_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>

            {selectedObject && (
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                <h4 className="font-medium mb-3">Selected Object Actions</h4>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    onClick={() => identifyMutation.mutate(selectedObject.id)}
                    disabled={identifyMutation.isPending}
                    variant="default"
                    size="sm"
                  >
                    {identifyMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Step 4: Identify
                  </Button>
                  
                  <Button
                    onClick={() => encodeMutation.mutate(selectedObject.id)}
                    disabled={encodeMutation.isPending}
                    variant="default"
                    size="sm"
                  >
                    {encodeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Database className="h-4 w-4 mr-2" />
                    )}
                    Step 5: Encode
                  </Button>

                  <Button
                    onClick={() => processFullMutation.mutate(selectedObject.id)}
                    disabled={processFullMutation.isPending}
                    variant="default"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {processFullMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Steps 4-5: Full Process
                  </Button>
                </div>
                
                <div className="mt-3 text-sm text-muted-foreground">
                  Selected: <span className="font-medium">{selectedObject.original_filename || selectedObject.object_key}</span>
                  <br />
                  {formatFileSize(selectedObject.file_size)} • {selectedObject.line_count.toLocaleString()} lines
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}