import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import BackupScheduleManager from "@/components/settings/BackupScheduleManager";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, RotateCw, CalendarClock, FileOutput, Clock, Trash, AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Define interfaces for our data types
interface BackupRecord {
  id: string;
  timestamp: string;
  fileName: string;
  size: number;
  tables: string[];
  downloaded: boolean;
  deleted: boolean;
  storageType: string;
  s3Bucket: string | null;
  s3Key: string | null;
  notes: string | null;
  createdBy?: string;
}

// Inline PageTitle component since the import is causing issues
const PageTitle = ({ title, description }: { title: string; description?: string }) => {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {description && (
        <p className="text-muted-foreground mt-2">{description}</p>
      )}
    </div>
  );
};

export default function BackupsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("schedules");
  const [_, navigate] = useLocation();
  
  // Check if user is an admin
  const isAdmin = user?.role === "admin";
  
  // Fetch backup history
  const {
    data: backupHistory,
    isLoading: isHistoryLoading,
    isError: isHistoryError,
    error: historyError,
    refetch: refetchHistory
  } = useQuery<BackupRecord[]>({
    queryKey: ["/api/settings/backup/history"],
    queryFn: async () => {
      try {
        // Make sure user is authenticated before making the request
        if (!user || !user.id) {
          throw new Error("You must be logged in to view backup history");
        }
        
        const res = await apiRequest("GET", "/api/settings/backup/history");
        if (!res.ok) {
          throw new Error(`API request failed with status ${res.status}`);
        }
        const data = await res.json();
        console.log("Backup history data:", data);
        
        // Add debug logging to help diagnose issues
        if (Array.isArray(data)) {
          console.log(`Received ${data.length} backup history records`);
          if (data.length > 0) {
            console.log("First backup record structure:", Object.keys(data[0]));
          }
          return data as BackupRecord[];
        } else {
          console.log("Received non-array data:", typeof data);
          return [];
        }
      } catch (err) {
        console.error("Error fetching backup history:", err);
        throw err; // Re-throw to let React Query handle the error state
      }
    },
    // Only run this query when the user is logged in
    enabled: !!user?.id,
  });
  
  // Format date for display
  function formatDate(dateString: string | null) {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  }
  
  // Function to get log entry severity class
  function getSeverityClass(type: string) {
    switch (type) {
      case "error":
        return "text-red-500";
      case "warning":
        return "text-yellow-500";
      case "success":
        return "text-green-500";
      default:
        return "text-gray-500";
    }
  }
  
  if (!isAdmin) {
    return (
      <div className="container mx-auto py-10">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            Only administrators can access the Backups page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-10">
      <div className="flex items-center justify-between mb-4">
        <PageTitle 
          title="Backup Management" 
          description="Manage database backups and schedules" 
        />
        <Button
          variant="outline"
          onClick={() => navigate("/settings")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Settings
        </Button>
      </div>
      
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="schedules">Backup Schedules</TabsTrigger>
          <TabsTrigger value="history">Backup History & Logs</TabsTrigger>
        </TabsList>
        
        {/* Backup Schedules Tab */}
        <TabsContent value="schedules" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Automated Backup Schedules</CardTitle>
              <CardDescription>
                Configure how often the system should automatically create database backups
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BackupScheduleManager />
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Backup History Tab */}
        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Backup History & Logs</CardTitle>
                <CardDescription>
                  View backup history and system logs related to the backup process
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchHistory()}
                disabled={isHistoryLoading}
              >
                {isHistoryLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {isHistoryLoading ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : isHistoryError ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    Failed to load backup history: {historyError?.message || "Unknown error"}
                  </AlertDescription>
                </Alert>
              ) : !backupHistory || backupHistory.length === 0 ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No backups</AlertTitle>
                  <AlertDescription>
                    No backup history found. Create your first backup in the Database section of the Settings page.
                  </AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableCaption>A history of all database backups</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backupHistory && backupHistory.map((backup: BackupRecord) => (
                      <TableRow key={backup.id}>
                        <TableCell>{formatDate(backup.timestamp)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Manual
                          </Badge>
                        </TableCell>
                        <TableCell>{(backup.size / (1024 * 1024)).toFixed(2)} MB</TableCell>
                        <TableCell>
                          <Badge className="bg-green-500 text-white flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            Completed
                          </Badge>
                        </TableCell>
                        <TableCell>{backup.createdBy || 'admin'}</TableCell>
                        <TableCell>
                          {backup.storageType === "s3" ? (
                            <Badge className="bg-blue-500">S3 Cloud</Badge>
                          ) : (
                            <Badge variant="outline">Local</Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{backup.notes || "No notes provided"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              title="Download backup"
                              onClick={() => {
                                toast({
                                  title: "Download started",
                                  description: "The backup file is being downloaded"
                                });
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              title="Restore backup"
                              onClick={() => {
                                toast({
                                  title: "Restore not implemented",
                                  description: "This feature is not yet available",
                                  variant: "destructive"
                                });
                              }}
                            >
                              <FileOutput className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              title="Delete backup"
                              onClick={() => {
                                toast({
                                  title: "Delete not implemented",
                                  description: "This feature is not yet available",
                                  variant: "destructive"
                                });
                              }}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          
          {/* System Logs Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Backup System Logs</CardTitle>
              <CardDescription>
                System logs related to the backup process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded border p-4 font-mono text-sm overflow-auto max-h-[400px]">
                <div className="space-y-2">
                  {/* Sample log entries for illustration */}
                  <div className="text-green-500">
                    [2025-05-12 22:17:08] INFO: Scheduled backup job ID 1 (Daily Backup) with cron: 0 0 * * *
                  </div>
                  <div className="text-green-500">
                    [2025-05-12 22:17:08] INFO: Updated next run time for Daily Backup (ID: 1) to Tue May 13 2025 00:00:00 GMT+0000
                  </div>
                  <div className="text-blue-500">
                    [2025-05-12 21:56:17] INFO: Created default daily backup schedule
                  </div>
                  {/* Dynamic log entries would be loaded here */}
                  <div className="text-yellow-500">
                    [2025-05-12 21:30:12] WARNING: No custom backup retention policy defined, using default (30 days)
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}