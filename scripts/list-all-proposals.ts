import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../packages/db/src/schema";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    console.log("=== ALL PROPOSALS (Most Recent First) ===\n");
    
    const proposals = await db.query.rebalancingProposals.findMany({
      orderBy: (proposals, { desc }) => [desc(proposals.createdAt)],
      limit: 10
    });
    
    for (const proposal of proposals) {
      console.log(`ID: ${proposal.id}`);
      console.log(`  Status: ${proposal.status}`);
      console.log(`  Created: ${proposal.createdAt.toISOString()}`);
      console.log(`  Applied: ${proposal.appliedAt?.toISOString() || 'N/A'}`);
      console.log(`  Cancelled: ${proposal.cancelledAt?.toISOString() || 'N/A'}`);
      
      // Get move count
      const moves = await db.query.proposalMoves.findMany({
        where: (moves, { eq }) => eq(moves.proposalId, proposal.id)
      });
      console.log(`  Moves: ${moves.length}`);
      
      if (moves.length > 0) {
        console.log(`  First move source event ID: ${moves[0].sourceEventId}`);
      }
      
      console.log("");
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







