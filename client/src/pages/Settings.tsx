import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { APP_VERSION, BUILD_DATE } from "@shared/version";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Database, Download, DownloadCloud, HardDrive, Info, List, RefreshCw, Server } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import BackupHistoryDialog from "@/components/settings/BackupHistoryDialog";
import SchemaVersionInfo from "@/components/settings/SchemaVersionInfo";
import FileProcessingHistory from "@/components/settings/FileProcessingHistory";
import UserManagement from "@/components/settings/UserManagement";
import DatabaseConnectionSettings from "@/components/settings/DatabaseConnectionSettings";
import S3BackupSettings from "@/components/settings/S3BackupSettings";
import MainLayout from "@/components/layout/MainLayout";

interface DatabaseStats {
  connectionStatus: "connected" | "error";
  version: string;
  tables: {
    name: string;
    rowCount: number;
    sizeBytes: number;
  }[];
  totalRows: number;
  totalSizeBytes: number;
  lastBackup: string | null;
}

export default function Settings() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [hasBackup, setHasBackup] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [useS3Storage, setUseS3Storage] = useState(false);
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };
  
  const toggleUploadModal = () => {
    setIsUploadModalOpen(prev => !prev);
  };
  
  // Fetch database statistics
  const {
    data: dbStats,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<DatabaseStats>({
    queryKey: ["/api/settings/database"],
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
  
  const createBackup = async () => {
    try {
      setIsBackingUp(true);
      setBackupProgress(10);
      
      // Simulate progress for better UX (real progress would come from the server)
      const interval = setInterval(() => {
        setBackupProgress(prev => {
          const nextProgress = prev + Math.floor(Math.random() * 15);
          return nextProgress > 90 ? 90 : nextProgress;
        });
      }, 500);
      
      try {
        const response = await fetch("/api/settings/backup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            useS3: useS3Storage,
            notes: "Created from settings page"
          }),
          credentials: "include"
        });
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const responseData = await response.json();
        
        clearInterval(interval);
        setBackupProgress(100);
        
        // Set hasBackup to true if the backup was created successfully
        if (responseData && responseData.success) {
          setHasBackup(true);
          
          const storageType = useS3Storage ? "S3 cloud storage" : "local storage";
          
          toast({
            title: "Backup created successfully",
            description: `Your database has been backed up to ${storageType}.`,
          });
          
          // Refresh statistics
          refetch();
        } else {
          throw new Error("Backup creation failed");
        }
      } catch (error) {
        clearInterval(interval);
        console.error("Backup error:", error);
        
        toast({
          title: "Backup failed",
          description: "Failed to create backup. Please try again.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Outer error:", err);
      toast({
        title: "Backup failed",
        description: "Failed to create backup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => {
        setIsBackingUp(false);
        setBackupProgress(0);
      }, 1000);
    }
  };
  
  const downloadBackup = () => {
    // Create a direct download link to the backup file
    window.location.href = "/api/settings/backup/download";
  };
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "Never";
    
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };
  
  return (
    <MainLayout>
      <div className="container mx-auto">
        <div className="flex-1 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
              <p className="text-muted-foreground">
                Manage your application database and settings
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          
          <Separator />
          
          {/* System Information Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Server className="mr-2 h-5 w-5 text-primary" />
                System Information
              </CardTitle>
              <CardDescription>
                Current application system details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Application Version:</span>
                  <Badge variant="outline" className="text-primary">
                    {APP_VERSION}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Build Date:</span>
                  <span>{BUILD_DATE}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Application:</span>
                  <span>Merchant Management System</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Environment:</span>
                  <span>{import.meta.env.MODE || "development"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Database Type:</span>
                  <span>PostgreSQL</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Frontend Framework:</span>
                  <span>React + Vite</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Host:</span>
                  <span>Replit</span>
                </div>
              </div>
            </CardContent>
          </Card>
      
          <div className="grid grid-cols-1 gap-6 mb-6">
            <DatabaseConnectionSettings />
          </div>
          
          <div className="grid grid-cols-1 gap-6 mb-6">
            <S3BackupSettings />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="mr-2 h-5 w-5 text-primary" />
                  Database Status
                </CardTitle>
                <CardDescription>
                  Current status of your PostgreSQL database
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Loading database information...</p>
                  </div>
                ) : isError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to fetch database information. {error?.toString()}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">Connection:</span>
                      <Badge variant={dbStats?.connectionStatus === "connected" ? "default" : "destructive"}>
                        {dbStats?.connectionStatus === "connected" ? "Connected" : "Error"}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">PostgreSQL Version:</span>
                      <span>{dbStats?.version}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Total Tables:</span>
                      <span>{dbStats?.tables.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Total Rows:</span>
                      <span>{dbStats?.totalRows.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Database Size:</span>
                      <span>{formatBytes(dbStats?.totalSizeBytes || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Last Backup:</span>
                      <span>{formatDate(dbStats?.lastBackup)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  onClick={createBackup} 
                  disabled={isBackingUp || isLoading || isError}
                >
                  {isBackingUp ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Creating Backup...
                    </>
                  ) : (
                    <>
                      <DownloadCloud className="mr-2 h-4 w-4" />
                      Create Backup
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <HardDrive className="mr-2 h-5 w-5 text-primary" />
                  Storage Details
                </CardTitle>
                <CardDescription>
                  Database tables and their storage information
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Loading storage details...</p>
                  </div>
                ) : isError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to fetch storage information.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="overflow-auto max-h-[320px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Table</TableHead>
                          <TableHead className="text-right">Rows</TableHead>
                          <TableHead className="text-right">Size</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dbStats?.tables.map((table) => (
                          <TableRow key={table.name}>
                            <TableCell className="font-medium">{table.name}</TableCell>
                            <TableCell className="text-right">{table.rowCount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{formatBytes(table.sizeBytes)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col space-y-2">
                {isBackingUp && (
                  <div className="w-full space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Backup progress</span>
                      <span>{backupProgress}%</span>
                    </div>
                    <Progress value={backupProgress} className="w-full" />
                  </div>
                )}
                
                {/* Backup history and download buttons */}
                {(hasBackup || dbStats?.lastBackup) && !isBackingUp && (
                  <div className="flex gap-2 w-full">
                    <Button 
                      className="flex-1" 
                      variant="outline" 
                      onClick={downloadBackup}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download Latest Backup
                    </Button>
                    
                    <BackupHistoryDialog onClose={() => {}} />
                  </div>
                )}
              </CardFooter>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 gap-6">
            <UserManagement />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SchemaVersionInfo />
            <FileProcessingHistory />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}