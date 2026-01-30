import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

export type MatchEventType = 'join' | 'ready' | 'all_ready' | 'declare';

interface MatchSoundContextType {
  audioUnlocked: boolean;
  unlockAudio: () => void;
  soundsEnabled: boolean;
  setSoundsEnabled: (enabled: boolean) => void;
  volume: number;
  setVolume: (vol: number) => void;
  playSound: (type: MatchEventType) => void;
}

const MatchSoundContext = createContext<MatchSoundContextType | null>(null);

const STORAGE_KEY = 'oleboy_match_sounds';

// Distinctive sound frequencies for each event type
const SOUND_CONFIGS: Record<MatchEventType, { frequencies: number[]; duration: number }> = {
  join: { frequencies: [523, 659, 784], duration: 0.4 },           // C5-E5-G5 chord - bright "ping"
  ready: { frequencies: [440, 550], duration: 0.25 },              // A4-C#5 double beep
  all_ready: { frequencies: [392, 494, 587, 784], duration: 0.6 }, // G4→G5 fanfare
  declare: { frequencies: [330, 415, 523], duration: 0.35 },       // E4-G#4-C5 attention grab
};

interface MatchSoundProviderProps {
  children: ReactNode;
}

export function MatchSoundProvider({ children }: MatchSoundProviderProps) {
  const { user } = useAuth();
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [soundsEnabled, setSoundsEnabledState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored).enabled !== false : true;
    } catch {
      return true;
    }
  });
  const [volume, setVolumeState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored).volume ?? 80 : 80;
    } catch {
      return 80;
    }
  });

  const audioContextRef = useRef<AudioContext | null>(null);

  // Persist settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: soundsEnabled, volume }));
    } catch {
      // Ignore storage errors
    }
  }, [soundsEnabled, volume]);

  // Unlock audio context (required for browser autoplay policy)
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        audioContextRef.current = new AudioCtx();
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
        setAudioUnlocked(true);
        console.log('[MatchSound] Audio context unlocked');
      }
    } catch (e) {
      console.error('[MatchSound] Failed to unlock audio:', e);
    }
  }, [audioUnlocked]);

  // Play sound immediately
  const playSound = useCallback((type: MatchEventType) => {
    if (!soundsEnabled) return;

    // Try to unlock if not yet done
    if (!audioContextRef.current) {
      unlockAudio();
      if (!audioContextRef.current) {
        console.warn('[MatchSound] Audio context not available');
        return;
      }
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const config = SOUND_CONFIGS[type];
    const vol = (volume / 100) * 0.5; // Scale for comfort (max 0.5 gain)

    console.log(`[MatchSound] Playing ${type} sound at volume ${volume}%`);

    config.frequencies.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

      // Envelope: quick attack, sustain, fade out
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.03);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + config.duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      const startTime = ctx.currentTime + i * 0.08;
      oscillator.start(startTime);
      oscillator.stop(startTime + config.duration + 0.05);
    });
  }, [soundsEnabled, volume, unlockAudio]);

  // Set enabled with state update
  const setSoundsEnabled = useCallback((enabled: boolean) => {
    setSoundsEnabledState(enabled);
    if (enabled && !audioUnlocked) {
      unlockAudio();
    }
  }, [audioUnlocked, unlockAudio]);

  // Set volume
  const setVolume = useCallback((vol: number) => {
    setVolumeState(Math.max(0, Math.min(100, vol)));
  }, []);

  // REALTIME SUBSCRIPTION - Global for logged-in user
  useEffect(() => {
    if (!user) return;

    console.log('[MatchSound] Setting up realtime subscription for user', user.id);

    const channel = supabase
      .channel('match-events-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events',
        },
        (payload) => {
          const event = payload.new as {
            event_type: MatchEventType;
            actor_user_id: string;
            target_user_ids: string[];
          };

          console.log('[MatchSound] Received event:', event);

          // Play sound if user is in target list AND not the actor
          if (
            event.target_user_ids?.includes(user.id) &&
            event.actor_user_id !== user.id
          ) {
            console.log('[MatchSound] Playing sound for event:', event.event_type);
            playSound(event.event_type);
          }
        }
      )
      .subscribe((status) => {
        console.log('[MatchSound] Subscription status:', status);
      });

    return () => {
      console.log('[MatchSound] Removing realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [user, playSound]);

  return (
    <MatchSoundContext.Provider
      value={{
        audioUnlocked,
        unlockAudio,
        soundsEnabled,
        setSoundsEnabled,
        volume,
        setVolume,
        playSound,
      }}
    >
      {children}
    </MatchSoundContext.Provider>
  );
}

export function useMatchSound() {
  const ctx = useContext(MatchSoundContext);
  if (!ctx) {
    throw new Error('useMatchSound must be used within MatchSoundProvider');
  }
  return ctx;
}
