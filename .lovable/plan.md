

# Fix Match System + Mandatory Global Audio Notifications

## Executive Summary

The match system is broken due to a **database constraint violation**. The `join_match_v2` function uses transaction type `'match_entry'` which is NOT allowed by the `transactions_type_check` constraint. Additionally, audio notifications only work when viewing a specific match page, not globally.

---

## ROOT CAUSE ANALYSIS

### BUG 1: Transaction Type Constraint Violation (CRITICAL BLOCKER)

**Error**: `new row for relation 'transactions' violates check constraint 'transactions_type_check'`

**Location**: `join_match_v2` function (deployed version)

**Problem Lines** (3 occurrences):
```sql
-- Line 94 (1v1 join):
INSERT INTO transactions (user_id, type, amount, description, match_id)
VALUES (v_caller_id, 'match_entry', -v_entry_fee, ...);

-- Line 152 (team cover mode):
VALUES (v_caller_id, 'match_entry', -v_total_cost, 'Team match entry (cover mode)', ...);

-- Line 160 (team split mode):
VALUES (v_member_id, 'match_entry', -v_entry_fee, 'Team match entry (split mode)', ...);
```

**Allowed Transaction Types** (from constraint):
- `'deposit'`
- `'lock'`
- `'unlock'`
- `'payout'`
- `'refund'`
- `'fee'`

**Solution**: Change all `'match_entry'` to `'lock'` (correct semantic for locking entry fee)

### BUG 2: Audio Only Works on MatchDetails Page

**Current State**:
- Audio subscription exists in `MatchDetails.tsx` (lines 261-298)
- Only listens when user is viewing a specific match
- If user is on `/matches` listing, they won't hear sounds when someone joins their created match

**Solution**: Create a **GlobalMatchEventListener** component mounted at app level

### System Working Correctly

**`set_player_ready` function**: ✅ Works correctly
- Emits `'ready'` event to other participants when a player becomes ready
- Emits `'all_ready'` event to all participants when match starts
- Uses 5-arg `emit_match_event` signature properly

**`emit_match_event` functions**: ✅ Both signatures exist
- 4-arg version (auto-targets all participants excluding actor)
- 5-arg version (explicit `target_user_ids` array)

**Audio unlock system**: ✅ Implemented in MainLayout
- Unlocks on first click/keydown/touchstart
- Works even in background tabs after unlock

---

## PHASE 1: DATABASE FIX (Highest Priority)

### Migration: Fix `join_match_v2` Transaction Types

Create new migration that replaces `'match_entry'` with `'lock'`:

```sql
-- =====================================================
-- Fix join_match_v2: Use valid transaction type 'lock'
-- instead of invalid 'match_entry'
-- =====================================================
-- The transactions table has a CHECK constraint that only allows:
-- 'deposit', 'lock', 'unlock', 'payout', 'refund', 'fee'
--
-- 'match_entry' is NOT a valid type and causes the join to fail.

CREATE OR REPLACE FUNCTION public.join_match_v2(
  p_match_id uuid,
  p_team_id uuid DEFAULT NULL,
  p_payment_mode text DEFAULT 'cover'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- [Full function body with 'lock' instead of 'match_entry']
-- Line 94, 152, 160 all changed to:
--   VALUES (..., 'lock', ...);
$$;
```

**Key Changes**:
1. Line 94: `'match_entry'` → `'lock'` (1v1 join)
2. Line 152: `'match_entry'` → `'lock'` (team cover mode)
3. Line 160: `'match_entry'` → `'lock'` (team split mode)

---

## PHASE 2: GLOBAL MATCH EVENT LISTENER

### New Component: `GlobalMatchEventListener.tsx`

```text
Location: src/components/common/GlobalMatchEventListener.tsx

Purpose:
- Subscribe to match_events table globally
- Play audio when user is targeted by an event
- Works on ANY page, not just MatchDetails
```

**Implementation Details**:

```typescript
// Mount in AuthContext or App.tsx when user is logged in
// Subscribe to match_events where target_user_ids contains current user
// Play sound based on event_type:
//   - 'player_joined' → notification sound
//   - 'ready' → notification sound
//   - 'all_ready' → notification sound
//   - 'team_ready' → notification sound
```

### Integration Point

Add to `AuthContext.tsx` or create wrapper component:

```typescript
// When user is authenticated, render:
<GlobalMatchEventListener userId={user.id} />
```

---

## PHASE 3: AUDIO SYSTEM VERIFICATION

### Current Working Implementation

**`useSoundNotifications.ts`**:
- ✅ Uses MP3 file from `/sounds/notification.mp3`
- ✅ Preloads audio on unlock
- ✅ Volume at 100% by default
- ✅ Works in background tabs after unlock

**`MainLayout.tsx`**:
- ✅ Global audio unlock on first interaction
- ✅ Listens for click/keydown/touchstart
- ✅ One-time unlock, no user toggle

**No changes needed** to the audio system itself.

---

## FILE CHANGES SUMMARY

| Priority | File | Action |
|----------|------|--------|
| 🔴 CRITICAL | `supabase/migrations/[new].sql` | Fix join_match_v2: change 'match_entry' → 'lock' |
| 🟡 HIGH | `src/components/common/GlobalMatchEventListener.tsx` | NEW: Global realtime subscription |
| 🟡 HIGH | `src/contexts/AuthContext.tsx` or `App.tsx` | Mount GlobalMatchEventListener |
| 🟢 OPTIONAL | `src/pages/MatchDetails.tsx` | Remove local audio subscription (now global) |

---

## EVENT FLOW AFTER FIX

```text
User A creates match
         ↓
User B clicks "Join Match"
         ↓
Frontend: supabase.rpc('join_match', { p_match_id })
         ↓
DB: join_match_v2(...) executes
         ↓
   ┌─────────────────────────────────────┐
   │ INSERT INTO transactions            │
   │ (user_id, type='lock', amount, ...) │ ← FIXED!
   └─────────────────────────────────────┘
         ↓
   INSERT INTO match_participants
         ↓
   PERFORM emit_match_event('player_joined', ...)
         ↓
   INSERT INTO match_events (target_user_ids = [A])
         ↓
   Realtime broadcast to all subscribers
         ↓
   GlobalMatchEventListener receives INSERT
         ↓
   Checks: target_user_ids includes A? YES
         ↓
   playSound('match_accepted')
         ↓
   User A hears notification! 🔊
```

---

## READY UP FLOW (Already Working)

```text
User B clicks "Ready Up"
         ↓
DB: set_player_ready(match_id)
         ↓
   UPDATE match_participants SET ready = true
         ↓
   Check: all_ready? NO (A not ready)
         ↓
   PERFORM emit_match_event('ready', B, [A], {})
         ↓
   User A receives event → plays sound
         ↓
User A clicks "Ready Up"
         ↓
   Check: all_ready? YES
         ↓
   UPDATE matches SET status = 'in_progress'
         ↓
   PERFORM emit_match_event('all_ready', A, [A,B], {})
         ↓
   Both users receive event → match started!
```

---

## TESTING CHECKLIST

| Test | Expected Result |
|------|-----------------|
| Click "Join Match" on 1v1 | ✅ Match joined, no DB error |
| Creator receives notification | ✅ Sound plays (on any page) |
| User B ready up in 1v1 | ✅ User A receives sound |
| Both ready in 1v1 | ✅ Match starts, both hear sound |
| 2v2 team join | ✅ Works with team, no errors |
| Tab in background | ✅ Sound still plays |

---

## TECHNICAL NOTES

### Why 'lock' is the Correct Type

The transaction represents an **entry fee being locked** in the user's wallet:
- `balance` decreases
- `locked_balance` increases
- Money is held until match concludes

This matches the semantic meaning of `'lock'` transaction type.

### Realtime Subscription Filter

The GlobalMatchEventListener should use:
```typescript
supabase
  .channel('global-match-events')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'match_events',
  }, ...)
```

Client-side filter checks `target_user_ids.includes(userId)` since Postgres filters don't support array contains.

### Audio File

The uploaded `notification-tone-443095-2.mp3` should be copied to `public/sounds/notification.mp3` to replace or update the existing sound file.

