const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

/**
 * Database Migration Script
 * Reads schema.sql and runs it against the configured database.
 * Essential for cloud deployment release phases (AWS RDS, Supabase, Render, Neon).
 */
async function runMigration() {
  console.log('🔄 [Migration] Starting database migration...');
  const schemaPath = path.join(__dirname, '..', 'schema.sql');

  if (!fs.existsSync(schemaPath)) {
    console.error('❌ [Migration] schema.sql not found at:', schemaPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    console.log('🔄 [Migration] Connected to PostgreSQL. Applying schema...');
    await client.query(sql);
    console.log('✅ [Migration] Schema applied successfully! All tables, indexes, and constraints are in place.');
  } catch (err) {
    console.error('❌ [Migration] Error applying schema:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    console.log('🔒 [Migration] Database connection pool closed.');
  }
}

runMigration();
