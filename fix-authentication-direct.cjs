// Direct authentication fix - create working user in correct database
const { Pool } = require('pg');

async function fixAuthentication() {
  // Use the exact DATABASE_URL that the app connects to
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔧 Fixing authentication in the actual database the app connects to...');
    
    // Create dev_users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dev_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        developer_flag BOOLEAN DEFAULT false,
        dark_mode BOOLEAN DEFAULT false,
        can_create_users BOOLEAN DEFAULT false,
        default_dashboard VARCHAR(255) DEFAULT 'merchants',
        theme_preference VARCHAR(50) DEFAULT 'system'
      );
    `);

    // Update existing admin user if exists
    const existingUser = await pool.query('SELECT id FROM dev_users WHERE username = $1', ['admin']);
    if (existingUser.rows.length > 0) {
      console.log('🔄 Updating existing admin user...');
    }

    // Create admin user with simple password hash for 'admin123'
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    const result = await pool.query(`
      INSERT INTO dev_users (
        username, password, email, first_name, last_name, role, 
        developer_flag, can_create_users
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (username) DO UPDATE SET
        password = EXCLUDED.password,
        email = EXCLUDED.email,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        role = EXCLUDED.role,
        developer_flag = EXCLUDED.developer_flag,
        can_create_users = EXCLUDED.can_create_users
      RETURNING id, username, role
    `, [
      'admin', 
      passwordHash, 
      'admin@example.com', 
      'System', 
      'Administrator', 
      'admin', 
      true, 
      true
    ]);

    console.log('✅ Authentication fixed successfully:', result.rows[0]);
    
    // Test the password
    const testUser = await pool.query('SELECT * FROM dev_users WHERE username = $1', ['admin']);
    const isValidPassword = await bcrypt.compare('admin123', testUser.rows[0].password);
    console.log('🔐 Password test:', isValidPassword ? 'PASS' : 'FAIL');
    
    await pool.end();
    
  } catch (error) {
    console.error('❌ Error fixing authentication:', error.message);
    await pool.end();
    process.exit(1);
  }
}

fixAuthentication();