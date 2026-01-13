import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { formatRelativeTime, formatDetailedDate } from "@/lib/date-utils";
import {
  AlertCircle,
  RefreshCw,
  Loader2,
  Play,
  Activity,
  Info
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ProcessingStatus {
  isRunning: boolean;
  nextScheduledRun: string | null;
  lastRunTime: string | null;
  queuedFiles: any[];
  processingErrors: Record<string, string>;
  processedFileCount: number;
}

export default function FileProcessorStatus() {
  const { toast } = useToast();

  // Fetch the processor status
  const { 
    data: status, 
    isLoading: isStatusLoading,
    refetch: refetchStatus
  } = useQuery<ProcessingStatus>({
    queryKey: ["/api/file-processor/status"],
    refetchInterval: 5000, // Poll every 5 seconds to keep status updated
    staleTime: 2000
  });

  // Fetch real-time database statistics for accurate file counts
  const { data: realTimeStats, isLoading: isStatsLoading } = useQuery<RealTimeStats>({
    queryKey: ["/api/processing/real-time-stats"],
    refetchInterval: 2000, // Update every 2 seconds
    staleTime: 0, // Always consider data stale to force fresh requests
  });

  // Trigger processing manually
  const forceProcessMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/file-processor/force-process", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to trigger file processing");
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Processing triggered",
        description: "File processing has been triggered manually.",
      });
      
      // Refresh the status immediately and then again after a short delay
      refetchStatus();
      
      // Invalidate the uploads query to refresh the file list
      queryClient.invalidateQueries({ queryKey: ["/api/uploads/history"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to trigger processing",
        variant: "destructive",
      });
    }
  });

  // Use centralized date utilities with proper UTC to local conversion
  function formatDate(dateString: string | null) {
    return formatDetailedDate(dateString);
  }

  function formatRelativeDate(dateString: string | null) {
    return formatRelativeTime(dateString);
  }

  if (isStatusLoading || isStatsLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-md font-medium flex items-center">
            <Activity className="mr-2 h-4 w-4" />
            File Processor Status
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-2 pt-0">
          <div className="flex justify-center py-4">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasErrors = status && Object.keys(status.processingErrors).length > 0;
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-md font-medium flex items-center">
          <Activity className="mr-2 h-4 w-4" />
          File Processor Status
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-1">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  File processor runs automatically in the background to process new or unprocessed files.
                  You can trigger it manually using the "Process Now" button.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2 pt-0">
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge variant={status?.isRunning ? "outline" : "secondary"}>
              {status?.isRunning ? (
                <span className="flex items-center">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  Running
                </span>
              ) : (
                "Idle"
              )}
            </Badge>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Last run:</span>
            <span className="text-sm">{status?.lastRunTime ? formatRelativeDate(status.lastRunTime) : "Never"}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Next scheduled run:</span>
            <span className="text-sm">{status?.nextScheduledRun ? formatRelativeDate(status.nextScheduledRun) : "Not scheduled"}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Files processed:</span>
            <span className="text-sm">{realTimeStats?.processedFiles || status?.processedFileCount || 0}</span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Files in queue:</span>
            <span className="text-sm">{realTimeStats?.queuedFiles || status?.queuedFiles?.length || 0}</span>
          </div>
          
          {hasErrors && (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="processing-errors">
                <AccordionTrigger className="text-sm text-red-500 py-2">
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    {Object.keys(status!.processingErrors).length} Processing Errors
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="bg-muted rounded-md p-2 text-xs">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-1/4">File ID</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(status!.processingErrors).map(([fileId, error]) => (
                          <TableRow key={fileId}>
                            <TableCell className="font-mono">{fileId}</TableCell>
                            <TableCell className="text-red-500">{error}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        <div className="flex gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => refetchStatus()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={() => forceProcessMutation.mutate()}
            disabled={forceProcessMutation.isPending || (status?.isRunning ?? false)}
          >
            {forceProcessMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Triggering...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Process Now
              </>
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}