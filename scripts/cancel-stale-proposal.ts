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
    const { rebalancingProposals } = schema;
    
    // Cancel the stale applied proposal (the one with 0 moves applied)
    const result = await db.update(rebalancingProposals)
      .set({
        status: 'cancelled',
        cancelledAt: new Date()
      })
      .where(eq(rebalancingProposals.id, 'abfbf257-a6c6-41d5-b354-d7bf15a7ed41'))
      .returning();
    
    if (result.length > 0) {
      console.log("✓ Cancelled stale proposal:", result[0].id);
    } else {
      console.log("No proposal found with that ID");
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







