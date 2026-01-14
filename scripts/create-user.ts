// scripts/create-user.ts
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../packages/db/src/schema";
import { eq } from "drizzle-orm";

config({ path: "/Users/lindsayhansen/Desktop/App Builds/college-exec-functioning/neuro-assistant/.env" });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

async function main() {
  const clerkUserId = "user_37rXLvDss8BEAUyZJq0vYJiPVwg";
  
  // Check if user already exists
  let user = await db.query.users.findFirst({
    where: eq(schema.users.clerkUserId, clerkUserId),
  });

  if (user) {
    console.log("User already exists:", user.id);
    console.log("Clerk ID:", user.clerkUserId);
  } else {
    // Create new user
    [user] = await db
      .insert(schema.users)
      .values({
        clerkUserId,
        timezone: "America/New_York",
        targetStudyRatio: "2.50",
      })
      .returning();
    
    console.log("✓ User created successfully!");
    console.log("Database User ID:", user.id);
    console.log("Clerk User ID:", user.clerkUserId);
  }

  await pool.end();
}

main().catch(async (e) => {
  console.error("Error:", e);
  await pool.end();
  process.exit(1);
});




