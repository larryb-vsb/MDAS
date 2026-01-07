import type { Express } from "express";
import { pool } from "../db";
import { getTableName } from "../table-config";
import { isAuthenticated } from "./middleware";

export function registerTransactionRoutes(app: Express) {
  // Get ACH transactions with pagination, sorting, and filtering
  app.get("/api/transactions", isAuthenticated, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const sortBy = req.query.sortBy as string || "transaction_date";
      const sortOrder = (req.query.sortOrder as string || "desc").toLowerCase() as "asc" | "desc";
      const search = req.query.search as string || "";
      
      const offset = (page - 1) * limit;
      const achTableName = getTableName('api_achtransactions');
      
      // Build search condition
      let searchCondition = "";
      const queryParams: any[] = [];
      
      if (search) {
        searchCondition = `
          WHERE (
            merchant_name ILIKE $1 OR
            trace_number ILIKE $1 OR
            company ILIKE $1 OR
            account_number ILIKE $1 OR
            merchant_id ILIKE $1
          )
        `;
        queryParams.push(`%${search}%`);
      }
      
      // Validate sortBy to prevent SQL injection
      const validSortColumns = [
        'transaction_date', 'merchant_name', 'amount', 'trace_number', 
        'company', 'code', 'created_at'
      ];
      const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'transaction_date';
      const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';
      
      // Get total count
      const countResult = await pool.query(`
        SELECT COUNT(*) as total FROM ${achTableName}
        ${searchCondition}
      `, queryParams);
      
      const total = parseInt(countResult.rows[0].total);
      
      // Get paginated data
      const dataParams = [...queryParams, limit, offset];
      const dataResult = await pool.query(`
        SELECT 
          id,
          merchant_name,
          merchant_id,
          account_number,
          amount,
          transaction_date,
          code,
          description,
          company,
          trace_number,
          created_at,
          updated_at,
          file_source
        FROM ${achTableName}
        ${searchCondition}
        ORDER BY ${safeSortBy} ${safeSortOrder}
        LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
      `, dataParams);
      
      res.json({
        data: dataResult.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      });
    } catch (error) {
      console.error("Error fetching ACH transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  // Get single ACH transaction by ID
  app.get("/api/transactions/:id", isAuthenticated, async (req, res) => {
    try {
      const { id } = req.params;
      const achTableName = getTableName('api_achtransactions');
      
      const result = await pool.query(`
        SELECT * FROM ${achTableName} WHERE id = $1
      `, [id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ error: "Failed to fetch transaction" });
    }
  });

  // Bulk delete ACH transactions
  app.delete("/api/transactions/bulk", isAuthenticated, async (req, res) => {
    try {
      const { ids } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "No transaction IDs provided" });
      }

      // Limit bulk delete to prevent accidental mass deletion
      if (ids.length > 500) {
        return res.status(400).json({ error: "Cannot delete more than 500 transactions at once" });
      }

      const achTableName = getTableName('api_achtransactions');
      
      // Create parameterized placeholders for the IDs
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      
      const result = await pool.query(`
        DELETE FROM ${achTableName}
        WHERE id IN (${placeholders})
        RETURNING id
      `, ids);
      
      console.log(`[TRANSACTIONS] Bulk deleted ${result.rowCount} transactions`);
      
      res.json({
        success: true,
        deletedCount: result.rowCount,
        deletedIds: result.rows.map(r => r.id)
      });
    } catch (error) {
      console.error("Error bulk deleting transactions:", error);
      res.status(500).json({ error: "Failed to delete transactions" });
    }
  });
}
