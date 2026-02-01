
# Comprehensive Fix Plan: Match Audio, Realtime Events, UI/English, and Premium Polish

## Executive Summary

This plan addresses all critical bugs and UI issues including the missing `emit_match_event` function (if being called elsewhere), adds a real-time match event system for audio notifications, translates all Italian strings to English, enhances the sound notification system to use the uploaded MP3 file, fixes social icon colors, and ensures premium UI consistency.

---

## 1. CRITICAL: Match Events Table & RPC for Audio Notifications

### Problem Analysis
The user mentions an error about `emit_match_event` not existing. While my search didn't find this being called in the current codebase, we need to create a robust real-time event system for match audio notifications.

### Solution: Create Match Events Infrastructure

#### Database Migration

```sql
-- Create match_events table for real-time audio triggers
CREATE TABLE IF NOT EXISTS public.match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'match_created',
    'player_joined',
    'team_ready',
    'all_ready',
    'match_started',
    'result_declared'
  )),
  actor_user_id uuid,
  target_user_ids uuid[] NOT NULL DEFAULT '{}',
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;

-- RLS: Participants and admins can view match events
CREATE POLICY "Participants can view match events" ON public.match_events
  FOR SELECT
  USING (
    auth.uid() = ANY(target_user_ids)
    OR EXISTS (
      SELECT 1 FROM match_participants mp
      WHERE mp.match_id = match_events.match_id
      AND mp.user_id = auth.uid()
    )
    OR is_admin()
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_events;

-- Create emit_match_event RPC
CREATE OR REPLACE FUNCTION public.emit_match_event(
  p_match_id uuid,
  p_event_type text,
  p_actor_user_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_users uuid[];
  v_event_id uuid;
BEGIN
  -- Get all participants of the match as targets (excluding actor)
  SELECT array_agg(mp.user_id)
  INTO v_target_users
  FROM match_participants mp
  WHERE mp.match_id = p_match_id
    AND (p_actor_user_id IS NULL OR mp.user_id != p_actor_user_id);

  -- Insert the event
  INSERT INTO match_events (match_id, event_type, actor_user_id, target_user_ids, payload)
  VALUES (p_match_id, p_event_type, p_actor_user_id, COALESCE(v_target_users, '{}'), p_payload)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id);
END;
$$;
```

---

## 2. Enhanced Sound Notification System

### Current State
- `useSoundNotifications.ts` uses Web Audio API with synthesized beeps
- No actual MP3 file is being used

### Solution

#### A. Copy Uploaded Audio File to Project
```
user-uploads://notification-tone-443095.mp3 → public/sounds/notification.mp3
```

#### B. Update useSoundNotifications.ts

**Key Changes:**
1. Replace synthesized beeps with real MP3 audio playback
2. Preload audio on unlock for instant playback
3. Higher volume by default (0.9)
4. Works in background tabs after initial unlock

```typescript
// Key changes to useSoundNotifications.ts:

// Add audio element refs for preloaded sounds
const audioRef = useRef<HTMLAudioElement | null>(null);

// Preload the MP3 on unlock
const unlockAudio = useCallback(() => {
  if (audioUnlocked) return;
  try {
    audioRef.current = new Audio('/sounds/notification.mp3');
    audioRef.current.volume = settings.volume / 100;
    audioRef.current.preload = 'auto';
    // Trigger a silent play to unlock
    audioRef.current.play().then(() => {
      audioRef.current?.pause();
      audioRef.current!.currentTime = 0;
    });
    setAudioUnlocked(true);
  } catch (e) {
    console.error('Failed to preload audio:', e);
  }
}, [audioUnlocked, settings.volume]);

// Play sound using preloaded audio
const playSound = useCallback((type: SoundType) => {
  if (!settings.enabled || !audioRef.current) return;
  try {
    audioRef.current.currentTime = 0;
    audioRef.current.volume = settings.volume / 100;
    audioRef.current.play();
  } catch (e) {
    console.error('Failed to play sound:', e);
  }
}, [settings.enabled, settings.volume]);
```

#### C. Create Audio Enable Modal Component

**New File: `src/components/common/AudioEnableModal.tsx`**

```tsx
// Modal that appears when user first enters match area
// "Enable Match Sounds" button unlocks AudioContext
// Stores preference in localStorage
// Only shows once per session if dismissed
```

#### D. Update MatchDetails.tsx

**Add Realtime Subscription to match_events:**

```typescript
// Subscribe to match events for this match
useEffect(() => {
  if (!id || !user) return;
  
  const channel = supabase
    .channel(`match-events-${id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'match_events',
        filter: `match_id=eq.${id}`,
      },
      (payload) => {
        const event = payload.new as MatchEvent;
        
        // Only play sound if current user is a target
        if (event.target_user_ids?.includes(user.id)) {
          const soundMap: Record<string, SoundType> = {
            'player_joined': 'match_accepted',
            'team_ready': 'ready_up',
            'all_ready': 'match_accepted',
            'result_declared': 'result_declared',
          };
          
          const soundType = soundMap[event.event_type];
          if (soundType) {
            playSound(soundType);
          }
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [id, user, playSound]);
```

---

## 3. Translate All Italian Strings to English

### Files Requiring Updates

| File | Italian Text → English |
|------|----------------------|
| `Header.tsx` | "Accedi con Discord" → "Sign in with Discord" |
| `Auth.tsx` | "Torna alla Home" → "Back to Home" |
| `Auth.tsx` | "Accedi a OLEBOY TOKEN" → "Sign in to OLEBOY TOKEN" |
| `Auth.tsx` | "La piattaforma gaming per veri campioni" → "The gaming platform for true champions" |
| `Auth.tsx` | "Continua con Discord" → "Continue with Discord" |
| `Auth.tsx` | "Connessione..." → "Connecting..." |
| `Auth.tsx` | "Accedendo accetti i nostri" → "By signing in, you agree to our" |
| `Auth.tsx` | "Termini di Servizio" → "Terms of Service" |
| `Auth.tsx` | toast error text → "Unable to start Discord login. Please try again." |
| `MatchChat.tsx` | "Messaggio troppo lungo" → "Message too long" |
| `MatchChat.tsx` | "Il messaggio non può superare..." → "Message cannot exceed 500 characters" |
| `MatchChat.tsx` | "Errore" / "Impossibile inviare" → "Error" / "Failed to send message" |
| `MatchDetails.tsx` | "Solo partecipanti" → "Participants Only" |
| `MatchDetails.tsx` | "Questo match non è più pubblico..." → "This match is no longer public..." |
| `MatchDetails.tsx` | "Impossibile joinare" → "Unable to join" |
| `Profile.tsx` | "Solo lettere, numeri e underscore" → "Letters, numbers and underscores only" |
| `Profile.tsx` | "Errore durante il salvataggio" → "Error saving changes" |
| `Profile.tsx` | "Solo i membri VIP..." → "Only VIP members can change username..." |
| `TeamDetails.tsx` | "Impossibile eliminare il team" → "Unable to delete team" |
| `EpicCallback.tsx` | All Italian error messages → English equivalents |
| `DisputeManager.tsx` | "Partecipanti" → "Participants" |

---

## 4. Social Icons - Brand Colors & Visibility

### Current State
- Social icons in Header are monochrome with gold glow on hover
- Footer icons are styled correctly

### Solution: Update to Official Brand Colors

**Header.tsx Changes:**

```tsx
// X (Twitter) - Black icon (or dark mode: white)
<a
  href="https://x.com/oleboytokens"
  target="_blank"
  rel="noopener noreferrer"
  className="p-2 rounded-lg bg-black/10 hover:bg-black/20 transition-all duration-200"
>
  <XIcon className="text-foreground" />
</a>

// TikTok - Official brand colors (black + cyan/pink gradient effect on hover)
<a
  href="https://www.tiktok.com/@oleboytokens"
  target="_blank"
  rel="noopener noreferrer"
  className="p-2 rounded-lg bg-black/10 hover:bg-gradient-to-r hover:from-[#00f2ea] hover:to-[#ff0050] transition-all duration-200"
>
  <TikTokIcon className="text-foreground hover:text-white" />
</a>
```

---

## 5. Audio Enable Modal (First-Time Prompt)

### New Component: `AudioEnableModal.tsx`

```tsx
interface AudioEnableModalProps {
  open: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

// Premium modal with:
// - Icon/illustration
// - "Enable Match Sounds" title
// - Description explaining sounds for match events
// - Primary "Enable" button (calls onEnable)
// - Secondary "Maybe Later" link
// - Checkbox: "Don't show again" (stores in localStorage)
```

### Integration in MatchDetails.tsx

```tsx
// Show modal if:
// 1. User is in a match (isParticipant)
// 2. Audio is not yet unlocked (needsUnlock)
// 3. User hasn't dismissed permanently

const [showAudioModal, setShowAudioModal] = useState(false);

useEffect(() => {
  const dismissed = localStorage.getItem('audio_modal_dismissed');
  if (isParticipant && needsUnlock && !dismissed) {
    setShowAudioModal(true);
  }
}, [isParticipant, needsUnlock]);
```

---

## 6. Trigger Events in Match Flow RPCs

### Update Existing RPCs to Emit Events

**6A. join_match RPC - Add Event Emission**

After successful join:
```sql
-- Emit player_joined event
PERFORM emit_match_event(
  p_match_id,
  'player_joined',
  auth.uid(),
  jsonb_build_object('username', (SELECT username FROM profiles WHERE user_id = auth.uid()))
);
```

**6B. set_player_ready RPC - Add Event Emission**

When player becomes ready:
```sql
-- Emit team_ready event when a team becomes fully ready
IF v_team_all_ready THEN
  PERFORM emit_match_event(
    p_match_id,
    'team_ready',
    auth.uid(),
    jsonb_build_object('team_side', v_team_side)
  );
END IF;

-- Emit all_ready when match starts
IF v_all_ready THEN
  PERFORM emit_match_event(
    p_match_id,
    'all_ready',
    NULL,
    '{}'::jsonb
  );
END IF;
```

**6C. submit_team_declaration RPC - Add Event Emission**

When result is declared:
```sql
-- Emit result_declared event
PERFORM emit_match_event(
  p_match_id,
  'result_declared',
  auth.uid(),
  jsonb_build_object('result', p_result)
);
```

---

## 7. Compare Modal - Ensure Data Loads

### Current Issue
The `PlayerComparisonModal` shows "Unable to load comparison data" when RPCs fail.

### Solution

**7A. Add Robust Error Handling**

```typescript
const fetchStats = async () => {
  if (!user) return;
  setLoading(true);
  setError(null);

  try {
    const [myStatsRes, targetStatsRes, myRankRes, targetRankRes] = await Promise.all([
      supabase.rpc('get_player_stats', { p_user_id: user.id }),
      supabase.rpc('get_player_stats', { p_user_id: targetUserId }),
      supabase.rpc('get_player_rank', { p_user_id: user.id }),
      supabase.rpc('get_player_rank', { p_user_id: targetUserId }),
    ]);

    // Log any errors for debugging
    if (myStatsRes.error) console.error('My stats error:', myStatsRes.error);
    if (targetStatsRes.error) console.error('Target stats error:', targetStatsRes.error);

    // Handle partial data gracefully
    if (myStatsRes.data) setMyStats(myStatsRes.data as PlayerStats);
    if (targetStatsRes.data) setTargetStats(targetStatsRes.data as PlayerStats);
    if (myRankRes.data) setMyRank(Number(myRankRes.data));
    if (targetRankRes.data) setTargetRank(Number(targetRankRes.data));

    // Only show error if both failed
    if (!myStatsRes.data && !targetStatsRes.data) {
      setError('Failed to load stats. Please try again.');
    }
  } catch (e) {
    console.error('Error fetching comparison stats:', e);
    setError('An unexpected error occurred.');
  } finally {
    setLoading(false);
  }
};
```

**7B. Show Retry Button on Error**

```tsx
{error && (
  <div className="text-center py-8 space-y-3">
    <p className="text-muted-foreground">{error}</p>
    <Button variant="outline" onClick={fetchStats}>
      Retry
    </Button>
  </div>
)}
```

---

## 8. Premium UI Polish

### Consistent Button Animations

Add to `globals.css` or `index.css`:

```css
/* Premium button hover effects */
.btn-premium {
  @apply transition-all duration-200 hover:scale-[1.02] hover:shadow-lg;
}

.btn-glow-gold {
  @apply hover:shadow-amber-500/20;
}

/* Smooth modal transitions */
.modal-premium {
  @apply animate-in fade-in-0 zoom-in-95 duration-200;
}
```

### Social Icon Premium Styling

```tsx
// Circular buttons with brand backgrounds
<a className="w-10 h-10 rounded-full flex items-center justify-center
  bg-gradient-to-br from-[#00f2ea] to-[#ff0050] text-white
  hover:scale-110 transition-all duration-200 shadow-lg shadow-[#ff0050]/20">
  <TikTokIcon />
</a>
```

---

## Files to Modify/Create

| Priority | File | Action |
|----------|------|--------|
| 🔴 CRITICAL | SQL Migration | Create match_events table + emit_match_event RPC |
| 🔴 CRITICAL | `public/sounds/notification.mp3` | Copy uploaded file |
| 🔴 CRITICAL | `src/hooks/useSoundNotifications.ts` | Use MP3 instead of beeps |
| 🟡 HIGH | `src/pages/Auth.tsx` | All Italian → English |
| 🟡 HIGH | `src/components/layout/Header.tsx` | Italian text + social icon colors |
| 🟡 HIGH | `src/components/matches/MatchChat.tsx` | Italian → English |
| 🟡 HIGH | `src/pages/MatchDetails.tsx` | Italian → English + audio event subscription |
| 🟡 HIGH | `src/pages/Profile.tsx` | Italian → English |
| 🟡 HIGH | `src/pages/TeamDetails.tsx` | Italian → English |
| 🟡 HIGH | `src/pages/EpicCallback.tsx` | Italian → English |
| 🟡 HIGH | `src/components/admin/IssueCenter.tsx` | Italian → English |
| 🟡 HIGH | `src/components/matches/DisputeManager.tsx` | Italian → English |
| 🟢 MEDIUM | `src/components/common/AudioEnableModal.tsx` | New component |
| 🟢 MEDIUM | `src/components/player/PlayerComparisonModal.tsx` | Better error handling |
| 🟢 MEDIUM | SQL Migration | Update join_match, set_player_ready, submit_team_declaration to emit events |

---

## Testing Checklist

| Test | Expected Result |
|------|-----------------|
| Search "ma" in player search | Shows players with "ma" in username |
| Click Compare on a player | Modal loads with stats |
| Open Tip modal (non-VIP user) | Modal opens (error only on Send) |
| Join a match as opponent | Host hears notification sound |
| Ready up in match | Other players hear sound |
| Declare result | Other players hear sound |
| Tab in background during match | Sound still plays after unlock |
| All UI text | 100% English |
| Social icons in Header/Footer | TikTok (gradient), X (black/white) |
| Leaderboard | Ordered by earnings DESC |

---

## Technical Notes

### Browser Audio Constraints
- Chrome/Safari require user gesture to unlock AudioContext
- After unlock, audio works even in background tabs
- MP3 format is universally supported

### Realtime Subscription Architecture
- `match_events` table enables instant notifications via Supabase Realtime
- Target users receive events filtered by `target_user_ids`
- Events auto-cleanup can be handled via pg_cron if needed
