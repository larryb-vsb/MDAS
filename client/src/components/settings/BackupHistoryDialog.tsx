import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Download, List, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BackupHistoryProps {
  onClose?: () => void;
}

type BackupHistoryItem = {
  id: string;
  timestamp: string;
  fileName: string;
  size: number;
  tables: {
    merchants: number;
    transactions: number;
    uploadedFiles: number;
  };
  downloaded: boolean;
};

export default function BackupHistoryDialog({ onClose }: BackupHistoryProps) {
  const [activeTab, setActiveTab] = useState("history");
  
  const {
    data: backupHistory,
    isLoading,
    isError,
    refetch
  } = useQuery<BackupHistoryItem[]>({
    queryKey: ["/api/settings/backup/history"],
    staleTime: 1000 * 60, // 1 minute
  });
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const handleDownload = (backupId: string) => {
    // Create a direct download link to the specific backup file
    window.location.href = `/api/settings/backup/download/${backupId}`;
    
    // Schedule a refresh after a short delay to update the downloaded status
    setTimeout(() => {
      refetch();
    }, 2000);
    
    toast({
      title: "Download started",
      description: "Your backup file is being downloaded."
    });
  };
  
  const handleRefresh = () => {
    refetch();
    toast({
      title: "Refreshed",
      description: "Backup history has been refreshed.",
    });
  };
  
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <List className="h-4 w-4 mr-2" />
          View Backup History
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Backup History</DialogTitle>
          <DialogDescription>
            View and download previous database backups
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex justify-between items-center mb-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="history" className="mt-4">
              <div className="flex justify-end mb-2">
                <Button variant="outline" size="sm" onClick={handleRefresh}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
              
              <ScrollArea className="h-[350px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>File</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <RefreshCw className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
                          <span className="mt-2 block text-sm text-muted-foreground">Loading backup history...</span>
                        </TableCell>
                      </TableRow>
                    ) : isError ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-destructive">
                          Failed to load backup history.
                        </TableCell>
                      </TableRow>
                    ) : backupHistory && backupHistory.length > 0 ? (
                      backupHistory.map((backup) => (
                        <TableRow key={backup.id}>
                          <TableCell>
                            <div className="font-medium">
                              {format(new Date(backup.timestamp), 'MMM d, yyyy')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(backup.timestamp), 'h:mm a')}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(backup.timestamp), { addSuffix: true })}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            <div className="flex items-center gap-2">
                              {backup.fileName}
                              {backup.downloaded && (
                                <Badge variant="outline" className="flex items-center gap-1 text-green-500 border-green-200">
                                  <CheckCircle className="h-3 w-3" />
                                  <span className="text-xs">Downloaded</span>
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              <span className="font-medium">Merchants:</span> {backup.tables.merchants}
                            </div>
                            <div className="text-xs">
                              <span className="font-medium">Transactions:</span> {backup.tables.transactions}
                            </div>
                            <div className="text-xs">
                              <span className="font-medium">Files:</span> {backup.tables.uploadedFiles}
                            </div>
                          </TableCell>
                          <TableCell>{formatBytes(backup.size)}</TableCell>
                          <TableCell>
                            <Button
                              variant={backup.downloaded ? "outline" : "ghost"}
                              size="sm"
                              className={`h-8 w-8 p-0 ${backup.downloaded ? "bg-green-50 border-green-200 text-green-600" : ""}`}
                              onClick={() => handleDownload(backup.id)}
                              title={backup.downloaded ? "Download Again" : "Download Backup"}
                            >
                              <Download className="h-4 w-4" />
                              <span className="sr-only">Download</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No backup history found. Create a backup first.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}