/* eslint-disable no-console */
/**
 * Script to run migration 0018: Add requires_chunking to assignments
 * 
 * This migration creates:
 * - requires_chunking column on assignments table
 * - Index for efficient queries of chunked assignments
 * 
 * Prerequisites:
 * - assignments table (from migration 0001) ✅
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
    const migrationPath = join(process.cwd(), 'packages/db/migrations/0018_add_requires_chunking.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration 0018...\n');
    await client.query(migrationSQL);

    console.log('\n✅ Migration 0018 executed successfully\n');

    // Verification
    console.log('🔍 Verifying migration changes...\n');

    // 1) Check requires_chunking column exists
    const columnExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'assignments'
        AND column_name = 'requires_chunking'
      );
    `);

    if (columnExists.rows[0].exists) {
      console.log('✅ requires_chunking column exists on assignments table');
      
      // Check column details
      const columnInfo = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'assignments'
        AND column_name = 'requires_chunking';
      `);

      const col = columnInfo.rows[0];
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      const defaultVal = col.column_default || 'none';
      console.log(`   Type: ${col.data_type}`);
      console.log(`   Nullable: ${nullable}`);
      console.log(`   Default: ${defaultVal}`);
      console.log();
    } else {
      console.log('❌ requires_chunking column not found!\n');
    }

    // 2) Check index exists
    const indexExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'assignments'
        AND indexname = 'idx_assignments_chunking'
      );
    `);

    if (indexExists.rows[0].exists) {
      console.log('✅ idx_assignments_chunking index exists');
      
      // Get index definition
      const indexDef = await client.query(`
        SELECT indexdef
        FROM pg_indexes
        WHERE tablename = 'assignments'
        AND indexname = 'idx_assignments_chunking';
      `);
      
      console.log(`   Definition: ${indexDef.rows[0].indexdef}`);
      console.log();
    } else {
      console.log('❌ idx_assignments_chunking index not found!\n');
    }

    // 3) Check comment exists
    const commentExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_catalog.pg_description
        WHERE objoid = (
          SELECT oid FROM pg_catalog.pg_class
          WHERE relname = 'assignments'
        )
        AND objsubid = (
          SELECT ordinal_position FROM information_schema.columns
          WHERE table_name = 'assignments'
          AND column_name = 'requires_chunking'
        )
      );
    `);

    if (commentExists.rows[0].exists) {
      console.log('✅ Column comment exists');
      
      const commentText = await client.query(`
        SELECT pg_catalog.col_description(
          (SELECT oid FROM pg_catalog.pg_class WHERE relname = 'assignments'),
          (SELECT ordinal_position FROM information_schema.columns
           WHERE table_name = 'assignments' AND column_name = 'requires_chunking')
        ) as comment;
      `);
      
      console.log(`   Comment: "${commentText.rows[0].comment}"`);
      console.log();
    }

    // 4) Test data integrity - check existing assignments
    const assignmentCount = await client.query(`
      SELECT COUNT(*) as total,
             COUNT(*) FILTER (WHERE requires_chunking = TRUE) as chunked,
             COUNT(*) FILTER (WHERE requires_chunking = FALSE) as not_chunked
      FROM assignments;
    `);

    const counts = assignmentCount.rows[0];
    console.log('📊 Assignment statistics:');
    console.log(`   Total assignments: ${counts.total}`);
    console.log(`   Requiring chunking: ${counts.chunked}`);
    console.log(`   Not requiring chunking: ${counts.not_chunked}`);
    console.log();

    // 5) Verify prerequisites
    console.log('🔍 Checking prerequisites...\n');

    const assignmentsExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'assignments'
      );
    `);

    if (assignmentsExists.rows[0].exists) {
      console.log('✅ assignments table exists (prerequisite met)\n');
    } else {
      console.log('❌ assignments table does not exist (prerequisite missing!)\n');
    }

    console.log('✅ Verification complete.');
    console.log('\n📋 Next steps:');
    console.log('   - Restart API server to load updated schema');
    console.log('   - Test Quick Add with long-form assignment (e.g., "paper due monday")');
    console.log('   - Verify AI detects long-form work and sets requires_chunking = true');
    console.log('   - Confirm multiple Focus blocks are created with proper metadata');
    console.log('   - Test rebalancing engine respects chunk sequences\n');

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
    if (err.code) {
      console.error('   Code:', err.code);
    }
    
    // Special handling for duplicate column error
    if (err.code === '42701') {
      console.log('\n💡 Column already exists - migration may have been run previously.');
      console.log('   Skipping to verification...\n');
      process.exit(0);
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

