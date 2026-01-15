import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../packages/db/src/schema";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    console.log("=== TEST EVENTS ===\n");
    
    // Get all test events
    const testEvents = await db.query.calendarEventsNew.findMany({
      where: (events, { like, or }) => or(
        like(events.title, '%Test%'),
        like(events.title, '%test%')
      ),
      orderBy: (events, { desc }) => [desc(events.createdAt)]
    });
    
    console.log(`Found ${testEvents.length} test events:\n`);
    for (const event of testEvents) {
      console.log(`ID: ${event.id}`);
      console.log(`  Title: ${event.title}`);
      console.log(`  Start: ${event.startAt.toISOString()}`);
      console.log(`  End: ${event.endAt.toISOString()}`);
      console.log(`  Movable: ${event.isMovable}`);
      console.log(`  Created: ${event.createdAt.toISOString()}`);
      console.log("");
    }
    
    // Get the latest proposal
    console.log("\n=== LATEST PROPOSAL ===\n");
    const latestProposal = await db.query.rebalancingProposals.findFirst({
      orderBy: (proposals, { desc }) => [desc(proposals.createdAt)]
    });
    
    if (latestProposal) {
      console.log(`Proposal ID: ${latestProposal.id}`);
      console.log(`Status: ${latestProposal.status}`);
      console.log(`Created: ${latestProposal.createdAt.toISOString()}`);
      console.log(`Applied: ${latestProposal.appliedAt?.toISOString() || 'N/A'}`);
      
      // Get moves for this proposal
      const moves = await db.query.proposalMoves.findMany({
        where: (moves, { eq }) => eq(moves.proposalId, latestProposal.id),
        orderBy: (moves, { asc }) => [asc(moves.createdAt)]
      });
      
      console.log(`\nMoves (${moves.length}):`);
      for (const move of moves) {
        console.log(`  Move ID: ${move.id}`);
        console.log(`    Type: ${move.moveType}`);
        console.log(`    Source Event ID: ${move.sourceEventId || 'NULL'}`);
        console.log(`    Target Start: ${move.targetStartAt?.toISOString() || 'NULL'}`);
        console.log(`    Target End: ${move.targetEndAt?.toISOString() || 'NULL'}`);
        console.log(`    Baseline Updated At: ${move.baselineUpdatedAt?.toISOString() || 'NULL'}`);
        
        // Check if the source event exists
        if (move.sourceEventId) {
          const sourceEvent = await db.query.calendarEventsNew.findFirst({
            where: (events, { eq }) => eq(events.id, move.sourceEventId)
          });
          
          if (sourceEvent) {
            console.log(`    ✓ Source event exists: "${sourceEvent.title}" at ${sourceEvent.startAt.toISOString()}`);
            console.log(`    ✓ Source event updated at: ${sourceEvent.updatedAt.toISOString()}`);
            
            // Check if updated_at matches baseline
            if (move.baselineUpdatedAt) {
              const baselineTime = new Date(move.baselineUpdatedAt).getTime();
              const currentTime = new Date(sourceEvent.updatedAt).getTime();
              if (baselineTime === currentTime) {
                console.log(`    ✓ Baseline matches (no conflict)`);
              } else {
                console.log(`    ✗ CONFLICT: Baseline ${move.baselineUpdatedAt.toISOString()} != Current ${sourceEvent.updatedAt.toISOString()}`);
              }
            }
          } else {
            console.log(`    ✗ Source event NOT FOUND`);
          }
        } else {
          console.log(`    - No source event (insert/delete move)`);
        }
        console.log("");
      }
      
      // Get snapshot for this proposal
      const snapshot = await db.query.rollbackSnapshots.findFirst({
        where: (snapshots, { eq }) => eq(snapshots.proposalId, latestProposal.id)
      });
      
      if (snapshot) {
        const payload = snapshot.payload as Array<any>;
        console.log(`\nSnapshot: ${payload.length} events`);
        for (const event of payload) {
          console.log(`  - ${event.eventId}: ${event.title || 'untitled'} at ${event.startAt}`);
        }
      } else {
        console.log(`\nSnapshot: None`);
      }
    } else {
      console.log("No proposals found");
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



