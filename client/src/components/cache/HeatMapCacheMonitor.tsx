import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Calendar, Clock, Play, RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface HeatMapCacheJob {
  id: string;
  year: number;
  recordType: string;
  status: 'running' | 'completed' | 'failed' | 'pending';
  startedAt: string;
  completedAt?: string;
  totalMonths: number;
  completedMonths: number;
  currentMonth?: number;
  errorMessage?: string;
}

// Helper function to get month name from month number
const getMonthName = (monthNumber: number): string => {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  return months[monthNumber - 1] || `Month ${monthNumber}`;
};

export function HeatMapCacheMonitor() {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedRecordType, setSelectedRecordType] = useState<string>('DT');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all active jobs
  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['/api/heat-map-cache/jobs'],
    refetchInterval: 2000, // Refresh every 2 seconds
  });

  // Start rebuild mutation
  const startRebuildMutation = useMutation({
    mutationFn: async ({ year, recordType }: { year: number; recordType: string }) => {
      const response = await fetch('/api/heat-map-cache/rebuild', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ year, recordType }),
      });

      if (!response.ok) {
        throw new Error('Failed to start cache rebuild');
      }

      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Cache Rebuild Started",
        description: `Heat map cache rebuild for ${data.year} has been started. Job ID: ${data.jobId}`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/heat-map-cache/jobs'] });
    },
    onError: (error) => {
      toast({
        title: "Failed to Start Rebuild",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const handleStartRebuild = () => {
    startRebuildMutation.mutate({
      year: selectedYear,
      recordType: selectedRecordType,
    });
  };

  const jobs: HeatMapCacheJob[] = (jobsData as any)?.jobs || [];
  const activeJobs = jobs.filter(job => job.status === 'running');
  const recentJobs = jobs.slice(0, 5); // Show last 5 jobs

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variant = status === 'completed' ? 'default' : 
                   status === 'running' ? 'secondary' :
                   status === 'failed' ? 'destructive' : 'outline';
    
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        {getStatusIcon(status)}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      {/* Start New Rebuild */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Start Heat Map Cache Rebuild
          </CardTitle>
          <CardDescription>
            Rebuild cached data for heat map visualizations. This process runs month-by-month for better performance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Year</label>
              <Select value={selectedYear.toString()} onValueChange={(value) => setSelectedYear(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex-1">
              <label className="text-sm font-medium">Record Type</label>
              <Select value={selectedRecordType} onValueChange={setSelectedRecordType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DT">DT (Transactions)</SelectItem>
                  <SelectItem value="BH">BH (Batch Headers)</SelectItem>
                  <SelectItem value="P1">P1 (Purchasing)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button 
              onClick={handleStartRebuild} 
              disabled={startRebuildMutation.isPending}
              className="px-6"
            >
              {startRebuildMutation.isPending ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Start Rebuild
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin" />
              Active Rebuild Jobs
            </CardTitle>
            <CardDescription>
              Currently running cache rebuild operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeJobs.map((job) => {
                const progressPercent = Math.round((job.completedMonths / job.totalMonths) * 100);
                
                return (
                  <div key={job.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{job.year} {job.recordType}</span>
                        {getStatusBadge(job.status)}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {job.completedMonths}/{job.totalMonths} months
                      </span>
                    </div>
                    
                    <div className="space-y-2">
                      <Progress value={progressPercent} className="h-2" />
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Progress: {progressPercent}%</span>
                        {job.currentMonth && (
                          <span>Processing: {getMonthName(job.currentMonth)} {job.year}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-2 text-xs text-muted-foreground">
                      Started: {new Date(job.startedAt).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Jobs History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Cache Rebuilds</CardTitle>
          <CardDescription>
            History of recent heat map cache rebuild operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading jobs...
            </div>
          ) : recentJobs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No cache rebuild jobs found
            </div>
          ) : (
            <div className="space-y-3">
              {recentJobs.map((job) => (
                <div key={job.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{job.year} {job.recordType}</div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(job.startedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {job.status === 'completed' && job.completedAt && (
                      <div className="text-sm text-muted-foreground">
                        Completed in {Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000 / 60)} min
                      </div>
                    )}
                    {job.status === 'failed' && job.errorMessage && (
                      <div className="text-sm text-red-600 max-w-xs truncate" title={job.errorMessage}>
                        {job.errorMessage}
                      </div>
                    )}
                    {getStatusBadge(job.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}