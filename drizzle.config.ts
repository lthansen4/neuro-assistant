import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config({ path: ".env" });

export default {
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/migrations",
  dialect: "postgres",
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
} satisfies Config;
