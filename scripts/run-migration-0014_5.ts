/* eslint-disable no-console */
/**
 * Script to run migration 0014_5: Rebalancing Bridge — Calendar Integration
 * 
 * This migration:
 * - Adds index for assignment linkage on calendar_events_new
 * - Attaches the immovable safety trigger on calendar_events_new
 * - Enforces referential integrity for proposal_moves.source_event_id
 * 
 * Prerequisites:
 * - calendar_events_new table (from migration 0008) ⚠️
 * - prevent_move_immovable() function (from migration 0014) ✅
 * - proposal_moves table (from migration 0013_5) ✅
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
    const migrationPath = join(process.cwd(), 'packages/db/migrations/0014_5_rebalancing_bridge_calendar_integration.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration 0014_5...\n');
    await client.query(migrationSQL);

    console.log('\n✅ Migration 0014_5 executed successfully\n');

    // Verification
    console.log('🔍 Verifying migration changes...\n');

    // 1) Check if calendar_events_new exists
    const calendarEventsNewExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'calendar_events_new'
      );
    `);

    if (calendarEventsNewExists.rows[0].exists) {
      console.log('✅ calendar_events_new table exists\n');

      // Check index
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

      // Check trigger
      const trigger = await client.query(`
        SELECT tgname, tgenabled, pg_get_triggerdef(pg_trigger.oid) as definition
        FROM pg_trigger
        WHERE tgname = 'trg_prevent_move_immovable'
        AND tgrelid = 'calendar_events_new'::regclass;
      `);

      if (trigger.rows.length > 0) {
        console.log('✅ Immovable event trigger exists:');
        console.log(`   Name: ${trigger.rows[0].tgname}`);
        console.log(`   Enabled: ${trigger.rows[0].tgenabled === 'O' ? 'YES' : 'NO'}`);
        console.log(`   ${trigger.rows[0].definition.substring(0, 120)}...\n`);
      } else {
        console.log('⚠️  trg_prevent_move_immovable trigger not found\n');
      }

      // Check function
      const functionCheck = await client.query(`
        SELECT proname, pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'prevent_move_immovable';
      `);

      if (functionCheck.rows.length > 0) {
        console.log('✅ prevent_move_immovable() function exists\n');
      } else {
        console.log('⚠️  prevent_move_immovable() function not found\n');
        console.log('   This function should have been created in migration 0014.\n');
      }

    } else {
      console.log('❌ calendar_events_new table does not exist!');
      console.log('   This migration requires calendar_events_new from migration 0008.');
      console.log('   Skipping calendar_events_new checks...\n');
    }

    // 2) Check proposal_moves FK constraint
    const proposalMovesExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'proposal_moves'
      );
    `);

    if (proposalMovesExists.rows[0].exists) {
      console.log('✅ proposal_moves table exists, checking FK constraint...\n');

      const fkConstraint = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'proposal_moves'
          AND kcu.column_name = 'source_event_id';
      `);

      if (fkConstraint.rows.length > 0) {
        console.log('✅ FK constraint on proposal_moves.source_event_id:');
        fkConstraint.rows.forEach(fk => {
          console.log(`   Constraint: ${fk.constraint_name}`);
          console.log(`   Column: ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
          console.log(`   On Delete: ${fk.delete_rule}\n`);
        });
      } else {
        if (calendarEventsNewExists.rows[0].exists) {
          console.log('⚠️  FK constraint on proposal_moves.source_event_id not found');
          console.log('   This may be because calendar_events_new was created after proposal_moves.\n');
        } else {
          console.log('ℹ️  FK constraint skipped (calendar_events_new does not exist)\n');
        }
      }
    } else {
      console.log('⚠️  proposal_moves table does not exist\n');
    }

    console.log('✅ Verification complete.');
    console.log('\n📋 Next steps:');
    if (!calendarEventsNewExists.rows[0].exists) {
      console.log('   - Run migration 0008 to create calendar_events_new table');
      console.log('   - Then re-run this migration to add index and trigger');
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







