/* eslint-disable no-console */
/**
 * Script to run migration 0013_5: Rebalancing Engine Base Tables
 * 
 * This migration creates:
 * - rebalancing_proposals table (proposal metadata and status)
 * - proposal_moves table (individual diff operations)
 * 
 * Prerequisites:
 * - users table (from migration 0001) ✅
 * - calendar_events_new table (from migration 0008) ✅
 * 
 * Next steps:
 * - Run migration 0014 to add baseline fields and triggers to proposal_moves
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
    const migrationPath = join(process.cwd(), 'packages/db/migrations/0013_5_rebalancing_base_tables.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration 0013_5...\n');
    await client.query(migrationSQL);

    console.log('\n✅ Migration 0013_5 executed successfully\n');

    // Verification
    console.log('🔍 Verifying migration changes...\n');

    // 1) Check rebalancing_proposals table
    const proposalsExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'rebalancing_proposals'
      );
    `);

    if (proposalsExists.rows[0].exists) {
      console.log('✅ rebalancing_proposals table exists');
      
      // Check columns
      const proposalColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'rebalancing_proposals'
        ORDER BY ordinal_position;
      `);

      console.log(`   Columns (${proposalColumns.rows.length}):`);
      proposalColumns.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`     - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });

      // Check indexes
      const proposalIndexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'rebalancing_proposals'
        ORDER BY indexname;
      `);

      if (proposalIndexes.rows.length > 0) {
        console.log(`   Indexes (${proposalIndexes.rows.length}):`);
        proposalIndexes.rows.forEach(idx => {
          console.log(`     - ${idx.indexname}`);
        });
      }

      // Check constraints
      const proposalConstraints = await client.query(`
        SELECT conname, contype, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'rebalancing_proposals'::regclass
        ORDER BY conname;
      `);

      if (proposalConstraints.rows.length > 0) {
        console.log(`   Constraints (${proposalConstraints.rows.length}):`);
        proposalConstraints.rows.forEach(con => {
          const type = con.contype === 'c' ? 'CHECK' : con.contype === 'u' ? 'UNIQUE' : con.contype === 'f' ? 'FK' : con.contype === 'p' ? 'PK' : 'OTHER';
          console.log(`     - ${con.conname} (${type}): ${con.definition}`);
        });
      }

      console.log();
    } else {
      console.log('❌ rebalancing_proposals table not found!\n');
    }

    // 2) Check proposal_moves table
    const movesExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'proposal_moves'
      );
    `);

    if (movesExists.rows[0].exists) {
      console.log('✅ proposal_moves table exists');
      
      // Check columns
      const moveColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'proposal_moves'
        ORDER BY ordinal_position;
      `);

      console.log(`   Columns (${moveColumns.rows.length}):`);
      moveColumns.rows.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : '';
        console.log(`     - ${col.column_name}: ${col.data_type} ${nullable}${defaultVal}`);
      });

      // Check indexes
      const moveIndexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'proposal_moves'
        ORDER BY indexname;
      `);

      if (moveIndexes.rows.length > 0) {
        console.log(`   Indexes (${moveIndexes.rows.length}):`);
        moveIndexes.rows.forEach(idx => {
          console.log(`     - ${idx.indexname}`);
        });
      }

      // Check constraints
      const moveConstraints = await client.query(`
        SELECT conname, contype, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'proposal_moves'::regclass
        ORDER BY conname;
      `);

      if (moveConstraints.rows.length > 0) {
        console.log(`   Constraints (${moveConstraints.rows.length}):`);
        moveConstraints.rows.forEach(con => {
          const type = con.contype === 'c' ? 'CHECK' : con.contype === 'u' ? 'UNIQUE' : con.contype === 'f' ? 'FK' : con.contype === 'p' ? 'PK' : 'OTHER';
          console.log(`     - ${con.conname} (${type}): ${con.definition}`);
        });
      }

      // Verify foreign key to rebalancing_proposals
      const fkCheck = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'proposal_moves'
          AND ccu.table_name = 'rebalancing_proposals';
      `);

      if (fkCheck.rows.length > 0) {
        console.log(`   Foreign Keys:`);
        fkCheck.rows.forEach(fk => {
          console.log(`     - ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
        });
      }

      // Check for calendar_events_new FK
      const calendarFkCheck = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'proposal_moves'
          AND ccu.table_name = 'calendar_events_new';
      `);

      if (calendarFkCheck.rows.length > 0) {
        console.log(`   Foreign Keys (calendar_events_new):`);
        calendarFkCheck.rows.forEach(fk => {
          console.log(`     - ${fk.column_name} → ${fk.foreign_table_name}`);
        });
      }

      console.log();
    } else {
      console.log('❌ proposal_moves table not found!\n');
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

    const calendarEventsNewExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'calendar_events_new'
      );
    `);

    if (calendarEventsNewExists.rows[0].exists) {
      console.log('✅ calendar_events_new table exists (prerequisite met)');
    } else {
      console.log('⚠️  calendar_events_new table does not exist (FK will fail if source_event_id is set)');
    }

    console.log('\n✅ Verification complete.');
    console.log('\n📋 Next steps:');
    console.log('   - Run migration 0014 to add baseline fields and triggers');
    console.log('   - Test proposal creation and move operations\n');

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



