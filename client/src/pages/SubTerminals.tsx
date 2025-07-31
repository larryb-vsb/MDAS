import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building, Search, Plus, Edit, Users, Database } from 'lucide-react';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { queryClient } from '@/lib/queryClient';

export default function SubTerminals() {
  // State for form handling and UI
  const [editingTerminal, setEditingTerminal] = useState<any>(null);
  const [isCreateMerchantDialogOpen, setIsCreateMerchantDialogOpen] = useState(false);
  const [newMerchant, setNewMerchant] = useState({ name: '', clientMID: '', status: 'Active' });
  const [terminalSearchFilter, setTerminalSearchFilter] = useState('');
  const [merchantSearchFilter, setMerchantSearchFilter] = useState('');
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(false);
  const [activeTab, setActiveTab] = useState('management');

  const { toast } = useToast();

  // Mutation for adding new merchant
  const addMerchantMutation = useMutation({
    mutationFn: async (merchantName: string) => {
      return apiRequest('/api/subterminals/add-merchant', {
        method: 'POST',
        body: { merchantName, sourceType: 'subterminal_import' }
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Merchant Added Successfully",
        description: `Created merchant: ${data.merchant.name} (ID: ${data.merchant.client_mid})`,
      });
      // Refresh the data to get updated merchant matches
      queryClient.invalidateQueries({ queryKey: ['/api/subterminals/raw-data'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Merchant",
        description: error.message || "An error occurred while creating the merchant",
        variant: "destructive",
      });
    }
  });

  // Fetch SubTerminal raw data from encoded xlsx file
  const { data: subTerminalResponse } = useQuery({
    queryKey: ['/api/subterminals/raw-data'],
    queryFn: async () => {
      const response = await fetch('/api/subterminals/raw-data', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch SubTerminal raw data');
      return response.json();
    }
  });

  const terminals = subTerminalResponse?.data || [];
  const totalCount = subTerminalResponse?.totalCount || 0;
  const sourceFile = subTerminalResponse?.sourceFile || 'Unknown';
  const uploadDate = subTerminalResponse?.uploadDate || 'Unknown';
  const terminalMatches = subTerminalResponse?.terminalMatches || 0;
  const merchantRecords = subTerminalResponse?.merchantRecords || 0;
  
  // Count matched terminals and merchants
  const matchedCount = terminals.filter((t: any) => t.vNumber).length;
  const merchantMatchedCount = terminals.filter((t: any) => t.merchantMatches && t.merchantMatches.length > 0).length;

  const { data: merchantsResponse } = useQuery({
    queryKey: ['/api/merchants'],
    queryFn: async () => {
      const response = await fetch('/api/merchants', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch merchants');
      return response.json();
    }
  });

  const merchants = merchantsResponse?.merchants || [];

  // Mutations for terminal-merchant management
  const createMerchantMutation = useMutation({
    mutationFn: async (merchantData: any) => {
      const response = await apiRequest('/api/merchants', {
        method: 'POST',
        body: merchantData
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merchants'] });
      toast({ title: 'Success', description: 'Merchant created successfully' });
      setIsCreateMerchantDialogOpen(false);
      setNewMerchant({ name: '', clientMID: '', status: 'Active' });
    }
  });

  const updateTerminalMerchantMutation = useMutation({
    mutationFn: async ({ terminalId, merchantId }: { terminalId: string; merchantId: string }) => {
      const response = await apiRequest(`/api/terminals/${terminalId}/merchant`, {
        method: 'PATCH',
        body: { merchantId }
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/terminals'] });
      toast({ title: 'Success', description: 'Terminal-merchant relationship updated' });
      setEditingTerminal(null);
    }
  });

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sub Terminals - Raw Import Data</h1>
          <p className="text-muted-foreground">
            Raw SubTerminal import data from "{sourceFile}" showing {totalCount} SubTerminals with complete device information
          </p>
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Data Source:</strong> {sourceFile} | <strong>Upload Date:</strong> {new Date(uploadDate).toLocaleDateString('en-US', { timeZone: 'America/Chicago' })} CST
            </p>
            <p className="text-sm text-blue-800 mt-1">
              <strong>Field Structure:</strong> Row# = File row number | DeviceName = Full device name | D_Number = Extracted terminal number | Merchant_name_d = Decoded merchant name | Status_d = Decoded status with color coding | VNumber = Matching VNumber from dev_terminals | Merchant Match = Fuzzy matched merchants from dev_merchants or Add button | Import Info = Source file and date
            </p>
          </div>
        </div>
        <Link href="/mms-uploader">
          <Button variant="outline">Back to MMS Uploader</Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="management" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Terminal Management
          </TabsTrigger>
          <TabsTrigger value="subtermimport" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            SubTermImport
          </TabsTrigger>
        </TabsList>

        <TabsContent value="management" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Raw SubTerminal Import Data
              </CardTitle>
              <CardDescription>
                Complete raw data from SubTerminal imports showing ID, Device name (with merchant name and status), and Terminal Number (D_Number)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
          {/* Statistics Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-2xl font-bold text-blue-600">{terminals.length}</div>
              <div className="text-sm text-blue-700">Total Terminals</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="text-2xl font-bold text-green-600">
                {terminals.filter((t: any) => t.merchantId && t.merchantId !== 'UNKNOWN').length}
              </div>
              <div className="text-sm text-green-700">Matched</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="text-2xl font-bold text-orange-600">
                {terminals.filter((t: any) => !t.merchantId || t.merchantId === 'UNKNOWN').length}
              </div>
              <div className="text-sm text-orange-700">Unmatched</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="text-2xl font-bold text-purple-600">{merchants.length}</div>
              <div className="text-sm text-purple-700">Total Merchants</div>
            </div>
          </div>

          {/* Search and Filter Controls */}
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                <Label>Terminal Search:</Label>
                <Input
                  type="text"
                  placeholder="Search terminals..."
                  value={terminalSearchFilter}
                  onChange={(e) => setTerminalSearchFilter(e.target.value)}
                  className="w-48"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Label>Merchant Search:</Label>
                <Input
                  type="text"
                  placeholder="Search merchants..."
                  value={merchantSearchFilter}
                  onChange={(e) => setMerchantSearchFilter(e.target.value)}
                  className="w-48"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={showOnlyUnmatched}
                  onCheckedChange={(checked) => setShowOnlyUnmatched(checked === true)}
                />
                <Label>Show only unmatched terminals</Label>
              </div>
            </div>

            <div className="flex gap-2">
              <Dialog open={isCreateMerchantDialogOpen} onOpenChange={setIsCreateMerchantDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Create Merchant
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Merchant</DialogTitle>
                    <DialogDescription>
                      Add a new merchant to enable terminal matching
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="merchant-name">Merchant Name</Label>
                      <Input
                        id="merchant-name"
                        value={newMerchant.name}
                        onChange={(e) => setNewMerchant({ ...newMerchant, name: e.target.value })}
                        placeholder="Enter merchant name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="client-mid">Client MID</Label>
                      <Input
                        id="client-mid"
                        value={newMerchant.clientMID}
                        onChange={(e) => setNewMerchant({ ...newMerchant, clientMID: e.target.value })}
                        placeholder="Enter client MID"
                      />
                    </div>
                    <div>
                      <Label htmlFor="status">Status</Label>
                      <Select value={newMerchant.status} onValueChange={(value) => setNewMerchant({ ...newMerchant, status: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsCreateMerchantDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={() => createMerchantMutation.mutate({
                          id: `merchant_${Date.now()}`,
                          ...newMerchant
                        })}
                        disabled={createMerchantMutation.isPending || !newMerchant.name}
                      >
                        {createMerchantMutation.isPending ? 'Creating...' : 'Create Merchant'}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Terminals Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Device Name</TableHead>
                  <TableHead>D_Number</TableHead>
                  <TableHead>DeviceMerchant</TableHead>
                  <TableHead>Device Status</TableHead>
                  <TableHead>V_Number</TableHead>
                  <TableHead>Generic Field 1</TableHead>
                  <TableHead>Current Assignment</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terminals
                  .filter((terminal: any) => {
                    // Apply search filters
                    const matchesTerminalSearch = !terminalSearchFilter || 
                      terminal.v_number?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                      terminal.dba_name?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                      terminal.pos_merchant_number?.toLowerCase().includes(terminalSearchFilter.toLowerCase());
                    
                    // Apply unmatched filter
                    const matchesUnmatchedFilter = !showOnlyUnmatched || 
                      (!terminal.merchantId || terminal.merchantId === 'UNKNOWN');

                    return matchesTerminalSearch && matchesUnmatchedFilter;
                  })
                  .slice(0, 50) // Limit to 50 for performance
                  .map((terminal: any) => {
                    const currentMerchant = merchants.find((m: any) => m.id === terminal.merchantId);
                    
                    // Extract Device Status from brackets in Device Name
                    const deviceStatusMatch = terminal.dba_name?.match(/\(([^)]+)\)/);
                    const deviceStatus = deviceStatusMatch ? deviceStatusMatch[1] : 'ACTIVE';
                    const isDecommissioned = deviceStatus.toLowerCase().includes('decommission') ||
                                           deviceStatus.toLowerCase().includes('decomm') ||
                                           deviceStatus.toLowerCase().includes('inactive');
                    
                    // Extract DeviceMerchant by removing status and D number
                    let deviceMerchant = terminal.dba_name || '';
                    // Remove status in brackets
                    deviceMerchant = deviceMerchant.replace(/\s*\([^)]+\)\s*/g, '');
                    // Remove D#### patterns
                    deviceMerchant = deviceMerchant.replace(/\s*D\d+\s*/g, '');
                    // Clean up extra spaces
                    deviceMerchant = deviceMerchant.trim().replace(/\s+/g, ' ');
                    
                    // Extract D_Number from Device Name
                    const dNumberMatch = terminal.dba_name?.match(/D(\d+)/);
                    const dNumber = dNumberMatch ? dNumberMatch[0] : 'N/A';
                    
                    return (
                      <TableRow key={terminal.id}>
                        <TableCell className="font-mono text-sm font-bold text-blue-600">{terminal.id}</TableCell>
                        <TableCell>
                          <div className="max-w-[200px]" title={terminal.dba_name}>
                            <div className="text-xs font-medium">{terminal.dba_name}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm font-bold text-purple-600">{dNumber}</TableCell>
                        <TableCell>
                          <div className="max-w-[150px]" title={deviceMerchant}>
                            <div className="text-sm font-medium text-green-700">{deviceMerchant || 'N/A'}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={isDecommissioned ? 'destructive' : 'default'} className="text-xs">
                            {deviceStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm font-bold text-green-600">{terminal.v_number}</TableCell>
                        <TableCell className="font-mono text-sm text-orange-600">{terminal.generic_field_1 || 'N/A'}</TableCell>
                        <TableCell>
                          {currentMerchant ? (
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-green-600 border-green-200">
                                {currentMerchant.name}
                              </Badge>
                              {currentMerchant.clientMID && (
                                <span className="text-xs text-muted-foreground">
                                  ({currentMerchant.clientMID})
                                </span>
                              )}
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-orange-600 border-orange-200">
                              Unmatched
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Dialog open={editingTerminal?.id === terminal.id} onOpenChange={(open) => {
                              if (!open) setEditingTerminal(null);
                            }}>
                              <DialogTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => setEditingTerminal(terminal)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Assign Merchant to Terminal</DialogTitle>
                                  <DialogDescription>
                                    Select a merchant for terminal: {terminal.dba_name}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div>
                                    <Label>Current Assignment</Label>
                                    <div className="p-2 bg-gray-50 border rounded">
                                      {currentMerchant ? currentMerchant.name : 'No merchant assigned'}
                                    </div>
                                  </div>
                                  <div>
                                    <Label>Select New Merchant</Label>
                                    <Select onValueChange={(merchantId) => {
                                      updateTerminalMerchantMutation.mutate({
                                        terminalId: terminal.id,
                                        merchantId
                                      });
                                    }}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Choose a merchant..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="UNKNOWN">Remove Assignment</SelectItem>
                                        {merchants
                                          .filter((m: any) => merchantSearchFilter === '' || 
                                            m.name.toLowerCase().includes(merchantSearchFilter.toLowerCase()) ||
                                            m.clientMID?.toLowerCase().includes(merchantSearchFilter.toLowerCase())
                                          )
                                          .map((merchant: any) => (
                                            <SelectItem key={merchant.id} value={merchant.id}>
                                              {merchant.name} {merchant.clientMID && `(${merchant.clientMID})`}
                                            </SelectItem>
                                          ))
                                        }
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="text-sm text-muted-foreground bg-gray-50 p-3 rounded border">
                                    <strong>Raw SubTerminal Import Data:</strong><br />
                                    <div className="space-y-1 mt-2">
                                      <div><strong>ID:</strong> {terminal.id} (Unique identifier)</div>
                                      <div><strong>Device Name:</strong> {terminal.dba_name} (Raw field)</div>
                                      <div><strong>D_Number:</strong> {dNumber} (Extracted from Device Name)</div>
                                      <div><strong>DeviceMerchant:</strong> {deviceMerchant || 'N/A'} (Cleaned merchant name)</div>
                                      <div><strong>Device Status:</strong> {deviceStatus} (From brackets in Device Name)</div>
                                      <div><strong>V_Number:</strong> {terminal.v_number} (Terminal identifier)</div>
                                      <div><strong>Generic Field 1:</strong> {terminal.generic_field_1 || 'N/A'} (Terminal Number mapping)</div>
                                      <div><strong>POS Merchant #:</strong> {terminal.pos_merchant_number}</div>
                                    </div>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                            
                            <Link href={`/merchants/create-from-terminal/${terminal.id}`}>
                              <Button variant="outline" size="sm" title="Create merchant from this terminal">
                                <Plus className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </div>

          {/* Raw Data Summary Information */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800">Raw SubTerminal Import Statistics</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="font-medium">Total Records:</span> {terminals.length}
                <div className="text-xs text-muted-foreground">All SubTerminal imports</div>
              </div>
              <div>
                <span className="font-medium">Showing:</span> {Math.min(50, terminals.filter((t: any) => {
                  const matchesTerminalSearch = !terminalSearchFilter || 
                    t.v_number?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                    t.dba_name?.toLowerCase().includes(terminalSearchFilter.toLowerCase());
                  const matchesUnmatchedFilter = !showOnlyUnmatched || (!t.merchantId || t.merchantId === 'UNKNOWN');
                  return matchesTerminalSearch && matchesUnmatchedFilter;
                }).length)}
                <div className="text-xs text-muted-foreground">Filtered results</div>
              </div>
              <div>
                <span className="font-medium">Decommissioned:</span> {terminals.filter((t: any) => 
                  t.dba_name?.toLowerCase().includes('decommission') ||
                  t.dba_name?.toLowerCase().includes('decomm') ||
                  t.dba_name?.toLowerCase().includes('inactive')
                ).length}
                <div className="text-xs text-muted-foreground">Status indicators</div>
              </div>
              <div>
                <span className="font-medium">Primary Merchant:</span> VerifyVend
                <div className="text-xs text-muted-foreground">All terminals tied</div>
              </div>
              <div>
                <span className="font-medium">ACH Merchants:</span> {merchants.length}
                <div className="text-xs text-muted-foreground">Need fuzzy matching</div>
              </div>
            </div>
          </div>

          {/* Raw Data Structure Information */}
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Building className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-800">Enhanced Data Structure with Parsed Fields</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <strong>ID Field:</strong>
                <div className="text-xs text-muted-foreground">Unique record identifier from SubTerminal import</div>
              </div>
              <div>
                <strong>Device Name (Raw):</strong>
                <div className="text-xs text-muted-foreground">Original field: merchant name + status + D#### format</div>
              </div>
              <div>
                <strong>D_Number (Extracted):</strong>
                <div className="text-xs text-muted-foreground">D#### pattern extracted from Device Name</div>
              </div>
              <div>
                <strong>DeviceMerchant (Parsed):</strong>
                <div className="text-xs text-muted-foreground">Clean merchant name (status and D number removed)</div>
              </div>
              <div>
                <strong>Device Status (Parsed):</strong>
                <div className="text-xs text-muted-foreground">Status from brackets: (DECOMMISSIONED), etc.</div>
              </div>
              <div>
                <strong>V_Number:</strong>
                <div className="text-xs text-muted-foreground">Terminal identifier for cross-reference</div>
              </div>
              <div>
                <strong>Generic Field 1:</strong>
                <div className="text-xs text-muted-foreground">Maps to terminalnumber (needs renaming)</div>
              </div>
              <div>
                <strong>Current Assignment:</strong>
                <div className="text-xs text-muted-foreground">Merchant relationship management</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="subtermimport" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                SubTermImport - Raw Data Only
              </CardTitle>
              <CardDescription>
                Complete raw SubTerminal import data with only essential fields: Id, DeviceName, and D_Number. Showing all {terminals.length} SubTerminals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Simple raw data table */}
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row#</TableHead>
                      <TableHead>DeviceName</TableHead>
                      <TableHead>D_Number</TableHead>
                      <TableHead>Merchant_name_d</TableHead>
                      <TableHead>Status_d</TableHead>
                      <TableHead>VNumber</TableHead>
                      <TableHead>Merchant Match</TableHead>
                      <TableHead>Import Info</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {terminals.map((terminal: any) => (
                      <TableRow key={terminal.id}>
                        <TableCell className="font-mono text-sm font-bold text-blue-600">{terminal.rowNumber}</TableCell>
                        <TableCell>
                          <div className="max-w-[400px]" title={terminal.deviceName}>
                            <div className="text-sm">{terminal.deviceName}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm font-bold text-blue-600">{terminal.dNumber}</TableCell>
                        <TableCell className="text-sm font-medium text-gray-700">
                          {terminal.deviceMerchant}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            terminal.deviceStatus === 'DECOMMISSIONED' ? 'bg-red-100 text-red-700' :
                            terminal.deviceStatus === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                            terminal.deviceStatus === 'INACTIVE' ? 'bg-gray-100 text-gray-700' :
                            'bg-orange-100 text-orange-700'
                          }`}>
                            {terminal.deviceStatus}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {terminal.vNumber ? (
                            <span className="text-green-600 font-bold">{terminal.vNumber}</span>
                          ) : (
                            <span className="text-gray-400">No Match</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {terminal.merchantMatches && terminal.merchantMatches.length > 0 ? (
                            <div className="space-y-1">
                              {terminal.merchantMatches.slice(0, 2).map((match: any, idx: number) => (
                                <div key={match.id} className={`text-xs px-2 py-1 rounded ${
                                  idx === 0 && terminal.hasExactMerchantMatch 
                                    ? 'bg-green-100 text-green-700 font-medium' 
                                    : 'bg-blue-100 text-blue-700'
                                }`}>
                                  <div className="font-medium">{match.name}</div>
                                  {match.client_mid && (
                                    <div className="text-xs opacity-75">ID: {match.client_mid}</div>
                                  )}
                                </div>
                              ))}
                              {terminal.merchantMatches.length > 2 && (
                                <div className="text-xs text-gray-500">+{terminal.merchantMatches.length - 2} more</div>
                              )}
                            </div>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-xs h-7"
                              disabled={addMerchantMutation.isPending}
                              onClick={() => {
                                addMerchantMutation.mutate(terminal.deviceMerchant);
                              }}
                            >
                              {addMerchantMutation.isPending ? 'Adding...' : '+ Add Merchant'}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
                          <div className="space-y-1">
                            <div className="font-medium truncate max-w-[120px]" title={terminal.importFileName}>
                              {terminal.importFileName}
                            </div>
                            <div className="text-gray-500">
                              {new Date(terminal.importDate).toLocaleDateString('en-US', { 
                                timeZone: 'America/Chicago',
                                month: 'short',
                                day: 'numeric',
                                year: '2-digit'
                              })}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Summary footer */}
              <div className="mt-4 p-3 bg-gray-50 border rounded-lg text-sm text-muted-foreground">
                <strong>Total SubTerminals:</strong> {totalCount} ({terminals.length} displayed) | <strong>Terminal Matches:</strong> {matchedCount} VNumbers found | <strong>Merchant Matches:</strong> {merchantMatchedCount} found from {merchantRecords} records | <strong>Source:</strong> {sourceFile}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}