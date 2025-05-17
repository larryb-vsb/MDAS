import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Download, Filter, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import MainLayout from "@/components/layout/MainLayout";
import PageHeader from "@/components/common/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/common/Pagination";

export default function Logs() {
  // State for tab selection
  const [activeTab, setActiveTab] = useState("audit");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  
  // Filters state
  const [filters, setFilters] = useState({
    audit: {
      entityType: "",
      username: "",
      action: "",
      startDate: null,
      endDate: null,
    },
    system: {
      level: "",
      source: "",
      startDate: null,
      endDate: null,
    },
    security: {
      eventType: "",
      username: "",
      startDate: null,
      endDate: null,
      result: "",
    }
  });

  // Fetch logs based on active tab
  const { data: auditLogs, isLoading: isAuditLoading, refetch: refetchAuditLogs } = useQuery({
    queryKey: ['/api/logs/audit', page, limit, filters.audit],
    queryFn: () => fetch(`/api/logs/audit?page=${page}&limit=${limit}${filters.audit.entityType ? `&entityType=${filters.audit.entityType}` : ''}${filters.audit.username ? `&username=${filters.audit.username}` : ''}${filters.audit.action ? `&action=${filters.audit.action}` : ''}${filters.audit.startDate ? `&startDate=${filters.audit.startDate.toISOString()}` : ''}${filters.audit.endDate ? `&endDate=${filters.audit.endDate.toISOString()}` : ''}`).then(res => res.json()),
    enabled: activeTab === "audit"
  });

  const { data: systemLogs, isLoading: isSystemLoading, refetch: refetchSystemLogs } = useQuery({
    queryKey: ['/api/logs/system', page, limit, filters.system],
    queryFn: () => fetch(`/api/logs/system?page=${page}&limit=${limit}${filters.system.level ? `&level=${filters.system.level}` : ''}${filters.system.source ? `&source=${filters.system.source}` : ''}${filters.system.startDate ? `&startDate=${filters.system.startDate.toISOString()}` : ''}${filters.system.endDate ? `&endDate=${filters.system.endDate.toISOString()}` : ''}`).then(res => res.json()),
    enabled: activeTab === "system"
  });

  const { data: securityLogs, isLoading: isSecurityLoading, refetch: refetchSecurityLogs } = useQuery({
    queryKey: ['/api/logs/security', page, limit, filters.security],
    queryFn: () => fetch(`/api/logs/security?page=${page}&limit=${limit}${filters.security.eventType ? `&eventType=${filters.security.eventType}` : ''}${filters.security.username ? `&username=${filters.security.username}` : ''}${filters.security.result ? `&result=${filters.security.result}` : ''}${filters.security.startDate ? `&startDate=${filters.security.startDate.toISOString()}` : ''}${filters.security.endDate ? `&endDate=${filters.security.endDate.toISOString()}` : ''}`).then(res => res.json()),
    enabled: activeTab === "security"
  });

  // Handle export
  const handleExport = async () => {
    const response = await fetch(`/api/logs/export/${activeTab}`);
    if (response.ok) {
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeTab}_logs_export.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  };

  // Handle filter change
  const handleFilterChange = (tab, field, value) => {
    setFilters(prev => ({
      ...prev,
      [tab]: {
        ...prev[tab],
        [field]: value
      }
    }));
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1); // Reset to first page when changing tabs
  };

  // Handle refresh
  const handleRefresh = () => {
    if (activeTab === "audit") {
      refetchAuditLogs();
    } else if (activeTab === "system") {
      refetchSystemLogs();
    } else if (activeTab === "security") {
      refetchSecurityLogs();
    }
  };

  // Reset filters for the active tab
  const resetFilters = () => {
    if (activeTab === "audit") {
      setFilters(prev => ({
        ...prev,
        audit: {
          entityType: "",
          username: "",
          action: "",
          startDate: null,
          endDate: null,
        }
      }));
    } else if (activeTab === "system") {
      setFilters(prev => ({
        ...prev,
        system: {
          level: "",
          source: "",
          startDate: null,
          endDate: null,
        }
      }));
    } else if (activeTab === "security") {
      setFilters(prev => ({
        ...prev,
        security: {
          eventType: "",
          username: "",
          startDate: null,
          endDate: null,
          result: "",
        }
      }));
    }
  };

  // Get logs and pagination info based on active tab
  const getLogsData = () => {
    if (activeTab === "audit") {
      return {
        logs: auditLogs?.logs || [],
        isLoading: isAuditLoading,
        pagination: auditLogs?.pagination || { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: limit }
      };
    } else if (activeTab === "system") {
      return {
        logs: systemLogs?.logs || [],
        isLoading: isSystemLoading,
        pagination: systemLogs?.pagination || { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: limit }
      };
    } else {
      return {
        logs: securityLogs?.logs || [],
        isLoading: isSecurityLoading,
        pagination: securityLogs?.pagination || { currentPage: 1, totalPages: 1, totalItems: 0, itemsPerPage: limit }
      };
    }
  };

  const { logs, isLoading, pagination } = getLogsData();

  // Render the table based on active tab
  const renderLogTable = () => {
    if (isLoading) {
      return (
        <div className="space-y-3">
          {[...Array(5)].map((_, index) => (
            <Skeleton key={index} className="w-full h-12" />
          ))}
        </div>
      );
    }

    if (logs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-6 space-y-2 text-center">
          <p className="text-muted-foreground">No logs found</p>
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      );
    }

    if (activeTab === "audit") {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono">
                  {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                </TableCell>
                <TableCell>{log.username}</TableCell>
                <TableCell>
                  <Badge variant="outline">{log.entityType}</Badge>
                </TableCell>
                <TableCell className="max-w-[150px] truncate">
                  {log.entityId}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={
                      log.action === "CREATE" ? "success" : 
                      log.action === "UPDATE" ? "warning" : 
                      log.action === "DELETE" ? "destructive" : "default"
                    }
                  >
                    {log.action}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {log.changedFields ? log.changedFields.join(", ") : "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    } else if (activeTab === "system") {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono">
                  {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={
                      log.level === "ERROR" ? "destructive" : 
                      log.level === "WARNING" ? "warning" : 
                      log.level === "INFO" ? "default" : "outline"
                    }
                  >
                    {log.level}
                  </Badge>
                </TableCell>
                <TableCell>{log.source}</TableCell>
                <TableCell className="max-w-[250px] truncate">
                  {log.message}
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {log.details ? JSON.stringify(log.details).substring(0, 30) + "..." : "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    } else if (activeTab === "security") {
      return (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>IP Address</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono">
                  {format(new Date(log.timestamp), "yyyy-MM-dd HH:mm:ss")}
                </TableCell>
                <TableCell>{log.username || "Anonymous"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{log.eventType}</Badge>
                </TableCell>
                <TableCell>{log.ipAddress || "N/A"}</TableCell>
                <TableCell>
                  <Badge 
                    variant={log.result === "SUCCESS" ? "success" : "destructive"}
                  >
                    {log.result}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {log.details ? JSON.stringify(log.details).substring(0, 30) + "..." : "N/A"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      );
    }
  };

  // Render the filters based on active tab
  const renderFilters = () => {
    if (activeTab === "audit") {
      return (
        <div className="flex flex-wrap gap-3">
          <div className="w-[180px]">
            <Select
              value={filters.audit.entityType}
              onValueChange={(value) => handleFilterChange("audit", "entityType", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Entity Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Entity Types</SelectItem>
                <SelectItem value="merchant">Merchant</SelectItem>
                <SelectItem value="transaction">Transaction</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="file">File</SelectItem>
                <SelectItem value="backup">Backup</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input 
            placeholder="Username"
            value={filters.audit.username}
            onChange={(e) => handleFilterChange("audit", "username", e.target.value)}
            className="w-[180px]"
          />
          <div className="w-[180px]">
            <Select
              value={filters.audit.action}
              onValueChange={(value) => handleFilterChange("audit", "action", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Actions</SelectItem>
                <SelectItem value="CREATE">Create</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
                <SelectItem value="LOGIN">Login</SelectItem>
                <SelectItem value="LOGOUT">Logout</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.audit.startDate ? format(filters.audit.startDate, "PPP") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filters.audit.startDate}
                  onSelect={(date) => handleFilterChange("audit", "startDate", date)}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.audit.endDate ? format(filters.audit.endDate, "PPP") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filters.audit.endDate}
                  onSelect={(date) => handleFilterChange("audit", "endDate", date)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      );
    } else if (activeTab === "system") {
      return (
        <div className="flex flex-wrap gap-3">
          <div className="w-[180px]">
            <Select
              value={filters.system.level}
              onValueChange={(value) => handleFilterChange("system", "level", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Log Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Levels</SelectItem>
                <SelectItem value="INFO">Info</SelectItem>
                <SelectItem value="WARNING">Warning</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
                <SelectItem value="DEBUG">Debug</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input 
            placeholder="Source"
            value={filters.system.source}
            onChange={(e) => handleFilterChange("system", "source", e.target.value)}
            className="w-[180px]"
          />
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.system.startDate ? format(filters.system.startDate, "PPP") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filters.system.startDate}
                  onSelect={(date) => handleFilterChange("system", "startDate", date)}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.system.endDate ? format(filters.system.endDate, "PPP") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filters.system.endDate}
                  onSelect={(date) => handleFilterChange("system", "endDate", date)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      );
    } else if (activeTab === "security") {
      return (
        <div className="flex flex-wrap gap-3">
          <div className="w-[180px]">
            <Select
              value={filters.security.eventType}
              onValueChange={(value) => handleFilterChange("security", "eventType", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Event Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Events</SelectItem>
                <SelectItem value="LOGIN_ATTEMPT">Login Attempt</SelectItem>
                <SelectItem value="LOGOUT">Logout</SelectItem>
                <SelectItem value="PASSWORD_CHANGE">Password Change</SelectItem>
                <SelectItem value="ACCOUNT_LOCKED">Account Locked</SelectItem>
                <SelectItem value="API_ACCESS">API Access</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input 
            placeholder="Username"
            value={filters.security.username}
            onChange={(e) => handleFilterChange("security", "username", e.target.value)}
            className="w-[180px]"
          />
          <div className="w-[180px]">
            <Select
              value={filters.security.result}
              onValueChange={(value) => handleFilterChange("security", "result", value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Results</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="FAILURE">Failure</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.security.startDate ? format(filters.security.startDate, "PPP") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filters.security.startDate}
                  onSelect={(date) => handleFilterChange("security", "startDate", date)}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[150px] justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.security.endDate ? format(filters.security.endDate, "PPP") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={filters.security.endDate}
                  onSelect={(date) => handleFilterChange("security", "endDate", date)}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      );
    }
  };

  return (
    <MainLayout>
      <PageHeader
        title="System Logs"
        description="View and manage system, audit, and security logs"
        actions={
          <div className="flex gap-2">
            <Button onClick={handleExport} variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="audit" value={activeTab} onValueChange={handleTabChange}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
            <TabsTrigger value="system">System Logs</TabsTrigger>
            <TabsTrigger value="security">Security Logs</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <Select value={String(limit)} onValueChange={(value) => setLimit(parseInt(value))}>
              <SelectTrigger className="w-[80px]">
                <SelectValue placeholder="10" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">per page</span>
          </div>
        </div>

        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {activeTab === "audit" && "Audit Logs"}
                  {activeTab === "system" && "System Logs"}
                  {activeTab === "security" && "Security Logs"}
                </CardTitle>
                <CardDescription>
                  {activeTab === "audit" && "View records of user actions and data changes"}
                  {activeTab === "system" && "View system operation logs, warnings, and errors"}
                  {activeTab === "security" && "View authentication, authorization, and security events"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Reset Filters
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="w-4 h-4" />
                <span className="font-medium">Filters</span>
              </div>
              {renderFilters()}
            </div>

            <div className="rounded-md border">
              {renderLogTable()}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {logs.length > 0 ? (pagination.currentPage - 1) * pagination.itemsPerPage + 1 : 0} to{" "}
                {Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)} of{" "}
                {pagination.totalItems} entries
              </div>
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                onPageChange={setPage}
              />
            </div>
          </CardContent>
        </Card>
      </Tabs>
    </MainLayout>
  );
}