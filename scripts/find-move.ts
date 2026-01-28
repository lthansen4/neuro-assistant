import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../packages/db/src/schema";
import { eq } from "drizzle-orm";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    // Find the move from the frontend logs
    const { proposalMoves } = schema;
    const move = await db.query.proposalMoves.findFirst({
      where: eq(proposalMoves.id, '4972c1ff-e33b-475e-972d-f227e3ca7615')
    });
    
    if (move) {
      console.log("Move found:");
      console.log(`  Proposal ID: ${move.proposalId}`);
      console.log(`  Move Type: ${move.moveType}`);
      console.log(`  Source Event ID: ${move.sourceEventId}`);
      console.log(`  Target Start: ${move.targetStartAt?.toISOString()}`);
      console.log(`  Created: ${move.createdAt.toISOString()}`);
      
      // Get the proposal
      const proposal = await db.query.rebalancingProposals.findFirst({
        where: eq(schema.rebalancingProposals.id, move.proposalId)
      });
      
      if (proposal) {
        console.log("\nProposal:");
        console.log(`  Status: ${proposal.status}`);
        console.log(`  Created: ${proposal.createdAt.toISOString()}`);
        console.log(`  Applied: ${proposal.appliedAt?.toISOString() || 'N/A'}`);
        console.log(`  Cancelled: ${proposal.cancelledAt?.toISOString() || 'N/A'}`);
      }
    } else {
      console.log("Move not found in database");
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







