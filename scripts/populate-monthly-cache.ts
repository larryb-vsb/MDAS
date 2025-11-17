/**
 * Populate Monthly Cache for All Available Months
 * 
 * This script builds the tddf1_monthly_cache by triggering the cache builder
 * for all months that have TDDF data in the production database.
 */

import { neon } from '@neondatabase/serverless';

const prodSql = neon(process.env.NEON_PROD_DATABASE_URL!);

interface MonthData {
  year: number;
  month: number;
  record_count: number;
}

async function getAvailableMonths(): Promise<MonthData[]> {
  console.log('📊 Finding months with TDDF data...\n');
  
  // Query all partitions to find which months have data
  const months: MonthData[] = [];
  
  // Check each quarter partition
  const quarters = [
    { table: 'tddf_jsonb_2022_q4', year: 2022, months: [10, 11, 12] },
    { table: 'tddf_jsonb_2023_q1', year: 2023, months: [1, 2, 3] },
    { table: 'tddf_jsonb_2023_q2', year: 2023, months: [4, 5, 6] },
    { table: 'tddf_jsonb_2023_q3', year: 2023, months: [7, 8, 9] },
    { table: 'tddf_jsonb_2023_q4', year: 2023, months: [10, 11, 12] },
    { table: 'tddf_jsonb_2024_q1', year: 2024, months: [1, 2, 3] },
    { table: 'tddf_jsonb_2024_q2', year: 2024, months: [4, 5, 6] },
    { table: 'tddf_jsonb_2024_q3', year: 2024, months: [7, 8, 9] },
    { table: 'tddf_jsonb_2024_q4', year: 2024, months: [10, 11, 12] },
    { table: 'tddf_jsonb_2025_q1', year: 2025, months: [1, 2, 3] },
    { table: 'tddf_jsonb_2025_q2', year: 2025, months: [4, 5, 6] },
    { table: 'tddf_jsonb_2025_q3', year: 2025, months: [7, 8, 9] },
    { table: 'tddf_jsonb_2025_q4', year: 2025, months: [10, 11, 12] },
  ];
  
  for (const q of quarters) {
    try {
      const result = await prodSql(`
        SELECT 
          EXTRACT(MONTH FROM file_processing_date)::int as month,
          COUNT(*) as count
        FROM ${q.table}
        WHERE file_processing_date IS NOT NULL
        GROUP BY month
        HAVING COUNT(*) > 0
        ORDER BY month
      `);
      
      for (const row of result) {
        months.push({
          year: q.year,
          month: row.month,
          record_count: Number(row.count)
        });
        console.log(`  ✅ ${q.year}-${String(row.month).padStart(2, '0')}: ${row.count.toLocaleString()} records`);
      }
    } catch (error) {
      console.log(`  ⚠️  ${q.table}: Could not query (${error instanceof Error ? error.message : 'unknown error'})`);
    }
  }
  
  return months;
}

async function buildCacheForMonth(year: number, month: number): Promise<void> {
  console.log(`\n🔨 Building cache for ${year}-${String(month).padStart(2, '0')}...`);
  
  try {
    // Call the pre-cache API endpoint
    const apiUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}/api/pre-cache/monthly-cache/${year}/${month}/rebuild`
      : `http://localhost:5000/api/pre-cache/monthly-cache/${year}/${month}/rebuild`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        triggeredBy: 'script',
        triggerReason: 'initial_population'
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.log(`  ❌ Failed: ${error}`);
      return;
    }
    
    const result = await response.json();
    console.log(`  ✅ Success! Build time: ${result.buildTimeMs}ms, Job ID: ${result.jobId}`);
    
  } catch (error) {
    console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

async function populateMonthlyCache() {
  console.log('🚀 Monthly Cache Population Script\n');
  console.log('This script will build the monthly cache for all months with TDDF data.\n');
  console.log('=' .repeat(70));
  
  // Get available months
  const months = await getAvailableMonths();
  
  console.log(`\n📊 Found ${months.length} months with data`);
  console.log('='.repeat(70));
  
  if (months.length === 0) {
    console.log('\n⚠️  No months with TDDF data found. Nothing to cache.');
    return;
  }
  
  // Build cache for each month
  console.log('\n🔨 Building monthly caches...');
  
  for (const { year, month } of months) {
    await buildCacheForMonth(year, month);
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ Monthly cache population complete!');
  console.log('\n📌 Next steps:');
  console.log('   1. Refresh the Pre-Cache Management page in your browser');
  console.log('   2. Navigate to the "Monthly Cache" tab');
  console.log('   3. You should now see all cached monthly data');
}

populateMonthlyCache().catch(console.error);
