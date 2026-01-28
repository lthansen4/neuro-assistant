// scripts/verify-tables.ts
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../packages/db/src/schema";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  try {
    // Try to query the new tables to verify they exist
    const aliases = await db.query.userCourseAliases.findMany({ limit: 1 });
    console.log("✓ user_course_aliases table exists");
    
    const logs = await db.query.quickAddLogs.findMany({ limit: 1 });
    console.log("✓ quick_add_logs table exists");
    
    console.log("\nBoth new tables are successfully created and accessible!");
  } catch (e: any) {
    console.error("Error verifying tables:", e.message);
    if (e.message.includes("does not exist")) {
      console.error("\nThe tables may not have been created yet. Make sure you ran the SQL migration in Supabase.");
    }
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await pool.end();
  process.exit(1);
});








