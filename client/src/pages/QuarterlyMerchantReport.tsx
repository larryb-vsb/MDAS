import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, RefreshCw, Download, TrendingUp, TrendingDown, UserMinus, UserPlus, FileText, Users, BarChart3 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import MainLayout from "@/components/layout/MainLayout";
import { Document, Page, Text, View, StyleSheet, pdf, Image } from "@react-pdf/renderer";
import mdasLogo from "@/assets/mdas-logo.png";

interface MerchantData {
  id: string;
  name: string;
  clientMid: string | null;
  status: string;
  date: string;
  category: string | null;
  city: string | null;
  state: string | null;
}

interface QuarterlyReportData {
  year: number;
  quarter: number;
  quarterLabel: string;
  dateRange: {
    start: string;
    end: string;
  };
  summary: {
    newMerchants: number;
    closedMerchants: number;
    netChange: number;
    beginningCount: number;
    endCount: number;
  };
  newMerchants: MerchantData[];
  closedMerchants: MerchantData[];
}

interface TrendDataPoint {
  label: string;
  year: number;
  quarter: number;
  newMerchants: number;
  closedMerchants: number;
  beginningCount: number;
  endCount: number;
  netChange: number;
}

interface TrendResponse {
  trend: TrendDataPoint[];
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 10 }, (_, i) => currentYear - i);
const quarters = [
  { value: "1", label: "Q1 (Jan - Mar)" },
  { value: "2", label: "Q2 (Apr - Jun)" },
  { value: "3", label: "Q3 (Jul - Sep)" },
  { value: "4", label: "Q4 (Oct - Dec)" },
];

function getCurrentQuarter(): string {
  const month = new Date().getMonth();
  if (month < 3) return "1";
  if (month < 6) return "2";
  if (month < 9) return "3";
  return "4";
}

const pdfStyles = StyleSheet.create({
  page: { padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20, flexDirection: 'row', alignItems: 'flex-start', gap: 15 },
  logo: { width: 60, height: 60 },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  subtitle: { fontSize: 10, color: '#666', marginBottom: 10 },
  dateRange: { fontSize: 9, color: '#888', marginBottom: 15 },
  summaryRow: { flexDirection: 'row', marginBottom: 20, gap: 15 },
  summaryCard: { flex: 1, padding: 10, backgroundColor: '#f5f5f5', borderRadius: 4 },
  summaryLabel: { fontSize: 9, color: '#666', marginBottom: 3 },
  summaryValue: { fontSize: 14, fontWeight: 'bold' },
  summaryValueBlue: { fontSize: 14, fontWeight: 'bold', color: '#2563eb' },
  summaryValueGreen: { fontSize: 14, fontWeight: 'bold', color: '#16a34a' },
  summaryValueRed: { fontSize: 14, fontWeight: 'bold', color: '#dc2626' },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 8, marginTop: 15 },
  sectionSubtitle: { fontSize: 8, color: '#666', marginBottom: 8 },
  table: { width: '100%' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', padding: 6, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  tableRow: { flexDirection: 'row', padding: 5, borderBottomWidth: 1, borderBottomColor: '#eee' },
  tableCell: { flex: 1, fontSize: 8 },
  tableCellWide: { flex: 2, fontSize: 8 },
  tableCellHeader: { flex: 1, fontSize: 8, fontWeight: 'bold' },
  tableCellHeaderWide: { flex: 2, fontSize: 8, fontWeight: 'bold' },
  footer: { position: 'absolute', bottom: 20, left: 30, right: 30, fontSize: 8, color: '#999', textAlign: 'center' },
  chartSection: { marginTop: 15, marginBottom: 15 },
  chartTitle: { fontSize: 10, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 120, paddingHorizontal: 10 },
  chartBar: { alignItems: 'center', width: 60 },
  chartBarStack: { width: 40, flexDirection: 'column-reverse' },
  chartBarBlue: { backgroundColor: '#2563eb' },
  chartBarGreen: { backgroundColor: '#16a34a' },
  chartBarRed: { backgroundColor: '#dc2626' },
  chartLabel: { fontSize: 7, marginTop: 4, textAlign: 'center' },
  chartValue: { fontSize: 6, color: '#fff', textAlign: 'center' },
  trendTable: { marginTop: 10 },
  trendTableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', padding: 4, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  trendTableRow: { flexDirection: 'row', padding: 4, borderBottomWidth: 1, borderBottomColor: '#eee' },
  trendTableCell: { flex: 1, fontSize: 7, textAlign: 'center' },
  trendTableCellLabel: { flex: 1, fontSize: 7, textAlign: 'left' },
  trendTableCellHeader: { flex: 1, fontSize: 7, fontWeight: 'bold', textAlign: 'center' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 8, gap: 15 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 7 },
});

interface PDFReportProps {
  data: QuarterlyReportData;
  formatDate: (date: string) => string;
  trendData?: TrendDataPoint[];
}

const QuarterlyReportPDF = ({ data, formatDate, trendData }: PDFReportProps) => {
  const maxEndCount = trendData ? Math.max(...trendData.map(d => d.endCount)) : 0;
  const getBarHeight = (value: number) => Math.max(4, (value / maxEndCount) * 80);
  
  return (
    <Document>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <Image src={mdasLogo} style={pdfStyles.logo} />
        <View style={pdfStyles.headerText}>
          <Text style={pdfStyles.title}>Quarterly Merchant Report</Text>
          <Text style={pdfStyles.subtitle}>New and Closed MCC Merchants - {data.quarterLabel}</Text>
          <Text style={pdfStyles.dateRange}>Reporting period: {data.dateRange.start} to {data.dateRange.end}</Text>
        </View>
      </View>

      <View style={pdfStyles.summaryRow}>
        <View style={pdfStyles.summaryCard}>
          <Text style={pdfStyles.summaryLabel}>Beginning Count</Text>
          <Text style={pdfStyles.summaryValueBlue}>{data.summary.beginningCount}</Text>
        </View>
        <View style={pdfStyles.summaryCard}>
          <Text style={pdfStyles.summaryLabel}>New Merchants</Text>
          <Text style={pdfStyles.summaryValueGreen}>+{data.summary.newMerchants}</Text>
        </View>
        <View style={pdfStyles.summaryCard}>
          <Text style={pdfStyles.summaryLabel}>Closed Merchants</Text>
          <Text style={pdfStyles.summaryValueRed}>{data.summary.closedMerchants}</Text>
        </View>
        <View style={pdfStyles.summaryCard}>
          <Text style={pdfStyles.summaryLabel}>Net Change</Text>
          <Text style={data.summary.netChange >= 0 ? pdfStyles.summaryValueGreen : pdfStyles.summaryValueRed}>
            {data.summary.netChange >= 0 ? '+' : ''}{data.summary.netChange}
          </Text>
        </View>
        <View style={pdfStyles.summaryCard}>
          <Text style={pdfStyles.summaryLabel}>End Count</Text>
          <Text style={pdfStyles.summaryValueBlue}>{data.summary.endCount}</Text>
        </View>
      </View>

      {/* Four Quarter Trend Chart */}
      {trendData && trendData.length > 0 && (
        <View style={pdfStyles.chartSection}>
          <Text style={pdfStyles.chartTitle}>Four Quarter Trend</Text>
          <View style={pdfStyles.chartContainer}>
            {trendData.map((d, i) => {
              const existing = d.endCount - d.newMerchants;
              return (
                <View key={i} style={pdfStyles.chartBar}>
                  <View style={pdfStyles.chartBarStack}>
                    <View style={[pdfStyles.chartBarBlue, { height: getBarHeight(existing) }]} />
                    <View style={[pdfStyles.chartBarGreen, { height: getBarHeight(d.newMerchants) }]} />
                  </View>
                  <Text style={pdfStyles.chartLabel}>{d.label}</Text>
                  <Text style={{ fontSize: 6, color: '#666' }}>Total: {d.endCount}</Text>
                </View>
              );
            })}
          </View>
          <View style={pdfStyles.legendRow}>
            <View style={pdfStyles.legendItem}>
              <View style={[pdfStyles.legendDot, { backgroundColor: '#2563eb' }]} />
              <Text style={pdfStyles.legendText}>Existing</Text>
            </View>
            <View style={pdfStyles.legendItem}>
              <View style={[pdfStyles.legendDot, { backgroundColor: '#16a34a' }]} />
              <Text style={pdfStyles.legendText}>New</Text>
            </View>
            <View style={pdfStyles.legendItem}>
              <View style={[pdfStyles.legendDot, { backgroundColor: '#dc2626' }]} />
              <Text style={pdfStyles.legendText}>Closed</Text>
            </View>
          </View>
          
          {/* Trend Data Table */}
          <View style={pdfStyles.trendTable}>
            <View style={pdfStyles.trendTableHeader}>
              <Text style={pdfStyles.trendTableCellHeader}>Quarter</Text>
              <Text style={pdfStyles.trendTableCellHeader}>Beginning</Text>
              <Text style={pdfStyles.trendTableCellHeader}>New</Text>
              <Text style={pdfStyles.trendTableCellHeader}>Closed</Text>
              <Text style={pdfStyles.trendTableCellHeader}>Net</Text>
              <Text style={pdfStyles.trendTableCellHeader}>End</Text>
            </View>
            {trendData.map((row, i) => (
              <View key={i} style={pdfStyles.trendTableRow}>
                <Text style={pdfStyles.trendTableCellLabel}>{row.label}</Text>
                <Text style={[pdfStyles.trendTableCell, { color: '#2563eb' }]}>{row.beginningCount}</Text>
                <Text style={[pdfStyles.trendTableCell, { color: '#16a34a' }]}>+{row.newMerchants}</Text>
                <Text style={[pdfStyles.trendTableCell, { color: '#dc2626' }]}>{row.closedMerchants}</Text>
                <Text style={[pdfStyles.trendTableCell, { color: row.netChange >= 0 ? '#16a34a' : '#dc2626' }]}>
                  {row.netChange >= 0 ? '+' : ''}{row.netChange}
                </Text>
                <Text style={[pdfStyles.trendTableCell, { color: '#2563eb' }]}>{row.endCount}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <Text style={pdfStyles.sectionTitle}>New Merchants Added</Text>
      <Text style={pdfStyles.sectionSubtitle}>MCC merchants activated in {data.quarterLabel}</Text>
      <View style={pdfStyles.table}>
        <View style={pdfStyles.tableHeader}>
          <Text style={pdfStyles.tableCellHeaderWide}>Merchant</Text>
          <Text style={pdfStyles.tableCellHeader}>Date</Text>
          <Text style={pdfStyles.tableCellHeader}>Location</Text>
        </View>
        {data.newMerchants.slice(0, 25).map((m, i) => (
          <View key={i} style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellWide}>{m.name}{'\n'}ID: {m.id}</Text>
            <Text style={pdfStyles.tableCell}>{formatDate(m.date)}</Text>
            <Text style={pdfStyles.tableCell}>{m.city}, {m.state}</Text>
          </View>
        ))}
        {data.newMerchants.length > 25 && (
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCell}>... and {data.newMerchants.length - 25} more</Text>
          </View>
        )}
      </View>

      <Text style={pdfStyles.sectionTitle}>Closed Merchants</Text>
      <Text style={pdfStyles.sectionSubtitle}>MCC merchants closed in {data.quarterLabel}</Text>
      <View style={pdfStyles.table}>
        <View style={pdfStyles.tableHeader}>
          <Text style={pdfStyles.tableCellHeaderWide}>Merchant</Text>
          <Text style={pdfStyles.tableCellHeader}>Close Date</Text>
          <Text style={pdfStyles.tableCellHeader}>Location</Text>
        </View>
        {data.closedMerchants.slice(0, 25).map((m, i) => (
          <View key={i} style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCellWide}>{m.name}{'\n'}ID: {m.id}</Text>
            <Text style={pdfStyles.tableCell}>{formatDate(m.date)}</Text>
            <Text style={pdfStyles.tableCell}>{m.city}, {m.state}</Text>
          </View>
        ))}
        {data.closedMerchants.length > 25 && (
          <View style={pdfStyles.tableRow}>
            <Text style={pdfStyles.tableCell}>... and {data.closedMerchants.length - 25} more</Text>
          </View>
        )}
      </View>

      <Text style={pdfStyles.footer}>
        Generated on {new Date().toLocaleDateString()} | Vermont State Bank - MDAS
      </Text>
    </Page>
  </Document>
  );
};

export default function QuarterlyMerchantReport() {
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());

  const {
    data: reportData,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery<QuarterlyReportData>({
    queryKey: [`/api/reports/quarterly-merchants?year=${selectedYear}&quarter=${selectedQuarter}`],
    staleTime: 1000 * 60 * 5
  });

  const { data: trendData, isLoading: trendLoading } = useQuery<TrendResponse>({
    queryKey: [`/api/reports/quarterly-merchants/trend?year=${selectedYear}&quarter=${selectedQuarter}`],
    staleTime: 1000 * 60 * 5
  });

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const exportToCSV = (type: 'new' | 'closed' | 'all') => {
    if (!reportData) return;

    let data: MerchantData[] = [];
    let filename = '';

    if (type === 'new') {
      data = reportData.newMerchants;
      filename = `new-mcc-merchants-${selectedYear}-Q${selectedQuarter}.csv`;
    } else if (type === 'closed') {
      data = reportData.closedMerchants;
      filename = `closed-mcc-merchants-${selectedYear}-Q${selectedQuarter}.csv`;
    } else {
      const newWithType = reportData.newMerchants.map(m => ({ ...m, type: 'New' }));
      const closedWithType = reportData.closedMerchants.map(m => ({ ...m, type: 'Closed' }));
      data = [...newWithType, ...closedWithType] as any;
      filename = `mcc-merchants-report-${selectedYear}-Q${selectedQuarter}.csv`;
    }

    const headers = type === 'all' 
      ? ['Type', 'ID', 'Name', 'Client MID', 'Status', 'Date', 'Category', 'City', 'State']
      : ['ID', 'Name', 'Client MID', 'Status', 'Date', 'Category', 'City', 'State'];

    const rows = data.map((m: any) => {
      const baseRow = [
        m.id,
        `"${(m.name || '').replace(/"/g, '""')}"`,
        m.clientMid || '',
        m.status || '',
        formatDate(m.date),
        m.category || '',
        m.city || '',
        m.state || ''
      ];
      return type === 'all' ? [m.type, ...baseRow] : baseRow;
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  };

  const exportToPDF = async () => {
    if (!reportData) return;
    
    const blob = await pdf(<QuarterlyReportPDF data={reportData} formatDate={formatDate} trendData={trendData?.trend} />).toBlob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `quarterly-merchant-report-${selectedYear}-Q${selectedQuarter}.pdf`;
    link.click();
  };

  return (
    <MainLayout>
      <div className="flex-1 p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Quarterly Merchant Report</h1>
            <p className="text-muted-foreground">
              New and Closed MCC Merchants per Quarter
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Quarter" />
              </SelectTrigger>
              <SelectContent>
                {quarters.map(q => (
                  <SelectItem key={q.value} value={q.value}>{q.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportToCSV('all')} disabled={!reportData}>
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF} disabled={!reportData}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </div>
        </div>

        <Separator />

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading report data...</span>
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load report data. Please try again."}
            </AlertDescription>
          </Alert>
        ) : reportData ? (
          <>
            <div className="text-sm text-muted-foreground mb-4">
              Reporting period: {reportData.dateRange.start} to {reportData.dateRange.end}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Beginning of Quarter</CardTitle>
                  <Users className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{reportData.summary.beginningCount}</div>
                  <p className="text-xs text-muted-foreground">
                    MCC merchants on {reportData.dateRange.start}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">New Merchants</CardTitle>
                  <UserPlus className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">+{reportData.summary.newMerchants}</div>
                  <p className="text-xs text-muted-foreground">
                    Activated in {reportData.quarterLabel}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Closed Merchants</CardTitle>
                  <UserMinus className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{reportData.summary.closedMerchants}</div>
                  <p className="text-xs text-muted-foreground">
                    Closed in {reportData.quarterLabel}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Net Change</CardTitle>
                  {reportData.summary.netChange >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-red-600" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${reportData.summary.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {reportData.summary.netChange >= 0 ? '+' : ''}{reportData.summary.netChange}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {reportData.summary.netChange >= 0 ? 'Growth' : 'Decline'} this quarter
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">End of Quarter</CardTitle>
                  <Users className="h-4 w-4 text-blue-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">{reportData.summary.endCount}</div>
                  <p className="text-xs text-muted-foreground">
                    MCC merchants on {reportData.dateRange.end}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Four Quarter Trend Section */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" />
                  Four Quarter Trend
                </CardTitle>
                <CardDescription>
                  Merchant activity over the past 4 quarters
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trendLoading ? (
                  <div className="flex h-64 items-center justify-center">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading trend data...</span>
                  </div>
                ) : trendData?.trend ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Total Merchants Trend Line Chart */}
                    <div>
                      <h4 className="text-sm font-medium mb-4 text-center">Total MCC Merchants</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <LineChart data={trendData.trend}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip />
                          <Legend />
                          <Line 
                            type="monotone" 
                            dataKey="endCount" 
                            name="End of Quarter" 
                            stroke="#2563eb" 
                            strokeWidth={2}
                            dot={{ fill: '#2563eb', strokeWidth: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Single Stacked Bar - End Total Breakdown */}
                    <div>
                      <h4 className="text-sm font-medium mb-4 text-center">End of Quarter Breakdown</h4>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={trendData.trend.map(d => ({
                          ...d,
                          existing: d.endCount - d.newMerchants
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" fontSize={12} />
                          <YAxis fontSize={12} />
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0]?.payload;
                                const total = (data?.existing || 0) + (data?.newMerchants || 0);
                                return (
                                  <div className="bg-white border rounded-lg shadow-lg p-3 text-sm">
                                    <p className="font-medium mb-2">{label}</p>
                                    <p className="text-blue-600">Existing Merchants: {data?.existing || 0}</p>
                                    <p className="text-green-600">New This Quarter: {data?.newMerchants || 0}</p>
                                    <p className="text-red-600">Closed This Quarter: {data?.closedMerchants || 0}</p>
                                    <hr className="my-2" />
                                    <p className="font-bold">End Total: {total}</p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Bar dataKey="existing" name="Existing" fill="#2563eb" stackId="total" />
                          <Bar dataKey="newMerchants" name="New" fill="#16a34a" stackId="total" />
                          <Bar dataKey="closedMerchants" name="Closed" fill="#dc2626" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Trend Data Table */}
                    <div className="lg:col-span-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Quarter</TableHead>
                            <TableHead className="text-right">Beginning</TableHead>
                            <TableHead className="text-right text-green-600">New</TableHead>
                            <TableHead className="text-right text-red-600">Closed</TableHead>
                            <TableHead className="text-right">Net Change</TableHead>
                            <TableHead className="text-right">End</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trendData.trend.map((row) => (
                            <TableRow key={row.label}>
                              <TableCell className="font-medium">{row.label}</TableCell>
                              <TableCell className="text-right text-blue-600">{row.beginningCount}</TableCell>
                              <TableCell className="text-right text-green-600">+{row.newMerchants}</TableCell>
                              <TableCell className="text-right text-red-600">{row.closedMerchants}</TableCell>
                              <TableCell className={`text-right ${row.netChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {row.netChange >= 0 ? '+' : ''}{row.netChange}
                              </TableCell>
                              <TableCell className="text-right text-blue-600">{row.endCount}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No trend data available
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-green-600" />
                        New Merchants Added
                      </CardTitle>
                      <CardDescription>
                        MCC merchants activated in {reportData.quarterLabel}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => exportToCSV('new')} disabled={reportData.newMerchants.length === 0}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {reportData.newMerchants.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No new merchants this quarter
                    </div>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Merchant</TableHead>
                            <TableHead>Activation Date</TableHead>
                            <TableHead>Location</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportData.newMerchants.map((merchant) => (
                            <TableRow key={merchant.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{merchant.name}</div>
                                  <div className="text-xs text-muted-foreground">ID: {merchant.id}</div>
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(merchant.date)}</TableCell>
                              <TableCell>
                                {merchant.city && merchant.state 
                                  ? `${merchant.city}, ${merchant.state}`
                                  : merchant.state || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <UserMinus className="h-5 w-5 text-red-600" />
                        Closed Merchants
                      </CardTitle>
                      <CardDescription>
                        MCC merchants closed in {reportData.quarterLabel}
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => exportToCSV('closed')} disabled={reportData.closedMerchants.length === 0}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {reportData.closedMerchants.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No closed merchants this quarter
                    </div>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Merchant</TableHead>
                            <TableHead>Close Date</TableHead>
                            <TableHead>Location</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {reportData.closedMerchants.map((merchant) => (
                            <TableRow key={merchant.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{merchant.name}</div>
                                  <div className="text-xs text-muted-foreground">ID: {merchant.id}</div>
                                </div>
                              </TableCell>
                              <TableCell>{formatDate(merchant.date)}</TableCell>
                              <TableCell>
                                {merchant.city && merchant.state 
                                  ? `${merchant.city}, ${merchant.state}`
                                  : merchant.state || '-'}
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
          </>
        ) : null}
      </div>
    </MainLayout>
  );
}
