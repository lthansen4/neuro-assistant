/* eslint-disable no-console */
/**
 * Script to run migration 0015: Rebalancing — Rollback Snapshots
 * 
 * This migration creates:
 * - rollback_snapshots table (stores pre-move state for undo)
 * - Bidirectional link between proposals and snapshots
 * - Index for cleanup job (7-day retention)
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
    const migrationPath = join(process.cwd(), 'packages/db/migrations/0015_rebalancing_rollback_snapshots.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration 0015...\n');
    await client.query(migrationSQL);

    console.log('\n✅ Migration 0015 executed successfully\n');

    // Verification
    console.log('🔍 Verifying migration changes...\n');

    // 1) Check rollback_snapshots table
    const snapshotsExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'rollback_snapshots'
      );
    `);

    if (snapshotsExists.rows[0].exists) {
      console.log('✅ rollback_snapshots table exists');
      
      // Check columns
      const snapshotColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'rollback_snapshots'
        ORDER BY ordinal_position;
      `);

      console.log(`   Columns (${snapshotColumns.rows.length}):`);
      snapshotColumns.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`     - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });

      // Check indexes
      const snapshotIndexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'rollback_snapshots'
        ORDER BY indexname;
      `);

      if (snapshotIndexes.rows.length > 0) {
        console.log(`   Indexes (${snapshotIndexes.rows.length}):`);
        snapshotIndexes.rows.forEach(idx => {
          console.log(`     - ${idx.indexname}`);
        });
      }

      // Check constraints
      const snapshotConstraints = await client.query(`
        SELECT conname, contype, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'rollback_snapshots'::regclass
        ORDER BY conname;
      `);

      if (snapshotConstraints.rows.length > 0) {
        console.log(`   Constraints (${snapshotConstraints.rows.length}):`);
        snapshotConstraints.rows.forEach(con => {
          const type = con.contype === 'c' ? 'CHECK' : con.contype === 'u' ? 'UNIQUE' : con.contype === 'f' ? 'FK' : con.contype === 'p' ? 'PK' : 'OTHER';
          console.log(`     - ${con.conname} (${type}): ${con.definition}`);
        });
      }

      // Check foreign keys
      const snapshotFks = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'rollback_snapshots';
      `);

      if (snapshotFks.rows.length > 0) {
        console.log(`   Foreign Keys:`);
        snapshotFks.rows.forEach(fk => {
          console.log(`     - ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
        });
      }

      console.log();
    } else {
      console.log('❌ rollback_snapshots table not found!\n');
    }

    // 2) Check rebalancing_proposals.snapshot_id column and FK
    const proposalsExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'rebalancing_proposals'
      );
    `);

    if (proposalsExists.rows[0].exists) {
      console.log('✅ rebalancing_proposals table exists, checking snapshot_id...\n');

      // Check if snapshot_id column exists
      const snapshotIdColumn = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'rebalancing_proposals'
          AND column_name = 'snapshot_id';
      `);

      if (snapshotIdColumn.rows.length > 0) {
        console.log('✅ snapshot_id column exists:');
        console.log(`   Type: ${snapshotIdColumn.rows[0].data_type}`);
        console.log(`   Nullable: ${snapshotIdColumn.rows[0].is_nullable === 'YES' ? 'YES' : 'NO'}\n`);
      } else {
        console.log('⚠️  snapshot_id column not found\n');
      }

      // Check FK constraint
      const snapshotIdFk = await client.query(`
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
          AND tc.table_name = 'rebalancing_proposals'
          AND kcu.column_name = 'snapshot_id';
      `);

      if (snapshotIdFk.rows.length > 0) {
        console.log('✅ FK constraint on rebalancing_proposals.snapshot_id:');
        snapshotIdFk.rows.forEach(fk => {
          console.log(`   Constraint: ${fk.constraint_name}`);
          console.log(`   Column: ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
          console.log(`   On Delete: ${fk.delete_rule}\n`);
        });
      } else {
        console.log('⚠️  FK constraint on rebalancing_proposals.snapshot_id not found\n');
      }
    } else {
      console.log('⚠️  rebalancing_proposals table does not exist\n');
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
      console.log('✅ users table exists (prerequisite met)');
    } else {
      console.log('❌ users table does not exist (prerequisite missing!)');
    }

    const rebalancingProposalsExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'rebalancing_proposals'
      );
    `);

    if (rebalancingProposalsExists.rows[0].exists) {
      console.log('✅ rebalancing_proposals table exists (prerequisite met)\n');
    } else {
      console.log('❌ rebalancing_proposals table does not exist (prerequisite missing!)\n');
    }

    console.log('✅ Verification complete.');
    console.log('\n📋 Next steps:');
    console.log('   - Test snapshot creation and retrieval');
    console.log('   - Verify bidirectional link between proposals and snapshots');
    console.log('   - Set up cleanup job for 7-day retention\n');

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





