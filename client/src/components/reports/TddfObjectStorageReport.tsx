import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  FileText, 
  Download, 
  RefreshCw, 
  Database, 
  HardDrive, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  BarChart3,
  FileCheck2
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface FileReport {
  id: string;
  filename: string;
  uploadDate: string;
  storageKey: string;
  status: string;
  database: {
    fileSize: number;
    rawLinesCount: number;
    processingNotes: string | null;
  };
  objectStorage: {
    lineCount: number;
    fileSize: number;
    recordTypes: Record<string, number>;
    status: string;
    error: string | null;
  };
  analysis: {
    countMismatch: boolean;
    sizeMismatch: boolean;
    dataIntegrity: string;
  };
}

interface ReportData {
  metadata: {
    generated: string;
    environment: string;
    totalFiles: number;
    processingTime: number;
  };
  summary: {
    totalRawLines: number;
    totalFileSize: number;
    successfulFiles: number;
    errorFiles: number;
    missingFiles: number;
    recordTypeTotals: Record<string, number>;
  };
  files: FileReport[];
}

export default function TddfObjectStorageReport() {
  const [isOpen, setIsOpen] = useState(false);
  
  const { 
    data: reportData, 
    isLoading, 
    error, 
    refetch 
  } = useQuery({
    queryKey: ['/api/reports/tddf-object-storage-rows'],
    enabled: isOpen,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const handleGenerateReport = () => {
    refetch();
    toast({
      title: "Generating Report",
      description: "TDDF object storage row count report is being generated...",
    });
  };

  const handleDownloadReport = () => {
    if (!reportData?.data) return;
    
    const jsonData = JSON.stringify(reportData.data, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tddf-object-storage-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Report Downloaded",
      description: "TDDF object storage report has been downloaded as JSON",
    });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getIntegrityBadge = (integrity: string) => {
    switch (integrity) {
      case 'good':
        return <Badge variant="default" className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" />Good</Badge>;
      case 'issues':
        return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Issues</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-100 text-green-800">Success</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'missing':
        return <Badge variant="secondary">Missing</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <FileText className="h-4 w-4 mr-2" />
          TDDF Object Storage Row Report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            TDDF Object Storage Row Count Report
          </DialogTitle>
          <DialogDescription>
            Comprehensive analysis of raw TDDF rows in object storage with metadata comparison
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Control buttons */}
          <div className="flex justify-between items-center">
            <Button 
              onClick={handleGenerateReport} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Generating...' : 'Generate Report'}
            </Button>
            
            {reportData?.data && (
              <Button 
                onClick={handleDownloadReport}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download JSON
              </Button>
            )}
          </div>

          {/* Loading state */}
          {isLoading && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-center space-x-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Analyzing TDDF files in object storage...</span>
                </div>
                <Progress value={45} className="mt-2" />
              </CardContent>
            </Card>
          )}

          {/* Error state */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Error generating report: {error instanceof Error ? error.message : 'Unknown error'}
              </AlertDescription>
            </Alert>
          )}

          {/* Report summary */}
          {reportData?.data && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Files</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{reportData.data.metadata.totalFiles}</div>
                    <div className="text-xs text-gray-500">
                      Generated: {formatDate(reportData.data.metadata.generated)}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Raw Lines</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">
                      {reportData.data.summary.totalRawLines.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      Processing time: {(reportData.data.metadata.processingTime / 1000).toFixed(2)}s
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Total Size</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      {formatFileSize(reportData.data.summary.totalFileSize)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Environment: {reportData.data.metadata.environment}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600">Status Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-green-600">Success:</span>
                        <span>{reportData.data.summary.successfulFiles}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-red-600">Errors:</span>
                        <span>{reportData.data.summary.errorFiles}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Missing:</span>
                        <span>{reportData.data.summary.missingFiles}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Record type breakdown */}
              {Object.keys(reportData.data.summary.recordTypeTotals).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Record Type Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(reportData.data.summary.recordTypeTotals).map(([recordType, count]) => (
                        <div key={recordType} className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{count.toLocaleString()}</div>
                          <div className="text-sm text-gray-600">{recordType} Records</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Files table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck2 className="h-5 w-5" />
                    File Details ({reportData.data.files.length} files)
                  </CardTitle>
                  <CardDescription>
                    Detailed analysis of each TDDF file in object storage
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Filename</TableHead>
                          <TableHead>Upload Date</TableHead>
                          <TableHead>DB Lines</TableHead>
                          <TableHead>Storage Lines</TableHead>
                          <TableHead>File Size</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Data Integrity</TableHead>
                          <TableHead>Record Types</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.data.files.map((file) => (
                          <TableRow key={file.id}>
                            <TableCell className="font-medium">
                              <div>
                                <div className="font-mono text-sm">{file.filename}</div>
                                <div className="text-xs text-gray-500">{file.status}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">{formatDate(file.uploadDate)}</div>
                            </TableCell>
                            <TableCell>
                              <div className="text-right font-mono">
                                {file.database.rawLinesCount.toLocaleString()}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-right font-mono">
                                {file.objectStorage.lineCount.toLocaleString()}
                                {file.analysis.countMismatch && (
                                  <AlertTriangle className="h-3 w-3 text-red-500 inline ml-1" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                {formatFileSize(file.objectStorage.fileSize)}
                              </div>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(file.objectStorage.status)}
                            </TableCell>
                            <TableCell>
                              {getIntegrityBadge(file.analysis.dataIntegrity)}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                {Object.entries(file.objectStorage.recordTypes).map(([type, count]) => (
                                  <div key={type} className="text-xs">
                                    <Badge variant="outline" className="text-xs">
                                      {type}: {count}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}