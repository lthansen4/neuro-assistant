// scripts/create-syllabi-bucket.ts
// Run this script to create the syllabi bucket in Supabase Storage
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error("Error listing buckets:", listError);
      process.exit(1);
    }

    const existingBucket = buckets?.find(b => b.name === "syllabi");
    
    if (existingBucket) {
      console.log("✓ Bucket 'syllabi' already exists");
      console.log("  Public:", existingBucket.public);
      console.log("  Created:", existingBucket.created_at);
      return;
    }

    // Create the bucket
    console.log("Creating bucket 'syllabi'...");
    const { data, error } = await supabase.storage.createBucket("syllabi", {
      public: false, // Private bucket
      fileSizeLimit: 10485760, // 10MB limit
      allowedMimeTypes: ["application/pdf"]
    });

    if (error) {
      console.error("Error creating bucket:", error);
      process.exit(1);
    }

    console.log("✓ Successfully created bucket 'syllabi'");
    console.log("  Bucket is private (not public)");
    console.log("  File size limit: 10MB");
    console.log("  Allowed MIME types: application/pdf");
  } catch (err: any) {
    console.error("Unexpected error:", err);
    process.exit(1);
  }
}

main();




