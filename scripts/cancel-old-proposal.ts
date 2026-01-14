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
    
    const result = await db.update(rebalancingProposals)
      .set({
        status: 'cancelled',
        cancelledAt: new Date()
      })
      .where(eq(rebalancingProposals.id, '27753ef5-f414-49eb-b50d-b543284eed49'))
      .returning();
    
    if (result.length > 0) {
      console.log("✓ Cancelled stale proposal:", result[0].id);
    } else {
      console.log("No proposal found");
    }
    
  } catch (e: any) {
    console.error("Error:", e.message);
  } finally {
    await pool.end();
  }
}

main().catch(async (e) => {
  console.error("Error:", e);
  await pool.end();
  process.exit(1);
});
