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
    console.log("=== CURRENT TEST EVENT ===\n");
    
    // Get the current test event
    const { calendarEventsNew } = schema;
    const { like, or } = await import('drizzle-orm');
    const testEvent = await db.query.calendarEventsNew.findFirst({
      where: or(
        like(calendarEventsNew.title, '%Test Focus Session%'),
        like(calendarEventsNew.title, '%test%')
      ),
      orderBy: (events, { desc }) => [desc(events.createdAt)]
    });
    
    if (testEvent) {
      console.log(`Event ID: ${testEvent.id}`);
      console.log(`Title: ${testEvent.title}`);
      console.log(`Current Position: ${testEvent.startAt.toISOString()} (${new Date(testEvent.startAt).toLocaleTimeString('en-US', { timeZone: 'America/Chicago' })} CT)`);
      console.log("");
    }
    
    console.log("=== ALL 'PROPOSED' PROPOSALS ===\n");
    
    const { rebalancingProposals } = schema;
    const proposedProposals = await db.query.rebalancingProposals.findMany({
      where: eq(rebalancingProposals.status, 'proposed'),
      orderBy: (proposals, { desc }) => [desc(proposals.createdAt)]
    });
    
    console.log(`Found ${proposedProposals.length} 'proposed' proposals\n`);
    
    for (const proposal of proposedProposals) {
      console.log(`Proposal ID: ${proposal.id}`);
      console.log(`  Created: ${proposal.createdAt.toISOString()}`);
      console.log(`  Age: ${Math.round((Date.now() - proposal.createdAt.getTime()) / (1000 * 60))} minutes`);
      
      // Get moves
      const { proposalMoves } = schema;
      const moves = await db.query.proposalMoves.findMany({
        where: eq(proposalMoves.proposalId, proposal.id)
      });
      
      console.log(`  Moves: ${moves.length}`);
      
      for (const move of moves) {
        console.log(`    Move ID: ${move.id}`);
        console.log(`      Source Event ID: ${move.sourceEventId || 'NULL'}`);
        
        if (move.sourceEventId) {
          // Check if event exists
          const event = await db.query.calendarEventsNew.findFirst({
            where: eq(calendarEventsNew.id, move.sourceEventId)
          });
          
          if (event) {
            console.log(`      ✓ Event exists: "${event.title}"`);
          } else {
            console.log(`      ✗ EVENT DELETED/MISSING (stale)`);
          }
        }
        
        console.log(`      Target: ${move.targetStartAt?.toISOString()}`);
      }
      console.log("");
    }
    
    console.log("\n=== MOST RECENT APPLIED PROPOSAL ===\n");
    
    const appliedProposal = await db.query.rebalancingProposals.findFirst({
      where: eq(rebalancingProposals.status, 'applied'),
      orderBy: (proposals, { desc }) => [desc(proposals.appliedAt)]
    });
    
    if (appliedProposal) {
      console.log(`Proposal ID: ${appliedProposal.id}`);
      console.log(`Applied: ${appliedProposal.appliedAt?.toISOString()}`);
      console.log(`Age: ${Math.round((Date.now() - appliedProposal.appliedAt!.getTime()) / (1000 * 60))} minutes`);
      
      // Get snapshot
      const { rollbackSnapshots } = schema;
      const snapshot = await db.query.rollbackSnapshots.findFirst({
        where: eq(rollbackSnapshots.proposalId, appliedProposal.id)
      });
      
      if (snapshot) {
        const payload = snapshot.payload as Array<any>;
        console.log(`Snapshot: ${payload.length} events`);
        for (const event of payload) {
          console.log(`  - ${event.eventId}: ${event.title} at ${event.startAt}`);
        }
      }
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




