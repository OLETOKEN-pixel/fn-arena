import { useState, useEffect, useCallback, useRef } from 'react';

export type SoundType = 'match_accepted' | 'ready_up' | 'result_declared';

interface SoundSettings {
  enabled: boolean;
  volume: number; // 0-100
}

const STORAGE_KEY = 'oleboy_sound_settings';
const DEFAULT_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 70,
};

// Simple beep sounds using Web Audio API (no external files needed)
const SOUND_FREQUENCIES: Record<SoundType, number[]> = {
  match_accepted: [523, 659, 784], // C5, E5, G5 chord
  ready_up: [440, 550], // A4, C#5
  result_declared: [392, 494, 587, 784], // G4 -> G5 fanfare
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
  const audioContextRef = useRef<AudioContext | null>(null);

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

  // Initialize audio context on user interaction
  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current = new AudioContextClass();
        // Resume context if suspended
        if (audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume();
        }
        setAudioUnlocked(true);
      }
    } catch (e) {
      console.error('Failed to create AudioContext:', e);
    }
  }, [audioUnlocked]);

  // Play a sound
  const playSound = useCallback((type: SoundType) => {
    if (!settings.enabled || prefersReducedMotion) return;
    if (!audioContextRef.current) {
      // Try to create context if not exists
      unlockAudio();
      if (!audioContextRef.current) return;
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const frequencies = SOUND_FREQUENCIES[type];
    const volume = settings.volume / 100 * 0.3; // Scale down for comfort

    frequencies.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      const startTime = ctx.currentTime + i * 0.1;
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.35);
    });
  }, [settings.enabled, settings.volume, prefersReducedMotion, unlockAudio]);

  // Test sound
  const testSound = useCallback(() => {
    unlockAudio();
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
