/**
 * Backfill Script: Normalize Terminal VAR Numbers
 * 
 * This script fixes existing terminals with non-canonical VAR number formats.
 * It converts all VAR numbers to the standard VXXXXXXX format.
 * 
 * Usage: npx tsx scripts/backfill-terminal-var-numbers.ts [--dry-run]
 * 
 * Options:
 *   --dry-run  Show what would be changed without making updates
 */

import { pool } from '../server/db';
import { getTableName } from '../server/table-config';
import { normalizeVarNumber, isValidVarNumber } from '../server/utils/terminal-utils';

async function backfillTerminalVarNumbers(dryRun: boolean = false) {
  console.log('='.repeat(60));
  console.log('Terminal VAR Number Backfill Script');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`);
  console.log('='.repeat(60));
  
  const terminalsTableName = getTableName('api_terminals');
  console.log(`\nTarget table: ${terminalsTableName}`);
  
  try {
    // Get all terminals
    const result = await pool.query(`
      SELECT id, v_number, terminal_id, dba_name 
      FROM ${terminalsTableName}
      ORDER BY id
    `);
    
    console.log(`\nFound ${result.rows.length} total terminals\n`);
    
    // Analyze and categorize terminals
    const stats = {
      alreadyValid: 0,
      needsNormalization: 0,
      cannotNormalize: 0,
      duplicateConflicts: [] as Array<{ original: string; normalized: string; ids: number[] }>,
    };
    
    const normalizationMap = new Map<number, { original: string; normalized: string; dbaName: string }>();
    const normalizedToIds = new Map<string, number[]>(); // Track potential duplicates
    
    for (const row of result.rows) {
      const { id, v_number: vNumber, terminal_id: terminalId, dba_name: dbaName } = row;
      
      if (!vNumber) {
        console.log(`  [SKIP] ID ${id}: No v_number value`);
        stats.cannotNormalize++;
        continue;
      }
      
      // Check if already in valid format
      if (isValidVarNumber(vNumber)) {
        stats.alreadyValid++;
        
        // Track for duplicate detection
        const existing = normalizedToIds.get(vNumber) || [];
        existing.push(id);
        normalizedToIds.set(vNumber, existing);
        continue;
      }
      
      // Try to normalize
      const normalized = normalizeVarNumber(vNumber);
      
      if (!normalized) {
        console.log(`  [WARN] ID ${id}: Cannot normalize "${vNumber}" - invalid format`);
        stats.cannotNormalize++;
        continue;
      }
      
      // Track for duplicate detection
      const existing = normalizedToIds.get(normalized) || [];
      existing.push(id);
      normalizedToIds.set(normalized, existing);
      
      stats.needsNormalization++;
      normalizationMap.set(id, { original: vNumber, normalized, dbaName: dbaName || '' });
    }
    
    // Check for duplicate conflicts
    for (const [normalized, ids] of normalizedToIds.entries()) {
      if (ids.length > 1) {
        stats.duplicateConflicts.push({ 
          original: normalized, 
          normalized, 
          ids 
        });
      }
    }
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('ANALYSIS SUMMARY');
    console.log('='.repeat(60));
    console.log(`  Already valid (VXXXXXXX format): ${stats.alreadyValid}`);
    console.log(`  Needs normalization: ${stats.needsNormalization}`);
    console.log(`  Cannot normalize (invalid): ${stats.cannotNormalize}`);
    console.log(`  Potential duplicate conflicts: ${stats.duplicateConflicts.length}`);
    
    // Show normalization changes
    if (normalizationMap.size > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('NORMALIZATIONS TO APPLY:');
      console.log('-'.repeat(60));
      
      let shown = 0;
      for (const [id, { original, normalized, dbaName }] of normalizationMap.entries()) {
        console.log(`  ID ${id}: "${original}" → "${normalized}" (${dbaName.substring(0, 30)})`);
        shown++;
        if (shown >= 20 && normalizationMap.size > 20) {
          console.log(`  ... and ${normalizationMap.size - 20} more`);
          break;
        }
      }
    }
    
    // Show duplicate conflicts
    if (stats.duplicateConflicts.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('DUPLICATE CONFLICTS (will skip):');
      console.log('-'.repeat(60));
      
      for (const conflict of stats.duplicateConflicts.slice(0, 10)) {
        console.log(`  "${conflict.normalized}" → IDs: ${conflict.ids.join(', ')}`);
      }
      if (stats.duplicateConflicts.length > 10) {
        console.log(`  ... and ${stats.duplicateConflicts.length - 10} more conflicts`);
      }
    }
    
    // Apply changes if not dry run
    if (!dryRun && normalizationMap.size > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('APPLYING UPDATES...');
      console.log('='.repeat(60));
      
      let updated = 0;
      let skipped = 0;
      
      for (const [id, { original, normalized }] of normalizationMap.entries()) {
        // Skip if this would create a duplicate
        const existingIds = normalizedToIds.get(normalized) || [];
        if (existingIds.length > 1) {
          console.log(`  [SKIP] ID ${id}: Would create duplicate for "${normalized}"`);
          skipped++;
          continue;
        }
        
        try {
          await pool.query(`
            UPDATE ${terminalsTableName}
            SET v_number = $1, updated_at = NOW(), update_source = 'Backfill VAR normalization'
            WHERE id = $2
          `, [normalized, id]);
          
          updated++;
          
          if (updated % 50 === 0) {
            console.log(`  Progress: ${updated} terminals updated...`);
          }
        } catch (error: any) {
          if (error.code === '23505') { // Duplicate key
            console.log(`  [SKIP] ID ${id}: Duplicate key conflict for "${normalized}"`);
            skipped++;
          } else {
            throw error;
          }
        }
      }
      
      console.log(`\n  ✅ Updated: ${updated} terminals`);
      console.log(`  ⏭️  Skipped: ${skipped} terminals (duplicates)`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('COMPLETE');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('Error during backfill:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the script
const dryRun = process.argv.includes('--dry-run');
backfillTerminalVarNumbers(dryRun)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
