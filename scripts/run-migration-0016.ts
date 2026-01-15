/* eslint-disable no-console */
/**
 * Script to run migration 0016: Rebalancing — Churn Management
 * 
 * This migration creates:
 * - churn_ledger table (tracks daily churn usage per user)
 * - churn_settings table (per-user daily cap overrides)
 * 
 * Prerequisites:
 * - users table (from migration 0001) ✅
 */

import { Client } from 'pg';
import { config } from 'dotenv';
import { join } from 'path';
import { readFileSync } from 'fs';

// Load environment variables
config({ path: join(process.cwd(), '.env') });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read and execute migration
    const migrationPath = join(process.cwd(), 'packages/db/migrations/0016_rebalancing_churn_management.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration 0016...\n');
    await client.query(migrationSQL);

    console.log('\n✅ Migration 0016 executed successfully\n');

    // Verification
    console.log('🔍 Verifying migration changes...\n');

    // 1) Check churn_ledger table
    const ledgerExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'churn_ledger'
      );
    `);

    if (ledgerExists.rows[0].exists) {
      console.log('✅ churn_ledger table exists');
      
      // Check columns
      const ledgerColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'churn_ledger'
        ORDER BY ordinal_position;
      `);

      console.log(`   Columns (${ledgerColumns.rows.length}):`);
      ledgerColumns.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`     - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });

      // Check indexes
      const ledgerIndexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'churn_ledger'
        ORDER BY indexname;
      `);

      if (ledgerIndexes.rows.length > 0) {
        console.log(`   Indexes (${ledgerIndexes.rows.length}):`);
        ledgerIndexes.rows.forEach(idx => {
          console.log(`     - ${idx.indexname}`);
        });
      }

      // Check constraints
      const ledgerConstraints = await client.query(`
        SELECT conname, contype, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'churn_ledger'::regclass
        ORDER BY conname;
      `);

      if (ledgerConstraints.rows.length > 0) {
        console.log(`   Constraints (${ledgerConstraints.rows.length}):`);
        ledgerConstraints.rows.forEach(con => {
          const type = con.contype === 'c' ? 'CHECK' : con.contype === 'u' ? 'UNIQUE' : con.contype === 'f' ? 'FK' : con.contype === 'p' ? 'PK' : 'OTHER';
          console.log(`     - ${con.conname} (${type}): ${con.definition}`);
        });
      }

      console.log();
    } else {
      console.log('❌ churn_ledger table not found!\n');
    }

    // 2) Check churn_settings table
    const settingsExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'churn_settings'
      );
    `);

    if (settingsExists.rows[0].exists) {
      console.log('✅ churn_settings table exists');
      
      // Check columns
      const settingsColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'churn_settings'
        ORDER BY ordinal_position;
      `);

      console.log(`   Columns (${settingsColumns.rows.length}):`);
      settingsColumns.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`     - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });

      // Check indexes
      const settingsIndexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'churn_settings'
        ORDER BY indexname;
      `);

      if (settingsIndexes.rows.length > 0) {
        console.log(`   Indexes (${settingsIndexes.rows.length}):`);
        settingsIndexes.rows.forEach(idx => {
          console.log(`     - ${idx.indexname}`);
        });
      }

      // Check constraints
      const settingsConstraints = await client.query(`
        SELECT conname, contype, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'churn_settings'::regclass
        ORDER BY conname;
      `);

      if (settingsConstraints.rows.length > 0) {
        console.log(`   Constraints (${settingsConstraints.rows.length}):`);
        settingsConstraints.rows.forEach(con => {
          const type = con.contype === 'c' ? 'CHECK' : con.contype === 'u' ? 'UNIQUE' : con.contype === 'f' ? 'FK' : con.contype === 'p' ? 'PK' : 'OTHER';
          console.log(`     - ${con.conname} (${type}): ${con.definition}`);
        });
      }

      console.log();
    } else {
      console.log('❌ churn_settings table not found!\n');
    }

    // 3) Verify prerequisites
    console.log('🔍 Checking prerequisites...\n');

    const usersExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (usersExists.rows[0].exists) {
      console.log('✅ users table exists (prerequisite met)\n');
    } else {
      console.log('❌ users table does not exist (prerequisite missing!)\n');
    }

    console.log('✅ Verification complete.');
    console.log('\n📋 Next steps:');
    console.log('   - Test churn ledger tracking (increment minutes_moved on proposal apply)');
    console.log('   - Test churn settings (user-specific daily cap overrides)');
    console.log('   - Verify daily cap enforcement in proposal application logic');
    console.log('   - Set up cleanup job for churn_ledger (retain 180 days per PRD)\n');

  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
    if (err.detail) {
      console.error('   Detail:', err.detail);
    }
    if (err.hint) {
      console.error('   Hint:', err.hint);
    }
    if (err.position) {
      console.error('   Position:', err.position);
    }
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});




