import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { UploaderUpload } from '@shared/schema';
import { formatDistanceToNow } from 'date-fns';
import { formatFileSize, getStatusBadgeVariant, TddfApiFile, TddfApiSchema } from '@/lib/tddf-shared';

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

export default function TddfApiDataPage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedSchema, setSelectedSchema] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  
  // Archive management state
  const [archiveFilters, setArchiveFilters] = useState({
    archiveStatus: 'all',
    step6Status: 'all', 
    businessDayFrom: '',
    businessDayTo: ''
  });
  
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

  // Update local state when API data loads
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

  const [statusFilter, setStatusFilter] = useState('all');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');
  const [filenameFilter, setFilenameFilter] = useState('');
  const [environmentFilter, setEnvironmentFilter] = useState('current');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size' | 'businessDay' | 'records' | 'progress'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  
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

  // Global filename filtering state for cross-tab functionality
  const [globalFilenameFilter, setGlobalFilenameFilter] = useState<string>('');
  
  // View mode state for Raw Data tab (lifted up for cross-tab functionality)
  const [viewMode, setViewMode] = useState<'tree' | 'flat' | 'file'>('flat');

  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  // Extract queue data from processing status for compatibility
  const queue = Array.isArray(processingStatus?.activeProcessing) ? processingStatus.activeProcessing : [];

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

  // Fetch archive data
  const { data: archiveData, isLoading: isLoadingArchive, refetch: refetchArchive } = useQuery({
    queryKey: ['/api/tddf-archive', archiveFilters],
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
  const { data: monitoring } = useQuery<any>({
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
      toast({ title: "API key created successfully" });
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

  // Reset errors mutation for bulk error recovery
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

  // Archive mutation for bulk archiving (Step 7)
  const archiveMutation = useMutation({
    mutationFn: async (uploadIds: string[]) => {
      const response = await apiRequest('/api/tddf-archive/bulk-archive', {
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
        title: "Archive completed successfully", 
        description: `${data.archivedFiles?.length || 0} file(s) archived to permanent storage`
      });
    },
    onError: (error: any) => {
      toast({ 
        title: "Archive failed", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  // Delete files mutation
  const deleteFilesMutation = useMutation({
    mutationFn: async (fileIds: number[]) => {
      return apiRequest("/api/tddf-api/files/delete", {
        method: "POST",
        body: JSON.stringify({ fileIds })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"], exact: false });
      setSelectedFiles(new Set());
      setShowDeleteDialog(false);
      toast({ title: "Files deleted successfully" });
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

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          
          // Upload file to object storage
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
        }
        
        toast({ title: `${file.name} uploaded successfully` });
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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setLocation('/')}
            className="flex items-center gap-2"
            data-testid="button-back-home"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">TDDF API Data System</h1>
            <p className="text-muted-foreground">
              High-performance position-based flat file processing with dynamic schema configuration
            </p>
          </div>
        </div>
        <Badge variant="outline">
          {files.length} Files | {schemas.length} Schemas | {apiKeys.length} API Keys
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schemas">Schemas</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="raw-data">Raw Data</TabsTrigger>
          <TabsTrigger value="archive-data">Archive Data</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
          <TabsTrigger value="api-keys">API Keys</TabsTrigger>
          <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">System Overview</h2>
            <Button 
              variant="outline" 
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
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Files</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{files.length}</div>
                <p className="text-xs text-muted-foreground">
                  {files.filter((f: TddfApiFile) => f.current_phase === "encoded").length} Step 6 processed
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
                  {files.filter((f: TddfApiFile) => f.current_phase === "processing" || f.current_phase === "encoding").length}
                </div>
                <p className="text-xs text-muted-foreground">
                  {files.filter((f: TddfApiFile) => f.current_phase === "processing").length} active
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
                    {formatFileSize(files.reduce((sum: number, f: TddfApiFile) => sum + (Number(f.file_size) || 0), 0))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Across {files.length} files
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
                    {files.length > 0 
                      ? ((files.filter((f: TddfApiFile) => f.status === "completed").length / files.length) * 100).toFixed(1)
                      : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {files.filter((f: TddfApiFile) => f.status === "completed").length} of {files.length} files
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
                    {files.length > 0 
                      ? formatFileSize(files.reduce((sum: number, f: TddfApiFile) => sum + (Number(f.file_size) || 0), 0) / files.length)
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
                    {files.length > 0 
                      ? (100 - (files.filter((f: TddfApiFile) => f.status === "failed" || f.status === "error").length / files.length) * 100).toFixed(1)
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
                      const count = files.filter((f: TddfApiFile) => f.status === status).length;
                      const percentage = files.length > 0 ? (count / files.length) * 100 : 0;
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
                      const count = files.filter(category.filter).length;
                      const percentage = files.length > 0 ? (count / files.length) * 100 : 0;
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
                          {files.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Total Records</div>
                      </div>
                      <div className="text-center p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {files.reduce((sum: number, f: TddfApiFile) => sum + (f.processed_records || 0), 0).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">Processed Records</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Processing Progress</span>
                        <span>
                          {files.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0) > 0 
                            ? ((files.reduce((sum: number, f: TddfApiFile) => sum + (f.processed_records || 0), 0) / files.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0)) * 100).toFixed(1)
                            : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${files.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0) > 0 
                              ? (files.reduce((sum: number, f: TddfApiFile) => sum + (f.processed_records || 0), 0) / files.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0)) * 100
                              : 0}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      Average records per file: {files.length > 0 
                        ? Math.round(files.reduce((sum: number, f: TddfApiFile) => sum + (f.record_count || 0), 0) / files.length).toLocaleString()
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
                    {files.length > 0 ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="text-lg font-bold">
                              {files.filter((f: TddfApiFile) => {
                                const uploadDate = new Date(f.uploaded_at || '');
                                const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                                return uploadDate > dayAgo;
                              }).length}
                            </div>
                            <div className="text-xs text-muted-foreground">Last 24 Hours</div>
                          </div>
                          <div className="text-center p-3 bg-muted rounded-lg">
                            <div className="text-lg font-bold">
                              {files.filter((f: TddfApiFile) => {
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
                          {files.slice(0, 3).map((file: TddfApiFile) => (
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
                      const schemaFiles = files.filter((f: TddfApiFile) => f.schema_name === schema.name);
                      const usagePercentage = files.length > 0 ? (schemaFiles.length / files.length) * 100 : 0;
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
                  {files.slice(0, 5).map((file: TddfApiFile) => (
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
          {/* Combined Upload & Files Tab */}
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">TDDF Upload & Files</h2>
            <Badge variant="outline">
              {uploads.length} Uploads | {files.length} Processed Files
            </Badge>
          </div>

          {/* Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                File Upload
              </CardTitle>
              <CardDescription>
                Session-controlled upload for TDDF files to the King database system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                          relative px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 transform hover:scale-105
                          ${selectedFileType === type.value 
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }
                        `}
                        title={type.description}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`
                            w-2 h-2 rounded-full transition-all duration-300
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

                {/* File Upload Zone */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Files</label>
                  
                  <div className="relative">
                    <div 
                      className="border-2 border-dashed border-blue-300 rounded-lg p-3 text-center hover:border-blue-400 transition-colors duration-300 bg-blue-50/30 hover:bg-blue-50/50 cursor-pointer group"
                      onClick={() => document.getElementById('tddf-file-input')?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('border-blue-500', 'bg-blue-50');
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
                        const files = e.dataTransfer?.files;
                        if (files) {
                          setSelectedUploadFiles(files);
                          if (selectedFileType) {
                            setTimeout(() => handleStartUpload(files), 100);
                          }
                        }
                      }}
                    >
                      <div className="flex items-center justify-center space-x-3">
                        <Upload className="h-6 w-6 text-blue-400" />
                        <div>
                          <p className="font-medium text-blue-600">File Upload Zone</p>
                          <p className="text-xs text-blue-500/80">Drag & drop TDDF files here, or click to browse</p>
                        </div>
                        <Button size="sm" className="bg-blue-500 hover:bg-blue-600">
                          <Upload className="h-3 w-3 mr-1" />
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

                {/* Auto 6 Json Encode Switch */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Pause className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-medium text-blue-800">Auto 6 Json Encode</div>
                        <div className="text-sm text-blue-600">
                          Enable automatic Step 6 JSON encoding for uploaded files
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={autoStep6Enabled}
                      onCheckedChange={handleAutoStep6Change}
                      disabled={saveAutoStep6Setting.isPending}
                    />
                  </div>
                </div>

                {/* Auto 7 Archive Switch */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Database className="h-5 w-5 text-green-600" />
                      <div>
                        <div className="font-medium text-green-800">Auto 7 Archive</div>
                        <div className="text-sm text-green-600">
                          Enable automatic Step 7 archiving for completed files
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={autoStep7Enabled}
                      onCheckedChange={handleAutoStep7Change}
                      disabled={saveAutoStep7Setting.isPending}
                      data-testid="switch-auto-step7"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Files Management Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Uploaded Files ({uploads.length})</CardTitle>
                  <CardDescription>
                    Files in the upload pipeline system - phases 1-5 processing
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {/* Group Select Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedUploads.length === uploads.length) {
                        setSelectedUploads([]);
                      } else {
                        setSelectedUploads(uploads.map((u: UploaderUpload) => u.id));
                      }
                    }}
                  >
                    {selectedUploads.length === uploads.length ? (
                      <Square className="h-4 w-4 mr-1" />
                    ) : (
                      <CheckSquare className="h-4 w-4 mr-1" />
                    )}
                    {selectedUploads.length === uploads.length ? 'Deselect All' : 'Select All'}
                  </Button>

                  {selectedUploads.length > 0 && (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {selectedUploads.length} selected
                      </span>
                      
                      {/* Manual Process Step 6 Button */}
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          const encodedFiles = selectedUploads.filter(id => {
                            const upload = uploads.find((u: UploaderUpload) => u.id === id);
                            return upload && (upload.currentPhase === 'encoded' || upload.currentPhase === 'completed');
                          });
                          
                          if (encodedFiles.length === 0) {
                            toast({ 
                              title: "No eligible files selected", 
                              description: "Please select files that are 'encoded' or 'completed' for Step 6 processing",
                              variant: "destructive" 
                            });
                            return;
                          }
                          
                          // Trigger Step 6 processing API call
                          step6ProcessingMutation.mutate(encodedFiles);
                        }}
                        className="bg-purple-600 hover:bg-purple-700 text-white"
                        disabled={step6ProcessingMutation.isPending || !selectedUploads.some(id => {
                          const upload = uploads.find((u: UploaderUpload) => u.id === id);
                          return upload && (upload.currentPhase === 'encoded' || upload.currentPhase === 'completed');
                        })}
                      >
                        <Zap className="h-4 w-4 mr-1" />
                        Manual Process Step 6
                      </Button>

                      {/* Reset Errors Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const errorFiles = selectedUploads.filter(id => {
                            const upload = uploads.find((u: UploaderUpload) => u.id === id);
                            return upload && upload.currentPhase === 'error';
                          });
                          
                          if (errorFiles.length === 0) {
                            toast({ 
                              title: "No error files selected", 
                              description: "Please select files that are in 'error' status to reset",
                              variant: "destructive" 
                            });
                            return;
                          }
                          
                          // Trigger reset errors API call
                          resetErrorsMutation.mutate(errorFiles);
                        }}
                        className="border-orange-600 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
                        disabled={resetErrorsMutation.isPending || !selectedUploads.some(id => {
                          const upload = uploads.find((u: UploaderUpload) => u.id === id);
                          return upload && upload.currentPhase === 'error';
                        })}
                      >
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Reset Errors
                      </Button>

                      {/* Archive Selected Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const archiveFiles = selectedUploads.filter(id => {
                            const upload = uploads.find((u: UploaderUpload) => u.id === id);
                            return upload && (upload.currentPhase === 'encoded' || upload.currentPhase === 'completed');
                          });
                          
                          if (archiveFiles.length === 0) {
                            toast({ 
                              title: "No eligible files selected", 
                              description: "Please select files that are 'encoded' or 'completed' for archiving",
                              variant: "destructive" 
                            });
                            return;
                          }
                          
                          // Trigger archive API call
                          archiveMutation.mutate(archiveFiles);
                        }}
                        className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                        disabled={archiveMutation.isPending || !selectedUploads.some(id => {
                          const upload = uploads.find((u: UploaderUpload) => u.id === id);
                          return upload && (upload.currentPhase === 'encoded' || upload.currentPhase === 'completed');
                        })}
                        data-testid="button-archive-selected"
                      >
                        <Database className="h-4 w-4 mr-1" />
                        Archive
                      </Button>
                      
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={handleBulkDelete}
                        disabled={bulkDeleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete Selected
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
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
                      <SelectItem value="encoding">Encoding</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="encoded">Encoded</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
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

              {uploadsLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                  <p className="text-muted-foreground mt-2">Loading uploads...</p>
                </div>
              ) : uploads.length === 0 ? (
                <div className="text-center py-8">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground mt-2">No files uploaded yet</p>
                  <p className="text-sm text-muted-foreground">Upload TDDF files to see them here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {uploadedFiles.slice(uploadsCurrentPage * uploadsItemsPerPage, (uploadsCurrentPage + 1) * uploadsItemsPerPage).map((upload: any) => (
                    <div key={upload.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedUploads.includes(upload.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedUploads(prev => [...prev, upload.id]);
                            } else {
                              setSelectedUploads(prev => prev.filter(id => id !== upload.id));
                            }
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{upload.filename}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatFileSize(upload.fileSize)} • {upload.finalFileType || 'tddf'} • Started {new Date(upload.uploadedAt).toLocaleString('en-US', { 
                              month: 'numeric', 
                              day: 'numeric', 
                              year: 'numeric', 
                              hour: 'numeric', 
                              minute: '2-digit', 
                              hour12: true,
                              timeZone: 'America/Chicago'
                            })} • Encoding: <TimingDisplay uploadId={upload.id} /> • {upload.lineCount ? upload.lineCount.toLocaleString() : '9,155'} lines
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {upload.currentPhase === 'error' ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="destructive"
                                  className="cursor-pointer hover:bg-red-700"
                                  onClick={() => handleShowErrorDetails(upload)}
                                >
                                  {upload.currentPhase || 'started'}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-sm">
                                  <strong>Error:</strong> {getErrorSummary(upload.processingErrors)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">Click for full details</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : upload.currentPhase === 'warning' ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge 
                                  variant="outline"
                                  className="cursor-pointer border-yellow-500 text-yellow-700 bg-yellow-50 hover:bg-yellow-100"
                                  onClick={() => handleShowWarningDetails(upload)}
                                  data-testid="badge-warning"
                                >
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  warning
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-sm">
                                  <strong>Warning:</strong> {upload.processingNotes || 'File has processing warnings'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">Click to view details and reset</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <Badge 
                            variant={upload.currentPhase === 'completed' || upload.currentPhase === 'encoded' ? 'default' : 'secondary'}
                            className={upload.currentPhase === 'completed' ? 'bg-green-800 text-white hover:bg-green-900' : ''}
                          >
                            {upload.currentPhase || 'started'}
                          </Badge>
                        )}
                        
                        {/* Add View Warning button for warning status */}
                        {upload.currentPhase === 'warning' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleShowWarningDetails(upload)}
                            data-testid="button-view-warning"
                            className="h-8 w-8 p-0 text-yellow-600 hover:text-yellow-700 hover:bg-yellow-100"
                          >
                            <AlertTriangle className="h-4 w-4" />
                          </Button>
                        )}
                        {upload.uploadProgress !== undefined && upload.uploadProgress < 100 && (
                          <div className="w-16">
                            <Progress value={upload.uploadProgress} className="h-2" />
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            handleViewUploaderFile(upload);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {uploads.length > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show:</span>
                    <Select value={uploadsItemsPerPage.toString()} onValueChange={(value) => {
                      setUploadsItemsPerPage(Number(value));
                      setUploadsCurrentPage(0);
                    }}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="250">250</SelectItem>
                        <SelectItem value="500">500</SelectItem>
                        <SelectItem value="1000">1K</SelectItem>
                        <SelectItem value="1500">1.5K</SelectItem>
                        <SelectItem value="2000">2K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Showing {uploadsCurrentPage * uploadsItemsPerPage + 1} to {Math.min((uploadsCurrentPage + 1) * uploadsItemsPerPage, totalUploads)} of {totalUploads} uploads
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUploadsCurrentPage(Math.max(0, uploadsCurrentPage - 1))}
                      disabled={uploadsCurrentPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">{uploadsCurrentPage + 1} of {Math.ceil(totalUploads / uploadsItemsPerPage)}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUploadsCurrentPage(Math.min(Math.ceil(totalUploads / uploadsItemsPerPage) - 1, uploadsCurrentPage + 1))}
                      disabled={uploadsCurrentPage >= Math.ceil(totalUploads / uploadsItemsPerPage) - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Processed Files Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Processed TDDF Files ({totalProcessedFiles})</CardTitle>
                  <CardDescription>
                    Files that have completed processing and are available in the daily view
                  </CardDescription>
                </div>
                {selectedFiles.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {selectedFiles.size} selected
                    </span>
                    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete Selected
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Selected Files</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {selectedFiles.size} selected file(s)? 
                            This action cannot be undone and will remove all associated processing data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteSelected}
                            disabled={deleteFilesMutation.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deleteFilesMutation.isPending ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Deleting...
                              </>
                            ) : (
                              'Delete Files'
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Date Filtering Controls */}
              <div className="mb-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div>
                    <Label htmlFor="date-from">Upload Date From</Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={dateFilters.dateFrom}
                      onChange={(e) => setDateFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="date-to">Upload Date To</Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={dateFilters.dateTo}
                      onChange={(e) => setDateFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="business-day-from">Business Day From</Label>
                    <Input
                      id="business-day-from"
                      type="date"
                      value={dateFilters.businessDayFrom}
                      onChange={(e) => setDateFilters(prev => ({ ...prev, businessDayFrom: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="business-day-to">Business Day To</Label>
                    <Input
                      id="business-day-to"
                      type="date"
                      value={dateFilters.businessDayTo}
                      onChange={(e) => setDateFilters(prev => ({ ...prev, businessDayTo: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="status-filter">Status</Label>
                    <Select value={dateFilters.status} onValueChange={(value) => setDateFilters(prev => ({ ...prev, status: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="uploaded">Uploaded</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                        <SelectItem value="error">Error</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setDateFilters({
                      dateFrom: "",
                      dateTo: "",
                      businessDayFrom: "",
                      businessDayTo: "",
                      status: ""
                    })}
                  >
                    Clear Filters
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"], exact: false });
                      queryClient.invalidateQueries({ queryKey: ["/api/uploader"] });
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={files.length > 0 && selectedFiles.size === files.length}
                        onCheckedChange={() => {
                          if (selectedFiles.size === files.length) {
                            setSelectedFiles(new Set());
                          } else {
                            setSelectedFiles(new Set(files.map((f: TddfApiFile) => f.id)));
                          }
                        }}
                        aria-label="Select all files"
                      />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center">
                        File Name
                        {getSortIndicator('name')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('businessDay')}
                    >
                      <div className="flex items-center">
                        Business Day
                        {getSortIndicator('businessDay')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('size')}
                    >
                      <div className="flex items-center">
                        Size
                        {getSortIndicator('size')}
                      </div>
                    </TableHead>
                    <TableHead>Schema</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('records')}
                    >
                      <div className="flex items-center">
                        Records
                        {getSortIndicator('records')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('progress')}
                    >
                      <div className="flex items-center">
                        Progress
                        {getSortIndicator('progress')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50 select-none"
                      onClick={() => handleSort('date')}
                    >
                      <div className="flex items-center">
                        Uploaded
                        {getSortIndicator('date')}
                      </div>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filesLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedFiles.map((file) => (
                      <TableRow key={file.id} className={selectedFiles.has(file.id) ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedFiles.has(file.id)}
                            onCheckedChange={(checked) => {
                              const newSelection = new Set(selectedFiles);
                              if (checked) {
                                newSelection.add(file.id);
                              } else {
                                newSelection.delete(file.id);
                              }
                              setSelectedFiles(newSelection);
                            }}
                            aria-label={`Select ${file.filename}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium max-w-xs truncate">
                          {file.filename}
                        </TableCell>
                        <TableCell>
                          {file.business_day ? format(new Date(file.business_day), "MMM d, yyyy") : (
                            file.file_date ? (
                              <span className="text-muted-foreground">{file.file_date}</span>
                            ) : (
                              file.status === 'started' || file.status === 'uploading' || file.status === 'uploaded' ? (
                                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Processing</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )
                            )
                          )}
                        </TableCell>
                        <TableCell>{formatFileSize(file.file_size)}</TableCell>
                        <TableCell>
                          {file.schema_name ? `${file.schema_name} v${file.schema_version}` : "None"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(file.status)}>
                            {file.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {file.record_count > 0 ? file.record_count.toLocaleString() : (
                            file.status === 'started' || file.status === 'uploading' || file.status === 'uploaded' ? (
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">Processing</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )
                          )}
                        </TableCell>
                        <TableCell>
                          {file.record_count > 0 && (
                            <div className="w-20">
                              <Progress 
                                value={(file.processed_records / file.record_count) * 100} 
                                className="h-2"
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {file.uploaded_at ? format(new Date(file.uploaded_at), "MMM d, yyyy") : "Unknown"}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleViewUploaderFile(file)}
                              title="View raw file contents"
                              data-testid={`button-view-file-${file.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                console.log('Filter button clicked for file:', file.filename);
                                // Set global filename filter and navigate to Raw Data tab
                                setGlobalFilenameFilter(file.filename);
                                console.log('Setting active tab to raw-data');
                                setActiveTab('raw-data');
                                console.log('Setting view mode to file');
                                setViewMode('file');
                              }}
                              title="Filter Raw Data by this file"
                              className="text-blue-600 hover:text-blue-700"
                              data-testid={`button-filter-file-${file.id}`}
                            >
                              <Filter className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" title="Download file">
                              <Download className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete File</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{file.filename}"? 
                                    This action cannot be undone and will remove all associated processing data.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteFilesMutation.mutate([file.id])}
                                    disabled={deleteFilesMutation.isPending}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    {deleteFilesMutation.isPending ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                        Deleting...
                                      </>
                                    ) : (
                                      'Delete File'
                                    )}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              
              {/* Pagination Controls for Processed Files */}
              {totalProcessedFiles > 0 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show:</span>
                    <Select 
                      value={processedFilesItemsPerPage.toString()} 
                      onValueChange={(value) => {
                        setProcessedFilesItemsPerPage(Number(value));
                        setProcessedFilesCurrentPage(0); // Reset to first page when changing page size
                      }}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="250">250</SelectItem>
                        <SelectItem value="500">500</SelectItem>
                        <SelectItem value="1000">1K</SelectItem>
                        <SelectItem value="1500">1.5K</SelectItem>
                        <SelectItem value="2000">2K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Showing {processedFilesCurrentPage * processedFilesItemsPerPage + 1} to {Math.min((processedFilesCurrentPage + 1) * processedFilesItemsPerPage, totalProcessedFiles)} of {totalProcessedFiles} processed files
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setProcessedFilesCurrentPage(Math.max(0, processedFilesCurrentPage - 1))}
                      disabled={processedFilesCurrentPage === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">{processedFilesCurrentPage + 1} of {Math.ceil(totalProcessedFiles / processedFilesItemsPerPage)}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setProcessedFilesCurrentPage(Math.min(Math.ceil(totalProcessedFiles / processedFilesItemsPerPage) - 1, processedFilesCurrentPage + 1))}
                      disabled={processedFilesCurrentPage >= Math.ceil(totalProcessedFiles / processedFilesItemsPerPage) - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Archive Management Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    TDDF Archive Management ({isLoadingArchive ? '...' : archivedFiles.length})
                  </CardTitle>
                  <CardDescription>
                    Permanent archive storage for processed TDDF files - dev-tddf-archive/ and prod-tddf-archive/
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
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
                    Refresh Archive
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Archive Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label>Archive Status</Label>
                  <Select 
                    value={archiveFilters.archiveStatus} 
                    onValueChange={(value) => setArchiveFilters(prev => ({ ...prev, archiveStatus: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Files</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                      <SelectItem value="processed">Processed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Step 6 Status</Label>
                  <Select 
                    value={archiveFilters.step6Status}
                    onValueChange={(value) => setArchiveFilters(prev => ({ ...prev, step6Status: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Files</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
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
              </div>

              {/* Archive Actions */}
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
                <div className="flex-1" />
                
                {/* Selected Archive Actions */}
                {selectedArchiveFiles.length > 0 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        toast({ 
                          title: "Reprocess initiated", 
                          description: `Reprocessing ${selectedArchiveFiles.length} selected archive file(s)` 
                        });
                        // TODO: Implement reprocess logic
                      }}
                      data-testid="button-reprocess-archive"
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Reprocess Selected ({selectedArchiveFiles.length})
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={async () => {
                        if (confirm(`Are you sure you want to delete ${selectedArchiveFiles.length} archive file(s)?`)) {
                          try {
                            const response = await fetch('/api/tddf-archive/bulk-delete', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              credentials: 'include',
                              body: JSON.stringify({ archiveIds: selectedArchiveFiles })
                            });
                            
                            const data = await response.json();
                            
                            if (response.ok) {
                              toast({ 
                                title: "Success", 
                                description: data.message || `Deleted ${selectedArchiveFiles.length} archive file(s)` 
                              });
                              setSelectedArchiveFiles([]);
                              refetchArchive();
                            } else {
                              toast({ 
                                title: "Error", 
                                description: data.error || 'Failed to delete archive files',
                                variant: "destructive"
                              });
                            }
                          } catch (error) {
                            console.error('Error deleting archive files:', error);
                            toast({ 
                              title: "Error", 
                              description: 'Failed to delete archive files',
                              variant: "destructive"
                            });
                          }
                        }
                      }}
                      data-testid="button-delete-archive"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete Selected ({selectedArchiveFiles.length})
                    </Button>
                  </>
                )}
                
                <Button
                  variant="default"
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => {
                    // TODO: Archive selected upload files
                    toast({ title: "Archive process initiated", description: "Selected files are being moved to permanent archive storage" });
                  }}
                >
                  <Zap className="h-4 w-4 mr-1" />
                  Archive Selected Uploads
                </Button>
              </div>

              {/* Archive Table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedArchiveFiles.length === archivedFiles.length && archivedFiles.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedArchiveFiles(archivedFiles.map((f: any) => f.id));
                          } else {
                            setSelectedArchiveFiles([]);
                          }
                        }}
                        aria-label="Select all archive files"
                        data-testid="checkbox-select-all-archive"
                      />
                    </TableHead>
                    <TableHead>Original Filename</TableHead>
                    <TableHead>Archive Details</TableHead>
                    <TableHead>Archive Status</TableHead>
                    <TableHead>Step 6 Status</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Business Day</TableHead>
                    <TableHead>Archived Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingArchive ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        <span className="ml-2">Loading archive data...</span>
                      </TableCell>
                    </TableRow>
                  ) : archivedFiles.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No archived files found. Use "Archive Selected Uploads" to move files to permanent storage.
                      </TableCell>
                    </TableRow>
                  ) : (
                    archivedFiles.map((file: any) => (
                      <TableRow key={file.id}>
                        <TableCell>
                          <Checkbox 
                            checked={selectedArchiveFiles.includes(file.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedArchiveFiles([...selectedArchiveFiles, file.id]);
                              } else {
                                setSelectedArchiveFiles(selectedArchiveFiles.filter(id => id !== file.id));
                              }
                            }}
                            data-testid={`checkbox-archive-${file.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium max-w-[300px]" title={file.original_filename}>
                          <div className="truncate">{file.original_filename}</div>
                        </TableCell>
                        <TableCell className="max-w-[250px]">
                          <div 
                            className="cursor-help border-b border-dotted border-muted-foreground/50 hover:border-muted-foreground"
                            title={`Archive File: ${file.archive_filename}\nStorage Path: ${file.archive_path}`}
                          >
                            <div className="text-xs font-mono truncate text-muted-foreground">
                              {file.archive_filename}
                            </div>
                            <div className="text-xs font-mono truncate text-muted-foreground/70">
                              {file.archive_path}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={file.archive_status === 'pending' ? 'secondary' : 
                                        file.archive_status === 'archived' ? 'default' :
                                        file.archive_status === 'processed' ? 'default' : 'destructive'}>
                            {file.archive_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={file.step6_status === 'pending' ? 'secondary' : 
                                        file.step6_status === 'processing' ? 'secondary' :
                                        file.step6_status === 'completed' ? 'default' : 'destructive'}>
                            {file.step6_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {file.total_records !== null && file.total_records !== undefined 
                            ? (
                                <div className="text-sm">
                                  <div className="font-medium">
                                    {file.total_records.toLocaleString()}
                                  </div>
                                  {file.processed_records !== null && file.processed_records !== undefined && (
                                    <div className="text-xs text-muted-foreground">
                                      {file.processed_records.toLocaleString()} processed
                                    </div>
                                  )}
                                </div>
                              ) 
                            : <span className="text-muted-foreground">-</span>
                          }
                        </TableCell>
                        <TableCell>
                          {file.business_day ? format(new Date(file.business_day), 'MMM d, yyyy') : 'Unknown'}
                        </TableCell>
                        <TableCell>
                          {file.archived_at ? format(new Date(file.archived_at), 'MMM d, yyyy HH:mm') : 'Pending'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleViewArchiveFile(file)}
                              data-testid={`button-view-archive-${file.id}`}
                              title="View file content"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {file.original_upload_id && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setLocation(`/tddf-viewer/${file.original_upload_id}/${encodeURIComponent(file.original_filename)}?unlimited=true`)}
                                data-testid={`button-view-jsonb-${file.id}`}
                                title="View JSONB data (unlimited records)"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
              <h2 className="text-2xl font-bold">TDDF Raw Data</h2>
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
            viewMode={viewMode}
            setViewMode={setViewMode}
            getMerchantName={getMerchantName}
          />
        </TabsContent>

        <TabsContent value="archive-data" className="space-y-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Archive Data</h2>
              <p className="text-muted-foreground">View archived TDDF records from permanent storage</p>
            </div>
            <Button 
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/all-archive-records"], exact: false });
                toast({ title: "Archive data refreshed" });
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh Data
            </Button>
          </div>
          
          <ArchiveDataTab />
        </TabsContent>

        <TabsContent value="processing" className="space-y-4">
          <h2 className="text-2xl font-bold">Processing Queue</h2>
          
          <Card>
            <CardHeader>
              <CardTitle>Queue Status</CardTitle>
              <CardDescription>Real-time processing queue monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>File Size</TableHead>
                    <TableHead>Attempts</TableHead>
                    <TableHead>Queued</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Processing Time</TableHead>
                    <TableHead>Error Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : queue.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        No items in processing queue
                      </TableCell>
                    </TableRow>
                  ) : (
                    queue.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium max-w-xs truncate">
                          {item.filename || `File ${item.file_id}`}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.priority > 75 ? "destructive" : item.priority > 50 ? "secondary" : "outline"}>
                            {item.priority || 75}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {formatFileSize(Number(item.file_size || 0))}
                          </div>
                        </TableCell>
                        <TableCell>{item.attempts || 0}/{item.max_attempts || 3}</TableCell>
                        <TableCell>
                          {item.created_at ? format(new Date(item.created_at), "MMM d, HH:mm") : "Unknown"}
                        </TableCell>
                        <TableCell>
                          {item.started_at ? format(new Date(item.started_at), "MMM d, HH:mm") : "-"}
                        </TableCell>
                        <TableCell>
                          {item.started_at && item.completed_at ? (
                            `${Math.round((new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()) / 1000)}s`
                          ) : item.started_at ? (
                            <div className="flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              <span className="text-sm">Processing...</span>
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs">
                          {item.error_details ? (
                            <div className="text-sm text-red-600 truncate" title={item.error_details}>
                              {item.error_details}
                            </div>
                          ) : (
                            "-"
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api-keys" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">API Key Management</h2>
            <Dialog>
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
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keysLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center">
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
                          {key.lastUsed ? format(new Date(key.lastUsed), "MMM d, yyyy") : "Never"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">
                            <Settings className="h-4 w-4" />
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

        <TabsContent value="monitoring" className="space-y-4">
          <h2 className="text-2xl font-bold">API Monitoring</h2>
          
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
  );
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
                            
                            {transaction.extensions.length > 0 && (
                              <div className="ml-auto flex items-center gap-1">
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

// Archive Data Tab Component
function ArchiveDataTab() {
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [recordType, setRecordType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [archiveFileId, setArchiveFileId] = useState<string>('');
  
  // Fetch archive records
  const { data: archiveData, isLoading } = useQuery<{
    data: any[];
    summary: { totalRecords: number; bhRecords: number; dtRecords: number; totalArchiveFiles: number };
    pagination: { limit: number; offset: number; total: number };
  }>({
    queryKey: ['/api/tddf-api/all-archive-records', { 
      limit: pageSize, 
      offset: currentPage * pageSize, 
      recordType: recordType !== 'all' ? recordType : undefined,
      search: searchQuery || undefined,
      archiveFileId: archiveFileId || undefined
    }],
    refetchInterval: false,
    staleTime: 60000
  });

  const records = archiveData?.data || [];
  const summary = archiveData?.summary || { totalRecords: 0, bhRecords: 0, dtRecords: 0, totalArchiveFiles: 0 };
  const pagination = archiveData?.pagination || { limit: pageSize, offset: 0, total: 0 };
  const totalPages = Math.ceil(pagination.total / pageSize);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalRecords.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">BH Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.bhRecords.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">DT Records</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.dtRecords.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Archive Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.totalArchiveFiles.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Record Type</Label>
              <Select value={recordType} onValueChange={setRecordType}>
                <SelectTrigger data-testid="select-record-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="BH">BH (Batch Header)</SelectItem>
                  <SelectItem value="DT">DT (Transaction)</SelectItem>
                  <SelectItem value="BT">BT (Batch Trailer)</SelectItem>
                  <SelectItem value="FH">FH (File Header)</SelectItem>
                  <SelectItem value="FT">FT (File Trailer)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Search</Label>
              <Input
                placeholder="Search records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <div className="space-y-2">
              <Label>Archive File ID</Label>
              <Input
                placeholder="Filter by archive file ID..."
                value={archiveFileId}
                onChange={(e) => setArchiveFileId(e.target.value)}
                data-testid="input-archive-file-id"
              />
            </div>
            <div className="space-y-2">
              <Label>Page Size</Label>
              <Select value={pageSize.toString()} onValueChange={(v) => {
                setPageSize(parseInt(v));
                setCurrentPage(0);
              }}>
                <SelectTrigger data-testid="select-page-size">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1K</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No archive records found
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Record Type</TableHead>
                    <TableHead>Line #</TableHead>
                    <TableHead>Merchant Account</TableHead>
                    <TableHead>Archive File</TableHead>
                    <TableHead>Original Filename</TableHead>
                    <TableHead>Archived At</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Badge>{record.record_type}</Badge>
                      </TableCell>
                      <TableCell>{record.line_number}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {record.merchant_account_number || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {record.archive_filename || record.archive_file_id}
                      </TableCell>
                      <TableCell className="text-sm">
                        {record.original_filename || '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {record.archived_at ? format(new Date(record.archived_at), "MMM d, yyyy HH:mm") : '-'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" data-testid={`button-view-${record.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, pagination.total)} of {pagination.total.toLocaleString()} records
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(0)}
                    disabled={currentPage === 0}
                    data-testid="button-first-page"
                  >
                    First
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                    disabled={currentPage === 0}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
                    disabled={currentPage >= totalPages - 1}
                    data-testid="button-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages - 1)}
                    disabled={currentPage >= totalPages - 1}
                    data-testid="button-last-page"
                  >
                    Last
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RawDataTab({ 
  globalFilenameFilter, 
  setGlobalFilenameFilter,
  viewMode,
  setViewMode,
  getMerchantName
}: { 
  globalFilenameFilter: string; 
  setGlobalFilenameFilter: (filename: string) => void; 
  viewMode: 'tree' | 'flat' | 'file';
  setViewMode: (mode: 'tree' | 'flat' | 'file') => void;
  getMerchantName: (merchantAccountNumber: string | null) => string | null;
}) {
  const { toast } = useToast();
  const [currentPage, setCurrentPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [recordType, setRecordType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showRecords, setShowRecords] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState<number | null>(null);
  
  // Tree view state
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  
  // File view state
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [expandedFileBatches, setExpandedFileBatches] = useState<Set<string>>(new Set());
  const [expandedFileTransactions, setExpandedFileTransactions] = useState<Set<string>>(new Set());
  
  // File filtering state (now using global state)
  // const [rawDataFilenameFilter, setRawDataFilenameFilter] = useState<string>(''); // Moved to global state
  
  // Selection state for bulk operations
  const [selectedRecords, setSelectedRecords] = useState<Set<number>>(new Set());
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);

  // Global filename filtering state (now passed from main component)
  
  // Pagination options
  const pageSizeOptions = [
    { value: 10, label: '10' },
    { value: 100, label: '100' },
    { value: 500, label: '500' },
    { value: 1000, label: '1K' },
    { value: 3000, label: '3K' },
    { value: 5000, label: '5K' },
    { value: 10000, label: '10K' },
    { value: 25000, label: '25K' },
    { value: 50000, label: '50K' },
    { value: 100000, label: '100K' },
    { value: 150000, label: '150K' }
  ];

  // Tree view supporting functions
  const getRecordTypeBadgeColor = (recordType: string) => {
    switch (recordType) {
      case '01': case 'BH': return 'bg-green-500 hover:bg-green-600';
      case '47': case 'DT': return 'bg-blue-500 hover:bg-blue-600';
      case '98': case 'TR': return 'bg-red-500 hover:bg-red-600';
      case 'P1': return 'bg-purple-500 hover:bg-purple-600';
      case 'P2': return 'bg-purple-600 hover:bg-purple-700';
      case 'G2': return 'bg-indigo-500 hover:bg-indigo-600';
      case 'A1': return 'bg-yellow-500 hover:bg-yellow-600';
      case 'E1': return 'bg-pink-500 hover:bg-pink-600';
      case 'LG': return 'bg-teal-500 hover:bg-teal-600';
      case '10': return 'bg-green-600 hover:bg-green-700';
      default: return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  const getRecordTypeName = (recordType: string) => {
    switch (recordType) {
      case '01': case 'BH': return 'Batch Header';
      case '10': return 'File Header';
      case '47': case 'DT': return 'Detail Transaction';
      case '98': case 'TR': return 'Trailer';
      case 'G2': return 'Geographic Extension';
      case 'A1': return 'Airline Extension';
      case 'E1': return 'E-Commerce Extension';
      case 'P1': return 'Purchasing Card';
      case 'P2': return 'Purchasing Card Ext';
      case 'LG': return 'Lodge/Hotel';
      default: return `Record ${recordType}`;
    }
  };

  const formatFieldValue = (key: string, value: any) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string' && value.trim() === '') return '-';
    
    if (key === 'merchantAccountNumber' && value) {
      return value.toString().trim();
    }
    
    if (typeof value === 'number') {
      if (key.toLowerCase().includes('amount') || key.toLowerCase().includes('fee')) {
        return (value / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      }
      return value.toLocaleString();
    }
    
    if (key.toLowerCase().includes('date') || key.toLowerCase().includes('time')) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString();
        }
      } catch (e) {
        // Not a valid date, return as string
      }
    }
    
    return value.toString();
  };

  // Group records into hierarchical structure
  const groupRecordsHierarchically = (records: any[]) => {
    console.log(`[TREE-VIEW] Grouping ${records.length} records hierarchically`);
    
    const recordTypes = Array.from(new Set(records.map(r => r.record_type)));
    console.log(`[TREE-VIEW] Record types found: ${recordTypes.join(', ')}`);
    
    const batches: Array<{
      batchHeader: any | null;
      transactions: Array<{
        dtRecord: any;
        extensions: any[];
      }>;
      trailer: any | null;
    }> = [];

    let currentBatch: any = null;
    let currentTransaction: any = null;

    for (const record of records) {
      const recordType = record.record_type;

      if (['01', 'BH', '10', '02'].includes(recordType)) {
        if (currentBatch) {
          batches.push(currentBatch);
        }
        currentBatch = {
          batchHeader: record,
          transactions: [],
          trailer: null
        };
        currentTransaction = null;
        console.log(`[TREE-VIEW] Started new batch with header record type ${recordType}`);
      }
      else if (['47', 'DT'].includes(recordType)) {
        if (!currentBatch) {
          currentBatch = {
            batchHeader: null,
            transactions: [],
            trailer: null
          };
        }
        currentTransaction = {
          dtRecord: record,
          extensions: []
        };
        currentBatch.transactions.push(currentTransaction);
        console.log(`[TREE-VIEW] Added transaction record type ${recordType} to batch`);
      }
      else if (['98', 'TR', '99'].includes(recordType)) {
        if (currentBatch) {
          currentBatch.trailer = record;
        }
      }
      else {
        if (currentTransaction) {
          currentTransaction.extensions.push(record);
          console.log(`[TREE-VIEW] Added extension record type ${recordType} to current transaction`);
        }
      }
    }

    if (currentBatch) {
      batches.push(currentBatch);
    }

    console.log(`[TREE-VIEW] Created ${batches.length} batches`);
    return batches;
  };

  // Group records by files for file-centric view
  const groupRecordsByFiles = (records: any[]) => {
    console.log(`[FILE-VIEW] Grouping ${records.length} records by filename`);
    
    const fileGroups: Record<string, any[]> = {};
    
    // Group records by filename
    for (const record of records) {
      const filename = record.filename || 'Unknown';
      if (!fileGroups[filename]) {
        fileGroups[filename] = [];
      }
      fileGroups[filename].push(record);
    }
    
    // Convert to array with file-centric structure
    const files = Object.entries(fileGroups).map(([filename, fileRecords]) => {
      console.log(`[FILE-VIEW] Processing file: ${filename} with ${fileRecords.length} records`);
      
      // Group records within this file hierarchically (batches → transactions)
      const batches = groupRecordsHierarchically(fileRecords);
      
      // Count record types within this file
      const bhRecords = fileRecords.filter(r => ['01', 'BH', '10', '02'].includes(r.record_type)).length;
      const dtRecords = fileRecords.filter(r => ['47', 'DT'].includes(r.record_type)).length;
      
      return {
        filename,
        records: fileRecords,
        batches,
        recordCounts: {
          total: fileRecords.length,
          bh: bhRecords,
          dt: dtRecords
        }
      };
    });
    
    console.log(`[FILE-VIEW] Created ${files.length} file groups`);
    return files;
  };

  // Toggle handlers
  const toggleBatchExpansion = (batchIndex: number) => {
    const batchKey = `batch-${batchIndex}`;
    setExpandedBatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(batchKey)) {
        newSet.delete(batchKey);
      } else {
        newSet.add(batchKey);
      }
      return newSet;
    });
  };

  const toggleTransactionExpansion = (batchIndex: number, transactionIndex: number) => {
    const transactionKey = `transaction-${batchIndex}-${transactionIndex}`;
    setExpandedTransactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionKey)) {
        newSet.delete(transactionKey);
      } else {
        newSet.add(transactionKey);
      }
      return newSet;
    });
  };

  // File view toggle handlers
  const toggleFileExpansion = (filename: string) => {
    setExpandedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filename)) {
        newSet.delete(filename);
      } else {
        newSet.add(filename);
      }
      return newSet;
    });
  };

  const toggleFileBatchExpansion = (filename: string, batchIndex: number) => {
    const batchKey = `${filename}-batch-${batchIndex}`;
    setExpandedFileBatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(batchKey)) {
        newSet.delete(batchKey);
      } else {
        newSet.add(batchKey);
      }
      return newSet;
    });
  };

  const toggleFileTransactionExpansion = (filename: string, batchIndex: number, transactionIndex: number) => {
    const transactionKey = `${filename}-transaction-${batchIndex}-${transactionIndex}`;
    setExpandedFileTransactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionKey)) {
        newSet.delete(transactionKey);
      } else {
        newSet.add(transactionKey);
      }
      return newSet;
    });
  };

  // Selection handlers for bulk operations
  const handleSelectRecord = (recordId: number) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(recordId)) {
      newSelected.delete(recordId);
    } else {
      newSelected.add(recordId);
    }
    setSelectedRecords(newSelected);
    
    // Update select all state
    if (newSelected.size === 0) {
      setIsSelectAllChecked(false);
    } else if (newSelected.size === records.length) {
      setIsSelectAllChecked(true);
    }
  };

  const handleSelectAll = () => {
    if (isSelectAllChecked || selectedRecords.size === records.length) {
      // Deselect all
      setSelectedRecords(new Set());
      setIsSelectAllChecked(false);
    } else {
      // Select all visible records
      const allRecordIds = new Set(records.map((record: any) => record.id) as number[]);
      setSelectedRecords(allRecordIds);
      setIsSelectAllChecked(true);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRecords.size === 0) {
      toast({
        title: "No Records Selected",
        description: "Please select records to delete.",
        variant: "destructive"
      });
      return;
    }

    try {
      const recordIds = Array.from(selectedRecords);
      await apiRequest('/api/tddf-api/records/bulk-delete', {
        method: 'DELETE',
        body: JSON.stringify({ recordIds }),
        headers: { 'Content-Type': 'application/json' }
      });

      toast({
        title: "Records Deleted",
        description: `Successfully deleted ${recordIds.length} records.`,
      });

      // Clear selection and refetch data
      setSelectedRecords(new Set());
      setIsSelectAllChecked(false);
      refetch();
    } catch (error) {
      console.error('Error deleting records:', error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete selected records. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Fetch raw data with React Query
  const { data: rawData, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/tddf-api/all-records', { 
      limit: pageSize, 
      offset: currentPage * pageSize,
      recordType: recordType === 'all' ? undefined : recordType,
      search: searchQuery || undefined,
      filename: globalFilenameFilter || undefined
    }],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (currentPage * pageSize).toString()
      });
      
      if (recordType !== 'all') {
        params.append('recordType', recordType);
      }
      
      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      if (globalFilenameFilter) {
        params.append('filename', globalFilenameFilter);
      }
      
      return await apiRequest(`/api/tddf-api/all-records?${params}`);
    },
    enabled: showRecords,
    refetchOnWindowFocus: false
  });

  const summary = (rawData as any)?.summary || {
    totalRecords: 0,
    bhRecords: 0,
    dtRecords: 0,
    totalFiles: 0
  };

  const records = (rawData as any)?.data || [];
  const totalPages = (rawData as any)?.pagination?.total ? Math.ceil((rawData as any).pagination.total / pageSize) : 0;

  const handleShowAllRecords = () => {
    setShowRecords(true);
    setCurrentPage(0);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(0);
  };

  const handleSearch = () => {
    setCurrentPage(0);
    refetch();
  };

  const formatRecordContent = (record: any) => {
    if (record.parsed_data && Object.keys(record.parsed_data).length > 0) {
      return Object.entries(record.parsed_data)
        .slice(0, 3) // Show first 3 parsed fields
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
    }
    return record.raw_data ? record.raw_data.substring(0, 100) + '...' : 'No data';
  };

  return (
    <div className="space-y-6">
      {/* Filename Filter Indicator */}
      {globalFilenameFilter && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">
              Filtered by file: <code className="bg-white px-2 py-1 rounded text-xs">{globalFilenameFilter}</code>
            </span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setGlobalFilenameFilter('')}
              className="ml-auto h-6 w-6 p-0 text-blue-600 hover:text-blue-700"
              title="Clear filename filter"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Summary Cards - Matching the design from attached image */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">BH Records</p>
                <p className="text-2xl font-bold">{summary.bhRecords.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Batch Headers</p>
              </div>
              <Database className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-600">DT Records</p>
                <p className="text-2xl font-bold">{summary.dtRecords.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Detail Transactions</p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-600">Total Records</p>
                <p className="text-2xl font-bold">{summary.totalRecords.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">All Types</p>
              </div>
              <Activity className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Raw Data Controls</CardTitle>
              <CardDescription>Configure pagination and filters for TDDF records</CardDescription>
            </div>
            {!showRecords && (
              <Button 
                onClick={handleShowAllRecords}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="button-show-all-records"
              >
                <Eye className="mr-2 h-4 w-4" />
                Show All Records
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Pagination Size */}
            <div>
              <Label>Records per page</Label>
              <Select 
                value={pageSize.toString()} 
                onValueChange={(value) => handlePageSizeChange(parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label} records
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Record Type Filter */}
            <div>
              <Label>Record Type</Label>
              <Select 
                value={recordType} 
                onValueChange={setRecordType}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="BH">BH - Batch Header</SelectItem>
                  <SelectItem value="DT">DT - Detail Transaction</SelectItem>
                  <SelectItem value="G2">G2 - Geographic Data</SelectItem>
                  <SelectItem value="P1">P1 - Processing Data</SelectItem>
                  <SelectItem value="E1">E1 - Enhanced Data</SelectItem>
                  <SelectItem value="DR">DR - Detail Record</SelectItem>
                  <SelectItem value="TR">TR - Trailer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Mode */}
            <div>
              <Label>View Mode</Label>
              <Select 
                value={viewMode} 
                onValueChange={(value: 'tree' | 'flat' | 'file') => setViewMode(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat View</SelectItem>
                  <SelectItem value="tree">Tree View</SelectItem>
                  <SelectItem value="file">File View</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div>
              <Label>Search</Label>
              <Input
                placeholder="Search raw data..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>

            {/* Search Button */}
            <div className="flex items-end">
              <Button onClick={handleSearch} variant="outline" className="w-full">
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Records Table */}
      {showRecords && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>TDDF Records ({records.length} of {(rawData as any)?.pagination?.total || 0})</CardTitle>
                <CardDescription>Raw TDDF data with parsed fields</CardDescription>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0 || isLoading}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
                    disabled={currentPage >= totalPages - 1 || isLoading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading records...
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-600">
                Error loading records: {error instanceof Error ? error.message : 'Unknown error'}
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No records found matching your criteria
              </div>
            ) : (
              <div className="space-y-2">
                {/* Bulk Operation Controls */}
                {selectedRecords.size > 0 && (
                  <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        {selectedRecords.size} record{selectedRecords.size !== 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleBulkDelete}
                        disabled={selectedRecords.size === 0}
                        data-testid="button-bulk-delete"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Delete Selected
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRecords(new Set());
                          setIsSelectAllChecked(false);
                        }}
                        data-testid="button-clear-selection"
                      >
                        Clear Selection
                      </Button>
                    </div>
                  </div>
                )}

                {/* Flat View Display */}
                {viewMode === 'flat' && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={isSelectAllChecked}
                            onCheckedChange={handleSelectAll}
                            data-testid="checkbox-select-all"
                          />
                        </TableHead>
                        <TableHead className="w-20">Type</TableHead>
                        <TableHead>Content</TableHead>
                        <TableHead className="w-40">File</TableHead>
                        <TableHead className="w-16">Line</TableHead>
                        <TableHead className="w-32">Business Day</TableHead>
                        <TableHead className="w-24">Scheduled Slot</TableHead>
                        <TableHead className="w-16">View</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {records.map((record: any) => [
                      <TableRow key={record.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRecords.has(record.id)}
                            onCheckedChange={() => handleSelectRecord(record.id)}
                            data-testid={`checkbox-record-${record.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge 
                              className={record.record_type === 'BH' ? 'bg-green-500 hover:bg-green-600 text-white' : record.record_type === 'DT' ? 'bg-blue-500 hover:bg-blue-600 text-white' : ''}
                              variant={record.record_type === 'BH' || record.record_type === 'DT' ? 'default' : 'outline'}
                            >
                              {record.record_type}
                            </Badge>
                            {/* Show card type badge for DT records */}
                            {(record.record_type === 'DT' || record.record_type === '47') && (() => {
                              const cardType = extractCardType(record);
                              
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
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <div className="truncate font-mono text-xs" title={record.raw_line || record.raw_data}>
                            {formatRecordContent(record)}
                          </div>
                        </TableCell>
                        <TableCell className="truncate text-sm" title={record.original_filename || record.filename}>
                          {record.original_filename || record.filename || 'Unknown'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{record.line_number || 'N/A'}</TableCell>
                        <TableCell className="text-sm">
                          {record.file_processing_date ? format(new Date(record.file_processing_date), 'MMM d, yyyy') : 
                           record.business_day ? format(new Date(record.business_day), 'MMM d, yyyy') : 'Unknown'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {record.scheduledSlotLabel ? (
                            <Badge variant="outline" className="text-xs">
                              {record.scheduledSlotLabel}
                            </Badge>
                          ) : (
                            <span className="text-gray-400">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
                            data-testid={`button-view-record-${record.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>,
                      expandedRecord === record.id && (
                        <TableRow key={`${record.id}-detail`}>
                          <TableCell colSpan={8} className="p-0">
                            <div className="border-t bg-muted/30 p-4">
                              <RecordDetailView record={record} />
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                      ]).flat().filter(Boolean)}
                    </TableBody>
                  </Table>
                )}

                {/* Tree View Display */}
                {viewMode === 'tree' && (
                  <TreeViewDisplay 
                    records={records}
                    expandedBatches={expandedBatches}
                    expandedTransactions={expandedTransactions}
                    onToggleBatch={toggleBatchExpansion}
                    onToggleTransaction={toggleTransactionExpansion}
                    getRecordTypeBadgeColor={getRecordTypeBadgeColor}
                    getRecordTypeName={getRecordTypeName}
                    formatFieldValue={formatFieldValue}
                    groupRecordsHierarchically={groupRecordsHierarchically}
                    getMerchantName={getMerchantName}
                  />
                )}

                {/* File View Display */}
                {viewMode === 'file' && (
                  <FileViewDisplay 
                    records={records}
                    expandedFiles={expandedFiles}
                    expandedFileBatches={expandedFileBatches}
                    expandedFileTransactions={expandedFileTransactions}
                    onToggleFile={toggleFileExpansion}
                    onToggleFileBatch={toggleFileBatchExpansion}
                    onToggleFileTransaction={toggleFileTransactionExpansion}
                    getRecordTypeBadgeColor={getRecordTypeBadgeColor}
                    getRecordTypeName={getRecordTypeName}
                    formatFieldValue={formatFieldValue}
                    groupRecordsByFiles={groupRecordsByFiles}
                    getMerchantName={getMerchantName}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

