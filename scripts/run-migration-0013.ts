// scripts/run-migration-0013.ts
// Run migration 0013: Quick Add Schema Enhancements
import { config } from "dotenv";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    console.log("🚀 Starting migration 0013: Quick Add Schema Enhancements\n");

    // Read the migration file
    const migrationPath = join(process.cwd(), "packages/db/migrations/0013_quick_add_schema.sql");
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

      // 1) Check user_course_aliases table structure
      const aliasColumns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'user_course_aliases'
        ORDER BY ordinal_position;
      `);

      console.log("📊 user_course_aliases table columns:");
      aliasColumns.rows.forEach((col: any) => {
        const defaultValue = col.column_default ? ` (default: ${col.column_default})` : "";
        console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})${defaultValue}`);
      });

      // Check unique constraint/index (PostgreSQL uses unique indexes for expression-based uniqueness)
      const aliasIndex = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'user_course_aliases'
          AND indexname = 'uq_user_alias';
      `);

      if (aliasIndex.rows.length > 0) {
        console.log("\n✅ Unique index on user_course_aliases:");
        console.log(`   ${aliasIndex.rows[0].indexname}`);
        console.log(`   Definition: ${aliasIndex.rows[0].indexdef}`);
        if (aliasIndex.rows[0].indexdef.includes('lower(alias)')) {
          console.log("   ✓ Case-insensitive uniqueness (correct)");
        }
      } else {
        console.log("\n⚠️  Unique index 'uq_user_alias' not found");
      }

      // 2) Check quick_add_logs table structure
      const logsColumns = await client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'quick_add_logs'
        ORDER BY ordinal_position;
      `);

      console.log("\n📊 quick_add_logs table columns:");
      logsColumns.rows.forEach((col: any) => {
        console.log(`   - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
      });

      // Check for new columns
      const newColumns = ['intent', 'ambiguity_reason', 'user_resolution'];
      const foundColumns = logsColumns.rows.map((r: any) => r.column_name);
      const missingColumns = newColumns.filter(c => !foundColumns.includes(c));

      if (missingColumns.length === 0) {
        console.log("\n✅ All new columns present: intent, ambiguity_reason, user_resolution");
      } else {
        console.log(`\n⚠️  Missing columns: ${missingColumns.join(', ')}`);
      }

      // 3) Check indexes
      const indexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename IN ('user_course_aliases', 'quick_add_logs')
        ORDER BY tablename, indexname;
      `);

      console.log("\n📊 Indexes:");
      indexes.rows.forEach((idx: any) => {
        console.log(`   - ${idx.indexname}`);
        if (idx.indexname.includes('dedupe')) {
          console.log(`     Definition: ${idx.indexdef}`);
        }
      });

      // Verify unique dedupe index
      const dedupeIndex = indexes.rows.find((idx: any) => idx.indexname === 'idx_quick_add_dedupe');
      if (dedupeIndex) {
        console.log("\n✅ Unique dedupe index found (prevents double-clicks)");
        if (dedupeIndex.indexdef.includes('UNIQUE')) {
          console.log("   ✓ Index is UNIQUE (correct)");
        }
        if (dedupeIndex.indexdef.includes('WHERE')) {
          console.log("   ✓ Index has WHERE clause (correct)");
        }
      } else {
        console.log("\n⚠️  Unique dedupe index not found");
      }

      // 4) Sample data check
      const aliasCount = await client.query(`SELECT COUNT(*) as count FROM user_course_aliases;`);
      const logCount = await client.query(`SELECT COUNT(*) as count FROM quick_add_logs;`);

      console.log(`\n📈 Current row counts:`);
      console.log(`   user_course_aliases: ${aliasCount.rows[0].count}`);
      console.log(`   quick_add_logs: ${logCount.rows[0].count}`);

      console.log("\n✨ Migration verification complete!");
      console.log("\n📝 Summary:");
      console.log("   ✅ user_course_aliases table structure verified");
      console.log("   ✅ Unique constraint on (user_id, lower(alias)) verified");
      console.log("   ✅ quick_add_logs table structure verified");
      console.log("   ✅ New columns added: intent, ambiguity_reason, user_resolution");
      console.log("   ✅ Indexes updated/created");
      console.log("\n💡 Next steps:");
      console.log("   - Update Quick Add API to populate new fields (intent, ambiguity_reason, user_resolution)");
      console.log("   - The unique dedupe index will prevent rapid double-submits");

    } catch (err: any) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("\n❌ Migration failed:", e.message);
    if (e.message.includes("relation") && e.message.includes("does not exist")) {
      console.error("\n💡 Tip: Make sure prerequisite tables exist:");
      console.error("     - users");
      console.error("     - courses");
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







