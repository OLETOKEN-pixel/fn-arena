
# Rollback Spline + Complete Premium 2D Redesign

## Overview

Remove every trace of Spline 3D from the codebase and replace it with a high-end CSS-only background system. Then redesign the entire visual layer -- palette, components, layout chrome, and all pages -- into a cohesive "premium dark esports" aesthetic using carefully crafted 2D effects (multilayer shadows, glass, gradients, glow, micro-animations). Zero logic changes.

---

## Phase 1: Spline Removal (Complete Purge)

### Files to DELETE
- `src/components/common/SplineBackground.tsx` -- the global Spline component
- `src/pages/SplineTest.tsx` -- the admin test page

### Files to MODIFY (Spline references)

**`src/App.tsx`:**
- Remove `import { SplineBackground }` and `import SplineTest`
- Remove `<SplineBackground />` render
- Remove the route `<Route path="/admin/spline-test" element={<SplineTest />} />`

**`src/index.css`:**
- Remove the comment "Spline Integration" from the header
- Remove the mobile Spline opacity rule (lines 798-803: `.spline-bg-wrapper` media query)

---

## Phase 2: Premium CSS Background System

### New background approach in `src/index.css`

Replace Spline with a pure CSS "alive" background applied to `body::before`:

- **Base:** Deep dark `#0A0D12`
- **Radial glow:** Very subtle warm red radial at top-center (opacity ~4%), creates depth
- **Secondary glow:** Muted cool blue-purple radial at bottom-right (opacity ~3%), adds dimension
- **Vignette:** Radial gradient darker at edges, lighter center
- **Noise texture:** CSS `url("data:image/svg+xml,...")` with a tiny noise pattern at 2-3% opacity for texture
- **Animated drift:** Extremely subtle `background-position` animation on 30s loop to make it feel "alive" without being distracting

This is applied via `body::before` with `position: fixed; inset: 0; z-index: -1` so it sits behind everything without any wrapper components.

### `src/components/layout/MainLayout.tsx`
- Change `bg-transparent` back to just the normal flow -- the body background handles everything
- Keep `relative z-[1]`

---

## Phase 3: Color System Redesign

### New palette direction: **Deep navy-black + electric blue accent**

The current red accent (#FF2D2D) makes it hard to distinguish primary actions from destructive/error states. Switching to a single electric blue accent creates cleaner hierarchy:

**`src/index.css` -- CSS custom properties (`:root` and `.dark`):**

| Token | New Value | Purpose |
|-------|-----------|---------|
| `--background` | `222 28% 5%` | Deep navy-charcoal (#0A0D12) |
| `--background-elevated` | `222 24% 7%` | Slightly lighter surface |
| `--foreground` | `216 30% 94%` | Near-white text (#EAF0FF) |
| `--card` | `222 20% 8%` | Card surfaces |
| `--card-elevated` | `222 18% 10%` | Elevated cards |
| `--card-foreground` | `216 30% 94%` | Card text |
| `--popover` | `222 20% 9%` | Dropdown/popover bg |
| `--primary` | `217 95% 62%` | Electric blue (#4B8BFF) |
| `--primary-glow` | `217 100% 72%` | Blue hover glow |
| `--primary-foreground` | `0 0% 100%` | White on blue |
| `--secondary` | `222 16% 13%` | Subtle surface |
| `--muted` | `222 14% 15%` | Muted bg |
| `--muted-foreground` | `216 12% 50%` | Subdued text |
| `--accent` | `45 95% 55%` | Gold -- UNCHANGED (coins/prizes) |
| `--destructive` | `0 80% 55%` | Red for errors only |
| `--border` | `222 12% 16%` | Subtle borders |
| `--border-glow` | `217 20% 22%` | Glow borders |
| `--ring` | `217 95% 62%` | Focus ring blue |
| `--electric-blue` | `217 95% 62%` | Matches primary |
| `--electric-blue-glow` | `217 100% 72%` | Blue glow |
| `--sidebar-background` | `222 28% 4%` | Deep sidebar |
| `--sidebar-primary` | `217 95% 62%` | Blue active |
| `--sidebar-border` | `222 12% 12%` | Sidebar border |

The `.dark` block mirrors `:root` (always dark).

### `tailwind.config.ts`
- Update `boxShadow.glow-blue` to use proper blue HSL
- Update `boxShadow.premium-hover` to use blue accent instead of red
- Update `backgroundImage` gradients: `gradient-blue` uses proper blue HSL
- Keep `glow-gold`, font families, keyframes, spacing unchanged

---

## Phase 4: Utility Classes Update (`src/index.css`)

### Glow effects
- `.glow-blue` / `.glow-blue-soft`: Use `--electric-blue` (now actually blue)
- `.glow-text-blue`: Blue text shadow
- `.card-glow-blue`: Blue card glow
- All gold variants: unchanged

### Card effects
- `.card-premium`: `rgba(12,15,22,0.85)` + `backdrop-blur(12px)` + `border: 1px solid rgba(255,255,255,0.06)` + inner shadow for "incised" depth
- `.card-hover:hover`: Blue border highlight `rgba(75,139,255,0.15)`, lift 2-4px, layered shadow
- `.card-glass`: `rgba(12,15,22,0.82)` + `backdrop-blur-xl`

### Glass effects
- `.glass`: `rgba(12,15,22,0.80)` + `backdrop-blur-md`
- `.glass-premium`: gradient glass with blue-tinted inner shadow
- `.glass-header`: `rgba(10,13,18,0.88)` + `backdrop-blur-xl` + bottom border

### Button effects
- `.btn-premium:hover`: Blue shadow glow `hsl(217 95% 62% / 0.3)`
- `.btn-premium:active`: scale(0.98)
- `.btn-gold`: unchanged

### Gaming patterns
- `.gaming-pattern-bg`: Use blue/gold radials instead of red
- `.gradient-radial`: Blue tint

### Animated border
- `.animated-border`: Blue + gold gradient flow

### Hover lift
- `.hover-lift:hover`: Blue-tinted shadow instead of red

---

## Phase 5: Base UI Components

### `src/components/ui/card.tsx`
- Styling: `rounded-xl border border-white/[0.06] bg-card text-card-foreground shadow-premium`
- Remove `backdrop-blur-xl` from default card (only on `.card-glass` utility)
- Add subtle `bg-card/95` for solid feel without Spline showing through

### `src/components/ui/button.tsx`
- `default` variant: `hover:shadow-glow-blue` (now actually blue)
- `premium` variant: `from-primary via-primary to-primary/80` (now blue gradient)
- `gold` variant: unchanged
- No logic changes

### `src/components/ui/dialog.tsx`
- Overlay: `bg-black/70 backdrop-blur-sm` (keep as-is, works well)
- Content: `bg-background/95 backdrop-blur-xl` (more opaque since no Spline to show through)

### `src/components/ui/alert-dialog.tsx`
- Same treatment as dialog

### `src/components/ui/select.tsx`
- Content: `bg-popover/95 backdrop-blur-xl`

### `src/components/ui/tabs.tsx`
- TabsList: `bg-muted/80`

### `src/components/ui/dropdown-menu.tsx`
- Content: `bg-popover/95 backdrop-blur-xl`

---

## Phase 6: Layout Components

### `src/components/layout/Sidebar.tsx`
- Background: `bg-sidebar border-r border-sidebar-border`
- Remove `/[0.88]` opacity (solid bg since no Spline)
- Active states use `--primary` (blue)
- Active indicator bar: `bg-primary` (blue)
- Create Match button: Blue gradient + blue glow on hover
- Buy Coins button: Gold gradient (unchanged)

### `src/components/layout/Header.tsx`
- `glass-header` stays (inherits new colors)
- Wallet button hover: `hover:border-primary/30` (blue)
- Discord brand color stays `#5865F2`

### `src/components/layout/BottomNav.tsx`
- Background: `bg-background/95 backdrop-blur-xl` (solid feel)
- Active states: `--primary` (blue)
- Gradient accent line: `via-primary/40` (blue)

### `src/components/layout/Footer.tsx`
- Background: `bg-sidebar` (solid)
- Remove `/[0.88]` opacity
- Navigation hover: `hover:text-primary` (blue)
- Social icons hover: `hover:text-accent` (gold, unchanged)

---

## Phase 7: Page-by-Page Styling Pass

### `src/pages/Auth.tsx`
- Card: `bg-card shadow-2xl shadow-primary/5` (remove `/[0.92]` opacity hack)
- Keep Discord brand button color
- Background decoration: gradient line `via-primary/30` (blue)

### `src/pages/NotFound.tsx`
- 404 text: `text-primary` (blue)
- No other changes needed

### `src/pages/Index.tsx` (Home)
- No changes needed (uses components that auto-inherit)

### `src/components/home/HeroCompact.tsx`
- Remove scrim overlay div (`bg-background/30 backdrop-blur-[2px]`)
- CTA buttons: `.glow-blue` + `.btn-premium` auto-update to blue
- "Inizia con Discord" text: change to English "Sign in with Discord"

### All other pages (Matches, MyMatches, MatchDetails, CreateMatch, Wallet, Profile, Leaderboard, Challenges, Highlights, Teams, BuyCoins, Rules, Terms, Privacy, Admin, AdminMatchDetail, AdminUserDetail)
- These inherit changes from CSS variables and base components
- No individual file changes needed -- the cascade handles everything

---

## Phase 8: Micro-Interactions Enhancement

All in `src/index.css`:

- **Card hover:** 2-4px lift + subtle blue border highlight + layered shadow
- **Button shine:** `.btn-premium::after` pseudo-element with translucent sweep on hover
- **Active press:** `scale(0.98)` on all interactive elements (already present)
- **Page transitions:** Keep existing `animate-page-enter` (300ms fade-up)
- **Card entrance:** Keep existing `animate-card-enter` with stagger delays
- **Skeleton loading:** Keep `shimmer-premium`, inherits new muted colors

---

## Files Summary

| File | Action |
|------|--------|
| `src/components/common/SplineBackground.tsx` | DELETE |
| `src/pages/SplineTest.tsx` | DELETE |
| `src/App.tsx` | MODIFY -- remove Spline imports, component, route |
| `src/index.css` | MODIFY -- new palette, new CSS background, remove Spline rules, update all utilities |
| `tailwind.config.ts` | MODIFY -- shadow/gradient HSL values |
| `src/components/ui/card.tsx` | MODIFY -- solid bg, remove blur default |
| `src/components/ui/dialog.tsx` | MODIFY -- more opaque content bg |
| `src/components/ui/select.tsx` | MODIFY -- more opaque dropdown |
| `src/components/ui/tabs.tsx` | MODIFY -- solid muted bg |
| `src/components/ui/dropdown-menu.tsx` | MODIFY -- more opaque content |
| `src/components/ui/alert-dialog.tsx` | MODIFY -- match dialog treatment |
| `src/components/layout/MainLayout.tsx` | MODIFY -- remove bg-transparent |
| `src/components/layout/Sidebar.tsx` | MODIFY -- solid bg, blue accents |
| `src/components/layout/Header.tsx` | NO CHANGE -- inherits from CSS |
| `src/components/layout/BottomNav.tsx` | MODIFY -- solid bg |
| `src/components/layout/Footer.tsx` | MODIFY -- solid bg |
| `src/pages/Auth.tsx` | MODIFY -- remove opacity hack |
| `src/pages/NotFound.tsx` | NO CHANGE -- inherits |
| `src/components/home/HeroCompact.tsx` | MODIFY -- remove scrim, fix Italian text |

**Total: 2 files deleted, ~15 files modified. Zero logic changes.**

The entire redesign cascades through CSS custom properties. Most components auto-inherit the new palette without individual changes. The result is a cohesive, premium, fully 2D esports aesthetic with no Spline dependencies.
