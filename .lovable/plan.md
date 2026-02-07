

# Community Highlights - Complete Frontend Rebuild

## Problem Analysis

The database layer is **already correct and stays as-is**:
- `highlight_votes` table with `UNIQUE(user_id, week_start)` constraint
- `vote_highlight` RPC handles vote/unvote/switch atomically
- RLS policies for SELECT (public), INSERT (authenticated), DELETE (own)
- Realtime subscription on `highlight_votes` table

The problems are **purely frontend**:
1. Vote button is a tiny star icon that looks cheap
2. Switch-vote happens silently (no confirmation modal)
3. No clear visual states for NOT_VOTED / VOTED_THIS / VOTED_OTHER
4. Info banner only shows when there are votes (should always be visible)
5. Weekly Spotlight conditionally hidden when no votes exist
6. No debounce protection on rapid clicks

## What Gets Rebuilt (Frontend Only)

No database changes needed. All modifications are to React components and the voting hook.

---

## File 1: `src/hooks/useHighlightVotes.ts` - Rewrite

**Changes:**
- Split the single `vote()` function into three explicit actions:
  - `castVote(highlightId)` - vote when user has NOT voted yet
  - `removeVote()` - unvote current selection
  - `switchVote(newHighlightId)` - move vote (called AFTER user confirms in modal)
- All three call the same `vote_highlight` RPC (backend handles logic) but the hook tracks the intent
- Add `isVotePending` flag per action to disable buttons during requests
- Add debounce: ignore calls if `isVoting` is already true
- Optimistic UI: update counts + user vote state immediately, rollback on error with toast
- Real-time: keep existing `postgres_changes` subscription on `highlight_votes` table - this auto-refreshes vote counts when ANY user votes (cross-tab, cross-user)
- Return a `getVoteState(highlightId)` helper that returns `'NOT_VOTED' | 'VOTED_THIS' | 'VOTED_OTHER'` for clean UI logic

---

## File 2: `src/components/highlights/HighlightCard.tsx` - Complete Rewrite

**New props interface:**
```
id, youtubeVideoId, title, createdAt, author, currentUserId, isAdmin,
onPlay, onEdit, onDelete,
voteCount, voteState ('NOT_VOTED' | 'VOTED_THIS' | 'VOTED_OTHER'),
onCastVote, onRemoveVote, onSwitchVote, isVoting
```

**Card structure (premium):**
- Thumbnail with aspect-video, hover play overlay (kept, improved)
- Title + author row (kept, improved sizing)
- Management dropdown (kept for owner/admin)
- **NEW: Vote Module** - a dedicated section at the bottom of the card, NOT a tiny icon

**Vote Module - 3 visual states:**

1. **NOT_VOTED** (user hasn't voted this week OR not logged in):
   - Full-width button: "VOTE" with star icon
   - Styled as outlined/ghost with hover glow
   - Vote count displayed next to button
   - If not logged in: button disabled with "Login to vote" tooltip

2. **VOTED_THIS** (user voted for THIS highlight):
   - Gold/accent background section with "YOUR VOTE" badge
   - Button changes to "REMOVE VOTE" (smaller, outlined, muted)
   - Vote count prominent with gold accent
   - Subtle gold border glow on entire card

3. **VOTED_OTHER** (user already voted for a DIFFERENT highlight):
   - Button: "SWITCH VOTE" with swap icon
   - Clicking triggers the switch-vote confirmation modal (handled by parent)
   - Vote count displayed normally

**Animations:**
- Vote count changes: CSS transition on opacity/transform for number swap
- Card border: transition-colors for gold glow when voted
- Button hover: subtle glow + scale(1.02)
- Button press: scale(0.98)

---

## File 3: `src/pages/Highlights.tsx` - Rewrite

**Layout structure (top to bottom):**

### Section 1: Header Bar
- Title "Community Highlights" with YouTube icon
- "Add Your Highlight" CTA button (right aligned)
- Tabs: All Highlights / My Highlights

### Section 2: Info Banner (ALWAYS VISIBLE - never conditionally hidden)
- Premium card with gradient background
- Three info items with icons:
  - "Share your best plays" (video icon)
  - "1 vote per week - you can change it anytime" (vote/star icon)  
  - "Weekly prize awarded manually by staff" (crown icon)
- Compact but visually rich, always present at top of content

### Section 3: Weekly Spotlight (only shown when votes exist)
- Card showing the current top-voted highlight
- Crown icon, title, vote count, "Watch" button
- Gold accent styling

### Section 4: Video Grid
- 3 columns on desktop (`lg:grid-cols-3`), responsive on mobile
- Each card uses the new `HighlightCard` component with proper vote states

### Switch Vote Confirmation Modal
- `AlertDialog` that appears when user clicks "SWITCH VOTE" on a card
- Text: "You already voted for [current video title]. Move your vote to [new video title]?"
- Buttons: "Cancel" / "Switch Vote"
- On confirm: calls `switchVote(newHighlightId)` from hook
- State managed in Highlights.tsx: `switchTarget: Highlight | null`

### Delete Confirmation (kept as-is)

**Vote flow in parent:**
- `onCastVote(id)`: directly calls `castVote(id)` from hook
- `onRemoveVote()`: directly calls `removeVote()` from hook  
- `onSwitchVote(id)`: sets `switchTarget` state, opens confirmation modal. On confirm, calls hook's RPC

---

## Real-Time Behavior (Already Working - Kept)

The existing pattern is correct and stays:
1. `useHighlightVotes` subscribes to `postgres_changes` on `highlight_votes` table
2. Any INSERT/DELETE triggers `fetchVotes()` which recounts all votes for current week
3. This handles: cross-tab sync, multi-user updates, page refresh state

The only improvement: after a successful vote/unvote/switch, we do **optimistic UI first** (update local state immediately), then the realtime event arrives and confirms/corrects.

---

## Edge Cases Handled

1. **Double-click**: `isVoting` flag prevents concurrent calls; buttons disabled while pending
2. **Latency**: optimistic UI updates immediately; on error, rollback + refetch + toast
3. **Two tabs**: realtime subscription auto-syncs state across tabs
4. **Switch while pending**: button disabled during any vote operation
5. **Page refresh**: `fetchVotes()` runs on mount, restores correct `userVotedHighlightId`
6. **Server error**: try/catch with rollback to pre-optimistic state, premium toast with error message
7. **Negative counts**: `Math.max(0, count - 1)` prevents negative vote counts

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useHighlightVotes.ts` | Rewrite | Split vote into castVote/removeVote/switchVote, add debounce, keep realtime |
| `src/components/highlights/HighlightCard.tsx` | Rewrite | Premium vote module with 3 states, proper buttons, animations |
| `src/pages/Highlights.tsx` | Rewrite | Always-visible info banner, switch-vote modal, clean layout |
| `src/components/highlights/AddHighlightModal.tsx` | Keep | No changes needed |
| `src/components/highlights/VideoPlayerModal.tsx` | Keep | No changes needed |

No database migrations. No new tables. No RPC changes. Pure frontend rebuild.

