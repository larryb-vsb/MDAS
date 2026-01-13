import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, Circle, Database, AlertTriangle, Play, Pause, RotateCcw } from 'lucide-react';
// import { apiRequest } from '@/lib/queryClient'; // Using fetch directly

interface MigrationStatus {
  success: boolean;
  pendingDtRecords: number;
  hierarchicalTddfRecords: number;
  legacyTddfRecords: number;
  migrationNeeded: boolean;
  tablesReady: boolean;
}

interface MigrationResult {
  success: boolean;
  message: string;
  processed: number;
  errors: number;
  remainingCount: number;
  durationMs: number;
  batchSize: number;
  sampleRecord?: any;
}

export default function HierarchicalTddfMigration() {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [batchSize, setBatchSize] = useState(1000);

  // Fetch migration status
  const fetchMigrationStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/hierarchical-tddf/migration-status');
      const data = await response.json();
      
      if (data.success) {
        setStatus(data);
      } else {
        setError(data.error || 'Failed to fetch migration status');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch migration status');
      console.error('Migration status error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Test single record migration
  const testMigration = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/hierarchical-tddf/test-hierarchical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json();
      
      if (data.success) {
        setMigrationResult(data);
        fetchMigrationStatus(); // Refresh status
      } else {
        setError(data.error || 'Test migration failed');
      }
    } catch (err: any) {
      setError(err.message || 'Test migration failed');
      console.error('Test migration error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Run migration batch
  const runMigrationBatch = async () => {
    try {
      setIsMigrating(true);
      setError(null);
      
      const response = await fetch('/api/hierarchical-tddf/migrate-pending-dt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize })
      });
      const data = await response.json();
      
      if (data.success) {
        setMigrationResult(data);
        setTotalProcessed(prev => prev + data.processed);
        fetchMigrationStatus(); // Refresh status
      } else {
        setError(data.error || 'Migration batch failed');
      }
    } catch (err: any) {
      setError(err.message || 'Migration batch failed');
      console.error('Migration batch error:', err);
    } finally {
      setIsMigrating(false);
    }
  };

  // Auto-migration loop
  const runAutoMigration = async () => {
    if (!status?.migrationNeeded) return;
    
    setIsMigrating(true);
    let currentProcessed = 0;
    
    try {
      while (status && status.pendingDtRecords > 0) {
        await runMigrationBatch();
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between batches
        await fetchMigrationStatus();
        
        // Update progress
        currentProcessed += batchSize;
        if (currentProcessed >= status.pendingDtRecords) break;
      }
    } catch (err: any) {
      setError(err.message || 'Auto-migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  useEffect(() => {
    fetchMigrationStatus();
  }, []);

  const migrationProgress = status ? 
    ((status.hierarchicalTddfRecords / (status.pendingDtRecords + status.hierarchicalTddfRecords)) * 100) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Hierarchical TDDF Migration
          </CardTitle>
          <CardDescription>
            Migrate pending DT records from raw import table to hierarchical TDDF structure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-900">Pending DT Records</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {isLoading ? '...' : status?.pendingDtRecords?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <Circle className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-900">Hierarchical Records</p>
                    <p className="text-2xl font-bold text-green-900">
                      {isLoading ? '...' : status?.hierarchicalTddfRecords?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-gray-200 bg-gray-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Legacy Records</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {isLoading ? '...' : status?.legacyTddfRecords?.toLocaleString() || '0'}
                    </p>
                  </div>
                  <Database className="h-8 w-8 text-gray-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Migration Progress */}
          {status && status.migrationNeeded && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Migration Progress</span>
                <span>{migrationProgress.toFixed(1)}%</span>
              </div>
              <Progress value={migrationProgress} className="h-2" />
              <p className="text-xs text-gray-600">
                {status.hierarchicalTddfRecords.toLocaleString()} of {(status.pendingDtRecords + status.hierarchicalTddfRecords).toLocaleString()} records migrated
              </p>
            </div>
          )}

          {/* Migration Status */}
          <div className="flex flex-wrap gap-2">
            <Badge variant={status?.tablesReady ? 'default' : 'destructive'}>
              {status?.tablesReady ? 'Tables Ready' : 'Tables Not Ready'}
            </Badge>
            <Badge variant={status?.migrationNeeded ? 'secondary' : 'default'}>
              {status?.migrationNeeded ? 'Migration Needed' : 'Migration Complete'}
            </Badge>
            {totalProcessed > 0 && (
              <Badge variant="outline">
                {totalProcessed.toLocaleString()} Processed This Session
              </Badge>
            )}
          </div>

          <Separator />

          {/* Migration Controls */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Batch Size:</label>
              <select 
                value={batchSize} 
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="border rounded px-2 py-1 text-sm"
                disabled={isMigrating}
              >
                <option value={100}>100 records</option>
                <option value={500}>500 records</option>
                <option value={1000}>1,000 records</option>
                <option value={2000}>2,000 records</option>
                <option value={5000}>5,000 records</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={fetchMigrationStatus} 
                disabled={isLoading || isMigrating}
                variant="outline"
                size="sm"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Refresh Status
              </Button>

              <Button 
                onClick={testMigration} 
                disabled={isLoading || isMigrating || !status?.migrationNeeded}
                variant="outline"
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Test (1 Record)
              </Button>

              <Button 
                onClick={runMigrationBatch} 
                disabled={isLoading || isMigrating || !status?.migrationNeeded}
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Run Batch ({batchSize.toLocaleString()})
              </Button>

              <Button 
                onClick={runAutoMigration} 
                disabled={isLoading || isMigrating || !status?.migrationNeeded}
                variant="secondary"
                size="sm"
              >
                <Play className="h-4 w-4 mr-2" />
                Auto-Migrate All
              </Button>
            </div>
          </div>

          {/* Results */}
          {migrationResult && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Migration Result:</strong> {migrationResult.message}<br />
                Processed: {migrationResult.processed} | Errors: {migrationResult.errors} | 
                Duration: {migrationResult.durationMs}ms
                {migrationResult.remainingCount > 0 && (
                  <span> | Remaining: {migrationResult.remainingCount.toLocaleString()}</span>
                )}
                {migrationResult.sampleRecord && (
                  <div className="mt-2 text-xs">
                    Sample: {migrationResult.sampleRecord.reference_number} - 
                    ${migrationResult.sampleRecord.transaction_amount} - 
                    {migrationResult.sampleRecord.merchant_name}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>Error:</strong> {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Loading State */}
          {(isLoading || isMigrating) && (
            <Alert>
              <AlertDescription>
                {isMigrating ? 'Running migration...' : 'Loading...'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}