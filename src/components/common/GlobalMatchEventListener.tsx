import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSoundNotifications, SoundType } from '@/hooks/useSoundNotifications';
import { toast } from 'sonner';

interface GlobalMatchEventListenerProps {
  userId: string;
}

interface MatchEvent {
  id: string;
  match_id: string;
  event_type: string;
  actor_user_id: string | null;
  target_user_ids: string[];
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * Global listener for match events (player_joined, ready, all_ready, team_ready).
 * Plays audio notifications when the current user is targeted by an event.
 * This works on ANY page, not just MatchDetails.
 * 
 * Uses BOTH realtime subscription AND polling fallback for 100% reliability.
 */
export function GlobalMatchEventListener({ userId }: GlobalMatchEventListenerProps) {
  const { playSound, unlockAudio, audioUnlocked } = useSoundNotifications();
  const hasUnlockedRef = useRef(false);
  const processedEventIdsRef = useRef<Set<string>>(new Set());
  const lastSeenTimestampRef = useRef<string>(new Date(Date.now() - 30000).toISOString());

  // Unlock audio on first interaction (global)
  useEffect(() => {
    if (audioUnlocked || hasUnlockedRef.current) return;

    const handleFirstInteraction = () => {
      if (hasUnlockedRef.current) return;
      hasUnlockedRef.current = true;
      unlockAudio();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    document.addEventListener('touchstart', handleFirstInteraction);

    return () => {
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('keydown', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };
  }, [unlockAudio, audioUnlocked]);

  // Process a single event (shared logic for realtime and polling)
  const processEvent = useCallback((event: MatchEvent) => {
    // Skip if already processed
    if (processedEventIdsRef.current.has(event.id)) {
      return;
    }

    // Only process events where current user is targeted
    if (!event.target_user_ids?.includes(userId)) {
      return;
    }

    // Don't notify the user about their own actions
    if (event.actor_user_id === userId) {
      return;
    }

    // Mark as processed
    processedEventIdsRef.current.add(event.id);
    
    // Keep set size manageable (max 100 entries)
    if (processedEventIdsRef.current.size > 100) {
      const arr = Array.from(processedEventIdsRef.current);
      processedEventIdsRef.current = new Set(arr.slice(-50));
    }

    // Play sound and show toast based on event type
    let soundType: SoundType = 'match_accepted';
    let toastTitle = '';
    let toastDescription = '';
    let toastType: 'info' | 'success' = 'info';

    switch (event.event_type) {
      case 'player_joined':
        soundType = 'match_accepted';
        toastTitle = 'Un giocatore è entrato nel tuo match!';
        toastDescription = 'Vai alla pagina del match per continuare.';
        break;

      case 'ready':
        soundType = 'ready_up';
        toastTitle = 'L\'avversario è pronto!';
        toastDescription = 'Clicca Ready per iniziare il match.';
        break;

      case 'team_ready':
        soundType = 'ready_up';
        toastTitle = 'Il team avversario è pronto!';
        toastDescription = 'Preparati per il match.';
        break;

      case 'all_ready':
        soundType = 'match_accepted';
        toastTitle = 'Match iniziato!';
        toastDescription = 'Tutti i giocatori sono pronti. Buona fortuna!';
        toastType = 'success';
        break;

      case 'result_declared':
        soundType = 'result_declared';
        toastTitle = 'Risultato dichiarato';
        toastDescription = 'L\'avversario ha dichiarato il risultato.';
        break;

      default:
        soundType = 'match_accepted';
        toastTitle = 'Notifica match';
        toastDescription = 'Nuovo evento nel tuo match.';
    }

    playSound(soundType);
    
    if (toastType === 'success') {
      toast.success(toastTitle, { description: toastDescription, duration: 5000 });
    } else {
      toast.info(toastTitle, { description: toastDescription, duration: 5000 });
    }
  }, [userId, playSound]);

  // Subscribe to match_events table for realtime notifications
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`global-match-events-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events',
        },
        (payload) => {
          const event = payload.new as MatchEvent;
          processEvent(event);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, processEvent]);

  // Polling fallback for 100% reliability (runs every 3 seconds)
  useEffect(() => {
    if (!userId) return;

    const pollEvents = async () => {
      try {
        const { data, error } = await supabase
          .from('match_events')
          .select('*')
          .contains('target_user_ids', [userId])
          .gt('created_at', lastSeenTimestampRef.current)
          .order('created_at', { ascending: true })
          .limit(10);

        if (error) {
          console.warn('Polling match_events failed:', error.message);
          return;
        }

        if (data && data.length > 0) {
          for (const event of data) {
            processEvent(event as MatchEvent);
          }
          // Update last seen timestamp to the most recent event
          lastSeenTimestampRef.current = data[data.length - 1].created_at;
        }
      } catch (e) {
        console.warn('Polling match_events error:', e);
      }
    };

    // Initial poll
    pollEvents();

    // Set up interval
    const interval = setInterval(pollEvents, 3000);

    return () => {
      clearInterval(interval);
    };
  }, [userId, processEvent]);

  // This component renders nothing - it's purely for side effects
  return null;
}
