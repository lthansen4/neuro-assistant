/* eslint-disable no-console */
/**
 * Script to run migration 0017: Rebalancing — Apply Attempts
 * 
 * This migration creates:
 * - rebalancing_apply_attempts table (audit trail for apply/undo operations)
 * 
 * Prerequisites:
 * - rebalancing_proposals table (from migration 0013_5) ✅
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
    const migrationPath = join(process.cwd(), 'packages/db/migrations/0017_rebalancing_apply_attempts.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration 0017...\n');
    await client.query(migrationSQL);

    console.log('\n✅ Migration 0017 executed successfully\n');

    // Verification
    console.log('🔍 Verifying migration changes...\n');

    // 1) Check rebalancing_apply_attempts table
    const attemptsExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'rebalancing_apply_attempts'
      );
    `);

    if (attemptsExists.rows[0].exists) {
      console.log('✅ rebalancing_apply_attempts table exists');
      
      // Check columns
      const attemptsColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'rebalancing_apply_attempts'
        ORDER BY ordinal_position;
      `);

      console.log(`   Columns (${attemptsColumns.rows.length}):`);
      attemptsColumns.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`     - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });

      // Check indexes
      const attemptsIndexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'rebalancing_apply_attempts'
        ORDER BY indexname;
      `);

      if (attemptsIndexes.rows.length > 0) {
        console.log(`   Indexes (${attemptsIndexes.rows.length}):`);
        attemptsIndexes.rows.forEach(idx => {
          console.log(`     - ${idx.indexname}`);
          if (idx.indexdef.length < 120) {
            console.log(`       ${idx.indexdef}`);
          }
        });
      }

      // Check constraints
      const attemptsConstraints = await client.query(`
        SELECT conname, contype, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'rebalancing_apply_attempts'::regclass
        ORDER BY conname;
      `);

      if (attemptsConstraints.rows.length > 0) {
        console.log(`   Constraints (${attemptsConstraints.rows.length}):`);
        attemptsConstraints.rows.forEach(con => {
          const type = con.contype === 'c' ? 'CHECK' : con.contype === 'u' ? 'UNIQUE' : con.contype === 'f' ? 'FK' : con.contype === 'p' ? 'PK' : 'OTHER';
          console.log(`     - ${con.conname} (${type})`);
          if (con.definition.length < 150) {
            console.log(`       ${con.definition}`);
          }
        });
      }

      // Check foreign keys
      const attemptsFks = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'rebalancing_apply_attempts';
      `);

      if (attemptsFks.rows.length > 0) {
        console.log(`   Foreign Keys:`);
        attemptsFks.rows.forEach(fk => {
          console.log(`     - ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name} (ON DELETE ${fk.delete_rule})`);
        });
      }

      console.log();
    } else {
      console.log('❌ rebalancing_apply_attempts table not found!\n');
    }

    // 2) Verify prerequisites
    console.log('🔍 Checking prerequisites...\n');

    const usersExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    if (usersExists.rows[0].exists) {
      console.log('✅ users table exists (prerequisite met)');
    } else {
      console.log('❌ users table does not exist (prerequisite missing!)');
    }

    const proposalsExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'rebalancing_proposals'
      );
    `);

    if (proposalsExists.rows[0].exists) {
      console.log('✅ rebalancing_proposals table exists (prerequisite met)\n');
    } else {
      console.log('❌ rebalancing_proposals table does not exist (prerequisite missing!)\n');
    }

    console.log('✅ Verification complete.');
    console.log('\n📋 Next steps:');
    console.log('   - Test apply attempt recording on proposal apply');
    console.log('   - Test undo attempt recording on undo');
    console.log('   - Verify conflict tracking in conflicts JSONB');
    console.log('   - Monitor status distribution for diagnostics');
    console.log('   - Set up cleanup job (retain 90 days per PRD)\n');

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





