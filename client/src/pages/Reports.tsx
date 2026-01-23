import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  FileBarChart, 
  Calendar, 
  Clock, 
  Play, 
  Settings2,
  TrendingUp,
  Users,
  Building2,
  ChevronRight,
  CalendarClock
} from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";

interface ReportConfig {
  id: string;
  name: string;
  description: string;
  category: "merchant" | "transaction" | "compliance" | "analytics";
  icon: React.ReactNode;
  path: string;
  status: "available" | "coming_soon";
  lastRun?: string;
  scheduleEnabled?: boolean;
}

const availableReports: ReportConfig[] = [
  {
    id: "daily-processing",
    name: "Daily Processing Report",
    description: "Transaction summary by merchant/association for a specific date with auth, purchase, credit, and net amounts",
    category: "transaction",
    icon: <FileBarChart className="h-5 w-5" />,
    path: "/reports/daily-processing",
    status: "available",
    lastRun: "2026-01-23",
    scheduleEnabled: false,
  },
  {
    id: "quarterly-merchants",
    name: "Quarterly Merchant Report",
    description: "New and closed MCC merchants by quarter with activation and close dates",
    category: "merchant",
    icon: <Building2 className="h-5 w-5" />,
    path: "/reports/quarterly-merchants",
    status: "available",
    lastRun: "2026-01-09",
    scheduleEnabled: false,
  },
  {
    id: "type3-demographics",
    name: "Type 3 (ACH) Merchant Demographics",
    description: "Complete demographic data for all ACH merchants including contact info, banking details, and business information",
    category: "merchant",
    icon: <Users className="h-5 w-5" />,
    path: "/reports/type3-demographics",
    status: "available",
    lastRun: "2026-01-23",
    scheduleEnabled: false,
  },
  {
    id: "monthly-activity",
    name: "Monthly Activity Summary",
    description: "Transaction volume and merchant activity by month",
    category: "transaction",
    icon: <TrendingUp className="h-5 w-5" />,
    path: "/reports/monthly-activity",
    status: "coming_soon",
  },
  {
    id: "merchant-compliance",
    name: "Merchant Compliance Report",
    description: "ACH deposit compliance status for all active merchants",
    category: "compliance",
    icon: <Users className="h-5 w-5" />,
    path: "/reports/compliance",
    status: "coming_soon",
  },
  {
    id: "transaction-analytics",
    name: "Transaction Analytics",
    description: "Detailed transaction analysis with trend visualization",
    category: "analytics",
    icon: <FileBarChart className="h-5 w-5" />,
    path: "/reports/analytics",
    status: "coming_soon",
  },
];

const scheduledReports = [
  {
    id: "1",
    reportName: "Quarterly Merchant Report",
    schedule: "First Monday of each quarter",
    nextRun: "2026-04-06 08:00 AM",
    status: "active",
  },
];

function getCategoryBadge(category: ReportConfig["category"]) {
  const styles = {
    merchant: "bg-blue-100 text-blue-800",
    transaction: "bg-green-100 text-green-800",
    compliance: "bg-amber-100 text-amber-800",
    analytics: "bg-purple-100 text-purple-800",
  };
  return styles[category];
}

export default function Reports() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("available");

  const handleRunReport = (report: ReportConfig) => {
    if (report.status === "available") {
      navigate(report.path);
    }
  };

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports Center</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Run and schedule reports for merchant data and transaction analysis
            </p>
          </div>
          <Button variant="outline" disabled>
            <CalendarClock className="h-4 w-4 mr-2" />
            Schedule New Report
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="available" className="flex items-center gap-2">
              <FileBarChart className="h-4 w-4" />
              Available Reports
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Scheduled
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Run History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableReports.map((report) => (
                <Card 
                  key={report.id} 
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    report.status === "coming_soon" ? "opacity-60" : ""
                  }`}
                  onClick={() => handleRunReport(report)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                          {report.icon}
                        </div>
                        <div>
                          <CardTitle className="text-lg">{report.name}</CardTitle>
                          <Badge 
                            variant="secondary" 
                            className={`mt-1 text-xs ${getCategoryBadge(report.category)}`}
                          >
                            {report.category}
                          </Badge>
                        </div>
                      </div>
                      {report.status === "coming_soon" ? (
                        <Badge variant="outline">Coming Soon</Badge>
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="mb-3">
                      {report.description}
                    </CardDescription>
                    {report.status === "available" && (
                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="text-sm text-gray-500">
                          {report.lastRun && (
                            <span>Last run: {report.lastRun}</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                            disabled
                          >
                            <Settings2 className="h-4 w-4 mr-1" />
                            Schedule
                          </Button>
                          <Button 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRunReport(report);
                            }}
                          >
                            <Play className="h-4 w-4 mr-1" />
                            Run
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="scheduled" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Scheduled Reports</CardTitle>
                <CardDescription>
                  Reports configured to run automatically on a schedule
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scheduledReports.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No scheduled reports configured</p>
                    <p className="text-sm mt-1">Schedule a report to have it run automatically</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {scheduledReports.map((scheduled) => (
                      <div 
                        key={scheduled.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{scheduled.reportName}</p>
                          <p className="text-sm text-gray-500">{scheduled.schedule}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant={scheduled.status === "active" ? "default" : "secondary"}>
                            {scheduled.status}
                          </Badge>
                          <p className="text-sm text-gray-500 mt-1">Next: {scheduled.nextRun}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Report Run History</CardTitle>
                <CardDescription>
                  Previously generated reports and their results
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No report history available</p>
                  <p className="text-sm mt-1">Run a report to see it appear here</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
