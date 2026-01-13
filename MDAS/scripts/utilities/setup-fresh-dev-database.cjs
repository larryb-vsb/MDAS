/**
 * Fresh Development Database Setup
 * Creates essential tables for MMS in a fresh Neon development database
 */

const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');

// Required for Neon serverless driver
neonConfig.webSocketConstructor = ws;

async function setupFreshDatabase() {
  const devUrl = process.env.NEON_DEV_DATABASE_URL;
  
  if (!devUrl) {
    console.log('❌ NEON_DEV_DATABASE_URL not found');
    return false;
  }

  console.log('🔧 Setting up fresh development database...');
  console.log(`📍 URL: ${devUrl.substring(0, 80)}...`);

  const pool = new Pool({ connectionString: devUrl });

  try {
    const client = await pool.connect();
    
    console.log('🗑️  Dropping existing dev tables...');
    
    // Get current user
    const userResult = await client.query('SELECT current_user');
    const currentUser = userResult.rows[0].current_user;
    console.log(`🔑 Current user: ${currentUser}`);
    
    // Drop existing development tables if they exist
    await client.query(`
      DO $$ 
      DECLARE 
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'dev_%') 
        LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    
    console.log('🏗️  Creating core system tables...');
    
    // System logs table
    await client.query(`
      CREATE TABLE dev_system_logs (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        level VARCHAR(10) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB,
        server_id VARCHAR(50),
        category VARCHAR(50)
      );
    `);
    
    // Uploaded files table
    await client.query(`
      CREATE TABLE dev_uploaded_files (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        file_size INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'uploaded',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        file_type VARCHAR(50),
        metadata JSONB,
        business_day DATE,
        file_date DATE
      );
    `);
    
    // TDDF API tables
    await client.query(`
      CREATE TABLE dev_tddf_api_queue (
        id SERIAL PRIMARY KEY,
        status VARCHAR(50) DEFAULT 'pending',
        file_path VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      );
    `);
    
    await client.query(`
      CREATE TABLE dev_tddf_api_files (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        status VARCHAR(50) DEFAULT 'uploaded',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      );
    `);
    
    await client.query(`
      CREATE TABLE dev_tddf_api_schemas (
        id SERIAL PRIMARY KEY,
        schema_name VARCHAR(255) NOT NULL,
        schema_config JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      );
    `);
    
    // Basic merchants table
    await client.query(`
      CREATE TABLE dev_merchants (
        id SERIAL PRIMARY KEY,
        merchant_name VARCHAR(255) NOT NULL,
        merchant_id VARCHAR(100) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB
      );
    `);
    
    console.log('📊 Creating indexes...');
    
    await client.query(`
      CREATE INDEX idx_dev_system_logs_timestamp ON dev_system_logs(timestamp);
      CREATE INDEX idx_dev_uploaded_files_status ON dev_uploaded_files(status);
      CREATE INDEX idx_dev_uploaded_files_business_day ON dev_uploaded_files(business_day);
      CREATE INDEX idx_dev_tddf_api_queue_status ON dev_tddf_api_queue(status);
    `);
    
    console.log('✅ Development database setup complete!');
    console.log('📋 Created tables:');
    console.log('   - dev_system_logs');
    console.log('   - dev_uploaded_files');
    console.log('   - dev_tddf_api_queue');
    console.log('   - dev_tddf_api_files');
    console.log('   - dev_tddf_api_schemas');
    console.log('   - dev_merchants');
    
    client.release();
    await pool.end();
    
    return true;
  } catch (error) {
    console.log('❌ Setup failed:');
    console.error(`Error: ${error.message}`);
    
    await pool.end();
    return false;
  }
}

// Run the setup
setupFreshDatabase()
  .then(success => {
    if (success) {
      console.log('\n🎉 Database setup complete! You can now restart your application.');
    } else {
      console.log('\n💡 Fix the issues above and run this script again.');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  });