import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  RefreshCw, 
  Download, 
  Upload, 
  FileText, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle,
  Loader2,
  CheckSquare,
  MousePointer,
  HardDrive,
  Database,
  ExternalLink
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface ObjectStorageFile {
  key: string;
  name: string;
  size?: number;
  lastModified?: string;
  type?: string;
}

interface ObjectStorageResponse {
  available: boolean;
  service: string;
  fileCount: number;
  files?: ObjectStorageFile[];
  folderPrefix: string;
  environment: string;
}

export default function ObjectStorageFileBrowser() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<'single' | 'multiple'>('single');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for object storage configuration and file list
  const { data: storageData, isLoading, error, refetch } = useQuery<ObjectStorageResponse>({
    queryKey: ['/api/uploader/storage-files'],
    queryFn: async () => {
      const response = await fetch('/api/uploader/storage-files');
      if (!response.ok) {
        throw new Error('Failed to fetch object storage files');
      }
      return response.json();
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  });

  // Import selected files mutation
  const importFilesMutation = useMutation({
    mutationFn: async (fileKeys: string[]) => {
      const response = await apiRequest('/api/uploader/import-from-storage', {
        method: 'POST',
        body: JSON.stringify({ fileKeys }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Import Started",
        description: `Successfully queued ${data.importedCount || selectedFiles.length} files for import and processing.`,
      });
      setSelectedFiles([]);
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import files from object storage",
        variant: "destructive",
      });
    }
  });

  // Filter and paginate files
  const filteredFiles = useMemo(() => {
    if (!storageData?.files) return [];
    
    return storageData.files.filter(file => {
      // Search filter
      if (searchFilter && !file.name.toLowerCase().includes(searchFilter.toLowerCase())) {
        return false;
      }
      
      // Type filter
      if (typeFilter !== 'all') {
        const isType = typeFilter === 'tddf' ? 
          file.name.toLowerCase().includes('.tsyso') :
          file.name.toLowerCase().includes(`.${typeFilter}`);
        if (!isType) return false;
      }
      
      return true;
    });
  }, [storageData?.files, searchFilter, typeFilter]);

  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredFiles.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredFiles, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredFiles.length / itemsPerPage);

  // Selection handlers
  const handleFileSelection = (fileKey: string) => {
    if (selectionMode === 'single') {
      setSelectedFiles(selectedFiles.includes(fileKey) ? [] : [fileKey]);
    } else {
      setSelectedFiles(prev => 
        prev.includes(fileKey) 
          ? prev.filter(key => key !== fileKey)
          : [...prev, fileKey]
      );
    }
  };

  const handleSelectAll = () => {
    if (selectedFiles.length === paginatedFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(paginatedFiles.map(file => file.key));
    }
  };

  const handleClearSelection = () => {
    setSelectedFiles([]);
  };

  const handleImportSelected = () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No Files Selected",
        description: "Please select at least one file to import.",
        variant: "destructive",
      });
      return;
    }

    importFilesMutation.mutate(selectedFiles);
  };

  const formatFileSize = (bytes: number | undefined) => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const extractFileName = (key: string) => {
    return key.split('/').pop() || key;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Object Storage Files
          </CardTitle>
          <CardDescription>Browse and import files from object storage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading object storage files...
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
            <HardDrive className="h-5 w-5" />
            Object Storage Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load object storage files: {error.message}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!storageData?.available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Object Storage Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Object storage is not configured or available.
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
          <HardDrive className="h-5 w-5" />
          Object Storage Files ({storageData.fileCount} files)
        </CardTitle>
        <CardDescription>
          Browse and import TDDF files from {storageData.service} - {storageData.environment} environment
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Storage Info */}
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-blue-900">
                Storage Location: /{storageData.folderPrefix}
              </div>
              <div className="text-xs text-blue-700">
                {storageData.fileCount} files available for import
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            <Input
              placeholder="Search filenames..."
              value={searchFilter}
              onChange={(e) => {
                setSearchFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-64"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Type:</span>
            <Select value={typeFilter} onValueChange={(value) => {
              setTypeFilter(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Files</SelectItem>
                <SelectItem value="tddf">TDDF (.TSYSO)</SelectItem>
                <SelectItem value="csv">CSV</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Per Page:</span>
            <Select value={itemsPerPage.toString()} onValueChange={(value) => {
              setItemsPerPage(Number(value));
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Selection Controls */}
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
                  setSelectedFiles(selectedFiles.slice(0, 1));
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

            {selectionMode === 'multiple' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-8"
                >
                  {selectedFiles.length === paginatedFiles.length ? 'Deselect All' : 'Select All on Page'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearSelection}
                  disabled={selectedFiles.length === 0}
                  className="h-8"
                >
                  Clear Selection
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {selectedFiles.length} selected • {filteredFiles.length} filtered • {storageData.fileCount} total
            </Badge>
          </div>
        </div>

        {/* Files Grid */}
        {filteredFiles.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No files found matching your filter criteria.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-3">
            {paginatedFiles.map((file) => (
              <div
                key={file.key}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedFiles.includes(file.key)
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleFileSelection(file.key)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectionMode === 'multiple' && (
                      <Checkbox
                        checked={selectedFiles.includes(file.key)}
                        onCheckedChange={() => handleFileSelection(file.key)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium">
                          {extractFileName(file.key)}
                        </span>
                      </div>
                      
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Storage Path: {file.key}</div>
                        {file.size && (
                          <div>Size: {formatFileSize(file.size)}</div>
                        )}
                        {file.lastModified && (
                          <div>Modified: {new Date(file.lastModified).toLocaleString()}</div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {selectedFiles.includes(file.key) && (
                    <div className="ml-4 flex items-center">
                      <Badge className="bg-blue-100 text-blue-800">Selected</Badge>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

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

        {/* Import Controls */}
        {selectedFiles.length > 0 && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-green-900">
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected for import
                </div>
                <div className="text-xs text-green-700">
                  Files will be imported and processed automatically through the MMS pipeline
                </div>
              </div>
              <Button
                onClick={handleImportSelected}
                disabled={importFilesMutation.isPending}
                className="flex items-center gap-2"
              >
                {importFilesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                Import Selected
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}