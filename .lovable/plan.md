

# Premium Redesign: Leaderboard, Match Cards, Highlights Voting

This plan covers 4 major areas: (1) Leaderboard complete rework with animated podium, (2) Live Match cards redesign, (3) My Matches card improvements, and (4) Highlights voting system with weekly spotlight. All changes are desktop-only (lg: >= 1024px), mobile remains untouched.

---

## 1. LEADERBOARD PAGE - Complete Rework

### What Changes

**Remove:**
- Right column with "Current Season" card (Season 1, Players count, Prize Pool)
- Right column with "Filter Options" card (All-Time, This Week, This Month)
- "X wins / Y matches" text from rows - show ONLY wins and coins

**Add:**
- Animated Top 3 Podium section above the list
- Full-width layout (no right panel) using the entire container width
- Search bar at the top
- Cleaner rows showing only: Rank, Avatar, Username, Wins, Coins Won, View Stats button

### Top 3 Podium Design

Layout inspired by the reference image (image-130): center podium with 1st place elevated in the middle, 2nd on the left, 3rd on the right.

```
     +--------+      +-----------+      +--------+
     |  2nd   |      |   1st     |      |  3rd   |
     | Silver |      |   Gold    |      | Bronze |
     | Avatar |      |  Avatar   |      | Avatar |
     | Name   |      |  Name     |      | Name   |
     | Wins   |      |  Wins     |      | Wins   |
     | Coins  |      |  Coins    |      | Coins  |
     +--------+      +-----------+      +--------+
```

- 1st: Gold gradient, larger avatar (96px), gold glow, crown icon, elevated position
- 2nd: Silver gradient, medium avatar (80px), subtle silver glow
- 3rd: Bronze gradient, medium avatar (80px), amber glow
- Entrance animation: cards rise from below with staggered delay (1st -> 2nd -> 3rd)
- 1st place has a subtle continuous shine/shimmer effect
- Hover: slight tilt + glow increase
- Numbers do a count-up animation on first render

### Ranking List (4th place and beyond)

- Full-width table/rows with generous height (72-80px per row)
- Columns: Rank # | Avatar + Username | Wins | Coins Won | View Stats
- Hover highlights with subtle border glow
- Remove "X matches" entirely - only show wins count and coins

### Technical Implementation

**File: `src/pages/Leaderboard.tsx`** - Complete rewrite of the desktop branch:
- Remove the `grid-cols-[1fr_320px]` desktop layout
- Replace with full-width single column
- Add `PodiumSection` component inline or extracted
- Entrance animations using CSS keyframes (no Framer Motion dependency needed - use CSS `@keyframes` with staggered `animation-delay`)
- Count-up effect via a simple `useCountUp` hook using `requestAnimationFrame`

**File: `src/index.css`** - Add podium-specific keyframes:
```css
@keyframes podium-rise {
  0% { opacity: 0; transform: translateY(60px) scale(0.95); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes shine-sweep {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
```

---

## 2. LIVE MATCH CARDS - Premium Redesign

### What Changes (reference: image-131 right side "Elite" style)

**Remove from card:**
- "FN Match" header text + swords icon
- "Players 0/2" count entirely
- "Dettagli" button
- Euro symbol (replace with coin icon)
- "Prize Pool" hero section with euro

**New card structure (cleaner, fewer elements):**
```
+-----------------------------------------+
|  [OPEN badge]                    [timer] |
|                                          |
|  2V2 REALISTIC          (title = size   |
|                           + mode)        |
|  [EU]  [META LOOT]       (badges)       |
|                                          |
|  FIRST TO                                |
|  FT 7                     (large)       |
|                                          |
|  ENTRY FEE         ->      PRIZE        |
|  [coin] 0.50              [coin] 0.95   |
|                                          |
|  [ ========= JOIN MATCH ========== ]     |
+-----------------------------------------+
```

**Key design choices:**
- Title combines team_size and mode: `"1V1 BOX FIGHT"` / `"2V2 REALISTIC"`
- Entry Fee and Prize use CoinIcon (no euro symbol)
- Arrow between entry and prize for visual flow
- Single CTA: "JOIN MATCH" (full-width, gold, large)
- Remove the separate "Dettagli" button from card (users click anywhere else for details)
- Region + Platform as small badges
- Timer/countdown stays
- Card size: ~420-480px wide in a 3-column grid on 1920

### Technical Implementation

**File: `src/components/matches/MatchCard.tsx`** - Complete rewrite:
- New card structure with unified title (`{team_size}V{team_size} {mode.toUpperCase()}`)
- Replace euro amounts with CoinDisplay component
- Remove "Players" stat box, remove "Dettagli" button
- Full-width JOIN MATCH CTA
- Click on card body navigates to details
- Hover: card glow + border accent animation
- Entry animation: count-up on numbers when card enters viewport (CSS only)

**File: `src/pages/Matches.tsx`** - Update grid:
- Change desktop grid from 4 columns to 3 on most viewports for larger cards
- `lg:grid-cols-3 xl:grid-cols-4` with minmax constraints
- Larger card sizing for 1920px

---

## 3. MY MATCHES CARDS - Premium Status + Avatar Fix

### What Changes (reference: image-132)

**Fix the "?" opponent avatar:**
- When match is completed/resolved, always show opponent avatar and username
- For team modes (2v2+), show only 2 avatars: team A creator vs team B first accepter
- If opponent data genuinely missing, show a styled placeholder (silhouette icon, not "?")

**Make LOST more visible:**
- "LOST" badge: red gradient background, slightly larger, with subtle red glow
- Card border gets a faint red tint when LOST
- "WON" badge: gold gradient with gold glow (already partially done, enhance it)

**Remove euro from stats:**
- Replace euro amounts with CoinDisplay/CoinIcon

### Technical Implementation

**File: `src/components/matches/MyMatchCard.tsx`** - Updates:
- Fix opponent display logic: for team modes, find captain_a and captain_b (or first participants of each team_side)
- Replace "?" AvatarFallback with a proper user silhouette icon
- Enhance LOST badge: `bg-gradient-to-r from-red-600 to-red-500 text-white` with `shadow-[0_0_15px_rgba(255,71,87,0.3)]`
- Enhance WON badge: `bg-gradient-to-r from-amber-500 to-yellow-400 text-black` with gold glow
- Replace all euro references with CoinDisplay component
- Card gets `border-l-4 border-destructive/50` when LOST, `border-l-4 border-accent/50` when WON

---

## 4. HIGHLIGHTS - Community Voting System + Weekly Winner

### Database Changes (New Table)

Create a `highlight_votes` table:

```sql
CREATE TABLE public.highlight_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  highlight_id uuid NOT NULL REFERENCES public.highlights(id) ON DELETE CASCADE,
  week_start date NOT NULL DEFAULT date_trunc('week', now())::date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, week_start)  -- One vote per user per week
);
```

Add `is_weekly_winner` and `winner_week` columns to highlights:
```sql
ALTER TABLE public.highlights 
  ADD COLUMN is_weekly_winner boolean DEFAULT false,
  ADD COLUMN winner_week date DEFAULT NULL;
```

RLS policies:
- SELECT: public (anyone can see votes)
- INSERT: authenticated users only
- DELETE: only own votes
- UPDATE: not allowed (switch = delete old + insert new via RPC)

Create RPC function `vote_highlight(p_highlight_id uuid)`:
- Checks if user already voted this week
- If voted on different highlight: moves vote (delete old, insert new)
- If voted on same highlight: removes vote (toggle)
- If no vote: inserts new vote
- Returns the action taken: 'voted', 'switched', 'unvoted'

Create RPC function `get_highlights_with_votes(p_week_start date)`:
- Returns highlights with vote counts and whether current user voted

Admin RPC `mark_weekly_winner(p_highlight_id uuid, p_week date)`:
- Sets is_weekly_winner = true, winner_week = p_week on the highlight
- Only callable by admin role

### UI Changes

**File: `src/pages/Highlights.tsx`** - Updates:
- Add "Weekly Spotlight" banner at top showing the current week's top voted highlight
- Text: "Top voted this week - Weekly prize awarded manually by staff"
- Crown icon + gold glow on the spotlight card
- Grid cards now include vote button and count

**File: `src/components/highlights/HighlightCard.tsx`** - Updates:
- Add vote button (heart/star icon) with count
- States: not voted (outline), voted (filled + glow + "Your vote" tag)
- Vote animation: pop + brief glow on vote, fade on unvote
- Show vote count next to the button

**New File: `src/hooks/useHighlightVotes.ts`**:
- Hook to manage voting state
- Calls `vote_highlight` RPC
- Tracks current user's vote for the week
- Returns `{ userVotedHighlightId, voteCount, vote, isVoting }`

**Admin panel addition** (in `src/pages/Admin.tsx` or new tab):
- Simple section: "Weekly Highlights" showing top 10 by votes
- Button "Mark as Winner" per highlight
- Calls `mark_weekly_winner` RPC

---

## FILES SUMMARY

### New Files
| File | Purpose |
|------|---------|
| `src/hooks/useHighlightVotes.ts` | Hook for voting logic |

### Modified Files
| File | Changes |
|------|---------|
| `src/index.css` | Add podium animation keyframes, count-up utility |
| `src/pages/Leaderboard.tsx` | Complete desktop rewrite: podium + clean list |
| `src/components/matches/MatchCard.tsx` | Premium redesign: unified title, coins, no euro, single CTA |
| `src/components/matches/MyMatchCard.tsx` | Fix opponent avatar, enhance LOST/WON badges, coins |
| `src/pages/Matches.tsx` | Adjust grid columns for larger cards |
| `src/pages/Highlights.tsx` | Add voting UI, weekly spotlight banner |
| `src/components/highlights/HighlightCard.tsx` | Add vote button/count, animations |
| `src/pages/Admin.tsx` | Add weekly winner management section |

### Database Migrations
1. Create `highlight_votes` table with unique constraint per user per week
2. Add `is_weekly_winner` and `winner_week` columns to `highlights`
3. Create `vote_highlight` RPC function
4. Create `get_highlights_with_votes` RPC function
5. Create `mark_weekly_winner` admin RPC function
6. Add RLS policies for `highlight_votes`
7. Enable realtime on `highlight_votes`

---

## DESIGN PRINCIPLES APPLIED

- All changes desktop-only (lg: breakpoint, useIsDesktop hook)
- Mobile layout 100% unchanged
- No euro symbols - only CoinIcon/CoinDisplay everywhere
- Premium animations via CSS keyframes (no new dependencies)
- Consistent card heights with min-h constraints
- Full-width layouts filling 1680px container on 1920 viewports
- Typography scaled for desktop readability

