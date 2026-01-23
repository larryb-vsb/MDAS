import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Database, Key, Settings, Monitor, Download, FileText, Search, Filter, Eye, Copy, Check, Trash2, CheckSquare, Square, Calendar as CalendarIcon, ChevronLeft, ChevronRight, BarChart3, TrendingUp, DollarSign, Activity, ArrowLeft, CheckCircle, AlertCircle, Clock, Play, Zap, MoreVertical, MoreHorizontal, ChevronUp, ChevronDown, Pause, EyeOff, ExternalLink, X, Lightbulb, RefreshCw, CreditCard, AlertTriangle, RotateCcw } from "lucide-react";
import { format, addDays, subDays, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { TddfApiDailyView } from "@/components/TddfApiDailyView";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { UploaderUpload } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';
import { formatFileSize, getStatusBadgeVariant, TddfApiFile, TddfApiSchema } from '@/lib/tddf-shared';
import { EnhancedProcessingQueue } from "@/components/processing/EnhancedProcessingQueue";
import { DT_FIELDS, getDTFieldByKey } from "@shared/dtFields";

// Timing Display Component for Step-6/JSONB Encoding Times
function TimingDisplay({ uploadId }: { uploadId: string }) {
  const { data: timing, isLoading } = useQuery({
    queryKey: ['/api/uploader', uploadId, 'timing'],
    queryFn: () => apiRequest(`/api/uploader/${uploadId}/timing`),
    enabled: !!uploadId,
    refetchInterval: 5000, // Refetch every 5 seconds to catch timing updates
    staleTime: 0, // Consider data stale immediately so it refetches more often
    retry: 1 // Retry once if it fails
  });

  // Show loading state briefly
  if (isLoading) {
    return (
      <span className="text-gray-500">loading...</span>
    );
  }

  if (!timing || !(timing as any)?.success || !(timing as any)?.hasTiming) {
    return <span className="text-gray-500">no timing data</span>; // Show when no timing data
  }

  return (
    <span className="text-blue-600">{(timing as any).duration}</span>
  );
}

// Warning Details Component
interface WarningDetails {
  hasWarnings: boolean;
  warnings: Array<{
    timestamp: string;
    message: string;
    source: string;
    type: string;
    details: any;
  }>;
  currentStatus: string;
  uploadStatus: string;
  filename: string;
  warningCount: number;
  lastWarningAt: string;
  canReset: boolean;
}

function WarningDialog({ uploadId, filename, open, onOpenChange }: { 
  uploadId: string; 
  filename: string; 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch warning details
  const { data: warningData, isLoading } = useQuery<WarningDetails>({
    queryKey: ['/api/uploader', uploadId, 'warnings'],
    queryFn: () => apiRequest(`/api/uploader/${uploadId}/warnings`),
    enabled: open && !!uploadId
  });

  // Reset warning mutation
  const resetWarningMutation = useMutation({
    mutationFn: (uploadId: string) => 
      apiRequest(`/api/uploader/${uploadId}/reset-warning`, {
        method: 'POST',
        body: JSON.stringify({ confirmReset: true })
      }),
    onSuccess: () => {
      toast({
        title: "Warning Reset Successfully",
        description: "The warning status has been cleared and the file is ready for reprocessing."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to reset warning status",
        variant: "destructive"
      });
    }
  });

  const handleResetWarning = () => {
    if (warningData?.canReset) {
      resetWarningMutation.mutate(uploadId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            Warning Details
          </DialogTitle>
          <DialogDescription>
            {filename} - Warning information and recovery options
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading warning details...
          </div>
        ) : !warningData?.hasWarnings ? (
          <div className="text-center p-8">
            <CheckCircle className="h-12 w-12 mx-auto text-green-600 mb-4" />
            <p className="text-lg font-medium">No Warnings Found</p>
            <p className="text-muted-foreground">This file is not currently in warning status.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Warning Summary */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-yellow-800">File Warning Status</h3>
                  <p className="text-sm text-yellow-700 mt-1">
                    Current Phase: <Badge variant="outline" className="ml-1">{warningData.currentStatus}</Badge>
                  </p>
                  {warningData.lastWarningAt && (
                    <p className="text-xs text-yellow-600 mt-1">
                      Last warning: {format(new Date(warningData.lastWarningAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Warning Details */}
            <div className="space-y-3">
              <h4 className="font-medium">Warning Details ({warningData.warnings.length})</h4>
              {warningData.warnings.map((warning, index) => (
                <div key={index} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {warning.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          from {warning.source}
                        </span>
                      </div>
                      <p className="text-sm">{warning.message}</p>
                      {warning.timestamp && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(warning.timestamp), "MMM d, yyyy 'at' h:mm:ss a")}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Technical Details (Expandable) */}
                  {warning.details && Object.keys(warning.details).length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                        View technical details
                      </summary>
                      <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto max-h-32">
                        {JSON.stringify(warning.details, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {warningData.canReset ? (
                  <p>You can reset this warning to retry processing.</p>
                ) : (
                  <p>Warning cannot be reset at this time.</p>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                {warningData.canReset && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        variant="default" 
                        className="bg-yellow-600 hover:bg-yellow-700"
                        disabled={resetWarningMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset Warning
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset Warning Status</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will clear the warning status and reset the file to continue processing. 
                          The warning information will be logged for audit purposes.
                          <br /><br />
                          <strong>File:</strong> {filename}
                          <br />
                          <strong>Current Status:</strong> {warningData.currentStatus}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={handleResetWarning}
                          className="bg-yellow-600 hover:bg-yellow-700"
                          disabled={resetWarningMutation.isPending}
                        >
                          {resetWarningMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Resetting...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="h-4 w-4 mr-2" />
                              Reset Warning
                            </>
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// File types for upload
const FILE_TYPES = [
  { value: 'tddf', label: 'TDDF (.TSYSO)', description: 'TSYS Transaction Daily Detail File .TSYSO file 2400 or 0830 ex VERMNTSB.6759_TDDF_2400_07112025_003301.TSYSO' },
  { value: 'ach_merchant', label: 'ACH Merchant (.csv)', description: 'Custom Merchant Demographics .csv file' },
  { value: 'ach_transactions', label: 'ACH Transactions (.csv)', description: 'Horizon Core ACH Processing Detail File AH0314P1 .csv file' },
  { value: 'mastercard_di', label: 'MasterCard DI Report (.xlms)', description: 'MasterCard Data Integrity Edit Report records .xlms file' }
];

// Card type badge configuration
function getCardTypeBadges(cardType: string) {
  const badges: Record<string, { label: string; className: string }> = {
    'VD': { label: 'Visa Debit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'VC': { label: 'Visa Credit', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    'MD': { label: 'Mastercard Debit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'MC': { label: 'Mastercard Credit', className: 'bg-orange-50 text-orange-700 border-orange-200' },
    'AX': { label: 'American Express', className: 'bg-green-50 text-green-700 border-green-200' },
    'DS': { label: 'Discover', className: 'bg-purple-50 text-purple-700 border-purple-200' },
    'DI': { label: 'Diners Club', className: 'bg-gray-50 text-gray-700 border-gray-200' },
    'JC': { label: 'JCB', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  };
  return badges[cardType] || { label: cardType, className: 'bg-gray-50 text-gray-700 border-gray-200' };
}

// Helper function to extract card type from record
function extractCardType(record: any): string | null {
  // First try extracted_fields, then dynamically extract from raw line
  let cardType = record.parsed_data?.cardType || record.record_data?.cardType;
  
  // Dynamic extraction from positions 253-254 (1-based inclusive)
  if (!cardType && record.raw_data && record.raw_data.length >= 254) {
    cardType = record.raw_data.substring(252, 254).trim() || null;
  }
  
  // Normalize to uppercase and trim
  return cardType ? cardType.toUpperCase().trim() : null;
}

// Helper function to extract merchant account number from record
function extractMerchantAccountNumber(record: any): string | null {
  // Try various sources for merchantAccountNumber
  let merchantAccountNumber = record.parsed_data?.merchantAccountNumber || 
                              record.record_data?.merchantAccountNumber ||
                              record.parsed_data?.merchant_account_number ||
                              record.record_data?.merchant_account_number;
  
  // For BH records, also try specific BH field names
  if (!merchantAccountNumber && (record.record_type === 'BH' || record.record_type === '10')) {
    merchantAccountNumber = record.parsed_data?.acquirerBin || 
                           record.record_data?.acquirerBin ||
                           record.parsed_data?.acquirer_bin ||
                           record.record_data?.acquirer_bin;
  }
  
  // Return trimmed string or null
  return merchantAccountNumber ? merchantAccountNumber.toString().trim() : null;
}

// Helper function to extract batch date from BH record
function extractBatchDate(record: any): string | null {
  const batchDate = record.parsed_data?.batchDate || 
                    record.record_data?.batchDate ||
                    record.parsed_data?.batch_date ||
                    record.record_data?.batch_date;
  
  const batchJulianDate = record.parsed_data?.batchJulianDate || 
                          record.record_data?.batchJulianDate ||
                          record.parsed_data?.batch_julian_date ||
                          record.record_data?.batch_julian_date;
  
  return batchDate || batchJulianDate || null;
}

// Queue Status Monitor Component
function QueueStatusMonitor() {
  const { data: queueStatus, isLoading } = useQuery({
    queryKey: ['/api/uploader/queue-status'],
    refetchInterval: 5000,
    staleTime: 3000
  });

  if (isLoading || !queueStatus) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  const status = queueStatus as any;
  const totals = status.totals || {};
  const metrics = status.processingMetrics || {};
  const estimates = status.estimates || {};

  const hasQueue = totals.uploaded > 0 || totals.identified > 0 || totals.encoded > 0;
  const isProcessing = totals.processing > 0 || totals.encoding > 0;

  return (
    <div className="space-y-3">
      {/* Queue Status Overview */}
      {hasQueue && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800">Processing Queue</span>
            </div>
            <Badge variant="outline" className="bg-white">
              {metrics.avgRecordsPerSecond ? 
                `${Math.round(metrics.avgRecordsPerSecond)} rec/sec` : 
                'Processing'
              }
            </Badge>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {totals.uploaded > 0 && (
              <div className="bg-white p-2 rounded border border-blue-200">
                <div className="text-xs text-muted-foreground">Uploaded</div>
                <div className="text-lg font-bold text-blue-600">{totals.uploaded}</div>
              </div>
            )}
            {totals.identified > 0 && (
              <div className="bg-white p-2 rounded border border-blue-200">
                <div className="text-xs text-muted-foreground">Identified</div>
                <div className="text-lg font-bold text-blue-600">{totals.identified}</div>
              </div>
            )}
            {totals.encoding > 0 && (
              <div className="bg-white p-2 rounded border border-yellow-200">
                <div className="text-xs text-muted-foreground">Encoding</div>
                <div className="text-lg font-bold text-yellow-600 animate-pulse">{totals.encoding}</div>
              </div>
            )}
            {totals.encoded > 0 && (
              <div className="bg-white p-2 rounded border border-purple-200">
                <div className="text-xs text-muted-foreground">Encoded</div>
                <div className="text-lg font-bold text-purple-600">{totals.encoded}</div>
              </div>
            )}
            {totals.processing > 0 && (
              <div className="bg-white p-2 rounded border border-green-200">
                <div className="text-xs text-muted-foreground">Processing</div>
                <div className="text-lg font-bold text-green-600 animate-pulse">{totals.processing}</div>
              </div>
            )}
          </div>

          {estimates.encodedQueueCount > 0 && (
            <div className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
              <Clock className="h-3 w-3 inline mr-1" />
              Est. completion: ~{estimates.estimatedCompletionMinutes} min for {estimates.encodedQueueCount} encoded files
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Helper function to extract transaction date from DT record
function extractTransactionDate(record: any): string | null {
  const transactionDate = record.parsed_data?.TransactionDate || 
                         record.record_data?.TransactionDate ||
                         record.parsed_data?.transactionDate ||
                         record.record_data?.transactionDate ||
                         record.parsed_data?.transaction_date ||
                         record.record_data?.transaction_date;
  
  return transactionDate ? transactionDate.toString().trim() : null;
}

// Helper function to extract transaction amount from DT record
function extractTransactionAmount(record: any): number | null {
  const transactionAmount = record.parsed_data?.TransactionAmount || 
                           record.record_data?.TransactionAmount ||
                           record.parsed_data?.transactionAmount ||
                           record.record_data?.transactionAmount ||
                           record.parsed_data?.transaction_amount ||
                           record.record_data?.transaction_amount;
  
  if (transactionAmount !== null && transactionAmount !== undefined) {
    const amount = parseFloat(transactionAmount.toString());
    return isNaN(amount) ? null : amount;
  }
  
  return null;
}

// Helper functions and interfaces now imported from shared library

// Daily View Interfaces for TDDF API Data
interface TddfApiDailyStats {
  totalFiles: number;
  totalRecords: number;
  totalTransactionValue: number;
  totalNetDeposits?: number;
  totalAuthAmount?: number;
  recordTypeBreakdown: Record<string, number>;
  lastProcessedDate: string | null;
  cached?: boolean;
  cacheDate?: string;
  lastUpdated?: string;
}

interface TddfApiDayBreakdown {
  date: string;
  totalRecords: number;
  recordTypes: Record<string, number>;
  transactionValue: number;
  netDepositsValue?: number;
  authAmountValue?: number;
  batchCount?: number;
  authorizationCount?: number;
  fileCount: number;
  filesProcessed: Array<{
    fileName: string;
    recordCount: number;
    processingTime?: number;
    fileSize?: string;
  }>;
}

interface TddfApiRecentActivity {
  id: string;
  fileName: string;
  recordCount: number;
  processedAt: string;
  status: string;
  importSessionId: string;
}

// Draggable Circles for Daily View
interface DraggableCircle {
  id: string;
  x: number;
  y: number;
  color: string;
  value: string;
  label: string;
  isDragging: boolean;
}

interface TddfApiKey {
  id: number;
  keyName: string;
  keyPrefix: string;
  permissions: string[];
  isActive: boolean;
  lastUsed?: string;
  requestCount: number;
  rateLimitPerMinute: number;
  createdAt: string;
  expiresAt?: string;
}

// API Response Interfaces
interface AutoStep6Setting {
  autoStep6Enabled: boolean;
}

interface AutoStep6SettingResponse {
  message: string;
  autoStep6Enabled: boolean;
}

interface AutoStep7Setting {
  autoStep7Enabled: boolean;
}

interface AutoStep7SettingResponse {
  message: string;
  autoStep7Enabled: boolean;
}

interface WarningResetResponse {
  resetCount: number;
  message: string;
}

// Raw Data Tab Component
// Tree View Display Component
interface TreeViewDisplayProps {
  records: any[];
  expandedBatches: Set<string>;
  expandedTransactions: Set<string>;
  onToggleBatch: (index: number) => void;
  onToggleTransaction: (batchIndex: number, transactionIndex: number) => void;
  getRecordTypeBadgeColor: (type: string) => string;
  getRecordTypeName: (type: string) => string;
  formatFieldValue: (key: string, value: any) => string;
  groupRecordsHierarchically: (records: any[]) => any[];
  getMerchantName: (merchantAccountNumber: string | null) => string | null;
}

function TreeViewDisplay({ 
  records, 
  expandedBatches, 
  expandedTransactions, 
  onToggleBatch, 
  onToggleTransaction, 
  getRecordTypeBadgeColor, 
  getRecordTypeName, 
  formatFieldValue, 
  groupRecordsHierarchically,
  getMerchantName
}: TreeViewDisplayProps) {
  const hierarchicalData = groupRecordsHierarchically(records);

  return (
    <div className="space-y-3">
      {hierarchicalData.map((batch, batchIndex) => {
        const batchKey = `batch-${batchIndex}`;
        const isExpanded = expandedBatches.has(batchKey);
        
        return (
          <Card key={batchIndex} className="border-l-4 border-l-green-500">
            {/* Batch Header */}
            <CardHeader className="pb-2">
              <div 
                className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 -m-3 p-3 rounded"
                onClick={() => onToggleBatch(batchIndex)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                )}
                
                {batch.batchHeader ? (
                  <>
                    <Badge className={`text-white ${getRecordTypeBadgeColor(batch.batchHeader.record_type)}`}>
                      {batch.batchHeader.record_type}
                    </Badge>
                    <span className="font-medium">{getRecordTypeName(batch.batchHeader.record_type)}</span>
                    <span className="text-sm text-gray-600">Line {batch.batchHeader.line_number}</span>
                    
                    {/* Merchant Account Number and Name for BH records */}
                    {(() => {
                      const merchantAccountNumber = extractMerchantAccountNumber(batch.batchHeader);
                      const merchantName = getMerchantName(merchantAccountNumber);
                      return merchantAccountNumber ? (
                        <div className="flex flex-col">
                          <span 
                            className="text-sm font-bold text-blue-600"
                            data-testid="bh-merchant-account-number"
                          >
                            • {merchantAccountNumber}
                          </span>
                          {merchantName && (
                            <span className="text-xs font-semibold text-green-600 ml-3">
                              {merchantName}
                            </span>
                          )}
                        </div>
                      ) : null;
                    })()}
                    
                    {/* Batch Date and Net Deposit for BH records */}
                    {(() => {
                      const batchDate = extractBatchDate(batch.batchHeader);
                      const netDeposit = batch.batchHeader.parsed_data?.netDeposit || batch.batchHeader.record_data?.netDeposit;
                      return (batchDate || netDeposit) ? (
                        <div className="ml-auto flex items-center gap-3">
                          {batchDate && (
                            <span className="flex items-center gap-1 text-blue-600 font-medium">
                              <CalendarIcon className="h-4 w-4" />
                              {batchDate}
                            </span>
                          )}
                          {netDeposit && (
                            <span className="font-medium text-gray-700">
                              ${Number(netDeposit).toFixed(2)}
                            </span>
                          )}
                        </div>
                      ) : null;
                    })()}
                  </>
                ) : (
                  <>
                    <Badge className="bg-gray-500 text-white">Batch</Badge>
                    <span className="font-medium">Implicit Batch {batchIndex + 1}</span>
                  </>
                )}
                
                {!batch.batchHeader && (
                  <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
                    <span>{batch.transactions.length} transaction{batch.transactions.length !== 1 ? 's' : ''}</span>
                    {batch.trailer && <span>• Has Trailer</span>}
                  </div>
                )}
              </div>
            </CardHeader>

            {/* Expanded Batch Content */}
            {isExpanded && (
              <CardContent className="pt-0">
                {/* Batch Header Details */}
                {batch.batchHeader && (
                  <div className="mb-4 ml-6">
                    <RecordDetailView record={batch.batchHeader} />
                  </div>
                )}

                {/* Transactions */}
                <div className="space-y-2 ml-6">
                  {batch.transactions.map((transaction: any, transactionIndex: number) => {
                    const transactionKey = `transaction-${batchIndex}-${transactionIndex}`;
                    const isTransactionExpanded = expandedTransactions.has(transactionKey);
                    
                    return (
                      <Card key={transactionIndex} className="border-l-4 border-l-blue-500 bg-blue-50/30">
                        <CardHeader className="pb-2">
                          <div 
                            className="flex items-center gap-2 cursor-pointer hover:bg-blue-100/50 -m-3 p-3 rounded"
                            onClick={() => onToggleTransaction(batchIndex, transactionIndex)}
                          >
                            {isTransactionExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-600" />
                            )}
                            
                            <Badge className={`text-white ${getRecordTypeBadgeColor(transaction.dtRecord.record_type)}`}>
                              {transaction.dtRecord.record_type}
                            </Badge>
                            
                            {/* Card Type Badge for DT records in tree view header */}
                            {(transaction.dtRecord.record_type === 'DT' || transaction.dtRecord.record_type === '47') && (() => {
                              const cardType = extractCardType(transaction.dtRecord);
                              
                              return cardType ? (
                                <span 
                                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getCardTypeBadges(cardType).className}`}
                                  data-testid={`badge-card-type-${cardType.toLowerCase()}`}
                                >
                                  <CreditCard className="h-3 w-3" />
                                  {getCardTypeBadges(cardType).label}
                                </span>
                              ) : null;
                            })()}
                            
                            <span className="font-medium">{getRecordTypeName(transaction.dtRecord.record_type)}</span>
                            <span className="text-sm text-gray-600">Line {transaction.dtRecord.line_number}</span>
                            
                            {/* Merchant Account Number and Name for DT records */}
                            {(() => {
                              const merchantAccountNumber = extractMerchantAccountNumber(transaction.dtRecord);
                              const merchantName = getMerchantName(merchantAccountNumber);
                              return merchantAccountNumber ? (
                                <div className="flex flex-col">
                                  <span 
                                    className="text-sm font-bold text-blue-600"
                                    data-testid="dt-merchant-account-number"
                                  >
                                    • {merchantAccountNumber}
                                  </span>
                                  {merchantName && (
                                    <span className="text-xs font-semibold text-green-600 ml-3">
                                      {merchantName}
                                    </span>
                                  )}
                                </div>
                              ) : null;
                            })()}
                            
                            {/* Transaction Date and Amount for DT records - always show on right */}
                            <div className="ml-auto flex items-center gap-3">
                              {/* Transaction Date and Amount */}
                              {(() => {
                                const transactionDate = extractTransactionDate(transaction.dtRecord);
                                const transactionAmount = extractTransactionAmount(transaction.dtRecord);
                                return (transactionDate || transactionAmount !== null) ? (
                                  <div className="flex items-center gap-3">
                                    {transactionDate && (
                                      <span className="flex items-center gap-1 text-blue-600 font-medium">
                                        <CalendarIcon className="h-4 w-4" />
                                        {transactionDate}
                                      </span>
                                    )}
                                    {transactionAmount !== null && (
                                      <span className="font-medium text-gray-700">
                                        ${Number(transactionAmount).toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                ) : null;
                              })()}
                              
                              {/* Extensions */}
                              {transaction.extensions.length > 0 && (
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-gray-600">{transaction.extensions.length} extension{transaction.extensions.length !== 1 ? 's' : ''}</span>
                                  <div className="flex gap-1">
                                    {transaction.extensions.slice(0, 3).map((ext: any, i: number) => (
                                      <Badge key={i} variant="outline" className={`text-xs ${getRecordTypeBadgeColor(ext.record_type)} text-white`}>
                                        {ext.record_type}
                                      </Badge>
                                    ))}
                                    {transaction.extensions.length > 3 && (
                                      <Badge variant="outline" className="text-xs">+{transaction.extensions.length - 3}</Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardHeader>

                        {/* Expanded Transaction Content */}
                        {isTransactionExpanded && (
                          <CardContent className="pt-0">
                            {/* DT Record Details */}
                            <div className="mb-3">
                              <RecordDetailView record={transaction.dtRecord} />
                            </div>

                            {/* Extension Records */}
                            {transaction.extensions.length > 0 && (
                              <div className="ml-4 space-y-2">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">Extensions:</h4>
                                {transaction.extensions.map((extension: any, extIndex: number) => (
                                  <div key={extIndex} className="ml-2">
                                    <RecordDetailView record={extension} />
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>

                {/* Trailer */}
                {batch.trailer && (
                  <div className="mt-4 ml-6">
                    <Card className="border-l-4 border-l-red-500 bg-red-50/30">
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <Badge className={`text-white ${getRecordTypeBadgeColor(batch.trailer.record_type)}`}>
                            {batch.trailer.record_type}
                          </Badge>
                          <span className="font-medium">{getRecordTypeName(batch.trailer.record_type)}</span>
                          <span className="text-sm text-gray-600">Line {batch.trailer.line_number}</span>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <RecordDetailView record={batch.trailer} />
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// Record Detail View Component
function RecordDetailView({ record }: { record: any }) {
  const [activeTab, setActiveTab] = useState<'fields' | 'raw'>('fields');
  
  // Parse TDDF record data
  const parsedData = record.parsed_data || {};
  const rawData = record.raw_data || '';
  
  // Define field order for BH records (batchId moved to end)
  const BH_FIELD_ORDER = [
    'sequenceNumber',
    'entryRunNumber',
    'sequenceWithinRun',
    'recordIdentifier',
    'bankNumber',
    'merchantAccountNumber',
    'associationNumber',
    'groupNumber',
    'transactionCode',
    'batchDate',
    'batchJulianDate',
    'netDeposit',
    'rejectReason',
    'merchantReferenceNum',
    'batchHeaderCarryIndicator',
    'associationNumberBatch',
    'merchantBankNumber',
    'debitCreditIndicator',
    'achPostingDate',
    'batchId' // Moved to end
  ];
  
  // Sort fields based on record type
  const sortedEntries = record.record_type === 'BH' 
    ? Object.entries(parsedData).sort(([keyA], [keyB]) => {
        const indexA = BH_FIELD_ORDER.indexOf(keyA);
        const indexB = BH_FIELD_ORDER.indexOf(keyB);
        
        // If field not in order array, put it at the end
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        
        return indexA - indexB;
      })
    : Object.entries(parsedData);
  
  return (
    <div className="w-full">
      <div className="mb-4">
        <h4 className="text-lg font-semibold mb-2">
          {record.record_type} Record Details
          <span className="ml-2 text-sm text-muted-foreground">Line {record.line_number}</span>
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="font-medium text-muted-foreground">File:</span>
            <p className="truncate" title={record.filename}>{record.filename || 'Unknown'}</p>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Line Number:</span>
            <p>{record.line_number || 'Unknown'}</p>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Business Date:</span>
            <p>{record.business_day ? format(new Date(record.business_day), 'MMM d, yyyy') : 'Unknown'}</p>
          </div>
          <div>
            <span className="font-medium text-muted-foreground">Record ID:</span>
            <p>{record.id}</p>
          </div>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'fields' | 'raw')} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="fields" data-testid="tab-fields">Parsed Fields</TabsTrigger>
          <TabsTrigger value="raw" data-testid="tab-raw">Raw Data</TabsTrigger>
        </TabsList>
        
        <TabsContent value="fields" className="mt-4">
          <div className="space-y-2">
            {Object.keys(parsedData).length > 0 ? (
              sortedEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between items-start py-2 border-b border-border/40">
                  <span className="font-medium text-sm capitalize">{key.replace(/_/g, ' ')}:</span>
                  <span className="text-sm text-muted-foreground ml-4 text-right max-w-md break-all">
                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">No parsed fields available for this record.</p>
            )}
          </div>
        </TabsContent>
        
        <TabsContent value="raw" className="mt-4">
          <div className="bg-muted/30 p-4 rounded-md">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all">{rawData}</pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// File View Display Component
interface FileViewDisplayProps {
  records: any[];
  expandedFiles: Set<string>;
  expandedFileBatches: Set<string>;
  expandedFileTransactions: Set<string>;
  onToggleFile: (filename: string) => void;
  onToggleFileBatch: (filename: string, batchIndex: number) => void;
  onToggleFileTransaction: (filename: string, batchIndex: number, transactionIndex: number) => void;
  getRecordTypeBadgeColor: (type: string) => string;
  getRecordTypeName: (type: string) => string;
  formatFieldValue: (key: string, value: any) => string;
  groupRecordsByFiles: (records: any[]) => any[];
  getMerchantName: (merchantAccountNumber: string | null) => string | null;
}

function FileViewDisplay({ 
  records, 
  expandedFiles,
  expandedFileBatches,
  expandedFileTransactions,
  onToggleFile,
  onToggleFileBatch,
  onToggleFileTransaction,
  getRecordTypeBadgeColor, 
  getRecordTypeName, 
  formatFieldValue, 
  groupRecordsByFiles,
  getMerchantName
}: FileViewDisplayProps) {
  const fileGroups = groupRecordsByFiles(records);

  return (
    <div className="space-y-4">
      {fileGroups.map((fileGroup, fileIndex) => {
        const isFileExpanded = expandedFiles.has(fileGroup.filename);
        
        return (
          <Card key={fileIndex} className="border-l-4 border-l-blue-600">
            {/* File Header */}
            <CardHeader className="pb-3">
              <div 
                className="flex items-center gap-3 cursor-pointer hover:bg-blue-50 -m-3 p-3 rounded"
                onClick={() => onToggleFile(fileGroup.filename)}
              >
                {isFileExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                )}
                
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="font-semibold text-blue-900">{fileGroup.filename}</span>
                
                <div className="ml-auto flex items-center gap-4 text-sm">
                  <Badge variant="outline" className="bg-green-50 border-green-200 text-green-800">
                    {fileGroup.recordCounts.bh} BH
                  </Badge>
                  <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-800">
                    {fileGroup.recordCounts.dt} DT  
                  </Badge>
                  <span className="text-gray-600">
                    {fileGroup.recordCounts.total} total records
                  </span>
                </div>
              </div>
            </CardHeader>

            {/* Expanded File Content */}
            {isFileExpanded && (
              <CardContent className="pt-0">
                <div className="space-y-3 ml-8">
                  {fileGroup.batches.map((batch: any, batchIndex: number) => {
                    const batchKey = `${fileGroup.filename}-batch-${batchIndex}`;
                    const isBatchExpanded = expandedFileBatches.has(batchKey);
                    
                    return (
                      <Card key={batchIndex} className="border-l-4 border-l-green-500">
                        {/* Batch Header */}
                        <CardHeader className="pb-2">
                          <div 
                            className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 -m-3 p-3 rounded"
                            onClick={() => onToggleFileBatch(fileGroup.filename, batchIndex)}
                          >
                            {isBatchExpanded ? (
                              <ChevronDown className="w-4 h-4 text-gray-600" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-600" />
                            )}
                            
                            {batch.batchHeader ? (
                              <>
                                <Badge className={`text-white ${getRecordTypeBadgeColor(batch.batchHeader.record_type)}`}>
                                  {batch.batchHeader.record_type}
                                </Badge>
                                <span className="font-medium">{getRecordTypeName(batch.batchHeader.record_type)}</span>
                                <span className="text-sm text-gray-600">Line {batch.batchHeader.line_number}</span>
                                
                                {/* Merchant Account Number and Name for BH records */}
                                {(() => {
                                  const merchantAccountNumber = extractMerchantAccountNumber(batch.batchHeader);
                                  const merchantName = getMerchantName(merchantAccountNumber);
                                  return merchantAccountNumber ? (
                                    <div className="flex flex-col">
                                      <span className="text-sm font-bold text-blue-600">
                                        • {merchantAccountNumber}
                                      </span>
                                      {merchantName && (
                                        <span className="text-xs font-semibold text-green-600 ml-3">
                                          {merchantName}
                                        </span>
                                      )}
                                    </div>
                                  ) : null;
                                })()}
                              </>
                            ) : (
                              <>
                                <Badge className="bg-gray-500 text-white">Batch</Badge>
                                <span className="font-medium">Implicit Batch {batchIndex + 1}</span>
                              </>
                            )}
                            
                            <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
                              <span>{batch.transactions.length} transaction{batch.transactions.length !== 1 ? 's' : ''}</span>
                              {batch.trailer && <span>• Has Trailer</span>}
                            </div>
                          </div>
                        </CardHeader>

                        {/* Expanded Batch Content */}
                        {isBatchExpanded && (
                          <CardContent className="pt-0">
                            {/* Batch Header Details */}
                            {batch.batchHeader && (
                              <div className="mb-4 ml-6">
                                <RecordDetailView record={batch.batchHeader} />
                              </div>
                            )}

                            {/* Transactions */}
                            <div className="space-y-2 ml-6">
                              {batch.transactions.map((transaction: any, transactionIndex: number) => {
                                const transactionKey = `${fileGroup.filename}-transaction-${batchIndex}-${transactionIndex}`;
                                const isTransactionExpanded = expandedFileTransactions.has(transactionKey);
                                
                                return (
                                  <Card key={transactionIndex} className="border-l-4 border-l-blue-500 bg-blue-50/30">
                                    <CardHeader className="pb-2">
                                      <div 
                                        className="flex items-center gap-2 cursor-pointer hover:bg-blue-100/50 -m-3 p-3 rounded"
                                        onClick={() => onToggleFileTransaction(fileGroup.filename, batchIndex, transactionIndex)}
                                      >
                                        {isTransactionExpanded ? (
                                          <ChevronDown className="w-4 h-4 text-gray-600" />
                                        ) : (
                                          <ChevronRight className="w-4 h-4 text-gray-600" />
                                        )}
                                        
                                        <Badge className={`text-white ${getRecordTypeBadgeColor(transaction.dtRecord.record_type)}`}>
                                          {transaction.dtRecord.record_type}
                                        </Badge>
                                        
                                        {/* Card Type Badge for DT records */}
                                        {(transaction.dtRecord.record_type === 'DT' || transaction.dtRecord.record_type === '47') && (() => {
                                          const cardType = extractCardType(transaction.dtRecord);
                                          const cardBadge = cardType ? getCardTypeBadges(cardType) : null;
                                          
                                          return cardBadge ? (
                                            <Badge variant="outline" className={cardBadge.className}>
                                              {cardBadge.label}
                                            </Badge>
                                          ) : null;
                                        })()}
                                        
                                        <span className="font-medium">{getRecordTypeName(transaction.dtRecord.record_type)}</span>
                                        <span className="text-sm text-gray-600">Line {transaction.dtRecord.line_number}</span>
                                        
                                        <div className="ml-auto flex items-center gap-2 text-sm text-gray-600">
                                          {transaction.extensions.length > 0 && (
                                            <span>{transaction.extensions.length} extension{transaction.extensions.length !== 1 ? 's' : ''}</span>
                                          )}
                                        </div>
                                      </div>
                                    </CardHeader>

                                    {/* Expanded Transaction Content */}
                                    {isTransactionExpanded && (
                                      <CardContent className="pt-0">
                                        {/* Transaction Details */}
                                        <div className="mb-4 ml-6">
                                          <RecordDetailView record={transaction.dtRecord} />
                                        </div>
                                        
                                        {/* Extensions */}
                                        {transaction.extensions.length > 0 && (
                                          <div className="space-y-2 ml-6">
                                            {transaction.extensions.map((extension: any, extensionIndex: number) => (
                                              <Card key={extensionIndex} className="border-l-4 border-l-purple-500 bg-purple-50/30">
                                                <CardHeader className="pb-2">
                                                  <div className="flex items-center gap-2">
                                                    <Badge className={`text-white ${getRecordTypeBadgeColor(extension.record_type)}`}>
                                                      {extension.record_type}
                                                    </Badge>
                                                    <span className="font-medium">{getRecordTypeName(extension.record_type)}</span>
                                                    <span className="text-sm text-gray-600">Line {extension.line_number}</span>
                                                  </div>
                                                </CardHeader>
                                                <CardContent className="pt-0">
                                                  <RecordDetailView record={extension} />
                                                </CardContent>
                                              </Card>
                                            ))}
                                          </div>
                                        )}
                                      </CardContent>
                                    )}
                                  </Card>
                                );
                              })}
                            </div>

                            {/* Trailer */}
                            {batch.trailer && (
                              <div className="mt-4 ml-6">
                                <Card className="border-l-4 border-l-red-500 bg-red-50/30">
                                  <CardHeader className="pb-2">
                                    <div className="flex items-center gap-2">
                                      <Badge className={`text-white ${getRecordTypeBadgeColor(batch.trailer.record_type)}`}>
                                        {batch.trailer.record_type}
                                      </Badge>
                                      <span className="font-medium">{getRecordTypeName(batch.trailer.record_type)}</span>
                                      <span className="text-sm text-gray-600">Line {batch.trailer.line_number}</span>
                                    </div>
                                  </CardHeader>
                                  <CardContent className="pt-0">
                                    <RecordDetailView record={batch.trailer} />
                                  </CardContent>
                                </Card>
                              </div>
                            )}
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function RawDataTab({ 
  globalFilenameFilter, 
  setGlobalFilenameFilter,
  getMerchantName
}: { 
  globalFilenameFilter: string; 
  setGlobalFilenameFilter: (filename: string) => void; 
  getMerchantName: (merchantAccountNumber: string | null) => string | null;
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [recordType, setRecordType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [searchTriggered, setSearchTriggered] = useState(false);
  
  // DT Field Search state
  const [selectedField, setSelectedField] = useState<string>('');
  const [fieldSearchValue, setFieldSearchValue] = useState<string>('');
  
  // Cardholder Account search state (persistent quick search)
  const [cardholderAccount, setCardholderAccount] = useState<string>('');
  
  // Date range preset state (default to 1 week for faster searches)
  const [dateRange, setDateRange] = useState<string>('7');
  
  // Query performance tracking
  const [queryStartTime, setQueryStartTime] = useState<number | null>(null);
  const [queryDuration, setQueryDuration] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  
  // Format time in human-readable format (seconds, minutes, or hours)
  const formatDuration = (ms: number): string => {
    const seconds = ms / 1000;
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  };
  
  // Chunked loading state for progressive results
  const [isChunkedLoading, setIsChunkedLoading] = useState(false);
  const [chunks, setChunks] = useState<Array<{from: string; to: string}>>([]);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [accumulatedRecords, setAccumulatedRecords] = useState<any[]>([]);
  const [chunkedHasMore, setChunkedHasMore] = useState(false);

  // Calculate offset based on page and limit
  const offset = (page - 1) * limit;

  // Calculate weekly chunks from a date range
  const calculateWeeklyChunks = (totalDays: number): Array<{from: string; to: string}> => {
    const chunks: Array<{from: string; to: string}> = [];
    const today = new Date();
    const chunkSize = 7; // 7 days per chunk
    
    for (let i = 0; i < totalDays; i += chunkSize) {
      const endOffset = i;
      const startOffset = Math.min(i + chunkSize - 1, totalDays - 1);
      
      const chunkEnd = new Date(today);
      chunkEnd.setDate(today.getDate() - endOffset);
      
      const chunkStart = new Date(today);
      chunkStart.setDate(today.getDate() - startOffset);
      
      chunks.push({
        from: format(chunkStart, 'yyyy-MM-dd'),
        to: format(chunkEnd, 'yyyy-MM-dd')
      });
    }
    return chunks;
  };

  // Handle field selection - auto-set record type to DT
  const handleFieldChange = (value: string) => {
    const effectiveValue = value === '__none__' ? '' : value;
    setSelectedField(effectiveValue);
    setFieldSearchValue(''); // Clear previous search value
    if (effectiveValue) {
      setRecordType('DT'); // Auto-select DT when a field is chosen
    }
    setPage(1);
  };

  // Build query URL like Transactions page
  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());
    
    if (selectedDate) {
      params.append('batch_date', format(selectedDate, 'yyyy-MM-dd'));
    }
    // Add date range filter (30/60/90 days)
    if (dateRange && dateRange !== 'none' && !selectedDate) {
      const days = parseInt(dateRange);
      if (!isNaN(days)) {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - days);
        params.append('date_from', format(fromDate, 'yyyy-MM-dd'));
        params.append('date_to', format(new Date(), 'yyyy-MM-dd'));
      }
    }
    if (recordType && recordType !== 'all') {
      params.append('recordType', recordType);
    }
    if (searchQuery.trim()) {
      params.append('search', searchQuery.trim());
    }
    if (globalFilenameFilter) {
      params.append('filename', globalFilenameFilter);
    }
    // Add cardholder account search (persistent quick search)
    if (cardholderAccount.trim()) {
      params.append('cardholder_account', cardholderAccount.trim());
    }
    // Add field search parameters
    if (selectedField && fieldSearchValue.trim()) {
      params.append('fieldKey', selectedField);
      params.append('fieldValue', fieldSearchValue.trim());
    }
    
    return `/api/tddf-api/all-records?${params.toString()}`;
  };

  // Fetch records using React Query - only when search is triggered
  const { data, isLoading, error, refetch } = useQuery<{
    data: any[];
    pagination: { limit: number; offset: number; hasMore: boolean };
  }>({
    queryKey: [buildQueryUrl()],
    enabled: searchTriggered,
  });

  // Handle search button click
  const handleSearch = () => {
    // Auto-select 90-day range when cardholder search is used without date filter
    let effectiveDateRange = dateRange;
    if (cardholderAccount.trim() && !selectedDate && dateRange === 'none') {
      effectiveDateRange = '90';
      setDateRange('90');
    }
    
    // Start performance timer
    setQueryStartTime(Date.now());
    setQueryDuration(null);
    setElapsedTime(0);
    setPage(1);
    
    // Use chunked loading for date range queries (30/60/90 days)
    if (effectiveDateRange !== 'none' && !selectedDate) {
      const days = parseInt(effectiveDateRange);
      if (!isNaN(days)) {
        const weeklyChunks = calculateWeeklyChunks(days);
        setChunks(weeklyChunks);
        setCurrentChunkIndex(0);
        setAccumulatedRecords([]);
        setChunkedHasMore(false);
        setIsChunkedLoading(true);
        setSearchTriggered(false); // Don't use regular query
        return;
      }
    }
    
    // Fall back to regular single query
    setIsChunkedLoading(false);
    setSearchTriggered(true);
  };
  
  // Running timer effect during loading (both regular and chunked)
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if ((isLoading || isChunkedLoading) && queryStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Date.now() - queryStartTime);
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading, isChunkedLoading, queryStartTime]);
  
  // Calculate final duration when query completes
  useEffect(() => {
    if (!isLoading && queryStartTime && data) {
      setQueryDuration(Date.now() - queryStartTime);
    }
  }, [isLoading, queryStartTime, data]);
  
  // Chunked loading effect - fetch chunks sequentially
  useEffect(() => {
    if (!isChunkedLoading || chunks.length === 0) return;
    if (currentChunkIndex >= chunks.length) {
      // All chunks completed
      setIsChunkedLoading(false);
      setQueryDuration(Date.now() - (queryStartTime || Date.now()));
      return;
    }
    
    const chunk = chunks[currentChunkIndex];
    const fetchChunk = async () => {
      try {
        const params = new URLSearchParams();
        params.append('limit', '500'); // Higher limit per chunk
        params.append('offset', '0');
        params.append('date_from', chunk.from);
        params.append('date_to', chunk.to);
        
        if (recordType && recordType !== 'all') {
          params.append('recordType', recordType);
        }
        if (searchQuery.trim()) {
          params.append('search', searchQuery.trim());
        }
        if (globalFilenameFilter) {
          params.append('filename', globalFilenameFilter);
        }
        if (cardholderAccount.trim()) {
          params.append('cardholder_account', cardholderAccount.trim());
        }
        if (selectedField && fieldSearchValue.trim()) {
          params.append('fieldKey', selectedField);
          params.append('fieldValue', fieldSearchValue.trim());
        }
        
        const response = await fetch(`/api/tddf-api/all-records?${params.toString()}`);
        const result = await response.json();
        
        if (result.data && Array.isArray(result.data)) {
          setAccumulatedRecords(prev => [...prev, ...result.data]);
          if (result.pagination?.hasMore) {
            setChunkedHasMore(true);
          }
        }
        
        // Move to next chunk
        setCurrentChunkIndex(prev => prev + 1);
      } catch (err) {
        console.error('Chunk fetch error:', err);
        setIsChunkedLoading(false);
      }
    };
    
    fetchChunk();
  }, [isChunkedLoading, currentChunkIndex, chunks, queryStartTime, recordType, searchQuery, globalFilenameFilter, cardholderAccount, selectedField, fieldSearchValue]);

  // Use chunked records if in chunked mode, otherwise use regular query results
  const records = isChunkedLoading || accumulatedRecords.length > 0 ? accumulatedRecords : (data?.data || []);
  const hasMore = isChunkedLoading ? chunkedHasMore : (data?.pagination?.hasMore ?? false);

  // Toggle row expansion
  const toggleRow = (recordId: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(recordId)) {
      newExpanded.delete(recordId);
    } else {
      newExpanded.add(recordId);
    }
    setExpandedRows(newExpanded);
  };

  // Helper functions
  const getRecordTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'BH': return 'bg-green-500';
      case 'DT': return 'bg-blue-500';
      case 'TR': return 'bg-red-500';
      case 'P1': case 'P2': return 'bg-purple-500';
      case 'G2': return 'bg-indigo-500';
      default: return 'bg-gray-500';
    }
  };

  const extractAmount = (record: any): string => {
    const parsed = record.parsed_data;
    if (!parsed) return '-';
    const amount = parsed.transactionAmount || parsed.TransactionAmount || parsed.netDeposit || parsed.NetDeposit;
    if (amount) {
      return `$${(Number(amount) / 100).toFixed(2)}`;
    }
    return '-';
  };

  const extractMerchant = (record: any): string => {
    const parsed = record.parsed_data;
    if (!parsed) return '-';
    return parsed.merchantAccountNumber || parsed.MerchantAccountNumber || '-';
  };

  const extractDate = (record: any): string => {
    const parsed = record.parsed_data;
    if (!parsed) return '-';
    return parsed.batchDate || parsed.BatchDate || parsed.transactionDate || '-';
  };

  // Clear filters
  const clearFilters = () => {
    setSelectedDate(null);
    setRecordType('all');
    setSearchQuery('');
    setGlobalFilenameFilter('');
    setSelectedField('');
    setFieldSearchValue('');
    setCardholderAccount('');
    setDateRange('none');
    setPage(1);
  };

  // Get the selected field definition for display
  const selectedFieldDef = selectedField ? getDTFieldByKey(selectedField) : null;

  return (
    <div className="space-y-4">
      {/* Filter Controls - Like Transactions Page */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex items-center gap-2">
          <Label>Date:</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, 'MMM dd, yyyy') : 'Select date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate || undefined}
                onSelect={(date) => {
                  setSelectedDate(date || null);
                  setPage(1);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <Label>Range:</Label>
          <Select 
            value={dateRange} 
            onValueChange={(v) => { 
              setDateRange(v);
              if (v !== 'none') {
                setSelectedDate(null);
              }
              setPage(1); 
            }}
            disabled={!!selectedDate}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Range</SelectItem>
              <SelectItem value="7">Last 1 Week</SelectItem>
              <SelectItem value="14">Last 2 Weeks</SelectItem>
              <SelectItem value="21">Last 3 Weeks</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="60">Last 60 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label>Type:</Label>
          <Select 
            value={recordType} 
            onValueChange={(v) => { 
              setRecordType(v); 
              if (v !== 'DT') {
                setSelectedField('');
                setFieldSearchValue('');
              }
              setPage(1); 
            }}
            disabled={!!selectedField} // Disable when field search is active
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="BH">BH - Batch Header</SelectItem>
              <SelectItem value="DT">DT - Transaction</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label>Per page:</Label>
          <Select value={limit.toString()} onValueChange={(v) => { setLimit(parseInt(v)); setPage(1); }}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          onClick={handleSearch}
          className="bg-blue-600 hover:bg-blue-700"
          data-testid="button-search-records"
        >
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>

        <Button variant="ghost" size="sm" onClick={() => { clearFilters(); setSearchTriggered(false); }}>
          Clear Filters
        </Button>
      </div>

      {/* Cardholder Account Quick Search - Always Visible */}
      <div className="flex flex-col gap-2 p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            <Label className="text-blue-700 dark:text-blue-300 font-medium">Cardholder Account:</Label>
          </div>
          <Input
            placeholder="Enter card number or last 4 digits..."
            value={cardholderAccount}
            onChange={(e) => setCardholderAccount(e.target.value)}
            className="w-[280px] bg-white dark:bg-gray-800"
            data-testid="input-cardholder-account"
          />
          <Button 
            onClick={handleSearch}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Search className="mr-2 h-4 w-4" />
            Search Card
          </Button>
          {cardholderAccount && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => { setCardholderAccount(''); setPage(1); }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-400 ml-7">
          Auto-applies 90-day lookback for faster search when no date filter is selected
        </p>
      </div>

      {/* DT Field Search - Second Row */}
      <div className="flex flex-wrap gap-4 items-end border-t pt-4">
        <div className="flex items-center gap-2">
          <Label className="text-blue-600 font-medium">DT Field:</Label>
          <Select value={selectedField || '__none__'} onValueChange={handleFieldChange}>
            <SelectTrigger className="w-[220px]" data-testid="select-dt-field">
              <SelectValue placeholder="Select a DT field..." />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="__none__">-- No Field Selected --</SelectItem>
              {DT_FIELDS.map((field) => (
                <SelectItem key={field.key} value={field.key}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedField && (
          <div className="flex items-center gap-2">
            <Label>Search Value:</Label>
            <Input
              placeholder={`Enter ${selectedFieldDef?.label || 'value'}...`}
              value={fieldSearchValue}
              onChange={(e) => setFieldSearchValue(e.target.value)}
              className="w-[200px]"
              maxLength={selectedFieldDef?.length || 50}
              data-testid="input-field-search-value"
            />
            {selectedFieldDef && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="text-xs cursor-help">
                      Pos {selectedFieldDef.start}-{selectedFieldDef.start + selectedFieldDef.length - 1}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <p><strong>Field:</strong> {selectedFieldDef.label}</p>
                      <p><strong>Position:</strong> {selectedFieldDef.start} - {selectedFieldDef.start + selectedFieldDef.length - 1}</p>
                      <p><strong>Length:</strong> {selectedFieldDef.length} chars</p>
                      <p><strong>Format:</strong> {selectedFieldDef.format === 'N' ? 'Numeric' : 'Alphanumeric'}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}

        {selectedField && (
          <Badge className="bg-blue-100 text-blue-800 border-blue-300">
            Searching DT records only
          </Badge>
        )}
      </div>

      {/* Showing X records indicator with query performance */}
      <div className="text-sm text-muted-foreground flex items-center gap-3">
        <span>
          {searchTriggered || accumulatedRecords.length > 0
            ? `Showing ${records.length} records ${hasMore ? '(more available)' : ''}`
            : isChunkedLoading 
              ? `Loading... ${accumulatedRecords.length} records found`
              : 'Click Search to load records'
          }
        </span>
        {queryDuration !== null && !isLoading && !isChunkedLoading && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-mono">
            <Clock className="h-3 w-3" />
            {formatDuration(queryDuration)}
          </span>
        )}
      </div>

      {/* Records Display */}
      <Card>
        <CardContent className="p-0">
          {!searchTriggered && !isChunkedLoading && accumulatedRecords.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Ready to Search</p>
              <p className="text-sm">Set your filters above and click Search to load TDDF records</p>
            </div>
          ) : isChunkedLoading ? (
            <div className="p-8 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              <div className="text-center space-y-2">
                <p className="text-lg font-medium text-gray-700">Loading week by week...</p>
                
                {/* Progress bar */}
                <div className="w-64 mx-auto">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Week {currentChunkIndex + 1} of {chunks.length}</span>
                    <span>{Math.round(((currentChunkIndex + 1) / chunks.length) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${((currentChunkIndex + 1) / chunks.length) * 100}%` }}
                    />
                  </div>
                </div>
                
                {/* Current date range being queried */}
                {chunks[currentChunkIndex] && (
                  <p className="text-sm text-gray-600 font-medium">
                    {format(new Date(chunks[currentChunkIndex].from), 'MMM d')} - {format(new Date(chunks[currentChunkIndex].to), 'MMM d, yyyy')}
                  </p>
                )}
                
                {/* Records found so far */}
                <p className="text-sm text-green-600">
                  {accumulatedRecords.length} records found
                </p>
                
                {/* Timer */}
                <p className="text-lg font-mono text-blue-600 mt-2">
                  {formatDuration(elapsedTime)}
                </p>
              </div>
            </div>
          ) : isLoading ? (
            <div className="p-8 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              <div className="text-center">
                <p className="text-lg font-medium text-gray-700">Searching records...</p>
                <p className="text-sm text-gray-500">
                  {cardholderAccount ? `Searching for card: ${cardholderAccount}` : 'Loading TDDF records'}
                </p>
                {dateRange !== 'none' && (
                  <p className="text-xs text-gray-400 mt-1">Filtering last {dateRange} days</p>
                )}
                <p className="text-lg font-mono text-blue-600 mt-3">
                  {formatDuration(elapsedTime)}
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600">
              Failed to load records. Please try again.
            </div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No records found. Try adjusting your filters.
            </div>
          ) : (
            <div>
              {records.map((record: any) => {
                const isExpanded = expandedRows.has(record.id);
                const merchantAccount = extractMerchant(record);
                const merchantName = getMerchantName(merchantAccount);
                const amount = extractAmount(record);
                const batchDate = extractDate(record);

                return (
                  <div key={record.id}>
                    <div
                      className="px-4 py-2 border-t cursor-pointer hover:bg-gray-50 flex items-center gap-2 text-sm"
                      onClick={() => toggleRow(record.id)}
                      data-testid={`row-record-${record.id}`}
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-500 flex-shrink-0" />
                      )}

                      <Badge className={`${getRecordTypeBadgeColor(record.record_type)} text-white text-xs`}>
                        {record.record_type}
                      </Badge>

                      <span className="font-mono text-xs text-gray-600">{merchantAccount}</span>
                      
                      {merchantName && (
                        <Badge variant="outline" className="text-xs">{merchantName}</Badge>
                      )}

                      <span className="text-green-600 font-medium">{amount}</span>
                      
                      <span className="text-gray-500">{batchDate}</span>

                      <span className="ml-auto text-xs text-gray-400">
                        {record.filename?.split('_').slice(3, 5).join('_') || 'Unknown'} | Line {record.line_number}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="px-4 py-3 bg-gray-50 border-t">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          {record.parsed_data && Object.entries(record.parsed_data).slice(0, 12).map(([key, value]) => (
                            <div key={key} className="flex flex-col">
                              <span className="font-medium text-gray-500">{key}</span>
                              <span className="text-gray-900">{String(value) || '-'}</span>
                            </div>
                          ))}
                        </div>
                        {record.raw_data && (
                          <div className="mt-2 p-2 bg-white rounded border">
                            <span className="text-xs font-medium text-gray-500">Raw Data:</span>
                            <pre className="text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap break-all">
                              {record.raw_data}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {records.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Page {page}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={!hasMore}
            >
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Enhanced Pagination Component
function EnhancedPagination({ 
  currentPage, 
  totalItems, 
  itemsPerPage, 
  onPageChange, 
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 250, 500, 1000]
}: {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const [jumpToPage, setJumpToPage] = useState('');

  const handleJumpToPage = () => {
    const pageNum = parseInt(jumpToPage);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onPageChange(pageNum - 1);
      setJumpToPage('');
    }
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Show:</span>
        <Select 
          value={itemsPerPage.toString()} 
          onValueChange={(value) => {
            onPageSizeChange(Number(value));
            onPageChange(0);
          }}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map(size => (
              <SelectItem key={size} value={size.toString()}>
                {size >= 1000 ? `${size/1000}K` : size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground ml-2">
          {totalItems > 0 ? `${currentPage * itemsPerPage + 1}-${Math.min((currentPage + 1) * itemsPerPage, totalItems)} of ${totalItems.toLocaleString()}` : '0 items'}
        </span>
      </div>
      
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(0)}
          disabled={currentPage === 0}
          title="First page"
        >
          <ChevronLeft className="h-4 w-4" /><ChevronLeft className="h-4 w-4 -ml-2" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <span className="text-sm px-2 min-w-[80px] text-center">
          Page {currentPage + 1} of {totalPages}
        </span>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
          disabled={currentPage >= totalPages - 1}
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(totalPages - 1)}
          disabled={currentPage >= totalPages - 1}
          title="Last page"
        >
          <ChevronRight className="h-4 w-4" /><ChevronRight className="h-4 w-4 -ml-2" />
        </Button>
        
        <div className="flex items-center gap-1 ml-2">
          <Input
            type="number"
            min={1}
            max={totalPages}
            placeholder="Go to"
            className="w-16 h-8 text-sm"
            value={jumpToPage}
            onChange={(e) => setJumpToPage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJumpToPage()}
          />
          <Button variant="outline" size="sm" onClick={handleJumpToPage}>
            Go
          </Button>
        </div>
      </div>
    </div>
  );
}

// Bulk Action Toolbar Component
function BulkActionToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  actions,
  isAllSelected
}: {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  actions: Array<{
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'default' | 'destructive' | 'outline';
    className?: string;
  }>;
  isAllSelected: boolean;
}) {
  if (selectedCount === 0 && totalCount === 0) return null;

  return (
    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg mb-4">
      <Button
        variant="outline"
        size="sm"
        onClick={isAllSelected ? onClearSelection : onSelectAll}
      >
        {isAllSelected ? (
          <><Square className="h-4 w-4 mr-1" /> Deselect All</>
        ) : (
          <><CheckSquare className="h-4 w-4 mr-1" /> Select All</>
        )}
      </Button>
      
      {selectedCount > 0 && (
        <>
          <span className="text-sm text-muted-foreground px-2 border-l">
            {selectedCount} selected
          </span>
          
          {actions.map((action, index) => (
            <Button
              key={index}
              variant={action.variant || 'default'}
              size="sm"
              onClick={action.onClick}
              disabled={action.disabled}
              className={action.className}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
        </>
      )}
    </div>
  );
}

export default function TddfApiDataPage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [filesInnerTab, setFilesInnerTab] = useState("uploaded");
  const [selectedSchema, setSelectedSchema] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);
  
  // Read URL parameters on mount to handle deep linking from other pages
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const filenamesParam = urlParams.get('filenames');
    
    // Switch to raw-data tab if specified
    if (tabParam === 'rawData' || tabParam === 'raw-data') {
      setActiveTab('raw-data');
    }
    
    // Apply filename filter if specified (comma-separated list)
    if (filenamesParam) {
      setGlobalFilenameFilter(filenamesParam);
    }
  }, []);
  
  // Archive management state
  const [archiveFilters, setArchiveFilters] = useState({
    archiveStatus: 'all',
    step6Status: 'all', 
    businessDayFrom: '',
    businessDayTo: ''
  });
  const [archiveSortBy, setArchiveSortBy] = useState<string>('archived_at');
  const [archiveSortOrder, setArchiveSortOrder] = useState<'asc' | 'desc'>('desc');
  const [archivePage, setArchivePage] = useState(0);
  const [archiveItemsPerPage, setArchiveItemsPerPage] = useState(25);
  
  // Archive file viewer state
  const [viewingArchiveFile, setViewingArchiveFile] = useState<any>(null);
  const [archiveFileContent, setArchiveFileContent] = useState<string>('');
  const [loadingArchiveContent, setLoadingArchiveContent] = useState(false);
  const [newSchemaData, setNewSchemaData] = useState({
    name: "",
    version: "",
    description: "",
    schemaData: ""
  });
  const [newApiKey, setNewApiKey] = useState({
    keyName: "",
    permissions: ["read"],
    rateLimitPerMinute: 100,
    expiresAt: ""
  });
  const [createdApiKey, setCreatedApiKey] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null);
  const [isCreateKeyDialogOpen, setIsCreateKeyDialogOpen] = useState(false);
  const [deleteKeyId, setDeleteKeyId] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  // File selection state
  const [selectedFiles, setSelectedFiles] = useState<Set<number>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);
  
  // File viewer state
  const [viewFileDialog, setViewFileDialog] = useState(false);
  const [selectedFileForView, setSelectedFileForView] = useState<TddfApiFile | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  
  // Error details dialog state
  const [errorDetailsDialog, setErrorDetailsDialog] = useState(false);
  const [selectedErrorUpload, setSelectedErrorUpload] = useState<any>(null);
  
  // Date filtering state
  const [dateFilters, setDateFilters] = useState({
    dateFrom: "",
    dateTo: "",
    businessDayFrom: "",
    businessDayTo: "",
    status: ""
  });

  // Uploader functionality state
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<FileList | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<string>('tddf');
  const [sessionId] = useState(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [keep, setKeep] = useState<boolean>(false);
  const [auto45Enabled, setAuto45Enabled] = useState<boolean>(false);
  const [autoStep6Enabled, setAutoStep6Enabled] = useState<boolean>(false);
  const [autoStep7Enabled, setAutoStep7Enabled] = useState<boolean>(false);
  const [step6MaxConcurrent, setStep6MaxConcurrent] = useState<number>(3);

  // Load Auto 4-5 setting on mount
  const { data: auto45Setting } = useQuery({
    queryKey: ['/api/mms-watcher/auto45-status'],
    enabled: true
  });

  // Load Auto Step 6 setting on mount
  const { data: autoStep6Setting } = useQuery<AutoStep6Setting>({
    queryKey: ['/api/uploader/auto-step6-setting'],
    enabled: true
  });

  // Load Auto Step 7 setting on mount
  const { data: autoStep7Setting } = useQuery<AutoStep7Setting>({
    queryKey: ['/api/uploader/auto-step7-setting'],
    enabled: true
  });

  // Load Step 6 slot configuration
  const { data: step6Config } = useQuery<{ maxConcurrent: number; minAllowed: number; maxAllowed: number; currentStatus?: any }>({
    queryKey: ['/api/uploader/step6-config'],
    enabled: true
  });

  // Update local state when API data loads
  useEffect(() => {
    if ((auto45Setting as any)?.enabled !== undefined) {
      setAuto45Enabled((auto45Setting as any).enabled);
    }
  }, [auto45Setting]);

  useEffect(() => {
    if (autoStep6Setting?.autoStep6Enabled !== undefined) {
      setAutoStep6Enabled(autoStep6Setting.autoStep6Enabled);
    }
  }, [autoStep6Setting]);

  // Update Auto Step 7 state when API data loads
  useEffect(() => {
    if (autoStep7Setting?.autoStep7Enabled !== undefined) {
      setAutoStep7Enabled(autoStep7Setting.autoStep7Enabled);
    }
  }, [autoStep7Setting]);

  // Update Step 6 max concurrent state when API data loads
  useEffect(() => {
    if (step6Config?.maxConcurrent !== undefined) {
      setStep6MaxConcurrent(step6Config.maxConcurrent);
    }
  }, [step6Config]);

  // Mutation to toggle Auto 4-5
  const saveAuto45Setting = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest('/api/mms-watcher/auto45-toggle', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: (data: any, enabled: boolean) => {
      toast({
        title: enabled ? "Auto 4-5 Enabled" : "Auto 4-5 Disabled",
        description: enabled 
          ? "Files will automatically progress through identification and encoding" 
          : "Files will stop at 'uploaded' phase and require manual processing",
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/mms-watcher/auto45-status'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to toggle Auto 4-5 setting",
        variant: "destructive"
      });
      console.error('Error toggling Auto 4-5:', error);
    }
  });

  // Handle Auto 4-5 toggle change
  const handleAuto45Change = async (enabled: boolean) => {
    setAuto45Enabled(enabled); // Update local state immediately for responsive UI
    saveAuto45Setting.mutate(enabled);
  };

  // Mutation to save Auto Step 6 setting
  const saveAutoStep6Setting = useMutation<AutoStep6SettingResponse, Error, boolean>({
    mutationFn: async (enabled: boolean) => {
      const data = await apiRequest('/api/uploader/auto-step6-setting', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
        headers: { 'Content-Type': 'application/json' }
      }) as AutoStep6SettingResponse;
      return data;
    },
    onSuccess: (data: AutoStep6SettingResponse) => {
      toast({
        title: data.message,
        description: `Auto Step 6 processing is now ${data.autoStep6Enabled ? 'enabled' : 'disabled'}`,
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/auto-step6-setting'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save Auto Step 6 setting",
        variant: "destructive"
      });
      console.error('Error saving Auto Step 6 setting:', error);
    }
  });

  // Handle Auto Step 6 toggle change
  const handleAutoStep6Change = async (enabled: boolean) => {
    setAutoStep6Enabled(enabled); // Update local state immediately for responsive UI
    saveAutoStep6Setting.mutate(enabled);
  };

  // Mutation to save Auto Step 7 setting
  const saveAutoStep7Setting = useMutation<AutoStep7SettingResponse, Error, boolean>({
    mutationFn: async (enabled: boolean) => {
      const data = await apiRequest('/api/uploader/auto-step7-setting', {
        method: 'POST',
        body: JSON.stringify({ enabled }),
        headers: { 'Content-Type': 'application/json' }
      }) as AutoStep7SettingResponse;
      return data;
    },
    onSuccess: (data: AutoStep7SettingResponse) => {
      toast({
        title: data.message,
        description: `Auto Step 7 archiving is now ${data.autoStep7Enabled ? 'enabled' : 'disabled'}`,
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/auto-step7-setting'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to save Auto Step 7 setting",
        variant: "destructive"
      });
      console.error('Error saving Auto Step 7 setting:', error);
    }
  });

  // Handle Auto Step 7 toggle change
  const handleAutoStep7Change = async (enabled: boolean) => {
    setAutoStep7Enabled(enabled); // Update local state immediately for responsive UI
    saveAutoStep7Setting.mutate(enabled);
  };

  // Mutation to save Step 6 max concurrent slots
  const saveStep6MaxConcurrent = useMutation<{ success: boolean; maxConcurrent: number; message: string }, Error, number>({
    mutationFn: async (maxConcurrent: number) => {
      const data = await apiRequest('/api/uploader/step6-config', {
        method: 'PUT',
        body: JSON.stringify({ maxConcurrent }),
        headers: { 'Content-Type': 'application/json' }
      }) as { success: boolean; maxConcurrent: number; message: string };
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Slot Configuration Updated",
        description: `Step 6 now uses ${data.maxConcurrent} concurrent processing slots`,
        variant: "default"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/uploader/step6-config'] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update slot configuration",
        variant: "destructive"
      });
      console.error('Error saving Step 6 slot config:', error);
    }
  });

  // Handle Step 6 max concurrent change
  const handleStep6MaxConcurrentChange = async (value: number) => {
    setStep6MaxConcurrent(value); // Update local state immediately for responsive UI
    saveStep6MaxConcurrent.mutate(value);
  };

  const [statusFilter, setStatusFilter] = useState('all');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [filenameFilter, setFilenameFilter] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('current');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'businessDay' | 'records' | 'progress'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  
  // Global filename search state
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [performSearch, setPerformSearch] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  
  // Separate pagination state for uploaded files section
  const [uploadsCurrentPage, setUploadsCurrentPage] = useState(0);
  const [uploadsItemsPerPage, setUploadsItemsPerPage] = useState(5);
  const [selectedUploads, setSelectedUploads] = useState<string[]>([]);
  const [selectedArchiveFiles, setSelectedArchiveFiles] = useState<number[]>([]);
  const [uploaderFileForView, setUploaderFileForView] = useState<UploaderUpload | null>(null);
  const [uploaderFileContent, setUploaderFileContent] = useState<string>('');
  const [loadingUploaderContent, setLoadingUploaderContent] = useState(false);
  
  // Warning dialog state
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [selectedWarningUpload, setSelectedWarningUpload] = useState<{ id: string; filename: string } | null>(null);

  // Separate pagination state for processed files section (Section 2)
  const [processedFilesCurrentPage, setProcessedFilesCurrentPage] = useState(0);
  const [processedFilesItemsPerPage, setProcessedFilesItemsPerPage] = useState(10);

  // Pagination and selection state for failed files tab
  const [failedFilesCurrentPage, setFailedFilesCurrentPage] = useState(0);
  const [failedFilesItemsPerPage, setFailedFilesItemsPerPage] = useState(10);
  const [selectedFailedUploads, setSelectedFailedUploads] = useState<string[]>([]);

  // Pagination and selection state for warning files tab
  const [warningFilesCurrentPage, setWarningFilesCurrentPage] = useState(0);
  const [warningFilesItemsPerPage, setWarningFilesItemsPerPage] = useState(10);
  const [selectedWarningUploads, setSelectedWarningUploads] = useState<string[]>([]);

  // Global filename filtering state for cross-tab functionality
  const [globalFilenameFilter, setGlobalFilenameFilter] = useState<string>('');
  
  // View mode state for Raw Data tab (lifted up for cross-tab functionality)
  const [viewMode, setViewMode] = useState<'tree' | 'flat' | 'file'>('flat');

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Helper function to format milliseconds to h:m:s
  const formatWaitingTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };

  // Fetch schemas
  const { data: schemas = [], isLoading: schemasLoading } = useQuery<TddfApiSchema[]>({
    queryKey: ["/api/tddf-api/schemas"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/schemas", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch schemas');
      return response.json();
    }
  });

  // Fetch modern uploader files (Step 6 processing data) with server-side pagination
  const { data: uploaderResponse = {}, isLoading: filesLoading } = useQuery<any>({
    queryKey: ["/api/uploader", dateFilters, uploadsItemsPerPage, uploadsCurrentPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('limit', uploadsItemsPerPage.toString());
      params.append('offset', (uploadsCurrentPage * uploadsItemsPerPage).toString());
      if (dateFilters.status && dateFilters.status !== 'all') {
        params.append('phase', dateFilters.status); // Map status to phase
      }
      
      const queryString = params.toString();
      const response = await fetch(`/api/uploader${queryString ? '?' + queryString : ''}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch uploader files');
      const data = await response.json();
      // Return the full response including total count
      return data;
    },
    refetchInterval: 5000 // Slightly slower since we're using cache
  });

  // Extract uploaded files and total count from response (for Section 1)
  const uploadedFiles = uploaderResponse.uploads || [];
  const totalUploads = uploaderResponse.total || uploaderResponse.uploads?.length || 0;

  // Fetch processed files separately for Section 2 with independent pagination
  const { data: processedResponse = {}, isLoading: processedFilesLoading } = useQuery<any>({
    queryKey: ["/api/uploader", "processed", processedFilesItemsPerPage, processedFilesCurrentPage, dateFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('limit', processedFilesItemsPerPage.toString());
      params.append('offset', (processedFilesCurrentPage * processedFilesItemsPerPage).toString());
      // Only get files that have completed processing (have business_day or record_count)
      // Use filter status if available, otherwise default to 'completed' for completed files
      const targetPhase = (dateFilters.status && dateFilters.status !== 'all') ? dateFilters.status : 'completed';
      params.append('phase', targetPhase);
      
      const queryString = params.toString();
      const response = await fetch(`/api/uploader${queryString ? '?' + queryString : ''}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch processed files');
      const data = await response.json();
      return data;
    },
    refetchInterval: 5000
  });

  // Extract processed files and total count from response (for Section 2)
  const processedFiles = processedResponse.uploads || [];
  const totalProcessedFiles = processedResponse.total || processedResponse.uploads?.length || 0;

  // Keep backward compatibility - files variable points to processed files for existing table
  const files = processedFiles;

  // Fetch API keys
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery<TddfApiKey[]>({
    queryKey: ["/api/tddf-api/keys"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/keys", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch API keys');
      return response.json();
    }
  });

  // Fetch modern processing status (Step 6 processing)
  const { data: processingStatus = {}, isLoading: queueLoading } = useQuery<any>({
    queryKey: ["/api/uploader/processing-status"],
    queryFn: async () => {
      const response = await fetch("/api/uploader/processing-status", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch processing status');
      return response.json();
    },
    refetchInterval: 5000 // Real-time updates every 5 seconds
  });

  // Fetch Step 6 queue status from MMS Watcher
  const { data: step6Status = {}, isLoading: step6Loading } = useQuery<any>({
    queryKey: ["/api/admin/step6-status"],
    queryFn: async () => {
      const response = await fetch("/api/admin/step6-status", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch Step 6 queue status');
      return response.json();
    },
    refetchInterval: 3000 // Real-time updates every 3 seconds
  });

  // Extract queue data from processing status for compatibility
  const queue = Array.isArray(processingStatus?.activeProcessing) ? processingStatus.activeProcessing : [];
  
  // Extract Step 6 queue and active slots
  const step6Queue = step6Status?.queue?.files || [];
  const step6ActiveSlots = step6Status?.activeSlots?.uploadIds || [];
  const step6Progress = step6Status?.activeSlots?.progress || [];

  // Fetch precached dashboard stats for Step 6 processing metrics
  const { data: dashboardStats = {}, isLoading: dashboardStatsLoading } = useQuery<any>({
    queryKey: ["/api/uploader/dashboard-stats"],
    queryFn: async () => {
      const response = await fetch("/api/uploader/dashboard-stats", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch dashboard stats');
      return response.json();
    },
    refetchInterval: 30000 // Cache-based so refresh every 30 seconds
  });

  // Fetch JSONB stats for dev_uploader_tddf_jsonb_records table
  const { data: jsonbStats = {}, isLoading: jsonbStatsLoading } = useQuery<any>({
    queryKey: ["/api/uploader/jsonb-stats"],
    queryFn: async () => {
      const response = await fetch("/api/uploader/jsonb-stats", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch JSONB stats');
      return response.json();
    },
    refetchInterval: 30000 // Cache-based so refresh every 30 seconds
  });

  // Fetch ALL files for Overview tab metrics (no pagination)
  const { data: allFilesResponse = {}, isLoading: allFilesLoading } = useQuery<any>({
    queryKey: ["/api/uploader/all-files-overview"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('limit', '10000'); // High limit to get all files
      params.append('offset', '0');
      
      const response = await fetch(`/api/uploader?${params.toString()}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch all files');
      return response.json();
    },
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const allFiles = allFilesResponse.uploads || [];
  const totalAllFiles = allFilesResponse.total || allFilesResponse.uploads?.length || 0;

  // Fetch archive data
  const { data: archiveData, isLoading: isLoadingArchive, refetch: refetchArchive } = useQuery({
    queryKey: ['/api/tddf-archive', archiveFilters, archiveSortBy, archiveSortOrder, archivePage, archiveItemsPerPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (archiveFilters.archiveStatus !== 'all') {
        params.set('archiveStatus', archiveFilters.archiveStatus);
      }
      if (archiveFilters.step6Status !== 'all') {
        params.set('step6Status', archiveFilters.step6Status);
      }
      if (archiveFilters.businessDayFrom) {
        params.set('businessDayFrom', archiveFilters.businessDayFrom);
      }
      if (archiveFilters.businessDayTo) {
        params.set('businessDayTo', archiveFilters.businessDayTo);
      }
      
      // Add sorting and pagination
      params.set('sortBy', archiveSortBy);
      params.set('sortOrder', archiveSortOrder);
      params.set('limit', archiveItemsPerPage.toString());
      params.set('offset', (archivePage * archiveItemsPerPage).toString());
      
      const response = await fetch(`/api/tddf-archive?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch archive data');
      }
      return response.json();
    },
    refetchInterval: 4000 // Real-time updates every 4 seconds
  });
  
  const archivedFiles = archiveData?.files || [];
  const totalArchivedFiles = archiveData?.total || 0;

  // Global filename search query
  const { data: searchResults, isLoading: isSearching, refetch: refetchSearch } = useQuery({
    queryKey: ['/api/tddf-api/search-filename', globalSearchTerm],
    queryFn: async () => {
      if (!globalSearchTerm.trim()) {
        return { success: false, results: { uploads: [], archive: [] }, summary: { totalResults: 0, uploadsCount: 0, archiveCount: 0 } };
      }
      const params = new URLSearchParams();
      params.set('search', globalSearchTerm);
      const response = await fetch(`/api/tddf-api/search-filename?${params}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to search for filename');
      }
      return response.json();
    },
    enabled: performSearch && globalSearchTerm.trim().length > 0,
    refetchOnMount: false,
    refetchOnWindowFocus: false
  });

  // Fetch uploader files
  const { data: uploadsResponse, isLoading: uploadsLoading } = useQuery({
    queryKey: ["/api/uploader", { 
      status: statusFilter, 
      fileType: fileTypeFilter, 
      filename: filenameFilter,
      environment: environmentFilter,
      sortBy,
      sortOrder,
      limit: itemsPerPage,
      offset: currentPage * itemsPerPage
    }],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.append('phase', statusFilter);
      if (fileTypeFilter !== 'all') params.append('fileType', fileTypeFilter);
      if (filenameFilter) params.append('filename', filenameFilter);
      if (environmentFilter !== 'current') params.append('environment', environmentFilter);
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      params.append('limit', itemsPerPage.toString());
      params.append('offset', (currentPage * itemsPerPage).toString());
      
      return apiRequest(`/api/uploader?${params.toString()}`);
    },
    refetchInterval: 5000
  });

  const uploads = (uploadsResponse as any)?.uploads || [];
  const totalCount = (uploadsResponse as any)?.totalCount || 0;

  // Sorting function for files table
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column as 'name' | 'date' | 'size' | 'businessDay' | 'records' | 'progress');
      setSortOrder('asc');
    }
  };

  // Sort files data based on current sort state
  const sortedFiles = [...files].sort((a, b) => {
    const direction = sortOrder === 'asc' ? 1 : -1;
    
    switch (sortBy) {
      case 'name':
        const aName = a.filename ?? a.original_name ?? '';
        const bName = b.filename ?? b.original_name ?? '';
        return aName.localeCompare(bName) * direction;
      case 'date':
        return (new Date(a.uploadedAt || a.uploaded_at || 0).getTime() - new Date(b.uploadedAt || b.uploaded_at || 0).getTime()) * direction;
      case 'size':
        return ((a.fileSize || a.file_size || 0) - (b.fileSize || b.file_size || 0)) * direction;
      case 'businessDay':
        const aBusinessDay = a.business_day ? new Date(a.business_day).getTime() : 0;
        const bBusinessDay = b.business_day ? new Date(b.business_day).getTime() : 0;
        return (aBusinessDay - bBusinessDay) * direction;
      case 'records':
        return ((a.record_count || 0) - (b.record_count || 0)) * direction;
      case 'progress':
        const aProgress = (a.record_count > 0) ? ((a.processed_records || 0) / a.record_count) * 100 : 0;
        const bProgress = (b.record_count > 0) ? ((b.processed_records || 0) / b.record_count) * 100 : 0;
        return (aProgress - bProgress) * direction;
      default:
        return 0;
    }
  });

  // Render sort indicator
  const getSortIndicator = (column: string) => {
    if (sortBy !== column) return null;
    return sortOrder === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />;
  };

  // Fetch monitoring data
  const { data: monitoring, isLoading: monitoringLoading, isFetching: monitoringFetching } = useQuery<any>({
    queryKey: ["/api/tddf-api/monitoring"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/monitoring", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch monitoring');
      return response.json();
    },
    refetchInterval: 4000 // Real-time updates every 4 seconds
  });

  // Fetch last API connection data
  const { data: lastConnection } = useQuery<any>({
    queryKey: ["/api/tddf-api/monitoring/last-connection"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/monitoring/last-connection", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch last connection');
      return response.json();
    },
    refetchInterval: 4000 // Real-time updates every 4 seconds
  });

  // Fetch connection hosts
  const { data: connectionHosts, error: hostsError, isError: hostsIsError } = useQuery<any>({
    queryKey: ["/api/tddf-api/monitoring/hosts"],
    refetchInterval: 10000, // Refresh every 10 seconds
    retry: 1, // Only retry once for missing tables
  });

  // Fetch connection log
  const { data: connectionLog, error: connectionLogError, isError: connectionLogIsError } = useQuery<any>({
    queryKey: ["/api/tddf-api/monitoring/connections"],
    refetchInterval: 5000, // Refresh every 5 seconds
    retry: 1, // Only retry once for missing tables
  });

  // Fetch host approvals
  const { data: hostApprovals, error: hostApprovalsError, isError: hostApprovalsIsError } = useQuery<any>({
    queryKey: ["/api/tddf-api/monitoring/host-approvals"],
    refetchInterval: 5000, // Refresh every 5 seconds
    retry: 1, // Only retry once for missing tables
  });

  // Approve/deny host mutation
  const updateHostApprovalMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes?: string }) =>
      apiRequest(`/api/tddf-api/monitoring/host-approvals/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status, notes }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/monitoring/host-approvals"] });
      toast({ title: "Host approval updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update host approval",
        variant: "destructive",
      });
    },
  });

  // Fetch merchant lookup map for displaying merchant names
  const { data: merchantLookupMap = {}, isLoading: merchantLookupLoading } = useQuery<Record<string, string>>({
    queryKey: ["/api/merchants/lookup-map"],
    enabled: true, // Always fetch merchant lookup
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Helper function to get merchant name from lookup map
  const getMerchantName = (merchantAccountNumber: string | null): string | null => {
    if (!merchantAccountNumber || !merchantLookupMap) return null;
    
    // TDDF uses 16-digit format with leading zero, merchant table uses 15-digit
    // Strip leading zero to match merchant table format
    const normalizedAccount = merchantAccountNumber.replace(/^0+/, '');
    return merchantLookupMap[normalizedAccount] || null;
  };

  // Create schema mutation
  const createSchemaMutation = useMutation({
    mutationFn: (schemaData: any) => apiRequest("/api/tddf-api/schemas", {
      method: "POST",
      body: JSON.stringify(schemaData)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/schemas"], exact: false });
      setNewSchemaData({ name: "", version: "", description: "", schemaData: "" });
      toast({ title: "Schema created successfully" });
    }
  });

  // Upload file mutation
  const uploadFileMutation = useMutation({
    mutationFn: (formData: FormData) => {
      return fetch("/api/tddf-api/upload", {
        method: "POST",
        body: formData,
        credentials: "include"
      }).then(res => {
        if (!res.ok) throw new Error("Upload failed");
        return res.json();
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/queue"], exact: false });
      setUploadFile(null);
      setShowUploadDialog(false);
      toast({ title: "File uploaded successfully" });
    }
  });

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: (keyData: any) => apiRequest("/api/tddf-api/keys", {
      method: "POST",
      body: JSON.stringify(keyData)
    }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/keys"], exact: false });
      setCreatedApiKey(data?.key || "");
      setNewApiKey({ keyName: "", permissions: ["read"], rateLimitPerMinute: 100, expiresAt: "" });
      setIsCreateKeyDialogOpen(false);
      toast({ title: "API key created successfully" });
    }
  });

  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: (keyId: number) => apiRequest(`/api/tddf-api/keys/${keyId}`, {
      method: "DELETE"
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/keys"], exact: false });
      toast({ title: "API key deleted successfully" });
    }
  });

  // Start upload mutation
  const startUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await apiRequest('/api/uploader/start', {
        method: 'POST',
        body: {
          filename: file.name,
          fileSize: file.size,
          sessionId,
          finalFileType: selectedFileType,
          userClassifiedType: selectedFileType,
          keep: keep
        }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
    }
  });

  // Update phase mutation
  const updatePhaseMutation = useMutation({
    mutationFn: async ({ uploadId, phase, phaseData }: { 
      uploadId: string; 
      phase: string; 
      phaseData?: Record<string, any> 
    }) => {
      const response = await apiRequest(`/api/uploader/${uploadId}/phase/${phase}`, {
        method: 'POST',
        body: phaseData || {}
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
    }
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/uploader/bulk-delete', {
        method: 'DELETE',
        body: { uploadIds }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      setSelectedUploads([]);
    }
  });

  // Step 6 processing mutation
  const step6ProcessingMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/uploader/step6-processing', {
        method: 'POST',
        body: { uploadIds }
      });
      return response;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf-api/files'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf-api/queue'] });
      setSelectedUploads([]);
      toast({ 
        title: "Step 6 processing completed successfully", 
        description: "Files have been queued for processing and will appear in the Processing tab"
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Step 6 processing failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  // Reset errors mutation for bulk error recovery (legacy - for error status only)
  const resetErrorsMutation = useMutation<WarningResetResponse, Error, string[]>({
    mutationFn: async (fileIds: string[]) => {
      const response = await apiRequest('/api/uploader/reset-errors', {
        method: 'POST',
        body: { fileIds }
      }) as WarningResetResponse;
      return response;
    },
    onSuccess: (data: WarningResetResponse) => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      setSelectedUploads([]);
      toast({ 
        title: "Error status reset completed", 
        description: `${data.resetCount} file(s) reset successfully. TDDF files will be automatically processed by Auto Step 6.`,
        variant: "default"
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Reset errors failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  // Reset status mutation - resets files from ANY status back to uploaded
  interface ResetStatusResponse {
    success: boolean;
    message: string;
    filesReset: number;
    skipped: number;
    files?: Array<{ id: string; filename: string; previousPhase: string }>;
    skippedFiles?: Array<{ id: string; filename: string; reason: string }>;
    warnings?: string[];
  }
  
  const resetStatusMutation = useMutation<ResetStatusResponse, Error, string[]>({
    mutationFn: async (fileIds: string[]) => {
      const response = await apiRequest('/api/uploader/reset-status', {
        method: 'POST',
        body: { fileIds }
      }) as ResetStatusResponse;
      return response;
    },
    onSuccess: (data: ResetStatusResponse) => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      setSelectedUploads([]);
      toast({ 
        title: "Status reset completed", 
        description: `${data.filesReset} file(s) reset to uploaded status for reprocessing.`,
        variant: "default"
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Reset status failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  // Manual Step 7 Archive mutation for completed files
  const archiveMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/uploader/manual-step7-archive', {
        method: 'POST',
        body: { uploadIds }
      });
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf-archive'] });
      setSelectedUploads([]);
      toast({ 
        title: "Manual Step 7 completed successfully", 
        description: `${data.successCount || 0} file(s) marked as archived`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Manual Step 7 failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  // Restore archived files mutation
  const restoreArchivedMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/uploader/restore-archived', {
        method: 'POST',
        body: { uploadIds }
      });
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf-archive'] });
      setSelectedArchiveFiles([]);
      toast({ 
        title: "Restore completed successfully", 
        description: `${data.successCount || 0} file(s) restored to active processing`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Restore failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  // Recalculate business dates mutation
  const recalculateBusinessDatesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/uploader/recalculate-business-dates', {
        method: 'POST'
      });
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tddf-archive'] });
      toast({ 
        title: "Business date recalculation started", 
        description: "Background process is updating business dates from filenames"
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Recalculation failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  // Archive sorting handler
  const handleArchiveSort = (column: string) => {
    if (archiveSortBy === column) {
      setArchiveSortOrder(archiveSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setArchiveSortBy(column);
      setArchiveSortOrder('asc');
    }
    setArchivePage(0); // Reset to first page when sorting changes
  };

  // Archive sort indicator
  const getArchiveSortIndicator = (column: string) => {
    if (archiveSortBy !== column) return null;
    return archiveSortOrder === 'asc' ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />;
  };

  // Delete files mutation
  const deleteFilesMutation = useMutation({
    mutationFn: async (fileIds: (string | number)[]) => {
      return apiRequest("/api/uploader/bulk-delete", {
        method: "DELETE",
        body: JSON.stringify({ uploadIds: fileIds })
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/uploader"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/tddf1/monthly-totals"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/tddf1/monthly-comparison"], exact: false });
      setSelectedFiles(new Set());
      setShowDeleteDialog(false);
      
      const message = data?.tddfRecordsDeleted > 0
        ? `${data.message} - Dashboard totals will be recalculated`
        : data?.message || "Files deleted successfully";
      
      toast({ 
        title: "Success",
        description: message
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete files", description: error.message, variant: "destructive" });
    }
  });

  const handleSchemaCreate = () => {
    try {
      const parsedSchemaData = JSON.parse(newSchemaData.schemaData);
      createSchemaMutation.mutate({
        ...newSchemaData,
        schemaData: parsedSchemaData
      });
    } catch (error) {
      toast({ title: "Invalid JSON in schema data", variant: "destructive" });
    }
  };

  const handleFileUpload = () => {
    if (!uploadFile) return;
    
    const formData = new FormData();
    formData.append("file", uploadFile);
    if (selectedSchema) {
      formData.append("schemaId", selectedSchema.toString());
    }
    
    uploadFileMutation.mutate(formData);
  };

  const handleCreateApiKey = () => {
    createApiKeyMutation.mutate(newApiKey);
  };

  const handleDeleteApiKey = (keyId: number) => {
    setDeleteKeyId(keyId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteApiKey = () => {
    if (deleteKeyId !== null) {
      deleteApiKeyMutation.mutate(deleteKeyId);
      setIsDeleteDialogOpen(false);
      setDeleteKeyId(null);
    }
  };

  const copyToClipboard = async (text: string, keyId?: number) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    if (keyId !== undefined) {
      setCopiedKeyId(keyId);
      setTimeout(() => setCopiedKeyId(null), 2000);
    } else {
      setTimeout(() => setCopied(false), 2000);
    }
    toast({ title: "Copied to clipboard" });
  };


  // File selection helper functions
  const toggleFileSelection = (fileId: number) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
  };

  const toggleAllFiles = () => {
    if (selectedFiles.size === files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f: TddfApiFile) => f.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedFiles.size > 0) {
      deleteFilesMutation.mutate(Array.from(selectedFiles));
    }
  };

  // Upload handler functions
  const handleUploadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setSelectedUploadFiles(files);
      if (selectedFileType) {
        setTimeout(() => handleStartUpload(files), 100);
      }
    }
  };

  const handleStartUpload = async (files: FileList) => {
    if (!selectedFileType) {
      toast({ title: "Please select a file type first", variant: "destructive" });
      return;
    }

    for (const file of Array.from(files)) {
      // Create upload session
      const sessionData = {
        sessionId,
        filename: file.name,
        fileSize: file.size,
        fileType: selectedFileType,
        keepForReview: keep,
        auto45Enabled
      };

      try {
        // Start upload session
        const uploadResponse = await startUploadMutation.mutateAsync(file);
        
        if (uploadResponse && typeof uploadResponse === 'object' && 'id' in uploadResponse) {
          const uploadId = (uploadResponse as any).id;
          
          // Determine if we need chunked upload (files > 25MB)
          const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
          const USE_CHUNKED_THRESHOLD = 25 * 1024 * 1024; // 25MB threshold
          const useChunkedUpload = file.size > USE_CHUNKED_THRESHOLD;
          
          if (useChunkedUpload) {
            // Chunked upload for large files
            console.log(`[CHUNKED-UPLOAD] Starting chunked upload for ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
            
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            let uploadedChunks = 0;
            
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
              const start = chunkIndex * CHUNK_SIZE;
              const end = Math.min(start + CHUNK_SIZE, file.size);
              const chunk = file.slice(start, end);
              
              const formData = new FormData();
              formData.append('chunk', chunk);
              formData.append('chunkIndex', chunkIndex.toString());
              formData.append('totalChunks', totalChunks.toString());
              
              console.log(`[CHUNKED-UPLOAD] Uploading chunk ${chunkIndex + 1}/${totalChunks} (${(chunk.size / 1024 / 1024).toFixed(2)} MB)`);
              
              const chunkResponse = await fetch(`/api/uploader/${uploadId}/upload-chunk`, {
                method: 'POST',
                body: formData,
                credentials: 'include'
              });
              
              if (!chunkResponse.ok) {
                throw new Error(`Chunk upload failed: ${chunkResponse.status}`);
              }
              
              const chunkResult = await chunkResponse.json();
              uploadedChunks++;
              
              // Show progress toast
              const progress = Math.round((uploadedChunks / totalChunks) * 100);
              if (chunkIndex % 2 === 0 || chunkIndex === totalChunks - 1) { // Update every other chunk
                toast({ 
                  title: `Uploading ${file.name}`, 
                  description: `${progress}% (${uploadedChunks}/${totalChunks} chunks)` 
                });
              }
              
              if (chunkResult.complete) {
                console.log(`[CHUNKED-UPLOAD] Upload complete for ${file.name}`);
                break;
              }
            }
            
            // Update to uploaded status
            await updatePhaseMutation.mutateAsync({
              uploadId: uploadId,
              phase: 'uploaded',
              phaseData: { uploadProgress: 100 }
            });
            
            toast({ title: `${file.name} uploaded successfully (chunked)`, variant: "default" });
          } else {
            // Standard upload for smaller files
            const formData = new FormData();
            formData.append('file', file);
            formData.append('sessionId', sessionId);
            
            const uploadApiResponse = await fetch(`/api/uploader/${uploadId}/upload`, {
              method: 'POST',
              body: formData,
              credentials: 'include'
            });
            
            if (!uploadApiResponse.ok) {
              throw new Error(`Upload failed: ${uploadApiResponse.status}`);
            }
            
            // Update to uploaded status
            await updatePhaseMutation.mutateAsync({
              uploadId: uploadId,
              phase: 'uploaded',
              phaseData: { uploadProgress: 100 }
            });
            
            toast({ title: `${file.name} uploaded successfully` });
          }
        }
        
      } catch (error) {
        console.error('Upload error:', error);
        toast({ title: `Failed to upload ${file.name}`, variant: "destructive" });
      }
    }

    // Reset selection
    setSelectedUploadFiles(null);
    const fileInput = document.getElementById('tddf-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleBulkDelete = () => {
    if (selectedUploads.length > 0) {
      bulkDeleteMutation.mutate(selectedUploads);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0]; // Take the first file
      setUploadFile(file);
    }
  };

  // File viewing handler
  const handleViewArchiveFile = async (archiveFile: any) => {
    setViewingArchiveFile(archiveFile);
    setLoadingArchiveContent(true);
    
    try {
      const response = await fetch(`/api/tddf-archive/${archiveFile.id}/content`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.content) {
        setArchiveFileContent(data.content);
      } else {
        throw new Error(data.error || 'No file content received');
      }
    } catch (error) {
      console.error('Error loading archive file content:', error);
      toast({
        title: "Error loading file",
        description: error instanceof Error ? error.message : "Failed to load archive file content",
        variant: "destructive"
      });
      setArchiveFileContent('Error loading file content');
    } finally {
      setLoadingArchiveContent(false);
    }
  };

  const handleViewFile = async (file: TddfApiFile) => {
    setSelectedFileForView(file);
    setViewFileDialog(true);
    setFileContent("Loading...");
    
    try {
      const response = await fetch(`/api/tddf-api/files/${file.id}/content`);
      if (response.ok) {
        const content = await response.text();
        setFileContent(content);
      } else {
        setFileContent("Error loading file content");
      }
    } catch (error) {
      setFileContent("Error loading file content");
    }
  };

  // Handle viewing uploader file content
  const handleViewUploaderFile = async (upload: UploaderUpload) => {
    setUploaderFileForView(upload);
    setLoadingUploaderContent(true);
    
    try {
      const response = await fetch(`/api/uploader/${upload.id}/content`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data.content) {
        setUploaderFileContent(data.content);
      } else {
        throw new Error(data.error || 'No file content received');
      }
    } catch (error) {
      console.error('Error loading uploader file content:', error);
      toast({
        title: "Error loading file",
        description: error instanceof Error ? error.message : "Failed to load uploader file content",
        variant: "destructive"
      });
      setUploaderFileContent('Error loading file content');
    } finally {
      setLoadingUploaderContent(false);
    }
  };

  // Handle showing error details for uploader files
  const handleShowErrorDetails = (upload: any) => {
    setSelectedErrorUpload(upload);
    setErrorDetailsDialog(true);
  };

  // Handle showing warning details for uploader files
  const handleShowWarningDetails = (upload: any) => {
    setSelectedWarningUpload({ id: upload.id, filename: upload.filename });
    setWarningDialogOpen(true);
  };

  // Get brief error summary for tooltip
  const getErrorSummary = (processingErrors: any): string => {
    if (!processingErrors) return "No error details available";
    
    try {
      if (typeof processingErrors === 'string') {
        return processingErrors.length > 100 
          ? processingErrors.substring(0, 100) + '...' 
          : processingErrors;
      }
      
      if (typeof processingErrors === 'object') {
        const errorText = JSON.stringify(processingErrors);
        return errorText.length > 100 
          ? errorText.substring(0, 100) + '...' 
          : errorText;
      }
    } catch {
      return "Error parsing error details";
    }
    
    return "Unknown error format";
  };


  return (
    <MainLayout>
      <div className="container mx-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setLocation('/')}
              className="flex items-center gap-2 w-fit"
              data-testid="button-back-home"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-xl sm:text-3xl font-bold tracking-tight">MDAS API Data</h1>
              <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                High-performance position-based flat file processing with dynamic schema configuration
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit text-xs">
            {files.length} Files | {schemas.length} Schemas | {apiKeys.length} API Keys
          </Badge>
        </div>

      {/* Global Filename Search */}
      <Card className="border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader className="p-3 sm:p-6">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Search className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            Global Filename Search
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Search for files in both active uploads and archive. Try full or partial filename match.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-3 sm:p-6 pt-0 sm:pt-0">
          {/* Search Input */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Input
                placeholder="Enter filename or partial match (e.g., 10022025)"
                value={globalSearchTerm}
                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && globalSearchTerm.trim()) {
                    setPerformSearch(true);
                    setShowSearchResults(true);
                    refetchSearch();
                  }
                }}
                className="text-sm sm:text-base"
                data-testid="input-global-search"
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  if (globalSearchTerm.trim()) {
                    setPerformSearch(true);
                    setShowSearchResults(true);
                    refetchSearch();
                  }
                }}
                disabled={!globalSearchTerm.trim() || isSearching}
                data-testid="button-global-search"
                className="flex-1 sm:flex-none"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    <span className="hidden sm:inline">Searching...</span>
                    <span className="sm:hidden">...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Search</span>
                  </>
                )}
              </Button>
              {showSearchResults && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setGlobalSearchTerm('');
                    setPerformSearch(false);
                    setShowSearchResults(false);
                  }}
                  data-testid="button-clear-search"
                  className="flex-1 sm:flex-none"
                >
                  <X className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Clear</span>
                </Button>
              )}
            </div>
          </div>

          {/* Search Results */}
          {showSearchResults && searchResults && (
            <div className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Search Results</h3>
                <Badge variant="secondary">
                  {searchResults.summary?.totalResults || 0} total results
                </Badge>
              </div>

              {searchResults.summary?.totalResults === 0 ? (
                <div className="text-center py-8 text-muted-foreground bg-white dark:bg-gray-900 rounded-lg border">
                  <Search className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">No files found</p>
                  <p className="text-sm">Try searching with a different filename or partial match</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Uploads Results */}
                  {searchResults.results?.uploads?.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-green-600" />
                        <h4 className="font-semibold text-green-700 dark:text-green-400">
                          Active Uploads ({searchResults.summary?.uploadsCount || 0})
                        </h4>
                      </div>
                      <div className="space-y-1.5">
                        {searchResults.results.uploads.map((file: any) => (
                          <Card key={file.id} className="bg-white dark:bg-gray-900">
                            <CardContent className="p-3">
                              <div className="space-y-2">
                                <p className="font-medium text-xs truncate" title={file.filename}>
                                  {file.filename}
                                </p>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                                    <span className="flex items-center gap-0.5 whitespace-nowrap">
                                      <Clock className="h-2.5 w-2.5" />
                                      {file.start_time ? format(new Date(file.start_time), 'MMM d, yyyy h:mm a') : 'N/A'}
                                    </span>
                                    {file.file_size && (
                                      <span className="whitespace-nowrap">{formatFileSize(file.file_size)}</span>
                                    )}
                                    {(file.bh_record_count || file.dt_record_count) && (
                                      <span className="whitespace-nowrap">
                                        BH: {file.bh_record_count || 0} | DT: {file.dt_record_count || 0}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                                    <Badge variant={file.upload_status === 'completed' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                                      {file.current_phase || 'unknown'}
                                    </Badge>
                                    {file.is_archived && (
                                      <>
                                        <Badge variant="outline" className="bg-gray-100 text-[10px] px-1.5 py-0 whitespace-nowrap">Archived</Badge>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={async () => {
                                            try {
                                              await restoreArchivedMutation.mutateAsync([file.id]);
                                              toast({ title: "File restored successfully" });
                                              refetchSearch();
                                            } catch (error: any) {
                                              toast({ 
                                                title: "Failed to restore file", 
                                                description: error.message,
                                                variant: "destructive" 
                                              });
                                            }
                                          }}
                                          className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                          disabled={restoreArchivedMutation.isPending}
                                          title="Restore file"
                                        >
                                          <RotateCcw className="h-3 w-3" />
                                        </Button>
                                      </>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to delete "${file.filename}"?`)) {
                                          try {
                                            await deleteFilesMutation.mutateAsync([file.id]);
                                            toast({ title: "File deleted successfully" });
                                            refetchSearch();
                                          } catch (error: any) {
                                            toast({ 
                                              title: "Failed to delete file", 
                                              description: error.message,
                                              variant: "destructive" 
                                            });
                                          }
                                        }
                                      }}
                                      className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      data-testid={`button-delete-${file.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Archive Results */}
                  {searchResults.results?.archive?.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-purple-600" />
                        <h4 className="font-semibold text-purple-700 dark:text-purple-400">
                          Archived Files ({searchResults.summary?.archiveCount || 0})
                        </h4>
                      </div>
                      <div className="space-y-1.5">
                        {searchResults.results.archive.map((file: any) => (
                          <Card key={file.id} className="bg-white dark:bg-gray-900">
                            <CardContent className="p-3">
                              <div className="space-y-2">
                                <p className="font-medium text-xs truncate" title={file.filename}>
                                  {file.filename}
                                </p>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                                    <span className="flex items-center gap-0.5 whitespace-nowrap">
                                      <Clock className="h-2.5 w-2.5" />
                                      {file.archived_at ? format(new Date(file.archived_at), 'MMM d, yyyy h:mm a') : 'N/A'}
                                    </span>
                                    {file.file_size && (
                                      <span className="whitespace-nowrap">{formatFileSize(file.file_size)}</span>
                                    )}
                                    {(file.bh_record_count || file.dt_record_count) && (
                                      <span className="whitespace-nowrap">
                                        BH: {file.bh_record_count || 0} | DT: {file.dt_record_count || 0}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px] px-1.5 py-0 whitespace-nowrap">
                                      Archived
                                    </Badge>
                                    {file.archived_by && (
                                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">by {file.archived_by}</span>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        try {
                                          await restoreArchivedMutation.mutateAsync([file.id]);
                                          toast({ title: "File restored successfully" });
                                          refetchSearch();
                                        } catch (error: any) {
                                          toast({ 
                                            title: "Failed to restore file", 
                                            description: error.message,
                                            variant: "destructive" 
                                          });
                                        }
                                      }}
                                      className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      disabled={restoreArchivedMutation.isPending}
                                      title="Restore file"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to delete archived file "${file.filename}"?`)) {
                                          try {
                                            await deleteFilesMutation.mutateAsync([file.id]);
                                            toast({ title: "Archived file deleted successfully" });
                                            refetchSearch();
                                          } catch (error: any) {
                                            toast({ 
                                              title: "Failed to delete archived file", 
                                              description: error.message,
                                              variant: "destructive" 
                                            });
                                          }
                                        }
                                      }}
                                      className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      data-testid={`button-delete-archive-${file.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
          <TabsList className="inline-flex w-max sm:grid sm:w-full sm:grid-cols-8 gap-1">
            <TabsTrigger value="overview" className="text-xs sm:text-sm whitespace-nowrap">Overview</TabsTrigger>
            <TabsTrigger value="raw-data" className="text-xs sm:text-sm whitespace-nowrap">Raw Data</TabsTrigger>
            <TabsTrigger value="files" className="text-xs sm:text-sm whitespace-nowrap">Files</TabsTrigger>
            <TabsTrigger value="processing" className="text-xs sm:text-sm whitespace-nowrap">Processing</TabsTrigger>
            <TabsTrigger value="data" className="text-xs sm:text-sm whitespace-nowrap">Data</TabsTrigger>
            <TabsTrigger value="api-keys" className="text-xs sm:text-sm whitespace-nowrap">API Keys</TabsTrigger>
            <TabsTrigger value="monitoring" className="text-xs sm:text-sm whitespace-nowrap">Monitoring</TabsTrigger>
            <TabsTrigger value="schemas" className="text-xs sm:text-sm whitespace-nowrap">Schemas</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
            <h2 className="text-lg sm:text-2xl font-bold">System Overview</h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/uploader"], exact: false });
                queryClient.invalidateQueries({ queryKey: ["/api/uploader/processing-status"], exact: false });
                queryClient.invalidateQueries({ queryKey: ["/api/uploader/dashboard-stats"], exact: false });
                queryClient.invalidateQueries({ queryKey: ["/api/uploader/jsonb-stats"], exact: false });
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/monitoring"], exact: false });
                toast({ title: "Step 6 dashboard data refreshed" });
              }}
              disabled={filesLoading || queueLoading || dashboardStatsLoading}
            >
              <RefreshCw className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Files</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalAllFiles}</div>
                <p className="text-xs text-muted-foreground">
                  {allFiles.filter((f: TddfApiFile) => f.current_phase === "encoded").length} Step 6 processed
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">JSONB Records</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(jsonbStats?.totalRecords || 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  dev_uploader_tddf_jsonb_records
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Step 6 Processing</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {allFiles.filter((f: TddfApiFile) => f.current_phase === "processing" || f.current_phase === "encoding").length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {allFiles.filter((f: TddfApiFile) => f.current_phase === "processing").length} active
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">API Requests</CardTitle>
                <Key className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.total_requests || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Last 24 hours
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Automation Controls Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Automation Controls
              </CardTitle>
              <CardDescription>
                Configure automatic processing for uploaded files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Auto 4-5 Encode */}
              <div className="flex items-center gap-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <Switch
                  checked={auto45Enabled}
                  onCheckedChange={handleAuto45Change}
                  disabled={saveAuto45Setting.isPending}
                  data-testid="switch-auto-45-overview"
                />
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-purple-600" />
                  <div>
                    <div className="font-medium text-purple-800">Auto 4-5</div>
                    <div className="text-sm text-purple-600">
                      Automatic file identification and encoding (Steps 4-5)
                    </div>
                  </div>
                </div>
              </div>

              {/* Auto 6 Json Encode */}
              <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <Switch
                  checked={autoStep6Enabled}
                  onCheckedChange={handleAutoStep6Change}
                  disabled={saveAutoStep6Setting.isPending}
                  data-testid="switch-auto-step6-overview"
                />
                <div className="flex items-center gap-3">
                  <Pause className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="font-medium text-blue-800">Auto 6 Json Encode</div>
                    <div className="text-sm text-blue-600">
                      Enable automatic Step 6 JSON encoding for uploaded files
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 6 Processing Slots */}
              <div className="flex items-center gap-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                <Select
                  value={step6MaxConcurrent.toString()}
                  onValueChange={(value) => handleStep6MaxConcurrentChange(parseInt(value))}
                  disabled={saveStep6MaxConcurrent.isPending}
                >
                  <SelectTrigger className="w-[100px]" data-testid="select-step6-slots">
                    <SelectValue placeholder="Slots" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? 'slot' : 'slots'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-3">
                  <Activity className="h-5 w-5 text-indigo-600" />
                  <div>
                    <div className="font-medium text-indigo-800">Step 6 Processing Slots</div>
                    <div className="text-sm text-indigo-600">
                      Concurrent file processing capacity ({step6Config?.currentStatus?.activeSlots || 0} active, {step6Config?.currentStatus?.queuedFiles || 0} queued)
                    </div>
                  </div>
                </div>
              </div>

              {/* Auto 7 Archive */}
              <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <Switch
                  checked={autoStep7Enabled}
                  onCheckedChange={handleAutoStep7Change}
                  disabled={saveAutoStep7Setting.isPending}
                  data-testid="switch-auto-step7-overview"
                />
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-medium text-green-800">Auto 7 Archive</div>
                    <div className="text-sm text-green-600">
                      Enable automatic Step 7 archiving for completed files
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Analytics Section */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-xl font-semibold mb-4">Advanced Analytics & Insights</h3>
            
            {/* Key Metrics Dashboard */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Data Volume</CardTitle>
                  <Database className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatFileSize(allFiles.reduce((sum: number, f: TddfApiFile) => sum + (Number(f.file_size) || 0), 0))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Across {totalAllFiles} files
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Processing Success Rate</CardTitle>
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {allFiles.length > 0 
                      ? ((allFiles.filter((f: TddfApiFile) => f.status === "completed").length / allFiles.length) * 100).toFixed(1)
                      : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {allFiles.filter((f: TddfApiFile) => f.status === "completed").length} of {totalAllFiles} files
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Average File Size</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {allFiles.length > 0 
                      ? formatFileSize(allFiles.reduce((sum: number, f: TddfApiFile) => sum + (Number(f.file_size) || 0), 0) / allFiles.length)
                      : "0 B"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Per file average
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Data Quality Score</CardTitle>
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {allFiles.length > 0 
                      ? (100 - (allFiles.filter((f: TddfApiFile) => f.status === "failed" || f.status === "error").length / allFiles.length) * 100).toFixed(1)
                      : 100}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Based on error rate
                  </p>
                </CardContent>
              </Card>
            </div>
            
            {/* Data Distribution Charts */}
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>File Status Distribution</CardTitle>
                  <CardDescription>Current status of all uploaded files</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {['completed', 'processing', 'uploaded', 'failed', 'error'].map((status) => {
                      const count = allFiles.filter((f: TddfApiFile) => f.status === status).length;
                      const percentage = allFiles.length > 0 ? (count / allFiles.length) * 100 : 0;
                      return (
                        <div key={status} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={getStatusBadgeVariant(status)}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{count} files</span>
                          </div>
                          <div className="flex items-center gap-2 min-w-0 flex-1 ml-4">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  status === 'completed' ? 'bg-green-500' :
                                  status === 'processing' ? 'bg-blue-500' :
                                  status === 'uploaded' ? 'bg-yellow-500' :
                                  'bg-red-500'
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium min-w-[3rem] text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>File Size Distribution</CardTitle>
                  <CardDescription>Distribution of file sizes by category</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: 'Small (< 1MB)', filter: (f: any) => f.file_size < 1024 * 1024 },
                      { label: 'Medium (1-10MB)', filter: (f: any) => f.file_size >= 1024 * 1024 && f.file_size < 10 * 1024 * 1024 },
                      { label: 'Large (10-100MB)', filter: (f: any) => f.file_size >= 10 * 1024 * 1024 && f.file_size < 100 * 1024 * 1024 },
                      { label: 'Extra Large (100MB+)', filter: (f: any) => f.file_size >= 100 * 1024 * 1024 }
                    ].map((category) => {
                      const count = allFiles.filter(category.filter).length;
                      const percentage = allFiles.length > 0 ? (count / allFiles.length) * 100 : 0;
                      return (
                        <div key={category.label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium min-w-[7rem]">{category.label}</span>
                            <span className="text-sm text-muted-foreground">{count} files</span>
                          </div>
                          <div className="flex items-center gap-2 min-w-0 flex-1 ml-4">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div 
                                className="h-2 rounded-full bg-blue-500"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium min-w-[3rem] text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Data Quality & Records Analysis */}
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>Record Processing Stats</CardTitle>
                  <CardDescription>Analysis of record counts and processing efficiency</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {allFiles.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Total Records</div>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {allFiles.reduce((sum: number, f: TddfApiFile) => sum + (f.processed_records || 0), 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Processed Records</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Processing Progress</span>
                        <span>
                          {allFiles.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0) > 0 
                            ? ((allFiles.reduce((sum: number, f: TddfApiFile) => sum + (f.processed_records || 0), 0) / allFiles.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0)) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${allFiles.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0) > 0 
                              ? (allFiles.reduce((sum: number, f: TddfApiFile) => sum + (f.processed_records || 0), 0) / allFiles.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0)) * 100
                              : 0}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Average records per file: {allFiles.length > 0 
                        ? Math.round(allFiles.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0) / allFiles.length).toLocaleString()
                        : 0}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Upload Trends</CardTitle>
                  <CardDescription>File upload patterns over time</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {allFiles.length > 0 ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="text-lg font-bold">
                              {allFiles.filter((f: TddfApiFile) => {
                                const uploadDate = new Date(f.uploaded_at || '');
                                const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                                return uploadDate > dayAgo;
                              }).length}
                            </div>
                            <div className="text-xs text-muted-foreground">Last 24 Hours</div>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="text-lg font-bold">
                              {allFiles.filter((f: TddfApiFile) => {
                                const uploadDate = new Date(f.uploaded_at || '');
                                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                                return uploadDate > weekAgo;
                              }).length}
                            </div>
                            <div className="text-xs text-muted-foreground">Last 7 Days</div>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="text-sm font-medium">Latest Upload Activity</div>
                          {allFiles.slice(0, 3).map((file: TddfApiFile) => (
                            <div key={file.id} className="flex items-center justify-between text-xs p-2 bg-muted rounded">
                              <span className="truncate max-w-[60%]">{file.filename}</span>
                              <span className="text-muted-foreground">
                                {file.uploaded_at ? format(new Date(file.uploaded_at), "MMM d, HH:mm") : "Unknown"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        No upload data available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Schema Usage Analytics */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Schema Usage Analytics</CardTitle>
                <CardDescription>How different schemas are being utilized across files</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {schemas.length > 0 ? (
                    schemas.map((schema) => {
                      const schemaFiles = allFiles.filter((f: TddfApiFile) => f.schema_name === schema.name);
                      const usagePercentage = allFiles.length > 0 ? (schemaFiles.length / allFiles.length) * 100 : 0;
                      return (
                        <div key={schema.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant={schema.is_active !== false ? "default" : "secondary"}>
                              {schema.name} v{schema.version}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {schemaFiles.length} files
                            </span>
                          </div>
                          <div className="flex items-center gap-2 min-w-0 flex-1 ml-4">
                            <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[200px]">
                              <div 
                                className="h-2 rounded-full bg-purple-500"
                                style={{ width: `${usagePercentage}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium min-w-[3rem] text-right">
                              {usagePercentage.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center text-muted-foreground py-4">
                      No schemas available for analysis
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Files</CardTitle>
                <CardDescription>Latest uploaded TDDF files</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {allFiles.slice(0, 5).map((file: TddfApiFile) => (
                    <div key={file.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.file_size)} • {file.uploaded_at ? format(new Date(file.uploaded_at), "MMM d, yyyy") : "Unknown"}
                        </p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(file.status)}>
                        {file.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Schemas</CardTitle>
                <CardDescription>Available processing schemas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {schemas.filter(s => s.is_active).slice(0, 5).map((schema) => (
                    <div key={schema.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{schema.name}</p>
                        <p className="text-xs text-muted-foreground">
                          v{schema.version} • Created
                        </p>
                      </div>
                      <Badge variant="default">Active</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="schemas" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Schema Management</h2>
            <Dialog>
              <DialogTrigger asChild>
                <Button>
                  <Database className="mr-2 h-4 w-4" />
                  Create Schema
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create New Schema</DialogTitle>
                  <DialogDescription>
                    Define a new TDDF processing schema with field mappings
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="schema-name">Name</Label>
                      <Input
                        id="schema-name"
                        value={newSchemaData.name}
                        onChange={(e) => setNewSchemaData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="TDDF Schema Name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="schema-version">Version</Label>
                      <Input
                        id="schema-version"
                        value={newSchemaData.version}
                        onChange={(e) => setNewSchemaData(prev => ({ ...prev, version: e.target.value }))}
                        placeholder="1.0.0"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="schema-description">Description</Label>
                    <Input
                      id="schema-description"
                      value={newSchemaData.description}
                      onChange={(e) => setNewSchemaData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Schema description"
                    />
                  </div>
                  <div>
                    <Label htmlFor="schema-data">Schema Data (JSON)</Label>
                    <Textarea
                      id="schema-data"
                      className="h-40"
                      value={newSchemaData.schemaData}
                      onChange={(e) => setNewSchemaData(prev => ({ ...prev, schemaData: e.target.value }))}
                      placeholder='{"recordTypes": {"DT": {"fields": [...]}}}'
                    />
                  </div>
                  <Button 
                    onClick={handleSchemaCreate}
                    disabled={createSchemaMutation.isPending}
                    className="w-full"
                  >
                    {createSchemaMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Schema
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schemasLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    schemas.map((schema) => (
                      <TableRow key={schema.id}>
                        <TableCell className="font-medium">{schema.name}</TableCell>
                        <TableCell>{schema.version}</TableCell>
                        <TableCell className="max-w-xs truncate">{schema.description}</TableCell>
                        <TableCell>
                          <Badge variant={schema.is_active !== false ? "default" : "secondary"}>
                            {schema.is_active !== false ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {schema.created_at ? format(new Date(schema.created_at), "MMM d, yyyy") : "Unknown"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="space-y-4">
          {/* Files Management with Inner Tabs */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
            <h2 className="text-lg sm:text-2xl font-bold">TDDF Upload & Files</h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs bg-blue-50">
                {uploads.filter((u: UploaderUpload) => ['started', 'uploading', 'uploaded', 'identified', 'validating', 'encoding'].includes(u.currentPhase)).length} Uploading
              </Badge>
              <Badge variant="outline" className="text-xs bg-green-50">
                {uploads.filter((u: UploaderUpload) => ['encoded', 'completed', 'processing'].includes(u.currentPhase)).length} Processed
              </Badge>
              <Badge variant="outline" className="text-xs bg-gray-50">
                {isLoadingArchive ? '...' : totalArchivedFiles} Archived
              </Badge>
            </div>
          </div>

          {/* Upload Section - Shared across all tabs */}
          <Card>
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Upload className="h-4 w-4 sm:h-5 sm:w-5" />
                File Upload
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Session-controlled upload for TDDF files
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-3 sm:p-6 pt-0 sm:pt-0">
              <div className="space-y-4">
                {/* File Type Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium">File Type:</label>
                  <div className="flex flex-wrap gap-2">
                    {FILE_TYPES.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => {
                          setSelectedFileType(type.value);
                          if (selectedUploadFiles && selectedUploadFiles.length > 0) {
                            setTimeout(() => handleStartUpload(selectedUploadFiles), 100);
                          }
                        }}
                        className={`
                          relative px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all duration-300 transform hover:scale-105
                          ${selectedFileType === type.value 
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }
                        `}
                        title={type.description}
                      >
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          <div className={`
                            w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full transition-all duration-300
                            ${selectedFileType === type.value 
                              ? 'bg-white animate-pulse' 
                              : 'bg-gray-400'
                            }
                          `} />
                          {type.label}
                        </div>
                        
                        {selectedFileType === type.value && (
                          <div className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-20" />
                        )}
                      </button>
                    ))}
                  </div>
                  
                  {selectedFileType && (
                    <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded-md border-l-4 border-blue-500">
                      {FILE_TYPES.find(t => t.value === selectedFileType)?.description}
                    </div>
                  )}
                </div>

                {/* Queue Monitoring Section - NEW */}
                <QueueStatusMonitor />

                {/* File Upload Zone - Enhanced with larger target and stronger contrast */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Files</label>
                  
                  <div className="relative">
                    <div 
                      className={cn(
                        "border-3 border-dashed rounded-xl py-8 px-6 text-center cursor-pointer transition-all duration-300 min-h-[120px] flex items-center justify-center",
                        isDragActive 
                          ? "border-blue-600 bg-blue-100 shadow-lg shadow-blue-200/50 scale-[1.02]" 
                          : "border-blue-300 bg-gradient-to-b from-blue-50/50 to-blue-100/30 hover:border-blue-500 hover:bg-blue-100/60 hover:shadow-md"
                      )}
                      onClick={() => document.getElementById('tddf-file-input')?.click()}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragActive(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragActive(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setIsDragActive(false);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDragActive(false);
                        const files = e.dataTransfer?.files;
                        if (files && files.length > 0) {
                          console.log('[AUTO-UPLOAD-DEBUG] Files dropped:', files.length, 'File type:', selectedFileType);
                          console.log('[AUTO-UPLOAD-DEBUG] Triggering auto-upload for', files.length, 'dropped files');
                          setSelectedUploadFiles(files);
                          if (selectedFileType) {
                            setTimeout(() => handleStartUpload(files), 100);
                          }
                        }
                      }}
                    >
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <div className={cn(
                          "p-3 rounded-full transition-all duration-300",
                          isDragActive ? "bg-blue-200" : "bg-blue-100"
                        )}>
                          <Upload className={cn(
                            "h-8 w-8 transition-all duration-300",
                            isDragActive ? "text-blue-700 scale-110" : "text-blue-500"
                          )} />
                        </div>
                        <div className="text-center sm:text-left">
                          <p className={cn(
                            "font-semibold text-base transition-colors duration-300",
                            isDragActive ? "text-blue-800" : "text-blue-600"
                          )}>
                            {isDragActive ? "Drop files here!" : "File Upload Zone"}
                          </p>
                          <p className="text-sm text-blue-500/80 mt-1">
                            Drag & drop TDDF files here, or click to browse
                          </p>
                        </div>
                        <Button size="default" className={cn(
                          "transition-all duration-300",
                          isDragActive 
                            ? "bg-blue-700 hover:bg-blue-800 scale-105" 
                            : "bg-blue-500 hover:bg-blue-600"
                        )}>
                          <Upload className="h-4 w-4 mr-2" />
                          Browse Files
                        </Button>
                      </div>
                    </div>
                    
                    <input
                      id="tddf-file-input"
                      type="file"
                      multiple
                      onChange={handleUploadFileSelect}
                      className="hidden"
                      accept={selectedFileType === 'tddf' ? '.TSYSO,.tsyso' : selectedFileType === 'mastercard_di' ? '.xlms,.xlsx' : '.csv'}
                    />
                  </div>
                  
                  {selectedUploadFiles && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-md">
                      <div className="flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-medium">
                          {selectedUploadFiles.length} file(s) selected
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {Array.from(selectedUploadFiles).map((file, index) => (
                          <div key={index} className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                            {file.name} ({Math.round(file.size / 1024)}KB)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Auto 4-5 Encode Switch */}
                <div className="space-y-2">
                  <div className="flex items-center gap-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                    <Switch
                      checked={auto45Enabled}
                      onCheckedChange={handleAuto45Change}
                      disabled={saveAuto45Setting.isPending}
                      data-testid="switch-auto-45"
                    />
                    <div className="flex items-center gap-3">
                      <Zap className="h-5 w-5 text-purple-600" />
                      <div>
                        <div className="font-medium text-purple-800">Auto 4-5 Encode</div>
                        <div className="text-sm text-purple-600">
                          Automatic file identification and encoding (Steps 4-5)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Auto 6 Json Encode Switch */}
                <div className="space-y-2">
                  <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <Switch
                      checked={autoStep6Enabled}
                      onCheckedChange={handleAutoStep6Change}
                      disabled={saveAutoStep6Setting.isPending}
                    />
                    <div className="flex items-center gap-3">
                      <Pause className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-medium text-blue-800">Auto 6 Json Encode</div>
                        <div className="text-sm text-blue-600">
                          Enable automatic Step 6 JSON encoding for uploaded files
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Auto 7 Archive Switch */}
                <div className="space-y-2">
                  <div className="flex items-center gap-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <Switch
                      checked={autoStep7Enabled}
                      onCheckedChange={handleAutoStep7Change}
                      disabled={saveAutoStep7Setting.isPending}
                      data-testid="switch-auto-step7"
                    />
                    <div className="flex items-center gap-3">
                      <Database className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="font-medium text-green-800">Auto 7 Archive</div>
                        <div className="text-sm text-green-600">
                          Enable automatic Step 7 archiving for completed files
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Inner Tabs for File Categories */}
          <Tabs value={filesInnerTab} onValueChange={setFilesInnerTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5 mb-4">
              <TabsTrigger value="uploaded" className="flex items-center gap-1 text-xs sm:text-sm">
                <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Uploaded</span>
                <Badge variant="secondary" className="ml-0.5 text-[10px] sm:text-xs">
                  {uploads.filter((u: UploaderUpload) => ['started', 'uploading', 'uploaded', 'identified', 'validating', 'encoding'].includes(u.currentPhase)).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="processed" className="flex items-center gap-1 text-xs sm:text-sm">
                <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Processed</span>
                <Badge variant="secondary" className="ml-0.5 text-[10px] sm:text-xs">
                  {uploads.filter((u: UploaderUpload) => ['encoded', 'completed', 'processing'].includes(u.currentPhase)).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="failed" className="flex items-center gap-1 text-xs sm:text-sm">
                <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500" />
                <span className="hidden sm:inline">Failed</span>
                <Badge variant="destructive" className="ml-0.5 text-[10px] sm:text-xs">
                  {uploads.filter((u: UploaderUpload) => u.currentPhase === 'failed' || u.uploadStatus === 'failed').length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="warning" className="flex items-center gap-1 text-xs sm:text-sm">
                <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500" />
                <span className="hidden sm:inline">Warning</span>
                <Badge variant="outline" className="ml-0.5 text-[10px] sm:text-xs bg-yellow-100 text-yellow-800 border-yellow-300">
                  {uploads.filter((u: UploaderUpload) => u.currentPhase === 'warning' || (u.uploadStatus === 'warning')).length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="archive" className="flex items-center gap-1 text-xs sm:text-sm">
                <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Archive</span>
                <Badge variant="secondary" className="ml-0.5 text-[10px] sm:text-xs">
                  {isLoadingArchive ? '...' : totalArchivedFiles}
                </Badge>
              </TabsTrigger>
            </TabsList>

            {/* UPLOADED TAB - Files in early processing phases */}
            <TabsContent value="uploaded" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Uploading & Processing Files</CardTitle>
                      <CardDescription>
                        Files in phases: started, uploading, uploaded, identified, validating, encoding
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Bulk Action Toolbar */}
                  <BulkActionToolbar
                    selectedCount={selectedUploads.length}
                    totalCount={uploads.filter((u: UploaderUpload) => ['started', 'uploading', 'uploaded', 'identified', 'validating', 'encoding'].includes(u.currentPhase)).length}
                    onSelectAll={() => {
                      const uploadingFiles = uploads.filter((u: UploaderUpload) => ['started', 'uploading', 'uploaded', 'identified', 'validating', 'encoding'].includes(u.currentPhase));
                      setSelectedUploads(uploadingFiles.map((u: UploaderUpload) => u.id));
                    }}
                    onClearSelection={() => setSelectedUploads([])}
                    isAllSelected={selectedUploads.length === uploads.filter((u: UploaderUpload) => ['started', 'uploading', 'uploaded', 'identified', 'validating', 'encoding'].includes(u.currentPhase)).length && selectedUploads.length > 0}
                    actions={[
                      {
                        label: 'Reset Status',
                        icon: <RefreshCw className="h-4 w-4 mr-1" />,
                        onClick: () => {
                          const resettableFiles = selectedUploads.filter(id => {
                            const upload = uploads.find((u: UploaderUpload) => u.id === id);
                            return upload && !['uploaded', 'completed'].includes(upload.currentPhase);
                          });
                          if (resettableFiles.length > 0) {
                            resetStatusMutation.mutate(resettableFiles);
                          }
                        },
                        disabled: resetStatusMutation.isPending,
                        variant: 'outline' as const,
                        className: 'border-orange-600 text-orange-600 hover:bg-orange-50'
                      },
                      {
                        label: 'Delete Selected',
                        icon: <Trash2 className="h-4 w-4 mr-1" />,
                        onClick: handleBulkDelete,
                        disabled: bulkDeleteMutation.isPending,
                        variant: 'destructive' as const
                      }
                    ]}
                  />

                  {/* Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label>Status Filter</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Files</SelectItem>
                          <SelectItem value="started">Started</SelectItem>
                          <SelectItem value="uploading">Uploading</SelectItem>
                          <SelectItem value="uploaded">Uploaded</SelectItem>
                          <SelectItem value="identified">Identified</SelectItem>
                          <SelectItem value="validating">Validating</SelectItem>
                          <SelectItem value="encoding">Encoding</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>File Type</Label>
                      <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="tddf">TDDF</SelectItem>
                          <SelectItem value="ach_merchant">ACH Merchant</SelectItem>
                          <SelectItem value="ach_transactions">ACH Transactions</SelectItem>
                          <SelectItem value="mastercard_di">MasterCard DI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Search Filename</Label>
                      <Input
                        placeholder="Filter by filename..."
                        value={filenameFilter}
                        onChange={(e) => setFilenameFilter(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Sort</Label>
                      <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
                        const [field, order] = value.split('-') as [typeof sortBy, typeof sortOrder];
                        setSortBy(field);
                        setSortOrder(order);
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date-desc">Date (Newest)</SelectItem>
                          <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                          <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                          <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                          <SelectItem value="size-desc">Size (Largest)</SelectItem>
                          <SelectItem value="size-asc">Size (Smallest)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Uploaded Files List - filtered to early phases */}
                  <div className="space-y-2">
                    {uploads
                      .filter((u: UploaderUpload) => ['started', 'uploading', 'uploaded', 'identified', 'validating', 'encoding'].includes(u.currentPhase))
                      .filter((u: UploaderUpload) => statusFilter === 'all' || u.currentPhase === statusFilter)
                      .filter((u: UploaderUpload) => fileTypeFilter === 'all' || u.finalFileType === fileTypeFilter)
                      .filter((u: UploaderUpload) => !filenameFilter || u.filename.toLowerCase().includes(filenameFilter.toLowerCase()))
                      .slice(uploadsCurrentPage * uploadsItemsPerPage, (uploadsCurrentPage + 1) * uploadsItemsPerPage)
                      .map((upload: UploaderUpload) => (
                        <div 
                          key={upload.id} 
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            checked={selectedUploads.includes(upload.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedUploads([...selectedUploads, upload.id]);
                              } else {
                                setSelectedUploads(selectedUploads.filter(id => id !== upload.id));
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate text-sm">{upload.filename}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <span>{formatFileSize(upload.fileSize || 0)}</span>
                              <span>•</span>
                              <span>{upload.finalFileType || 'unknown'}</span>
                              <span>•</span>
                              <span>Started {upload.startTime ? formatDistanceToNow(new Date(upload.startTime), { addSuffix: true }) : 'recently'}</span>
                              <span>•</span>
                              <span>Encoding: <TimingDisplay uploadId={upload.id} /></span>
                            </div>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              upload.currentPhase === 'encoding' && 'bg-yellow-100 text-yellow-800 border-yellow-300',
                              upload.currentPhase === 'uploaded' && 'bg-blue-100 text-blue-800 border-blue-300',
                              upload.currentPhase === 'identified' && 'bg-purple-100 text-purple-800 border-purple-300',
                              upload.currentPhase === 'validating' && 'bg-orange-100 text-orange-800 border-orange-300'
                            )}
                          >
                            {upload.currentPhase}
                          </Badge>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setUploaderFileForView(upload);
                          }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    {uploads.filter((u: UploaderUpload) => ['started', 'uploading', 'uploaded', 'identified', 'validating', 'encoding'].includes(u.currentPhase)).length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        No files currently uploading or processing
                      </div>
                    )}
                  </div>

                  {/* Enhanced Pagination */}
                  <EnhancedPagination
                    currentPage={uploadsCurrentPage}
                    totalItems={uploads.filter((u: UploaderUpload) => ['started', 'uploading', 'uploaded', 'identified', 'validating', 'encoding'].includes(u.currentPhase)).length}
                    itemsPerPage={uploadsItemsPerPage}
                    onPageChange={setUploadsCurrentPage}
                    onPageSizeChange={setUploadsItemsPerPage}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* PROCESSED TAB - Completed/Encoded files ready for archiving */}
            <TabsContent value="processed" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Processed Files</CardTitle>
                      <CardDescription>
                        Files in phases: encoded, processing, completed - ready for Step 6/7
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Bulk Action Toolbar for Processed */}
                  <BulkActionToolbar
                    selectedCount={selectedUploads.filter(id => {
                      const u = uploads.find((upload: UploaderUpload) => upload.id === id);
                      return u && ['encoded', 'completed', 'processing'].includes(u.currentPhase);
                    }).length}
                    totalCount={uploads.filter((u: UploaderUpload) => ['encoded', 'completed', 'processing'].includes(u.currentPhase)).length}
                    onSelectAll={() => {
                      const processedFiles = uploads.filter((u: UploaderUpload) => ['encoded', 'completed', 'processing'].includes(u.currentPhase));
                      setSelectedUploads(processedFiles.map((u: UploaderUpload) => u.id));
                    }}
                    onClearSelection={() => setSelectedUploads([])}
                    isAllSelected={
                      selectedUploads.length > 0 &&
                      selectedUploads.every(id => {
                        const u = uploads.find((upload: UploaderUpload) => upload.id === id);
                        return u && ['encoded', 'completed', 'processing'].includes(u.currentPhase);
                      }) &&
                      selectedUploads.length === uploads.filter((u: UploaderUpload) => ['encoded', 'completed', 'processing'].includes(u.currentPhase)).length
                    }
                    actions={[
                      {
                        label: 'Process Step 6',
                        icon: <Zap className="h-4 w-4 mr-1" />,
                        onClick: () => {
                          const encodedFiles = selectedUploads.filter(id => {
                            const upload = uploads.find((u: UploaderUpload) => u.id === id);
                            return upload && (upload.currentPhase === 'encoded' || upload.currentPhase === 'completed');
                          });
                          if (encodedFiles.length > 0) {
                            step6ProcessingMutation.mutate(encodedFiles);
                          }
                        },
                        disabled: step6ProcessingMutation.isPending,
                        className: 'bg-purple-600 hover:bg-purple-700 text-white'
                      },
                      {
                        label: 'Archive (Step 7)',
                        icon: <Database className="h-4 w-4 mr-1" />,
                        onClick: () => {
                          const completedFiles = selectedUploads.filter(id => {
                            const upload = uploads.find((u: UploaderUpload) => u.id === id);
                            return upload && (upload.currentPhase === 'completed' || upload.currentPhase === 'encoded');
                          });
                          if (completedFiles.length > 0) {
                            archiveMutation.mutate(completedFiles);
                          }
                        },
                        disabled: archiveMutation.isPending,
                        className: 'bg-blue-600 hover:bg-blue-700 text-white'
                      },
                      {
                        label: 'Reset Status',
                        icon: <RefreshCw className="h-4 w-4 mr-1" />,
                        onClick: () => {
                          const resettableFiles = selectedUploads.filter(id => {
                            const upload = uploads.find((u: UploaderUpload) => u.id === id);
                            return upload && ['encoded', 'processing', 'completed'].includes(upload.currentPhase);
                          });
                          if (resettableFiles.length > 0) {
                            resetStatusMutation.mutate(resettableFiles);
                          }
                        },
                        disabled: resetStatusMutation.isPending,
                        variant: 'outline' as const,
                        className: 'border-orange-600 text-orange-600 hover:bg-orange-50'
                      },
                      {
                        label: 'Delete',
                        icon: <Trash2 className="h-4 w-4 mr-1" />,
                        onClick: handleBulkDelete,
                        disabled: bulkDeleteMutation.isPending,
                        variant: 'destructive' as const
                      }
                    ]}
                  />

                  {/* Filters for Processed */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label>Status Filter</Label>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Files</SelectItem>
                          <SelectItem value="encoded">Encoded</SelectItem>
                          <SelectItem value="processing">Processing</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>File Type</Label>
                      <Select value={fileTypeFilter} onValueChange={setFileTypeFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="tddf">TDDF</SelectItem>
                          <SelectItem value="ach_merchant">ACH Merchant</SelectItem>
                          <SelectItem value="ach_transactions">ACH Transactions</SelectItem>
                          <SelectItem value="mastercard_di">MasterCard DI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Search Filename</Label>
                      <Input
                        placeholder="Filter by filename..."
                        value={filenameFilter}
                        onChange={(e) => setFilenameFilter(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Sort</Label>
                      <Select value={`${sortBy}-${sortOrder}`} onValueChange={(value) => {
                        const [field, order] = value.split('-') as [typeof sortBy, typeof sortOrder];
                        setSortBy(field);
                        setSortOrder(order);
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date-desc">Date (Newest)</SelectItem>
                          <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                          <SelectItem value="name-asc">Name (A-Z)</SelectItem>
                          <SelectItem value="name-desc">Name (Z-A)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Processed Files List */}
                  <div className="space-y-2">
                    {uploads
                      .filter((u: UploaderUpload) => ['encoded', 'completed', 'processing'].includes(u.currentPhase))
                      .filter((u: UploaderUpload) => statusFilter === 'all' || u.currentPhase === statusFilter)
                      .filter((u: UploaderUpload) => fileTypeFilter === 'all' || u.finalFileType === fileTypeFilter)
                      .filter((u: UploaderUpload) => !filenameFilter || u.filename.toLowerCase().includes(filenameFilter.toLowerCase()))
                      .slice(processedFilesCurrentPage * processedFilesItemsPerPage, (processedFilesCurrentPage + 1) * processedFilesItemsPerPage)
                      .map((upload: UploaderUpload) => (
                        <div 
                          key={upload.id} 
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox
                            checked={selectedUploads.includes(upload.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedUploads([...selectedUploads, upload.id]);
                              } else {
                                setSelectedUploads(selectedUploads.filter(id => id !== upload.id));
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate text-sm">{upload.filename}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <span>{formatFileSize(upload.fileSize || 0)}</span>
                              <span>•</span>
                              <span>{upload.finalFileType || 'unknown'}</span>
                              <span>•</span>
                              <span>{upload.lineCount?.toLocaleString() || 0} lines</span>
                              {upload.businessDay && (
                                <>
                                  <span>•</span>
                                  <span>{format(new Date(upload.businessDay), 'MMM d, yyyy')}</span>
                                </>
                              )}
                              <span>•</span>
                              <span>Encoding: <TimingDisplay uploadId={upload.id} /></span>
                            </div>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              upload.currentPhase === 'encoded' && 'bg-green-100 text-green-800 border-green-300',
                              upload.currentPhase === 'completed' && 'bg-green-700 text-white border-green-800',
                              upload.currentPhase === 'processing' && 'bg-blue-100 text-blue-800 border-blue-300'
                            )}
                          >
                            {upload.currentPhase}
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleViewUploaderFile(upload)}
                            title="View raw file contents"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {upload.finalFileType === 'tddf' ? (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setLocation(`/tddf-viewer/${upload.id}/${encodeURIComponent(upload.filename)}?unlimited=true`)}
                              title="View JSONB data"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              disabled
                              title="No JSONB data available"
                              className="text-gray-400 cursor-not-allowed"
                            >
                              <EyeOff className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    {uploads.filter((u: UploaderUpload) => ['encoded', 'completed', 'processing'].includes(u.currentPhase)).length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        No processed files available
                      </div>
                    )}
                  </div>

                  {/* Enhanced Pagination for Processed */}
                  <EnhancedPagination
                    currentPage={processedFilesCurrentPage}
                    totalItems={uploads.filter((u: UploaderUpload) => ['encoded', 'completed', 'processing'].includes(u.currentPhase)).length}
                    itemsPerPage={processedFilesItemsPerPage}
                    onPageChange={setProcessedFilesCurrentPage}
                    onPageSizeChange={setProcessedFilesItemsPerPage}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* FAILED TAB - Files that failed processing */}
            <TabsContent value="failed" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        Failed Files
                      </CardTitle>
                      <CardDescription>
                        Files that encountered errors during processing. You can retry or delete them.
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/uploader'] })}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Bulk Action Toolbar for Failed Files */}
                  <BulkActionToolbar
                    selectedCount={selectedFailedUploads.length}
                    totalCount={uploads.filter((u: UploaderUpload) => u.currentPhase === 'failed' || u.uploadStatus === 'failed').length}
                    onSelectAll={() => {
                      const failedFiles = uploads.filter((u: UploaderUpload) => u.currentPhase === 'failed' || u.uploadStatus === 'failed');
                      setSelectedFailedUploads(failedFiles.map((u: UploaderUpload) => u.id));
                    }}
                    onClearSelection={() => setSelectedFailedUploads([])}
                    isAllSelected={
                      selectedFailedUploads.length > 0 &&
                      selectedFailedUploads.length === uploads.filter((u: UploaderUpload) => u.currentPhase === 'failed' || u.uploadStatus === 'failed').length
                    }
                    actions={[
                      {
                        label: 'Retry Selected',
                        icon: <RotateCcw className="h-4 w-4 mr-1" />,
                        onClick: () => {
                          if (selectedFailedUploads.length > 0) {
                            resetStatusMutation.mutate(selectedFailedUploads);
                            setSelectedFailedUploads([]);
                          }
                        },
                        disabled: resetStatusMutation.isPending || selectedFailedUploads.length === 0,
                        variant: 'outline' as const,
                        className: 'border-blue-600 text-blue-600 hover:bg-blue-50'
                      },
                      {
                        label: 'Delete Selected',
                        icon: <Trash2 className="h-4 w-4 mr-1" />,
                        onClick: () => {
                          if (selectedFailedUploads.length > 0) {
                            bulkDeleteMutation.mutate(selectedFailedUploads);
                            setSelectedFailedUploads([]);
                          }
                        },
                        disabled: bulkDeleteMutation.isPending || selectedFailedUploads.length === 0,
                        variant: 'destructive' as const
                      }
                    ]}
                  />

                  {/* Failed Files List */}
                  <div className="space-y-2">
                    {uploads
                      .filter((u: UploaderUpload) => u.currentPhase === 'failed' || u.uploadStatus === 'failed')
                      .slice(failedFilesCurrentPage * failedFilesItemsPerPage, (failedFilesCurrentPage + 1) * failedFilesItemsPerPage)
                      .map((upload: UploaderUpload) => (
                        <div 
                          key={upload.id} 
                          className="flex items-center gap-3 p-3 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <Checkbox
                            checked={selectedFailedUploads.includes(upload.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedFailedUploads([...selectedFailedUploads, upload.id]);
                              } else {
                                setSelectedFailedUploads(selectedFailedUploads.filter(id => id !== upload.id));
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate text-sm">{upload.filename}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Clock className="h-3 w-3" />
                              <span>{upload.startTime ? formatDistanceToNow(new Date(upload.startTime), { addSuffix: true }) : 'recently'}</span>
                              <span>•</span>
                              <span>{formatFileSize(upload.fileSize || 0)}</span>
                              <span>•</span>
                              <span>{upload.finalFileType || 'unknown'}</span>
                            </div>
                            {upload.statusMessage && (
                              <div className="text-xs text-red-600 mt-1 truncate max-w-md">
                                Error: {upload.statusMessage}
                              </div>
                            )}
                          </div>
                          <Badge variant="destructive">
                            Failed
                          </Badge>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => resetStatusMutation.mutate([upload.id])}
                              disabled={resetStatusMutation.isPending}
                              title="Retry processing"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setUploaderFileForView(upload)}
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => bulkDeleteMutation.mutate([upload.id])}
                              disabled={bulkDeleteMutation.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-100"
                              title="Delete file"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    {uploads.filter((u: UploaderUpload) => u.currentPhase === 'failed' || u.uploadStatus === 'failed').length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                        <p className="font-medium">No Failed Files</p>
                        <p className="text-sm">All files have been processed successfully.</p>
                      </div>
                    )}
                  </div>

                  {/* Pagination for Failed Files */}
                  {uploads.filter((u: UploaderUpload) => u.currentPhase === 'failed' || u.uploadStatus === 'failed').length > 0 && (
                    <EnhancedPagination
                      currentPage={failedFilesCurrentPage}
                      totalItems={uploads.filter((u: UploaderUpload) => u.currentPhase === 'failed' || u.uploadStatus === 'failed').length}
                      itemsPerPage={failedFilesItemsPerPage}
                      onPageChange={setFailedFilesCurrentPage}
                      onPageSizeChange={setFailedFilesItemsPerPage}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* WARNING TAB - Files with warnings */}
            <TabsContent value="warning" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                        Warning Files
                      </CardTitle>
                      <CardDescription>
                        Files that encountered warnings during processing. You can reset the warning status or delete them.
                      </CardDescription>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/uploader'] })}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Bulk Action Toolbar for Warning Files */}
                  <BulkActionToolbar
                    selectedCount={selectedWarningUploads.length}
                    totalCount={uploads.filter((u: UploaderUpload) => u.currentPhase === 'warning' || u.uploadStatus === 'warning').length}
                    onSelectAll={() => {
                      const warningFiles = uploads.filter((u: UploaderUpload) => u.currentPhase === 'warning' || u.uploadStatus === 'warning');
                      setSelectedWarningUploads(warningFiles.map((u: UploaderUpload) => u.id));
                    }}
                    onClearSelection={() => setSelectedWarningUploads([])}
                    isAllSelected={
                      selectedWarningUploads.length > 0 &&
                      selectedWarningUploads.length === uploads.filter((u: UploaderUpload) => u.currentPhase === 'warning' || u.uploadStatus === 'warning').length
                    }
                    actions={[
                      {
                        label: 'Reset Warnings',
                        icon: <RefreshCw className="h-4 w-4 mr-1" />,
                        onClick: () => {
                          if (selectedWarningUploads.length > 0) {
                            resetStatusMutation.mutate(selectedWarningUploads);
                            setSelectedWarningUploads([]);
                          }
                        },
                        disabled: resetStatusMutation.isPending || selectedWarningUploads.length === 0,
                        variant: 'outline' as const,
                        className: 'border-yellow-600 text-yellow-600 hover:bg-yellow-50'
                      },
                      {
                        label: 'Delete Selected',
                        icon: <Trash2 className="h-4 w-4 mr-1" />,
                        onClick: () => {
                          if (selectedWarningUploads.length > 0) {
                            bulkDeleteMutation.mutate(selectedWarningUploads);
                            setSelectedWarningUploads([]);
                          }
                        },
                        disabled: bulkDeleteMutation.isPending || selectedWarningUploads.length === 0,
                        variant: 'destructive' as const
                      }
                    ]}
                  />

                  {/* Warning Files List */}
                  <div className="space-y-2">
                    {uploads
                      .filter((u: UploaderUpload) => u.currentPhase === 'warning' || u.uploadStatus === 'warning')
                      .slice(warningFilesCurrentPage * warningFilesItemsPerPage, (warningFilesCurrentPage + 1) * warningFilesItemsPerPage)
                      .map((upload: UploaderUpload) => (
                        <div 
                          key={upload.id} 
                          className="flex items-center gap-3 p-3 border border-yellow-200 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
                        >
                          <Checkbox
                            checked={selectedWarningUploads.includes(upload.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedWarningUploads([...selectedWarningUploads, upload.id]);
                              } else {
                                setSelectedWarningUploads(selectedWarningUploads.filter(id => id !== upload.id));
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate text-sm">{upload.filename}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <Clock className="h-3 w-3" />
                              <span>{upload.startTime ? formatDistanceToNow(new Date(upload.startTime), { addSuffix: true }) : 'recently'}</span>
                              <span>•</span>
                              <span>{formatFileSize(upload.fileSize || 0)}</span>
                              <span>•</span>
                              <span>{upload.finalFileType || 'unknown'}</span>
                            </div>
                          </div>
                          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
                            Warning
                          </Badge>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => {
                                setSelectedWarningUpload({ id: upload.id, filename: upload.filename });
                                setWarningDialogOpen(true);
                              }}
                              title="View warning details"
                              className="border-yellow-600 text-yellow-700 hover:bg-yellow-100"
                            >
                              <AlertTriangle className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => resetStatusMutation.mutate([upload.id])}
                              disabled={resetStatusMutation.isPending}
                              title="Reset warning status"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => setUploaderFileForView(upload)}
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => bulkDeleteMutation.mutate([upload.id])}
                              disabled={bulkDeleteMutation.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-100"
                              title="Delete file"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    {uploads.filter((u: UploaderUpload) => u.currentPhase === 'warning' || u.uploadStatus === 'warning').length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                        <p className="font-medium">No Warning Files</p>
                        <p className="text-sm">All files processed without warnings.</p>
                      </div>
                    )}
                  </div>

                  {/* Pagination for Warning Files */}
                  {uploads.filter((u: UploaderUpload) => u.currentPhase === 'warning' || u.uploadStatus === 'warning').length > 0 && (
                    <EnhancedPagination
                      currentPage={warningFilesCurrentPage}
                      totalItems={uploads.filter((u: UploaderUpload) => u.currentPhase === 'warning' || u.uploadStatus === 'warning').length}
                      itemsPerPage={warningFilesItemsPerPage}
                      onPageChange={setWarningFilesCurrentPage}
                      onPageSizeChange={setWarningFilesItemsPerPage}
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ARCHIVE TAB - Archived files with restore functionality */}
            <TabsContent value="archive" className="space-y-4">
              {/* Activity Heatmap Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Archive Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <ActivityHeatmap dataType="archived" />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>
                        Archived Files ({isLoadingArchive ? '...' : totalArchivedFiles})
                      </CardTitle>
                      <CardDescription>
                        Archived completed files - data remains in master table. Use Restore to return files to active processing.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => recalculateBusinessDatesMutation.mutate()}
                        disabled={recalculateBusinessDatesMutation.isPending}
                        title="Recalculate business dates from filenames for all files"
                      >
                        <CalendarIcon className="h-4 w-4 mr-1" />
                        {recalculateBusinessDatesMutation.isPending ? 'Recalculating...' : 'Recalc Dates'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          refetchArchive();
                          toast({ title: "Archive data refreshed" });
                        }}
                        disabled={isLoadingArchive}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Bulk Action Toolbar for Archive */}
                  <BulkActionToolbar
                    selectedCount={selectedArchiveFiles.length}
                    totalCount={totalArchivedFiles}
                    onSelectAll={() => setSelectedArchiveFiles(archivedFiles.map((f: any) => f.id))}
                    onClearSelection={() => setSelectedArchiveFiles([])}
                    isAllSelected={selectedArchiveFiles.length === archivedFiles.length && archivedFiles.length > 0}
                    actions={[
                      {
                        label: 'Restore Selected',
                        icon: <RotateCcw className="h-4 w-4 mr-1" />,
                        onClick: () => restoreArchivedMutation.mutate(selectedArchiveFiles.map(String)),
                        disabled: restoreArchivedMutation.isPending,
                        className: 'bg-blue-600 hover:bg-blue-700 text-white'
                      }
                    ]}
                  />

                  {/* Archive Filters - Card-based Layout */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <Label>File Type</Label>
                      <Select 
                        value={archiveFilters.archiveStatus} 
                        onValueChange={(value) => setArchiveFilters(prev => ({ ...prev, archiveStatus: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="tddf">TDDF</SelectItem>
                          <SelectItem value="transaction_csv">ACH Transactions</SelectItem>
                          <SelectItem value="ach_merchant">ACH Merchant</SelectItem>
                          <SelectItem value="mastercard_di">MasterCard DI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Business Day From</Label>
                      <input
                        type="date"
                        value={archiveFilters.businessDayFrom}
                        onChange={(e) => setArchiveFilters(prev => ({ ...prev, businessDayFrom: e.target.value }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <Label>Business Day To</Label>
                      <input
                        type="date"
                        value={archiveFilters.businessDayTo}
                        onChange={(e) => setArchiveFilters(prev => ({ ...prev, businessDayTo: e.target.value }))}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
                    <div>
                      <Label>Sort</Label>
                      <Select value={`${archiveSortBy}-${archiveSortOrder}`} onValueChange={(value) => {
                        const parts = value.split('-');
                        const field = parts.slice(0, -1).join('-');
                        const order = parts[parts.length - 1] as 'asc' | 'desc';
                        setArchiveSortBy(field);
                        setArchiveSortOrder(order);
                      }}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="archived_at-desc">Archived (Newest)</SelectItem>
                          <SelectItem value="archived_at-asc">Archived (Oldest)</SelectItem>
                          <SelectItem value="business_day-desc">Business Day (Newest)</SelectItem>
                          <SelectItem value="business_day-asc">Business Day (Oldest)</SelectItem>
                          <SelectItem value="original_filename-asc">Name (A-Z)</SelectItem>
                          <SelectItem value="original_filename-desc">Name (Z-A)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setArchiveFilters({
                          archiveStatus: 'all',
                          step6Status: 'all',
                          businessDayFrom: '',
                          businessDayTo: ''
                        });
                        toast({ title: "Archive filters cleared" });
                      }}
                    >
                      Clear Filters
                    </Button>
                  </div>

                  {/* Archive Files List - Card Layout */}
                  <div className="space-y-2">
                    {isLoadingArchive ? (
                      <div className="text-center py-8">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        <span className="ml-2">Loading archive data...</span>
                      </div>
                    ) : archivedFiles.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        No archived files found. Use Step 7 Archive to archive completed files.
                      </div>
                    ) : (
                      archivedFiles
                        .filter((file: any) => archiveFilters.archiveStatus === 'all' || file.final_file_type === archiveFilters.archiveStatus)
                        .map((file: any) => (
                        <div 
                          key={file.id} 
                          className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <Checkbox 
                            checked={selectedArchiveFiles.includes(file.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedArchiveFiles([...selectedArchiveFiles, file.id]);
                              } else {
                                setSelectedArchiveFiles(selectedArchiveFiles.filter(id => id !== file.id));
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate text-sm">{file.original_filename}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              <span>{file.file_size_mb ? `${file.file_size_mb} MB` : 'Size unknown'}</span>
                              <span>•</span>
                              <span>{file.final_file_type || 'unknown'}</span>
                              <span>•</span>
                              <span>{file.line_count?.toLocaleString() || 0} lines</span>
                              {file.business_day && (
                                <>
                                  <span>•</span>
                                  <span>{format(new Date(file.business_day), 'MMM d, yyyy')}</span>
                                </>
                              )}
                              <span>•</span>
                              <span>Archived: {file.archived_at ? format(new Date(file.archived_at), 'MMM d, yyyy') : '-'}</span>
                            </div>
                          </div>
                          <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300">
                            Archived
                          </Badge>
                          {/* View raw file */}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleViewArchiveFile(file)}
                            title="View raw file contents"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {/* View JSONB data (TDDF only) */}
                          {file.final_file_type === 'tddf' ? (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setLocation(`/tddf-viewer/${file.id}/${encodeURIComponent(file.original_filename)}?unlimited=true`)}
                              title="View JSONB data"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              disabled
                              title="No JSONB data available"
                              className="text-gray-400 cursor-not-allowed"
                            >
                              <EyeOff className="h-4 w-4" />
                            </Button>
                          )}
                          {/* Restore button */}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => restoreArchivedMutation.mutate([String(file.id)])}
                            title="Restore to active processing"
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            disabled={restoreArchivedMutation.isPending}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Enhanced Pagination for Archive */}
                  <EnhancedPagination
                    currentPage={archivePage}
                    totalItems={totalArchivedFiles}
                    itemsPerPage={archiveItemsPerPage}
                    onPageChange={setArchivePage}
                    onPageSizeChange={setArchiveItemsPerPage}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="data" className="space-y-4">
          {/* Daily View - Based on TDDF1 Template */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">TDDF Daily View</h2>
              <p className="text-muted-foreground">Day-by-day analysis of TDDF transaction data from the datamaster system</p>
            </div>
            <Button 
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/daily"], exact: false });
                toast({ title: "Daily data refreshed" });
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Daily Data
            </Button>
          </div>
          
          <TddfApiDailyView />
        </TabsContent>

        <TabsContent value="raw-data" className="space-y-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">MCC - TDDF Raw Data</h2>
              <p className="text-muted-foreground">View all TDDF records with pagination and filtering</p>
            </div>
            <Button 
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/all-records"], exact: false });
                toast({ title: "Raw data refreshed" });
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Data
            </Button>
          </div>
          
          <RawDataTab 
            globalFilenameFilter={globalFilenameFilter}
            setGlobalFilenameFilter={setGlobalFilenameFilter}
            getMerchantName={getMerchantName}
          />
        </TabsContent>

        <TabsContent value="processing" className="space-y-4">
          <h2 className="text-2xl font-bold">Processing Queue</h2>
          
          <Tabs defaultValue="step45" className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md">
              <TabsTrigger value="step45" className="text-sm">4-5 Processing</TabsTrigger>
              <TabsTrigger value="step6" className="text-sm">Step 6 Processing</TabsTrigger>
            </TabsList>

            <TabsContent value="step45" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Zap className="h-5 w-5 text-purple-600" />
                        Steps 4-5: Identification & Encoding
                      </CardTitle>
                      <CardDescription>
                        Files being identified and encoded before Step 6 processing
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/uploader'] });
                        toast({ title: "Processing status refreshed" });
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {filesLoading ? (
                    <div className="flex items-center justify-center p-8">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Loading files...
                    </div>
                  ) : (() => {
                    const step45Files = allFiles.filter((f: TddfApiFile) => 
                      ['uploaded', 'identified', 'validating', 'encoding'].includes(f.current_phase || '')
                    );
                    
                    if (step45Files.length === 0) {
                      return (
                        <div className="text-center p-8 text-muted-foreground">
                          <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                          <p className="text-lg font-medium">No files in Steps 4-5</p>
                          <p className="text-sm">All files have been identified and encoded</p>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-3">
                        <div className="text-sm text-muted-foreground mb-4">
                          {step45Files.length} file{step45Files.length !== 1 ? 's' : ''} in identification/encoding pipeline
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>File</TableHead>
                              <TableHead>Phase</TableHead>
                              <TableHead>File Type</TableHead>
                              <TableHead>Upload Time</TableHead>
                              <TableHead>Duration</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {step45Files.map((file: TddfApiFile) => {
                              const uploadTime = file.uploaded_at ? new Date(file.uploaded_at) : null;
                              const duration = uploadTime ? formatDistanceToNow(uploadTime, { addSuffix: false }) : '-';
                              
                              return (
                                <TableRow key={file.id}>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {file.current_phase === 'encoding' && (
                                        <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                                      )}
                                      <span className="font-mono text-sm truncate max-w-[300px]" title={file.filename}>
                                        {file.filename}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={cn(
                                      file.current_phase === 'uploaded' && 'bg-gray-100 text-gray-700',
                                      file.current_phase === 'identified' && 'bg-blue-100 text-blue-700',
                                      file.current_phase === 'validating' && 'bg-yellow-100 text-yellow-700',
                                      file.current_phase === 'encoding' && 'bg-purple-100 text-purple-700'
                                    )}>
                                      {file.current_phase}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline">
                                      {(file as any).finalFileType || (file as any).file_type || file.fileType || 'unknown'}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {uploadTime ? format(uploadTime, "MMM d, HH:mm:ss") : '-'}
                                  </TableCell>
                                  <TableCell className="text-sm">
                                    <span className="text-orange-600">{duration}</span>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="step6" className="space-y-4 mt-4">
              <EnhancedProcessingQueue refetchInterval={5000} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">API Key Management</h2>
            <Dialog open={isCreateKeyDialogOpen} onOpenChange={setIsCreateKeyDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Key className="mr-2 h-4 w-4" />
                  Create API Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create API Key</DialogTitle>
                  <DialogDescription>
                    Generate a new API key for external access
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="key-name">Key Name</Label>
                    <Input
                      id="key-name"
                      value={newApiKey.keyName}
                      onChange={(e) => setNewApiKey(prev => ({ ...prev, keyName: e.target.value }))}
                      placeholder="Production API Key"
                    />
                  </div>
                  <div>
                    <Label htmlFor="rate-limit">Rate Limit (requests/minute)</Label>
                    <Input
                      id="rate-limit"
                      type="number"
                      value={newApiKey.rateLimitPerMinute}
                      onChange={(e) => setNewApiKey(prev => ({ ...prev, rateLimitPerMinute: parseInt(e.target.value) }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="expires-at">Expires At (optional)</Label>
                    <Input
                      id="expires-at"
                      type="datetime-local"
                      value={newApiKey.expiresAt}
                      onChange={(e) => setNewApiKey(prev => ({ ...prev, expiresAt: e.target.value }))}
                    />
                  </div>
                  <Button 
                    onClick={handleCreateApiKey}
                    disabled={!newApiKey.keyName || createApiKeyMutation.isPending}
                    className="w-full"
                  >
                    {createApiKeyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create API Key
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-4">
            <div className="flex items-start gap-3">
              <Lightbulb className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  Important: Save Your API Key
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                  Full API keys are only shown once when created. After creation, only the key prefix is visible for security. 
                  If you lose your key, you'll need to delete it and create a new one.
                </p>
              </div>
            </div>
          </div>

          {createdApiKey && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-800">API Key Created</CardTitle>
                <CardDescription className="text-green-600">
                  Save this key securely - it won't be shown again
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center space-x-2">
                  <Input 
                    value={createdApiKey} 
                    readOnly 
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => copyToClipboard(createdApiKey)}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Key Prefix</TableHead>
                    <TableHead>Permissions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Rate Limit</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Last IP</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keysLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    apiKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell className="font-medium">{key.keyName}</TableCell>
                        <TableCell className="font-mono">{key.keyPrefix}...</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {key.permissions.map((perm) => (
                              <Badge key={perm} variant="outline" className="text-xs">
                                {perm}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={key.isActive ? "default" : "secondary"}>
                            {key.isActive ? "Active" : "Disabled"}
                          </Badge>
                        </TableCell>
                        <TableCell>{key.requestCount.toLocaleString()}</TableCell>
                        <TableCell>{key.rateLimitPerMinute}/min</TableCell>
                        <TableCell>
                          {key.lastUsed ? format(new Date(key.lastUsed), "MMM d, yyyy 'at' h:mm a") : "Never"}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {(key as any).lastUsedIp || "—"}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteApiKey(key.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete API key"
                            data-testid={`button-delete-key-${key.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Delete API Key Confirmation Dialog */}
          <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete API Key</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this API key? This action cannot be undone and will immediately revoke access for any applications using this key.
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setIsDeleteDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  onClick={confirmDeleteApiKey}
                  disabled={deleteApiKeyMutation.isPending}
                >
                  {deleteApiKeyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">API Monitoring</h2>
            <Button 
              variant="outline" 
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/monitoring/last-connection"] });
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/monitoring"] });
                toast({ title: "Monitoring data refreshed" });
              }}
              disabled={monitoringLoading || monitoringFetching}
              data-testid="button-refresh-monitoring"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", monitoringFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
          
          {/* Last API Connection Card */}
          {lastConnection?.hasConnection && (
            <Card className="border-blue-500/50 bg-blue-50/30 dark:bg-blue-950/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  Last API Connection
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Key Name</p>
                    <p className="font-medium">{lastConnection.keyName}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-xs text-muted-foreground">Timestamp</p>
                    <p className="text-sm font-medium">
                      {lastConnection.lastUsed ? format(new Date(lastConnection.lastUsed), "MMM d, yyyy 'at' h:mm a") : "Never"}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">IP Address</p>
                    <p className="font-mono text-sm">{lastConnection.lastUsedIp}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Total Requests</p>
                    <p className="text-sm font-medium">{lastConnection.requestCount.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.total_requests || 0}
                </div>
                <p className="text-xs text-muted-foreground">Last 24 hours</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Response Time</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.avg_response_time ? `${Math.round(monitoring.stats.avg_response_time)}ms` : "0ms"}
                </div>
                <p className="text-xs text-muted-foreground">Average latency</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Error Rate</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.error_count || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {monitoring?.stats?.total_requests > 0 
                    ? `${((monitoring.stats.error_count / monitoring.stats.total_requests) * 100).toFixed(1)}%` 
                    : "0%"} error rate
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Keys</CardTitle>
                <Key className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {monitoring?.stats?.unique_api_keys || 0}
                </div>
                <p className="text-xs text-muted-foreground">Unique API keys used</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Top Endpoints</CardTitle>
              <CardDescription>Most frequently accessed API endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Request Count</TableHead>
                    <TableHead>Avg Response Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monitoring?.topEndpoints?.map((endpoint: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{endpoint.endpoint}</TableCell>
                      <TableCell>{endpoint.request_count}</TableCell>
                      <TableCell>{Math.round(endpoint.avg_response_time)}ms</TableCell>
                    </TableRow>
                  )) || (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Host List Section */}
          <Card>
            <CardHeader>
              <CardTitle>Host List</CardTitle>
              <CardDescription>All unique IPs that have connected to the API</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Total Requests</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Endpoints</TableHead>
                    <TableHead>Authenticated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hostsIsError ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-yellow-800">Connection Log Table Missing</p>
                            <p className="text-sm text-yellow-700 mt-1">
                              {(hostsError as any)?.message || 'Unable to load connection host data. Required database tables may not exist.'}
                            </p>
                            <p className="text-xs text-yellow-600 mt-2">
                              Fix: Run <code className="bg-yellow-100 px-1 py-0.5 rounded">npm run db:push</code> to create missing tables
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : connectionHosts?.map((host: any, index: number) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono">{host.client_ip}</TableCell>
                      <TableCell>{host.total_requests}</TableCell>
                      <TableCell>{host.last_seen ? format(new Date(host.last_seen), "MMM d, h:mm a") : "Never"}</TableCell>
                      <TableCell>{host.unique_endpoints} unique</TableCell>
                      <TableCell>
                        {host.has_authenticated ? (
                          <Badge variant="default">Yes</Badge>
                        ) : (
                          <Badge variant="outline">No</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  )) || (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No connection data available
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Connection Log Section */}
          <Card>
            <CardHeader>
              <CardTitle>Connection Log</CardTitle>
              <CardDescription>Recent API requests (last 100)</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response Time</TableHead>
                      <TableHead>Authenticated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {connectionLogIsError ? (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <p className="font-medium text-yellow-800">Connection Log Table Missing</p>
                              <p className="text-sm text-yellow-700 mt-1">
                                {(connectionLogError as any)?.message || 'Unable to load connection log data. Required database tables may not exist.'}
                              </p>
                              <p className="text-xs text-yellow-600 mt-2">
                                Fix: Run <code className="bg-yellow-100 px-1 py-0.5 rounded">npm run db:push</code> to create missing tables
                              </p>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : connectionLog?.map((log: any, index: number) => (
                      <TableRow key={index}>
                        <TableCell className="text-xs">{format(new Date(log.timestamp), "MMM d, h:mm:ss a")}</TableCell>
                        <TableCell className="font-mono text-xs">{log.client_ip}</TableCell>
                        <TableCell className="font-mono text-xs">{log.endpoint}</TableCell>
                        <TableCell>
                          <Badge variant={log.method === 'GET' ? 'outline' : 'secondary'}>
                            {log.method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.status_code >= 200 && log.status_code < 300 ? 'default' : 'destructive'}>
                            {log.status_code}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{log.response_time}ms</TableCell>
                        <TableCell>
                          {log.authenticated ? (
                            <Badge variant="default" className="text-xs">Yes</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">No</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )) || (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No connection logs available
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Host Approvals Section */}
          <Card>
            <CardHeader>
              <CardTitle>Host Approvals</CardTitle>
              <CardDescription>Approve or deny hostname + API key combinations for uploads</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hostname</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead>IP Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hostApprovalsIsError ? (
                    <TableRow>
                      <TableCell colSpan={7}>
                        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-yellow-800">Host Approvals Table Missing</p>
                            <p className="text-sm text-yellow-700 mt-1">
                              {(hostApprovalsError as any)?.message || 'Unable to load host approvals data. Required database tables may not exist.'}
                            </p>
                            <p className="text-xs text-yellow-600 mt-2">
                              Fix: Run <code className="bg-yellow-100 px-1 py-0.5 rounded">npm run db:push</code> to create missing tables
                            </p>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : hostApprovals?.map((approval: any) => (
                    <TableRow key={approval.id}>
                      <TableCell className="font-mono font-semibold">{approval.hostname}</TableCell>
                      <TableCell className="text-sm">
                        {approval.api_key_name || 'Unknown'}
                        <span className="text-xs text-muted-foreground ml-2">
                          ({approval.api_key_prefix}...)
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {approval.last_seen_ip || approval.ip_address || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {approval.status === 'approved' && (
                          <Badge variant="default" className="bg-green-600">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                        )}
                        {approval.status === 'pending' && (
                          <Badge variant="secondary">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                        {approval.status === 'denied' && (
                          <Badge variant="destructive">
                            <X className="h-3 w-3 mr-1" />
                            Denied
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(approval.requested_at), "MMM d, h:mm a")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {approval.last_seen_at 
                          ? format(new Date(approval.last_seen_at), "MMM d, h:mm a")
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {approval.status !== 'approved' && (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 px-2 bg-green-600 hover:bg-green-700"
                              onClick={() => updateHostApprovalMutation.mutate({ 
                                id: approval.id, 
                                status: 'approved',
                                notes: `Approved by admin`
                              })}
                              disabled={updateHostApprovalMutation.isPending}
                              data-testid={`button-approve-${approval.id}`}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                          )}
                          {approval.status !== 'denied' && (
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 px-2"
                              onClick={() => updateHostApprovalMutation.mutate({ 
                                id: approval.id, 
                                status: 'denied',
                                notes: `Denied by admin`
                              })}
                              disabled={updateHostApprovalMutation.isPending}
                              data-testid={`button-deny-${approval.id}`}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Deny
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )) || (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No host approval requests
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* File Viewer Dialog */}
      <Dialog open={viewFileDialog} onOpenChange={setViewFileDialog}>
        <DialogContent className="max-w-6xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Raw File Contents</DialogTitle>
            <DialogDescription>
              {selectedFileForView?.filename} - {selectedFileForView ? formatFileSize(selectedFileForView.file_size) : ''}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] w-full">
            <pre className="text-xs font-mono whitespace-pre-wrap p-4 bg-muted rounded-md">
              {fileContent}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Archive File Viewer Dialog */}
      <Dialog open={!!viewingArchiveFile} onOpenChange={() => setViewingArchiveFile(null)}>
        <DialogContent className="max-w-[95vw] max-h-[85vh]" data-testid="dialog-archive-viewer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Archive File Contents
            </DialogTitle>
            <DialogDescription>
              {viewingArchiveFile?.original_filename} - {viewingArchiveFile ? `${(viewingArchiveFile.file_size / 1024).toFixed(1)} KB` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[65vh] w-full border rounded-md">
            {loadingArchiveContent ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading file content...
              </div>
            ) : (
              <div className="relative bg-muted">
                <pre className="text-xs font-mono whitespace-nowrap p-0 m-0 min-w-max">
                  {(() => {
                    // Normalize line endings for proper TDDF record display
                    const normalizedContent = archiveFileContent
                      .replaceAll('\r\n', '\n')
                      .replaceAll('\r', '\n');
                    const lines = normalizedContent.split('\n').filter((line, index, arr) => 
                      // Keep all lines except empty trailing ones
                      index < arr.length - 1 || line.trim() !== ''
                    );
                    return lines.map((line, index) => (
                      <div key={index} className="flex hover:bg-muted-foreground/10">
                        <div className="sticky left-0 bg-muted border-r px-3 py-0.5 text-muted-foreground min-w-[4rem] text-right select-none">
                          {index + 1}
                        </div>
                        <div className="px-3 py-0.5 min-w-0">{line || '\u00A0'}</div>
                      </div>
                    ));
                  })()}
                </pre>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Status: {viewingArchiveFile?.step6_status} | 
              TDDF Records: {viewingArchiveFile?.total_records || 0} total, {viewingArchiveFile?.processed_records || 0} processed |
              File Lines: {(() => {
                if (!archiveFileContent) return 0;
                const normalizedContent = archiveFileContent
                  .replaceAll('\r\n', '\n')
                  .replaceAll('\r', '\n');
                return normalizedContent.split('\n').filter((line, index, arr) => 
                  index < arr.length - 1 || line.trim() !== ''
                ).length;
              })()}
            </div>
            <Button variant="outline" onClick={() => setViewingArchiveFile(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Uploader File Viewer Dialog */}
      <Dialog open={!!uploaderFileForView} onOpenChange={() => setUploaderFileForView(null)}>
        <DialogContent className="max-w-[95vw] max-h-[85vh]" data-testid="dialog-uploader-viewer">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Uploader File Contents
            </DialogTitle>
            <DialogDescription>
              {uploaderFileForView?.filename} - {uploaderFileForView ? formatFileSize(uploaderFileForView.fileSize || 0) : ''}
              {uploaderFileForView && ` | Phase: ${uploaderFileForView.currentPhase}`}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto max-h-[65vh] w-full border rounded-md">
            {loadingUploaderContent ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading file content...
              </div>
            ) : (
              <div className="relative bg-muted">
                <pre className="text-xs font-mono whitespace-nowrap p-0 m-0 min-w-max">
                  {(() => {
                    // Normalize line endings for proper display
                    const normalizedContent = uploaderFileContent
                      .replaceAll('\r\n', '\n')
                      .replaceAll('\r', '\n');
                    const lines = normalizedContent.split('\n').filter((line, index, arr) => 
                      // Keep all lines except empty trailing ones
                      index < arr.length - 1 || line.trim() !== ''
                    );
                    return lines.map((line, index) => (
                      <div key={index} className="flex hover:bg-muted-foreground/10">
                        <div className="sticky left-0 bg-muted border-r px-3 py-0.5 text-muted-foreground min-w-[4rem] text-right select-none">
                          {index + 1}
                        </div>
                        <div className="px-3 py-0.5 min-w-0">{line || '\u00A0'}</div>
                      </div>
                    ));
                  })()}
                </pre>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Phase: {uploaderFileForView?.currentPhase} | 
              File Type: {uploaderFileForView?.fileFormat || 'Unknown'} |
              File Lines: {(() => {
                if (!uploaderFileContent) return 0;
                const normalizedContent = uploaderFileContent
                  .replaceAll('\r\n', '\n')
                  .replaceAll('\r', '\n');
                return normalizedContent.split('\n').filter((line, index, arr) => 
                  index < arr.length - 1 || line.trim() !== ''
                ).length;
              })()}
            </div>
            <Button variant="outline" onClick={() => setUploaderFileForView(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Error Details Dialog */}
      <Dialog open={errorDetailsDialog} onOpenChange={setErrorDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Processing Error Details
            </DialogTitle>
            <DialogDescription>
              {selectedErrorUpload?.filename} - Error occurred during processing
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* File Information */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <Label className="text-sm font-medium">File Name</Label>
                <p className="text-sm">{selectedErrorUpload?.filename}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">File Type</Label>
                <p className="text-sm">{selectedErrorUpload?.finalFileType || selectedErrorUpload?.detectedFileType || 'Unknown'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">File Size</Label>
                <p className="text-sm">{selectedErrorUpload?.fileSize ? formatFileSize(selectedErrorUpload.fileSize) : 'Unknown'}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Upload Date</Label>
                <p className="text-sm">
                  {selectedErrorUpload?.uploadedAt ? new Date(selectedErrorUpload.uploadedAt).toLocaleString('en-US', { 
                    month: 'numeric', 
                    day: 'numeric', 
                    year: 'numeric', 
                    hour: 'numeric', 
                    minute: '2-digit', 
                    hour12: true,
                    timeZone: 'America/Chicago'
                  }) : 'Unknown'}
                </p>
              </div>
            </div>

            {/* Error Details */}
            <div>
              <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Error Information
              </Label>
              <ScrollArea className="max-h-[40vh] w-full">
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
                  {selectedErrorUpload?.processingErrors ? (
                    <pre className="text-xs font-mono whitespace-pre-wrap text-red-800 dark:text-red-200">
                      {typeof selectedErrorUpload.processingErrors === 'string' 
                        ? selectedErrorUpload.processingErrors
                        : JSON.stringify(selectedErrorUpload.processingErrors, null, 2)
                      }
                    </pre>
                  ) : (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      No detailed error information available
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Processing Notes (if available) */}
            {selectedErrorUpload?.processingNotes && (
              <div>
                <Label className="text-sm font-medium mb-2">Processing Notes</Label>
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    {selectedErrorUpload.processingNotes}
                  </p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setErrorDetailsDialog(false)}
              >
                Close
              </Button>
              <Button
                variant="default"
                onClick={() => {
                  if (!selectedErrorUpload) return;
                  
                  // Reset error status for single file
                  resetErrorsMutation.mutate([selectedErrorUpload.id]);
                  setErrorDetailsDialog(false);
                }}
                disabled={resetErrorsMutation.isPending}
              >
                {resetErrorsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Reset Error Status
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Warning Details Dialog */}
      {selectedWarningUpload && (
        <WarningDialog
          uploadId={selectedWarningUpload.id}
          filename={selectedWarningUpload.filename}
          open={warningDialogOpen}
          onOpenChange={(open) => {
            setWarningDialogOpen(open);
            if (!open) {
              setSelectedWarningUpload(null);
            }
          }}
        />
      )}
      </div>
    </MainLayout>
  );
}


