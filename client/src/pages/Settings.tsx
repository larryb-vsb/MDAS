import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Database, DownloadCloud, HardDrive, RefreshCw, Server } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";

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
      
      await apiRequest("/api/settings/backup", "POST");
      
      clearInterval(interval);
      setBackupProgress(100);
      
      toast({
        title: "Backup created successfully",
        description: "Your database has been backed up.",
      });
      
      // Refresh statistics
      refetch();
    } catch (err) {
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
    <div className="container mx-auto py-6 space-y-6">
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
          </CardFooter>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Server className="mr-2 h-5 w-5 text-primary" />
            System Information
          </CardTitle>
          <CardDescription>
            Information about the application environment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
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
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="font-medium">Frontend Framework:</span>
                <span>React + Vite</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Host:</span>
                <span>Replit</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium">Uptime:</span>
                <span>Managed by Replit</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}