#!/usr/bin/env node
/**
 * Test Script: Create a post-class nudge manually
 * 
 * This simulates a class that just ended and creates a nudge for testing.
 */

import { db } from '../apps/api/src/lib/db';
import { nudges, users, courses } from '../packages/db/src/schema';
import { eq } from 'drizzle-orm';
import { DateTime } from 'luxon';

async function createTestNudge() {
  try {
    console.log('\n========== CREATE TEST NUDGE ==========\n');

    // 1. Fetch a user (use the first one for testing)
    const allUsers = await db.select().from(users).limit(1);
    if (allUsers.length === 0) {
      console.error('❌ No users found in database!');
      process.exit(1);
    }
    const user = allUsers[0];
    console.log(`✅ Found user: ${user.clerkUserId}`);

    // 2. Fetch a course for this user
    const userCourses = await db
      .select()
      .from(courses)
      .where(eq(courses.userId, user.id))
      .limit(1);
    
    if (userCourses.length === 0) {
      console.error('❌ No courses found for user!');
      process.exit(1);
    }
    const course = userCourses[0];
    console.log(`✅ Found course: ${course.code} - ${course.name}`);

    // 3. Create a test nudge for a class that "just ended" (1 minute ago)
    const classEndTime = new Date(Date.now() - 60 * 1000); // 1 minute ago
    const now = DateTime.now().setZone('America/Chicago');

    const [newNudge] = await db.insert(nudges).values({
      userId: user.id,
      courseId: course.id,
      type: 'POST_CLASS',
      status: 'queued',
      triggerAt: classEndTime,
      scheduledSendAt: classEndTime,
      deliveryChannel: 'in_app',
      metadata: {
        classDate: now.toISODate(),
        courseCode: course.code,
        courseName: course.name,
        testNudge: true
      }
    }).returning();

    console.log(`✅ Created test nudge: ${newNudge.id}`);
    console.log(`   Course: ${course.code} - ${course.name}`);
    console.log(`   Trigger time: ${classEndTime.toISOString()}`);
    console.log(`   Status: ${newNudge.status}`);
    console.log('\n📱 Now check the app - you should see a post-class nudge banner!');
    console.log('\n========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error creating test nudge:', error);
    process.exit(1);
  }
}

createTestNudge();

