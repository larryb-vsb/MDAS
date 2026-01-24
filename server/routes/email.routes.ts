import { Router } from "express";
import { graphEmailService } from "../services/graph-email.service";
import { logger } from "../../shared/logger";

const router = Router();

// Track provider states
const providerState = {
  graph: { enabled: true, verified: false },
  resend: { enabled: true, verified: false }
};

// Email logs stored in memory (last 100 entries)
const emailLogs: Array<{ id: number; timestamp: string; level: string; message: string; details: string | null }> = [];
let logIdCounter = 1;

function addEmailLog(level: string, message: string, details?: string) {
  const log = {
    id: logIdCounter++,
    timestamp: new Date().toISOString(),
    level,
    message,
    details: details || null
  };
  emailLogs.unshift(log);
  if (emailLogs.length > 100) {
    emailLogs.pop();
  }
}

function isGraphConfigured(): boolean {
  return graphEmailService.isEnabled();
}

function isResendConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

function getActiveProvider(): string | null {
  if (isGraphConfigured() && providerState.graph.enabled && providerState.graph.verified) return 'graph';
  if (isResendConfigured() && providerState.resend.enabled && providerState.resend.verified) return 'resend';
  return null;
}

router.get("/status", async (req, res) => {
  try {
    const graphConfigured = isGraphConfigured();
    const resendConfigured = isResendConfigured();
    const activeProvider = getActiveProvider();
    
    res.json({
      globalEnabled: !!activeProvider,
      activeProvider,
      providers: {
        graph: {
          configured: graphConfigured,
          verified: providerState.graph.verified,
          enabled: providerState.graph.enabled,
          senderEmail: graphConfigured ? graphEmailService.getSenderEmail() : null
        },
        resend: {
          configured: resendConfigured,
          verified: providerState.resend.verified,
          enabled: providerState.resend.enabled,
          senderEmail: resendConfigured ? process.env.RESEND_FROM_EMAIL : null
        }
      },
      message: activeProvider 
        ? `Email service active via ${activeProvider}`
        : 'No active email provider'
    });
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Status check failed:', error);
    res.status(500).json({ 
      globalEnabled: false,
      providers: {
        graph: { configured: false, verified: false, enabled: false, senderEmail: null },
        resend: { configured: false, verified: false, enabled: false, senderEmail: null }
      },
      error: 'Failed to check email service status' 
    });
  }
});

// Toggle individual provider on/off
router.post("/toggle-provider", async (req, res) => {
  try {
    const { provider, enabled } = req.body;
    if (provider !== 'graph' && provider !== 'resend') {
      return res.status(400).json({ success: false, error: 'Invalid provider' });
    }
    providerState[provider as 'graph' | 'resend'].enabled = enabled;
    addEmailLog('info', `${provider} provider ${enabled ? 'enabled' : 'disabled'} by user`);
    logger.info(`[EMAIL-ROUTES] ${provider} provider ${enabled ? 'enabled' : 'disabled'}`);
    res.json({ success: true, provider, enabled });
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Toggle provider failed:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle provider' });
  }
});

router.post("/test-connection", async (req, res) => {
  try {
    const { provider } = req.body;
    const targetProvider = provider || 'graph';
    
    addEmailLog('info', `Testing ${targetProvider} connection...`);
    
    if (targetProvider === 'resend') {
      if (!isResendConfigured()) {
        addEmailLog('error', 'Resend not configured');
        return res.json({ success: false, message: 'Resend not configured' });
      }
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL,
            to: [process.env.RESEND_FROM_EMAIL],
            subject: 'MDAS Connection Test',
            text: 'This is a connection test from MDAS.',
          }),
        });
        
        if (response.ok) {
          providerState.resend.verified = true;
          addEmailLog('info', 'Resend connection test successful');
          res.json({ success: true, message: 'Resend API connection verified successfully' });
        } else {
          const errorData = await response.json();
          providerState.resend.verified = false;
          addEmailLog('error', 'Resend connection test failed', JSON.stringify(errorData));
          res.json({ success: false, message: `Resend API error: ${errorData.message || 'Unknown error'}` });
        }
      } catch (err: any) {
        providerState.resend.verified = false;
        addEmailLog('error', 'Resend connection test error', err.message);
        res.json({ success: false, message: `Resend connection error: ${err.message}` });
      }
    } else if (targetProvider === 'graph') {
      if (!isGraphConfigured()) {
        addEmailLog('error', 'Microsoft Graph not configured');
        return res.json({ success: false, message: 'Microsoft Graph not configured' });
      }
      const result = await graphEmailService.testConnection();
      if (result.success) {
        providerState.graph.verified = true;
        addEmailLog('info', 'Microsoft Graph connection test successful');
      } else {
        providerState.graph.verified = false;
        addEmailLog('error', 'Microsoft Graph connection test failed', result.message);
      }
      res.json(result);
    } else {
      addEmailLog('warn', 'Invalid provider specified');
      res.json({ success: false, message: 'Invalid provider' });
    }
  } catch (error: any) {
    addEmailLog('error', 'Connection test failed unexpectedly', error.message);
    logger.error('[EMAIL-ROUTES] Connection test failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Connection test failed unexpectedly' 
    });
  }
});

// Get email logs
router.get("/logs", async (req, res) => {
  try {
    res.json({ logs: emailLogs, total: emailLogs.length });
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Failed to fetch logs:', error);
    res.json({ logs: [], total: 0 });
  }
});

router.post("/send", async (req, res) => {
  try {
    const { to, cc, bcc, subject, body, isHtml, importance } = req.body;

    if (!to || !Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Recipients (to) array is required' 
      });
    }

    if (!subject || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'Subject and body are required' 
      });
    }

    const recipients = to.map((email: string) => ({ email }));
    const ccRecipients = cc?.map((email: string) => ({ email }));
    const bccRecipients = bcc?.map((email: string) => ({ email }));

    const result = await graphEmailService.sendEmail({
      to: recipients,
      cc: ccRecipients,
      bcc: bccRecipients,
      subject,
      body,
      isHtml: isHtml !== false,
      importance: importance || 'normal'
    });

    if (result.success) {
      logger.info(`[EMAIL-ROUTES] Email sent successfully to ${to.join(', ')}`);
      res.json(result);
    } else {
      logger.error(`[EMAIL-ROUTES] Email send failed: ${result.error}`);
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Send email failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send email' 
    });
  }
});

router.post("/send-alert", async (req, res) => {
  try {
    const { recipients, alertType, alertTitle, alertDetails, severity } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Recipients array is required' 
      });
    }

    if (!alertType || !alertTitle || !alertDetails) {
      return res.status(400).json({ 
        success: false, 
        error: 'alertType, alertTitle, and alertDetails are required' 
      });
    }

    const validSeverities = ['info', 'warning', 'critical'];
    const alertSeverity = validSeverities.includes(severity) ? severity : 'info';

    const result = await graphEmailService.sendAlertNotification(
      recipients,
      alertType,
      alertTitle,
      alertDetails,
      alertSeverity
    );

    if (result.success) {
      logger.info(`[EMAIL-ROUTES] Alert notification sent to ${recipients.join(', ')}`);
      res.json(result);
    } else {
      logger.error(`[EMAIL-ROUTES] Alert notification failed: ${result.error}`);
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Send alert failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send alert notification' 
    });
  }
});

router.post("/send-report", async (req, res) => {
  try {
    const { recipients, reportName, reportSummary, reportLink } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Recipients array is required' 
      });
    }

    if (!reportName || !reportSummary) {
      return res.status(400).json({ 
        success: false, 
        error: 'reportName and reportSummary are required' 
      });
    }

    const result = await graphEmailService.sendReportNotification(
      recipients,
      reportName,
      reportSummary,
      reportLink
    );

    if (result.success) {
      logger.info(`[EMAIL-ROUTES] Report notification sent to ${recipients.join(', ')}`);
      res.json(result);
    } else {
      logger.error(`[EMAIL-ROUTES] Report notification failed: ${result.error}`);
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Send report failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send report notification' 
    });
  }
});

router.post("/send-processing-complete", async (req, res) => {
  try {
    const { recipients, filename, recordCount, processingTime, status } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Recipients array is required' 
      });
    }

    if (!filename) {
      return res.status(400).json({ 
        success: false, 
        error: 'filename is required' 
      });
    }

    const validStatuses = ['success', 'warning', 'error'];
    const processingStatus = validStatuses.includes(status) ? status : 'success';

    const result = await graphEmailService.sendProcessingCompleteNotification(
      recipients,
      filename,
      recordCount || 0,
      processingTime || 'N/A',
      processingStatus
    );

    if (result.success) {
      logger.info(`[EMAIL-ROUTES] Processing complete notification sent to ${recipients.join(', ')}`);
      res.json(result);
    } else {
      logger.error(`[EMAIL-ROUTES] Processing complete notification failed: ${result.error}`);
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Send processing complete failed:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send processing complete notification' 
    });
  }
});

// Get email outbox (all emails including sent)
router.get("/outbox", async (req, res) => {
  try {
    const { pool } = await import("../db");
    const { getTableName } = await import("../table-config");
    
    const tableName = getTableName('email_outbox');
    const result = await pool.query(`
      SELECT id, recipient_email, recipient_name, subject, body, status, 
             sent_at, created_at, error_message, retry_count, provider
      FROM ${tableName}
      ORDER BY created_at DESC
      LIMIT 100
    `);
    
    const emails = result.rows.map(row => ({
      id: row.id,
      recipientEmail: row.recipient_email,
      recipientName: row.recipient_name,
      subject: row.subject,
      body: row.body,
      status: row.status,
      sentAt: row.sent_at,
      createdAt: row.created_at,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      provider: row.provider
    }));
    
    res.json({ emails, total: emails.length });
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Failed to fetch outbox:', error);
    res.json({ emails: [], total: 0 });
  }
});

// Get email history (sent/failed emails)
router.get("/history", async (req, res) => {
  try {
    const { pool } = await import("../db");
    const { getTableName } = await import("../table-config");
    
    const tableName = getTableName('email_outbox');
    const result = await pool.query(`
      SELECT id, recipient_email, recipient_name, subject, body, status, 
             sent_at, created_at, error_message, retry_count, provider
      FROM ${tableName}
      WHERE status IN ('sent', 'failed')
      ORDER BY COALESCE(sent_at, created_at) DESC
      LIMIT 100
    `);
    
    const emails = result.rows.map(row => ({
      id: row.id,
      recipientEmail: row.recipient_email,
      recipientName: row.recipient_name,
      subject: row.subject,
      body: row.body,
      status: row.status,
      sentAt: row.sent_at,
      createdAt: row.created_at,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      provider: row.provider
    }));
    
    res.json({ emails, total: emails.length });
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Failed to fetch history:', error);
    res.json({ emails: [], total: 0 });
  }
});

export default router;
