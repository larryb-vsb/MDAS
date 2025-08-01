import { db } from './db';
import { sql } from 'drizzle-orm';
import { NODE_ENV } from './env-config';

/**
 * Ensure TDDF cache tables exist for current environment
 * This creates missing cache tables that are essential for TDDF JSON page functionality
 */
export async function ensureTddfCacheTables() {
  console.log(`[STARTUP] Checking TDDF cache tables for ${NODE_ENV} environment...`);
  
  // Define all required TDDF cache tables (without environment prefix)
  const requiredCacheTables = [
    'tddf_json_stats_pre_cache',
    'tddf_json_activity_pre_cache',
    'tddf_json_record_type_counts_pre_cache',
    'tddf_records_all_pre_cache',
    'tddf_records_dt_pre_cache',
    'tddf_records_bh_pre_cache',
    'tddf_records_p1_pre_cache',
    'tddf_records_p2_pre_cache',
    'tddf_records_other_pre_cache',
    'tddf_batch_relationships_pre_cache',
    'tddf_records_tab_processing_status'
  ];

  try {
    // Check which cache tables exist - build table names list for SQL
    const tableList = requiredCacheTables.map(t => `'${t}'`).join(',');
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
        AND table_name IN (${sql.raw(tableList)})
    `);
    
    const existingCacheTables = result.rows.map(row => row.table_name);
    console.log(`[STARTUP] Found ${existingCacheTables.length}/${requiredCacheTables.length} existing cache tables:`, existingCacheTables);
    
    // Create missing cache tables by copying structure from dev environment
    const missingTables = requiredCacheTables.filter(table => !existingCacheTables.includes(table));
    
    if (missingTables.length > 0) {
      console.log(`[STARTUP] Creating ${missingTables.length} missing TDDF cache tables...`);
      
      for (const tableName of missingTables) {
        // For production, copy from dev tables; for dev, tables should already exist
        const sourceTable = NODE_ENV === 'production' ? `dev_${tableName}` : tableName;
        
        try {
          // Check if source table exists to copy structure from
          const sourceCheck = await db.execute(sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = ${sourceTable}
          `);
          
          if (sourceCheck.rows.length > 0) {
            console.log(`[STARTUP] Creating ${tableName} from ${sourceTable} structure...`);
            await db.execute(sql`
              CREATE TABLE IF NOT EXISTS ${sql.raw(tableName)} 
              (LIKE ${sql.raw(sourceTable)} INCLUDING ALL)
            `);
            console.log(`[STARTUP] ✅ Created cache table: ${tableName}`);
          } else {
            console.log(`[STARTUP] ⚠️  Source table ${sourceTable} not found, skipping ${tableName}`);
          }
        } catch (error) {
          console.error(`[STARTUP] Error creating cache table ${tableName}:`, error);
        }
      }
      
      console.log(`[STARTUP] ✅ TDDF cache table creation complete for ${NODE_ENV} environment`);
    } else {
      console.log(`[STARTUP] ✅ All TDDF cache tables exist for ${NODE_ENV} environment`);
    }
    
  } catch (error) {
    console.error('[STARTUP] Error checking TDDF cache tables:', error);
  }
}