/* eslint-disable no-console */
/**
 * Script to run migration 0008: Calendar Split (CORRECTED)
 * 
 * This migration:
 * - Creates calendar_event_templates table (recurring patterns)
 * - Creates calendar_events_new table (event instances)
 * - Migrates existing course_office_hours data to templates
 * - Creates backward-compatible view with INSTEAD OF triggers
 * 
 * Prerequisites:
 * - users table (from migration 0001) ✅
 * - courses table (from migration 0001) ✅
 * - course_office_hours table (from migration 0001) ✅
 * - event_type enum (from migration 0001) ✅
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
    const migrationPath = join(process.cwd(), 'packages/db/migrations/0008_calendar_split_CORRECTED.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration 0008: Calendar Split...\n');
    await client.query(migrationSQL);

    console.log('\n✅ Migration 0008 executed successfully\n');

    // Verification
    console.log('🔍 Verifying migration changes...\n');

    // 1) Check calendar_event_templates table
    const templatesExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'calendar_event_templates'
      );
    `);

    if (templatesExists.rows[0].exists) {
      console.log('✅ calendar_event_templates table exists');
      
      const templateCount = await client.query(`
        SELECT COUNT(*) as count, event_type
        FROM calendar_event_templates
        GROUP BY event_type
        ORDER BY event_type;
      `);

      if (templateCount.rows.length > 0) {
        console.log('   Office Hours migrated:');
        templateCount.rows.forEach(row => {
          console.log(`     - ${row.event_type}: ${row.count} templates`);
        });
      }

      // Check indexes
      const templateIndexes = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'calendar_event_templates'
        ORDER BY indexname;
      `);

      if (templateIndexes.rows.length > 0) {
        console.log(`   Indexes (${templateIndexes.rows.length}):`);
        templateIndexes.rows.forEach(idx => {
          console.log(`     - ${idx.indexname}`);
        });
      }

      console.log();
    } else {
      console.log('❌ calendar_event_templates table not found!\n');
    }

    // 2) Check calendar_events_new table
    const eventsNewExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'calendar_events_new'
      );
    `);

    if (eventsNewExists.rows[0].exists) {
      console.log('✅ calendar_events_new table exists');
      
      const eventsNewCount = await client.query(`
        SELECT COUNT(*) as count FROM calendar_events_new;
      `);
      console.log(`   Current events: ${eventsNewCount.rows[0].count}`);

      // Check indexes
      const eventsNewIndexes = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'calendar_events_new'
        ORDER BY indexname;
      `);

      if (eventsNewIndexes.rows.length > 0) {
        console.log(`   Indexes (${eventsNewIndexes.rows.length}):`);
        eventsNewIndexes.rows.forEach(idx => {
          console.log(`     - ${idx.indexname}`);
        });
      }

      console.log();
    } else {
      console.log('❌ calendar_events_new table not found!\n');
    }

    // 3) Check course_office_hours view
    const viewExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.views
        WHERE table_schema = 'public'
        AND table_name = 'course_office_hours'
      );
    `);

    if (viewExists.rows[0].exists) {
      console.log('✅ course_office_hours view exists (backward compatibility)');
      
      // Check triggers
      const viewTriggers = await client.query(`
        SELECT tgname, tgenabled
        FROM pg_trigger
        WHERE tgrelid = 'course_office_hours'::regclass;
      `);

      if (viewTriggers.rows.length > 0) {
        console.log(`   Triggers (${viewTriggers.rows.length}):`);
        viewTriggers.rows.forEach(trg => {
          console.log(`     - ${trg.tgname} (enabled: ${trg.tgenabled === 'O' ? 'YES' : 'NO'})`);
        });
      }

      // Test view query
      try {
        const viewTest = await client.query(`
          SELECT COUNT(*) as count FROM course_office_hours;
        `);
        console.log(`   View query test: ${viewTest.rows[0].count} rows\n`);
      } catch (err: any) {
        console.log(`   ⚠️  View query test failed: ${err.message}\n`);
      }
    } else {
      console.log('❌ course_office_hours view not found!\n');
    }

    // 4) Check course_office_hours_old table (renamed)
    const oldTableExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'course_office_hours_old'
      );
    `);

    if (oldTableExists.rows[0].exists) {
      console.log('✅ course_office_hours_old table exists (backup for rollback)');
      
      const oldCount = await client.query(`
        SELECT COUNT(*) as count FROM course_office_hours_old;
      `);
      console.log(`   Old table rows: ${oldCount.rows[0].count}\n`);
    } else {
      console.log('ℹ️  course_office_hours_old table does not exist (original table may not have existed)\n');
    }

    // 5) Check set_updated_at function
    const functionExists = await client.query(`
      SELECT proname
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND p.proname = 'set_updated_at';
    `);

    if (functionExists.rows.length > 0) {
      console.log('✅ set_updated_at() function exists\n');
    } else {
      console.log('⚠️  set_updated_at() function not found\n');
    }

    console.log('✅ Verification complete.');
    console.log('\n📋 Next steps:');
    console.log('   - Re-run migration 0014_5 to add index and trigger to calendar_events_new');
    console.log('   - Test backward compatibility by querying course_office_hours view');
    console.log('   - Test INSTEAD OF triggers with INSERT/UPDATE/DELETE on view');
    console.log('   - Generate calendar events from templates (future implementation)\n');

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




