
# Desktop-Only Home Page Redesign

## Summary
This plan implements a complete desktop-only redesign of the Home page and related layout components. All changes will be wrapped in responsive breakpoint conditions (lg: >= 1024px) to ensure **mobile/tablet remains completely unchanged**.

---

## CHANGES OVERVIEW

### Files to Modify
| File | Purpose |
|------|---------|
| `src/pages/Index.tsx` | New desktop-only home layout |
| `src/components/layout/Header.tsx` | Remove "Send Tip", coins opens overlay |
| `src/components/layout/Sidebar.tsx` | Premium sidebar styling |
| `src/components/layout/BottomNav.tsx` | Hide on desktop (already done, verify) |
| `src/components/home/LiveMatchesCompact.tsx` | Enhanced premium empty state |
| `src/hooks/use-mobile.tsx` | Add `useIsDesktop` hook |

### Files to Create
| File | Purpose |
|------|---------|
| `src/components/home/VideoBanner.tsx` | Desktop video banner component |
| `src/components/wallet/CoinsOverlay.tsx` | Buy coins + VIP tip overlay modal |

### Assets to Copy
| From | To |
|------|-----|
| `user-uploads://VIDEO_BANNER_SITO.mov` | `public/videos/banner.mp4` |

---

## DETAILED IMPLEMENTATION

### 1. Hook: useIsDesktop (src/hooks/use-mobile.tsx)

Add a new `useIsDesktop` hook alongside existing `useIsMobile`:

```typescript
const DESKTOP_BREAKPOINT = 1024;

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const onChange = () => {
      setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isDesktop;
}
```

---

### 2. Video Banner Component (src/components/home/VideoBanner.tsx)

**Features:**
- Video autoplay loop with audio enabled by default
- Mute/unmute toggle button with premium styling
- Fallback for browser autoplay policy: if muted required, show "Click to unmute" CTA
- Premium frame with glow, rounded corners
- Overlay text: "OleBoy Token Arena" + subtitle + CTA buttons

**Structure:**
```text
+---------------------------------------+
|  [Video - autoplay, loop]             |
|                                       |
|    +--------------------------+       |
|    | OleBoy Token Arena       |       |
|    | Compete. Win. Earn.      |       |
|    | [Create Match] [Browse]  |       |
|    +--------------------------+       |
|                                       |
|  [Mute/Unmute Icon]                   |
+---------------------------------------+
```

**Key implementation details:**
- Use `<video>` element with `autoPlay muted loop playsInline`
- On mount, try to play with audio: if browser blocks, keep muted and show unmute CTA
- Premium border glow effect (gold/primary gradient)
- Responsive within desktop column (not stretched)
- Video source: `/videos/banner.mp4`

---

### 3. Coins Overlay Modal (src/components/wallet/CoinsOverlay.tsx)

**Features:**
- Triggered by clicking the coins button in header (desktop only)
- Two tabs: "Buy Coins" and "Send Tip" (VIP only)
- Premium animated modal with blur backdrop

**Buy Coins Tab:**
- Package grid (5, 10, 15, 20, 25, 50 coins)
- Custom amount input
- Total with processing fee
- "Pay Now" button calling existing `create-checkout` edge function
- Uses existing checkout logic from BuyCoins.tsx

**Send Tip Tab:**
- Only visible/enabled if user is VIP
- If not VIP: show locked state with "VIP Required" badge
- Player search input (uses existing `search_players_public` RPC)
- Amount input with quick buttons (1, 5, 10, 25)
- Send button using existing `sendTip` from `useVipStatus`

**Modal animations:**
- Fade + scale entrance
- Blur backdrop
- Smooth tab transitions

---

### 4. Home Page Layout (src/pages/Index.tsx)

**Desktop Layout (lg+):**
```text
+------------------------------------------+
| HeroCompact                              |
+------------------------------------------+
| LiveMatches (2/3)    | VideoBanner (1/3) |
|                      |                   |
|                      |                   |
+------------------------------------------+
| ProgressCard                             |
+------------------------------------------+
```

**Mobile Layout (unchanged):**
```text
+------------------+
| HeroCompact      |
+------------------+
| StatsBar         |  <-- Keep on mobile
+------------------+
| LiveMatches      |
+------------------+
| Leaderboard      |  <-- Keep on mobile
+------------------+
| WalletSnapshot   |  <-- Keep on mobile
+------------------+
| ProgressCard     |
+------------------+
| FeatureCardsMini |  <-- Keep on mobile
+------------------+
```

**Implementation:**
```tsx
export default function Index() {
  const isDesktop = useIsDesktop();

  return (
    <MainLayout>
      <div className="flex flex-col gap-4">
        <HeroCompact />
        
        {/* Desktop: Remove StatsBar completely */}
        {!isDesktop && <StatsBar />}
        
        {/* Main Grid */}
        <div className={cn(
          "grid gap-4",
          isDesktop 
            ? "grid-cols-[2fr_1fr] max-w-[1400px] mx-auto" 
            : "grid-cols-1 lg:grid-cols-3"
        )}>
          {/* Left: Live Matches + Progress */}
          <div className="flex flex-col gap-4">
            <LiveMatchesCompact />
            <ProgressCard />
          </div>
          
          {/* Right: Desktop=Video, Mobile=Leaderboard+Wallet */}
          {isDesktop ? (
            <VideoBanner />
          ) : (
            <div className="flex flex-col gap-3">
              <LeaderboardCompact />
              <WalletSnapshot />
            </div>
          )}
        </div>

        {/* Mobile only: Feature cards */}
        {!isDesktop && <FeatureCardsMini />}
      </div>
    </MainLayout>
  );
}
```

---

### 5. Header Changes (src/components/layout/Header.tsx)

**Desktop Changes:**
- Remove "Send Tip" button entirely on desktop
- Change coins button from `<Link to="/wallet">` to `<button onClick>` that opens `CoinsOverlay`
- Keep VIP banner, social icons, notifications, user menu

**Implementation:**
```tsx
// In Header component
const [showCoinsOverlay, setShowCoinsOverlay] = useState(false);
const isDesktop = useIsDesktop();

// Replace the wallet Link with:
{isDesktop ? (
  <button
    onClick={() => setShowCoinsOverlay(true)}
    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-secondary/60 hover:bg-secondary border border-border/50 hover:border-primary/30 transition-all duration-200 group"
  >
    <CoinIcon size="sm" className="..." />
    <span className="font-mono font-semibold text-sm">
      {wallet?.balance?.toFixed(2) ?? '0.00'}
    </span>
  </button>
) : (
  <Link to="/wallet" className="...">
    {/* Same content */}
  </Link>
)}

// Remove "Send Tip" button on desktop:
{user && !isDesktop && (
  <Button onClick={() => setShowTipModal(true)} variant="gold">
    <Gift /> Send Tip
  </Button>
)}

// Add overlay:
<CoinsOverlay open={showCoinsOverlay} onOpenChange={setShowCoinsOverlay} />
```

---

### 6. Premium Sidebar (src/components/layout/Sidebar.tsx)

**Enhancements for desktop:**
- Group nav items: Core (Home, Live Matches, My Matches) | Social (Challenges, Highlights, Teams, Leaderboard) | Account (Wallet, Profile)
- Add section labels with premium styling
- Enhanced hover effects with subtle background slide
- Active state with stronger gradient glow
- Better icon sizing and spacing

**Visual improvements:**
```tsx
// Add section dividers
<li className="pt-4 pb-1 px-3">
  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
    Core
  </span>
</li>

// Enhanced nav item styling
className={cn(
  'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 relative group',
  isActive 
    ? 'bg-gradient-to-r from-primary/20 to-primary/5 text-primary shadow-[0_0_20px_rgba(79,142,255,0.2)]' 
    : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
  isLocked && 'opacity-50'
)}
```

---

### 7. LiveMatchesCompact Enhancement

**Improve empty state:**
```tsx
// Enhanced empty state
<div className="h-full flex flex-col items-center justify-center text-center py-12">
  <div className="relative">
    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-accent/10 flex items-center justify-center mb-6 animate-pulse-soft">
      <Swords className="w-11 h-11 text-primary" />
    </div>
    <div className="absolute -inset-2 bg-primary/10 rounded-full blur-xl animate-pulse" />
  </div>
  <h3 className="font-display text-xl font-semibold mb-2">No open matches</h3>
  <p className="text-muted-foreground mb-6 max-w-xs">
    Be the first to create a competitive match and start earning!
  </p>
  <Button asChild className="glow-blue btn-premium group">
    <Link to="/matches/create">
      <Plus className="w-4 h-4 mr-2 group-hover:rotate-90 transition-transform" />
      Create Match
    </Link>
  </Button>
</div>
```

---

### 8. BottomNav - Hide on Desktop

Already implemented with `lg:hidden` class, but verify:
```tsx
<nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
```

Also hide FeatureCardsMini on desktop since navigation is in sidebar.

---

## TECHNICAL NOTES

### Breakpoint Strategy
- **Desktop**: `lg:` (>=1024px)
- All desktop-specific code uses `useIsDesktop()` hook
- CSS classes use `lg:` prefix for desktop styles
- Mobile code paths remain completely untouched

### Video Autoplay Policy
1. First attempt: play with audio
2. If blocked: keep muted, show prominent "🔊 Click to unmute" button
3. User click on video or button enables audio
4. Remember preference in localStorage

### Max-Width Container
Home page desktop content constrained to `max-w-[1400px]` with `mx-auto` for balanced layout on large screens.

### Performance
- Video uses `preload="metadata"` to avoid loading full video immediately
- Lazy load video component on desktop only
- No additional dependencies required

---

## FILES SUMMARY

**Modified (5 files):**
1. `src/hooks/use-mobile.tsx` - Add useIsDesktop hook
2. `src/pages/Index.tsx` - Desktop layout with video banner
3. `src/components/layout/Header.tsx` - Coins overlay, remove Send Tip
4. `src/components/layout/Sidebar.tsx` - Premium grouping/styling
5. `src/components/home/LiveMatchesCompact.tsx` - Enhanced empty state

**Created (2 files):**
1. `src/components/home/VideoBanner.tsx` - Video banner component
2. `src/components/wallet/CoinsOverlay.tsx` - Buy coins + tip modal

**Assets (1 file):**
1. Copy video to `public/videos/banner.mp4`

---

## CHECKLIST

- [x] StatsBar (4 cards) hidden on desktop
- [x] LeaderboardCompact hidden on desktop
- [x] WalletSnapshot hidden on desktop  
- [x] FeatureCardsMini (bottom buttons) hidden on desktop
- [x] Video banner replaces right column on desktop
- [x] Sidebar premium styling
- [x] "Send Tip" removed from header on desktop
- [x] Coins button opens overlay on desktop
- [x] Overlay has Buy Coins + VIP Tip tabs
- [x] Mobile remains 100% unchanged
- [x] Layout max-width 1400px, balanced grid
- [x] All animations premium but performant
