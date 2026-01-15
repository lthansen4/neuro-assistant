// scripts/run-migration-0007.ts
// Run migration 0007: Migrate user_streaks to multi-type structure
import { config } from "dotenv";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    console.log("🚀 Starting migration 0007: user_streaks multi-type migration\n");

    // Read the migration file
    const migrationPath = join(process.cwd(), "packages/db/migrations/0007_migrate_user_streaks.sql");
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    // Split by semicolons but keep comments
    // Remove commented-out DROP statements for now
    const cleanedSQL = migrationSQL
      .split(/;\s*\n/)
      .filter((stmt) => {
        const trimmed = stmt.trim();
        // Skip empty statements and commented-out DROP statements
        if (!trimmed) return false;
        if (trimmed.includes("/*") || trimmed.includes("*/")) return false;
        if (trimmed.startsWith("-- Step 6")) return false; // Skip the commented section
        if (trimmed.includes("DROP COLUMN IF EXISTS current_streak_days")) return false;
        return true;
      })
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0)
      .join(";\n") + ";";

    console.log("📋 Executing migration steps...\n");

    // Execute the migration
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(cleanedSQL);
      await client.query("COMMIT");

      console.log("✅ Migration completed successfully!\n");

      // Verify the migration
      console.log("🔍 Verifying migration...\n");

      // Check new columns exist
      const columnsResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'user_streaks'
        ORDER BY ordinal_position;
      `);

      console.log("📊 Current user_streaks columns:");
      columnsResult.rows.forEach((col) => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });

      // Check data migration
      const dataResult = await client.query(`
        SELECT 
          COUNT(*) as total_rows,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(DISTINCT streak_type) as streak_types
        FROM user_streaks;
      `);

      console.log("\n📈 Data summary:");
      console.log(`   - Total rows: ${dataResult.rows[0].total_rows}`);
      console.log(`   - Unique users: ${dataResult.rows[0].unique_users}`);
      console.log(`   - Streak types: ${dataResult.rows[0].streak_types}`);

      // Check constraints
      const constraintsResult = await client.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'user_streaks';
      `);

      console.log("\n🔒 Constraints:");
      constraintsResult.rows.forEach((constraint) => {
        console.log(`   - ${constraint.constraint_name} (${constraint.constraint_type})`);
      });

      // Sample data
      const sampleResult = await client.query(`
        SELECT 
          user_id,
          streak_type,
          current_count,
          longest_count,
          last_incremented_on
        FROM user_streaks
        LIMIT 5;
      `);

      if (sampleResult.rows.length > 0) {
        console.log("\n📝 Sample data (first 5 rows):");
        sampleResult.rows.forEach((row, idx) => {
          console.log(`   ${idx + 1}. User: ${row.user_id.substring(0, 8)}... | Type: ${row.streak_type} | Current: ${row.current_count} | Longest: ${row.longest_count}`);
        });
      } else {
        console.log("\n📝 No data in user_streaks table (this is fine for new installations)");
      }

      console.log("\n✨ Migration verification complete!");
      console.log("\n⚠️  Note: Old columns (current_streak_days, longest_streak_days, last_active_date) are still present.");
      console.log("   You can drop them after verifying everything works correctly.");

    } catch (err: any) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("\n❌ Migration failed:", e.message);
    if (e.message.includes("relation") && e.message.includes("does not exist")) {
      console.error("\n💡 Tip: Make sure the user_streaks table exists (from migration 0001_unified.sql)");
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



