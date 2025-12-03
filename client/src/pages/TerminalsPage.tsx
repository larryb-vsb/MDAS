import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import MainLayout from "@/components/layout/MainLayout";
import AddTerminalModal from "@/components/terminals/AddTerminalModal";
import { TerminalDetailsModal } from "@/components/terminals/TerminalDetailsModal";
import TerminalPagination from "@/components/terminals/TerminalPagination";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Filter, Download, Wifi, CreditCard, Shield, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Eye, Activity, Building, Edit, Users, X } from "lucide-react";
import { Link } from "wouter";
import { Terminal } from "@shared/schema";
import { formatTableDate } from "@/lib/date-utils";
import TddfActivityHeatMap from "@/components/tddf/TddfActivityHeatMap";
import { Skeleton } from "@/components/ui/skeleton";

export default function TerminalsPage() {
  const [activeTab, setActiveTab] = useState("directory");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [terminalTypeFilter, setTerminalTypeFilter] = useState("all");
  const [sortField, setSortField] = useState<'lastActivity' | 'lastUpdate' | 'terminalId' | 'vNumber' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedTerminals, setSelectedTerminals] = useState<number[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState<Terminal | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  
  // Sub Terminals state
  const [terminalSearchFilter, setTerminalSearchFilter] = useState('');
  const [merchantSearchFilter, setMerchantSearchFilter] = useState('');
  const [showOnlyUnmatched, setShowOnlyUnmatched] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<any>(null);
  const [isCreateMerchantDialogOpen, setIsCreateMerchantDialogOpen] = useState(false);
  const [newMerchant, setNewMerchant] = useState({ name: '', clientMID: '', status: 'Active' });
  const { toast } = useToast();

  // Fetch terminals data
  const { data: terminals = [], isLoading, error, refetch } = useQuery<Terminal[]>({
    queryKey: ["/api/terminals"],
    refetchOnWindowFocus: true,
    staleTime: 0,
    gcTime: 0,
  });
  
  // Fetch Type 3 (ACH) merchants for Sub Terminals tab
  const { data: merchantsResponse } = useQuery({
    queryKey: ['/api/merchants', { merchantType: '3', limit: 500 }],
    queryFn: async () => {
      const response = await fetch('/api/merchants?merchantType=3&limit=500', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch ACH merchants');
      return response.json();
    },
    enabled: activeTab === 'sub-terminals'
  });
  
  const achMerchants = merchantsResponse?.merchants || [];
  
  // Mutation for updating terminal-merchant relationship
  const updateTerminalMerchantMutation = useMutation({
    mutationFn: async ({ terminalId, merchantId }: { terminalId: number; merchantId: string }) => {
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
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update terminal', variant: 'destructive' });
    }
  });
  
  // Mutation for creating new merchant
  const createMerchantMutation = useMutation({
    mutationFn: async (merchantData: any) => {
      const response = await apiRequest('/api/merchants', {
        method: 'POST',
        body: merchantData
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/merchants', { merchantType: '3', limit: 500 }] });
      toast({ title: 'Success', description: 'Merchant created successfully' });
      setIsCreateMerchantDialogOpen(false);
      setNewMerchant({ name: '', clientMID: '', status: 'Active' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to create merchant', variant: 'destructive' });
    }
  });



  // Enhanced filter, sort and paginate terminals with date filtering
  const { paginatedTerminals, pagination, filteredTotal } = useMemo(() => {
    let filteredTerminals = terminals.filter((terminal) => {
      const matchesSearch = 
        terminal.vNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        terminal.dbaName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        terminal.posMerchantNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        terminal.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        terminal.terminalId?.toString().toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = statusFilter === "all" || terminal.status === statusFilter;
      const matchesType = terminalTypeFilter === "all" || terminal.terminalType === terminalTypeFilter;

      // Enhanced date filtering when heat map date is selected
      let matchesDate = true;
      if (selectedDate) {
        const terminalActivityDate = terminal.lastActivity ? 
          new Date(terminal.lastActivity).toISOString().split('T')[0] : null;
        matchesDate = terminalActivityDate === selectedDate;
      }

      return matchesSearch && matchesStatus && matchesType && matchesDate;
    });

    // Apply performance-optimized sorting
    if (sortField) {
      filteredTerminals.sort((a, b) => {
        if (sortField === 'terminalId') {
          const aValue = a.terminalId || '';
          const bValue = b.terminalId || '';
          
          // Convert to numbers if they're numeric, otherwise compare as strings
          const aNum = parseInt(aValue, 10);
          const bNum = parseInt(bValue, 10);
          
          if (!isNaN(aNum) && !isNaN(bNum)) {
            const comparison = aNum - bNum;
            return sortDirection === 'asc' ? comparison : -comparison;
          } else {
            const comparison = aValue.localeCompare(bValue);
            return sortDirection === 'asc' ? comparison : -comparison;
          }
        } else if (sortField === 'vNumber') {
          const aValue = a.vNumber || '';
          const bValue = b.vNumber || '';
          
          // VAR numbers are in format V1234567, extract numeric part for comparison
          const aNum = parseInt(aValue.replace('V', ''), 10);
          const bNum = parseInt(bValue.replace('V', ''), 10);
          
          if (!isNaN(aNum) && !isNaN(bNum)) {
            const comparison = aNum - bNum;
            return sortDirection === 'asc' ? comparison : -comparison;
          } else {
            const comparison = aValue.localeCompare(bValue);
            return sortDirection === 'asc' ? comparison : -comparison;
          }
        } else {
          let aValue: Date | null = null;
          let bValue: Date | null = null;

          if (sortField === 'lastActivity') {
            aValue = a.lastActivity ? new Date(a.lastActivity) : null;
            bValue = b.lastActivity ? new Date(b.lastActivity) : null;
          } else if (sortField === 'lastUpdate') {
            aValue = a.lastUpdate ? new Date(a.lastUpdate) : null;
            bValue = b.lastUpdate ? new Date(b.lastUpdate) : null;
          }

          // Enhanced null handling with performance optimization
          if (!aValue && !bValue) return 0;
          if (!aValue) return sortDirection === 'asc' ? 1 : -1;
          if (!bValue) return sortDirection === 'asc' ? -1 : 1;

          const comparison = aValue.getTime() - bValue.getTime();
          return sortDirection === 'asc' ? comparison : -comparison;
        }
      });
    }

    const totalItems = filteredTerminals.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedTerminals = filteredTerminals.slice(startIndex, endIndex);

    return {
      paginatedTerminals,
      pagination: {
        currentPage,
        totalPages,
        totalItems,
        itemsPerPage
      },
      filteredTotal: totalItems
    };
  }, [terminals, searchQuery, statusFilter, terminalTypeFilter, sortField, sortDirection, currentPage, itemsPerPage, selectedDate]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "Active": "default",
      "Inactive": "secondary", 
      "Maintenance": "outline",
      "Deployed": "default"
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const getTerminalTypeIcon = (type?: string | null) => {
    switch (type) {
      case "mobile": return <Wifi className="h-4 w-4" />;
      case "countertop": return <CreditCard className="h-4 w-4" />;
      case "virtual": return <Shield className="h-4 w-4" />;
      default: return <CreditCard className="h-4 w-4" />;
    }
  };

  const handleSort = (field: 'lastActivity' | 'lastUpdate' | 'terminalId' | 'vNumber') => {
    if (sortField === field) {
      // Toggle direction or clear sort
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
        setSortField(null);
        setSortDirection('desc');
      }
    } else {
      // Set new sort field
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };

  const getSortIcon = (field: 'lastActivity' | 'lastUpdate' | 'terminalId' | 'vNumber') => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const handleSelectTerminal = (terminalId: number) => {
    setSelectedTerminals(prev => 
      prev.includes(terminalId) 
        ? prev.filter(id => id !== terminalId)
        : [...prev, terminalId]
    );
  };

  const handleSelectAll = () => {
    if (selectedTerminals.length === paginatedTerminals.length) {
      setSelectedTerminals([]);
    } else {
      setSelectedTerminals(paginatedTerminals.map(t => t.id));
    }
  };

  // Simple terminal import mutation
  const simpleImportMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/terminals/simple-import", {
        method: "POST",
        body: {}
      });
    },
    onSuccess: (data: any) => {
      const message = data.imported || data.updated 
        ? `Imported ${data.imported || 0} new terminals, updated ${data.updated || 0} existing terminals`
        : `Processed ${data.totalRows || 0} rows from ${data.filename || 'file'}`;
      
      toast({
        title: "Terminal Import Complete",
        description: message,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/terminals"] });
    },
    onError: (error: any) => {
      toast({
        title: "Terminal Import Failed", 
        description: error.message || "Failed to import terminals",
        variant: "destructive",
      });
    },
  });

  // Delete selected terminals mutation
  const deleteMutation = useMutation({
    mutationFn: async (terminalIds: number[]) => {
      const response = await apiRequest('/api/terminals', { 
        method: 'DELETE', 
        body: { terminalIds } 
      });
      return response;
    },
    onSuccess: () => {
      toast({
        title: "Terminals deleted",
        description: `Successfully deleted ${selectedTerminals.length} terminal${selectedTerminals.length > 1 ? 's' : ''}`,
      });
      setSelectedTerminals([]);
      queryClient.invalidateQueries({ queryKey: ["/api/terminals"] });
    },
    onError: (error) => {
      console.error('Delete mutation error:', error);
      toast({
        title: "Error",
        description: `Failed to delete terminals: ${error}`,
        variant: "destructive",
      });
    },
  });

  const handleDeleteSelected = () => {
    if (selectedTerminals.length === 0) return;
    deleteMutation.mutate(selectedTerminals);
  };

  // Sync Last Activity mutation
  const syncLastActivityMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/terminals/sync-last-activity", {
        method: "POST",
        body: {}
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Last Activity Sync Complete",
        description: `Updated ${data.terminalsUpdated || 0} terminals with activity from TDDF data`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/terminals"] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed", 
        description: error.message || "Failed to sync terminal activity",
        variant: "destructive",
      });
    },
  });

  if (error) {
    return (
      <MainLayout>
        <div className="p-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">Error Loading Terminals</CardTitle>
            </CardHeader>
            <CardContent>
              <p>Unable to load terminal data. Please try again later.</p>
            </CardContent>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Payment Terminals
            </h1>
            <p className="text-muted-foreground">
              Manage payment terminals and their configurations
            </p>
          </div>
          <div className="flex gap-2">
            {selectedTerminals.length > 0 && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleDeleteSelected}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete ({selectedTerminals.length})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => syncLastActivityMutation.mutate()}
              disabled={syncLastActivityMutation.isPending}
              data-testid="button-sync-last-activity"
            >
              <Activity className="h-4 w-4 mr-2" />
              {syncLastActivityMutation.isPending ? 'Syncing...' : 'Sync Last Activity'}
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => simpleImportMutation.mutate()}
              disabled={simpleImportMutation.isPending}
            >
              <Download className="h-4 w-4 mr-2" />
              {simpleImportMutation.isPending ? 'Importing...' : 'Import Terminals'}
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Terminal
            </Button>
          </div>
        </div>

        {/* Tabs for Directory and Sub Terminals */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="directory" data-testid="tab-terminal-directory">
              <CreditCard className="h-4 w-4 mr-2" />
              Terminal Directory
            </TabsTrigger>
            <TabsTrigger value="sub-terminals" data-testid="tab-sub-terminals">
              <Building className="h-4 w-4 mr-2" />
              Sub Terminals
            </TabsTrigger>
          </TabsList>

          <TabsContent value="directory" className="space-y-6 mt-4">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Terminals</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{terminals.length}</div>
              <p className="text-xs text-muted-foreground">
                Across all merchants
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Terminals</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {terminals.filter(t => t.status === "Active").length}
              </div>
              <p className="text-xs text-muted-foreground">
                Currently operational
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Under Maintenance</CardTitle>
              <Wifi className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {terminals.filter(t => t.status === "Maintenance").length}
              </div>
              <p className="text-xs text-muted-foreground">
                Requiring attention
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {terminals.filter(t => t.lastUpdate && 
                  new Date(t.lastUpdate) > new Date(Date.now() - 24 * 60 * 60 * 1000)
                ).length}
              </div>
              <p className="text-xs text-muted-foreground">
                Active in last 24h
              </p>
            </CardContent>
          </Card>
        </div>



        {/* Filters */}
        <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search terminals by VAR number, DBA name, POS Merchant #, terminal number, or location..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(value) => {
              setStatusFilter(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
                <SelectItem value="Maintenance">Maintenance</SelectItem>
                <SelectItem value="Deployed">Deployed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={terminalTypeFilter} onValueChange={(value) => {
              setTerminalTypeFilter(value);
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="countertop">Countertop</SelectItem>
                <SelectItem value="mobile">Mobile</SelectItem>
                <SelectItem value="virtual">Virtual</SelectItem>
                <SelectItem value="integrated">Integrated POS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Selection Summary */}
      {selectedTerminals.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-blue-700">
                  {selectedTerminals.length} terminal{selectedTerminals.length > 1 ? 's' : ''} selected
                </span>
              </div>
              <div className="flex space-x-2">
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleDeleteSelected}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete Selected
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedTerminals([])}
                >
                  Clear Selection
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Terminals Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Terminal Directory</CardTitle>
              <CardDescription>
                {filteredTotal} terminal{filteredTotal !== 1 ? 's' : ''} found
                {selectedDate && (
                  <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-800 rounded-md text-xs">
                    Filtered by date: {selectedDate}
                  </span>
                )}
              </CardDescription>
            </div>
            
            {/* Performance indicators */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                {terminals.filter(t => t.status === "Active").length} Active
              </div>
              <div className="flex items-center gap-1">
                <CreditCard className="h-3 w-3" />
                Page {pagination.currentPage} of {pagination.totalPages}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading terminals...</p>
            </div>
          ) : pagination.totalItems === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No terminals found matching your criteria.</p>
              {selectedDate && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setSelectedDate(null)}
                >
                  Clear Date Filter
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedTerminals.length === paginatedTerminals.length && paginatedTerminals.length > 0}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all terminals"
                      />
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('vNumber')}
                    >
                      <div className="flex items-center">
                        VAR Number
                        {getSortIcon('vNumber')}
                      </div>
                    </TableHead>
                    <TableHead>Merchant DBA Name</TableHead>
                    <TableHead>POS Merchant #</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('terminalId')}
                    >
                      <div className="flex items-center">
                        Term Number
                        {getSortIcon('terminalId')}
                      </div>
                    </TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('lastActivity')}
                    >
                      <div className="flex items-center">
                        Last Activity
                        {getSortIcon('lastActivity')}
                      </div>
                    </TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('lastUpdate')}
                    >
                      <div className="flex items-center">
                        Last Update
                        {getSortIcon('lastUpdate')}
                      </div>
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedTerminals.map((terminal) => (
                    <TableRow key={terminal.id} className="hover:bg-muted/50">
                      <TableCell>
                        <Checkbox
                          checked={selectedTerminals.includes(terminal.id)}
                          onCheckedChange={() => handleSelectTerminal(terminal.id)}
                          aria-label={`Select terminal ${terminal.vNumber}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getTerminalTypeIcon(terminal.terminalType)}
                          {terminal.vNumber}
                        </div>
                      </TableCell>
                      <TableCell>{terminal.dbaName || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {terminal.posMerchantNumber || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-medium text-blue-600">
                        {terminal.terminalId || "-"}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(terminal.status || "Unknown")}
                      </TableCell>
                      <TableCell>
                        {formatTableDate(terminal.lastActivity?.toString() || null)}
                      </TableCell>
                      <TableCell>
                        {formatTableDate(terminal.lastUpdate?.toString() || null)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link to={`/terminals/${terminal.id}`}>
                            <Button variant="outline" size="sm">
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                          </Link>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => setSelectedTerminal(terminal)}
                          >
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        
            {/* Pagination */}
            {pagination.totalItems > 0 && (
              <TerminalPagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                itemsPerPage={pagination.itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
              />
            )}
            </Card>
          </TabsContent>

          {/* Sub Terminals Tab */}
          <TabsContent value="sub-terminals" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Sub Terminals Management
                </CardTitle>
                <CardDescription>
                  Terminal-merchant relationship management with manual assignment and merchant creation capabilities
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
                    <div className="text-2xl font-bold text-purple-600">{achMerchants.length}</div>
                    <div className="text-sm text-purple-700">ACH Merchants</div>
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
                        data-testid="input-terminal-search"
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
                        data-testid="input-merchant-search"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={showOnlyUnmatched}
                        onCheckedChange={(checked) => setShowOnlyUnmatched(checked === true)}
                        data-testid="checkbox-unmatched-only"
                      />
                      <Label>Show only unmatched terminals</Label>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Dialog open={isCreateMerchantDialogOpen} onOpenChange={setIsCreateMerchantDialogOpen}>
                      <DialogTrigger asChild>
                        <Button className="flex items-center gap-2" data-testid="button-create-merchant">
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
                              data-testid="input-new-merchant-name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="client-mid">Client MID</Label>
                            <Input
                              id="client-mid"
                              value={newMerchant.clientMID}
                              onChange={(e) => setNewMerchant({ ...newMerchant, clientMID: e.target.value })}
                              placeholder="Enter client MID"
                              data-testid="input-new-merchant-mid"
                            />
                          </div>
                          <div>
                            <Label htmlFor="status">Status</Label>
                            <Select value={newMerchant.status} onValueChange={(value) => setNewMerchant({ ...newMerchant, status: value })}>
                              <SelectTrigger data-testid="select-new-merchant-status">
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
                                ...newMerchant,
                                merchantType: 'ACH'
                              })}
                              disabled={createMerchantMutation.isPending || !newMerchant.name}
                              data-testid="button-submit-new-merchant"
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
                        <TableHead>Merchant DBA Name</TableHead>
                        <TableHead>POS Merchant #</TableHead>
                        <TableHead>Sub Merchant Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {terminals
                        .filter((terminal: any) => {
                          const matchesTerminalSearch = !terminalSearchFilter || 
                            terminal.terminalId?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                            terminal.dbaName?.toLowerCase().includes(terminalSearchFilter.toLowerCase()) ||
                            terminal.posMerchantNumber?.toLowerCase().includes(terminalSearchFilter.toLowerCase());
                          
                          const matchesUnmatchedFilter = !showOnlyUnmatched || 
                            (!terminal.merchantId || terminal.merchantId === 'UNKNOWN');

                          return matchesTerminalSearch && matchesUnmatchedFilter;
                        })
                        .slice(0, 50)
                        .map((terminal: any) => {
                          const currentMerchant = achMerchants.find((m: any) => m.id === terminal.merchantId);
                          const isDecommissioned = terminal.dbaName?.toLowerCase().includes('decommission') ||
                                                 terminal.dbaName?.toLowerCase().includes('decomm') ||
                                                 terminal.dbaName?.toLowerCase().includes('inactive');
                          
                          return (
                            <TableRow key={terminal.id} data-testid={`row-terminal-${terminal.id}`}>
                              <TableCell className="font-mono text-sm">{terminal.terminalId}</TableCell>
                              <TableCell>
                                <div className="max-w-[200px] truncate" title={terminal.dbaName}>
                                  {terminal.dbaName}
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
                                        data-testid={`button-edit-terminal-${terminal.id}`}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                      <DialogHeader>
                                        <DialogTitle>Assign Merchant to Terminal</DialogTitle>
                                        <DialogDescription>
                                          Select a merchant for terminal: {terminal.dbaName || terminal.terminalId}
                                        </DialogDescription>
                                      </DialogHeader>
                                      <div className="space-y-4">
                                        <div>
                                          <Label>Current Assignment</Label>
                                          <div className="p-2 bg-gray-50 border rounded flex items-center justify-between">
                                            <span>{currentMerchant ? currentMerchant.name : 'No merchant assigned'}</span>
                                            {currentMerchant && (
                                              <Button 
                                                variant="ghost" 
                                                size="sm"
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 px-2"
                                                onClick={() => {
                                                  updateTerminalMerchantMutation.mutate({
                                                    terminalId: terminal.id,
                                                    merchantId: 'CLEAR'
                                                  });
                                                }}
                                                disabled={updateTerminalMerchantMutation.isPending}
                                                data-testid="button-clear-assignment"
                                              >
                                                <X className="h-4 w-4 mr-1" />
                                                Clear
                                              </Button>
                                            )}
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
                                            <SelectTrigger data-testid="select-merchant-assignment">
                                              <SelectValue placeholder="Choose a merchant..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="UNKNOWN">Remove Assignment</SelectItem>
                                              {achMerchants
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
                          t.dbaName?.toLowerCase().includes(terminalSearchFilter.toLowerCase());
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
                        t.dbaName?.toLowerCase().includes('decommission') ||
                        t.dbaName?.toLowerCase().includes('decomm') ||
                        t.dbaName?.toLowerCase().includes('inactive')
                      ).length}
                    </div>
                    <div>
                      <span className="font-medium">ACH Merchants:</span> {achMerchants.length}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Terminal Modal */}
        <AddTerminalModal 
          open={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
        />

        {/* Terminal Details Modal */}
        <TerminalDetailsModal 
          terminal={selectedTerminal}
          open={selectedTerminal !== null}
          onClose={() => setSelectedTerminal(null)}
        />
      </div>
    </MainLayout>
  );
}