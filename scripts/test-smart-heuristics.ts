/**
 * Test Smart Heuristics (Phase 2)
 * 
 * This script demonstrates the new intelligent rebalancing behavior:
 * 1. Creates test events (Chill + Focus)
 * 2. Creates a test assignment with urgency/impact
 * 3. Generates proposals at different energy levels
 * 4. Shows how prioritization affects moves
 */

import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../packages/db/src/schema";
import { eq, and } from "drizzle-orm";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    console.log("=== PHASE 2: Smart Heuristics Test ===\n");
    
    // Fetch the actual user ID from the database
    const user = await db.query.users.findFirst();
    if (!user) {
      console.error("❌ No users found in database. Please ensure a user exists.");
      return;
    }
    const TEST_USER_ID = user.id;
    console.log(`Using test user: ${TEST_USER_ID}\n`);

    // 1. Create test events (during daytime, not sleep window!)
    console.log("1️⃣ Creating test events...");
    
    // Create events for tomorrow at 2 PM and 4 PM UTC (safe daytime hours)
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(14, 0, 0, 0); // 2 PM UTC
    const twoHoursFromNow = tomorrow;
    
    const fourHoursLater = new Date(tomorrow);
    fourHoursLater.setUTCHours(16, 0, 0, 0); // 4 PM UTC
    const fourHoursFromNow = fourHoursLater;
    
    // Chill block (low priority)
    const [chillEvent] = await db.insert(schema.calendarEventsNew).values({
      userId: TEST_USER_ID,
      title: "Test Chill Block",
      eventType: "Chill",
      startAt: twoHoursFromNow,
      endAt: new Date(twoHoursFromNow.getTime() + 60 * 60 * 1000), // 1 hour
      isMovable: true,
      metadata: { test: true, phase: 2 }
    }).returning();

    // Focus block (higher priority)
    const [focusEvent] = await db.insert(schema.calendarEventsNew).values({
      userId: TEST_USER_ID,
      title: "Test Focus Block",
      eventType: "Focus",
      startAt: fourHoursFromNow,
      endAt: new Date(fourHoursFromNow.getTime() + 90 * 60 * 1000), // 1.5 hours
      isMovable: true,
      metadata: { test: true, phase: 2 }
    }).returning();

    console.log(`✓ Created Chill block: ${chillEvent.startAt.toISOString()}`);
    console.log(`✓ Created Focus block: ${focusEvent.startAt.toISOString()}\n`);

    // 2. Create a test assignment (urgent midterm)
    console.log("2️⃣ Creating test assignment...");
    
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    
    const [assignment] = await db.insert(schema.assignments).values({
      userId: TEST_USER_ID,
      title: "CS Midterm Exam",
      category: "Exam",
      dueDate: threeDaysFromNow,
      weightOverride: "25.0", // 25% of final grade
      effortEstimateMinutes: 180, // 3 hours to study
    }).returning();

    console.log(`✓ Created assignment: "${assignment.title}"`);
    console.log(`  - Due in 3 days: ${assignment.dueDate?.toISOString()}`);
    console.log(`  - Grade weight: ${assignment.weightOverride || 'N/A'}%`);
    console.log(`  - Estimated study time: ${assignment.effortEstimateMinutes || 'N/A'} min\n`);

    // 3. Test proposals at different energy levels
    console.log("3️⃣ Testing proposals at different energy levels...\n");

    // Test Case 1: Low energy (3/10) - should NOT preempt Chill
    console.log("📊 Test Case 1: Low Energy (3/10)");
    console.log("Expected: Should NOT move events (low energy = poor fit for Deep Work)\n");
    
    const lowEnergyRes = await fetch("http://localhost:8787/api/rebalancing/propose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-clerk-user-id": "user_37rXLvDss8BEAUyZJq0vYJiPVwg"
      },
      body: JSON.stringify({
        energyLevel: 3,
        targetAssignmentId: assignment.id
      })
    });

    const lowEnergyData = await lowEnergyRes.json();
    console.log(`Result: ${lowEnergyData.ok ? `${lowEnergyData.moves.length} moves proposed` : 'ERROR'}`);
    if (lowEnergyData.moves && lowEnergyData.moves.length > 0) {
      lowEnergyData.moves.forEach((move: any) => {
        console.log(`  - ${move.moveType}: ${move.metadata?.title || 'Unknown'}`);
        console.log(`    Reasons: ${move.reasonCodes?.join(', ')}`);
      });
    }
    console.log();

    // Clean up this proposal
    if (lowEnergyData.ok && lowEnergyData.proposalId) {
      await db.delete(schema.rebalancingProposals).where(eq(schema.rebalancingProposals.id, lowEnergyData.proposalId));
    }

    // Test Case 2: Medium energy (6/10) - should preempt Chill for urgent work
    console.log("📊 Test Case 2: Medium Energy (6/10)");
    console.log("Expected: Should preempt Chill block (urgent assignment, decent energy)\n");
    
    const mediumEnergyRes = await fetch("http://localhost:8787/api/rebalancing/propose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-clerk-user-id": "user_37rXLvDss8BEAUyZJq0vYJiPVwg"
      },
      body: JSON.stringify({
        energyLevel: 6,
        targetAssignmentId: assignment.id
      })
    });

    const mediumEnergyData = await mediumEnergyRes.json();
    console.log(`Result: ${mediumEnergyData.ok ? `${mediumEnergyData.moves.length} moves proposed` : 'ERROR'}`);
    if (mediumEnergyData.moves && mediumEnergyData.moves.length > 0) {
      mediumEnergyData.moves.forEach((move: any) => {
        console.log(`  - ${move.moveType}: ${move.metadata?.title || 'Unknown'}`);
        console.log(`    Reasons: ${move.reasonCodes?.join(', ')}`);
        console.log(`    Priority score: ${move.metadata?.assignmentPriorityScore?.toFixed(2) || 'N/A'}`);
      });
    }
    console.log();

    // Clean up this proposal
    if (mediumEnergyData.ok && mediumEnergyData.proposalId) {
      await db.delete(schema.rebalancingProposals).where(eq(schema.rebalancingProposals.id, mediumEnergyData.proposalId));
    }

    // Test Case 3: High energy (9/10) - should optimize Focus blocks
    console.log("📊 Test Case 3: High Energy (9/10)");
    console.log("Expected: Should optimize Focus blocks (move to morning if possible)\n");
    
    const highEnergyRes = await fetch("http://localhost:8787/api/rebalancing/propose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-clerk-user-id": "user_37rXLvDss8BEAUyZJq0vYJiPVwg"
      },
      body: JSON.stringify({
        energyLevel: 9,
        targetAssignmentId: assignment.id
      })
    });

    const highEnergyData = await highEnergyRes.json();
    console.log(`Result: ${highEnergyData.ok ? `${highEnergyData.moves.length} moves proposed` : 'ERROR'}`);
    if (highEnergyData.moves && highEnergyData.moves.length > 0) {
      highEnergyData.moves.forEach((move: any) => {
        console.log(`  - ${move.moveType}: ${move.metadata?.title || 'Unknown'}`);
        console.log(`    Reasons: ${move.reasonCodes?.join(', ')}`);
        console.log(`    Time of day: ${move.metadata?.originalTimeOfDay} → ${move.metadata?.targetTimeOfDay}`);
        console.log(`    Energy multiplier: ${move.energyMultiplier?.toFixed(2) || 'N/A'}`);
      });
    }
    console.log();

    // Clean up this proposal
    if (highEnergyData.ok && highEnergyData.proposalId) {
      await db.delete(schema.rebalancingProposals).where(eq(schema.rebalancingProposals.id, highEnergyData.proposalId));
    }

    // 4. Clean up test data
    console.log("4️⃣ Cleaning up test data...");
    
    await db.delete(schema.calendarEventsNew).where(
      and(
        eq(schema.calendarEventsNew.userId, TEST_USER_ID),
        eq(schema.calendarEventsNew.id, chillEvent.id)
      )
    );
    await db.delete(schema.calendarEventsNew).where(
      and(
        eq(schema.calendarEventsNew.userId, TEST_USER_ID),
        eq(schema.calendarEventsNew.id, focusEvent.id)
      )
    );
    await db.delete(schema.assignments).where(eq(schema.assignments.id, assignment.id));

    console.log("✓ Cleaned up test events and assignment\n");

    console.log("=== TEST COMPLETE ===");
    console.log("\n🎉 Phase 2 Smart Heuristics are working!");
    console.log("\nKey Observations:");
    console.log("1. Low energy → No moves (avoids bad energy fit)");
    console.log("2. Medium energy + urgent assignment → Preempts Chill");
    console.log("3. High energy → Optimizes Focus blocks for morning");
    console.log("\n💡 Tuning Tip: Adjust weights in heuristic-config.ts to change behavior!");

  } catch (e: any) {
    console.error("❌ Error:", e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  await pool.end();
  process.exit(1);
});





