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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload, Database, Key, Settings, Monitor, Download, FileText, Search, Filter, Eye, Copy, Check } from "lucide-react";
import { format } from "date-fns";

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
  originalName: string;
  fileSize: number;
  fileHash: string;
  storagePath: string;
  schemaId?: number;
  status: string;
  recordCount: number;
  processedRecords: number;
  errorRecords: number;
  processingStarted?: string;
  processingCompleted?: string;
  errorDetails?: any;
  metadata?: any;
  uploadedAt: string;
  uploadedBy: string;
  schemaName?: string;
  schemaVersion?: string;
  queueStatus?: string;
  queuePriority?: number;
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

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch schemas
  const { data: schemas = [], isLoading: schemasLoading } = useQuery({
    queryKey: ["/api/tddf-api/schemas"],
    queryFn: () => apiRequest("/api/tddf-api/schemas")
  });

  // Fetch files
  const { data: files = [], isLoading: filesLoading } = useQuery({
    queryKey: ["/api/tddf-api/files"],
    queryFn: () => apiRequest("/api/tddf-api/files")
  });

  // Fetch API keys
  const { data: apiKeys = [], isLoading: keysLoading } = useQuery({
    queryKey: ["/api/tddf-api/keys"],
    queryFn: () => apiRequest("/api/tddf-api/keys")
  });

  // Fetch processing queue
  const { data: queue = [], isLoading: queueLoading } = useQuery({
    queryKey: ["/api/tddf-api/queue"],
    queryFn: () => apiRequest("/api/tddf-api/queue")
  });

  // Fetch monitoring data
  const { data: monitoring } = useQuery({
    queryKey: ["/api/tddf-api/monitoring"],
    queryFn: () => apiRequest("/api/tddf-api/monitoring")
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
      setCreatedApiKey(data.apiKey);
      setNewApiKey({ keyName: "", permissions: ["read"], rateLimitPerMinute: 100, expiresAt: "" });
      toast({ title: "API key created successfully" });
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
                  {files.reduce((sum, f) => sum + f.recordCount, 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  {files.reduce((sum, f) => sum + f.processedRecords, 0).toLocaleString()} processed
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
                        <p className="text-sm font-medium truncate">{file.originalName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.fileSize)} • {format(new Date(file.uploadedAt), "MMM d, yyyy")}
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
                          <Badge variant={schema.isActive ? "default" : "secondary"}>
                            {schema.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell>{format(new Date(schema.createdAt), "MMM d, yyyy")}</TableCell>
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
            <Dialog>
              <DialogTrigger asChild>
                <Button>
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

          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
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
                      <TableCell colSpan={8} className="text-center">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : (
                    files.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell className="font-medium max-w-xs truncate">
                          {file.originalName}
                        </TableCell>
                        <TableCell>{formatFileSize(file.fileSize)}</TableCell>
                        <TableCell>
                          {file.schemaName ? `${file.schemaName} v${file.schemaVersion}` : "None"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(file.status)}>
                            {file.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {file.recordCount > 0 ? file.recordCount.toLocaleString() : "-"}
                        </TableCell>
                        <TableCell>
                          {file.recordCount > 0 && (
                            <div className="w-20">
                              <Progress 
                                value={(file.processedRecords / file.recordCount) * 100} 
                                className="h-2"
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{format(new Date(file.uploadedAt), "MMM d, yyyy")}</TableCell>
                        <TableCell>
                          <div className="flex space-x-1">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Download className="h-4 w-4" />
                            </Button>
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
                        <TableCell>{format(new Date(item.queuedAt), "MMM d, HH:mm")}</TableCell>
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
                  {monitoring?.topEndpoints?.map((endpoint, index) => (
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