

# Figma "Gaming Website by Andy" -- Full Visual Integration

## What the Figma Shows

The design features a gaming platform with:
- **Dark navy/indigo background** (#0F0F23 to #141432 range) -- warmer and deeper than the current near-black
- **Compact icon-only sidebar** (~70px wide) with rounded icons on hover/active states
- **Horizontal top navigation bar** with category links (adapted to: Live Matches, Challenges, Highlights, etc.)
- **User area in header**: avatar with level badge, notification bell, coins counter
- **Filter/control bar** with dropdown pills and list/grid view toggle
- **"Hot & New" hero carousel** with large image banners (full-width cards with game artwork)
- **"Trending" content grid** with image-heavy cards showing title, category, price/coins, platform icons
- **Rounded corners everywhere** (16-20px radius), clean spacing, soft glow accents (teal/cyan)
- **Color accent**: teal/cyan for active states and interactive elements, exactly matching the current primary

## Adaptation Strategy

Map the Figma's "game store" UI to OleBoy Token's gaming platform:
- "Hot & New" carousel becomes the **Hero/Featured Matches** banner section
- "Trending" grid becomes the **Live Matches** card grid
- Filter bar becomes the **match filters** (mode, region, platform, price)
- Sidebar icons map to existing navigation (Home, Matches, My Matches, Challenges, etc.)
- Top nav categories become quick-access links in the header

---

## Phase 1: Color & Background Update

### `src/index.css` -- Palette shift to match Figma's warmer indigo

The Figma uses a warmer, slightly more blue/purple background vs the current cold near-black. Update CSS variables:

| Token | Current | New | Why |
|-------|---------|-----|-----|
| `--background` | `240 10% 3.5%` (#08080D) | `245 40% 7%` (#0B0B1A) | Matches Figma's midnight base |
| `--background-elevated` | `240 8% 6%` | `245 35% 9%` (#0F0F23) | Figma's surface color |
| `--card` | `240 8% 6%` | `245 30% 11%` (#141432) | Warmer card surface |
| `--card-elevated` | `240 8% 8%` | `245 28% 14%` | Elevated state |
| `--secondary` | `240 6% 10%` | `245 25% 13%` | Subtle surface |
| `--muted` | `240 5% 12%` | `245 22% 16%` | Muted bg |
| `--border` | `240 6% 14%` | `245 18% 18%` | Slightly more visible borders |
| `--sidebar-background` | `240 10% 3%` | `245 40% 5.5%` | Deep sidebar |
| `--popover` | `240 8% 7%` | `245 35% 10%` | Popover bg |

Primary (cyan), accent (gold), success, destructive all stay the same -- they already match the Figma's teal/cyan accent.

### Background treatment
- Remove the current single subtle radial glow
- Add a very subtle warm indigo gradient: `radial-gradient(ellipse 80% 60% at 50% 0%, rgba(124,58,237,0.03), transparent 60%)` -- slight violet tint at top
- Keep noise texture at 3% opacity

---

## Phase 2: Sidebar -- Compact Icon Style (Figma layout)

### `src/components/layout/Sidebar.tsx` -- Major rework

The Figma shows a narrow (~70px) icon-only sidebar with:
- Logo/icon at top
- Vertical icon navigation with rounded hover backgrounds
- Active state: filled/highlighted icon background
- No text labels visible (icon-only, no "lg:w-[300px]" expansion)

Changes:
- Remove the `lg:w-[300px]` dual-width system -- make sidebar always **80px** wide (icon-only)
- Remove group labels ("Core", "Discover", "Account"), text labels, and the `hidden lg:block` pattern
- Each nav item: centered icon in a **48px rounded-xl** container
- Active state: `bg-primary/15 text-primary` filled background (like Figma's highlighted icons)
- Hover: `bg-white/[0.06]` soft highlight
- Remove the left cyan bar indicator -- use filled background instead (Figma style)
- Keep tooltips on hover to show labels (using existing Tooltip component)
- Bottom actions ("Create Match", "Buy Coins"): icon-only buttons with tooltips
- Logo area: just the logo image, centered, no text

### `src/components/layout/MainLayout.tsx`
- Change `lg:pl-[300px]` to `lg:pl-20` (80px sidebar)
- This gives the content area much more space (matching the Figma's wide content area)

### `src/components/layout/Header.tsx`
- Add horizontal category quick-links on desktop (left side, after search): "Matches", "Challenges", "Highlights", "Leaderboard" -- small text links with hover underline
- User area (right): stays the same but matches Figma's grouping (avatar with ring, coins pill, bell icon)
- Remove the `lg:max-w-[calc(1400px+4rem)]` constraint -- let it fill full width

---

## Phase 3: Home Page -- Figma "Hot & New" + "Trending" Layout

### `src/components/home/HeroCompact.tsx` -- "Hot & New" Banner Style

Replace the current giant typography hero with a **Figma-style hero banner**:
- Large banner card (~400px tall) with the VideoBanner content inside
- Overlay text: "OLEBOY TOKEN" title + "The competitive Fortnite platform" subtitle
- CTA buttons overlaid on the banner (bottom-left or centered)
- Rounded-2xl corners, subtle border
- Section label above: "Hot & New" or "Featured" in small caps

### `src/pages/Index.tsx` -- Restructure to match Figma

New layout structure:
1. **Filter/Control bar** at top (horizontal pills for mode/region + view toggle)
2. **"Hot & New" section**: full-width hero banner (VideoBanner integrated)
3. **"Live Matches" section**: grid of match cards (Figma's "Trending" equivalent)
4. **Stats/Progress below** (compact)

Remove the current 2-column split. Use full-width sections stacked vertically, matching the Figma's single-column scrollable layout.

### `src/components/home/LiveMatchesCompact.tsx`
- Remove the wrapping Card container -- show matches directly in a grid
- Section title "Live Matches" with "View All" link (Figma style: bold left, link right)
- Grid: 4-5 columns on desktop (Figma shows 5 cards per row)

---

## Phase 4: Match Cards -- Figma "Trending" Card Style

### `src/components/matches/MatchCard.tsx` -- Visual rework

The Figma shows game cards with:
- **Image/visual area** at top (60% of card height)
- **Info area** below: title, category/genre, price, platform icons
- Rounded-xl, subtle border, clean layout

Adapted for matches:
- Top section: colored gradient or pattern background (based on mode: 1v1=cyan, 2v2=violet, etc.) with large mode text overlay
- Bottom section: entry fee + prize (with coin icons), region/platform badges
- Remove the current "First To" giant number -- integrate it into the title line (e.g., "1V1 BOX FIGHT -- FT3")
- JOIN button: full-width gold at bottom (keep current)
- Card height: more compact, image-like proportions

---

## Phase 5: Radius & Spacing Adjustments

### `tailwind.config.ts`
- `--radius`: change to `1rem` (16px) -- matches Figma's rounded corners
- Add utility for `rounded-2xl` cards (20px)

### Global spacing
- Cards gap: `gap-4` (16px) for the grid (Figma uses tight grid)
- Section spacing: `gap-8` between sections
- Card padding: `p-4` internal (16px)

---

## Phase 6: Filter/Control Bar Component (New)

### New: `src/components/home/FilterBar.tsx`

A horizontal bar matching the Figma's filter row:
- Pill-style dropdown buttons: "Mode", "Region", "Platform", "Entry Fee"
- Right side: list/grid view toggle icons
- Background: subtle card surface with rounded-xl, border
- This is purely visual/decorative on the home page (filters are functional on /matches page already)

---

## Phase 7: Minor Component Touch-ups

### `src/components/home/StatsBar.tsx`
- Keep but adjust to Figma's cleaner style: remove backdrop-blur, use solid card bg

### `src/components/home/ProgressCard.tsx`
- Simplify gradient backgrounds to solid card colors

### `src/components/home/WalletSnapshot.tsx`, `LeaderboardCompact.tsx`
- Replace `card-glass` with solid card backgrounds
- Clean up glow effects

### `src/components/layout/BottomNav.tsx`
- Update active states to match Figma: filled background instead of dots/underlines

### `src/components/ui/card.tsx`
- Ensure default card uses the new warmer indigo card color
- Border: `border-white/[0.06]` (Figma's subtle strokes)

---

## Files Summary

| File | Action | Scope |
|------|--------|-------|
| `src/index.css` | MODIFY | Warmer indigo palette, background gradient |
| `tailwind.config.ts` | MODIFY | Radius to 16px |
| `src/components/layout/Sidebar.tsx` | HEAVY MODIFY | Icon-only 80px sidebar |
| `src/components/layout/MainLayout.tsx` | MODIFY | pl-20 instead of pl-[300px] |
| `src/components/layout/Header.tsx` | MODIFY | Add category links, remove max-width |
| `src/components/home/HeroCompact.tsx` | HEAVY MODIFY | Banner-style hero |
| `src/pages/Index.tsx` | MODIFY | Full-width stacked layout |
| `src/components/home/LiveMatchesCompact.tsx` | MODIFY | Grid without card wrapper |
| `src/components/matches/MatchCard.tsx` | MODIFY | Figma card proportions |
| `src/components/home/FilterBar.tsx` | NEW | Filter/control bar |
| `src/components/home/StatsBar.tsx` | MINOR | Clean up glass effects |
| `src/components/home/ProgressCard.tsx` | MINOR | Solid card bg |
| `src/components/layout/BottomNav.tsx` | MINOR | Active state style |
| `src/components/ui/card.tsx` | MINOR | Ensure solid bg |

**Total: ~14 files (1 new, ~13 modified). Zero logic changes.**

The biggest visual impact comes from Phase 2 (compact sidebar) and Phase 3 (home page layout) -- these two changes alone transform the look to match the Figma's spatial feel. The warmer indigo palette in Phase 1 sets the mood.

