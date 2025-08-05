import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { RefreshCw, Database, HardDrive, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MigrationStatus {
  success: boolean;
  summary: {
    totalTables: number;
    totalSizeMB: number;
    migratedTables: number;
    pendingTables: number;
    totalRecords: number;
    migratedRecords: number;
  };
  tables: Array<{
    tablename: string;
    size_mb: number;
    total_records: number;
    migrated_records: number;
    migration_complete: boolean;
  }>;
}

interface MigrationResult {
  success: boolean;
  tableName?: string;
  recordsProcessed?: number;
  spaceSavedMB?: number;
  tablesProcessed?: number;
  totalRecords?: number;
  error?: string;
  errors?: string[];
}

export function HybridMigrationDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch migration status
  const { data: migrationStatus, isLoading, error, refetch } = useQuery<MigrationStatus>({
    queryKey: ['/api/tddf1/hybrid-migration/status'],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Migration mutations
  const migrateTableMutation = useMutation({
    mutationFn: async (tableName: string) => {
      const response = await fetch('/api/tddf1/hybrid-migration/migrate-table', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName }),
      });
      if (!response.ok) throw new Error('Migration failed');
      return response.json();
    },
    onSuccess: (data: MigrationResult) => {
      if (data.success) {
        toast({
          title: "Migration Complete",
          description: `Successfully migrated ${data.tableName}: ${data.recordsProcessed} records, ~${data.spaceSavedMB}MB saved`,
        });
      } else {
        toast({
          title: "Migration Failed",
          description: data.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/tddf1/hybrid-migration/status'] });
    },
    onError: (error) => {
      toast({
        title: "Migration Error",
        description: error instanceof Error ? error.message : "Failed to migrate table",
        variant: "destructive",
      });
    },
  });

  const migrateAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/tddf1/hybrid-migration/migrate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Migration failed');
      return response.json();
    },
    onSuccess: (data: MigrationResult) => {
      if (data.success) {
        toast({
          title: "Bulk Migration Complete",
          description: `Successfully migrated ${data.tablesProcessed} tables, ${data.totalRecords} records, ~${data.spaceSavedMB}MB saved`,
        });
      } else {
        toast({
          title: "Bulk Migration Had Errors",
          description: `Completed with ${data.errors?.length || 0} errors`,
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/tddf1/hybrid-migration/status'] });
    },
    onError: (error) => {
      toast({
        title: "Migration Error",
        description: error instanceof Error ? error.message : "Failed to migrate all tables",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Loading Hybrid Migration Status...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !migrationStatus?.success) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Migration Status Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Failed to Load Migration Status</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "Unknown error occurred"}
            </AlertDescription>
          </Alert>
          <Button onClick={() => refetch()} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { summary, tables } = migrationStatus;
  const migrationProgress = summary.totalRecords > 0 ? (summary.migratedRecords / summary.totalRecords) * 100 : 0;
  const estimatedSavings = Math.round(summary.totalSizeMB * 0.7); // Estimate 70% savings from raw_line removal

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Total Tables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalTables}</div>
            <div className="text-xs text-gray-500">{summary.totalSizeMB}MB total</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Migration Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.migratedTables}/{summary.totalTables}</div>
            <Progress value={migrationProgress} className="mt-2" />
            <div className="text-xs text-gray-500 mt-1">{migrationProgress.toFixed(1)}% complete</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Records Migrated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.migratedRecords.toLocaleString()}</div>
            <div className="text-xs text-gray-500">of {summary.totalRecords.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Est. Space Savings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">~{estimatedSavings}MB</div>
            <div className="text-xs text-gray-500">when fully migrated</div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            Hybrid Migration Actions
          </CardTitle>
          <CardDescription>
            Migrate raw TDDF line data to object storage to reduce database size by ~70%
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button
              onClick={() => migrateAllMutation.mutate()}
              disabled={migrateAllMutation.isPending || summary.pendingTables === 0}
              className="flex-1"
            >
              {migrateAllMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Migrate All Tables ({summary.pendingTables} pending)
            </Button>
            
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh Status
            </Button>
          </div>

          {summary.pendingTables === 0 && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Migration Complete</AlertTitle>
              <AlertDescription>
                All tables have been successfully migrated to hybrid storage.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Detailed Table Status */}
      <Card>
        <CardHeader>
          <CardTitle>Table Migration Status</CardTitle>
          <CardDescription>
            Individual table migration progress and actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {tables.map((table) => (
              <div key={table.tablename} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium">{table.tablename}</h4>
                    <Badge variant={table.migration_complete ? "default" : "secondary"}>
                      {table.migration_complete ? (
                        <CheckCircle className="h-3 w-3 mr-1" />
                      ) : (
                        <Clock className="h-3 w-3 mr-1" />
                      )}
                      {table.migration_complete ? "Complete" : "Pending"}
                    </Badge>
                  </div>
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Size: {table.size_mb}MB</div>
                    <div>Records: {table.total_records.toLocaleString()}</div>
                    {table.migration_complete && (
                      <div className="text-green-600">
                        ✓ {table.migrated_records.toLocaleString()} records migrated
                      </div>
                    )}
                  </div>
                  
                  {!table.migration_complete && (
                    <Progress 
                      value={(table.migrated_records / table.total_records) * 100} 
                      className="mt-2 w-64"
                    />
                  )}
                </div>

                <div className="ml-4">
                  {!table.migration_complete && (
                    <Button
                      size="sm"
                      onClick={() => migrateTableMutation.mutate(table.tablename)}
                      disabled={migrateTableMutation.isPending}
                    >
                      {migrateTableMutation.isPending ? (
                        <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Database className="h-3 w-3 mr-1" />
                      )}
                      Migrate
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Information Panel */}
      <Card>
        <CardHeader>
          <CardTitle>How Hybrid Migration Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Before Migration</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Raw TDDF lines stored in database (701 bytes each)</li>
                <li>• High storage cost and slow queries</li>
                <li>• Database approaching size limits</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">After Migration</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Raw lines moved to object storage (90% cheaper)</li>
                <li>• Structured data remains in database for fast queries</li>
                <li>• 50-70% database size reduction</li>
              </ul>
            </div>
          </div>
          
          <Separator />
          
          <div className="text-sm text-gray-600">
            <strong>Object Storage Status:</strong> Ready and configured<br />
            <strong>Bucket:</strong> replit-objstore-2d053f4f-0a25-4fdd-b302-dd7298211d11<br />
            <strong>Private Directory:</strong> /replit-objstore-e0acf0f3-df6d-4a2c-83c6-1b949ccc44ae/.private
          </div>
        </CardContent>
      </Card>
    </div>
  );
}