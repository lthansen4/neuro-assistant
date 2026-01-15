/**
 * OneSignal Push Notification Service
 * 
 * Sends push notifications to users via OneSignal API
 */

const ONESIGNAL_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';
const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '';
const ONESIGNAL_API_URL = 'https://onesignal.com/api/v1/notifications';

interface PushNotificationOptions {
  userId: string; // Clerk user ID (external_user_id in OneSignal)
  title: string;
  message: string;
  data?: Record<string, any>; // Additional data for the notification
  url?: string; // URL to open when notification is clicked
}

export class OneSignalService {
  private static isEnabled(): boolean {
    return !!ONESIGNAL_API_KEY && !!ONESIGNAL_APP_ID;
  }

  /**
   * Send a push notification to a specific user
   */
  static async sendNotification(options: PushNotificationOptions): Promise<{ success: boolean; error?: string; notificationId?: string }> {
    if (!this.isEnabled()) {
      console.log('[OneSignal] Service not enabled, skipping notification');
      return { success: false, error: 'OneSignal not configured' };
    }

    try {
      console.log(`[OneSignal] Sending notification to user ${options.userId}:`, options.title);

      const response = await fetch(ONESIGNAL_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          include_external_user_ids: [options.userId], // Target specific user by Clerk ID
          headings: { en: options.title },
          contents: { en: options.message },
          data: options.data || {},
          url: options.url || undefined,
          // Web-specific settings
          web_url: options.url,
          // chrome_web_icon: '/icons/icon-192.png', // Optional, will use default
          // chrome_web_badge: '/icons/badge-72.png', // Optional, will use default
        }),
      });

      const result = await response.json();

      if (response.ok && result.id) {
        console.log('[OneSignal] Notification sent successfully:', result.id);
        return { success: true, notificationId: result.id };
      } else {
        console.error('[OneSignal] Failed to send notification:', result);
        return { success: false, error: result.errors?.[0] || 'Failed to send notification' };
      }
    } catch (error) {
      console.error('[OneSignal] Error sending notification:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  /**
   * Send a post-class nudge notification
   */
  static async sendPostClassNudge(userId: string, courseCode: string, courseName: string, nudgeId: string): Promise<{ success: boolean; error?: string }> {
    return this.sendNotification({
      userId,
      title: `Update ${courseCode}?`,
      message: `Class just ended. Any updates?`,
      data: {
        type: 'post_class_nudge',
        nudgeId,
        courseCode,
        courseName,
      },
      url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/calendar`,
    });
  }

  /**
   * Send a test notification (for debugging)
   */
  static async sendTestNotification(userId: string): Promise<{ success: boolean; error?: string }> {
    return this.sendNotification({
      userId,
      title: '🧪 Test Notification',
      message: 'OneSignal is working! You should see this notification.',
      data: { type: 'test' },
    });
  }
}




