/**
 * OneSignal Configuration
 * 
 * To enable push notifications:
 * 1. Go to onesignal.com and create an account
 * 2. Create a new Web Push app
 * 3. Add your credentials to .env.local:
 *    NEXT_PUBLIC_ONESIGNAL_APP_ID=your_app_id
 *    ONESIGNAL_REST_API_KEY=your_rest_api_key
 */

export const oneSignalConfig = {
  appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '',
  restApiKey: process.env.ONESIGNAL_REST_API_KEY || '',
  
  // OneSignal API endpoints
  apiUrl: 'https://onesignal.com/api/v1',
  
  // Notification settings (optional)
  // defaultIcon: '/icons/icon-192.png',
  // defaultBadge: '/icons/badge-72.png',
  
  // For development, we can disable OneSignal
  enabled: !!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID,
};

export function isOneSignalEnabled(): boolean {
  return oneSignalConfig.enabled && oneSignalConfig.appId.length > 0;
}







