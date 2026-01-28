// scripts/check-users.ts
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../packages/db/src/schema";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  const users = await db.query.users.findMany();
  
  console.log("Current users in database:");
  console.log("============================");
  users.forEach((user, idx) => {
    console.log(`${idx + 1}. Database ID: ${user.id}`);
    console.log(`   Clerk ID: ${user.clerkUserId}`);
    console.log(`   Timezone: ${user.timezone}`);
    console.log(`   Target Study Ratio: ${user.targetStudyRatio}`);
    console.log("");
  });

  await pool.end();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await pool.end();
  process.exit(1);
});










