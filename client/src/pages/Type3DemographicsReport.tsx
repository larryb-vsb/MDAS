import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { AlertCircle, RefreshCw, Download, Search, Users, Building2, Phone, Mail, MapPin, Calendar, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import MainLayout from "@/components/layout/MainLayout";

interface Type3Merchant {
  id: string;
  name: string;
  dbaName: string | null;
  clientMid: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone1: string | null;
  phone2: string | null;
  email: string | null;
  contactFirst: string | null;
  contactLast: string | null;
  status: string | null;
  clientSinceDate: string | null;
  merchantActivationDate: string | null;
  ddaNumber: string | null;
  transitRoutingNumber: string | null;
}

interface Type3ReportData {
  merchants: Type3Merchant[];
  totalCount: number;
  activeCount: number;
  generatedAt: string;
}

type SortColumn = "name" | "clientSinceDate" | null;
type SortDirection = "asc" | "desc";

export default function Type3DemographicsReport() {
  const [searchTerm, setSearchTerm] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("clientSinceDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };
  
  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    return sortDirection === "asc" 
      ? <ArrowUp className="ml-1 h-3 w-3" />
      : <ArrowDown className="ml-1 h-3 w-3" />;
  };
  
  // Build query URL with date filter
  const buildQueryUrl = () => {
    const params = new URLSearchParams();
    if (asOfDate) params.append("asOfDate", asOfDate);
    const queryString = params.toString();
    return queryString ? `/api/reports/type3-demographics?${queryString}` : "/api/reports/type3-demographics";
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery<Type3ReportData>({
    queryKey: ["/api/reports/type3-demographics", asOfDate],
    queryFn: async () => {
      const response = await fetch(buildQueryUrl());
      if (!response.ok) throw new Error("Failed to fetch data");
      return response.json();
    },
  });

  const clearDateFilters = () => {
    setAsOfDate("");
  };

  const filteredMerchants = (data?.merchants?.filter((merchant) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      merchant.name?.toLowerCase().includes(search) ||
      merchant.dbaName?.toLowerCase().includes(search) ||
      merchant.clientMid?.toLowerCase().includes(search) ||
      merchant.city?.toLowerCase().includes(search) ||
      merchant.state?.toLowerCase().includes(search) ||
      merchant.contactFirst?.toLowerCase().includes(search) ||
      merchant.contactLast?.toLowerCase().includes(search)
    );
  }) || []).sort((a, b) => {
    if (!sortColumn) return 0;
    
    let aVal: string | null = null;
    let bVal: string | null = null;
    
    if (sortColumn === "name") {
      aVal = a.name;
      bVal = b.name;
    } else if (sortColumn === "clientSinceDate") {
      aVal = a.clientSinceDate;
      bVal = b.clientSinceDate;
    }
    
    // Handle nulls - push them to the end
    if (!aVal && !bVal) return 0;
    if (!aVal) return 1;
    if (!bVal) return -1;
    
    const comparison = aVal.localeCompare(bVal);
    return sortDirection === "asc" ? comparison : -comparison;
  });

  const handleExportCSV = async () => {
    try {
      const response = await fetch("/api/exports/merchant-demographics/download");
      if (!response.ok) throw new Error("Export failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `type3_merchant_demographics_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Type 3 (ACH) Merchant Demographics</h1>
            <p className="text-muted-foreground mt-1">
              Complete demographic data for all ACH merchants
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={handleExportCSV}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load Type 3 merchant data. Please try again.
            </AlertDescription>
          </Alert>
        )}

        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filter by Client Since Date
            </CardTitle>
            <CardDescription>
              Show all merchants who became clients on or before the selected date
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="asOfDate">Clients As Of Date</Label>
                <Input
                  id="asOfDate"
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="w-48"
                />
              </div>
              {asOfDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearDateFilters}
                  className="text-muted-foreground"
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear Filter
                </Button>
              )}
              {asOfDate && (
                <Badge variant="secondary" className="h-8 px-3">
                  Showing all merchants who were clients by {asOfDate}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Type 3 Merchants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : data?.totalCount || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Merchants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : data?.activeCount || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                With Contact Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-purple-500" />
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : data?.merchants?.filter(m => m.phone1 || m.email).length || 0}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                With Banking Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-amber-500" />
                <span className="text-2xl font-bold">
                  {isLoading ? "..." : data?.merchants?.filter(m => m.ddaNumber || m.transitRoutingNumber).length || 0}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Merchant Demographics</CardTitle>
                <CardDescription>
                  {filteredMerchants.length} merchants
                  {searchTerm && ` matching "${searchTerm}"`}
                </CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search merchants..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="min-w-[200px] cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("name")}
                      >
                        <div className="flex items-center">
                          Merchant Name
                          {renderSortIcon("name")}
                        </div>
                      </TableHead>
                      <TableHead>DBA Name</TableHead>
                      <TableHead>MID</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted/50 select-none"
                        onClick={() => handleSort("clientSinceDate")}
                      >
                        <div className="flex items-center">
                          Client Since
                          {renderSortIcon("clientSinceDate")}
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMerchants.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No merchants found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMerchants.slice(0, 100).map((merchant) => (
                        <TableRow key={merchant.id}>
                          <TableCell className="font-medium">
                            {merchant.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {merchant.dbaName || "-"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {merchant.clientMid || merchant.id}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">
                                {merchant.city && merchant.state
                                  ? `${merchant.city}, ${merchant.state}`
                                  : merchant.city || merchant.state || "-"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {merchant.contactFirst || merchant.contactLast
                              ? `${merchant.contactFirst || ""} ${merchant.contactLast || ""}`.trim()
                              : "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {merchant.phone1 || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={merchant.status?.toLowerCase().includes("active") ? "default" : "secondary"}
                            >
                              {merchant.status || "Unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(merchant.clientSinceDate)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            {filteredMerchants.length > 100 && (
              <p className="text-sm text-muted-foreground mt-4 text-center">
                Showing first 100 of {filteredMerchants.length} merchants. Export CSV for complete data.
              </p>
            )}
          </CardContent>
        </Card>

        {data?.generatedAt && (
          <p className="text-xs text-muted-foreground text-center mt-4">
            Report generated: {new Date(data.generatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </MainLayout>
  );
}
