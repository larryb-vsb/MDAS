import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Database, Key, Settings, Monitor, Download, FileText, Search, Filter, Eye, Copy, Check, Trash2, CheckSquare, Square } from "lucide-react";
import { format } from "date-fns";
import { RefreshCw } from "lucide-react";

interface TddfApiSchema {
  id: number;
  name: string;
  version: string;
  description: string;
  schemaData: any;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

interface TddfApiFile {
  id: number;
  filename: string;
  original_name: string;
  file_size: number;
  file_hash: string;
  storage_path: string;
  schema_id?: number;
  status: string;
  record_count: number;
  processed_records: number;
  error_records: number;
  processing_started?: string;
  processing_completed?: string;
  error_details?: any;
  metadata?: any;
  business_day?: string;
  file_date?: string;
  uploaded_at: string;
  uploaded_by: string;
  schema_name?: string;
  schema_version?: string;
  queue_status?: string;
  queue_priority?: number;
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

export default function TddfApiDataPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedSchema, setSelectedSchema] = useState<number | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
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
  
  // Date filtering state
  const [dateFilters, setDateFilters] = useState({
    dateFrom: "",
    dateTo: "",
    businessDayFrom: "",
    businessDayTo: "",
    status: ""
  });

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

  // Fetch files with filtering
  const { data: files = [], isLoading: filesLoading } = useQuery<TddfApiFile[]>({
    queryKey: ["/api/tddf-api/files", dateFilters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFilters.dateFrom) params.append('dateFrom', dateFilters.dateFrom);
      if (dateFilters.dateTo) params.append('dateTo', dateFilters.dateTo);
      if (dateFilters.businessDayFrom) params.append('businessDayFrom', dateFilters.businessDayFrom);
      if (dateFilters.businessDayTo) params.append('businessDayTo', dateFilters.businessDayTo);
      if (dateFilters.status) params.append('status', dateFilters.status);
      
      const queryString = params.toString();
      const response = await fetch(`/api/tddf-api/files${queryString ? '?' + queryString : ''}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch files');
      return response.json();
    }
  });

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

  // Fetch processing queue
  const { data: queue = [], isLoading: queueLoading } = useQuery<any[]>({
    queryKey: ["/api/tddf-api/queue"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/queue", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch queue');
      return response.json();
    }
  });

  // Fetch monitoring data
  const { data: monitoring } = useQuery<any>({
    queryKey: ["/api/tddf-api/monitoring"],
    queryFn: async () => {
      const response = await fetch("/api/tddf-api/monitoring", {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch monitoring');
      return response.json();
    }
  });

  // Create schema mutation
  const createSchemaMutation = useMutation({
    mutationFn: (schemaData: any) => apiRequest("/api/tddf-api/schemas", {
      method: "POST",
      body: JSON.stringify(schemaData)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/schemas"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/queue"] });
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/keys"] });
      setCreatedApiKey(data.key || "");
      setNewApiKey({ keyName: "", permissions: ["read"], rateLimitPerMinute: 100, expiresAt: "" });
      toast({ title: "API key created successfully" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"] });
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

  const formatFileSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed": return "default";
      case "processing": return "secondary";
      case "failed": return "destructive";
      case "queued": return "outline";
      default: return "secondary";
    }
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
      setSelectedFiles(new Set(files.map(f => f.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedFiles.size > 0) {
      deleteFilesMutation.mutate(Array.from(selectedFiles));
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">TDDF API Data System</h1>
          <p className="text-muted-foreground">
            High-performance position-based flat file processing with dynamic schema configuration
          </p>
        </div>
        <Badge variant="outline">
          {files.length} Files | {schemas.length} Schemas | {apiKeys.length} API Keys
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schemas">Schemas</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
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
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"] });
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/queue"] });
                queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/monitoring"] });
                toast({ title: "Data refreshed" });
              }}
              disabled={filesLoading || queueLoading}
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
                  {files.filter(f => f.status === "completed").length} processed
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Records</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {files.reduce((sum, f) => sum + (f.record_count || 0), 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {files.reduce((sum, f) => sum + (f.processed_records || 0), 0).toLocaleString()} processed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Processing Queue</CardTitle>
                <Monitor className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{queue.length}</div>
                <p className="text-xs text-muted-foreground">
                  {queue.filter(q => q.status === "processing").length} active
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

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Files</CardTitle>
                <CardDescription>Latest uploaded TDDF files</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {files.slice(0, 5).map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.original_name}</p>
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
                  {schemas.filter(s => s.isActive).slice(0, 5).map((schema) => (
                    <div key={schema.id} className="flex items-center justify-between p-2 border rounded">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{schema.name}</p>
                        <p className="text-xs text-muted-foreground">
                          v{schema.version} • {schema.createdBy}
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
                          <Badge variant={schema.isActive !== false ? "default" : "secondary"}>
                            {schema.isActive !== false ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {schema.createdAt ? format(new Date(schema.createdAt), "MMM d, yyyy") : "Unknown"}
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
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">File Management</h2>
            <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
              <DialogTrigger asChild>
                <Button onClick={() => setShowUploadDialog(true)}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload File
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload TDDF File</DialogTitle>
                  <DialogDescription>
                    Upload files up to 500MB for production processing
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="schema-select">Processing Schema</Label>
                    <Select value={selectedSchema?.toString()} onValueChange={(value) => setSelectedSchema(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a schema (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {schemas.map((schema) => (
                          <SelectItem key={schema.id} value={schema.id.toString()}>
                            {schema.name} v{schema.version}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="file-upload">File</Label>
                    <Input
                      id="file-upload"
                      type="file"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      accept=".tsyso,.txt,.csv,.dat"
                    />
                  </div>
                  <Button 
                    onClick={handleFileUpload}
                    disabled={!uploadFile || uploadFileMutation.isPending}
                    className="w-full"
                  >
                    {uploadFileMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Upload File
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {/* Date Filtering Controls */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Date Filters
              </CardTitle>
              <CardDescription>
                Filter files by upload date or business day extracted from filenames
              </CardDescription>
            </CardHeader>
            <CardContent>
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
              <div className="flex gap-2 mt-4">
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
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/tddf-api/files"] })}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Files ({files.length})</CardTitle>
                  <CardDescription>
                    TDDF files uploaded for processing. Business days are automatically extracted from filenames.
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={files.length > 0 && selectedFiles.size === files.length}
                        onCheckedChange={toggleAllFiles}
                        aria-label="Select all files"
                      />
                    </TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>Business Day</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Schema</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Uploaded</TableHead>
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
                    files.map((file) => (
                      <TableRow key={file.id} className={selectedFiles.has(file.id) ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selectedFiles.has(file.id)}
                            onCheckedChange={() => toggleFileSelection(file.id)}
                            aria-label={`Select ${file.original_name}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium max-w-xs truncate">
                          {file.original_name}
                        </TableCell>
                        <TableCell>
                          {file.business_day ? format(new Date(file.business_day), "MMM d, yyyy") : (
                            file.file_date ? (
                              <span className="text-muted-foreground">{file.file_date}</span>
                            ) : "-"
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
                          {file.record_count > 0 ? file.record_count.toLocaleString() : "-"}
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
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
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
                                    Are you sure you want to delete "{file.original_name}"? 
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
            </CardContent>
          </Card>
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
                    <TableHead>Attempts</TableHead>
                    <TableHead>Queued</TableHead>
                    <TableHead>Processing Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : queue.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No items in processing queue
                      </TableCell>
                    </TableRow>
                  ) : (
                    queue.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium max-w-xs truncate">
                          {item.original_name}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.priority > 75 ? "destructive" : item.priority > 50 ? "secondary" : "outline"}>
                            {item.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(item.status)}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.attempts}/{item.maxAttempts}</TableCell>
                        <TableCell>
                          {item.queuedAt ? format(new Date(item.queuedAt), "MMM d, HH:mm") : "Unknown"}
                        </TableCell>
                        <TableCell>
                          {item.processingStarted && item.processingCompleted ? (
                            `${Math.round((new Date(item.processingCompleted).getTime() - new Date(item.processingStarted).getTime()) / 1000)}s`
                          ) : item.processingStarted ? (
                            "Processing..."
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
    </div>
  );
}