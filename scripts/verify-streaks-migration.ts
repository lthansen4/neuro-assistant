// scripts/verify-streaks-migration.ts
// Verify that the user_streaks migration worked correctly
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../packages/db/src/schema";
import { eq, and } from "drizzle-orm";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    console.log("🔍 Verifying user_streaks migration...\n");

    // Test 1: Try to query with the new schema
    console.log("1️⃣  Testing schema query...");
    try {
      const streaks = await db.query.userStreaks.findMany({
        limit: 5,
      });
      console.log("   ✅ Schema query successful");
      console.log(`   📊 Found ${streaks.length} streak(s)`);
    } catch (e: any) {
      console.error("   ❌ Schema query failed:", e.message);
      throw e;
    }

    // Test 2: Verify we can filter by streak_type
    console.log("\n2️⃣  Testing streak_type filter...");
    try {
      // This should work even with no data
      const productivityStreaks = await db
        .select()
        .from(schema.userStreaks)
        .where(
          and(
            eq(schema.userStreaks.userId, "00000000-0000-0000-0000-000000000000" as any),
            eq(schema.userStreaks.streakType, "productivity")
          )
        );
      console.log("   ✅ Filter by streak_type works");
    } catch (e: any) {
      console.error("   ❌ Filter failed:", e.message);
      throw e;
    }

    // Test 3: Check table structure via raw SQL
    console.log("\n3️⃣  Checking table structure...");
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'user_streaks'
      AND column_name IN ('streak_type', 'current_count', 'longest_count', 'last_incremented_on', 'updated_at')
      ORDER BY column_name;
    `);

    const requiredColumns = [
      "streak_type",
      "current_count",
      "longest_count",
      "last_incremented_on",
      "updated_at",
    ];

    const foundColumns = columns.rows.map((r: any) => r.column_name);
    const missingColumns = requiredColumns.filter((c) => !foundColumns.includes(c));

    if (missingColumns.length === 0) {
      console.log("   ✅ All new columns exist");
      columns.rows.forEach((col: any) => {
        console.log(`      - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`);
      });
    } else {
      console.error(`   ❌ Missing columns: ${missingColumns.join(", ")}`);
      throw new Error("Migration incomplete");
    }

    // Test 4: Check unique constraint
    console.log("\n4️⃣  Checking constraints...");
    const constraints = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'user_streaks'
      AND constraint_type = 'UNIQUE';
    `);

    const hasNewConstraint = constraints.rows.some(
      (c: any) => c.constraint_name === "user_streaks_user_id_streak_type_key"
    );
    const hasOldConstraint = constraints.rows.some(
      (c: any) => c.constraint_name === "user_streaks_user_id_key"
    );

    if (hasNewConstraint) {
      console.log("   ✅ New unique constraint (user_id, streak_type) exists");
    } else {
      console.error("   ❌ New unique constraint missing");
      throw new Error("Constraint migration incomplete");
    }

    if (hasOldConstraint) {
      console.log("   ⚠️  Old unique constraint (user_id) still exists (should be removed)");
    } else {
      console.log("   ✅ Old unique constraint (user_id) removed");
    }

    console.log("\n✨ All verifications passed!");
    console.log("\n📝 Summary:");
    console.log("   - Schema updated correctly");
    console.log("   - New columns exist");
    console.log("   - Constraints migrated");
    console.log("   - Code should work with new structure");
    console.log("\n🎯 Next steps:");
    console.log("   - Test the dashboard API endpoint");
    console.log("   - Test the StreakBadge component");
    console.log("   - Optionally drop old columns after confirming everything works");
  } catch (e: any) {
    console.error("\n❌ Verification failed:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});







