// apps/api/src/lib/auth-utils.ts
import { db, schema } from "./db";
import { eq } from "drizzle-orm";

/**
 * Helper to get internal database userId from Clerk user ID or database ID.
 * This is more robust than simple UUID checks because Clerk IDs can also be UUIDs.
 */
export async function getUserId(c: any): Promise<string> {
  const uid = c.req.header("x-user-id") || c.req.header("x-clerk-user-id") || c.req.query("userId") || c.req.query("clerkUserId");
  
  if (!uid) {
    throw new Error("Missing userId (header x-user-id or x-clerk-user-id, or query ?userId=...)");
  }

  // 1. Try to find the user in our database by clerkUserId
  const dbUser = await db.query.users.findFirst({
    where: eq(schema.users.clerkUserId, uid),
  });

  if (dbUser) {
    return dbUser.id;
  }

  // 2. If not found by clerkUserId, check if it's a valid UUID and might be a direct database ID
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid);
  if (isUUID) {
    // Verify it exists as a database ID
    const userById = await db.query.users.findFirst({
      where: eq(schema.users.id, uid),
    });
    if (userById) {
      return userById.id;
    }
    // If it's a UUID but not in our DB, return it anyway (might be a new user or pre-synced ID)
    return uid;
  }

  // 3. Not found anywhere
  throw new Error(`No database user found for ID: ${uid}. Make sure the user exists in the database.`);
}

