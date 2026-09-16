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
    // Auto-migration: ensure latest schema columns and tables exist in production DB
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS unpaid_commission NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS payout_methods JSONB DEFAULT '{}'::jsonb;

      ALTER TABLE auctions ADD COLUMN IF NOT EXISTS start_time TIMESTAMP;
      ALTER TABLE auctions ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'General';
      ALTER TABLE auctions ADD COLUMN IF NOT EXISTS republished_at TIMESTAMP;
      ALTER TABLE auctions ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(12,2) DEFAULT 0.00;
      ALTER TABLE auctions ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN DEFAULT FALSE;

      ALTER TABLE auctions DROP CONSTRAINT IF EXISTS auctions_status_check;
      ALTER TABLE auctions ADD CONSTRAINT auctions_status_check CHECK (status IN ('ACTIVE', 'CLOSED', 'RESTRICTED'));

      ALTER TABLE commission_proofs ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'MANUAL_WIRE';
      ALTER TABLE commission_proofs ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);
      ALTER TABLE commission_proofs ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
      ALTER TABLE commission_proofs ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE commission_proofs ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

      CREATE TABLE IF NOT EXISTS commission_proofs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(12,2) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(255),
        screenshot_url TEXT NOT NULL,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'PENDING',
        admin_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_commission_proofs_user ON commission_proofs(user_id);
      CREATE INDEX IF NOT EXISTS idx_commission_proofs_status ON commission_proofs(status);

      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        auction_id UUID REFERENCES auctions(id) ON DELETE SET NULL,
        purpose VARCHAR(50) NOT NULL DEFAULT 'COMMISSION',
        amount NUMERIC(12,2) NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        razorpay_order_id VARCHAR(255) NOT NULL,
        razorpay_payment_id VARCHAR(255),
        razorpay_signature VARCHAR(255),
        status VARCHAR(50) NOT NULL DEFAULT 'CREATED',
        notes JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        verified_at TIMESTAMP WITH TIME ZONE
      );
      CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(razorpay_order_id);
    `);
    console.log('[DB] ✅ PostgreSQL connected successfully & verified latest v2 schema.');
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
