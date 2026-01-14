import { db } from '../apps/api/src/lib/db';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

async function runMigration() {
  console.log('🚀 Running migration 0024: Add assignment_checklists table...\n');
  
  const migrationPath = path.join(__dirname, '../packages/db/migrations/0024_add_assignment_checklists.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
  
  console.log('Migration SQL:');
  console.log(migrationSQL);
  console.log('\nExecuting...\n');
  
  try {
    await db.execute(sql.raw(migrationSQL));
    console.log('✅ Migration 0024 completed successfully!');
    console.log('   - Created assignment_checklists table');
    console.log('   - Added indexes for fast lookups');
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

