import { ConfidentialClientApplication, type Configuration } from "@azure/msal-node";
import { logger } from "../../shared/logger";

interface GraphEmailConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  senderEmail: string;
}

interface EmailRecipient {
  email: string;
  name?: string;
}

interface EmailAttachment {
  name: string;
  contentType: string;
  contentBytes: string;
}

interface SendEmailOptions {
  to: EmailRecipient[];
  cc?: EmailRecipient[];
  bcc?: EmailRecipient[];
  subject: string;
  body: string;
  isHtml?: boolean;
  attachments?: EmailAttachment[];
  importance?: 'low' | 'normal' | 'high';
  saveToSentItems?: boolean;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class GraphEmailService {
  private msalClient: ConfidentialClientApplication | null = null;
  private config: GraphEmailConfig | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  initialize(): boolean {
    try {
      const clientId = process.env.GRAPH_EMAIL_CLIENT_ID || process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.GRAPH_EMAIL_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;
      const tenantId = process.env.GRAPH_EMAIL_TENANT_ID || process.env.AZURE_TENANT_ID;
      const senderEmail = process.env.GRAPH_EMAIL_SENDER || 'alerts@mdasmail.vermontstatebank.com';

      if (!clientId || !clientSecret || !tenantId) {
        logger.warn('[GRAPH-EMAIL] Azure credentials not configured - email service disabled');
        logger.warn('[GRAPH-EMAIL] Required: GRAPH_EMAIL_CLIENT_ID, GRAPH_EMAIL_CLIENT_SECRET, GRAPH_EMAIL_TENANT_ID');
        return false;
      }

      this.config = {
        clientId,
        clientSecret,
        tenantId,
        senderEmail
      };

      const msalConfig: Configuration = {
        auth: {
          clientId: this.config.clientId,
          authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
          clientSecret: this.config.clientSecret,
        },
        system: {
          loggerOptions: {
            loggerCallback(loglevel, message, containsPii) {
              if (!containsPii && loglevel <= 1) {
                logger.info(`[MSAL-EMAIL] ${message}`);
              }
            },
            piiLoggingEnabled: false,
            logLevel: 2,
          }
        }
      };

      this.msalClient = new ConfidentialClientApplication(msalConfig);
      logger.info('[GRAPH-EMAIL] Email service initialized successfully');
      logger.info(`[GRAPH-EMAIL] Sender email: ${senderEmail}`);
      return true;
    } catch (error) {
      logger.error('[GRAPH-EMAIL] Initialization failed:', error);
      return false;
    }
  }

  isEnabled(): boolean {
    return this.msalClient !== null && this.config !== null;
  }

  getSenderEmail(): string {
    return this.config?.senderEmail || '';
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.msalClient) {
      logger.error('[GRAPH-EMAIL] Service not initialized');
      return null;
    }

    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    try {
      const result = await this.msalClient.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
      });

      if (!result || !result.accessToken) {
        logger.error('[GRAPH-EMAIL] Failed to acquire access token');
        return null;
      }

      this.accessToken = result.accessToken;
      this.tokenExpiry = result.expiresOn || new Date(Date.now() + 3600 * 1000);
      
      logger.info('[GRAPH-EMAIL] Access token acquired successfully');
      return this.accessToken;
    } catch (error) {
      logger.error('[GRAPH-EMAIL] Token acquisition failed:', error);
      return null;
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    if (!this.config) {
      return { success: false, error: 'Email service not configured' };
    }

    const token = await this.getAccessToken();
    if (!token) {
      return { success: false, error: 'Failed to acquire access token' };
    }

    try {
      const message = {
        subject: options.subject,
        body: {
          contentType: options.isHtml !== false ? 'HTML' : 'Text',
          content: options.body
        },
        toRecipients: options.to.map(r => ({
          emailAddress: { address: r.email, name: r.name || r.email }
        })),
        ccRecipients: options.cc?.map(r => ({
          emailAddress: { address: r.email, name: r.name || r.email }
        })) || [],
        bccRecipients: options.bcc?.map(r => ({
          emailAddress: { address: r.email, name: r.name || r.email }
        })) || [],
        importance: options.importance || 'normal',
        attachments: options.attachments?.map(a => ({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: a.name,
          contentType: a.contentType,
          contentBytes: a.contentBytes
        })) || []
      };

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${this.config.senderEmail}/sendMail`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message,
            saveToSentItems: options.saveToSentItems !== false
          })
        }
      );

      if (response.ok || response.status === 202) {
        logger.info(`[GRAPH-EMAIL] Email sent successfully to ${options.to.map(r => r.email).join(', ')}`);
        return { success: true, messageId: response.headers.get('x-ms-request-id') || undefined };
      } else {
        const errorData = await response.text();
        logger.error(`[GRAPH-EMAIL] Send failed: ${response.status} - ${errorData}`);
        return { success: false, error: `HTTP ${response.status}: ${errorData}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('[GRAPH-EMAIL] Send failed:', error);
      return { success: false, error: errorMessage };
    }
  }

  async sendAlertNotification(
    recipients: string[],
    alertType: string,
    alertTitle: string,
    alertDetails: string,
    severity: 'info' | 'warning' | 'critical' = 'info'
  ): Promise<EmailResult> {
    const severityColors = {
      info: '#2196F3',
      warning: '#FF9800',
      critical: '#F44336'
    };

    const severityLabels = {
      info: 'Information',
      warning: 'Warning',
      critical: 'Critical Alert'
    };

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: ${severityColors[severity]}; color: white; padding: 15px 20px; border-radius: 5px 5px 0 0; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
    .alert-type { display: inline-block; background-color: #e0e0e0; padding: 3px 8px; border-radius: 3px; font-size: 12px; margin-bottom: 10px; }
    .details { background-color: white; padding: 15px; border: 1px solid #e0e0e0; border-radius: 3px; margin-top: 15px; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
    .timestamp { color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MDAS ${severityLabels[severity]}</h1>
    </div>
    <div class="content">
      <span class="alert-type">${alertType}</span>
      <h2 style="margin-top: 10px; color: #333;">${alertTitle}</h2>
      <div class="details">
        ${alertDetails}
      </div>
      <p class="timestamp">Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from the Merchant Data Warehouse System (MDAS).</p>
      <p>Vermont State Bank | Internal Use Only</p>
    </div>
  </div>
</body>
</html>`;

    return this.sendEmail({
      to: recipients.map(email => ({ email })),
      subject: `[MDAS ${severityLabels[severity]}] ${alertTitle}`,
      body: html,
      isHtml: true,
      importance: severity === 'critical' ? 'high' : 'normal'
    });
  }

  async sendReportNotification(
    recipients: string[],
    reportName: string,
    reportSummary: string,
    reportLink?: string
  ): Promise<EmailResult> {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #1976D2; color: white; padding: 15px 20px; border-radius: 5px 5px 0 0; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
    .summary { background-color: white; padding: 15px; border: 1px solid #e0e0e0; border-radius: 3px; margin: 15px 0; }
    .btn { display: inline-block; background-color: #1976D2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin-top: 15px; }
    .btn:hover { background-color: #1565C0; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
    .timestamp { color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MDAS Report Ready</h1>
    </div>
    <div class="content">
      <h2 style="margin-top: 0; color: #333;">${reportName}</h2>
      <div class="summary">
        ${reportSummary}
      </div>
      ${reportLink ? `<a href="${reportLink}" class="btn">View Report</a>` : ''}
      <p class="timestamp">Generated: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from the Merchant Data Warehouse System (MDAS).</p>
      <p>Vermont State Bank | Internal Use Only</p>
    </div>
  </div>
</body>
</html>`;

    return this.sendEmail({
      to: recipients.map(email => ({ email })),
      subject: `[MDAS Report] ${reportName}`,
      body: html,
      isHtml: true
    });
  }

  async sendProcessingCompleteNotification(
    recipients: string[],
    filename: string,
    recordCount: number,
    processingTime: string,
    status: 'success' | 'warning' | 'error'
  ): Promise<EmailResult> {
    const statusConfig = {
      success: { color: '#4CAF50', label: 'Completed Successfully', icon: '✓' },
      warning: { color: '#FF9800', label: 'Completed with Warnings', icon: '⚠' },
      error: { color: '#F44336', label: 'Processing Failed', icon: '✗' }
    };

    const config = statusConfig[status];

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: ${config.color}; color: white; padding: 15px 20px; border-radius: 5px 5px 0 0; }
    .header h1 { margin: 0; font-size: 20px; }
    .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 5px 5px; }
    .stats { display: flex; justify-content: space-around; margin: 20px 0; }
    .stat { text-align: center; padding: 15px; background: white; border-radius: 5px; border: 1px solid #e0e0e0; min-width: 100px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #333; }
    .stat-label { font-size: 12px; color: #666; margin-top: 5px; }
    .filename { background-color: #e3f2fd; padding: 10px; border-radius: 3px; font-family: monospace; word-break: break-all; }
    .footer { margin-top: 20px; font-size: 12px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${config.icon} File Processing ${config.label}</h1>
    </div>
    <div class="content">
      <p><strong>File:</strong></p>
      <div class="filename">${filename}</div>
      
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${recordCount.toLocaleString()}</div>
          <div class="stat-label">Records Processed</div>
        </div>
        <div class="stat">
          <div class="stat-value">${processingTime}</div>
          <div class="stat-label">Processing Time</div>
        </div>
      </div>
      
      <p style="font-size: 12px; color: #999;">
        Processed: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST
      </p>
    </div>
    <div class="footer">
      <p>This is an automated notification from the Merchant Data Warehouse System (MDAS).</p>
      <p>Vermont State Bank | Internal Use Only</p>
    </div>
  </div>
</body>
</html>`;

    return this.sendEmail({
      to: recipients.map(email => ({ email })),
      subject: `[MDAS] File Processing ${config.label}: ${filename}`,
      body: html,
      isHtml: true,
      importance: status === 'error' ? 'high' : 'normal'
    });
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.isEnabled()) {
      return { success: false, message: 'Email service not configured' };
    }

    const token = await this.getAccessToken();
    if (!token) {
      return { success: false, message: 'Failed to acquire access token - check Azure AD credentials' };
    }

    try {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/users/${this.config?.senderEmail}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const userData = await response.json();
        return { 
          success: true, 
          message: `Connection successful. Sender: ${userData.mail || userData.userPrincipalName}` 
        };
      } else if (response.status === 404) {
        return { 
          success: false, 
          message: `Sender mailbox not found: ${this.config?.senderEmail}. Ensure the mailbox exists in Exchange Online.` 
        };
      } else {
        const error = await response.text();
        return { success: false, message: `API error: ${response.status} - ${error}` };
      }
    } catch (error) {
      return { 
        success: false, 
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
}

export const graphEmailService = new GraphEmailService();
