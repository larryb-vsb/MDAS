import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, Calendar as CalendarIcon, Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

// Mock data for export history (would come from API in real implementation)
const exportHistory = [
  {
    id: "export-001",
    name: "merchants_export_20250505.csv",
    type: "merchants",
    createdAt: "2025-05-05T12:30:45.000Z",
    size: 256789,
    records: 145,
    status: "completed"
  },
  {
    id: "export-002",
    name: "transactions_export_20250504.csv",
    type: "transactions",
    createdAt: "2025-05-04T16:22:33.000Z",
    size: 1853421,
    records: 984,
    status: "completed"
  },
  {
    id: "export-003",
    name: "merchants_export_20250503.csv",
    type: "merchants",
    createdAt: "2025-05-03T09:15:12.000Z",
    size: 234567,
    records: 132,
    status: "completed"
  },
  {
    id: "export-004",
    name: "transactions_export_20250502.csv",
    type: "transactions",
    createdAt: "2025-05-02T14:45:21.000Z",
    size: 1654321,
    records: 876,
    status: "completed"
  },
  {
    id: "export-005",
    name: "merchants_export_20250501.csv",
    type: "merchants",
    createdAt: "2025-05-01T10:33:18.000Z",
    size: 223456,
    records: 128,
    status: "completed"
  }
];

export default function Exports() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [exportType, setExportType] = useState("merchants");
  const [dateRange, setDateRange] = useState({
    from: new Date(),
    to: new Date()
  });
  const [isExporting, setIsExporting] = useState(false);
  
  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(prev => !prev);
  };
  
  const toggleUploadModal = () => {
    setIsUploadModalOpen(prev => !prev);
  };
  
  // Simulated data fetching
  const {
    data: exportHistoryData,
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["/api/exports/history"],
    queryFn: () => {
      // In a real app, this would be an API call
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(exportHistory);
        }, 500);
      });
    },
    staleTime: 1000 * 60 * 5 // 5 minutes
  });
  
  const handleExport = async () => {
    try {
      setIsExporting(true);
      
      // In a real app, this would be an API call
      setTimeout(() => {
        setIsExporting(false);
        
        toast({
          title: "Export successful",
          description: `Your ${exportType} data has been exported.`,
        });
        
        // Refresh the export history
        refetch();
        
        // Build query parameters for the export request
        const queryParams = new URLSearchParams();
        
        if (exportType === 'batch-summary') {
          // For batch summary, use the "from" date as the target date
          if (dateRange.from) {
            queryParams.append('targetDate', dateRange.from.toISOString().split('T')[0]);
          }
        } else {
          // For other exports, use date range
          if (dateRange.from) {
            queryParams.append('startDate', dateRange.from.toISOString().split('T')[0]);
          }
          
          if (dateRange.to) {
            queryParams.append('endDate', dateRange.to.toISOString().split('T')[0]);
          }
        }
        
        // Create direct download link with query parameters
        const downloadUrl = `/api/exports/${exportType}/download?${queryParams.toString()}`;
        
        // Simulate download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.click();
      }, 2000);
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setTimeout(() => {
        setIsExporting(false);
      }, 2000);
    }
  };
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'MMM d, yyyy h:mm a');
  };
  
  const handleDownload = (exportId: string) => {
    // Create a direct download link
    window.location.href = `/api/exports/download/${exportId}`;
    
    toast({
      title: "Download started",
      description: "Your export file is being downloaded."
    });
  };
  
  return (
    <div className="flex h-screen bg-background">
      <Sidebar isVisible={!isMobileMenuOpen} />
      
      <div className="flex-1 flex flex-col h-full overflow-auto">
        <Header toggleMobileMenu={toggleMobileMenu} toggleUploadModal={toggleUploadModal} />
        
        <div className="flex-1 p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Export Data</h1>
              <p className="text-muted-foreground">
                Export merchant and transaction data
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
          
          <Separator />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Create New Export</CardTitle>
                <CardDescription>
                  Export merchant or transaction data to a CSV file
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Export Type</label>
                  <Select value={exportType} onValueChange={setExportType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select export type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merchants">Merchants</SelectItem>
                      <SelectItem value="transactions">Transactions</SelectItem>
                      <SelectItem value="batch-summary">Batch Summary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {exportType === 'batch-summary' ? 'Target Date' : 'Date Range'}
                  </label>
                  {exportType === 'batch-summary' && (
                    <p className="text-xs text-muted-foreground">
                      Select a specific date to generate batch summary
                    </p>
                  )}
                  
                  {/* Quick filter buttons */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const today = new Date();
                        setDateRange({ from: today, to: today });
                      }}
                    >
                      Today
                    </Button>
                    {exportType !== 'batch-summary' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const today = new Date();
                            const startOfWeek = new Date(today);
                            startOfWeek.setDate(today.getDate() - today.getDay());
                            setDateRange({ from: startOfWeek, to: today });
                          }}
                        >
                          This Week
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const today = new Date();
                            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                            setDateRange({ from: startOfMonth, to: today });
                          }}
                        >
                          This Month
                        </Button>
                      </>
                    )}
                  </div>

                  {exportType === 'batch-summary' ? (
                    // Single date picker for batch summary
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="justify-start text-left font-normal w-full">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.from ? format(dateRange.from, "PPP") : "Select target date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={dateRange.from}
                          onSelect={(date) => setDateRange({ from: date || new Date(), to: date || new Date() })}
                        />
                      </PopoverContent>
                    </Popover>
                  ) : (
                    // Date range picker for other exports
                    <div className="grid grid-cols-2 gap-2">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange.from ? format(dateRange.from, "PPP") : "From date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={dateRange.from}
                            onSelect={(date) => setDateRange({ ...dateRange, from: date || new Date() })}
                          />
                        </PopoverContent>
                      </Popover>
                      
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange.to ? format(dateRange.to, "PPP") : "To date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={dateRange.to}
                            onSelect={(date) => setDateRange({ ...dateRange, to: date || new Date() })}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full" 
                  onClick={handleExport} 
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Export {
                        exportType === "merchants" ? "Merchants" : 
                        exportType === "transactions" ? "Transactions" : 
                        "Batch Summary"
                      }
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Export History</CardTitle>
                <CardDescription>
                  Download previously exported data files
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Loading export history...</p>
                  </div>
                ) : isError ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                      Failed to fetch export history.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Export</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Size</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exportHistoryData && exportHistoryData.length > 0 ? (
                          exportHistoryData.map((exportItem: any) => (
                            <TableRow key={exportItem.id}>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium truncate max-w-[200px]">
                                    {exportItem.name}
                                  </span>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="secondary" className="text-xs">
                                      {exportItem.type}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {exportItem.records} records
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(exportItem.createdAt)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatBytes(exportItem.size)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDownload(exportItem.id)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Download className="h-4 w-4" />
                                  <span className="sr-only">Download</span>
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                              No exports found. Create a new export first.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}