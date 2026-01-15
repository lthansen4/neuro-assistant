// scripts/fix-users.ts
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../packages/db/src/schema";
import { eq } from "drizzle-orm";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  // Fix user #2 - should have demo_user_1 as clerk_user_id
  const demoUserId = "44ab01b9-f6f7-4743-943c-0a5bb610a08d";
  
  await db
    .update(schema.users)
    .set({ clerkUserId: "demo_user_1" })
    .where(eq(schema.users.id, demoUserId));
  
  console.log("✓ Fixed user #2 - set clerk_user_id to 'demo_user_1'");
  console.log("");
  console.log("Current users:");
  console.log("1. Your account: user_37rXLvDss8BEAUyZJq0vYJiPVwg");
  console.log("2. Demo account: demo_user_1 (has sample data)");
  console.log("");
  console.log("To see demo data, sign in with Clerk ID: demo_user_1");
  console.log("To use your account, sign in with your Clerk account");

  await pool.end();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await pool.end();
  process.exit(1);
});






