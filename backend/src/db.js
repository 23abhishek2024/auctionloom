const { Pool } = require('pg');
require('dotenv').config();

/**
 * PostgreSQL Connection Pool
 * Using a pool instead of a single client is the best practice for
 * a web server — it handles multiple concurrent requests efficiently.
 */
const isProduction = process.env.NODE_ENV === 'production';
const hasCloudUrl = !!process.env.DATABASE_URL;

// Cloud providers (AWS RDS, Supabase, Neon, Render) require SSL encryption
const sslConfig =
  (isProduction || hasCloudUrl) && process.env.DISABLE_DB_SSL !== 'true'
    ? { rejectUnauthorized: false }
    : false;

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'auctionloom',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: sslConfig,
      max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

/**
 * Test the connection on startup.
 * This will throw an error immediately if your DB credentials are wrong.
 */
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('[DB] ❌ Failed to connect to PostgreSQL:', err.message);
    process.exit(1); // Kill the process — no point running without a DB
  }
  try {
    // Auto-migration: ensure 'name' column exists in users table
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);');
    console.log('[DB] ✅ PostgreSQL connected successfully & user schema verified.');
  } catch (migErr) {
    console.warn('[DB] ⚠️ Schema auto-migration notice:', migErr.message);
  } finally {
    release(); // Release the client back to the pool
  }
});

// Listen for unexpected pool errors
pool.on('error', (err) => {
  console.error('[DB] ❌ Unexpected pool error:', err);
  process.exit(1);
});

module.exports = pool;
