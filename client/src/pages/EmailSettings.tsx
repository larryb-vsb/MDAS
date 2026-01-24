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
import { Mail, RefreshCw, CheckCircle, XCircle, Send, AlertCircle, Settings2, Inbox, History, Power, Clock, MailOpen } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

interface EmailStatus {
  enabled: boolean;
  senderEmail: string | null;
  configured: boolean;
  message: string;
}

interface EmailOutboxItem {
  id: number;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: string;
  sentAt: string | null;
  createdAt: string;
  errorMessage: string | null;
  retryCount: number;
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

  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [alertRecipient, setAlertRecipient] = useState("");
  const [alertType, setAlertType] = useState("Processing Alert");
  const [alertTitle, setAlertTitle] = useState("Test Alert");
  const [alertDetails, setAlertDetails] = useState("This is a test alert notification.");
  const [alertSeverity, setAlertSeverity] = useState<string>("info");

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

  const testConnectionMutation = useMutation({
    mutationFn: async (): Promise<ConnectionTestResult> => {
      const response = await apiRequest('/api/email/test-connection', {
        method: 'POST',
      });
      return response as unknown as ConnectionTestResult;
    },
    onSuccess: (data) => {
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
        }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      if (data.success) {
        toast({
          title: "Test Email Sent",
          description: `Email sent successfully to ${testEmail}`,
        });
        setShowTestDialog(false);
        refetchOutbox();
        refetchHistory();
      } else {
        toast({
          title: "Failed to Send Email",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
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
      if (data.success) {
        toast({
          title: "Alert Notification Sent",
          description: `Alert sent successfully to ${alertRecipient}`,
        });
        setShowAlertDialog(false);
        refetchOutbox();
        refetchHistory();
      } else {
        toast({
          title: "Failed to Send Alert",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-blue-500" />
            Email Settings
          </h1>
          <p className="text-muted-foreground">Configure and manage email notifications</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={emailStatus?.enabled ? "default" : "destructive"} className="text-sm px-3 py-1">
            {emailStatus?.enabled ? (
              <>
                <Power className="h-3 w-3 mr-1" />
                Active
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                Inactive
              </>
            )}
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="outbox" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Outbox
            {outboxData?.emails && outboxData.emails.filter(e => e.status === 'pending' || e.status === 'queued').length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {outboxData.emails.filter(e => e.status === 'pending' || e.status === 'queued').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Service Configuration
              </CardTitle>
              <CardDescription>
                Microsoft Graph API email notification settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  {isLoading ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : emailStatus?.enabled ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <div>
                    <div className="font-medium">
                      {isLoading ? "Checking status..." : emailStatus?.message}
                    </div>
                    {emailStatus?.senderEmail && (
                      <div className="text-sm text-muted-foreground">
                        Sender: {emailStatus.senderEmail}
                      </div>
                    )}
                  </div>
                </div>
                <Badge variant={emailStatus?.enabled ? "default" : "destructive"}>
                  {emailStatus?.enabled ? "Active" : "Not Configured"}
                </Badge>
              </div>

              {!emailStatus?.enabled && !isLoading && (
                <Alert>
                  <Settings2 className="h-4 w-4" />
                  <AlertTitle>Configuration Required</AlertTitle>
                  <AlertDescription>
                    <p className="mb-2">
                      Email notifications require Microsoft Azure AD app registration. Add the following environment variables:
                    </p>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      <li><code className="bg-muted px-1 rounded">GRAPH_EMAIL_CLIENT_ID</code> - Azure AD Application (client) ID</li>
                      <li><code className="bg-muted px-1 rounded">GRAPH_EMAIL_CLIENT_SECRET</code> - Client secret value</li>
                      <li><code className="bg-muted px-1 rounded">GRAPH_EMAIL_TENANT_ID</code> - Azure AD Directory (tenant) ID</li>
                      <li><code className="bg-muted px-1 rounded">GRAPH_EMAIL_SENDER</code> - Sender email address (licensed M365 mailbox)</li>
                    </ul>
                    <p className="mt-2 text-sm">
                      The Azure AD app requires <strong>Mail.Send</strong> application permission with admin consent.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => testConnectionMutation.mutate()}
                  disabled={testConnectionMutation.isPending || !emailStatus?.enabled}
                >
                  {testConnectionMutation.isPending ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Test Connection
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isLoading}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh Status
                </Button>

                <Dialog open={showTestDialog} onOpenChange={setShowTestDialog}>
                  <DialogTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={!emailStatus?.enabled}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Send Test Email
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Send Test Email</DialogTitle>
                      <DialogDescription>
                        Send a test email to verify the email service is working correctly.
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
                      <Button variant="outline" onClick={() => setShowTestDialog(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => sendTestEmailMutation.mutate()}
                        disabled={!testEmail || sendTestEmailMutation.isPending}
                      >
                        {sendTestEmailMutation.isPending ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Email
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={showAlertDialog} onOpenChange={setShowAlertDialog}>
                  <DialogTrigger asChild>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!emailStatus?.enabled}
                    >
                      <AlertCircle className="mr-2 h-4 w-4" />
                      Send Test Alert
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Send Test Alert</DialogTitle>
                      <DialogDescription>
                        Send a formatted alert notification to test the alert email template.
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
                      <Button variant="outline" onClick={() => setShowAlertDialog(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => sendAlertMutation.mutate()}
                        disabled={!alertRecipient || sendAlertMutation.isPending}
                      >
                        {sendAlertMutation.isPending ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <AlertCircle className="mr-2 h-4 w-4" />
                            Send Alert
                          </>
                        )}
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
                    Email Outbox
                  </CardTitle>
                  <CardDescription>Pending and queued emails</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchOutbox()}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${outboxLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {outboxLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : outboxData?.emails && outboxData.emails.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Retries</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outboxData.emails.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{email.recipientEmail}</div>
                            {email.recipientName && (
                              <div className="text-sm text-muted-foreground">{email.recipientName}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">{email.subject}</TableCell>
                        <TableCell>{getStatusBadge(email.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(email.createdAt), 'MMM d, yyyy h:mm a')}
                        </TableCell>
                        <TableCell>{email.retryCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MailOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending emails in the outbox</p>
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
                <Button variant="outline" size="sm" onClick={() => refetchHistory()}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${historyLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {historyLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : historyData?.emails && historyData.emails.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyData.emails.map((email) => (
                      <TableRow key={email.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{email.recipientEmail}</div>
                            {email.recipientName && (
                              <div className="text-sm text-muted-foreground">{email.recipientName}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">{email.subject}</TableCell>
                        <TableCell>{getStatusBadge(email.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {email.sentAt ? format(new Date(email.sentAt), 'MMM d, yyyy h:mm a') : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-red-500 max-w-[200px] truncate">
                          {email.errorMessage || '-'}
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
      </Tabs>
    </div>
  );
}
