
# Piano: Audio Notifications REALTIME (Zero Delay)

## Diagnosi del Problema Attuale

### Stato Corrente
L'hook `useSoundNotifications` esiste e funziona tecnicamente, MA:

| Problema | Causa |
|----------|-------|
| **`playSound` non viene mai chiamato** | In `MatchDetails.tsx` l'hook è importato (linea 39) ma `playSound()` non è mai invocato |
| **Nessun evento realtime dedicato** | La subscription esistente fa solo refetch dati ogni 350ms, non triggera audio |
| **Funziona solo sulla pagina match** | Se sei su `/` o `/matches`, non senti nulla |
| **Nessuna tabella eventi** | Non esiste `match_events`, quindi non c'è un flusso evento → suono |

---

## Architettura Proposta

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          CLIENT (Browser)                                │
├─────────────────────────────────────────────────────────────────────────┤
│  App.tsx                                                                 │
│    └── MatchSoundProvider (NUOVO - Context globale)                     │
│           ├── Subscription a match_events (realtime)                    │
│           ├── AudioContext + preloaded sounds                          │
│           ├── Permission banner se audio non sbloccato                  │
│           └── playSound('join' | 'ready' | 'all_ready' | 'declare')     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ Realtime Postgres Changes
┌─────────────────────────────────────────────────────────────────────────┐
│                          DATABASE (Supabase)                             │
├─────────────────────────────────────────────────────────────────────────┤
│  match_events (NUOVA TABELLA)                                           │
│    id uuid PK                                                            │
│    match_id uuid (indexed)                                               │
│    event_type enum: 'join' | 'ready' | 'all_ready' | 'declare'          │
│    actor_user_id uuid                                                    │
│    target_user_ids uuid[]  (chi deve ricevere il suono)                 │
│    payload jsonb                                                         │
│    created_at timestamp                                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▲ INSERT automatico
┌─────────────────────────────────────────────────────────────────────────┐
│  TRIGGER: on_match_event()                                               │
│    - join_match_v2: INSERT match_events (type='join')                   │
│    - set_player_ready: INSERT match_events (type='ready'/'all_ready')   │
│    - submit_team_declaration: INSERT match_events (type='declare')      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Database: Tabella `match_events`

### Migrazione SQL

```sql
-- 1. Crea tabella match_events
CREATE TABLE public.match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('join', 'ready', 'all_ready', 'declare')),
  actor_user_id uuid NOT NULL,
  target_user_ids uuid[] NOT NULL DEFAULT '{}',
  payload jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Index per query realtime
CREATE INDEX idx_match_events_match_id ON match_events(match_id);
CREATE INDEX idx_match_events_targets ON match_events USING GIN (target_user_ids);
CREATE INDEX idx_match_events_created ON match_events(created_at DESC);

-- 3. RLS: utenti possono vedere solo eventi dove sono nei target
ALTER TABLE match_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see events targeting them"
  ON match_events FOR SELECT
  USING (auth.uid() = ANY(target_user_ids) OR auth.uid() = actor_user_id);

-- 4. Abilita realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;

-- 5. Cleanup vecchi eventi (> 1 ora)
CREATE OR REPLACE FUNCTION cleanup_old_match_events()
RETURNS trigger AS $$
BEGIN
  DELETE FROM match_events WHERE created_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cleanup_match_events
  AFTER INSERT ON match_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_old_match_events();
```

---

## 2. Backend: Modificare RPC per Emettere Eventi

### `join_match_v2` - Evento JOIN

Alla fine della funzione, dopo INSERT in `match_participants`, aggiungere:

```sql
-- Notifica il creator che qualcuno ha joinato
INSERT INTO match_events (match_id, event_type, actor_user_id, target_user_ids, payload)
VALUES (
  p_match_id,
  'join',
  auth.uid(),
  ARRAY[v_match.creator_id],
  jsonb_build_object('actor_username', v_actor_username)
);
```

### `set_player_ready` - Evento READY / ALL_READY

```sql
-- Ottieni tutti i partecipanti tranne l'actor
SELECT array_agg(user_id) INTO v_targets
FROM match_participants
WHERE match_id = p_match_id AND user_id != auth.uid();

-- Se tutti ready, evento 'all_ready' a tutti
IF v_all_ready THEN
  SELECT array_agg(user_id) INTO v_all_targets
  FROM match_participants WHERE match_id = p_match_id;
  
  INSERT INTO match_events (match_id, event_type, actor_user_id, target_user_ids)
  VALUES (p_match_id, 'all_ready', auth.uid(), v_all_targets);
ELSE
  -- Altrimenti evento 'ready' agli altri
  INSERT INTO match_events (match_id, event_type, actor_user_id, target_user_ids)
  VALUES (p_match_id, 'ready', auth.uid(), v_targets);
END IF;
```

### `submit_team_declaration` - Evento DECLARE

```sql
-- Notifica l'altro team
SELECT array_agg(mp.user_id) INTO v_targets
FROM match_participants mp
WHERE mp.match_id = p_match_id
  AND mp.team_side != v_my_team_side;

INSERT INTO match_events (match_id, event_type, actor_user_id, target_user_ids, payload)
VALUES (
  p_match_id,
  'declare',
  auth.uid(),
  v_targets,
  jsonb_build_object('result', p_result, 'team_side', v_my_team_side)
);
```

---

## 3. Frontend: Provider Globale Audio

### Nuovo file: `src/contexts/MatchSoundContext.tsx`

```typescript
import { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './AuthContext';

type MatchEventType = 'join' | 'ready' | 'all_ready' | 'declare';

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

// Frequenze per suoni distintivi via Web Audio API
const SOUND_CONFIGS: Record<MatchEventType, { frequencies: number[]; duration: number }> = {
  join: { frequencies: [523, 659, 784], duration: 0.4 },           // C5-E5-G5 chord
  ready: { frequencies: [440, 550], duration: 0.25 },              // A4-C#5 double beep
  all_ready: { frequencies: [392, 494, 587, 784], duration: 0.6 }, // G4→G5 fanfare
  declare: { frequencies: [330, 415, 523], duration: 0.35 },       // E4-G#4-C5
};

export function MatchSoundProvider({ children }) {
  const { user } = useAuth();
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [soundsEnabled, setSoundsEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem('oleboy_match_sounds');
      return stored ? JSON.parse(stored).enabled !== false : true;
    } catch { return true; }
  });
  const [volume, setVolumeState] = useState(() => {
    try {
      const stored = localStorage.getItem('oleboy_match_sounds');
      return stored ? JSON.parse(stored).volume ?? 80 : 80;
    } catch { return 80; }
  });
  
  const audioContextRef = useRef<AudioContext | null>(null);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem('oleboy_match_sounds', JSON.stringify({ enabled: soundsEnabled, volume }));
    } catch {}
  }, [soundsEnabled, volume]);

  const unlockAudio = useCallback(() => {
    if (audioUnlocked) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx();
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      setAudioUnlocked(true);
    } catch (e) {
      console.error('Failed to unlock audio:', e);
    }
  }, [audioUnlocked]);

  const playSound = useCallback((type: MatchEventType) => {
    if (!soundsEnabled) return;
    if (!audioContextRef.current) {
      unlockAudio();
      if (!audioContextRef.current) return;
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const config = SOUND_CONFIGS[type];
    const vol = (volume / 100) * 0.5; // Scale for comfort

    config.frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.03);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + config.duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = ctx.currentTime + i * 0.08;
      osc.start(start);
      osc.stop(start + config.duration + 0.05);
    });
  }, [soundsEnabled, volume, unlockAudio]);

  // REALTIME SUBSCRIPTION - Global per utente loggato
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('match-events-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events',
          // Filter: solo eventi dove l'utente è nei target
          // NOTA: Supabase non supporta filter su array, quindi filtriamo client-side
        },
        (payload) => {
          const event = payload.new as {
            event_type: MatchEventType;
            actor_user_id: string;
            target_user_ids: string[];
          };

          // Se l'utente è nei target E non è lui stesso l'actor → suona
          if (
            event.target_user_ids?.includes(user.id) &&
            event.actor_user_id !== user.id
          ) {
            playSound(event.event_type);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, playSound]);

  return (
    <MatchSoundContext.Provider value={{
      audioUnlocked,
      unlockAudio,
      soundsEnabled,
      setSoundsEnabled,
      volume,
      setVolume: setVolumeState,
      playSound,
    }}>
      {children}
    </MatchSoundContext.Provider>
  );
}

export function useMatchSound() {
  const ctx = useContext(MatchSoundContext);
  if (!ctx) throw new Error('useMatchSound must be used within MatchSoundProvider');
  return ctx;
}
```

---

## 4. Integrazione in App.tsx

```typescript
import { MatchSoundProvider } from '@/contexts/MatchSoundContext';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MatchSoundProvider>  {/* NUOVO */}
          <TooltipProvider>
            ...
          </TooltipProvider>
        </MatchSoundProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

---

## 5. Banner "Enable Sounds" nel Header

### Modifica `Header.tsx`

Aggiungere banner persistente in alto se audio non sbloccato:

```tsx
import { useMatchSound } from '@/contexts/MatchSoundContext';

// Nel componente Header:
const { audioUnlocked, unlockAudio, soundsEnabled } = useMatchSound();

// Nel render, sopra la navbar:
{!audioUnlocked && soundsEnabled && user && (
  <div className="bg-accent/90 text-black px-4 py-2 text-center text-sm">
    <span className="mr-2">🔔 Enable match sounds to never miss an event!</span>
    <Button size="sm" variant="secondary" onClick={unlockAudio}>
      Enable Sounds
    </Button>
  </div>
)}
```

---

## 6. Aggiornare Sound Settings

Modificare `SoundSettings.tsx` per usare il nuovo context:

```typescript
import { useMatchSound } from '@/contexts/MatchSoundContext';

export function SoundSettings() {
  const { soundsEnabled, setSoundsEnabled, volume, setVolume, playSound, audioUnlocked, unlockAudio } = useMatchSound();
  
  const testSound = () => {
    if (!audioUnlocked) unlockAudio();
    setTimeout(() => playSound('join'), 100);
  };
  
  // ... rest of component
}
```

---

## 7. Rimuovere Vecchio Hook

Il file `src/hooks/useSoundNotifications.ts` può essere rimosso o deprecato, sostituito dal context globale.

---

## Riepilogo Modifiche

| Priorità | File/Componente | Azione |
|----------|-----------------|--------|
| 🔴 CRITICO | Migrazione SQL | Creare tabella `match_events` + RLS + realtime |
| 🔴 CRITICO | `join_match_v2` RPC | INSERT evento `join` |
| 🔴 CRITICO | `set_player_ready` RPC | INSERT evento `ready`/`all_ready` |
| 🔴 CRITICO | `submit_team_declaration` RPC | INSERT evento `declare` |
| 🟡 ALTO | `MatchSoundContext.tsx` | Nuovo context globale con subscription |
| 🟡 ALTO | `App.tsx` | Wrap con `MatchSoundProvider` |
| 🟡 ALTO | `Header.tsx` | Banner "Enable Sounds" |
| 🟢 MEDIO | `SoundSettings.tsx` | Usare nuovo context |
| 🟢 BASSO | `useSoundNotifications.ts` | Rimuovere (deprecato) |

---

## Test Obbligatori Post-Implementazione

| Test | Risultato Atteso |
|------|------------------|
| User A su `/`, User B joina match A | A sente suono IMMEDIATO |
| User A e B in match, A clicca Ready | B sente suono |
| Entrambi Ready | Entrambi sentono suono `all_ready` |
| User A dichiara risultato | B sente suono `declare` |
| Tab in background | Suono deve comunque arrivare |
| Audio non sbloccato | Banner visibile, click sblocca |
| Preferenze salvate | Reload mantiene settings |

---

## Note Tecniche

### Perché Tabella Eventi invece di Trigger su match_participants?

1. **Controllo target preciso**: Possiamo specificare CHI deve ricevere il suono
2. **Payload flessibile**: Possiamo includere username, risultato, etc.
3. **RLS semplice**: Filter basato su `target_user_ids` 
4. **Zero delay**: INSERT → Realtime → Client in <100ms
5. **Cleanup automatico**: Trigger rimuove eventi vecchi

### Volume Alto

Nel codice il volume è scalato a `0.5` massimo per evitare distorsione. L'utente può impostare fino a 100% che corrisponde a 0.5 audio gain (abbastanza forte senza essere fastidioso).
