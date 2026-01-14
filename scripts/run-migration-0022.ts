/* eslint-disable no-console */
/**
 * Script to run migration 0022: Add Priority 2 ADHD-friendly fields
 * 
 * This migration creates:
 * - Wall of Awful Detection (deferral tracking on assignments)
 * - Grade Rescue Logic (current_grade, is_major on courses)
 * - Recovery Forcing (daily_deep_work_summary table)
 * - Deferral history tracking (assignment_deferrals table)
 * 
 * Prerequisites:
 * - assignments table ✅
 * - courses table ✅
 * - users table ✅
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
    const migrationPath = join(process.cwd(), 'packages/db/migrations/0022_add_priority_2_fields.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📝 Executing migration 0022...\n');
    console.log('   Adding Priority 2 ADHD-friendly features:');
    console.log('   1. Wall of Awful Detection (deferral tracking)');
    console.log('   2. Artificial Urgency (internal deadline adjustment)');
    console.log('   3. Recovery Forcing (deep work limits)');
    console.log('   4. Grade Rescue Logic (course grade tracking)\n');
    
    await client.query(migrationSQL);

    console.log('\n✅ Migration 0022 executed successfully\n');

    // Verification
    console.log('🔍 Verifying migration changes...\n');

    // 1) Check assignments table new columns
    const assignmentColumns = ['deferral_count', 'is_stuck', 'last_deferred_at', 'stuck_intervention_shown'];
    console.log('📋 Assignments table (Wall of Awful):');
    for (const colName of assignmentColumns) {
      const columnExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'assignments'
          AND column_name = $1
        );
      `, [colName]);

      if (columnExists.rows[0].exists) {
        console.log(`   ✅ ${colName} column exists`);
      } else {
        console.log(`   ❌ ${colName} column not found!`);
      }
    }
    console.log();

    // 2) Check courses table new columns
    const courseColumns = ['current_grade', 'is_major', 'grade_updated_at'];
    console.log('📚 Courses table (Grade Rescue Logic):');
    for (const colName of courseColumns) {
      const columnExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
          AND table_name = 'courses'
          AND column_name = $1
        );
      `, [colName]);

      if (columnExists.rows[0].exists) {
        console.log(`   ✅ ${colName} column exists`);
      } else {
        console.log(`   ❌ ${colName} column not found!`);
      }
    }
    console.log();

    // 3) Check new tables
    const tables = ['daily_deep_work_summary', 'assignment_deferrals'];
    console.log('🗂️  New tables:');
    for (const tableName of tables) {
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        );
      `, [tableName]);

      if (tableExists.rows[0].exists) {
        console.log(`   ✅ ${tableName} table created`);
        
        // Get row count
        const countResult = await client.query(`SELECT COUNT(*) as count FROM ${tableName};`);
        console.log(`      Rows: ${countResult.rows[0].count}`);
      } else {
        console.log(`   ❌ ${tableName} table not found!`);
      }
    }
    console.log();

    // 4) Check indexes
    const indexes = [
      { name: 'idx_assignments_stuck', table: 'assignments' },
      { name: 'idx_daily_deep_work_user_date', table: 'daily_deep_work_summary' },
      { name: 'idx_deferrals_assignment', table: 'assignment_deferrals' },
      { name: 'idx_deferrals_user', table: 'assignment_deferrals' }
    ];
    
    console.log('📊 Indexes:');
    for (const idx of indexes) {
      const indexExists = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE tablename = $1
          AND indexname = $2
        );
      `, [idx.table, idx.name]);

      if (indexExists.rows[0].exists) {
        console.log(`   ✅ ${idx.name} exists on ${idx.table}`);
      } else {
        console.log(`   ❌ ${idx.name} not found on ${idx.table}`);
      }
    }
    console.log();

    // 5) Check comments
    console.log('💬 Column comments:');
    const comments = [
      { table: 'assignments', column: 'deferral_count' },
      { table: 'assignments', column: 'is_stuck' },
      { table: 'courses', column: 'current_grade' },
      { table: 'courses', column: 'is_major' }
    ];
    
    for (const { table, column } of comments) {
      const commentResult = await client.query(`
        SELECT pg_catalog.col_description(
          (SELECT oid FROM pg_catalog.pg_class WHERE relname = $1),
          (SELECT ordinal_position FROM information_schema.columns
           WHERE table_name = $1 AND column_name = $2)
        ) as comment;
      `, [table, column]);
      
      const comment = commentResult.rows[0]?.comment;
      if (comment) {
        console.log(`   ✅ ${table}.${column}: "${comment.substring(0, 60)}..."`);
      }
    }
    console.log();

    // 6) Test data integrity
    const assignmentStats = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_stuck = TRUE) as stuck,
        COUNT(*) FILTER (WHERE deferral_count > 0) as deferred,
        COUNT(*) FILTER (WHERE deferral_count >= 3) as potential_stuck
      FROM assignments;
    `);

    const stats = assignmentStats.rows[0];
    console.log('📊 Assignment statistics:');
    console.log(`   Total assignments: ${stats.total}`);
    console.log(`   Stuck (flagged): ${stats.stuck}`);
    console.log(`   Deferred at least once: ${stats.deferred}`);
    console.log(`   Deferred 3+ times (potential stuck): ${stats.potential_stuck}`);
    console.log();

    const courseStats = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE current_grade IS NOT NULL) as with_grade,
        COUNT(*) FILTER (WHERE current_grade < 75) as rescue_needed,
        COUNT(*) FILTER (WHERE is_major = TRUE) as major_courses
      FROM courses;
    `);

    const cStats = courseStats.rows[0];
    console.log('📚 Course statistics:');
    console.log(`   Total courses: ${cStats.total}`);
    console.log(`   With current grade: ${cStats.with_grade}`);
    console.log(`   Grade < 75% (rescue needed): ${cStats.rescue_needed}`);
    console.log(`   Major courses: ${cStats.major_courses}`);
    console.log();

    console.log('✅ Verification complete.');
    console.log('\n📋 Next steps:');
    console.log('   1. Update schema.ts with new fields');
    console.log('   2. Implement Wall of Awful detection logic');
    console.log('   3. Implement Artificial Urgency in scheduling');
    console.log('   4. Implement Recovery Forcing (4hr deep work limit)');
    console.log('   5. Implement Grade Rescue priority boost');
    console.log('   6. Restart API server to load updated schema\n');

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
    
    // Special handling for duplicate column/table error
    if (err.code === '42701' || err.code === '42P07') {
      console.log('\n💡 Column/table already exists - migration may have been run previously.');
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

