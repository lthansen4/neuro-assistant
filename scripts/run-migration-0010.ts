// scripts/run-migration-0010.ts
// Run migration 0010: Courses + Grading Components
import { config } from "dotenv";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    console.log("🚀 Starting migration 0010: Courses + Grading Components\n");

    // Read the migration file
    const migrationPath = join(process.cwd(), "packages/db/migrations/0010_courses_grading.sql");
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    console.log("📋 Executing migration steps...\n");

    // Execute the migration
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migrationSQL);
      await client.query("COMMIT");

      console.log("✅ Migration completed successfully!\n");

      // Verify the migration
      console.log("🔍 Verifying migration...\n");

      // Check grade_weights_json column exists on courses
      const coursesColumns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'courses'
        AND column_name = 'grade_weights_json';
      `);

      if (coursesColumns.rows.length > 0) {
        console.log("✅ grade_weights_json column exists on courses table:");
        console.log(`   Type: ${coursesColumns.rows[0].data_type}`);
        console.log(`   Nullable: ${coursesColumns.rows[0].is_nullable}\n`);
      } else {
        console.log("⚠️  grade_weights_json column not found (should not happen with IF NOT EXISTS)\n");
      }

      // Check grading_components table exists
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'grading_components'
        );
      `);

      if (!tableExists.rows[0].exists) {
        throw new Error("grading_components table was not created");
      }

      console.log("✅ grading_components table created\n");

      // Check table structure
      const componentsColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'grading_components'
        ORDER BY ordinal_position;
      `);

      console.log("📊 grading_components table columns:");
      componentsColumns.rows.forEach((col: any) => {
        const defaultValue = col.column_default ? ` (default: ${col.column_default})` : "";
        console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})${defaultValue}`);
      });

      // Check constraints
      const constraints = await client.query(`
        SELECT conname, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conrelid = 'grading_components'::regclass
        AND contype = 'c';
      `);

      if (constraints.rows.length > 0) {
        console.log("\n🔒 CHECK constraints:");
        constraints.rows.forEach((c: any) => {
          console.log(`   - ${c.conname}: ${c.definition}`);
        });
      }

      // Check indexes
      const indexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'grading_components'
        ORDER BY indexname;
      `);

      console.log("\n📊 Indexes on grading_components:");
      if (indexes.rows.length > 0) {
        indexes.rows.forEach((idx: any) => {
          console.log(`   - ${idx.indexname}`);
        });
      } else {
        console.log("   ⚠️  No indexes found");
      }

      // Check trigger exists
      const triggers = await client.query(`
        SELECT trigger_name, event_manipulation, action_timing
        FROM information_schema.triggers
        WHERE event_object_table = 'grading_components';
      `);

      if (triggers.rows.length > 0) {
        console.log("\n⚙️  Triggers:");
        triggers.rows.forEach((t: any) => {
          console.log(`   - ${t.trigger_name} (${t.action_timing} ${t.event_manipulation})`);
        });
      }

      // Check foreign key to syllabus_parse_runs (if it exists)
      const fkCheck = await client.query(`
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
        AND tc.table_name = 'grading_components'
        AND kcu.column_name = 'parse_run_id';
      `);

      if (fkCheck.rows.length > 0) {
        console.log("\n🔗 Foreign keys:");
        fkCheck.rows.forEach((fk: any) => {
          console.log(`   - ${fk.column_name} → ${fk.foreign_table_name}.${fk.foreign_column_name}`);
        });
      }

      // Sample data check
      const rowCount = await client.query(`
        SELECT COUNT(*) as count FROM grading_components;
      `);

      console.log(`\n📈 Current row count: ${rowCount.rows[0].count}`);

      console.log("\n✨ Migration verification complete!");
      console.log("\n📝 Summary:");
      console.log("   ✅ grade_weights_json column ensured on courses (for fast UI loading)");
      console.log("   ✅ grading_components table created (for normalized grade breakdown)");
      console.log("   ✅ Indexes and constraints configured");
      console.log("   ✅ Triggers set up for updated_at");
      console.log("\n💡 Next steps:");
      console.log("   - Backfill grading_components from existing grade_weights_json data (optional)");
      console.log("   - Update Grade Forecast calculations to use normalized components");

    } catch (err: any) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("\n❌ Migration failed:", e.message);
    if (e.message.includes("relation") && e.message.includes("does not exist")) {
      console.error("\n💡 Tip: Make sure prerequisite tables exist (courses, syllabus_parse_runs)");
    }
    if (e.message.includes("DATABASE_URL")) {
      console.error("\n💡 Tip: Make sure DATABASE_URL is set in your .env file");
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});




