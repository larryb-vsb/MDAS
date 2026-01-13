import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Link2, Plus, Search, Trash2, Edit, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface SubMerchantTerminal {
  id: number;
  deviceName: string;
  dNumber: string;
  merchantId: string;
  terminalId: number;
  matchType?: string;
  matchScore?: number;
  fuzzyMatchDetails?: Record<string, any>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  notes?: string;
  // Joined fields
  merchant_name?: string;
  terminal_v_number?: string;
}

interface SubMerchantTerminalsProps {
  merchantId: string;
  merchantName?: string;
}

export function SubMerchantTerminals({ merchantId, merchantName }: SubMerchantTerminalsProps) {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<SubMerchantTerminal | null>(null);
  const [newTerminal, setNewTerminal] = useState({
    deviceName: '',
    dNumber: '',
    terminalId: '',
    notes: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch sub merchant terminals for this merchant
  const { data: subMerchantTerminals = [], isLoading, error } = useQuery({
    queryKey: ['sub-merchant-terminals', 'merchant', merchantId],
    queryFn: async () => {
      const response = await fetch(`/api/sub-merchant-terminals/merchant/${merchantId}`);
      if (!response.ok) throw new Error('Failed to fetch sub merchant terminals');
      const data = await response.json();
      // Ensure we always return an array
      return Array.isArray(data) ? data : [];
    }
  });

  // Fetch all terminals for dropdown
  const { data: allTerminals = [] } = useQuery({
    queryKey: ['terminals'],
    queryFn: async () => {
      const response = await fetch('/api/terminals');
      if (!response.ok) throw new Error('Failed to fetch terminals');
      return response.json();
    }
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/sub-merchant-terminals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, merchantId })
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-merchant-terminals'] });
      setIsCreateDialogOpen(false);
      setNewTerminal({ deviceName: '', dNumber: '', terminalId: '', notes: '' });
      toast({ title: 'Success', description: 'Terminal relationship created successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to create terminal relationship',
        variant: 'destructive'
      });
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest(`/sub-merchant-terminals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-merchant-terminals'] });
      setEditingTerminal(null);
      toast({ title: 'Success', description: 'Terminal relationship updated successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to update terminal relationship',
        variant: 'destructive'
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/sub-merchant-terminals/${id}`, {
      method: 'DELETE'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-merchant-terminals'] });
      toast({ title: 'Success', description: 'Terminal relationship deleted successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete terminal relationship',
        variant: 'destructive'
      });
    }
  });

  // Fuzzy matching mutation
  const fuzzyMatchMutation = useMutation({
    mutationFn: () => apiRequest(`/sub-merchant-terminals/fuzzy-match/${merchantId}`, {
      method: 'POST'
    }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ['sub-merchant-terminals'] });
      
      // Handle different response structures safely
      const matched = result?.matched || result?.matchedCount || 0;
      const suggestions = result?.suggestions || result?.suggestedMatches || [];
      const suggestionsCount = Array.isArray(suggestions) ? suggestions.length : 0;
      
      toast({ 
        title: 'Fuzzy Matching Complete', 
        description: `Found ${matched} automatic matches and ${suggestionsCount} suggestions`
      });
    },
    onError: (error: any) => {
      console.error('Fuzzy matching error:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to perform fuzzy matching',
        variant: 'destructive'
      });
    }
  });

  const handleCreate = () => {
    if (!newTerminal.deviceName || !newTerminal.terminalId) {
      toast({ 
        title: 'Validation Error', 
        description: 'Device name and terminal selection are required',
        variant: 'destructive'
      });
      return;
    }

    const selectedTerminal = allTerminals.find((t: any) => t.id === parseInt(newTerminal.terminalId));
    
    createMutation.mutate({
      deviceName: newTerminal.deviceName,
      dNumber: selectedTerminal?.v_number || newTerminal.dNumber,
      terminalId: parseInt(newTerminal.terminalId),
      notes: newTerminal.notes
    });
  };

  const handleUpdate = () => {
    if (!editingTerminal) return;
    
    updateMutation.mutate({
      id: editingTerminal.id,
      deviceName: editingTerminal.deviceName,
      notes: editingTerminal.notes
    });
  };

  const handleDelete = (id: number) => {
    if (confirm('Are you sure you want to delete this terminal relationship?')) {
      deleteMutation.mutate(id);
    }
  };

  const getMatchTypeBadge = (terminal: SubMerchantTerminal) => {
    if (!terminal.matchType) return null;
    
    const variants = {
      exact: 'default',
      fuzzy: 'secondary',
      low: 'outline'
    } as const;
    
    return (
      <Badge variant={variants[terminal.matchType as keyof typeof variants] || 'outline'}>
        {terminal.matchType} {terminal.matchScore && `(${(terminal.matchScore * 100).toFixed(0)}%)`}
      </Badge>
    );
  };

  if (isLoading) {
    return <div className="p-4">Loading terminal relationships...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive opacity-50" />
        <p className="text-destructive">Error loading terminal relationships</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Terminal Relationships
            </CardTitle>
            <CardDescription>
              Manage terminal connections for {merchantName || merchantId}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => fuzzyMatchMutation.mutate()}
              disabled={fuzzyMatchMutation.isPending}
            >
              <Zap className="h-4 w-4 mr-2" />
              {fuzzyMatchMutation.isPending ? 'Matching...' : 'Fuzzy Match'}
            </Button>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Terminal
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Terminal Relationship</DialogTitle>
                  <DialogDescription>
                    Link a terminal to this merchant account
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="deviceName" className="text-right">
                      Device Name
                    </Label>
                    <Input
                      id="deviceName"
                      value={newTerminal.deviceName}
                      onChange={(e) => setNewTerminal({ ...newTerminal, deviceName: e.target.value })}
                      className="col-span-3"
                      placeholder="Terminal device name"
                    />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="terminalId" className="text-right">
                      Terminal
                    </Label>
                    <select
                      id="terminalId"
                      value={newTerminal.terminalId}
                      onChange={(e) => setNewTerminal({ ...newTerminal, terminalId: e.target.value })}
                      className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="">Select a terminal...</option>
                      {allTerminals.map((terminal: any) => (
                        <option key={terminal.id} value={terminal.id}>
                          {terminal.v_number} - {terminal.dba_name || 'Unknown'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="notes" className="text-right">
                      Notes
                    </Label>
                    <Textarea
                      id="notes"
                      value={newTerminal.notes}
                      onChange={(e) => setNewTerminal({ ...newTerminal, notes: e.target.value })}
                      className="col-span-3"
                      placeholder="Optional notes..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" onClick={handleCreate} disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Relationship'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {subMerchantTerminals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No terminal relationships found</p>
            <p className="text-sm">Use fuzzy matching or manually add terminals</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device Name</TableHead>
                <TableHead>Terminal #</TableHead>
                <TableHead>Match Type</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subMerchantTerminals.map((terminal: SubMerchantTerminal) => (
                <TableRow key={terminal.id}>
                  <TableCell className="font-medium">
                    {terminal.deviceName}
                  </TableCell>
                  <TableCell>{terminal.dNumber}</TableCell>
                  <TableCell>{getMatchTypeBadge(terminal)}</TableCell>
                  <TableCell>
                    {new Date(terminal.createdAt).toLocaleDateString()}
                    {terminal.createdBy && (
                      <div className="text-xs text-muted-foreground">
                        by {terminal.createdBy}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {terminal.notes}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingTerminal(terminal)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(terminal.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingTerminal} onOpenChange={() => setEditingTerminal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Terminal Relationship</DialogTitle>
              <DialogDescription>
                Update the terminal relationship details
              </DialogDescription>
            </DialogHeader>
            {editingTerminal && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="editDeviceName" className="text-right">
                    Device Name
                  </Label>
                  <Input
                    id="editDeviceName"
                    value={editingTerminal.deviceName}
                    onChange={(e) => setEditingTerminal({ 
                      ...editingTerminal, 
                      deviceName: e.target.value 
                    })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="editNotes" className="text-right">
                    Notes
                  </Label>
                  <Textarea
                    id="editNotes"
                    value={editingTerminal.notes || ''}
                    onChange={(e) => setEditingTerminal({ 
                      ...editingTerminal, 
                      notes: e.target.value 
                    })}
                    className="col-span-3"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Updating...' : 'Update Relationship'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}