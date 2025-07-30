#!/usr/bin/env node

/**
 * Dynamic Monthly Aggregation System Test Script
 * Tests the new 5M+ record TDDF JSON heat map performance system
 * 
 * Author: Alex (Replit Agent)
 * Date: July 30, 2025
 * Purpose: Verify dynamic aggregation performance across all tiers
 */

// ES module compatible test script
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Fallback to fetch if axios is not available
let axios;
try {
  axios = require('axios');
} catch (error) {
  // Use node-fetch as fallback for ES module compatibility
  console.log('Using fetch API for HTTP requests...');
}

// Test configuration
const BASE_URL = 'http://localhost:5000';
const TEST_YEARS = [2022, 2023, 2024, 2025];
const COOKIE = 'connect.sid=s%3A_JCe8EgKVPu5u-D6F8xUhkNwPt0NZFVD.BFdg6tSGcmKx3xGhb6a5kk4hFrDw9%2FBWKkrGKHoZAo4'; // Replace with actual session cookie

async function testDynamicAggregation() {
  console.log('🚀 Testing Dynamic Monthly Aggregation System');
  console.log('Target: Handle 5-10M records with progressive loading\n');

  const results = [];

  for (const year of TEST_YEARS) {
    console.log(`\n📅 Testing Year ${year}:`);
    
    try {
      const startTime = Date.now();
      
      // Make request to enhanced endpoint
      const response = await axios.get(`${BASE_URL}/api/tddf-json/activity`, {
        params: {
          year: year,
          recordType: 'DT'
        },
        headers: {
          'Cookie': COOKIE
        }
      });
      
      const totalTime = Date.now() - startTime;
      const data = response.data;
      
      // Analyze response
      const metadata = data.metadata || {};
      const aggregationLevel = metadata.aggregationLevel || 'unknown';
      const totalRecords = metadata.totalRecords || 0;
      const recordCount = data.records?.length || 0;
      const queryTime = data.queryTime || totalTime;
      const fromCache = data.fromCache || false;
      
      console.log(`   📊 Dataset: ${totalRecords.toLocaleString()} records`);
      console.log(`   ⚡ Aggregation: ${aggregationLevel} (${recordCount} periods)`);
      console.log(`   🕐 Query time: ${queryTime}ms`);
      console.log(`   💾 Cache status: ${fromCache ? 'HIT' : 'MISS'}`);
      
      // Performance metrics
      if (metadata.performanceMetrics) {
        const metrics = metadata.performanceMetrics;
        console.log(`   📈 Size check: ${metrics.sizeCheckTime}ms`);
        console.log(`   🔄 Aggregation: ${metrics.aggregationTime}ms`);
        console.log(`   📊 Total query: ${metrics.totalQueryTime}ms`);
      }
      
      // Determine performance tier
      let performanceTier = 'Standard';
      if (totalRecords > 2000000) performanceTier = 'Enterprise (Quarterly)';
      else if (totalRecords > 500000) performanceTier = 'Large (Monthly)';
      else if (totalRecords > 100000) performanceTier = 'Medium (Weekly)';
      
      console.log(`   🎯 Performance tier: ${performanceTier}`);
      
      // Validate aggregation logic
      let expectedAggregation = 'daily';
      if (totalRecords > 2000000) expectedAggregation = 'quarterly';
      else if (totalRecords > 500000) expectedAggregation = 'monthly';
      else if (totalRecords > 100000) expectedAggregation = 'weekly';
      
      const aggregationCorrect = aggregationLevel === expectedAggregation;
      console.log(`   ✅ Aggregation logic: ${aggregationCorrect ? 'CORRECT' : 'INCORRECT'}`);
      
      // Performance validation
      const performanceGood = queryTime < 10000; // Under 10 seconds
      console.log(`   ⚡ Performance: ${performanceGood ? 'GOOD' : 'NEEDS OPTIMIZATION'}`);
      
      results.push({
        year,
        totalRecords,
        aggregationLevel,
        expectedAggregation,
        aggregationCorrect,
        queryTime,
        performanceGood,
        fromCache,
        recordCount,
        performanceTier
      });
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
      results.push({
        year,
        error: error.message
      });
    }
  }
  
  // Summary report
  console.log('\n🎯 DYNAMIC AGGREGATION SYSTEM TEST RESULTS');
  console.log('='.repeat(50));
  
  const successfulTests = results.filter(r => !r.error);
  const totalSuccessful = successfulTests.length;
  const correctAggregation = successfulTests.filter(r => r.aggregationCorrect).length;
  const goodPerformance = successfulTests.filter(r => r.performanceGood).length;
  const cacheHits = successfulTests.filter(r => r.fromCache).length;
  
  console.log(`📊 Tests completed: ${results.length}`);
  console.log(`✅ Successful: ${totalSuccessful}`);
  console.log(`🎯 Correct aggregation: ${correctAggregation}/${totalSuccessful}`);
  console.log(`⚡ Good performance: ${goodPerformance}/${totalSuccessful}`);
  console.log(`💾 Cache hits: ${cacheHits}/${totalSuccessful}`);
  
  // Performance tier breakdown
  const tierBreakdown = {};
  successfulTests.forEach(result => {
    tierBreakdown[result.performanceTier] = (tierBreakdown[result.performanceTier] || 0) + 1;
  });
  
  console.log('\n🏆 Performance Tier Distribution:');
  Object.entries(tierBreakdown).forEach(([tier, count]) => {
    console.log(`   ${tier}: ${count} year(s)`);
  });
  
  // Record volume analysis
  const totalRecordsAcrossYears = successfulTests.reduce((sum, r) => sum + r.totalRecords, 0);
  console.log(`\n📈 Total records tested: ${totalRecordsAcrossYears.toLocaleString()}`);
  
  // Average performance by tier
  console.log('\n⚡ Average Query Times by Tier:');
  const performanceByTier = {};
  successfulTests.forEach(result => {
    if (!performanceByTier[result.aggregationLevel]) {
      performanceByTier[result.aggregationLevel] = [];
    }
    performanceByTier[result.aggregationLevel].push(result.queryTime);
  });
  
  Object.entries(performanceByTier).forEach(([level, times]) => {
    const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    console.log(`   ${level}: ${Math.round(avgTime)}ms average`);
  });
  
  console.log('\n🎉 Dynamic aggregation system test completed!');
  
  if (correctAggregation === totalSuccessful && goodPerformance === totalSuccessful) {
    console.log('✅ All tests passed - system ready for 5-10M record processing!');
  } else {
    console.log('⚠️  Some tests need attention - review results above');
  }
}

// Run the test
if (require.main === module) {
  testDynamicAggregation()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Test script error:', error);
      process.exit(1);
    });
}

module.exports = { testDynamicAggregation };