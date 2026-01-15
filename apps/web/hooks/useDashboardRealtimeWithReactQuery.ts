/**
 * Alternative version using React Query (if you install @tanstack/react-query)
 * 
 * To use this version:
 * 1. Install: npm install @tanstack/react-query
 * 2. Wrap your app with QueryClientProvider (see example below)
 * 3. Use this hook instead of useDashboardRealtime
 * 
 * @example Setup in app/layout.tsx:
 * ```tsx
 * import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
 * 
 * const queryClient = new QueryClient();
 * 
 * export default function RootLayout({ children }) {
 *   return (
 *     <QueryClientProvider client={queryClient}>
 *       {children}
 *     </QueryClientProvider>
 *   );
 * }
 * ```
 */

import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useQueryClient } from '@tanstack/react-query';

interface UseDashboardRealtimeWithReactQueryOptions {
  userId: string; // Database user ID (UUID), not Clerk ID
  enabled?: boolean;
}

export function useDashboardRealtimeWithReactQuery({
  userId,
  enabled = true
}: UseDashboardRealtimeWithReactQueryOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }

    // Create a unique channel name for this user
    const channelName = `dashboard-updates-${userId}`;
    
    // Subscribe to postgres changes
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'assignments',
          filter: `user_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'assignments'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_streaks',
          filter: `user_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'streaks'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `user_id=eq.${userId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'sessions'] });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Dashboard realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Dashboard realtime subscription error');
        }
      });

    // Cleanup on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, enabled, queryClient]);
}



