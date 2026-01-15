import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

interface UseDashboardRealtimeOptions {
  userId: string; // Can be Clerk user ID or database UUID
  onAssignmentsChange?: () => void;
  onStreaksChange?: () => void;
  onSessionsChange?: () => void;
  enabled?: boolean;
}


/**
 * Hook for real-time dashboard updates via Supabase Realtime
 * 
 * Subscribes to changes in:
 * - assignments (user_id filter)
 * - user_streaks (user_id filter)
 * - sessions (user_id filter) - optional
 * 
 * @example
 * ```tsx
 * useDashboardRealtime({
 *   userId: user.id,
 *   onAssignmentsChange: () => {
 *     // Refetch assignments or update local state
 *     refetchAssignments();
 *   },
 *   onStreaksChange: () => {
 *     // Refetch streaks
 *     refetchStreaks();
 *   }
 * });
 * ```
 */
export function useDashboardRealtime({
  userId,
  onAssignmentsChange,
  onStreaksChange,
  onSessionsChange,
  enabled = true
}: UseDashboardRealtimeOptions) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [dbUserId, setDbUserId] = useState<string | null>(null);

  // Resolve database user ID if needed
  useEffect(() => {
    if (!enabled || !userId) {
      setDbUserId(null);
      return;
    }

    // Check if userId is already a UUID (database user ID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    
    if (isUUID && !userId.startsWith('user_')) {
      // Already a database UUID
      setDbUserId(userId);
      return;
    }

    // If it's a Clerk ID, we need to look it up
    // For Supabase Realtime, we need the database UUID
    // Note: This requires RLS policies to allow the lookup, or we need an API endpoint
    // For now, we'll try to query Supabase directly (requires proper RLS setup)
    async function lookupDbUserId() {
      try {
        // Query users table via Supabase (requires RLS policy allowing read by clerk_user_id)
        const { data, error } = await supabase
          .from('users')
          .select('id')
          .eq('clerk_user_id', userId)
          .single();

        if (error || !data) {
          console.warn('Could not resolve database user ID for realtime subscription:', error);
          return;
        }

        setDbUserId(data.id);
      } catch (error) {
        console.error('Error looking up database user ID:', error);
      }
    }

    lookupDbUserId();
  }, [userId, enabled]);

  // Set up realtime subscription once we have the database user ID
  useEffect(() => {
    if (!enabled || !dbUserId) {
      return;
    }

    // Create a unique channel name for this user
    const channelName = `dashboard-updates-${dbUserId}`;
    
    // Subscribe to postgres changes
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'assignments',
          filter: `user_id=eq.${dbUserId}`
        },
        (payload) => {
          console.log('Assignment change detected:', payload);
          onAssignmentsChange?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_streaks',
          filter: `user_id=eq.${dbUserId}`
        },
        (payload) => {
          console.log('Streak change detected:', payload);
          onStreaksChange?.();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sessions',
          filter: `user_id=eq.${dbUserId}`
        },
        (payload) => {
          console.log('Session change detected:', payload);
          onSessionsChange?.();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Dashboard realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Dashboard realtime subscription error');
        } else if (status === 'TIMED_OUT') {
          console.warn('Dashboard realtime subscription timed out');
        }
      });

    channelRef.current = channel;

    // Cleanup on unmount
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [dbUserId, enabled, onAssignmentsChange, onStreaksChange, onSessionsChange]);
}




