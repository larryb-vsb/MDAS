import { APP_VERSION, BUILD_DATE } from "@shared/version";
import MainLayout from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Code, Book, Database, Upload, Users, Lock, BarChart3, FileText, ScrollText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface ReplitMdResponse {
  success: boolean;
  content: string;
  lastModified: string;
}

export default function About() {
  // Fetch replit.md content
  const { data: replitMdData, isLoading: isLoadingReplitMd } = useQuery<ReplitMdResponse>({
    queryKey: ["/api/system/replit-md"],
  });

  return (
    <MainLayout>
      <div className="container mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">About</h1>
          <p className="text-muted-foreground">
            System information and API documentation
          </p>
        </div>

        <Separator />

        {/* Version Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Code className="mr-2 h-5 w-5 text-primary" />
              Application Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex justify-between items-center">
                <span className="font-medium">Application:</span>
                <span>Merchant Datawarehouse and Automation System (MDAS)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Version:</span>
                <Badge variant="outline" className="text-primary">{APP_VERSION}</Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Build Date:</span>
                <span>{BUILD_DATE}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="font-medium">Environment:</span>
                <Badge variant="outline" className={import.meta.env.MODE === "production" ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-blue-50 text-blue-700 border-blue-200"}>
                  {import.meta.env.MODE === "production" ? "Production" : "Development"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Project Documentation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <ScrollText className="mr-2 h-5 w-5 text-primary" />
              Project Documentation
            </CardTitle>
            <CardDescription>
              Complete project documentation from replit.md
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingReplitMd ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : (
              <div 
                className="max-h-[600px] overflow-y-auto border rounded-lg p-4 bg-gray-50 dark:bg-gray-900"
                data-testid="replit-md-content"
              >
                <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                  {replitMdData?.content || 'Documentation not available'}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Documentation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Book className="mr-2 h-5 w-5 text-primary" />
              API Documentation
            </CardTitle>
            <CardDescription>
              Comprehensive guide to all available API endpoints
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="auth" className="w-full">
              <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8">
                <TabsTrigger value="auth"><Lock className="h-4 w-4 mr-1" />Auth</TabsTrigger>
                <TabsTrigger value="users"><Users className="h-4 w-4 mr-1" />Users</TabsTrigger>
                <TabsTrigger value="merchants"><Database className="h-4 w-4 mr-1" />Merchants</TabsTrigger>
                <TabsTrigger value="tddf"><FileText className="h-4 w-4 mr-1" />TDDF</TabsTrigger>
                <TabsTrigger value="upload"><Upload className="h-4 w-4 mr-1" />Upload</TabsTrigger>
                <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" />Dashboard</TabsTrigger>
                <TabsTrigger value="reports"><FileText className="h-4 w-4 mr-1" />Reports</TabsTrigger>
                <TabsTrigger value="system"><Code className="h-4 w-4 mr-1" />System</TabsTrigger>
              </TabsList>

              {/* Authentication APIs */}
              <TabsContent value="auth" className="space-y-4 mt-4">
                <h3 className="text-lg font-semibold">Authentication APIs</h3>
                <div className="space-y-4">
                  <ApiEndpoint
                    method="POST"
                    endpoint="/api/login"
                    description="Authenticate user with username and password"
                    requestBody={{
                      username: "string",
                      password: "string"
                    }}
                    response={{
                      id: "number",
                      username: "string",
                      email: "string",
                      role: "string"
                    }}
                  />
                  <ApiEndpoint
                    method="POST"
                    endpoint="/api/logout"
                    description="End current user session"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/user"
                    description="Get current authenticated user information"
                    response={{
                      id: "number",
                      username: "string",
                      email: "string",
                      firstName: "string",
                      lastName: "string",
                      role: "string",
                      authType: "local | oauth | hybrid"
                    }}
                  />
                  <ApiEndpoint
                    method="PUT"
                    endpoint="/api/user/profile"
                    description="Update current user's profile information"
                    requestBody={{
                      firstName: "string",
                      lastName: "string",
                      email: "string",
                      username: "string (optional for oauth users)"
                    }}
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/auth/microsoft/status"
                    description="Check Microsoft OAuth configuration status"
                  />
                </div>
              </TabsContent>

              {/* User Management APIs */}
              <TabsContent value="users" className="space-y-4 mt-4">
                <h3 className="text-lg font-semibold">User Management APIs</h3>
                <div className="space-y-4">
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/users"
                    description="Get list of all users (admin only)"
                    response="Array of user objects"
                  />
                  <ApiEndpoint
                    method="POST"
                    endpoint="/api/users"
                    description="Create new user (admin only)"
                    requestBody={{
                      username: "string",
                      password: "string",
                      email: "string",
                      firstName: "string",
                      lastName: "string",
                      role: "user | admin"
                    }}
                  />
                  <ApiEndpoint
                    method="DELETE"
                    endpoint="/api/users/:id"
                    description="Delete user by ID (admin only)"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/api-users"
                    description="Get list of API users (admin only)"
                  />
                  <ApiEndpoint
                    method="POST"
                    endpoint="/api/api-users"
                    description="Create new API user (admin only)"
                    requestBody={{
                      username: "string",
                      permissions: "string[]"
                    }}
                  />
                </div>
              </TabsContent>

              {/* Merchant APIs */}
              <TabsContent value="merchants" className="space-y-4 mt-4">
                <h3 className="text-lg font-semibold">Merchant APIs</h3>
                <div className="space-y-4">
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/merchants"
                    description="Get list of all merchants"
                    queryParams={{
                      status: "active | inactive | all",
                      type: "ach | mcc | all",
                      limit: "number",
                      offset: "number"
                    }}
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/merchants/:id"
                    description="Get merchant details by ID"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/merchants/search"
                    description="Search merchants by name, DBA, or merchant ID"
                    queryParams={{
                      query: "string",
                      type: "ach | mcc | all"
                    }}
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/api-merchants"
                    description="Get merchant data from API endpoint"
                  />
                </div>
              </TabsContent>

              {/* TDDF APIs */}
              <TabsContent value="tddf" className="space-y-4 mt-4">
                <h3 className="text-lg font-semibold">TDDF Processing APIs</h3>
                
                <div className="space-y-6">
                  {/* File Management */}
                  <div>
                    <h4 className="font-semibold text-md mb-3 text-primary">File Management</h4>
                    <div className="space-y-4">
                      <ApiEndpoint
                        method="POST"
                        endpoint="/api/tddf-api/upload"
                        description="Upload TDDF file for processing"
                        requestBody="FormData with file"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/files"
                        description="Get list of all TDDF files"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/files/:fileId/content"
                        description="Get content of a specific TDDF file"
                      />
                      <ApiEndpoint
                        method="POST"
                        endpoint="/api/tddf-api/files/delete"
                        description="Delete TDDF file by ID"
                        requestBody={{
                          fileId: "number"
                        }}
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/queue"
                        description="Get queued TDDF files awaiting processing"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/search-filename"
                        description="Search TDDF files by filename"
                        queryParams={{
                          filename: "string"
                        }}
                      />
                    </div>
                  </div>

                  {/* Records Management */}
                  <div>
                    <h4 className="font-semibold text-md mb-3 text-primary">Records Management</h4>
                    <div className="space-y-4">
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf/records"
                        description="Get TDDF records with filtering"
                        queryParams={{
                          merchantId: "string",
                          startDate: "ISO date",
                          endDate: "ISO date",
                          recordType: "DT | BH | P1 | P2",
                          limit: "number"
                        }}
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf/batch-headers"
                        description="Get batch header records"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf/transactions"
                        description="Get transaction detail records"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/records/:fileId"
                        description="Get all records for a specific file"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/all-records"
                        description="Get all TDDF records across all files"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/all-archive-records"
                        description="Get all archived TDDF records"
                      />
                      <ApiEndpoint
                        method="DELETE"
                        endpoint="/api/tddf-api/records/bulk-delete"
                        description="Bulk delete TDDF records"
                        requestBody={{
                          recordIds: "number[]"
                        }}
                      />
                    </div>
                  </div>

                  {/* Schema Management */}
                  <div>
                    <h4 className="font-semibold text-md mb-3 text-primary">Schema Management</h4>
                    <div className="space-y-4">
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/schemas"
                        description="Get all TDDF schemas"
                      />
                      <ApiEndpoint
                        method="POST"
                        endpoint="/api/tddf-api/schemas"
                        description="Create new TDDF schema"
                        requestBody={{
                          name: "string",
                          description: "string",
                          fields: "FieldDefinition[]"
                        }}
                      />
                      <ApiEndpoint
                        method="PUT"
                        endpoint="/api/tddf-api/field-config/:schemaId"
                        description="Update field configuration for a schema"
                        requestBody={{
                          fieldConfig: "object"
                        }}
                      />
                    </div>
                  </div>

                  {/* API Keys Management */}
                  <div>
                    <h4 className="font-semibold text-md mb-3 text-primary">API Keys Management</h4>
                    <div className="space-y-4">
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/keys"
                        description="Get all TDDF API keys"
                      />
                      <ApiEndpoint
                        method="POST"
                        endpoint="/api/tddf-api/keys"
                        description="Create new TDDF API key"
                        requestBody={{
                          name: "string",
                          permissions: "string[]"
                        }}
                      />
                      <ApiEndpoint
                        method="DELETE"
                        endpoint="/api/tddf-api/keys/:id"
                        description="Delete TDDF API key by ID"
                      />
                    </div>
                  </div>

                  {/* Monitoring */}
                  <div>
                    <h4 className="font-semibold text-md mb-3 text-primary">Monitoring & Analytics</h4>
                    <div className="space-y-4">
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/monitoring"
                        description="Get TDDF processing monitoring data"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/monitoring/last-connection"
                        description="Get last API connection information"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/monitoring/hosts"
                        description="Get list of connected hosts"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/monitoring/connections"
                        description="Get active API connections"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/monitoring/host-approvals"
                        description="Get host approval status"
                      />
                      <ApiEndpoint
                        method="PUT"
                        endpoint="/api/tddf-api/monitoring/host-approvals/:id"
                        description="Update host approval status"
                        requestBody={{
                          approved: "boolean"
                        }}
                      />
                    </div>
                  </div>

                  {/* Daily Statistics */}
                  <div>
                    <h4 className="font-semibold text-md mb-3 text-primary">Daily Statistics</h4>
                    <div className="space-y-4">
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/daily/stats"
                        description="Get daily processing statistics"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/daily/day-breakdown"
                        description="Get detailed breakdown by day"
                      />
                      <ApiEndpoint
                        method="GET"
                        endpoint="/api/tddf-api/daily/recent-activity"
                        description="Get recent processing activity"
                      />
                      <ApiEndpoint
                        method="POST"
                        endpoint="/api/tddf-api/daily/init-tables"
                        description="Initialize daily statistics tables"
                      />
                      <ApiEndpoint
                        method="POST"
                        endpoint="/api/tddf-api/daily/import"
                        description="Import daily statistics data"
                        requestBody={{
                          date: "ISO date",
                          data: "object"
                        }}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Upload APIs */}
              <TabsContent value="upload" className="space-y-4 mt-4">
                <h3 className="text-lg font-semibold">File Upload APIs</h3>
                <div className="space-y-4">
                  <ApiEndpoint
                    method="POST"
                    endpoint="/api/uploader/upload"
                    description="Upload file for processing"
                    requestBody="FormData with file"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/uploads/history"
                    description="Get upload history"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/uploader/dashboard-metrics"
                    description="Get uploader dashboard metrics"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/uploader/storage-config"
                    description="Get storage configuration details"
                  />
                  <ApiEndpoint
                    method="DELETE"
                    endpoint="/api/uploader/uploads/:id"
                    description="Delete uploaded file by ID"
                  />
                </div>
              </TabsContent>

              {/* Dashboard APIs */}
              <TabsContent value="dashboard" className="space-y-4 mt-4">
                <h3 className="text-lg font-semibold">Dashboard APIs</h3>
                <div className="space-y-4">
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/dashboard/cached-metrics"
                    description="Get cached dashboard metrics (fast, pre-aggregated)"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/dashboard/merchants"
                    description="Get merchant summary statistics"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/dashboard/transactions"
                    description="Get transaction summary statistics"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/charts/monthly"
                    description="Get monthly chart data"
                    queryParams={{
                      year: "number",
                      merchantType: "ach | mcc | all"
                    }}
                  />
                </div>
              </TabsContent>

              {/* Reports APIs */}
              <TabsContent value="reports" className="space-y-4 mt-4">
                <h3 className="text-lg font-semibold">Reports APIs</h3>
                <div className="space-y-4">
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/reports/merchant-summary"
                    description="Generate merchant summary report"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/reports/transaction-summary"
                    description="Generate transaction summary report"
                    queryParams={{
                      startDate: "ISO date",
                      endDate: "ISO date",
                      format: "json | csv | pdf"
                    }}
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/duplicates/status"
                    description="Get duplicate detection status"
                  />
                </div>
              </TabsContent>

              {/* System APIs */}
              <TabsContent value="system" className="space-y-4 mt-4">
                <h3 className="text-lg font-semibold">System APIs</h3>
                <div className="space-y-4">
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/system/info"
                    description="Get system information and environment details"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/pools/info"
                    description="Get database connection pool statistics"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/settings/database"
                    description="Get database statistics and table information"
                  />
                  <ApiEndpoint
                    method="POST"
                    endpoint="/api/settings/backup"
                    description="Create database backup"
                  />
                  <ApiEndpoint
                    method="GET"
                    endpoint="/api/schema/versions"
                    description="Get database schema version information"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

// Helper component for displaying API endpoints
function ApiEndpoint({
  method,
  endpoint,
  description,
  requestBody,
  response,
  queryParams
}: {
  method: string;
  endpoint: string;
  description: string;
  requestBody?: any;
  response?: any;
  queryParams?: any;
}) {
  const methodColors = {
    GET: "bg-blue-100 text-blue-700 border-blue-200",
    POST: "bg-green-100 text-green-700 border-green-200",
    PUT: "bg-yellow-100 text-yellow-700 border-yellow-200",
    DELETE: "bg-red-100 text-red-700 border-red-200",
    PATCH: "bg-purple-100 text-purple-700 border-purple-200"
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Badge className={methodColors[method as keyof typeof methodColors] || "bg-gray-100 text-gray-700"}>
          {method}
        </Badge>
        <div className="flex-1">
          <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{endpoint}</code>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
      </div>
      
      {queryParams && (
        <div className="ml-12">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Query Parameters:</p>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {JSON.stringify(queryParams, null, 2)}
          </pre>
        </div>
      )}
      
      {requestBody && (
        <div className="ml-12">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Request Body:</p>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {JSON.stringify(requestBody, null, 2)}
          </pre>
        </div>
      )}
      
      {response && (
        <div className="ml-12">
          <p className="text-xs font-semibold text-muted-foreground mb-1">Response:</p>
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {typeof response === 'string' ? response : JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
