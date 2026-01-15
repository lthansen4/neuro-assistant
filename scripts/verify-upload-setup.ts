#!/usr/bin/env tsx
/**
 * Quick verification script to check if PDF upload setup is ready
 * Run: npm run tsx scripts/verify-upload-setup.ts
 */

import { config } from "dotenv";
config();

const checks: Array<{ name: string; check: () => Promise<boolean> | boolean; message?: string }> = [];

// Check environment variables
checks.push({
  name: "DATABASE_URL",
  check: () => !!process.env.DATABASE_URL,
  message: "Set DATABASE_URL in .env"
});

checks.push({
  name: "NEXT_PUBLIC_SUPABASE_URL",
  check: () => !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  message: "Set NEXT_PUBLIC_SUPABASE_URL in .env"
});

checks.push({
  name: "SUPABASE_SERVICE_ROLE_KEY",
  check: () => !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  message: "Set SUPABASE_SERVICE_ROLE_KEY in .env"
});

checks.push({
  name: "OPENAI_API_KEY",
  check: () => !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.startsWith("sk-"),
  message: "Set OPENAI_API_KEY in .env (should start with 'sk-')"
});

checks.push({
  name: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  check: () => !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  message: "Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in .env"
});

checks.push({
  name: "CLERK_SECRET_KEY",
  check: () => !!process.env.CLERK_SECRET_KEY,
  message: "Set CLERK_SECRET_KEY in .env"
});

// Check API server
checks.push({
  name: "API Server (port 8787)",
  check: async () => {
    try {
      const response = await fetch("http://localhost:8787/api/upload/extract-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: Buffer.from("test")
      });
      // Should get an error response (PDF parsing fails), but server should respond
      return response.status !== 0;
    } catch (e) {
      return false;
    }
  },
  message: "Start API server: npm run dev -w @neuro/api"
});

// Check web server
checks.push({
  name: "Web Server (port 3000)",
  check: async () => {
    try {
      const response = await fetch("http://localhost:3000");
      return response.ok;
    } catch (e) {
      return false;
    }
  },
  message: "Start web server: npm run dev -w @neuro/web"
});

// Check Supabase bucket (requires Supabase client)
checks.push({
  name: "Supabase Storage Bucket",
  check: async () => {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data, error } = await supabase.storage.from("syllabi").list("", { limit: 1 });
      if (error) {
        if (error.message.includes("not found") || error.message.includes("Bucket")) {
          return false;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  },
  message: "Create bucket: npm run tsx scripts/create-syllabi-bucket.ts"
});

async function main() {
  console.log("🔍 Verifying PDF Upload Setup...\n");

  let allPassed = true;

  for (const { name, check, message } of checks) {
    const passed = await check();
    const icon = passed ? "✅" : "❌";
    console.log(`${icon} ${name}`);
    if (!passed) {
      allPassed = false;
      if (message) {
        console.log(`   → ${message}\n`);
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  if (allPassed) {
    console.log("✅ All checks passed! Ready to test PDF upload.");
    console.log("\nNext steps:");
    console.log("1. Navigate to http://localhost:3000/upload");
    console.log("2. Sign in with Clerk");
    console.log("3. Upload a PDF syllabus");
  } else {
    console.log("❌ Some checks failed. Please fix the issues above.");
    console.log("\nSee TESTING_PDF_UPLOAD.md for detailed instructions.");
  }
  console.log("=".repeat(50));
}

main().catch(console.error);



