import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "../packages/db/src/schema";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    const { rebalancingProposals } = schema;
    
    console.log("=== CLEANING UP ALL PROPOSALS ===\n");
    
    // Get count of proposals by status
    const allProposals = await db.query.rebalancingProposals.findMany();
    
    console.log(`Total proposals in database: ${allProposals.length}`);
    console.log(`  - proposed: ${allProposals.filter(p => p.status === 'proposed').length}`);
    console.log(`  - applied: ${allProposals.filter(p => p.status === 'applied').length}`);
    console.log(`  - cancelled: ${allProposals.filter(p => p.status === 'cancelled').length}`);
    console.log(`  - rejected: ${allProposals.filter(p => p.status === 'rejected').length}`);
    console.log(`  - undone: ${allProposals.filter(p => p.status === 'undone').length}`);
    
    // Delete ALL proposals
    const result = await db.delete(rebalancingProposals);
    const deletedCount = result.rowCount || 0;
    
    console.log(`\n✓ Deleted all ${deletedCount} proposals`);
    console.log("\nDatabase is now clean and ready for testing!");
    
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





