import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSoundNotifications } from '@/hooks/useSoundNotifications';
import { toast } from 'sonner';

interface GlobalMatchEventListenerProps {
  userId: string;
}

/**
 * Global listener for match events (player_joined, ready, all_ready, team_ready).
 * Plays audio notifications when the current user is targeted by an event.
 * This works on ANY page, not just MatchDetails.
 */
export function GlobalMatchEventListener({ userId }: GlobalMatchEventListenerProps) {
  const { playSound, unlockAudio, audioUnlocked } = useSoundNotifications();
  const hasUnlockedRef = useRef(false);

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
          const event = payload.new as {
            id: string;
            match_id: string;
            event_type: string;
            actor_user_id: string | null;
            target_user_ids: string[];
            payload: Record<string, unknown>;
            created_at: string;
          };

          // Only process events where current user is targeted
          if (!event.target_user_ids?.includes(userId)) {
            return;
          }

          // Don't notify the user about their own actions
          if (event.actor_user_id === userId) {
            return;
          }

          // Play sound and show toast based on event type
          switch (event.event_type) {
            case 'player_joined':
              playSound('match_accepted');
              toast.info('Un giocatore è entrato nel tuo match!', {
                description: 'Vai alla pagina del match per continuare.',
                duration: 5000,
              });
              break;

            case 'ready':
              playSound('ready_up');
              toast.info('L\'avversario è pronto!', {
                description: 'Clicca Ready per iniziare il match.',
                duration: 5000,
              });
              break;

            case 'team_ready':
              playSound('ready_up');
              toast.info('Il team avversario è pronto!', {
                description: 'Preparati per il match.',
                duration: 5000,
              });
              break;

            case 'all_ready':
              playSound('match_accepted');
              toast.success('Match iniziato!', {
                description: 'Tutti i giocatori sono pronti. Buona fortuna!',
                duration: 5000,
              });
              break;

            case 'result_declared':
              playSound('result_declared');
              toast.info('Risultato dichiarato', {
                description: 'L\'avversario ha dichiarato il risultato.',
                duration: 5000,
              });
              break;

            default:
              // Unknown event type, still play notification sound
              playSound('match_accepted');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, playSound]);

  // This component renders nothing - it's purely for side effects
  return null;
}
