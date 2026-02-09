

# Global Spline Background + Complete Red-Accent Redesign

## Overview

This plan applies a new Spline 3D scene as a global fullscreen background across every page, and transforms the entire UI from the current blue/gold palette to a "premium dark + red accent" design system that integrates visually with the Spline scene (dark grid with red accents). No logic, API calls, state management, or business flows will be touched.

---

## Phase 1: Global Spline Background Layer

### 1A. Create `src/components/common/SplineBackground.tsx` (NEW FILE)

A single global component mounted once in `App.tsx` (outside routes), responsible for:

- Dynamically loading the `@splinetool/viewer` script (same dedup pattern from SplineTest.tsx)
- Scene URL: `https://prod.spline.design/htiQwu8VrQ1i2Dz4/scene.splinecode`
- Renders as `position: fixed; inset: 0; z-index: 0; pointer-events: none`
- Shows a dark gradient fallback (`#0A0B0F` to `#0D0F14`) immediately while Spline loads
- Fade-in transition (400ms opacity) when Spline is ready
- Page Visibility API: hides the `<spline-viewer>` when tab is hidden (display: none), shows fallback gradient
- On error: stays on fallback gradient forever, no UI break
- Mobile: reduces opacity to 0.65 via CSS media query `@media (max-width: 768px)`

### 1B. Modify `src/App.tsx`

- Import and render `<SplineBackground />` as the first child inside the QueryClientProvider, before BrowserRouter
- This ensures it's always rendered on every page, including Auth, NotFound, etc.

### 1C. Modify `src/components/layout/MainLayout.tsx`

- Change the root div from `bg-background` to `bg-transparent` so the Spline background shows through
- Add `relative z-[1]` to ensure all content sits above the Spline layer

### 1D. Standalone pages (Auth, NotFound, SplineTest)

- Auth.tsx: Remove the custom background effects (gaming-pattern-bg, neon circles, floating particles, gradient overlays). The Spline background replaces all of this. Keep the card centered.
- NotFound.tsx: Remove `bg-background` and `gradient-radial` div. Let Spline show through.
- SplineTest.tsx: Keep its own local Spline viewer as-is (it's a test page with controls).

---

## Phase 2: Color System Redesign (Blue to Red)

### 2A. Modify `src/index.css` -- CSS Custom Properties (`:root` and `.dark`)

Replace the entire color palette. Key changes:

| Token | Old Value | New Value | Notes |
|-------|-----------|-----------|-------|
| `--background` | `225 25% 4%` | `230 20% 4%` | Slightly adjusted, mostly transparent now |
| `--card` | `225 22% 7%` | `0 0% 7% / 0.72` | Semi-transparent for glassmorphism over Spline |
| `--card-elevated` | `225 20% 9%` | `0 0% 9% / 0.78` | Slightly more opaque |
| `--primary` | `217 95% 65%` (blue) | `0 100% 59%` (#FF2D2D) | **Red accent** |
| `--primary-glow` | `217 95% 75%` | `0 100% 67%` (#FF4B4B) | Red hover glow |
| `--primary-foreground` | `225 25% 4%` | `0 0% 100%` | White text on red |
| `--ring` | `217 95% 65%` | `0 100% 59%` | Red focus rings |
| `--accent` | `45 95% 55%` (gold) | `45 95% 55%` | **Keep gold** for WON/prizes |
| `--destructive` | `0 85% 55%` | `0 75% 50%` | Slightly adjusted, distinct from primary |
| `--border` | `225 18% 16%` | `0 0% 14%` | Neutral + subtle red tint |
| `--border-glow` | `225 15% 22%` | `0 5% 20%` | Subtle red-tinted glow |
| `--electric-blue` | `217 95% 65%` | `0 100% 59%` | Renamed conceptually to "accent-red" but keep var name for compat |
| `--electric-blue-glow` | `217 100% 75%` | `0 100% 67%` | Red glow |
| `--success` | `152 80% 50%` | `152 80% 50%` | **Keep green** |
| `--sidebar-background` | `225 25% 4%` | `0 0% 4% / 0.88` | Semi-transparent sidebar |
| `--sidebar-primary` | `217 95% 65%` | `0 100% 59%` | Red active state |

The `.dark` block will mirror `:root` (app is always dark).

### 2B. Modify `src/index.css` -- Utility classes

Update all glow/shadow utilities:
- `.glow-blue` / `.glow-blue-soft` -> change HSL from blue to red
- `.glow-text-blue` -> red text shadow
- `.card-glow-blue` -> red card glow
- `.gradient-blue` -> red gradient
- `.gradient-hero` -> adjusted for new palette
- `.glass-header` -> use `rgba(10,11,15,0.85)` with backdrop-blur
- `.glass` / `.glass-premium` -> increase opacity slightly for readability over Spline
- `.card-premium` -> use `rgba(10,11,15,0.72)` + `backdrop-blur(14px)` + red-tinted border
- `.card-hover:hover` -> red border glow instead of blue
- `.btn-premium:hover` -> red glow shadow
- `.gaming-pattern-bg` -> use red accent instead of blue/gold
- `.gradient-radial` -> red tint instead of blue
- Animated border: red+gold gradient instead of blue+gold
- Focus states: red ring instead of blue

### 2C. Modify `tailwind.config.ts`

- Update `boxShadow` entries: `glow-blue` -> red HSL values, `glow-gold` stays
- Update `backgroundImage` gradients: replace blue HSL references with red
- Keep font families, spacing, border-radius, keyframes unchanged

---

## Phase 3: Component-Level Styling Updates

### 3A. Base UI Components (src/components/ui/)

**`button.tsx`:**
- `default` variant: `hover:shadow-glow-blue` -> keeps class name but now renders red (from CSS var change)
- `gold` variant: keep as-is (gold gradient for buy coins)
- `premium` variant: gradient from red instead of blue
- No logic changes

**`card.tsx`:**
- Add `backdrop-blur-xl` and make bg semi-transparent: `bg-card/[0.72] backdrop-blur-xl`
- Border: add subtle `border-white/[0.06]`
- Shadow: use updated premium shadow

**`input.tsx`:**
- Focus ring: already uses `--primary` which will now be red
- Hover border: uses `--border-glow` which will be red-tinted
- No code changes needed (inherits from CSS vars)

**`dialog.tsx`:**
- DialogOverlay: change `bg-black/80` to `bg-black/70 backdrop-blur-sm`
- DialogContent: add `backdrop-blur-xl bg-background/[0.88]` for more opaque modals that stand out from Spline

**`alert-dialog.tsx`:**
- Same treatment as dialog.tsx for overlay and content

**`select.tsx`:**
- SelectContent: add `backdrop-blur-xl bg-popover/[0.92]` for readability
- Already uses CSS vars for focus rings

**`tabs.tsx`:**
- TabsList: add `backdrop-blur-sm bg-muted/[0.7]`
- TabsTrigger active state: already uses `bg-background` which inherits new palette

**`dropdown-menu.tsx`:**
- DropdownMenuContent: add `backdrop-blur-xl bg-popover/[0.92]`

**`skeleton.tsx`:**
- `.skeleton-premium` keyframes already defined in CSS; will inherit new muted colors

**`badge.tsx` (Radix):**
- Uses CSS vars, will auto-update

**`toast.tsx` / `sonner.tsx`:**
- Will inherit new background colors from CSS vars

### 3B. Custom Components

**`custom-badge.tsx`:**
- `primary` variant uses `bg-primary/20 text-primary` -> will auto-become red
- No changes needed

**`CoinDisplay.tsx` / `CoinIcon.tsx`:**
- Keep gold styling (gold is for coins/money, distinct from red accent)

### 3C. Layout Components

**`Header.tsx`:**
- `glass-header` class already handles the semi-transparent header; will inherit new colors
- Social icon hover states: change `hover:text-foreground hover:bg-secondary/60` (already uses vars)
- Wallet button: border glow references `--primary` which is now red
- Discord sign-in button: keep `bg-[#5865F2]` (Discord brand color stays)

**`Sidebar.tsx`:**
- Background: `bg-sidebar` which is now `rgba(10,11,15,0.88)` with backdrop-blur
- Active nav item: references `--primary` -> auto-becomes red glow
- Active indicator bar: `bg-primary` -> red
- "Create Match" button: change `from-primary via-primary to-primary/80` gradient and its hover glow from blue to red
- "Buy Coins" button: keep gold gradient

**`BottomNav.tsx`:**
- `bg-background/90` -> semi-transparent, Spline shows through
- Active states: use `--primary` -> red
- Gradient accent line: `via-primary/40` -> red

**`Footer.tsx`:**
- `bg-sidebar` -> semi-transparent
- Navigation hovers: `hover:text-primary` -> red
- Social icons: `hover:text-accent hover:border-accent/50` -> keeps gold/accent

---

## Phase 4: Page-by-Page Styling Pass

Every page uses MainLayout (except Auth, NotFound, SplineTest). Since MainLayout gets `bg-transparent`, all pages will show Spline through. The key work is ensuring readability.

### Pages that need specific attention:

**`Index.tsx` (Home):**
- HeroCompact: remove custom gradient backgrounds (`bg-gradient-to-r from-primary/8`), let Spline show through. Keep text/buttons.
- StatsBar: ensure glass background for readability
- ProgressCard, WalletSnapshot: inherit card glass treatment
- VideoBanner: keep as-is (video is its own content)

**`Auth.tsx`:**
- Remove ALL custom background layers (gaming-pattern, neon circles, floating particles, gradient overlays)
- Card: increase opacity to `bg-card/[0.92] backdrop-blur-xl` for strong readability
- Keep Discord button brand color

**`Matches.tsx`:**
- Filter bar: already uses `bg-card/60 backdrop-blur-sm` -- adjust to `bg-card/[0.72] backdrop-blur-xl`
- Empty state: gradient icon bg -> use new red accent
- "Create Match" button: `glow-blue` -> now renders red via CSS

**`MyMatches.tsx`:**
- Tabs and match cards: inherit new card styling
- Empty state icon backgrounds: adjust to red accent

**`MatchDetails.tsx`:**
- Large page with many cards -- all inherit from Card component changes
- Status badges: inherit from custom-badge.tsx
- Result sections, proof uploads: inherit new styling

**`CreateMatch.tsx`:**
- Form card, inputs, selects: all inherit new styling
- Entry fee buttons: keep gold accent for coins

**`Wallet.tsx`:**
- Balance cards: `card-premium` -> auto-updates
- Gold card (Total Balance): keep `gradient-gold` styling
- Buy/Withdraw buttons: keep existing accent logic

**`Profile.tsx`:**
- Profile header card: add glass treatment
- Section nav: active state `bg-primary/10 text-primary` -> red
- Inputs, selects: inherit new focus ring

**`Leaderboard.tsx`:**
- Podium section: keep gold for #1, silver for #2, bronze for #3
- Rankings card: `card-glass` -> auto-updates
- Hover states: red accent

**`Challenges.tsx`:**
- XP badge, shop banner: keep accent (gold) for XP/rewards
- Tab triggers: inherit new tab styling
- Challenge cards: inherit card glass

**`Highlights.tsx`:**
- Info banner, spotlight: inherit card glass
- Vote module: inherits red accent for active states (gold for "YOUR VOTE" badge stays)

**`Teams.tsx`:**
- Team cards: inherit glass card
- Create team dialog: inherit dialog glass treatment

**`BuyCoins.tsx`:**
- Package cards: inherit glass card
- Keep gold/coin styling for prices

**`Rules.tsx`, `Terms.tsx`, `Privacy.tsx`:**
- Prose content in cards: inherit glass card
- Headings use `prose-headings:text-amber-400` -> keep gold for hierarchy

**`Admin.tsx`, `AdminMatchDetail.tsx`, `AdminUserDetail.tsx`:**
- Admin panels: inherit card glass
- Stats cards: inherit new styling
- Tables: add subtle backdrop-blur for readability

**`NotFound.tsx`:**
- Remove `bg-background` from root div
- Remove `gradient-radial` overlay div
- 404 text: `text-primary` -> now red

**`PaymentSuccess.tsx`, `PaymentCancel.tsx`:**
- Simple status pages: inherit new card styling

**`DiscordCallback.tsx`, `EpicCallback.tsx`:**
- Loading/redirect pages: inherit transparent background

---

## Phase 5: Scrim / Readability Layer

For dense content areas (match grids, leaderboard table, admin tables), add a subtle scrim wrapper in the page layout:

- Create a utility class `.content-scrim` in index.css:
  ```css
  .content-scrim {
    background: rgba(10, 11, 15, 0.45);
    backdrop-filter: blur(6px);
    border-radius: 1.25rem;
    padding: 1rem;
  }
  ```
- Apply this to grid wrappers on pages with dense content (Matches grid, Leaderboard table, Admin tables) to ensure text remains readable over the Spline animation

---

## Phase 6: Premium Micro-Interactions

Update existing animations in index.css:

- `.card-hover:hover` -> add `border-color: rgba(255,45,45,0.15)` (soft red border on hover)
- `.hover-lift:hover` -> keep translateY(-3px), add subtle red shadow
- `.btn-premium::after` -> add shine sweep effect with red-tinted gradient
- Page transitions: already have `animate-page-enter` (0.3s fade-up) -- keep unchanged
- Skeleton: inherit new muted colors, keep shimmer animation

---

## Phase 7: Mobile-Specific Adjustments

In `SplineBackground.tsx`:
- Add `@media (max-width: 768px)` -> opacity 0.65
- Optional: detect low-power devices via `navigator.hardwareConcurrency < 4` and skip Spline entirely (show static gradient fallback)

---

## Files Summary

| File | Action | Type |
|------|--------|------|
| `src/components/common/SplineBackground.tsx` | CREATE | Global Spline background component |
| `src/App.tsx` | MODIFY | Add SplineBackground import + render |
| `src/index.css` | MODIFY | Complete color palette swap (blue to red), glass/glow utilities, scrim class |
| `tailwind.config.ts` | MODIFY | Shadow and gradient HSL values (blue to red) |
| `src/components/layout/MainLayout.tsx` | MODIFY | bg-transparent, z-[1] |
| `src/components/layout/Sidebar.tsx` | MODIFY | Semi-transparent bg, backdrop-blur, red active states |
| `src/components/layout/Header.tsx` | MODIFY | Glass header adjustments |
| `src/components/layout/BottomNav.tsx` | MODIFY | Semi-transparent bg |
| `src/components/layout/Footer.tsx` | MODIFY | Semi-transparent bg |
| `src/components/ui/card.tsx` | MODIFY | Add backdrop-blur, semi-transparent bg |
| `src/components/ui/dialog.tsx` | MODIFY | Backdrop blur overlay, more opaque content |
| `src/components/ui/alert-dialog.tsx` | MODIFY | Same as dialog |
| `src/components/ui/select.tsx` | MODIFY | Backdrop blur on dropdown content |
| `src/components/ui/tabs.tsx` | MODIFY | Semi-transparent TabsList |
| `src/components/ui/dropdown-menu.tsx` | MODIFY | Backdrop blur content |
| `src/components/ui/input.tsx` | NO CHANGE | Inherits from CSS vars |
| `src/components/ui/button.tsx` | MINOR | Premium variant gradient color |
| `src/components/ui/skeleton.tsx` | NO CHANGE | Inherits from CSS |
| `src/pages/Auth.tsx` | MODIFY | Remove custom backgrounds, increase card opacity |
| `src/pages/NotFound.tsx` | MODIFY | Remove bg-background, remove gradient div |
| `src/pages/Index.tsx` | MODIFY | Remove HeroCompact custom gradients |
| `src/pages/Matches.tsx` | MODIFY | Adjust filter bar glass, empty state icon |
| `src/pages/Wallet.tsx` | MINOR | Cards inherit new styling |
| `src/pages/Profile.tsx` | MINOR | Cards inherit new styling |
| `src/pages/Leaderboard.tsx` | MINOR | Cards inherit new styling |
| `src/pages/Challenges.tsx` | MINOR | Cards inherit new styling |
| `src/pages/Highlights.tsx` | MINOR | Cards inherit new styling |
| `src/pages/MyMatches.tsx` | MINOR | Cards inherit new styling |
| `src/pages/Teams.tsx` | MINOR | Cards inherit new styling |
| `src/pages/CreateMatch.tsx` | MINOR | Cards inherit new styling |
| `src/pages/BuyCoins.tsx` | MINOR | Cards inherit new styling |
| `src/pages/Rules.tsx` | MINOR | Cards inherit new styling |
| `src/pages/Admin.tsx` | MINOR | Cards inherit new styling |
| `src/components/home/HeroCompact.tsx` | MODIFY | Remove custom gradient backgrounds |
| `src/components/matches/MatchCard.tsx` | MINOR | Inherits card changes |
| All other components | NO CHANGE | Inherit from CSS variable cascade |

**Total: ~25 files modified, 1 new file created. Zero logic changes.**

The majority of the redesign cascades automatically through CSS custom property updates in `index.css`. Only components with hardcoded color values (like `bg-[#5865F2]` for Discord) or custom background layers need individual attention.

