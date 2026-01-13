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
}
