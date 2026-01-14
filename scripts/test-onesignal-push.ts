/**
 * Test OneSignal Push Notifications
 * 
 * This script sends a test push notification directly via OneSignal
 */

import { db } from '../apps/api/src/lib/db';
import { users } from '../packages/db/src/schema';
import { eq } from 'drizzle-orm';

const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';
const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '';

async function testPushNotification() {
  console.log('\n========== TEST ONESIGNAL PUSH ==========\n');

  // Check config
  if (!ONESIGNAL_API_KEY || !ONESIGNAL_APP_ID) {
    console.log('❌ OneSignal not configured!');
    console.log('   ONESIGNAL_REST_API_KEY:', ONESIGNAL_API_KEY ? '✅ Set' : '❌ Missing');
    console.log('   NEXT_PUBLIC_ONESIGNAL_APP_ID:', ONESIGNAL_APP_ID ? '✅ Set' : '❌ Missing');
    return;
  }

  console.log('✅ OneSignal configured');
  console.log('   App ID:', ONESIGNAL_APP_ID);

  // Get a user
  const allUsers = await db.select().from(users);
  if (allUsers.length === 0) {
    console.log('❌ No users found in database');
    return;
  }

  const user = allUsers[0];
  console.log('✅ Found user:', user.clerkUserId);

  // Send test notification
  console.log('\n📱 Sending test push notification...');
  
  try {
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_external_user_ids: [user.clerkUserId],
        headings: { en: '🧪 Test Notification' },
        contents: { en: 'OneSignal is working! You should see this notification.' },
        data: { type: 'test' },
        url: 'http://localhost:3000/calendar',
        chrome_web_icon: '/icon-192.png',
      }),
    });

    const result = await response.json();

    if (response.ok && result.id) {
      console.log('✅ Push notification sent successfully!');
      console.log('   Notification ID:', result.id);
      console.log('   Recipients:', result.recipients || 0);
      console.log('\n📱 CHECK YOUR BROWSER:');
      console.log('   - You should see a notification appear');
      console.log('   - Title: "🧪 Test Notification"');
      console.log('   - Message: "OneSignal is working!"');
      console.log('\n💡 If you don\'t see it:');
      console.log('   1. Make sure you\'re logged into http://localhost:3000');
      console.log('   2. Check that notification permission was granted');
      console.log('   3. Check browser console for [OneSignal] logs');
      console.log('   4. Wait 30 seconds (OneSignal can be delayed)');
    } else {
      console.log('❌ Failed to send notification');
      console.log('   Error:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.log('❌ Error:', error);
  }

  console.log('\n==========================================\n');
}

testPushNotification().then(() => process.exit(0));

