import { Express } from "express";
import { pool } from "../db";
import { getTableName } from "../table-config";
import { isProd } from "../env-config";

function getQuarterDateRange(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0, 23, 59, 59, 999);
  return { start, end };
}

function formatDateRange(start: Date, end: Date): { start: string; end: string } {
  const format = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return { start: format(start), end: format(end) };
}

function getPreviousQuarters(year: number, quarter: number, count: number): Array<{year: number, quarter: number}> {
  const quarters = [];
  let y = year;
  let q = quarter;
  
  for (let i = 0; i < count; i++) {
    quarters.push({ year: y, quarter: q });
    q--;
    if (q < 1) {
      q = 4;
      y--;
    }
  }
  return quarters.reverse();
}

export function registerReportsRoutes(app: Express) {
  // Trend data for 4 quarters
  app.get("/api/reports/quarterly-merchants/trend", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const quarter = parseInt(req.query.quarter as string) || 1;
      
      if (quarter < 1 || quarter > 4) {
        return res.status(400).json({ error: "Quarter must be between 1 and 4" });
      }

      const merchantsTableName = getTableName('merchants');
      const quartersToFetch = getPreviousQuarters(year, quarter, 4);
      const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
      
      const trendData = await Promise.all(quartersToFetch.map(async ({ year: y, quarter: q }) => {
        const { start, end } = getQuarterDateRange(y, q);
        
        const [newResult, closedResult, beginningResult, endResult] = await Promise.all([
          pool.query(`
            SELECT COUNT(*) as count FROM ${merchantsTableName}
            WHERE merchant_type != '3'
              AND merchant_activation_date IS NOT NULL
              AND merchant_activation_date >= $1
              AND merchant_activation_date <= $2
          `, [start.toISOString(), end.toISOString()]),
          
          pool.query(`
            SELECT COUNT(*) as count FROM ${merchantsTableName}
            WHERE merchant_type != '3'
              AND close_date IS NOT NULL
              AND close_date >= $1
              AND close_date <= $2
          `, [start.toISOString(), end.toISOString()]),
          
          pool.query(`
            SELECT COUNT(*) as count FROM ${merchantsTableName}
            WHERE merchant_type != '3'
              AND merchant_activation_date IS NOT NULL
              AND merchant_activation_date < $1
              AND (close_date IS NULL OR close_date >= $1)
          `, [start.toISOString()]),
          
          pool.query(`
            SELECT COUNT(*) as count FROM ${merchantsTableName}
            WHERE merchant_type != '3'
              AND merchant_activation_date IS NOT NULL
              AND merchant_activation_date <= $1
              AND (close_date IS NULL OR close_date > $1)
          `, [end.toISOString()])
        ]);
        
        return {
          label: `${quarterLabels[q - 1]} ${y}`,
          year: y,
          quarter: q,
          newMerchants: parseInt(newResult.rows[0]?.count || '0', 10),
          closedMerchants: parseInt(closedResult.rows[0]?.count || '0', 10),
          beginningCount: parseInt(beginningResult.rows[0]?.count || '0', 10),
          endCount: parseInt(endResult.rows[0]?.count || '0', 10),
          netChange: parseInt(newResult.rows[0]?.count || '0', 10) - parseInt(closedResult.rows[0]?.count || '0', 10)
        };
      }));
      
      res.json({ trend: trendData });
    } catch (error) {
      console.error("[REPORTS] Error fetching quarterly trend:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch trend data" 
      });
    }
  });

  // Annual data - all 4 quarters for a given year
  app.get("/api/reports/quarterly-merchants/annual", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      
      const merchantsTableName = getTableName('merchants');
      const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
      
      const trendData = await Promise.all([1, 2, 3, 4].map(async (q) => {
        const { start, end } = getQuarterDateRange(year, q);
        
        const [newResult, closedResult, beginningResult, endResult] = await Promise.all([
          pool.query(`
            SELECT COUNT(*) as count FROM ${merchantsTableName}
            WHERE merchant_type != '3'
              AND merchant_activation_date IS NOT NULL
              AND merchant_activation_date >= $1
              AND merchant_activation_date <= $2
          `, [start.toISOString(), end.toISOString()]),
          
          pool.query(`
            SELECT COUNT(*) as count FROM ${merchantsTableName}
            WHERE merchant_type != '3'
              AND close_date IS NOT NULL
              AND close_date >= $1
              AND close_date <= $2
          `, [start.toISOString(), end.toISOString()]),
          
          pool.query(`
            SELECT COUNT(*) as count FROM ${merchantsTableName}
            WHERE merchant_type != '3'
              AND merchant_activation_date IS NOT NULL
              AND merchant_activation_date < $1
              AND (close_date IS NULL OR close_date >= $1)
          `, [start.toISOString()]),
          
          pool.query(`
            SELECT COUNT(*) as count FROM ${merchantsTableName}
            WHERE merchant_type != '3'
              AND merchant_activation_date IS NOT NULL
              AND merchant_activation_date <= $1
              AND (close_date IS NULL OR close_date > $1)
          `, [end.toISOString()])
        ]);
        
        return {
          label: `${quarterLabels[q - 1]} ${year}`,
          year: year,
          quarter: q,
          newMerchants: parseInt(newResult.rows[0]?.count || '0', 10),
          closedMerchants: parseInt(closedResult.rows[0]?.count || '0', 10),
          beginningCount: parseInt(beginningResult.rows[0]?.count || '0', 10),
          endCount: parseInt(endResult.rows[0]?.count || '0', 10),
          netChange: parseInt(newResult.rows[0]?.count || '0', 10) - parseInt(closedResult.rows[0]?.count || '0', 10)
        };
      }));
      
      res.json({ trend: trendData });
    } catch (error) {
      console.error("[REPORTS] Error fetching annual data:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch annual data" 
      });
    }
  });

  app.get("/api/reports/quarterly-merchants", async (req, res) => {
    try {
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      const quarter = parseInt(req.query.quarter as string) || 1;

      if (quarter < 1 || quarter > 4) {
        return res.status(400).json({ error: "Quarter must be between 1 and 4" });
      }

      const { start, end } = getQuarterDateRange(year, quarter);
      const merchantsTableName = getTableName('merchants');

      const newMerchantsQuery = await pool.query(`
        SELECT 
          id,
          name,
          client_mid as "clientMid",
          status,
          merchant_activation_date as date,
          category,
          city,
          state
        FROM ${merchantsTableName}
        WHERE merchant_type != '3'
          AND merchant_activation_date IS NOT NULL
          AND merchant_activation_date >= $1
          AND merchant_activation_date <= $2
        ORDER BY merchant_activation_date DESC
      `, [start.toISOString(), end.toISOString()]);

      const closedMerchantsQuery = await pool.query(`
        SELECT 
          id,
          name,
          client_mid as "clientMid",
          status,
          close_date as date,
          category,
          city,
          state
        FROM ${merchantsTableName}
        WHERE merchant_type != '3'
          AND close_date IS NOT NULL
          AND close_date >= $1
          AND close_date <= $2
        ORDER BY close_date DESC
      `, [start.toISOString(), end.toISOString()]);

      const newMerchants = newMerchantsQuery.rows;
      const closedMerchants = closedMerchantsQuery.rows;

      // Count total MCC merchants at beginning of quarter
      const beginningCountQuery = await pool.query(`
        SELECT COUNT(*) as count
        FROM ${merchantsTableName}
        WHERE merchant_type != '3'
          AND merchant_activation_date IS NOT NULL
          AND merchant_activation_date < $1
          AND (close_date IS NULL OR close_date >= $1)
      `, [start.toISOString()]);

      // Count total MCC merchants at end of quarter
      const endCountQuery = await pool.query(`
        SELECT COUNT(*) as count
        FROM ${merchantsTableName}
        WHERE merchant_type != '3'
          AND merchant_activation_date IS NOT NULL
          AND merchant_activation_date <= $1
          AND (close_date IS NULL OR close_date > $1)
      `, [end.toISOString()]);

      const beginningCount = parseInt(beginningCountQuery.rows[0]?.count || '0', 10);
      const endCount = parseInt(endCountQuery.rows[0]?.count || '0', 10);

      const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4'];

      res.json({
        year,
        quarter,
        quarterLabel: `${quarterLabels[quarter - 1]} ${year}`,
        dateRange: formatDateRange(start, end),
        summary: {
          newMerchants: newMerchants.length,
          closedMerchants: closedMerchants.length,
          netChange: newMerchants.length - closedMerchants.length,
          beginningCount,
          endCount
        },
        newMerchants,
        closedMerchants
      });
    } catch (error) {
      console.error("[REPORTS] Error fetching quarterly merchants:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch quarterly report" 
      });
    }
  });

  // Email Outbox - Queue a report for email delivery
  app.post("/api/reports/email-outbox", async (req, res) => {
    try {
      const { 
        recipientEmail, 
        recipientName,
        subject, 
        reportType, 
        reportDate, 
        attachmentType,
        reportData,
        scheduledFor
      } = req.body;

      if (!recipientEmail || !subject || !reportType) {
        return res.status(400).json({ 
          error: "recipientEmail, subject, and reportType are required" 
        });
      }

      const emailOutboxTableName = getTableName('email_outbox');
      const username = (req as any).user?.username || 'system';

      // Generate the email body based on report type
      let body = `Daily Processing Report for ${reportDate}\n\n`;
      if (reportData?.totals) {
        body += `Summary:\n`;
        body += `- Merchants/Associations: ${reportData.totals.merchantCount}\n`;
        body += `- Total Transactions: ${reportData.totals.transactionCount.toLocaleString()}\n`;
        body += `- Auth Amount: $${reportData.totals.authAmount.toFixed(2)}\n`;
        body += `- Purchase Amount: $${reportData.totals.purchaseAmount.toFixed(2)}\n`;
        body += `- Credit Amount: $${reportData.totals.creditAmount.toFixed(2)}\n`;
        body += `- Net Amount: $${reportData.totals.netAmount.toFixed(2)}\n`;
      }
      body += `\nReport generated by MDAS on ${new Date().toISOString()}`;

      const result = await pool.query(`
        INSERT INTO ${emailOutboxTableName} (
          recipient_email,
          recipient_name,
          subject,
          body,
          report_type,
          report_date,
          attachment_type,
          status,
          created_by,
          scheduled_for
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9)
        RETURNING id, status, created_at
      `, [
        recipientEmail,
        recipientName || null,
        subject,
        body,
        reportType,
        reportDate || null,
        attachmentType || 'csv',
        username,
        scheduledFor ? new Date(scheduledFor) : null
      ]);

      console.log(`[EMAIL-OUTBOX] Queued email for ${recipientEmail}: ${subject}`);

      res.status(201).json({
        success: true,
        message: "Report queued for email delivery",
        outboxId: result.rows[0].id,
        status: result.rows[0].status,
        createdAt: result.rows[0].created_at
      });
    } catch (error) {
      console.error("[EMAIL-OUTBOX] Error queuing email:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to queue email" 
      });
    }
  });

  // Get email outbox items
  app.get("/api/reports/email-outbox", async (req, res) => {
    try {
      const { status, limit = 50, offset = 0 } = req.query;
      const emailOutboxTableName = getTableName('email_outbox');

      let query = `SELECT * FROM ${emailOutboxTableName}`;
      const params: any[] = [];

      if (status) {
        query += ` WHERE status = $1`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(parseInt(limit as string), parseInt(offset as string));

      const result = await pool.query(query, params);

      res.json({
        data: result.rows,
        count: result.rowCount
      });
    } catch (error) {
      console.error("[EMAIL-OUTBOX] Error fetching outbox:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to fetch email outbox" 
      });
    }
  });

  // Cancel an email in the outbox
  app.delete("/api/reports/email-outbox/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const emailOutboxTableName = getTableName('email_outbox');

      const result = await pool.query(`
        UPDATE ${emailOutboxTableName} 
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, status
      `, [parseInt(id)]);

      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Email not found or already processed" });
      }

      res.json({ success: true, id: result.rows[0].id });
    } catch (error) {
      console.error("[EMAIL-OUTBOX] Error cancelling email:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to cancel email" 
      });
    }
  });

  // Type 3 (ACH) Merchant Demographics Report
  app.get("/api/reports/type3-demographics", async (req, res) => {
    try {
      const merchantsTableName = getTableName('merchants');
      
      // Optional date filter - shows all merchants who were clients by the "asOfDate"
      // (client_since_date on or before asOfDate)
      const asOfDate = req.query.asOfDate as string | undefined;
      
      let dateFilter = '';
      const queryParams: any[] = [];
      
      if (asOfDate) {
        // Show all merchants whose client_since_date is on or before the asOfDate
        dateFilter = ' AND client_since_date IS NOT NULL AND client_since_date <= $1';
        queryParams.push(asOfDate);
        console.log(`[TYPE3-DEMOGRAPHICS] Filtering merchants who were clients by: ${asOfDate}`);
      }
      
      // contact_first and contact_last columns only exist in dev, not production
      const contactColumns = isProd 
        ? "NULL AS contact_first, NULL AS contact_last,"
        : "contact_first, contact_last,";
      
      const result = await pool.query(`
        SELECT 
          id, name, dba_name, client_mid, 
          address, city, state, zip_code,
          phone_1, phone_2, email,
          ${contactColumns}
          status, client_since_date, merchant_activation_date,
          dda_number, transit_routing_number
        FROM ${merchantsTableName}
        WHERE merchant_type = '3'
        AND status != 'Removed'
        ${dateFilter}
        ORDER BY name
      `, queryParams);

      const merchants = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        dbaName: row.dba_name,
        clientMid: row.client_mid,
        address: row.address,
        city: row.city,
        state: row.state,
        zipCode: row.zip_code,
        phone1: row.phone_1,
        phone2: row.phone_2,
        email: row.email,
        contactFirst: row.contact_first || null,
        contactLast: row.contact_last || null,
        status: row.status,
        clientSinceDate: row.client_since_date,
        merchantActivationDate: row.merchant_activation_date,
        ddaNumber: row.dda_number,
        transitRoutingNumber: row.transit_routing_number
      }));

      const activeCount = merchants.filter(m => 
        m.status?.toLowerCase().includes('active')
      ).length;

      res.json({
        merchants,
        totalCount: merchants.length,
        activeCount,
        generatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("[TYPE3-DEMOGRAPHICS] Error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to load Type 3 demographics" 
      });
    }
  });
}
