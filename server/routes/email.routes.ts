import { Router } from "express";
import { graphEmailService } from "../services/graph-email.service";
import { logger } from "../../shared/logger";

const router = Router();

router.get("/status", async (req, res) => {
  try {
    const isEnabled = graphEmailService.isEnabled();
    const senderEmail = graphEmailService.getSenderEmail();
    
    res.json({
      enabled: isEnabled,
      senderEmail: isEnabled ? senderEmail : null,
      configured: isEnabled,
      message: isEnabled 
        ? 'Email service is configured and ready' 
        : 'Email service not configured - check Azure credentials'
    });
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Status check failed:', error);
    res.status(500).json({ 
      enabled: false, 
      error: 'Failed to check email service status' 
    });
  }
});

router.post("/test-connection", async (req, res) => {
  try {
    const result = await graphEmailService.testConnection();
    res.json(result);
  } catch (error) {
    logger.error('[EMAIL-ROUTES] Connection test failed:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Connection test failed unexpectedly' 
    });
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

export default router;
