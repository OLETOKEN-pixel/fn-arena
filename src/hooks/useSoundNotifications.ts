import { useState, useEffect, useCallback, useRef } from 'react';

export type SoundType = 'match_accepted' | 'ready_up' | 'result_declared';

interface SoundSettings {
  enabled: boolean;
  volume: number; // 0-100
}

const STORAGE_KEY = 'oleboy_sound_settings';
const DEFAULT_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 90, // Higher default volume
};

export function useSoundNotifications() {
  const [settings, setSettings] = useState<SoundSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Check for reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  // Save settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save sound settings:', e);
    }
  }, [settings]);

  // Update audio volume when settings change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = settings.volume / 100;
    }
  }, [settings.volume]);

  // Initialize and preload audio on user interaction
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;

    try {
      // Create and preload the audio element
      audioRef.current = new Audio('/sounds/notification.mp3');
      audioRef.current.volume = settings.volume / 100;
      audioRef.current.preload = 'auto';
      
      // Trigger a silent play to unlock audio on mobile/Safari
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Immediately pause and reset
            audioRef.current?.pause();
            if (audioRef.current) {
              audioRef.current.currentTime = 0;
            }
            setAudioUnlocked(true);
          })
          .catch((e) => {
            console.warn('Audio unlock failed (may need user interaction):', e);
            // Still mark as unlocked - it may work on next user interaction
            setAudioUnlocked(true);
          });
      }
    } catch (e) {
      console.error('Failed to preload audio:', e);
    }
  }, [audioUnlocked, settings.volume]);

  // Play a sound
  const playSound = useCallback((type: SoundType) => {
    if (!settings.enabled || prefersReducedMotion) return;
    
    // If audio not unlocked yet, try to unlock first
    if (!audioRef.current) {
      try {
        audioRef.current = new Audio('/sounds/notification.mp3');
        audioRef.current.volume = settings.volume / 100;
      } catch (e) {
        console.error('Failed to create audio:', e);
        return;
      }
    }

    try {
      // Reset to beginning and play
      audioRef.current.currentTime = 0;
      audioRef.current.volume = settings.volume / 100;
      
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch((e) => {
          console.warn('Failed to play sound:', e);
        });
      }
    } catch (e) {
      console.error('Failed to play sound:', e);
    }
  }, [settings.enabled, settings.volume, prefersReducedMotion]);

  // Test sound
  const testSound = useCallback(() => {
    unlockAudio();
    // Small delay to ensure audio is unlocked
    setTimeout(() => playSound('match_accepted'), 100);
  }, [playSound, unlockAudio]);

  // Update settings
  const setEnabled = useCallback((enabled: boolean) => {
    setSettings(prev => ({ ...prev, enabled }));
  }, []);

  const setVolume = useCallback((volume: number) => {
    setSettings(prev => ({ ...prev, volume: Math.max(0, Math.min(100, volume)) }));
  }, []);

  return {
    settings,
    setEnabled,
    setVolume,
    playSound,
    testSound,
    audioUnlocked,
    unlockAudio,
    needsUnlock: !audioUnlocked && settings.enabled,
  };
}
