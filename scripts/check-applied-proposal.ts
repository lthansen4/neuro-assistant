import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../packages/db/src/schema";
import { eq, gte } from "drizzle-orm";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    const { rebalancingProposals } = schema;
    
    // Get most recently applied proposal (within last 30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    console.log("=== CHECKING FOR APPLIED PROPOSAL ===\n");
    console.log(`Current time: ${new Date().toISOString()}`);
    console.log(`30 minutes ago: ${thirtyMinutesAgo.toISOString()}\n`);
    
    const proposal = await db.query.rebalancingProposals.findFirst({
      where: (proposals, { and, eq, gte }) => and(
        eq(proposals.status, 'applied'),
        gte(proposals.appliedAt, thirtyMinutesAgo)
      ),
      orderBy: (proposals, { desc }) => [desc(proposals.appliedAt)]
    });
    
    if (!proposal) {
      console.log("❌ No applied proposal found within the last 30 minutes");
    } else {
      const appliedAt = proposal.appliedAt ? new Date(proposal.appliedAt) : null;
      const timeRemainingMs = appliedAt 
        ? Math.max(0, 30 * 60 * 1000 - (Date.now() - appliedAt.getTime()))
        : 0;
      const timeRemainingMinutes = Math.floor(timeRemainingMs / (60 * 1000));
      
      console.log("✓ Applied proposal found:");
      console.log(`  ID: ${proposal.id}`);
      console.log(`  Applied at: ${proposal.appliedAt?.toISOString()}`);
      console.log(`  Age: ${Math.round((Date.now() - appliedAt!.getTime()) / (1000 * 60))} minutes ago`);
      console.log(`  Time remaining for undo: ${timeRemainingMinutes} minutes`);
      console.log(`  Moves count: ${proposal.movesCount}`);
      console.log(`  Churn cost: ${proposal.churnCostTotal}`);
    }
    
  } catch (e: any) {
    console.error("Error:", e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

main().catch(async (e) => {
  console.error("Error:", e);
  await pool.end();
  process.exit(1);
});
