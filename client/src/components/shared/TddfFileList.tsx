import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Eye, Download, Trash2, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { 
  TddfApiFile, 
  formatFileSize, 
  getStatusBadgeVariant 
} from '@/lib/tddf-shared';

interface TddfFileListProps {
  files: TddfApiFile[];
  loading?: boolean;
  showActions?: boolean;
  compact?: boolean;
  onViewFile?: (file: TddfApiFile) => void;
  onDownloadFile?: (file: TddfApiFile) => void;
  onDeleteFile?: (file: TddfApiFile) => void;
  className?: string;
}

export function TddfFileList({
  files,
  loading = false,
  showActions = true,
  compact = false,
  onViewFile,
  onDownloadFile,
  onDeleteFile,
  className = ''
}: TddfFileListProps) {
  
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            TDDF Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-4 w-[250px]" />
                <Skeleton className="h-4 w-[80px]" />
                <Skeleton className="h-4 w-[60px]" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (files.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            TDDF Files
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No TDDF files found</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          TDDF Files ({files.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {compact ? (
          // Compact list view
          <div className="space-y-2">
            {files.map((file) => (
              <div 
                key={file.id} 
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{file.original_name}</p>
                    <Badge variant={getStatusBadgeVariant(file.status)}>
                      {file.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span>{formatFileSize(file.file_size)}</span>
                    <span>{file.record_count || 0} records</span>
                    {file.uploaded_at && (
                      <span>{format(new Date(file.uploaded_at), "MMM d, yyyy")}</span>
                    )}
                  </div>
                </div>
                
                {showActions && (
                  <div className="flex items-center gap-1">
                    {onViewFile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onViewFile(file)}
                        className="h-8 w-8 p-0"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    {onDownloadFile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownloadFile(file)}
                        className="h-8 w-8 p-0"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          // Full table view
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Records</TableHead>
                <TableHead>Business Day</TableHead>
                <TableHead>Uploaded</TableHead>
                {showActions && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate" title={file.original_name}>
                          {file.original_name}
                        </div>
                        {file.schema_name && (
                          <div className="text-xs text-muted-foreground">
                            {file.schema_name} v{file.schema_version}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(file.status)}>
                        {file.status}
                      </Badge>
                      {file.error_records && file.error_records > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {file.error_records} errors
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell className="font-mono text-sm">
                    {formatFileSize(file.file_size)}
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm">
                      <div>{file.record_count || 0} total</div>
                      {file.processed_records && (
                        <div className="text-xs text-muted-foreground">
                          {file.processed_records} processed
                        </div>
                      )}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    {file.business_day ? 
                      format(new Date(file.business_day), "MMM d, yyyy") : 
                      'N/A'}
                  </TableCell>
                  
                  <TableCell>
                    <div className="text-sm">
                      {file.uploaded_at ? 
                        format(new Date(file.uploaded_at), "MMM d, yyyy") : 
                        'N/A'}
                      {file.uploaded_by && (
                        <div className="text-xs text-muted-foreground">
                          by {file.uploaded_by}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  
                  {showActions && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onViewFile && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewFile(file)}
                            className="h-8 w-8 p-0"
                            title="View file details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        )}
                        {onDownloadFile && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDownloadFile(file)}
                            className="h-8 w-8 p-0"
                            title="Download file"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        {onDeleteFile && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDeleteFile(file)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            title="Delete file"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}