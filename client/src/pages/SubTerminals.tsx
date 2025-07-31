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
import { Building, Search, Plus, Edit, Users } from 'lucide-react';
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

  const { toast } = useToast();

  // Queries for terminals and merchants data
  const { data: terminals = [] } = useQuery({
    queryKey: ['/api/terminals'],
    queryFn: async () => {
      const response = await fetch('/api/terminals', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch terminals');
      return response.json();
    }
  });

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
          <h1 className="text-3xl font-bold">Sub Terminals Management</h1>
          <p className="text-muted-foreground">
            Comprehensive terminal-merchant relationship management with fuzzy matching and manual assignment
          </p>
        </div>
        <Link href="/mms-uploader">
          <Button variant="outline">Back to MMS Uploader</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Terminal-Merchant Relationships
          </CardTitle>
          <CardDescription>
            Manage and assign merchant relationships to terminals with comprehensive search and filtering
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
                  <TableHead>Terminal ID</TableHead>
                  <TableHead>Terminal Name</TableHead>
                  <TableHead>POS Merchant #</TableHead>
                  <TableHead>Current Merchant</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terminals
                  .filter((terminal: any) => {
                    // Apply search filters
                    const matchesTerminalSearch = !terminalSearchFilter || 
                      terminal.terminalId?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                      terminal.terminalName?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                      terminal.posMerchantNumber?.toLowerCase().includes(terminalSearchFilter.toLowerCase());
                    
                    // Apply unmatched filter
                    const matchesUnmatchedFilter = !showOnlyUnmatched || 
                      (!terminal.merchantId || terminal.merchantId === 'UNKNOWN');

                    return matchesTerminalSearch && matchesUnmatchedFilter;
                  })
                  .slice(0, 50) // Limit to 50 for performance
                  .map((terminal: any) => {
                    const currentMerchant = merchants.find((m: any) => m.id === terminal.merchantId);
                    const isDecommissioned = terminal.terminalName?.toLowerCase().includes('decommission') ||
                                           terminal.terminalName?.toLowerCase().includes('decomm') ||
                                           terminal.terminalName?.toLowerCase().includes('inactive');
                    
                    return (
                      <TableRow key={terminal.id}>
                        <TableCell className="font-mono text-sm">{terminal.terminalId}</TableCell>
                        <TableCell>
                          <div className="max-w-[200px] truncate" title={terminal.terminalName}>
                            {terminal.terminalName}
                            {isDecommissioned && (
                              <Badge variant="outline" className="ml-2 text-xs text-red-600 border-red-200">
                                Decommissioned
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{terminal.posMerchantNumber}</TableCell>
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
                          <Badge variant={isDecommissioned ? 'destructive' : 'default'}>
                            {isDecommissioned ? 'Decommissioned' : 'Active'}
                          </Badge>
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
                                    Select a merchant for terminal: {terminal.terminalName}
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
                                  <div className="text-sm text-muted-foreground">
                                    <strong>Terminal Details:</strong><br />
                                    ID: {terminal.terminalId}<br />
                                    POS Merchant #: {terminal.posMerchantNumber}<br />
                                    Status: {isDecommissioned ? 'Decommissioned' : 'Active'}
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

          {/* Summary Information */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800">Quick Stats</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium">Showing:</span> {Math.min(50, terminals.filter((t: any) => {
                  const matchesTerminalSearch = !terminalSearchFilter || 
                    t.terminalId?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                    t.terminalName?.toLowerCase().includes(terminalSearchFilter.toLowerCase());
                  const matchesUnmatchedFilter = !showOnlyUnmatched || (!t.merchantId || t.merchantId === 'UNKNOWN');
                  return matchesTerminalSearch && matchesUnmatchedFilter;
                }).length)} terminals
              </div>
              <div>
                <span className="font-medium">Match Rate:</span> {terminals.length > 0 ? 
                  Math.round((terminals.filter((t: any) => t.merchantId && t.merchantId !== 'UNKNOWN').length / terminals.length) * 100)
                : 0}%
              </div>
              <div>
                <span className="font-medium">Decommissioned:</span> {terminals.filter((t: any) => 
                  t.terminalName?.toLowerCase().includes('decommission') ||
                  t.terminalName?.toLowerCase().includes('decomm') ||
                  t.terminalName?.toLowerCase().includes('inactive')
                ).length}
              </div>
              <div>
                <span className="font-medium">Available Merchants:</span> {merchants.length}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}