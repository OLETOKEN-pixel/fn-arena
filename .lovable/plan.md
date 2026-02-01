
# Fix Plan: Match "Ready Up" Blocking Error + Realtime Audio Notifications

## Problem Summary

The "Ready Up" functionality is blocked due to a **database function signature mismatch**:

**Current error:**
```
function emit_match_event(uuid, unknown, uuid, uuid[], jsonb) does not exist
```

**Root Cause:**
- The `set_player_ready` function in the database is calling `emit_match_event` with **5 arguments**:
  ```sql
  PERFORM emit_match_event(p_match_id, 'all_ready', v_user_id, v_all_participants, '{}'::jsonb);
  PERFORM emit_match_event(p_match_id, 'ready', v_user_id, v_targets, '{}'::jsonb);
  ```
- But `emit_match_event` only accepts **4 arguments** (no `target_user_ids` parameter)

---

## 1. Database Migration: Add 5-Argument Overload

Create a new PostgreSQL function that supports the 5-argument signature while preserving the existing 4-argument version.

### New Function Signature
```sql
CREATE OR REPLACE FUNCTION public.emit_match_event(
  p_match_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_target_user_ids uuid[],
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
```

### Implementation Details
- Insert into `match_events` table with the provided `target_user_ids` array
- Return the inserted event ID
- Use `SECURITY DEFINER` to allow RPC calls from client
- Both overloads can coexist (PostgreSQL supports function overloading)

### Migration File
Create: `supabase/migrations/[timestamp]_fix_emit_match_event_overload.sql`

```sql
-- Add 5-argument overload for emit_match_event
-- This version accepts explicit target_user_ids array
CREATE OR REPLACE FUNCTION public.emit_match_event(
  p_match_id uuid,
  p_event_type text,
  p_actor_user_id uuid,
  p_target_user_ids uuid[],
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  -- Insert the event with explicit target users
  INSERT INTO match_events (match_id, event_type, actor_user_id, target_user_ids, payload)
  VALUES (p_match_id, p_event_type, p_actor_user_id, COALESCE(p_target_user_ids, '{}'), p_payload)
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object('success', true, 'event_id', v_event_id);
END;
$$;
```

---

## 2. Update join_match_v2 to Emit Events

Currently `join_match_v2` does NOT emit any events. Add event emission after successful join.

### Changes to join_match_v2
Add at the end before `RETURN jsonb_build_object('success', true)`:

```sql
-- Emit player_joined event to notify match creator
PERFORM emit_match_event(
  p_match_id,
  'player_joined',
  v_caller_id,
  ARRAY[v_match.creator_id],
  jsonb_build_object('joined_user_id', v_caller_id)
);
```

---

## 3. Verify set_player_ready Event Emissions

The current `set_player_ready` already emits events:
- `'ready'` event when a player becomes ready (to other participants)
- `'all_ready'` event when all players are ready (to all participants)

After adding the 5-arg overload, these calls will work correctly.

---

## 4. Frontend: Add Realtime Subscription for Match Events + Audio

### Current State
- `useSoundNotifications.ts` exists and works correctly
- Audio file `public/sounds/notification.mp3` exists
- `AudioEnableModal` component exists but is optional (has "Maybe Later" button)

### Required Changes

**A. MatchDetails.tsx - Add match_events subscription:**

Add a new realtime subscription specifically for `match_events` table that:
1. Listens for INSERT events on `match_events` where `match_id = current match`
2. Checks if `target_user_ids` contains the current user
3. Plays the appropriate sound based on `event_type`

```typescript
// Add subscription to match_events for audio notifications
useEffect(() => {
  if (!id || !user) return;
  
  const channel = supabase
    .channel(`match-events-audio-${id}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'match_events',
        filter: `match_id=eq.${id}`,
      },
      (payload) => {
        const event = payload.new as {
          event_type: string;
          target_user_ids: string[];
          actor_user_id: string;
        };
        
        // Only play sound if current user is a target
        if (event.target_user_ids?.includes(user.id)) {
          playSound('match_accepted'); // Use same sound for all events
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [id, user, playSound]);
```

**B. Make Audio Mandatory (Auto-unlock on First Interaction):**

Update the audio system to be mandatory without settings toggle:
1. Remove the SoundSettings toggle UI from MatchDetails
2. Keep audio enabled by default (already the case with `enabled: true`)
3. Auto-unlock audio on first click anywhere on the page

Add to a global layout or App component:
```typescript
useEffect(() => {
  const handleFirstInteraction = () => {
    unlockAudio();
    document.removeEventListener('click', handleFirstInteraction);
    document.removeEventListener('keydown', handleFirstInteraction);
  };
  
  document.addEventListener('click', handleFirstInteraction);
  document.addEventListener('keydown', handleFirstInteraction);
  
  return () => {
    document.removeEventListener('click', handleFirstInteraction);
    document.removeEventListener('keydown', handleFirstInteraction);
  };
}, [unlockAudio]);
```

---

## 5. File Changes Summary

| File | Action |
|------|--------|
| `supabase/migrations/[new]_fix_emit_match_event.sql` | Create 5-arg overload + update join_match_v2 |
| `src/pages/MatchDetails.tsx` | Add match_events realtime subscription for audio |
| `src/hooks/useSoundNotifications.ts` | Minor: ensure volume is 1.0 by default |
| `src/App.tsx` or layout component | Add global first-interaction audio unlock |

---

## 6. Testing Checklist

| Test | Expected Result |
|------|-----------------|
| Click "Ready Up" button | No error, player becomes ready |
| Join a match as opponent | Host receives audio notification |
| All players ready up | All participants hear audio notification |
| Tab in background | Sound still plays after initial unlock |
| Works for 1v1, 2v2, 3v3, 4v4 | All team sizes emit events correctly |

---

## Technical Notes

### PostgreSQL Function Overloading
PostgreSQL allows multiple functions with the same name but different argument types/counts. Both the 4-arg and 5-arg versions of `emit_match_event` will coexist.

### Event Types
The `match_events` table CHECK constraint allows:
- `match_created`
- `player_joined`
- `team_ready`
- `all_ready`
- `match_started`
- `result_declared`

The `set_player_ready` function uses `'ready'` and `'all_ready'`. We need to add `'ready'` to the CHECK constraint OR change the event type to `'team_ready'`.

### Realtime Requirements
- `match_events` table is already added to `supabase_realtime` publication
- RLS policy allows participants to view events where they are in `target_user_ids`
