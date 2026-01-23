import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  ArrowLeft,
  Calendar,
  Download,
  RefreshCw,
  FileSpreadsheet,
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";

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
  const [selectedDate, setSelectedDate] = useState(
    format(subDays(new Date(), 1), "yyyy-MM-dd")
  );
  const [queryDate, setQueryDate] = useState(selectedDate);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<DailyReportResponse>({
    queryKey: ["/api/reports/daily-processing", queryDate],
    enabled: !!queryDate,
  });

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value);
  };

  const handleRunReport = () => {
    setQueryDate(selectedDate);
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
    link.setAttribute(
      "download",
      `daily-processing-report-${queryDate}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
            <div className="flex items-end gap-4">
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
                <Button variant="outline" onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
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
                        <TableHead className="font-semibold">Chain</TableHead>
                        <TableHead className="font-semibold">Name</TableHead>
                        <TableHead className="font-semibold text-right">
                          Auth Amount
                        </TableHead>
                        <TableHead className="font-semibold text-right">
                          Purchase Amount
                        </TableHead>
                        <TableHead className="font-semibold text-right">
                          Credit Amount
                        </TableHead>
                        <TableHead className="font-semibold text-right">
                          Prepaid/LC
                        </TableHead>
                        <TableHead className="font-semibold text-right">
                          Tip/CB/Amc
                        </TableHead>
                        <TableHead className="font-semibold text-right">
                          Net Amount
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.data.map((row, index) => (
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
    </MainLayout>
  );
}
