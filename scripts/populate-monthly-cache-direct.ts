import { neon } from '@neondatabase/serverless';
import { PreCacheService } from '../server/services/pre-cache-service.js';

const prodSql = neon(process.env.NEON_PROD_DATABASE_URL!);

interface MonthData {
  year: number;
  month: number;
  record_count: number;
}

async function getAvailableMonths(): Promise<MonthData[]> {
  console.log('📊 Finding months with TDDF data...\n');
  
  const months: MonthData[] = [];
  
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
          EXTRACT(MONTH FROM tddf_processing_date)::int as month,
          COUNT(*) as count
        FROM ${q.table}
        WHERE tddf_processing_date IS NOT NULL
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
      console.log(`  ⚠️  ${q.table}: Could not query`);
    }
  }
  
  return months;
}

async function populateMonthlyCache() {
  console.log('🚀 Monthly Cache Population Script (Direct)\n');
  console.log('This script will build the monthly cache for all months with TDDF data.\n');
  console.log('='.repeat(70));
  
  const months = await getAvailableMonths();
  
  console.log(`\n📊 Found ${months.length} months with data`);
  console.log('='.repeat(70));
  
  if (months.length === 0) {
    console.log('\n⚠️  No months with TDDF data found. Nothing to cache.');
    return;
  }
  
  console.log('\n🔨 Building monthly caches...\n');
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const { year, month, record_count } of months) {
    const monthStr = String(month).padStart(2, '0');
    console.log(`📅 ${year}-${monthStr} (${record_count.toLocaleString()} records)...`);
    
    try {
      const result = await PreCacheService.buildMonthlyCache({
        year,
        month,
        triggeredByUser: 'populate-script',
        triggeredBy: 'initial_population'
      });
      
      if (result.success) {
        console.log(`  ✅ Success! Built in ${(result.buildTimeMs / 1000).toFixed(1)}s`);
        successCount++;
      } else {
        console.log(`  ❌ Failed (no error details)`);
        errorCount++;
      }
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
      errorCount++;
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`✅ Monthly cache population complete!`);
  console.log(`📊 Results: ${successCount} success, ${errorCount} errors out of ${months.length} total`);
  console.log('\n📌 Next steps:');
  console.log('   1. Refresh the Pre-Cache Management page');
  console.log('   2. Navigate to "Monthly Cache" tab');
  console.log('   3. View all cached monthly data');
  console.log('='.repeat(70));
}

populateMonthlyCache()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
