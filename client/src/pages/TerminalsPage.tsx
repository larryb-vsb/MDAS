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
import { Search, Plus, Filter, Download, Wifi, CreditCard, Shield, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Eye, Activity } from "lucide-react";
import { Link } from "wouter";
import { Terminal } from "@shared/schema";
import { formatTableDate } from "@/lib/date-utils";
import TddfActivityHeatMap from "@/components/tddf/TddfActivityHeatMap";
import { Skeleton } from "@/components/ui/skeleton";

export default function TerminalsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [terminalTypeFilter, setTerminalTypeFilter] = useState("all");
  const [sortField, setSortField] = useState<'lastActivity' | 'lastUpdate' | 'termNumber' | 'vNumber' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedTerminals, setSelectedTerminals] = useState<number[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState<Terminal | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Fetch terminals data
  const { data: terminals = [], isLoading, error, refetch } = useQuery<Terminal[]>({
    queryKey: ["/api/terminals"],
    refetchOnWindowFocus: true, // Refetch when window gains focus
    staleTime: 0, // Always consider data stale to ensure fresh fetches
    gcTime: 0, // Don't cache data in garbage collection
  });



  // Enhanced filter, sort and paginate terminals with date filtering
  const { paginatedTerminals, pagination, filteredTotal } = useMemo(() => {
    let filteredTerminals = terminals.filter((terminal) => {
      const matchesSearch = 
        terminal.vNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        terminal.dbaName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        terminal.posMerchantNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        terminal.location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        terminal.termNumber?.toString().toLowerCase().includes(searchQuery.toLowerCase());

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
        if (sortField === 'termNumber') {
          const aValue = a.termNumber || '';
          const bValue = b.termNumber || '';
          
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

  const handleSort = (field: 'lastActivity' | 'lastUpdate' | 'termNumber' | 'vNumber') => {
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

  const getSortIcon = (field: 'lastActivity' | 'lastUpdate' | 'termNumber' | 'vNumber') => {
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

  const { toast } = useToast();

  // Simple terminal import mutation
  const simpleImportMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/terminals/simple-import", {
        method: "POST",
        body: {}
      });
    },
    onSuccess: (data) => {
      toast({
        title: "Terminal Import Complete",
        description: "Successfully imported terminals",
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
                    <TableHead>DBA Name</TableHead>
                    <TableHead>POS Merchant #</TableHead>
                    <TableHead 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort('termNumber')}
                    >
                      <div className="flex items-center">
                        Term Number
                        {getSortIcon('termNumber')}
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
                        {terminal.termNumber || "-"}
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