// scripts/verify-rebalancing-tables.ts
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../packages/db/src/schema";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    console.log("Verifying Rebalancing Engine tables...\n");
    
    // Check rebalancing_proposals
    const proposals = await db.query.rebalancingProposals.findMany({ limit: 1 });
    console.log("✓ rebalancing_proposals table exists");
    
    // Check proposal_moves
    const moves = await db.query.proposalMoves.findMany({ limit: 1 });
    console.log("✓ proposal_moves table exists");
    
    // Check rollback_snapshots
    const snapshots = await db.query.rollbackSnapshots.findMany({ limit: 1 });
    console.log("✓ rollback_snapshots table exists");
    
    // Check churn_ledger
    const ledger = await db.query.churnLedger.findMany({ limit: 1 });
    console.log("✓ churn_ledger table exists");
    
    // Check churn_settings
    const settings = await db.query.churnSettings.findMany({ limit: 1 });
    console.log("✓ churn_settings table exists");
    
    // Check rebalancing_apply_attempts
    const attempts = await db.query.rebalancingApplyAttempts.findMany({ limit: 1 });
    console.log("✓ rebalancing_apply_attempts table exists");
    
    console.log("\n✅ All Rebalancing Engine tables are accessible!");
  } catch (e: any) {
    console.error("❌ Error verifying tables:", e.message);
    if (e.message.includes("does not exist")) {
      console.error("\nThe tables may not have been created yet.");
      console.error("Please run the migrations in Supabase SQL Editor:");
      console.error("  - 0013_5_rebalancing_base_tables.sql");
      console.error("  - 0014_5_rebalancing_bridge_calendar_integration.sql");
      console.error("  - 0015_rebalancing_rollback_snapshots.sql");
      console.error("  - 0016_rebalancing_churn_management.sql");
      console.error("  - 0017_rebalancing_apply_attempts.sql");
    }
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await pool.end();
  process.exit(1);
});







