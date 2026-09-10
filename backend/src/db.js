const { Pool } = require('pg');
require('dotenv').config();

/**
 * PostgreSQL Connection Pool
 * Using a pool instead of a single client is the best practice for
 * a web server — it handles multiple concurrent requests efficiently.
 */
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Max connections in the pool. Match this to your DB plan limits.
  max: 10,
  // Close idle clients after 30 seconds
  idleTimeoutMillis: 30000,
  // Fail fast if a connection takes longer than 5 seconds
  connectionTimeoutMillis: 5000,
});

/**
 * Test the connection on startup.
 * This will throw an error immediately if your DB credentials are wrong.
 */
pool.connect((err, client, release) => {
  if (err) {
    console.error('[DB] ❌ Failed to connect to PostgreSQL:', err.message);
    process.exit(1); // Kill the process — no point running without a DB
  }
  console.log('[DB] ✅ PostgreSQL connected successfully.');
  release(); // Release the client back to the pool
});

// Listen for unexpected pool errors
pool.on('error', (err) => {
  console.error('[DB] ❌ Unexpected pool error:', err);
  process.exit(1);
});

module.exports = pool;
