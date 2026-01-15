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
    
    // Cancel all 'proposed' proposals
    const result = await db.update(rebalancingProposals)
      .set({
        status: 'cancelled',
        cancelledAt: new Date()
      })
      .where(eq(rebalancingProposals.status, 'proposed'))
      .returning();
    
    console.log(`✓ Cancelled ${result.length} stale 'proposed' proposals`);
    
    for (const p of result) {
      console.log(`  - ${p.id} (created ${Math.round((Date.now() - p.createdAt.getTime()) / (1000 * 60))} minutes ago)`);
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



