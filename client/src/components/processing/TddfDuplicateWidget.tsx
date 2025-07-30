import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { apiRequest } from '@/lib/queryClient';
import { 
  AlertTriangle, 
  Trash2, 
  RefreshCw, 
  Database, 
  Search,
  CheckCircle,
  Info,
  TrendingUp,
  BarChart3
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DuplicateStats {
  totalRecords: number;
  totalFiles: number;
  dtRecords: number;
  uniqueReferences: number;
  potentialReferenceDuplicates: number;
  totalDuplicateRecords: number;
  referenceBasedDuplicates: number;
  lineBasedDuplicates: number;
  duplicatePatterns: number;
  duplicateDetails: Array<{
    duplicate_type: string;
    duplicate_key: string;
    duplicate_count: number;
    record_ids: number[];
    upload_ids: string[];
    filenames: string[];
  }>;
}

interface DuplicateStatsResponse {
  success: boolean;
  stats: DuplicateStats;
  lastScanTime: string;
  error?: string;
}

interface CleanupResponse {
  success: boolean;
  message: string;
  result: {
    totalPatterns: number;
    totalDuplicateRecords: number;
    referenceBasedDuplicates: number;
    lineBasedDuplicates: number;
    stats: DuplicateStats;
  };
  completedAt: string;
  error?: string;
}

export default function TddfDuplicateWidget() {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch duplicate statistics
  const { data: duplicateData, isLoading: duplicateLoading, refetch } = useQuery<DuplicateStatsResponse>({
    queryKey: ['/api/tddf-json/duplicate-stats'],
    queryFn: () => apiRequest('/api/tddf-json/duplicate-stats'),
    refetchInterval: 30000, // Refresh every 30 seconds
    staleTime: 25000 // Consider data stale after 25 seconds
  });

  // Cleanup duplicates mutation
  const cleanupMutation = useMutation({
    mutationFn: (): Promise<CleanupResponse> => apiRequest('/api/tddf-json/cleanup-duplicates', {
      method: 'POST',
    }),
    onSuccess: (data: CleanupResponse) => {
      if (data.success) {
        toast({
          title: "✅ Duplicate Cleanup Completed",
          description: `Successfully processed ${data.result.totalDuplicateRecords} duplicate records across ${data.result.totalPatterns} patterns.`,
        });
        
        // Refresh the duplicate stats after cleanup
        refetch();
        
        // Invalidate related queries
        queryClient.invalidateQueries({ queryKey: ['/api/tddf-json'] });
      } else {
        toast({
          title: "❌ Cleanup Failed", 
          description: data.error || "Duplicate cleanup operation failed",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      console.error('Cleanup error:', error);
      toast({
        title: "❌ Cleanup Error",
        description: error?.message || "Failed to cleanup duplicates",
        variant: "destructive",
      });
    },
  });

  const stats = duplicateData?.stats;
  const isCleaningUp = cleanupMutation.isPending;

  // Calculate duplicate severity
  const getDuplicateSeverity = () => {
    if (!stats) return 'info';
    const duplicatePercentage = (stats.totalDuplicateRecords / stats.totalRecords) * 100;
    if (duplicatePercentage > 10) return 'high';
    if (duplicatePercentage > 5) return 'medium';
    if (duplicatePercentage > 0) return 'low';
    return 'none';
  };

  const severity = getDuplicateSeverity();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'default';
      case 'low': return 'secondary';
      case 'none': return 'outline';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'high': return <AlertTriangle className="h-4 w-4" />;
      case 'medium': return <Info className="h-4 w-4" />;
      case 'low': return <TrendingUp className="h-4 w-4" />;
      case 'none': return <CheckCircle className="h-4 w-4" />;
      default: return <Database className="h-4 w-4" />;
    }
  };

  const handleDetectDuplicates = () => {
    refetch();
    toast({
      title: "🔍 Scanning for Duplicates",
      description: "Analyzing TDDF JSON records for duplicate patterns...",
    });
  };

  const handleCleanupDuplicates = () => {
    if (!stats || stats.totalDuplicateRecords === 0) {
      toast({
        title: "ℹ️ No Duplicates Found",
        description: "No duplicate records detected to cleanup.",
      });
      return;
    }

    cleanupMutation.mutate();
    toast({
      title: "🧹 Starting Cleanup",
      description: `Processing ${stats.totalDuplicateRecords} duplicate records...`,
    });
  };

  if (duplicateLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            TDDF JSON Duplicates
          </CardTitle>
          <CardDescription>Detecting duplicate records in TDDF JSON data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading duplicate analysis...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          TDDF JSON Duplicates
          {getSeverityIcon(severity)}
        </CardTitle>
        <CardDescription>Manual duplicate record detection and cleanup</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Total Records</div>
            <div className="text-2xl font-bold">{stats?.totalRecords?.toLocaleString() || 0}</div>
          </div>
          
          <div className="space-y-1">
            <div className="text-sm font-medium">Duplicate Records</div>
            <div className="text-2xl font-bold text-orange-600">
              {stats?.totalDuplicateRecords?.toLocaleString() || 0}
            </div>
          </div>
        </div>

        {/* Duplicate Status Badge */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Duplicate Status:</span>
          <Badge variant={getSeverityColor(severity)} className="flex items-center gap-1">
            {severity === 'none' ? 'Clean' : 
             severity === 'low' ? 'Low Impact' :
             severity === 'medium' ? 'Moderate' : 'High Priority'}
          </Badge>
        </div>

        {stats && stats.totalDuplicateRecords > 0 && (
          <>
            <Separator />
            
            {/* Duplicate Breakdown */}
            <div className="space-y-2">
              <div className="text-sm font-medium">Duplicate Breakdown:</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Reference-based:</span>
                  <span className="font-mono">{stats.referenceBasedDuplicates}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Line-based:</span>
                  <span className="font-mono">{stats.lineBasedDuplicates}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Patterns:</span>
                  <span className="font-mono">{stats.duplicatePatterns}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Files:</span>
                  <span className="font-mono">{stats.totalFiles}</span>
                </div>
              </div>
            </div>

            {/* Duplicate Impact */}
            {stats.totalRecords > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Impact Analysis:</div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Duplicate Percentage:</span>
                    <span className="font-mono">
                      {((stats.totalDuplicateRecords / stats.totalRecords) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <Progress 
                    value={(stats.totalDuplicateRecords / stats.totalRecords) * 100} 
                    className="h-2"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDetectDuplicates}
            disabled={duplicateLoading}
            className="flex items-center gap-2"
          >
            {duplicateLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Detect Duplicates
          </Button>
          
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCleanupDuplicates}
            disabled={isCleaningUp || !stats || stats.totalDuplicateRecords === 0}
            className="flex items-center gap-2"
          >
            {isCleaningUp ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {isCleaningUp ? 'Cleaning...' : 'Cleanup Duplicates'}
          </Button>
        </div>

        {/* Toggle Details */}
        {stats && stats.duplicateDetails && stats.duplicateDetails.length > 0 && (
          <div className="pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              {isExpanded ? 'Hide Details' : 'Show Sample Patterns'}
            </Button>

            {isExpanded && (
              <div className="mt-4 space-y-2">
                <div className="text-sm font-medium">Sample Duplicate Patterns:</div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {stats.duplicateDetails.slice(0, 5).map((pattern, index) => (
                    <div key={index} className="p-2 bg-muted rounded-md">
                      <div className="flex justify-between items-center">
                        <div className="text-xs font-medium">
                          {pattern.duplicate_type === 'reference' ? 'Reference' : 'Raw Line'} Duplicate
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {pattern.duplicate_count} copies
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono truncate">
                        {pattern.duplicate_key}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Files: {Array.from(new Set(pattern.filenames)).slice(0, 2).join(', ')}
                        {pattern.filenames.length > 2 && ` +${pattern.filenames.length - 2} more`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Status Messages */}
        {duplicateData && !duplicateData.success && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {duplicateData.error || "Failed to load duplicate statistics"}
            </AlertDescription>
          </Alert>
        )}

        {stats && stats.totalDuplicateRecords === 0 && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              No duplicate records detected. TDDF JSON data is clean.
            </AlertDescription>
          </Alert>
        )}

        {/* Last Scan Time - Enhanced Display */}
        {duplicateData?.lastScanTime && (
          <div className="pt-3 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last Scan Completed:</span>
              <div className="text-right">
                <div className="font-mono text-sm">
                  {new Date(duplicateData.lastScanTime).toLocaleString()}
                </div>
                <div className="text-muted-foreground">
                  {(() => {
                    const scanTime = new Date(duplicateData.lastScanTime);
                    const now = new Date();
                    const diffMs = now.getTime() - scanTime.getTime();
                    const diffMinutes = Math.floor(diffMs / 60000);
                    const diffHours = Math.floor(diffMinutes / 60);
                    
                    if (diffMinutes < 1) return 'Just now';
                    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
                    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                    const diffDays = Math.floor(diffHours / 24);
                    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}