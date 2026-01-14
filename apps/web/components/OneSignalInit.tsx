"use client";

import { useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { isOneSignalEnabled } from '../lib/onesignal-config';

// Declare OneSignal on window
declare global {
  interface Window {
    OneSignalDeferred?: any[];
    OneSignal?: any;
  }
}

export function OneSignalInit() {
  const { user, isLoaded } = useUser();

  useEffect(() => {
    if (!isLoaded || !user || !isOneSignalEnabled()) {
      console.log('[OneSignal] Skipping initialization:', { isLoaded, hasUser: !!user, enabled: isOneSignalEnabled() });
      return;
    }

    // Initialize OneSignal using official SDK (exactly as OneSignal generated)
    const initOneSignal = async () => {
      try {
        console.log('[OneSignal] Initializing with official SDK...');
        
        // Wait for OneSignal SDK to load
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function(OneSignal: any) {
          // Initialize exactly as OneSignal expects
          await OneSignal.init({
            appId: "54a4c050-d18e-4885-a5e1-8e74e21414e2",
          });
          
          console.log('[OneSignal] Initialized successfully! 🎉');

          // Set external user ID (Clerk user ID)
          await OneSignal.login(user.id);
          console.log('[OneSignal] External user ID set:', user.id);

          // Check permission
          const permission = await OneSignal.Notifications.permission;
          console.log('[OneSignal] Current permission:', permission);
        });

      } catch (error) {
        console.error('[OneSignal] Initialization error:', error);
      }
    };

    initOneSignal();
  }, [isLoaded, user]);

  return null; // This is a utility component, no UI
}

