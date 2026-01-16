/* eslint-disable no-console */
/**
 * Script to run migration 0014: Rebalancing Concurrency & Assignment Linkage
 * 
 * This migration adds:
 * - Baseline fields (baseline_updated_at, baseline_version, metadata) to proposal_moves
 * - Indexes for assignment linkage and metadata queries
 * - Defense-in-depth trigger to prevent moving immovable events
 * 
 * Prerequisites:
 * - calendar_events_new table (from migration 0008) ✅
 * - proposal_moves table (optional - migration will skip gracefully if missing) ⚠️
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
    const migrationPath = join(process.cwd(), 'packages/db/migrations/0014_rebalancing_concurrency_assignment_linkage.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration 0014...\n');
    await client.query(migrationSQL);

    console.log('\n✅ Migration 0014 executed successfully\n');

    // Verification
    console.log('🔍 Verifying migration changes...\n');

    // 1) Check if proposal_moves exists and has new columns
    const proposalMovesExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'proposal_moves'
      );
    `);

    if (proposalMovesExists.rows[0].exists) {
      console.log('✅ proposal_moves table exists, checking columns...');
      
      const columns = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'proposal_moves'
        AND column_name IN ('baseline_updated_at', 'baseline_version', 'metadata')
        ORDER BY column_name;
      `);

      if (columns.rows.length === 3) {
        console.log('✅ All baseline columns exist:');
        columns.rows.forEach(col => {
          console.log(`   - ${col.column_name}: ${col.data_type}`);
        });
        console.log();
      } else {
        console.log(`⚠️  Only ${columns.rows.length}/3 baseline columns found\n`);
      }

      // Check indexes
      const indexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'proposal_moves'
        AND indexname IN (
          'idx_proposal_moves_source',
          'idx_proposal_moves_metadata_gin',
          'idx_moves_assignment'
        )
        ORDER BY indexname;
      `);

      if (indexes.rows.length > 0) {
        console.log('✅ Indexes on proposal_moves:');
        indexes.rows.forEach(idx => {
          console.log(`   - ${idx.indexname}`);
          if (idx.indexdef.includes('metadata')) {
            console.log(`     ${idx.indexdef}`);
          }
        });
        console.log();
      }
    } else {
      console.log('⚠️  proposal_moves table does not exist (expected if base tables not created yet)\n');
    }

    // 2) Check calendar_events_new index
    const calendarEventsNewExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'calendar_events_new'
      );
    `);

    if (calendarEventsNewExists.rows[0].exists) {
      console.log('✅ calendar_events_new table exists, checking index...');
      
      const assignmentIndex = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'calendar_events_new'
        AND indexname = 'idx_events_user_assignment';
      `);

      if (assignmentIndex.rows.length > 0) {
        console.log('✅ Assignment linkage index exists:');
        console.log(`   ${assignmentIndex.rows[0].indexname}`);
        console.log(`   ${assignmentIndex.rows[0].indexdef}\n`);
      } else {
        console.log('⚠️  idx_events_user_assignment index not found\n');
      }

      // 3) Check trigger
      const trigger = await client.query(`
        SELECT tgname, tgenabled, pg_get_triggerdef(oid) as definition
        FROM pg_trigger
        WHERE tgname = 'trg_prevent_move_immovable'
        AND tgrelid = 'calendar_events_new'::regclass;
      `);

      if (trigger.rows.length > 0) {
        console.log('✅ Immovable event trigger exists:');
        console.log(`   Name: ${trigger.rows[0].tgname}`);
        console.log(`   Enabled: ${trigger.rows[0].tgenabled === 'O' ? 'YES' : 'NO'}`);
        console.log(`   Definition: ${trigger.rows[0].definition.substring(0, 100)}...\n`);
      } else {
        console.log('⚠️  trg_prevent_move_immovable trigger not found\n');
      }

      // 4) Test trigger function exists
      const functionCheck = await client.query(`
        SELECT proname, pg_get_functiondef(oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'prevent_move_immovable';
      `);

      if (functionCheck.rows.length > 0) {
        console.log('✅ prevent_move_immovable() function exists\n');
      } else {
        console.log('⚠️  prevent_move_immovable() function not found\n');
      }

      // 5) Optional: Test trigger with a mock event (if you have test data)
      console.log('💡 To test the trigger, run:');
      console.log('   1. Create a test event with is_movable = false');
      console.log('   2. Try to UPDATE its start_at or end_at → should fail');
      console.log('   3. Try to UPDATE its title → should succeed\n');

    } else {
      console.log('❌ calendar_events_new table does not exist!');
      console.log('   This migration requires calendar_events_new from migration 0008.\n');
    }

    console.log('✅ Verification complete.');
    console.log('\n📋 Next steps:');
    if (!proposalMovesExists.rows[0].exists) {
      console.log('   - Create proposal_moves and rebalancing_proposals tables (see PRD-Rebalancing-Engine-Database.md)');
    }
    console.log('   - Test the immovable event trigger with test data');
    console.log('   - Verify assignment linkage queries use the new indexes\n');

  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
    if (err.detail) {
      console.error('   Detail:', err.detail);
    }
    if (err.hint) {
      console.error('   Hint:', err.hint);
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





