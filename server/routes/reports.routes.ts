import { Express } from "express";
import { pool } from "../db";
import { getTableName } from "../table-config";

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

export function registerReportsRoutes(app: Express) {
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
}
