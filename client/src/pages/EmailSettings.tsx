import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, RefreshCw, CheckCircle, XCircle, Send, AlertCircle, Settings2, Inbox, History, Power, Clock, MailOpen, ScrollText, Eye, FileText, ChevronDown, ChevronUp, Home } from "lucide-react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ProviderStatus {
  configured: boolean;
  verified: boolean;
  enabled: boolean;
  senderEmail: string | null;
}

interface EmailStatus {
  globalEnabled: boolean;
  providers: {
    graph: ProviderStatus;
    resend: ProviderStatus;
  };
  activeProvider: string | null;
  message: string;
}

interface EmailOutboxItem {
  id: number;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  body: string | null;
  status: string;
  sentAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  retryCount: number;
  provider: string | null;
}

interface EmailLogItem {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  details: string | null;
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export default function EmailSettings() {
  const [activeTab, setActiveTab] = useState("settings");
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSubject, setTestSubject] = useState("MDAS Email Test");
  const [testBody, setTestBody] = useState("This is a test email from MDAS to verify email configuration.");
  const [testProvider, setTestProvider] = useState<string>("graph");

  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [alertRecipient, setAlertRecipient] = useState("");
  const [alertType, setAlertType] = useState("Processing Alert");
  const [alertTitle, setAlertTitle] = useState("Test Alert");
  const [alertDetails, setAlertDetails] = useState("This is a test alert notification.");
  const [alertSeverity, setAlertSeverity] = useState<string>("info");

  const [viewEmailDialog, setViewEmailDialog] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailOutboxItem | null>(null);
  
  const [providerFilter, setProviderFilter] = useState<string>("all");
  
  const [graphExpanded, setGraphExpanded] = useState(true);
  const [resendExpanded, setResendExpanded] = useState(true);

  const { data: emailStatus, isLoading, refetch } = useQuery<EmailStatus>({
    queryKey: ['/api/email/status'],
    refetchInterval: 30000,
  });

  const { data: outboxData, isLoading: outboxLoading, refetch: refetchOutbox } = useQuery<{ emails: EmailOutboxItem[], total: number }>({
    queryKey: ['/api/email/outbox'],
  });

  const { data: historyData, isLoading: historyLoading, refetch: refetchHistory } = useQuery<{ emails: EmailOutboxItem[], total: number }>({
    queryKey: ['/api/email/history'],
  });

  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery<{ logs: EmailLogItem[], total: number }>({
    queryKey: ['/api/email/logs'],
  });

  const toggleProviderMutation = useMutation({
    mutationFn: async ({ provider, enabled }: { provider: string; enabled: boolean }) => {
      const response = await apiRequest('/api/email/toggle-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, enabled }),
      });
      return response;
    },
    onSuccess: () => {
      refetch();
      refetchLogs();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update",
        description: error.message || "Failed to toggle provider",
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (provider: string): Promise<ConnectionTestResult> => {
      const response = await apiRequest('/api/email/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      return response as unknown as ConnectionTestResult;
    },
    onSuccess: (data) => {
      refetch();
      refetchLogs();
      if (data.success) {
        toast({
          title: "Connection Test Successful",
          description: data.message,
        });
      } else {
        toast({
          title: "Connection Test Failed",
          description: data.message,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      refetchLogs();
      toast({
        title: "Connection Test Failed",
        description: error.message || "Failed to test connection",
        variant: "destructive",
      });
    },
  });

  const sendTestEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [testEmail],
          subject: testSubject,
          body: testBody,
          isHtml: false,
          provider: testProvider,
        }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      refetchOutbox();
      refetchHistory();
      refetchLogs();
      if (data.success) {
        toast({
          title: "Test Email Queued",
          description: `Email queued for delivery via ${testProvider.toUpperCase()}`,
        });
        setShowTestDialog(false);
      } else {
        toast({
          title: "Failed to Send Email",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      refetchLogs();
      toast({
        title: "Failed to Send Email",
        description: error.message || "Failed to send test email",
        variant: "destructive",
      });
    },
  });

  const sendAlertMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/email/send-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: [alertRecipient],
          alertType,
          alertTitle,
          alertDetails,
          severity: alertSeverity,
        }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      refetchOutbox();
      refetchHistory();
      refetchLogs();
      if (data.success) {
        toast({
          title: "Alert Notification Queued",
          description: `Alert queued for delivery`,
        });
        setShowAlertDialog(false);
      } else {
        toast({
          title: "Failed to Send Alert",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      refetchLogs();
      toast({
        title: "Failed to Send Alert",
        description: error.message || "Failed to send alert notification",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-green-500">Sent</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'queued':
        return <Badge className="bg-blue-500">Queued</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getLogLevelBadge = (level: string) => {
    switch (level.toLowerCase()) {
      case 'error':
        return <Badge variant="destructive">ERROR</Badge>;
      case 'warn':
      case 'warning':
        return <Badge className="bg-yellow-500">WARN</Badge>;
      case 'info':
        return <Badge className="bg-blue-500">INFO</Badge>;
      case 'debug':
        return <Badge variant="secondary">DEBUG</Badge>;
      default:
        return <Badge variant="outline">{level}</Badge>;
    }
  };

  const getProviderBadge = (provider: string | null) => {
    switch (provider) {
      case 'graph':
        return <Badge className="bg-blue-600">Graph</Badge>;
      case 'resend':
        return <Badge className="bg-purple-600">Resend</Badge>;
      default:
        return <Badge variant="secondary">{provider || 'Unknown'}</Badge>;
    }
  };

  const viewEmail = (email: EmailOutboxItem) => {
    setSelectedEmail(email);
    setViewEmailDialog(true);
  };

  const filteredOutboxEmails = outboxData?.emails?.filter(email => 
    providerFilter === 'all' || email.provider === providerFilter
  ) || [];

  const filteredHistoryEmails = historyData?.emails?.filter(email => 
    providerFilter === 'all' || email.provider === providerFilter
  ) || [];

  const graphStatus = emailStatus?.providers?.graph;
  const resendStatus = emailStatus?.providers?.resend;
  
  const hasAnyProvider = graphStatus?.configured || resendStatus?.configured;
  const hasActiveProvider = (graphStatus?.enabled && graphStatus?.verified) || (resendStatus?.enabled && resendStatus?.verified);

  const ProviderCard = ({ 
    provider, 
    title, 
    description, 
    status, 
    expanded, 
    setExpanded,
    configInstructions 
  }: { 
    provider: string;
    title: string;
    description: string;
    status: ProviderStatus | undefined;
    expanded: boolean;
    setExpanded: (val: boolean) => void;
    configInstructions: React.ReactNode;
  }) => {
    const isReady = status?.configured && status?.verified && status?.enabled;
    const isConfigured = status?.configured;
    const isVerified = status?.verified;
    const isEnabled = status?.enabled;

    return (
      <Card className={`${isReady ? 'border-green-500/50' : ''}`}>
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className={`h-5 w-5 ${provider === 'graph' ? 'text-blue-500' : 'text-purple-500'}`} />
                <div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription className="text-xs">{description}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isConfigured && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`${provider}-toggle`} className="text-xs text-muted-foreground">
                      {isEnabled ? 'Enabled' : 'Disabled'}
                    </Label>
                    <Switch
                      id={`${provider}-toggle`}
                      checked={isEnabled}
                      onCheckedChange={(checked) => toggleProviderMutation.mutate({ provider, enabled: checked })}
                      disabled={toggleProviderMutation.isPending}
                    />
                  </div>
                )}
                <Badge variant={isReady ? "default" : isConfigured ? "secondary" : "destructive"} className="text-xs">
                  {isReady ? "Ready" : isConfigured && !isVerified ? "Not Verified" : isConfigured && !isEnabled ? "Disabled" : "Not Configured"}
                </Badge>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  {isReady ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : isConfigured && !isVerified ? (
                    <AlertCircle className="h-4 w-4 text-yellow-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <div className="text-sm">
                    {isReady ? "Provider is configured and verified" :
                     isConfigured && !isVerified ? "Run Test Connection to verify" :
                     isConfigured && !isEnabled ? "Provider is disabled" :
                     "Not configured"}
                    {status?.senderEmail && (
                      <div className="text-xs text-muted-foreground">
                        Sender: {status.senderEmail}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {!isConfigured && configInstructions}

              {isConfigured && !isVerified && isEnabled && (
                <Alert className="border-yellow-500">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <AlertTitle className="text-sm">Verification Required</AlertTitle>
                  <AlertDescription className="text-xs">
                    Click "Test Connection" to verify this provider is working correctly.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnectionMutation.mutate(provider)}
                  disabled={testConnectionMutation.isPending || !isConfigured || !isEnabled}
                >
                  {testConnectionMutation.isPending ? (
                    <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3 w-3" />
                  )}
                  Test Connection
                </Button>

                <Button
                  variant="default"
                  size="sm"
                  disabled={!isReady}
                  onClick={() => {
                    setTestProvider(provider);
                    setShowTestDialog(true);
                  }}
                >
                  <Send className="mr-2 h-3 w-3" />
                  Send Test Email
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  const [, setLocation] = useLocation();

  const handleBackToDashboard = () => {
    setLocation("/");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBackToDashboard}
            data-testid="button-back-dashboard"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Dashboard</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mail className="h-6 w-6 text-blue-500" />
              Email Settings
            </h1>
            <p className="text-muted-foreground">Configure and manage email notifications</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Badge variant={hasActiveProvider ? "default" : "destructive"} className="text-sm px-3 py-1">
            {hasActiveProvider ? (
              <>
                <Power className="h-3 w-3 mr-1" />
                Active
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                No Active Provider
              </>
            )}
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="outbox" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Outbox
            {outboxData?.emails && outboxData.emails.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {outboxData.emails.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6 space-y-4">
          <ProviderCard
            provider="graph"
            title="Microsoft Graph API"
            description="Enterprise email via Microsoft 365"
            status={graphStatus}
            expanded={graphExpanded}
            setExpanded={setGraphExpanded}
            configInstructions={
              <Alert>
                <Settings2 className="h-4 w-4" />
                <AlertTitle className="text-sm">Configuration Required</AlertTitle>
                <AlertDescription className="text-xs">
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    <li><code className="bg-muted px-1 rounded">GRAPH_EMAIL_CLIENT_ID</code></li>
                    <li><code className="bg-muted px-1 rounded">GRAPH_EMAIL_CLIENT_SECRET</code></li>
                    <li><code className="bg-muted px-1 rounded">GRAPH_EMAIL_TENANT_ID</code></li>
                    <li><code className="bg-muted px-1 rounded">GRAPH_EMAIL_SENDER</code></li>
                  </ul>
                </AlertDescription>
              </Alert>
            }
          />

          <ProviderCard
            provider="resend"
            title="Resend API"
            description="Developer-friendly transactional email"
            status={resendStatus}
            expanded={resendExpanded}
            setExpanded={setResendExpanded}
            configInstructions={
              <Alert>
                <Settings2 className="h-4 w-4" />
                <AlertTitle className="text-sm">Configuration Required</AlertTitle>
                <AlertDescription className="text-xs">
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    <li><code className="bg-muted px-1 rounded">RESEND_API_KEY</code> - Your Resend API key</li>
                    <li><code className="bg-muted px-1 rounded">RESEND_FROM_EMAIL</code> - Verified sender email</li>
                  </ul>
                </AlertDescription>
              </Alert>
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5" />
                Quick Actions
              </CardTitle>
              <CardDescription>Send test alerts using the active provider</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Dialog open={showAlertDialog} onOpenChange={setShowAlertDialog}>
                  <DialogTrigger asChild>
                    <Button variant="secondary" size="sm" disabled={!hasActiveProvider}>
                      <AlertCircle className="mr-2 h-4 w-4" />
                      Send Test Alert
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Send Test Alert</DialogTitle>
                      <DialogDescription>
                        Send a formatted alert notification using the active provider.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="alertRecipient">Recipient Email</Label>
                        <Input
                          id="alertRecipient"
                          type="email"
                          placeholder="recipient@example.com"
                          value={alertRecipient}
                          onChange={(e) => setAlertRecipient(e.target.value)}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="alertType">Alert Type</Label>
                          <Select value={alertType} onValueChange={setAlertType}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Processing Alert">Processing Alert</SelectItem>
                              <SelectItem value="System Alert">System Alert</SelectItem>
                              <SelectItem value="Security Alert">Security Alert</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="alertSeverity">Severity</Label>
                          <Select value={alertSeverity} onValueChange={setAlertSeverity}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="info">Info</SelectItem>
                              <SelectItem value="warning">Warning</SelectItem>
                              <SelectItem value="error">Error</SelectItem>
                              <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="alertTitle">Alert Title</Label>
                        <Input
                          id="alertTitle"
                          value={alertTitle}
                          onChange={(e) => setAlertTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="alertDetails">Details</Label>
                        <Textarea
                          id="alertDetails"
                          value={alertDetails}
                          onChange={(e) => setAlertDetails(e.target.value)}
                          rows={3}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setShowAlertDialog(false)}>Cancel</Button>
                      <Button
                        onClick={() => sendAlertMutation.mutate()}
                        disabled={!alertRecipient || sendAlertMutation.isPending}
                      >
                        {sendAlertMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <AlertCircle className="mr-2 h-4 w-4" />}
                        Send Alert
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outbox" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Inbox className="h-5 w-5" />
                    Global Email Outbox
                  </CardTitle>
                  <CardDescription>All emails across all providers</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={providerFilter} onValueChange={setProviderFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Filter by provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Providers</SelectItem>
                      <SelectItem value="graph">Graph Only</SelectItem>
                      <SelectItem value="resend">Resend Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => refetchOutbox()}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${outboxLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {outboxLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredOutboxEmails.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOutboxEmails.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell>{getProviderBadge(email.provider)}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{email.recipientEmail}</div>
                            {email.recipientName && (
                              <div className="text-xs text-muted-foreground">{email.recipientName}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{email.subject}</TableCell>
                        <TableCell>{getStatusBadge(email.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(email.createdAt), 'MMM d, h:mm a')}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => viewEmail(email)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MailOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No emails in the outbox</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Email History
                  </CardTitle>
                  <CardDescription>Sent and failed emails</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={providerFilter} onValueChange={setProviderFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Filter by provider" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Providers</SelectItem>
                      <SelectItem value="graph">Graph Only</SelectItem>
                      <SelectItem value="resend">Resend Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${historyLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredHistoryEmails.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead className="w-[80px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistoryEmails.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell>{getProviderBadge(email.provider)}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{email.recipientEmail}</div>
                            {email.recipientName && (
                              <div className="text-xs text-muted-foreground">{email.recipientName}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{email.subject}</TableCell>
                        <TableCell>{getStatusBadge(email.status)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {email.sentAt ? format(new Date(email.sentAt), 'MMM d, h:mm a') : '-'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => viewEmail(email)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No email history available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <ScrollText className="h-5 w-5" />
                    Email Service Logs
                  </CardTitle>
                  <CardDescription>Recent email service activity and errors</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : logsData?.logs && logsData.logs.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[140px]">Timestamp</TableHead>
                        <TableHead className="w-[80px]">Level</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsData.logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs text-muted-foreground font-mono">
                            {format(new Date(log.timestamp), 'MM/dd HH:mm:ss')}
                          </TableCell>
                          <TableCell>{getLogLevelBadge(log.level)}</TableCell>
                          <TableCell className="text-sm">
                            <div>{log.message}</div>
                            {log.details && (
                              <div className="text-xs text-muted-foreground mt-1 font-mono">
                                {log.details}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No email logs available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send a test email via {testProvider === 'graph' ? 'Microsoft Graph' : 'Resend'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="testEmail">Recipient Email</Label>
              <Input
                id="testEmail"
                type="email"
                placeholder="recipient@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="testSubject">Subject</Label>
              <Input
                id="testSubject"
                value={testSubject}
                onChange={(e) => setTestSubject(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="testBody">Message</Label>
              <Textarea
                id="testBody"
                value={testBody}
                onChange={(e) => setTestBody(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(false)}>Cancel</Button>
            <Button
              onClick={() => sendTestEmailMutation.mutate()}
              disabled={!testEmail || sendTestEmailMutation.isPending}
            >
              {sendTestEmailMutation.isPending ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send via {testProvider === 'graph' ? 'Graph' : 'Resend'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewEmailDialog} onOpenChange={setViewEmailDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
            <DialogDescription>
              View full email content and metadata
            </DialogDescription>
          </DialogHeader>
          {selectedEmail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Provider</Label>
                  <div className="mt-1">{getProviderBadge(selectedEmail.provider)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedEmail.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Recipient</Label>
                  <p className="font-medium">{selectedEmail.recipientEmail}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Created</Label>
                  <p>{format(new Date(selectedEmail.createdAt), 'MMM d, yyyy h:mm:ss a')}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Subject</Label>
                <p className="font-medium">{selectedEmail.subject}</p>
              </div>
              
              <div>
                <Label className="text-muted-foreground">Body</Label>
                <div className="mt-1 p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap max-h-[200px] overflow-auto">
                  {selectedEmail.body || '(No body content)'}
                </div>
              </div>

              {selectedEmail.errorMessage && (
                <div>
                  <Label className="text-muted-foreground text-red-500">Error</Label>
                  <p className="text-red-500 text-sm">{selectedEmail.errorMessage}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewEmailDialog(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
