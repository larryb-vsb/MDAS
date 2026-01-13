/**
 * Fix TDDF DT Card Type Field Positions
 * Corrects existing JSONB records to use proper 2-character card type format (positions 253-254)
 * instead of the incorrect 6-character format (positions 251-256)
 */

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require("ws");

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fixCardTypeFieldPositions() {
  console.log('[CARD-TYPE-FIX] Starting TDDF DT Card Type field position correction...');
  
  try {
    // Get current stats
    const statsQuery = `
      SELECT 
        extracted_fields->>'cardType' as current_card_type,
        COUNT(*) as count
      FROM dev_tddf_jsonb 
      WHERE record_type = 'DT' 
        AND extracted_fields->>'cardType' IS NOT NULL
        AND LENGTH(extracted_fields->>'cardType') > 2
      GROUP BY extracted_fields->>'cardType'
      ORDER BY count DESC;
    `;
    
    const currentStats = await pool.query(statsQuery);
    console.log('[CARD-TYPE-FIX] Current card type distribution (4+ chars):');
    currentStats.rows.forEach(row => {
      console.log(`  ${row.current_card_type}: ${row.count} records`);
    });
    
    // Fix the card types by extracting correct 2-character values
    const updateQuery = `
      UPDATE dev_tddf_jsonb 
      SET extracted_fields = jsonb_set(
        extracted_fields,
        '{cardType}',
        to_jsonb(SUBSTRING(raw_line, 253, 2))
      )
      WHERE record_type = 'DT' 
        AND extracted_fields->>'cardType' IS NOT NULL
        AND LENGTH(extracted_fields->>'cardType') > 2;
    `;
    
    console.log('[CARD-TYPE-FIX] Applying card type corrections...');
    const updateResult = await pool.query(updateQuery);
    console.log(`[CARD-TYPE-FIX] Updated ${updateResult.rowCount} DT records with corrected card type field`);
    
    // Get updated stats
    const newStatsQuery = `
      SELECT 
        extracted_fields->>'cardType' as corrected_card_type,
        COUNT(*) as count
      FROM dev_tddf_jsonb 
      WHERE record_type = 'DT' 
        AND extracted_fields->>'cardType' IS NOT NULL
      GROUP BY extracted_fields->>'cardType'
      ORDER BY count DESC;
    `;
    
    const newStats = await pool.query(newStatsQuery);
    console.log('[CARD-TYPE-FIX] Corrected card type distribution (2 chars):');
    newStats.rows.forEach(row => {
      console.log(`  ${row.corrected_card_type}: ${row.count} records`);
    });
    
    // Verify all card types are now 2 characters
    const verificationQuery = `
      SELECT COUNT(*) as long_card_types
      FROM dev_tddf_jsonb 
      WHERE record_type = 'DT' 
        AND extracted_fields->>'cardType' IS NOT NULL
        AND LENGTH(extracted_fields->>'cardType') > 2;
    `;
    
    const verification = await pool.query(verificationQuery);
    const longCardTypes = verification.rows[0].long_card_types;
    
    if (longCardTypes === 0) {
      console.log('[CARD-TYPE-FIX] ✅ All DT card types are now properly formatted as 2 characters (AN 2 format)');
    } else {
      console.log(`[CARD-TYPE-FIX] ⚠️  Warning: ${longCardTypes} records still have card types longer than 2 characters`);
    }
    
    console.log('[CARD-TYPE-FIX] Card type field position correction completed successfully');
    
  } catch (error) {
    console.error('[CARD-TYPE-FIX] Error during card type correction:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the fix
fixCardTypeFieldPositions()
  .then(() => {
    console.log('[CARD-TYPE-FIX] Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[CARD-TYPE-FIX] Script failed:', error);
    process.exit(1);
  });