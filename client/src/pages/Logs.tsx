import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import MainLayout from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/common/Pagination";
import PageHeader from "@/components/common/PageHeader";
import TestSystemLogs from "@/components/logs/TestSystemLogs";
import { Badge } from "@/components/ui/badge";
import { FormField, FormItem, FormLabel } from "@/components/ui/form";
import { 
  Search, Download, AlertCircle, ShieldAlert, DatabaseIcon, 
  RefreshCw, Filter, Clock, UserIcon, FileSpreadsheet 
} from "lucide-react";
import { format } from "date-fns";

type LogType = "all" | "audit" | "system" | "security" | "application";

interface LogEntry {
  id: number;
  timestamp: Date;
  username: string;
  entityType?: string;
  entityId?: string;
  action: string;
  notes?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface LogsPageParams {
  page?: number;
  limit?: number;
  entityType?: string;
  entityId?: string;
  action?: string;
  username?: string;
  startDate?: string;
  endDate?: string;
  logType: LogType;
}

export default function Logs() {
  const [activeTab, setActiveTab] = useState<LogType>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    entityType: "",
    entityId: "",
    action: "",
    username: "",
    startDate: "",
    endDate: ""
  });
  const [sortBy, setSortBy] = useState("timestamp");
  const [sortOrder, setSortOrder] = useState("desc");
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Create query parameters
  const createQueryParams = (logType: LogType): LogsPageParams => {
    return {
      page: currentPage,
      limit: 10,
      ...(filters.entityType && { entityType: filters.entityType }),
      ...(filters.entityId && { entityId: filters.entityId }),
      ...(filters.action && { action: filters.action }),
      ...(filters.username && { username: filters.username }),
      ...(filters.startDate && { startDate: filters.startDate }),
      ...(filters.endDate && { endDate: filters.endDate }),
      logType
    };
  };

  // Query for logs based on active tab
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['/api/logs', activeTab, currentPage, filters, sortBy, sortOrder],
    queryFn: async () => {
      // Add a specific type parameter for system and security logs
      const params = new URLSearchParams({
        ...createQueryParams(activeTab),
        type: activeTab,
        logType: activeTab,
        sortBy: sortBy,
        sortOrder: sortOrder
      } as any);
      
      console.log(`Fetching ${activeTab} logs with params:`, params.toString());
      const res = await fetch(`/api/logs?${params.toString()}`);
      
      if (!res.ok) {
        throw new Error('Failed to fetch logs');
      }
      
      const responseData = await res.json();
      console.log(`Fetched ${activeTab} logs:`, responseData);
      return responseData;
    },
    enabled: true,
  });

  // Make sure we have consistent log data format
  let logs: LogEntry[] = [];
  
  if (data?.logs) {
    logs = data.logs.map((log: any) => {
      // Transform system logs to match LogEntry format
      if (activeTab === "system" && log.level) {
        return {
          id: log.id,
          timestamp: log.timestamp,
          username: log.source || "system",
          action: log.level || "info",
          notes: log.message + (log.details ? ` - ${JSON.stringify(log.details)}` : ""),
          ipAddress: log.hostname || undefined
        };
      } 
      // Transform security logs to match LogEntry format
      else if (activeTab === "security" && log.eventType) {
        return {
          id: log.id,
          timestamp: log.timestamp,
          username: log.username || "anonymous",
          action: `${log.eventType}:${log.action || "access"}`,
          notes: log.notes || "",
          ipAddress: log.ipAddress || undefined
        };
      }
      // Use audit logs as is
      return log;
    });
  }
  
  const pagination = data?.pagination || { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: 10 };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleExport = () => {
    // Export logs to CSV
    window.open(`/api/logs/export?${new URLSearchParams({
      ...createQueryParams(activeTab),
      logType: activeTab
    } as any).toString()}`, '_blank');
  };

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilters({
      entityType: "",
      entityId: "",
      action: "",
      username: "",
      startDate: "",
      endDate: ""
    });
  };

  const getLogIcon = (log: LogEntry) => {
    if (activeTab === "audit") {
      switch (log.action) {
        case "create":
          return <Badge className="bg-green-100 text-green-800">Created</Badge>;
        case "update":
          return <Badge className="bg-blue-100 text-blue-800">Updated</Badge>;
        case "delete":
          return <Badge className="bg-red-100 text-red-800">Deleted</Badge>;
        default:
          return <Badge className="bg-gray-100 text-gray-800">{log.action}</Badge>;
      }
    } else if (activeTab === "system") {
      return <DatabaseIcon className="w-4 h-4 text-yellow-600" />;
    } else {
      return <ShieldAlert className="w-4 h-4 text-red-600" />;
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
      <PageHeader 
        title="App Logs" 
        description="View and manage system activity logs"
        actions={
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => window.history.back()}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>
        }
      />
      
      {/* Add System Logs Test Component */}
      <div className="mb-6">
        <TestSystemLogs />
      </div>

      {isFilterOpen && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Filter Logs</CardTitle>
            <CardDescription>Narrow down logs based on specific criteria</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <FormLabel>Date Range</FormLabel>
                <div className="flex items-center space-x-2">
                  <Input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => handleFilterChange("startDate", e.target.value)}
                    placeholder="From"
                  />
                  <span>to</span>
                  <Input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => handleFilterChange("endDate", e.target.value)}
                    placeholder="To"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <FormLabel>Entity Type</FormLabel>
                <Select 
                  value={filters.entityType} 
                  onValueChange={(value) => handleFilterChange("entityType", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select entity type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Types</SelectItem>
                    <SelectItem value="merchant">Merchant</SelectItem>
                    <SelectItem value="transaction">Transaction</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="file">File</SelectItem>
                    <SelectItem value="backup">Backup</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <FormLabel>Username</FormLabel>
                <Input
                  value={filters.username}
                  onChange={(e) => handleFilterChange("username", e.target.value)}
                  placeholder="Filter by username"
                />
              </div>

              <div className="space-y-2">
                <FormLabel>Entity ID</FormLabel>
                <Input
                  value={filters.entityId}
                  onChange={(e) => handleFilterChange("entityId", e.target.value)}
                  placeholder="Filter by entity ID"
                />
              </div>

              <div className="space-y-2">
                <FormLabel>Action</FormLabel>
                <Select 
                  value={filters.action} 
                  onValueChange={(value) => handleFilterChange("action", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select action" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Actions</SelectItem>
                    <SelectItem value="create">Create</SelectItem>
                    <SelectItem value="update">Update</SelectItem>
                    <SelectItem value="delete">Delete</SelectItem>
                    <SelectItem value="login">Login</SelectItem>
                    <SelectItem value="logout">Logout</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end mt-4 space-x-2">
              <Button variant="outline" onClick={clearFilters}>Clear Filters</Button>
              <Button onClick={() => setCurrentPage(1)}>Apply Filters</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="all" className="w-full" onValueChange={(value) => {
        setActiveTab(value as LogType);
        setCurrentPage(1);
      }}>
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value="all">All Logs</TabsTrigger>
          <TabsTrigger value="audit">Audit Events</TabsTrigger>
          <TabsTrigger value="system">System Events</TabsTrigger>
          <TabsTrigger value="application">Application Events</TabsTrigger>
          <TabsTrigger value="security">Security Events</TabsTrigger>
        </TabsList>

        {/* Shared content for all tabs */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between">
              <span>
                {activeTab === "all" && "All System Activity"}
                {activeTab === "audit" && "Business Data Changes"}
                {activeTab === "system" && "System Operations & Errors"}
                {activeTab === "application" && "Application Lifecycle Events"}
                {activeTab === "security" && "Security & Authentication Events"}
              </span>
              <div className="flex items-center space-x-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    fetch('/api/logs/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ logType: activeTab })
                    })
                    .then(res => res.json())
                    .then(data => {
                      if (data.success) {
                        // Force refetch to show newly created logs and message
                        alert(data.message);
                        setTimeout(() => {
                          refetch();
                          console.log("Refreshed logs after generation");
                        }, 1500); // Increased timeout for more reliable refresh
                      }
                    })
                    .catch(err => {
                      console.error("Error generating logs:", err);
                      alert("Failed to generate logs. Please try again.");
                    });
                  }}
                >
                  {activeTab === "audit" && "Generate Change Log"}
                  {activeTab === "system" && "Generate System Event Test"}
                  {activeTab === "application" && "Generate App Event Test"}
                  {activeTab === "security" && "Generate Security Event Test"}
                </Button>
                <div className="flex items-center space-x-2">
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="timestamp">Time</SelectItem>
                      <SelectItem value="username">User</SelectItem>
                      <SelectItem value="action">Action</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sortOrder} onValueChange={setSortOrder}>
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder="Order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Newest</SelectItem>
                      <SelectItem value="asc">Oldest</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Search logs..."
                    className="max-w-xs"
                    prefix={<Search className="h-4 w-4 mr-2 opacity-50" />}
                  />
                </div>
              </div>
            </CardTitle>
            <CardDescription>
              {activeTab === "audit" && "Tracking all changes to business data including merchants, transactions, and user actions"}
              {activeTab === "system" && "System-level operations, background processes, and error events"}
              {activeTab === "application" && "MMS application startup, database migration, file processing, and server lifecycle events"}
              {activeTab === "security" && "Authentication attempts, access control, and security-related events"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                <h3 className="text-lg font-medium">Failed to load logs</h3>
                <p className="text-muted-foreground mt-2">There was an error loading the log data.</p>
                <Button className="mt-4" onClick={() => refetch()}>Try Again</Button>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-center border rounded-md">
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No logs found</h3>
                <p className="text-muted-foreground mt-2">
                  No {activeTab} logs match your current filters.
                </p>
                {Object.values(filters).some(f => f !== "") && (
                  <Button variant="outline" className="mt-4" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Timestamp</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">User</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
                        {(activeTab === "audit" || activeTab === "all") && (
                          <>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Entity Type</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Entity ID</th>
                          </>
                        )}
                        {activeTab === "all" && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Log Type</th>
                        )}
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Details</th>
                        {(activeTab === "security" || activeTab === "all") && (
                          <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">IP Address</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <div className="flex items-center">
                              <Clock className="h-4 w-4 mr-2 text-slate-400" />
                              {format(new Date(log.timestamp), "MMM d, yyyy HH:mm:ss")}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <div className="flex items-center">
                              <UserIcon className="h-4 w-4 mr-2 text-slate-400" />
                              {log.username}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {getLogIcon(log)}
                          </td>
                          {(activeTab === "audit" || activeTab === "all") && (
                            <>
                              <td className="px-4 py-3 whitespace-nowrap text-sm">
                                {log.entityType || "-"}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm">
                                {log.entityId || "-"}
                              </td>
                            </>
                          )}
                          {activeTab === "all" && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                              <Badge variant={log.logType === 'system' ? 'destructive' : log.logType === 'security' ? 'secondary' : 'default'}>
                                {log.logType || 'audit'}
                              </Badge>
                            </td>
                          )}
                          <td className="px-4 py-3 text-sm">
                            <div className="max-w-md truncate">
                              {log.notes || "No additional details"}
                            </div>
                          </td>
                          {(activeTab === "security" || activeTab === "all") && (
                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                              {log.ipAddress || "-"}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-gray-500">
                    Showing <span className="font-medium">{logs.length}</span> of{" "}
                    <span className="font-medium">{pagination.totalItems}</span> logs
                  </div>
                  <Pagination
                    currentPage={pagination.currentPage}
                    totalPages={pagination.totalPages}
                    onPageChange={handlePageChange}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </Tabs>
      </div>
    </MainLayout>
  );
}