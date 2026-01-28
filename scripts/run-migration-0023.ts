import { db } from '../apps/api/src/lib/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  console.log('🚀 Running migration 0023: Add linked_assignment_id to calendar_events_new...\n');
  
  const migrationPath = path.join(__dirname, '../packages/db/migrations/0023_add_linked_assignment_id.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  
  console.log('Migration SQL:');
  console.log(migrationSQL);
  console.log('\nExecuting...\n');
  
  try {
    await db.execute(sql.raw(migrationSQL));
    console.log('✅ Migration 0023 completed successfully!');
    console.log('   - Added linked_assignment_id column to calendar_events_new');
    console.log('   - Created index on linked_assignment_id');
  } catch (err: any) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  }
  
  process.exit(0);
}

runMigration().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});







