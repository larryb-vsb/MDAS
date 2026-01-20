import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Mail, RefreshCw, CheckCircle, XCircle, Send, AlertCircle, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface EmailStatus {
  enabled: boolean;
  senderEmail: string | null;
  configured: boolean;
  message: string;
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export default function EmailConfiguration() {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Email Notification Service
        </CardTitle>
        <CardDescription>
          Configure and test Microsoft Graph API email notifications
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
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="test-email">Recipient Email</Label>
                  <Input
                    id="test-email"
                    type="email"
                    placeholder="recipient@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-subject">Subject</Label>
                  <Input
                    id="test-subject"
                    value={testSubject}
                    onChange={(e) => setTestSubject(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="test-body">Message</Label>
                  <Textarea
                    id="test-body"
                    rows={3}
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
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
                <DialogTitle>Send Test Alert Notification</DialogTitle>
                <DialogDescription>
                  Send a test alert notification using the MDAS alert template.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="alert-recipient">Recipient Email</Label>
                  <Input
                    id="alert-recipient"
                    type="email"
                    placeholder="recipient@example.com"
                    value={alertRecipient}
                    onChange={(e) => setAlertRecipient(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alert-severity">Severity</Label>
                  <Select value={alertSeverity} onValueChange={setAlertSeverity}>
                    <SelectTrigger id="alert-severity">
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alert-type">Alert Type</Label>
                  <Input
                    id="alert-type"
                    value={alertType}
                    onChange={(e) => setAlertType(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alert-title">Alert Title</Label>
                  <Input
                    id="alert-title"
                    value={alertTitle}
                    onChange={(e) => setAlertTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alert-details">Alert Details</Label>
                  <Textarea
                    id="alert-details"
                    rows={3}
                    value={alertDetails}
                    onChange={(e) => setAlertDetails(e.target.value)}
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
  );
}
