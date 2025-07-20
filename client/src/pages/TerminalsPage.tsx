import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import AddTerminalModal from "@/components/terminals/AddTerminalModal";
import { TerminalDetailsModal } from "@/components/terminals/TerminalDetailsModal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus, Filter, Download, Wifi, CreditCard, Shield, RefreshCw } from "lucide-react";
import { Terminal } from "@shared/schema";

export default function TerminalsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [terminalTypeFilter, setTerminalTypeFilter] = useState("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState<Terminal | null>(null);

  // Fetch terminals data
  const { data: terminals = [], isLoading, error, refetch } = useQuery<Terminal[]>({
    queryKey: ["/api/terminals"],
  });

  // Filter terminals based on search and filters
  const filteredTerminals = terminals.filter((terminal) => {
    const matchesSearch = 
      terminal.vNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      terminal.dbaName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      terminal.masterMID?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      terminal.location?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || terminal.status === statusFilter;
    const matchesType = terminalTypeFilter === "all" || terminal.terminalType === terminalTypeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

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
          <h1 className="text-3xl font-bold tracking-tight">Payment Terminals</h1>
          <p className="text-muted-foreground">
            Manage payment terminals and their configurations
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              {terminals.filter(t => t.lastActivity && 
                new Date(t.lastActivity) > new Date(Date.now() - 24 * 60 * 60 * 1000)
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
                  placeholder="Search terminals by VAR number, DBA name, Master MID, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
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
            <Select value={terminalTypeFilter} onValueChange={setTerminalTypeFilter}>
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

      {/* Terminals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Terminal Directory</CardTitle>
          <CardDescription>
            {filteredTerminals.length} terminal{filteredTerminals.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">Loading terminals...</p>
            </div>
          ) : filteredTerminals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No terminals found matching your criteria.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>VAR Number</TableHead>
                    <TableHead>DBA Name</TableHead>
                    <TableHead>Master MID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTerminals.map((terminal) => (
                    <TableRow key={terminal.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getTerminalTypeIcon(terminal.terminalType)}
                          {terminal.vNumber}
                        </div>
                      </TableCell>
                      <TableCell>{terminal.dbaName || "-"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {terminal.masterMID || "-"}
                      </TableCell>
                      <TableCell>
                        {terminal.terminalType ? (
                          <Badge variant="outline">
                            {terminal.terminalType}
                          </Badge>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(terminal.status || "Unknown")}
                      </TableCell>
                      <TableCell>{terminal.location || "-"}</TableCell>
                      <TableCell>
                        {terminal.lastActivity ? 
                          new Date(terminal.lastActivity).toLocaleDateString() 
                          : "-"
                        }
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedTerminal(terminal)}
                        >
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>

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
    </MainLayout>
  );
}