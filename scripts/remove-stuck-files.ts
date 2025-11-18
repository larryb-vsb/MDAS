#!/usr/bin/env tsx
/**
 * Remove Stuck Files in Production
 * 
 * This script safely removes files stuck in "validating" phase for 24+ hours
 * by soft-deleting them (setting deleted_at timestamp).
 * 
 * Usage:
 *   # Preview what will be deleted (safe, read-only):
 *   tsx scripts/remove-stuck-files.ts preview
 * 
 *   # Execute the deletion:
 *   tsx scripts/remove-stuck-files.ts execute --username YOUR_USERNAME
 * 
 *   # Custom threshold (e.g., 48 hours):
 *   tsx scripts/remove-stuck-files.ts preview --hours 48
 */

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure Neon for WebSocket
neonConfig.webSocketConstructor = ws;

const mode = process.argv[2]; // 'preview' or 'execute'
const usernameArg = process.argv.find(arg => arg.startsWith('--username='));
const hoursArg = process.argv.find(arg => arg.startsWith('--hours='));

const username = usernameArg?.split('=')[1] || 'admin';
const thresholdHours = parseInt(hoursArg?.split('=')[1] || '24', 10);

// Connect to production database
const DATABASE_URL = process.env.NEON_PROD_DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ Error: NEON_PROD_DATABASE_URL environment variable not set');
  console.error('   This script requires production database access.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function previewStuckFiles() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 PREVIEW: Files Stuck in Validating Phase');
  console.log(`   Threshold: ${thresholdHours} hours`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const query = `
    SELECT 
      id,
      filename,
      current_phase,
      start_time,
      ROUND(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600, 1) as hours_stuck,
      upload_id,
      ROUND(file_size / 1024.0 / 1024.0, 2) as size_mb,
      business_day
    FROM uploader_uploads
    WHERE current_phase = 'validating'
      AND start_time < NOW() - INTERVAL '${thresholdHours} hours'
      AND deleted_at IS NULL
      AND is_archived = false
      AND current_phase != 'processing'
    ORDER BY start_time ASC;
  `;

  try {
    const result = await pool.query(query);
    
    if (result.rows.length === 0) {
      console.log('✅ No stuck files found. Queue is healthy!\n');
      return 0;
    }

    console.log(`Found ${result.rows.length} stuck file(s):\n`);
    console.log('ID'.padEnd(30), 'Filename'.padEnd(50), 'Hours Stuck', 'Size (MB)', 'Business Day');
    console.log('─'.repeat(150));

    let totalSize = 0;
    for (const file of result.rows) {
      const id = String(file.id).substring(0, 28).padEnd(30);
      const filename = String(file.filename).substring(0, 48).padEnd(50);
      const hours = String(file.hours_stuck).padEnd(11);
      const size = String(file.size_mb || '0').padEnd(10);
      const bizDay = file.business_day || 'N/A';
      
      console.log(id, filename, hours, size, bizDay);
      totalSize += parseFloat(file.size_mb || 0);
    }

    console.log('─'.repeat(150));
    console.log(`\n📊 Summary: ${result.rows.length} files, ${totalSize.toFixed(2)} MB total\n`);
    console.log('To delete these files, run:');
    console.log(`   tsx scripts/remove-stuck-files.ts execute --username=${username}\n`);

    return result.rows.length;

  } catch (error) {
    console.error('❌ Error querying database:', error);
    throw error;
  }
}

async function executeDelete() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('⚠️  WARNING: PRODUCTION DELETE OPERATION');
  console.log(`   User: ${username}`);
  console.log(`   Threshold: ${thresholdHours} hours`);
  console.log('═══════════════════════════════════════════════════════════\n');

  // First show preview
  const count = await previewStuckFiles();
  
  if (count === 0) {
    return;
  }

  console.log('Proceeding with soft-delete in 5 seconds...');
  console.log('Press Ctrl+C to cancel.\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  const updateQuery = `
    UPDATE uploader_uploads
    SET 
      deleted_at = NOW(),
      deleted_by = $1,
      processing_notes = COALESCE(processing_notes, '') || 
        E'\\n[' || NOW()::text || '] Auto-deleted: Stuck in validating phase for ' || 
        ROUND(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600, 1)::text || ' hours'
    WHERE current_phase = 'validating'
      AND start_time < NOW() - INTERVAL '${thresholdHours} hours'
      AND deleted_at IS NULL
      AND is_archived = false
      AND current_phase != 'processing'
    RETURNING id, filename, 
      ROUND(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600, 1) as hours_stuck;
  `;

  try {
    const result = await pool.query(updateQuery, [username]);
    
    console.log(`✅ Successfully deleted ${result.rows.length} file(s):\n`);
    
    for (const file of result.rows) {
      console.log(`   - ${file.filename} (${file.hours_stuck} hours stuck)`);
    }

    console.log('\n📊 Cleanup complete!\n');
    
    // Show updated queue stats
    const statsQuery = `
      SELECT 
        current_phase,
        COUNT(*) as file_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - start_time)) / 3600), 1) as avg_hours
      FROM uploader_uploads
      WHERE deleted_at IS NULL
        AND is_archived = false
      GROUP BY current_phase
      ORDER BY file_count DESC;
    `;
    
    const statsResult = await pool.query(statsQuery);
    console.log('Current Queue Status:');
    console.log('Phase'.padEnd(20), 'Count', 'Avg Hours');
    console.log('─'.repeat(50));
    for (const stat of statsResult.rows) {
      console.log(
        String(stat.current_phase).padEnd(20),
        String(stat.file_count).padEnd(5),
        stat.avg_hours || '0'
      );
    }
    console.log();

  } catch (error) {
    console.error('❌ Error executing delete:', error);
    throw error;
  }
}

async function main() {
  try {
    if (!mode || !['preview', 'execute'].includes(mode)) {
      console.error('Usage:');
      console.error('  tsx scripts/remove-stuck-files.ts preview [--hours=24]');
      console.error('  tsx scripts/remove-stuck-files.ts execute --username=YOUR_USERNAME [--hours=24]');
      process.exit(1);
    }

    if (mode === 'execute' && !usernameArg) {
      console.error('❌ Error: --username required for execute mode');
      console.error('   Example: tsx scripts/remove-stuck-files.ts execute --username=admin');
      process.exit(1);
    }

    if (mode === 'preview') {
      await previewStuckFiles();
    } else {
      await executeDelete();
    }

  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
