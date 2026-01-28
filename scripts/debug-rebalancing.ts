import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../packages/db/src/schema";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    console.log("=== REBALANCING DEBUG ===\n");
    
    // Get all proposals
    const proposals = await db.query.rebalancingProposals.findMany({
      orderBy: (proposals, { desc }) => [desc(proposals.createdAt)]
    });
    
    console.log(`Found ${proposals.length} proposals:\n`);
    
    for (const proposal of proposals) {
      console.log(`Proposal ID: ${proposal.id}`);
      console.log(`  Status: ${proposal.status}`);
      console.log(`  Created: ${proposal.createdAt}`);
      console.log(`  Applied: ${proposal.appliedAt || 'N/A'}`);
      console.log(`  User ID: ${proposal.userId}`);
      
      // Get moves for this proposal
      const moves = await db.query.proposalMoves.findMany({
        where: (moves, { eq }) => eq(moves.proposalId, proposal.id)
      });
      
      console.log(`  Moves (${moves.length}):`);
      for (const move of moves) {
        console.log(`    - ${move.moveType}: ${move.sourceEventId} -> ${move.targetStartAt?.toISOString() || 'N/A'}`);
      }
      
      // Get snapshot for this proposal
      const snapshot = await db.query.rollbackSnapshots.findFirst({
        where: (snapshots, { eq }) => eq(snapshots.proposalId, proposal.id)
      });
      
      if (snapshot) {
        const payload = snapshot.payload as Array<any>;
        console.log(`  Snapshot: ${payload.length} events`);
        for (const event of payload) {
          console.log(`    - ${event.eventId}: ${event.title || 'untitled'} at ${event.startAt}`);
        }
      } else {
        console.log(`  Snapshot: None`);
      }
      
      console.log("");
    }
    
    // Get all snapshots
    const snapshots = await db.query.rollbackSnapshots.findMany({
      orderBy: (snapshots, { desc }) => [desc(snapshots.createdAt)]
    });
    
    console.log(`\n=== ALL SNAPSHOTS (${snapshots.length}) ===\n`);
    for (const snapshot of snapshots) {
      const payload = snapshot.payload as Array<any>;
      console.log(`Snapshot ID: ${snapshot.id}`);
      console.log(`  Proposal ID: ${snapshot.proposalId}`);
      console.log(`  Created: ${snapshot.createdAt}`);
      console.log(`  Events (${payload.length}):`);
      for (const event of payload) {
        console.log(`    - ${event.eventId}: ${event.title || 'untitled'} at ${event.startAt}`);
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







