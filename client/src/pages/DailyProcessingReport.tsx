import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { format, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Calendar,
  Download,
  RefreshCw,
  FileSpreadsheet,
  Mail,
  FileText,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";

type SortColumn = "chain" | "name" | "authAmount" | "purchaseAmount" | "creditAmount" | "prepaidLc" | "tipCbAmc" | "netAmount";
type SortDirection = "asc" | "desc";
import MainLayout from "@/components/layout/MainLayout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface DailyReportRow {
  chain: string;
  name: string;
  associationNumber: string;
  merchantAccountNumber: string;
  authAmount: number;
  purchaseAmount: number;
  creditAmount: number;
  prepaidLc: number;
  tipCbAmc: number;
  netAmount: number;
  transactionCount: number;
}

interface DailyReportResponse {
  date: string;
  data: DailyReportRow[];
  totals: {
    authAmount: number;
    purchaseAmount: number;
    creditAmount: number;
    prepaidLc: number;
    tipCbAmc: number;
    netAmount: number;
    transactionCount: number;
    merchantCount: number;
  };
}

function formatCurrency(amount: number): string {
  if (amount === 0) return "$-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatChain(chain: string): string {
  if (chain && chain.length === 16) {
    return `'${chain}'`;
  }
  return chain;
}

export default function DailyProcessingReport() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(
    format(subDays(new Date(), 1), "yyyy-MM-dd")
  );
  const [queryDate, setQueryDate] = useState(selectedDate);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("netAmount");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DailyReportResponse>({
    queryKey: [`/api/reports/daily-processing/${queryDate}`],
    enabled: !!queryDate,
  });

  const emailMutation = useMutation({
    mutationFn: async (emailData: any) => {
      return apiRequest("/api/reports/email-outbox", {
        method: "POST",
        body: JSON.stringify(emailData),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "Email Queued",
        description: "Report has been queued for email delivery",
      });
      setEmailDialogOpen(false);
      setEmailAddress("");
    },
    onError: (err: any) => {
      toast({
        title: "Error",
        description: err.message || "Failed to queue email",
        variant: "destructive",
      });
    },
  });

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const handleRunReport = () => {
    setQueryDate(selectedDate);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("desc");
    }
  };

  const sortedData = useMemo(() => {
    if (!data?.data) return [];
    
    return [...data.data].sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        const comparison = aVal.localeCompare(bVal);
        return sortDirection === "asc" ? comparison : -comparison;
      }
      
      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
    });
  }, [data?.data, sortColumn, sortDirection]);

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const getExportData = () => {
    if (!data || !data.data) return [];
    
    return data.data.map((row) => ({
      Chain: formatChain(row.chain),
      Name: row.name,
      "Auth Amount": row.authAmount,
      "Purchase Amount": row.purchaseAmount,
      "Credit Amount": row.creditAmount,
      "Prepaid/LC": row.prepaidLc,
      "Tip/CB/Amc": row.tipCbAmc,
      "Net Amount": row.netAmount,
    }));
  };

  const handleExportCSV = () => {
    if (!data || !data.data) return;

    const headers = [
      "Chain",
      "Name",
      "Auth Amount",
      "Purchase Amount",
      "Credit Amount",
      "Prepaid/LC",
      "Tip/CB/Amc",
      "Net Amount",
    ];

    const rows = data.data.map((row) => [
      formatChain(row.chain),
      row.name,
      row.authAmount.toFixed(2),
      row.purchaseAmount.toFixed(2),
      row.creditAmount.toFixed(2),
      row.prepaidLc.toFixed(2),
      row.tipCbAmc.toFixed(2),
      row.netAmount.toFixed(2),
    ]);

    rows.push([
      "Total",
      "",
      data.totals.authAmount.toFixed(2),
      data.totals.purchaseAmount.toFixed(2),
      data.totals.creditAmount.toFixed(2),
      data.totals.prepaidLc.toFixed(2),
      data.totals.tipCbAmc.toFixed(2),
      data.totals.netAmount.toFixed(2),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `daily-processing-report-${queryDate}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ title: "CSV Downloaded", description: `Report exported as CSV` });
  };

  const handleExportXLS = () => {
    if (!data || !data.data) return;

    const exportData = getExportData();
    
    exportData.push({
      Chain: "Total",
      Name: "",
      "Auth Amount": data.totals.authAmount,
      "Purchase Amount": data.totals.purchaseAmount,
      "Credit Amount": data.totals.creditAmount,
      "Prepaid/LC": data.totals.prepaidLc,
      "Tip/CB/Amc": data.totals.tipCbAmc,
      "Net Amount": data.totals.netAmount,
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Processing");
    
    XLSX.writeFile(wb, `daily-processing-report-${queryDate}.xlsx`);
    
    toast({ title: "Excel Downloaded", description: `Report exported as XLSX` });
  };

  const handleExportPDF = () => {
    if (!data || !data.data) return;

    const doc = new jsPDF({ orientation: "landscape" });
    
    doc.setFontSize(16);
    doc.text(`Daily Processing Report - ${format(new Date(queryDate + "T12:00:00"), "MMMM d, yyyy")}`, 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "MMMM d, yyyy h:mm a")}`, 14, 22);
    doc.text(`Merchants/Associations: ${data.totals.merchantCount} | Transactions: ${data.totals.transactionCount.toLocaleString()}`, 14, 28);

    const tableData = data.data.map((row) => [
      formatChain(row.chain),
      row.name.substring(0, 25),
      formatCurrency(row.authAmount),
      formatCurrency(row.purchaseAmount),
      formatCurrency(row.creditAmount),
      formatCurrency(row.prepaidLc),
      formatCurrency(row.tipCbAmc),
      formatCurrency(row.netAmount),
    ]);

    tableData.push([
      "Total",
      "",
      formatCurrency(data.totals.authAmount),
      formatCurrency(data.totals.purchaseAmount),
      formatCurrency(data.totals.creditAmount),
      formatCurrency(data.totals.prepaidLc),
      formatCurrency(data.totals.tipCbAmc),
      formatCurrency(data.totals.netAmount),
    ]);

    autoTable(doc, {
      head: [["Chain", "Name", "Auth Amount", "Purchase Amt", "Credit Amt", "Prepaid/LC", "Tip/CB/Amc", "Net Amount"]],
      body: tableData,
      startY: 35,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246] },
      footStyles: { fillColor: [243, 244, 246], fontStyle: "bold" },
    });

    doc.save(`daily-processing-report-${queryDate}.pdf`);
    
    toast({ title: "PDF Downloaded", description: `Report exported as PDF` });
  };

  const handleQueueEmail = () => {
    if (!emailAddress || !data) return;

    emailMutation.mutate({
      recipientEmail: emailAddress,
      subject: `Daily Processing Report - ${format(new Date(queryDate + "T12:00:00"), "MMMM d, yyyy")}`,
      reportType: "daily_processing",
      reportDate: queryDate,
      attachmentType: "csv",
      reportData: data,
    });
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/reports")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Reports
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Daily Processing Report
              </h1>
              <p className="text-gray-500 mt-1">
                Transaction summary by merchant/association for a specific date
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Report Parameters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-2">
                <Label htmlFor="report-date">Transaction Date</Label>
                <Input
                  id="report-date"
                  type="date"
                  value={selectedDate}
                  onChange={handleDateChange}
                  className="w-48"
                />
              </div>
              <Button onClick={handleRunReport} disabled={isFetching}>
                {isFetching ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                )}
                Run Report
              </Button>
              
              {data && data.data && data.data.length > 0 && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={handleExportCSV}>
                        <FileText className="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportXLS}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export as Excel (XLSX)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportPDF}>
                        <FileText className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  <Button 
                    variant="outline" 
                    onClick={() => setEmailDialogOpen(true)}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Email Report
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : isError ? (
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-red-500">
                <p>Error loading report: {(error as Error)?.message}</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => refetch()}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : data && data.data ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  Results for {format(new Date(queryDate + "T12:00:00"), "MMMM d, yyyy")}
                </CardTitle>
                <div className="text-sm text-gray-500">
                  {data.totals.merchantCount} merchants/associations |{" "}
                  {data.totals.transactionCount.toLocaleString()} transactions
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {data.data.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No transactions found for this date</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead 
                          className="font-semibold cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort("chain")}
                        >
                          <div className="flex items-center">
                            Chain
                            <SortIcon column="chain" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="font-semibold cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort("name")}
                        >
                          <div className="flex items-center">
                            Name
                            <SortIcon column="name" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="font-semibold text-right cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort("authAmount")}
                        >
                          <div className="flex items-center justify-end">
                            Auth Amount
                            <SortIcon column="authAmount" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="font-semibold text-right cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort("purchaseAmount")}
                        >
                          <div className="flex items-center justify-end">
                            Purchase Amount
                            <SortIcon column="purchaseAmount" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="font-semibold text-right cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort("creditAmount")}
                        >
                          <div className="flex items-center justify-end">
                            Credit Amount
                            <SortIcon column="creditAmount" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="font-semibold text-right cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort("prepaidLc")}
                        >
                          <div className="flex items-center justify-end">
                            Prepaid/LC
                            <SortIcon column="prepaidLc" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="font-semibold text-right cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort("tipCbAmc")}
                        >
                          <div className="flex items-center justify-end">
                            Tip/CB/Amc
                            <SortIcon column="tipCbAmc" />
                          </div>
                        </TableHead>
                        <TableHead 
                          className="font-semibold text-right cursor-pointer hover:bg-gray-100 select-none"
                          onClick={() => handleSort("netAmount")}
                        >
                          <div className="flex items-center justify-end">
                            Net Amount
                            <SortIcon column="netAmount" />
                          </div>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedData.map((row, index) => (
                        <TableRow key={index} className="hover:bg-gray-50">
                          <TableCell className="font-mono text-sm">
                            {formatChain(row.chain)}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {row.name}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.authAmount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.purchaseAmount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.creditAmount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.prepaidLc)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.tipCbAmc)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(row.netAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-100 font-bold border-t-2">
                        <TableCell>Total</TableCell>
                        <TableCell></TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(data.totals.authAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(data.totals.purchaseAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(data.totals.creditAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(data.totals.prepaidLc)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(data.totals.tipCbAmc)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(data.totals.netAmount)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Report</DialogTitle>
            <DialogDescription>
              Queue this report to be sent via email. The report will be added to the email outbox for processing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Recipient Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="email@example.com"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
              />
            </div>
            <div className="text-sm text-gray-500">
              Report: Daily Processing Report - {format(new Date(queryDate + "T12:00:00"), "MMMM d, yyyy")}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleQueueEmail} 
              disabled={!emailAddress || emailMutation.isPending}
            >
              {emailMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Queue Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
