require('dotenv').config();
const pool = require('../src/db');

async function runMigration() {
  console.log('[Migration] Starting Database Schema Migration V2...');

  try {
    // 1. Alter USERS table
    await pool.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS unpaid_commission DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS payout_methods JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
    console.log('✅ users table updated with unpaid_commission and payout_methods.');

    // 2. Alter AUCTIONS table
    await pool.query(`
      ALTER TABLE auctions 
      ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'General',
      ADD COLUMN IF NOT EXISTS republished_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(12, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS commission_calculated BOOLEAN DEFAULT FALSE;
    `);
    console.log('✅ auctions table updated with start_time, category, commission fields.');

    // 3. Create COMMISSION_PROOFS table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS commission_proofs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount DECIMAL(12, 2) NOT NULL,
        comment TEXT,
        proof_url TEXT NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
        admin_notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_commission_proofs_status ON commission_proofs(status);
      CREATE INDEX IF NOT EXISTS idx_commission_proofs_user_id ON commission_proofs(user_id);
    `);
    console.log('✅ commission_proofs table created successfully with indexes.');

    console.log('🎉 Migration V2 Completed Successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
