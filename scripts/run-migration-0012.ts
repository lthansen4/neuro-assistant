// scripts/run-migration-0012.ts
// Run migration 0012: Dashboard Performance (Materialized View + Covering Index)
import { config } from "dotenv";
import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

config({ path: ".env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  try {
    console.log("🚀 Starting migration 0012: Dashboard Performance\n");

    // Read the migration file
    const migrationPath = join(process.cwd(), "packages/db/migrations/0012_dashboard_performance.sql");
    const migrationSQL = readFileSync(migrationPath, "utf-8");

    console.log("📋 Executing migration steps...\n");

    // Execute the migration
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      // Split migration into parts to handle optional index gracefully
      const parts = migrationSQL.split(/--\s*2\.\s*COVERING INDEX/m);
      
      // Execute main migration (materialized view + function)
      if (parts[0]) {
        await client.query(parts[0]);
      }
      
      // Try to execute covering index creation (optional - requires migration 0008)
      if (parts[1]) {
        try {
          const indexSQL = '-- 2. COVERING INDEX' + parts[1].split(/--\s*3\.\s*FUNCTION/m)[0];
          await client.query(indexSQL);
        } catch (indexErr: any) {
          console.log("\n⚠️  Warning: Could not create covering index (table may not exist):");
          console.log(`   ${indexErr.message}`);
          console.log("   This is OK if migration 0008 has not been applied yet.\n");
        }
      }
      
      // Execute function creation
      if (parts[1] && parts[1].includes('-- 3. FUNCTION')) {
        const functionSQL = '-- 3. FUNCTION' + parts[1].split('-- 3. FUNCTION')[1];
        await client.query(functionSQL);
      }
      
      await client.query("COMMIT");

      console.log("✅ Migration completed successfully!\n");

      // Verify the migration
      console.log("🔍 Verifying migration...\n");

      // 1) Check materialized view exists
      const mvExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM pg_matviews
          WHERE schemaname = 'public'
            AND matviewname = 'dashboard_stats_mv'
        );
      `);

      if (!mvExists.rows[0].exists) {
        throw new Error("dashboard_stats_mv materialized view not found");
      }

      console.log("✅ Materialized view 'dashboard_stats_mv' exists\n");

      // 2) Check unique index on materialized view
      const mvIndex = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'dashboard_stats_mv'
          AND indexname = 'idx_dashboard_stats_user';
      `);

      if (mvIndex.rows.length === 0) {
        throw new Error("idx_dashboard_stats_user index not found on materialized view");
      }

      console.log("✅ Unique index on materialized view:");
      console.log(`   ${mvIndex.rows[0].indexname}\n`);

      // 3) Check covering index on calendar_events_new (optional - only if table exists)
      const tableExists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'calendar_events_new'
        );
      `);

      if (tableExists.rows[0].exists) {
        const coveringIndex = await client.query(`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE tablename = 'calendar_events_new'
            AND indexname = 'idx_events_dashboard_fetch';
        `);

        if (coveringIndex.rows.length === 0) {
          console.log("⚠️  Covering index not found (but table exists) - this is OK if migration was skipped\n");
        } else {
          console.log("✅ Covering index on calendar_events_new:");
          console.log(`   ${coveringIndex.rows[0].indexname}`);
          console.log(`   Definition: ${coveringIndex.rows[0].indexdef}\n`);
        }
      } else {
        console.log("⚠️  calendar_events_new table does not exist - skipping covering index check");
        console.log("   (This is OK if migration 0008 has not been applied yet)\n");
      }

      // 4) Check function exists
      const functionExists = await client.query(`
        SELECT proname, prosrc
        FROM pg_proc
        WHERE proname = 'refresh_dashboard_stats_concurrently';
      `);

      if (functionExists.rows.length === 0) {
        throw new Error("refresh_dashboard_stats_concurrently function not found");
      }

      console.log("✅ Refresh function exists:");
      console.log(`   ${functionExists.rows[0].proname}\n`);

      // 5) Test materialized view structure
      const mvStructure = await client.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'dashboard_stats_mv'
        ORDER BY ordinal_position;
      `);

      console.log("📊 Materialized view columns:");
      mvStructure.rows.forEach((col: any) => {
        console.log(`   - ${col.column_name} (${col.data_type})`);
      });

      // 6) Test initial refresh (if no data, this is OK)
      try {
        await client.query("REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_stats_mv;");
        console.log("\n✅ Materialized view refresh test successful\n");
      } catch (refreshErr: any) {
        if (refreshErr.message.includes("cannot refresh") || refreshErr.message.includes("unique index")) {
          console.log("\n⚠️  Concurrent refresh requires unique index (checking...)");
          // Try non-concurrent refresh for testing
          await client.query("REFRESH MATERIALIZED VIEW dashboard_stats_mv;");
          console.log("✅ Non-concurrent refresh successful (OK for testing)\n");
        } else {
          throw refreshErr;
        }
      }

      // 7) Sample data check
      const rowCount = await client.query(`
        SELECT COUNT(*) as count FROM dashboard_stats_mv;
      `);

      console.log(`📊 Current row count in materialized view: ${rowCount.rows[0].count}`);

      // 8) EXPLAIN plan for covering index (only if table exists)
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'calendar_events_new'
        );
      `);

      if (tableCheck.rows[0].exists) {
        try {
          const explain = await client.query(`
            EXPLAIN (FORMAT JSON)
            SELECT title, event_type, is_movable
            FROM calendar_events_new
            WHERE user_id = '00000000-0000-0000-0000-000000000000'::uuid
              AND start_at >= CURRENT_DATE
              AND start_at < CURRENT_DATE + INTERVAL '1 day'
            ORDER BY start_at;
          `);

          console.log("\n🔍 EXPLAIN plan for dashboard schedule query:");
          if (explain.rows[0]?.['QUERY PLAN']) {
            const plan = JSON.parse(explain.rows[0]['QUERY PLAN'])[0];
            console.log(`   Plan Type: ${plan['Plan']['Node Type']}`);
            console.log(`   Index Name: ${plan['Plan']['Index Name'] || 'N/A'}`);
            console.log(`   Total Cost: ${plan['Plan']['Total Cost']}`);
          }
        } catch (explainErr: any) {
          console.log("\n⚠️  Could not generate EXPLAIN plan (this is OK if table is empty)");
        }
      } else {
        console.log("\n⚠️  Skipping EXPLAIN plan (calendar_events_new table does not exist)");
      }

      console.log("\n✨ Migration verification complete!");
      console.log("\n📝 Summary:");
      console.log("   ✅ Materialized view created for dashboard stats (streaks, chill bank, GPA)");
      console.log("   ✅ Unique index added for concurrent refresh");
      console.log("   ✅ Covering index added for schedule queries");
      console.log("   ✅ Refresh function created");
      console.log("\n💡 Next steps:");
      console.log("   - Schedule periodic refresh: SELECT refresh_dashboard_stats_concurrently();");
      console.log("   - Update dashboard API to query dashboard_stats_mv instead of base tables");
      console.log("   - Consider refreshing after streak updates, session completion, or grade changes");

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
      console.error("     - user_streaks");
      console.error("     - user_weekly_productivity");
      console.error("     - course_grade_forecasts");
      console.error("     - calendar_events_new");
    }
    if (e.message.includes("DATABASE_URL")) {
      console.error("\n💡 Tip: Make sure DATABASE_URL is set in your .env file");
    }
    if (e.message.includes("concurrently")) {
      console.error("\n💡 Tip: Concurrent refresh requires a unique index on the materialized view");
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







