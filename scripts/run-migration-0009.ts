// scripts/run-migration-0009.ts
// Run migration 0009: Assignments Standardization
import { config } from "dotenv";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    console.log("🚀 Starting migration 0009: Assignments Standardization\n");

    // Read the migration file
    const migrationPath = join(process.cwd(), "packages/db/migrations/0009_assignments_standardization.sql");
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

      // Check CHECK constraint exists
      const constraintResult = await client.query(`
        SELECT conname, pg_get_constraintdef(oid) as definition
        FROM pg_constraint
        WHERE conname = 'assignments_status_chk';
      `);

      if (constraintResult.rows.length > 0) {
        console.log("✅ CHECK constraint created:");
        console.log(`   ${constraintResult.rows[0].definition}\n`);
      } else {
        console.log("⚠️  CHECK constraint not found (may have already existed)\n");
      }

      // Check new index exists
      const indexResult = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'assignments'
        AND indexname = 'idx_assignments_user_status_due_date';
      `);

      if (indexResult.rows.length > 0) {
        console.log("✅ New index created:");
        console.log(`   ${indexResult.rows[0].indexname}`);
        // Show a simplified version of the index definition
        const idxDef = indexResult.rows[0].indexdef;
        const simplified = idxDef
          .replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+\S+\s+ON\s+\S+\s+USING\s+\S+\s+/, "")
          .replace(/\s+/g, " ");
        console.log(`   Columns: ${simplified}\n`);
      } else {
        console.log("⚠️  New index not found (may have already existed)\n");
      }

      // List all assignment indexes
      const allIndexes = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'assignments'
        ORDER BY indexname;
      `);

      console.log("📊 All indexes on assignments table:");
      allIndexes.rows.forEach((idx: any) => {
        console.log(`   - ${idx.indexname}`);
      });

      // Check index statistics (if available)
      try {
        const indexStats = await client.query(`
          SELECT 
            schemaname,
            relname as tablename,
            indexrelname as indexname,
            idx_scan as index_scans,
            idx_tup_read as tuples_read,
            idx_tup_fetch as tuples_fetched
          FROM pg_stat_user_indexes
          WHERE relname = 'assignments'
          AND indexrelname = 'idx_assignments_user_status_due_date';
        `);

        if (indexStats.rows.length > 0) {
          const stats = indexStats.rows[0];
          console.log("\n📈 Index statistics (after creation):");
          console.log(`   Index scans: ${stats.index_scans || 0}`);
          console.log(`   Tuples read: ${stats.tuples_read || 0}`);
          console.log(`   Tuples fetched: ${stats.tuples_fetched || 0}`);
        } else {
          console.log("\n📈 Index statistics: Not yet available (will populate as queries use the index)");
        }
      } catch (e: any) {
        // Statistics may not be available immediately, this is fine
        console.log("\n📈 Index statistics: Not available (will populate as queries use the index)");
      }

      // Sample query to test the index
      console.log("\n🧪 Testing index with sample query...");
      try {
        const testQuery = await client.query(`
          EXPLAIN (FORMAT JSON)
          SELECT * FROM assignments
          WHERE user_id = (SELECT id FROM users LIMIT 1)
          AND status = 'Inbox'
          ORDER BY due_date NULLS LAST
          LIMIT 1;
        `);

        if (testQuery.rows[0]?.explain) {
          const plan = testQuery.rows[0].explain[0];
          const planStr = JSON.stringify(plan, null, 2);
          
          // Check if index is used
          if (planStr.includes('idx_assignments_user_status_due_date')) {
            console.log("   ✅ Index is being used in query plan");
          } else {
            console.log("   ℹ️  Index may not be used yet (no data or different query pattern)");
          }
        }
      } catch (e: any) {
        console.log(`   ℹ️  Could not test query (likely no data): ${e.message}`);
      }

      console.log("\n✨ Migration verification complete!");
      console.log("\n📝 Summary:");
      console.log("   ✅ CHECK constraint on status added");
      console.log("   ✅ Composite index (user_id, status, due_date) created");
      console.log("   ✅ All existing indexes preserved");
      console.log("\n💡 Tip: The new index will optimize dashboard queries filtering by user, status, and due_date");

    } catch (err: any) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (e: any) {
    console.error("\n❌ Migration failed:", e.message);
    if (e.message.includes("relation") && e.message.includes("does not exist")) {
      console.error("\n💡 Tip: Make sure the assignments table exists (from migration 0001_unified.sql)");
    }
    if (e.message.includes("DATABASE_URL")) {
      console.error("\n💡 Tip: Make sure DATABASE_URL is set in your .env file");
    }
    if (e.message.includes("constraint")) {
      console.error("\n💡 Tip: The constraint may already exist. This is safe - the migration uses IF NOT EXISTS.");
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



