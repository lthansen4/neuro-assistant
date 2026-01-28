// scripts/run-migration-0011.ts
// Run migration 0011: Add confidence_score to syllabus_staging_items
import { config } from "dotenv";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    console.log("🚀 Starting migration 0011: Add confidence_score to staging\n");

    // Read the migration file
    const migrationPath = join(process.cwd(), "packages/db/migrations/0011_add_confidence_score_to_staging.sql");
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

      // 1) Check confidence_score column exists
      const col = await client.query(`
        SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'syllabus_staging_items'
          AND column_name = 'confidence_score';
      `);

      if (col.rows.length === 0) {
        throw new Error("confidence_score column not found on syllabus_staging_items");
      }

      const c = col.rows[0];
      console.log("✅ confidence_score column exists:");
      console.log(`   Type: ${c.data_type}(${c.numeric_precision},${c.numeric_scale})`);
      console.log(`   Nullable: ${c.is_nullable}\n`);

      // 2) Check constraint exists
      const constraint = await client.query(`
        SELECT conname, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conname = 'staging_confidence_range_chk';
      `);

      if (constraint.rows.length === 0) {
        throw new Error("staging_confidence_range_chk constraint not found");
      }

      console.log("✅ Constraint present:");
      console.log(`   ${constraint.rows[0].conname}: ${constraint.rows[0].definition}\n`);

      // 3) Check index exists
      const idx = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'syllabus_staging_items'
          AND indexname = 'idx_staging_confidence';
      `);

      if (idx.rows.length === 0) {
        throw new Error("idx_staging_confidence index not found");
      }

      console.log("✅ Index present:");
      console.log(`   ${idx.rows[0].indexname}`);
      console.log(`   Definition: ${idx.rows[0].indexdef}\n`);

      // 4) Check comment exists
      const comment = await client.query(`
        SELECT obj_description('syllabus_staging_items'::regclass::oid, 'pg_class') as table_comment,
               col_description('syllabus_staging_items'::regclass::oid, 
                 (SELECT ordinal_position FROM information_schema.columns 
                  WHERE table_name = 'syllabus_staging_items' 
                  AND column_name = 'confidence_score')) as column_comment;
      `);

      if (comment.rows[0]?.column_comment) {
        console.log("✅ Column comment present:");
        console.log(`   ${comment.rows[0].column_comment}\n`);
      }

      // Sample data check (shows current NULL vs populated)
      const sampleData = await client.query(`
        SELECT 
          COUNT(*) as total_rows,
          COUNT(confidence_score) as populated_rows,
          COUNT(*) FILTER (WHERE confidence_score IS NULL) as null_rows
        FROM syllabus_staging_items;
      `);

      console.log("📊 Current data stats:");
      console.log(`   Total rows: ${sampleData.rows[0].total_rows}`);
      console.log(`   With confidence_score: ${sampleData.rows[0].populated_rows}`);
      console.log(`   NULL confidence_score: ${sampleData.rows[0].null_rows}\n`);

      // EXPLAIN plan check (with a dummy parse_run_id)
      // Note: SET LOCAL doesn't work across query boundaries, so we run EXPLAIN separately
      const explain = await client.query(`
        EXPLAIN
        SELECT id
        FROM syllabus_staging_items
        WHERE parse_run_id = '00000000-0000-0000-0000-000000000000'::uuid
        ORDER BY confidence_score DESC NULLS LAST
        LIMIT 10;
      `);

      console.log("🔍 EXPLAIN plan for preview-style query:");
      if (explain.rows && explain.rows.length > 0) {
        explain.rows.forEach((r: any) => {
          const planLine = r['QUERY PLAN'] || r.query_plan || JSON.stringify(r);
          console.log(`   ${planLine}`);
        });
      } else {
        console.log("   (Could not generate EXPLAIN plan - this is OK if table is empty)");
      }

      console.log("\n✨ Migration verification complete!");
      console.log("\n📝 Summary:");
      console.log("   ✅ confidence_score column added (NUMERIC(4,3), nullable)");
      console.log("   ✅ Range constraint added (0.000-1.000 when present)");
      console.log("   ✅ Composite index added (parse_run_id, confidence_score DESC NULLS LAST)");
      console.log("   ✅ Column comment added for documentation");
      console.log("\n💡 Next steps:");
      console.log("   - Update syllabus parser to populate confidence_score on staged items");
      console.log("   - Use confidence_score for bulk selection defaults in preview UI");
      console.log("   - Backfill existing rows with confidence scores (optional)");

    } catch (err: any) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("\n❌ Migration failed:", e.message);
    if (e.message.includes("relation") && e.message.includes("does not exist")) {
      console.error("\n💡 Tip: Make sure prerequisite tables exist (syllabus_staging_items)");
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







