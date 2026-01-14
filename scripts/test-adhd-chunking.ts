#!/usr/bin/env tsx
/**
 * Test script for Priority 1 ADHD-friendly features:
 * 1. Micro-Chunking (45m for difficult/boring tasks)
 * 2. Time Blindness Overhead (+20% for multi-day chunks)
 * 3. Transition Tax (15m decompression buffers)
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../packages/db/src/schema';
import { eq, and, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';

// Test User ID (replace with your actual Clerk user ID)
const TEST_USER_ID = 'f117b49f-54de-4bc1-b1b5-87f45b2a0503';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const client = postgres(connectionString);
const db = drizzle(client, { schema });

async function testADHDChunking() {
  console.log('🧪 Testing ADHD-Friendly Chunking Features\n');
  console.log('=' .repeat(60));
  
  try {
    // Test 1: Create a high-difficulty assignment (should trigger micro-chunking)
    console.log('\n📝 TEST 1: High-Difficulty Assignment (Micro-Chunking)\n');
    
    const dueDate = DateTime.now().plus({ days: 5 }).toISO();
    const testCourse = await db.query.courses.findFirst({
      where: eq(schema.courses.userId, TEST_USER_ID)
    });
    
    if (!testCourse) {
      console.log('❌ No course found for test user. Please create a course first.');
      return;
    }
    
    // Clean up previous test data
    await db.delete(schema.assignments).where(
      and(
        eq(schema.assignments.userId, TEST_USER_ID),
        eq(schema.assignments.title, '[TEST] Difficult Research Paper')
      )
    );
    
    // Create assignment
    const [assignment] = await db.insert(schema.assignments).values({
      userId: TEST_USER_ID,
      courseId: testCourse.id,
      title: '[TEST] Difficult Research Paper',
      description: 'High-difficulty task with micro-chunking',
      category: 'Essay',
      dueAt: new Date(dueDate),
      estimatedDuration: 300, // 5 hours (should create multiple chunks)
      status: 'Scheduled',
      priorityScore: 0.8,
      requiresChunking: true,
      createdAt: new Date()
    }).returning();
    
    console.log(`✅ Created assignment: ${assignment.title}`);
    console.log(`   Due: ${assignment.dueAt?.toISOString()}`);
    console.log(`   Duration: ${assignment.estimatedDuration} minutes`);
    
    // Simulate chunk calculation with high difficulty
    console.log('\n🔧 Simulating chunk calculation...\n');
    
    const totalMinutes = 300;
    const MAX_CHUNK = 45; // Micro-chunking
    const numChunks = Math.ceil(totalMinutes / MAX_CHUNK);
    
    console.log(`   Expected chunks: ${numChunks} (capped at 45m each)`);
    console.log(`   Base time per chunk: ${MAX_CHUNK}m`);
    
    // Simulate time blindness overhead
    let totalScheduledTime = 0;
    let firstChunk = true;
    
    for (let i = 0; i < numChunks; i++) {
      const baseTime = Math.min(totalMinutes - totalScheduledTime, MAX_CHUNK);
      const overhead = firstChunk ? 0 : Math.ceil(baseTime * 0.20); // 20% overhead after first day
      const finalTime = baseTime + overhead;
      
      console.log(`   Chunk ${i + 1}: ${baseTime}m base ${overhead > 0 ? `+ ${overhead}m overhead (20%)` : ''} = ${finalTime}m`);
      
      totalScheduledTime += baseTime;
      if (i === 0) firstChunk = false;
    }
    
    console.log(`\n   Total work time: ${totalMinutes}m`);
    console.log(`   Total scheduled time: ${totalScheduledTime + Math.ceil(totalScheduledTime * 0.20 * (numChunks - 1) / numChunks)}m (includes overhead)`);
    
    // Check for transition buffers
    console.log('\n⏱️  Transition Tax Buffers:\n');
    console.log(`   ${numChunks} chunks = ${numChunks} x 15m buffers = ${numChunks * 15}m total recovery time`);
    console.log(`   Purpose: Prevent context switching fatigue`);
    
    // Query actual calendar events
    console.log('\n📅 Checking Calendar Events:\n');
    
    const events = await db.query.calendarEventsNew.findMany({
      where: eq(schema.calendarEventsNew.linkedAssignmentId, assignment.id),
      orderBy: (events, { asc }) => [asc(events.startAt)]
    });
    
    if (events.length === 0) {
      console.log('⚠️  No calendar events created yet. This is expected if chunks are created via Quick Add API.');
      console.log('   To test fully: Use Quick Add to create "Difficult 5-page paper due in 5 days"');
    } else {
      events.forEach((event, idx) => {
        const duration = (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / (1000 * 60);
        const isBuffer = event.metadata && (event.metadata as any).transitionTax;
        
        console.log(`   ${idx + 1}. ${event.title}`);
        console.log(`      Type: ${event.eventType}`);
        console.log(`      Time: ${new Date(event.startAt).toLocaleString()} - ${new Date(event.endAt).toLocaleString()}`);
        console.log(`      Duration: ${duration}m`);
        if (isBuffer) {
          console.log(`      🧠 TRANSITION TAX: ${(event.metadata as any).purpose}`);
        }
        console.log('');
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✅ TEST COMPLETE!\n');
    console.log('Expected Features:');
    console.log('  ✓ Micro-Chunking: Chunks capped at 45m (high difficulty)');
    console.log('  ✓ Time Blindness Overhead: +20% on chunks after first day');
    console.log('  ✓ Transition Tax: 15m "Decompression Buffer" after each chunk');
    
    console.log('\n📝 Next Steps:');
    console.log('  1. Try creating an assignment via Quick Add');
    console.log('  2. Check the calendar for chunk distribution');
    console.log('  3. Look for "Decompression Buffer" events');
    console.log('  4. Verify chunks are 45-60m (with overhead)');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.end();
  }
}

testADHDChunking();

