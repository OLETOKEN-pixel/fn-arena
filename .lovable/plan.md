

# ULTRA PREMIUM REDESIGN - OLEBOY TOKEN Platform

## Executive Summary

A complete visual overhaul transforming the platform from functional gaming UI to a top-tier competitive esports platform. This redesign covers every page, component, microinteraction, and responsive behavior while maintaining all existing functionality.

---

## PHASE 1: DESIGN SYSTEM FOUNDATION

### 1.1 Enhanced Color Palette (src/index.css)

**Current Issues:**
- Colors lack depth and premium feel
- Gold/accent usage is inconsistent
- Dark tones are too flat

**Premium Updates:**
```text
Background:      #0A0B0E (deeper, richer black)
Card:            #111318 (subtle elevation)
Card Elevated:   #161A21 (for hover states)
Border:          #1E2330 (refined edge)
Border Glow:     #2A3142 (interactive states)

Primary Blue:    #3B82F6 -> #4F8EFF (brighter, more electric)
Primary Glow:    #4F8EFF/30 (for glows)

Accent Gold:     #F5A623 -> #FFD93D (richer gold)
Gold Gradient:   linear-gradient(135deg, #FFD93D, #F5A623, #D4A853)

Success:         #10B981 -> #22D3A0 (more vibrant)
Destructive:     #EF4444 -> #FF4757 (more punchy)
Warning:         #F59E0B (keep)
```

### 1.2 Typography Hierarchy

**Premium Font Stack:**
- Display/Headers: Space Grotesk (already installed) - increase weight usage
- Body: Inter (already installed) - optimize line heights
- Mono/Stats: JetBrains Mono (new - for numbers/stats)

**Scale Refinement:**
```css
--text-display-xl: 3rem / 1.1 / -0.02em  /* Hero titles */
--text-display-lg: 2.25rem / 1.15 / -0.01em
--text-display-md: 1.75rem / 1.2 / -0.01em
--text-heading: 1.25rem / 1.3 / 0
--text-body: 1rem / 1.6 / 0
--text-caption: 0.75rem / 1.5 / 0.02em
```

### 1.3 Spacing System (8px Grid)

**Consistent Tokens:**
```css
--space-1: 4px    --space-5: 20px   --space-9: 48px
--space-2: 8px    --space-6: 24px   --space-10: 64px
--space-3: 12px   --space-7: 32px   --space-11: 80px
--space-4: 16px   --space-8: 40px   --space-12: 96px
```

### 1.4 Border Radius & Shadows

```css
/* Border Radius */
--radius-sm: 6px
--radius-md: 10px
--radius-lg: 14px
--radius-xl: 20px
--radius-full: 9999px

/* Premium Shadows */
--shadow-card: 0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03)
--shadow-card-hover: 0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(79,142,255,0.15)
--shadow-glow-blue: 0 0 30px rgba(79,142,255,0.25), 0 0 60px rgba(79,142,255,0.1)
--shadow-glow-gold: 0 0 30px rgba(255,217,61,0.25), 0 0 60px rgba(255,217,61,0.1)
```

### 1.5 Animation Tokens (tailwind.config.ts)

**New Keyframes:**
```javascript
keyframes: {
  // Page Transitions
  "page-enter": { 
    "0%": { opacity: "0", transform: "translateY(8px)" },
    "100%": { opacity: "1", transform: "translateY(0)" }
  },
  
  // Card Entrance (stagger)
  "card-enter": {
    "0%": { opacity: "0", transform: "translateY(16px) scale(0.98)" },
    "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
  },
  
  // Shimmer Premium
  "shimmer-premium": {
    "0%": { backgroundPosition: "-200% 0" },
    "100%": { backgroundPosition: "200% 0" }
  },
  
  // Pulse Glow
  "pulse-glow-soft": {
    "0%, 100%": { boxShadow: "0 0 20px rgba(79,142,255,0.2)" },
    "50%": { boxShadow: "0 0 40px rgba(79,142,255,0.4)" }
  },
  
  // Button Press
  "button-press": {
    "0%": { transform: "scale(1)" },
    "50%": { transform: "scale(0.97)" },
    "100%": { transform: "scale(1)" }
  },
  
  // Notification Bell
  "bell-ring": {
    "0%, 100%": { transform: "rotate(0deg)" },
    "25%": { transform: "rotate(12deg)" },
    "75%": { transform: "rotate(-12deg)" }
  }
}
```

---

## PHASE 2: UI COMPONENT KIT

### 2.1 Button Component (src/components/ui/button.tsx)

**Premium Variants:**
```typescript
variants: {
  default: "premium-gradient hover-lift active-press",
  secondary: "glass-surface hover-glow",
  ghost: "hover-bg-subtle active-scale",
  destructive: "destructive-gradient hover-glow-red",
  gold: "gold-gradient shimmer-effect",
  outline: "border-glow hover-border-primary"
}

// New states for ALL buttons
- Hover: lift + glow + cursor change
- Active/Press: scale(0.97) + deeper color
- Focus: ring with glow effect
- Loading: skeleton pulse with spinner
- Disabled: reduced opacity + no interactions
```

### 2.2 Card Component (src/components/ui/card.tsx)

**Premium Card Features:**
- Base: deeper background with subtle gradient
- Border: 1px with gradient option
- Hover: lift + border glow + shadow increase
- Active state for clickable cards
- Loading skeleton with shimmer
- Glass variant with backdrop blur

### 2.3 Badge Component (src/components/ui/badge.tsx + custom-badge.tsx)

**Status Badges:**
```text
OPEN:        Blue glow, pulse animation
READY CHECK: Electric blue with soft pulse
IN PROGRESS: Green with animated border
COMPLETED:   Gold with subtle shine
DISPUTED:    Red with warning pulse
WON:         Gold gradient with glow
LOST:        Muted gray
EXPIRED:     Faded with strikethrough effect
```

### 2.4 Input Component (src/components/ui/input.tsx)

**Premium Input States:**
- Focus: glowing border animation
- Error: red glow + shake animation
- Success: green checkmark fade-in
- Loading: skeleton shimmer
- Clear button with fade
- Placeholder animation on focus

### 2.5 Modal/Dialog (src/components/ui/dialog.tsx)

**Premium Modal Features:**
- Backdrop blur (16px) + gradient overlay
- Scale + fade entrance animation
- Smooth exit animation
- Premium header with gradient border
- Action buttons with proper hierarchy

### 2.6 Dropdown/Popover (src/components/ui/popover.tsx, dropdown-menu.tsx)

**Premium Dropdown:**
- Slide + fade animation
- Item hover with background glow
- Active indicator animation
- Separator styling
- Icons with consistent sizing

### 2.7 Tabs (src/components/ui/tabs.tsx)

**Premium Tabs:**
- Animated underline indicator
- Hover state with glow
- Active state with background
- Badge integration
- Scroll on overflow (mobile)

### 2.8 Toast/Sonner (src/components/ui/sonner.tsx)

**Premium Toast:**
- Slide in from right with spring
- Type-specific icon + color
- Progress bar for auto-dismiss
- Action button styling
- Stacking animation

### 2.9 Skeleton Loading

**Premium Skeleton:**
- Gradient shimmer animation
- Rounded corners matching components
- Staggered fade-in on load complete

### 2.10 Empty States

**Premium Empty States:**
- Illustrated icon (not just icon)
- Gradient background subtle
- Helpful text + CTA
- Animated entrance

---

## PHASE 3: LAYOUT REDESIGN

### 3.1 Header (src/components/layout/Header.tsx)

**Current Issues:**
- Logo text "OLEBOY TOKEN" should be just logo
- Search bar needs premium styling
- Icons need consistent styling
- Mobile layout cramped

**Premium Updates:**
- Remove "OLEBOY TOKEN" text, keep only logo (larger, ~48px)
- Glassmorphism header with subtle blur
- Refined icon button styling with hover effects
- Wallet display with animated coin icon
- Notification bell with pulse on new notifications
- User avatar with premium ring
- Mobile: streamlined with hamburger animation

### 3.2 Sidebar (src/components/layout/Sidebar.tsx)

**Current Issues:**
- Basic styling
- No hover animations
- Locked items not obvious
- CTAs at bottom are good but need refinement

**Premium Updates:**
- Logo only (no text) on collapsed state
- Nav items: hover slide effect + icon animation
- Active item: gradient background + glow
- Locked items: lock icon with tooltip
- Premium CTA buttons: enhanced gradients
- Collapse animation for mobile
- Bottom nav option for mobile

### 3.3 Footer (src/components/layout/Footer.tsx)

**Dynamic Footer Implementation:**
```typescript
// Only show full footer on Home route
const location = useLocation();
const isHomePage = location.pathname === '/';

if (!isHomePage) {
  return null; // or minimal footer
}
```

**Premium Footer (Home only):**
- Gradient top border
- Premium link styling with hover
- Social icons with platform colors on hover
- Newsletter section (optional)
- Animated on scroll into view

### 3.4 Mobile Navigation

**New Bottom Navigation for Mobile:**
- Fixed bottom bar with 5 key items
- Home, Matches, My Matches, Wallet, Profile
- Active indicator with animation
- Safe area padding for notch devices
- Smooth icon transitions

---

## PHASE 4: PAGE-BY-PAGE REDESIGN

### 4.1 Home Page (src/pages/Index.tsx)

**Full Premium Overhaul:**

**HeroCompact:**
- Larger logo (64px) with subtle float animation
- Gradient text for "OLEBOY TOKEN"
- CTA buttons with premium gradients + shimmer
- Background particles/grid pattern (subtle)

**StatsBar:**
- Glass cards with gradient borders
- Animated number counters
- Icon glow on hover
- Responsive grid

**LiveMatchesCompact:**
- Premium card container
- Match cards with gradient borders
- Hover: lift + glow + scale
- Empty state with illustration
- Staggered entrance animation

**LeaderboardCompact:**
- Top 3 with medal animations
- Row hover effects
- Earnings with animated counter
- Click to view stats (modal)

**ProgressCard / WalletSnapshot:**
- Glass card design
- Animated progress bars
- Coin icon with subtle rotation on hover
- Quick action buttons

**FeatureCardsMini:**
- Icon containers with gradients
- Hover: icon animation + card lift
- Description fade on mobile

### 4.2 Live Matches Page (src/pages/Matches.tsx)

**Premium Updates:**
- Page entrance animation
- Filter bar: glass style with dropdowns
- Search: premium input with icon animation
- Match grid: staggered entrance
- Match cards: completely redesigned (see below)
- Empty state: premium illustration
- Pagination: premium buttons

### 4.3 Match Card (src/components/matches/MatchCard.tsx)

**Complete Redesign:**
```text
Layout:
+----------------------------------+
| Header: Mode Badge | Status Badge|
+----------------------------------+
| Center: Entry Fee (prominent)    |
|         Prize Pool (gold glow)   |
+----------------------------------+
| Stats Row: Size | First To       |
|            Region | Platform     |
+----------------------------------+
| Timer/Live Badge                 |
+----------------------------------+
| CTA: View Details (outline)      |
|      Join (primary/gold)         |
+----------------------------------+

Visual:
- Gradient border (subtle)
- Hover: lift + border glow + shadow
- Status-specific glow (live = green)
- Prize pool with gold shimmer
- Premium badges
- Smooth button transitions
```

### 4.4 My Matches Page (src/pages/MyMatches.tsx)

**Premium Updates:**
- Tab bar: animated indicator
- Active/History separation clear
- MyMatchCard redesign
- Action badges prominent
- Empty states for each tab
- Quick filters

### 4.5 MyMatchCard (src/components/matches/MyMatchCard.tsx)

**Premium Redesign:**
- Clear status indication
- Opponent display (avatar + name + epic)
- "vs" styling with separator
- Action required: pulsing border
- Won/Lost: gold/gray badge with icon
- Stats in compact row
- Single prominent CTA

### 4.6 Match Details Page (src/pages/MatchDetails.tsx)

**Esports Premium Layout:**
```text
+----------------------------------------+
| Stepper: Status Progress (animated)    |
+----------------------------------------+
| Team A Card  |  VS  |  Team B Card     |
| (Players)    |      |  (Players)       |
+----------------------------------------+
| Match Info: Rules, Region, Platform    |
+----------------------------------------+
| Ready Up Section (when applicable)     |
+----------------------------------------+
| Result Declaration (when applicable)   |
+----------------------------------------+
| Proof Section (screenshots/dispute)    |
+----------------------------------------+
| Chat (collapsible, premium)            |
+----------------------------------------+
```

**Visual Details:**
- Stepper with animated transitions
- Team cards with gradient backgrounds
- Player avatars in row with overlaps
- VS badge: glowing separator
- Rules in collapsible accordion
- Chat with premium message bubbles
- Screenshot dropzone: drag animation

### 4.7 Wallet Page (src/pages/Wallet.tsx)

**Premium Wallet Redesign:**

**Balance Cards:**
- Available: large number with gold glow
- Locked: with lock icon animation
- Total: gradient background

**Transaction History (COLLAPSIBLE):**
```typescript
<Collapsible>
  <CollapsibleTrigger>
    Transaction History
    <ChevronDown className="transition-transform" />
  </CollapsibleTrigger>
  <CollapsibleContent>
    {/* Transactions with filters */}
  </CollapsibleContent>
</Collapsible>
```

**Transaction Items:**
- Type icon with color
- Description with timestamp
- Amount with +/- and color
- Status badge (if applicable)

**Filter Tabs:**
- All | Locks | Payouts | Tips | Purchases
- Premium tab styling

### 4.8 Profile Page (src/pages/Profile.tsx)

**Premium Profile:**
- Header: large avatar with edit hover
- Stats cards: animated numbers
- Section tabs: Account, Game, Payments, Connections
- Form inputs: premium styling
- VIP badge: gold gradient with animation
- Connected accounts: platform-colored cards
- Save button: loading state

### 4.9 Teams Page (src/pages/Teams.tsx)

**Premium Teams:**
- Team cards: logo/initials prominent
- Member avatars: overlapped row
- Owner badge: gold crown
- Eligibility badges: 2v2, 3v3, 4v4
- Empty state: illustrated
- Create modal: premium form

### 4.10 Team Details (src/pages/TeamDetails.tsx)

**Premium Team Detail:**
- Team header: large name + tag + stats
- Member list: table with actions
- Invite form: search + send
- Pending invites: separate section
- Owner controls: kick/promote
- Leave team: confirmation modal

### 4.11 Challenges Page (src/pages/Challenges.tsx)

**Premium Challenges:**
- XP display: prominent with animation
- Challenge cards: progress bar + reward
- Daily/Weekly tabs: with countdown
- Claimed: checkmark animation
- Shop banner: call to action
- Avatar grid: premium styling

### 4.12 Leaderboard Page (src/pages/Leaderboard.tsx)

**Premium Leaderboard:**
- Top 3: special cards with medals
- Table: striped, hover effects
- Rank column: icon or number
- Stats modal on click
- Load more: infinite scroll feel
- Weekly/Monthly filters (if applicable)

### 4.13 Admin Pages

**Premium Admin Theme:**
- Dark purple/blue accents
- Data tables with sorting
- Action buttons: confirm dialogs
- Stats dashboard: charts
- User detail: comprehensive view
- Match detail: full control panel

---

## PHASE 5: NOTIFICATIONS REDESIGN

### 5.1 Remove Notifications Page

**Action Required:**
- Remove route from App.tsx
- Remove link from Header dropdown
- Remove from Sidebar nav
- Keep NotificationsDropdown as main UI

### 5.2 Premium NotificationsDropdown (src/components/notifications/NotificationsDropdown.tsx)

**Complete Redesign as "Mini-App":**

**Structure:**
```text
+----------------------------------------+
| Header: "Notifications" | Settings Icon|
|         Unread Count Badge             |
+----------------------------------------+
| Filters: All | Unread | Invites | Match|
+----------------------------------------+
| Notification List (ScrollArea)         |
|                                        |
| [Notification Card]                    |
|   Icon | Title                         |
|   Message                              |
|   Time | Quick Actions                 |
|                                        |
| [Team Invite Card]                     |
|   Team Icon | Invite Message           |
|   [Accept] [Decline] buttons           |
|                                        |
+----------------------------------------+
| Footer: Mark All Read | Clear All      |
+----------------------------------------+
```

**Visual Enhancements:**
- Glass panel with blur
- Filter tabs with animated indicator
- Notification cards with type-specific icons
- Team invites: inline Accept/Decline buttons
- Unread: left border indicator + glow
- Timestamps: relative format
- Actions: hover reveal
- Loading: skeleton shimmer
- Empty: illustrated state

**Mobile (Bottom Sheet):**
```typescript
// On mobile, use Sheet instead of Popover
const isMobile = useIsMobile();

if (isMobile) {
  return (
    <Sheet>
      <SheetTrigger>...</SheetTrigger>
      <SheetContent side="bottom" className="h-[80vh]">
        {/* Same content */}
      </SheetContent>
    </Sheet>
  );
}
```

### 5.3 Notification Card Component

**Premium Notification Card:**
- Type icon with color
- Title (bold if unread)
- Message (2 line clamp)
- Timestamp
- Quick view action (for match notifications)
- Hover: subtle background
- Unread: left border + bg tint

### 5.4 Team Invite Card

**Premium Invite Card:**
- Team avatar/initials
- Team name
- Inviter name
- Accept button (primary)
- Decline button (outline)
- View Team link
- Pending animation

---

## PHASE 6: MATCH HISTORY - OPPONENT VISIBILITY

### 6.1 Fix Opponent Display in Completed Matches

**MyMatchCard.tsx Update:**
```typescript
// Show opponent when match is completed
const showOpponentIdentity = 
  ['completed', 'admin_resolved', 'finished'].includes(match.status) || 
  (match.status !== 'ready_check' && match.status !== 'full') || 
  allReady;
```

**MatchDetails.tsx Update:**
- In completed state, always show full opponent details
- Result badge (WON/LOST) prominent
- Final score if applicable
- Match duration

**Match History View:**
- List of past matches
- Opponent visible in each
- Result color-coded
- Earnings shown
- Click to view full details

---

## PHASE 7: RESPONSIVE DESIGN (MOBILE FIRST)

### 7.1 Breakpoint Strategy

```css
/* Mobile First Approach */
sm: 640px   /* Large phones, small tablets */
md: 768px   /* Tablets */
lg: 1024px  /* Laptops */
xl: 1280px  /* Desktops */
2xl: 1536px /* Large desktops */
```

### 7.2 Sidebar to Bottom Nav

**Mobile Navigation (< 1024px):**
```typescript
// New component: BottomNav.tsx
const navItems = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Swords, label: 'Matches', href: '/matches' },
  { icon: Gamepad2, label: 'My Games', href: '/my-matches' },
  { icon: Wallet, label: 'Wallet', href: '/wallet' },
  { icon: User, label: 'Profile', href: '/profile' },
];

<nav className="fixed bottom-0 left-0 right-0 lg:hidden">
  {/* Safe area padding */}
  {/* Active indicator animation */}
</nav>
```

### 7.3 Mobile Match Cards

**Vertical Layout:**
- Full width cards
- Larger touch targets (min 44px)
- Swipe actions (optional)
- Collapsible details

### 7.4 Mobile Modals

**Full Screen Sheets:**
- Dialogs become sheets
- Slide from bottom
- Handle indicator
- Full width buttons
- Keyboard aware

### 7.5 Touch Targets

**All Interactive Elements:**
- Minimum 44x44px
- Adequate spacing between
- Clear feedback on tap
- No hover-only content

---

## PHASE 8: ANIMATIONS & MICROINTERACTIONS

### 8.1 Page Transitions

```typescript
// AnimatedPage wrapper
<motion.div
  initial={{ opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
>
  {children}
</motion.div>
```

### 8.2 Card Stagger Animation

```typescript
// Stagger children on grid mount
{items.map((item, i) => (
  <motion.div
    key={item.id}
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: i * 0.05, duration: 0.3 }}
  >
    <Card />
  </motion.div>
))}
```

### 8.3 Button Interactions

```css
/* All buttons */
.btn-premium {
  transition: all 0.2s ease;
}
.btn-premium:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}
.btn-premium:active {
  transform: translateY(0) scale(0.98);
}
```

### 8.4 Notification Bell Pulse

```typescript
// When unreadCount > 0
<Bell className={cn(
  "w-5 h-5",
  unreadCount > 0 && "animate-bell-ring"
)} />
```

### 8.5 Loader Animations

```typescript
// Premium loader with brand colors
<div className="relative w-8 h-8">
  <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
  <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
</div>
```

### 8.6 Skeleton Shimmer

```css
.skeleton-premium {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 0%,
    hsl(var(--muted-foreground)/0.1) 50%,
    hsl(var(--muted)) 100%
  );
  background-size: 200% 100%;
  animation: shimmer-premium 1.5s ease-in-out infinite;
}
```

---

## PHASE 9: ACCESSIBILITY & PERFORMANCE

### 9.1 Color Contrast

**Minimum Ratios:**
- Text: 4.5:1 (AA)
- Large text: 3:1
- UI components: 3:1

### 9.2 Focus States

```css
*:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}
```

### 9.3 Performance Optimization

- CSS animations only (no JS-based loops)
- `will-change` on animated elements
- Lazy load images
- Reduce DOM repaints
- GPU-accelerated transforms

### 9.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## IMPLEMENTATION ORDER

### Priority 1 (Critical Foundation)
1. Design system tokens (index.css, tailwind.config.ts)
2. Core UI components (Button, Card, Badge, Input)
3. Layout components (Header, Sidebar, Footer)
4. Mobile navigation (BottomNav)

### Priority 2 (Key Pages)
5. Home page redesign
6. Match Card component
7. Live Matches page
8. My Matches page
9. Match Details page

### Priority 3 (Full Coverage)
10. Wallet page (with collapsible history)
11. Profile page
12. Teams pages
13. Challenges page
14. Leaderboard page

### Priority 4 (Polish)
15. Notifications dropdown (with invites)
16. Remove Notifications page
17. Admin pages
18. Empty states
19. Loading skeletons
20. Final animations

---

## FILES TO CREATE/MODIFY

### New Files
- `src/components/layout/BottomNav.tsx`
- `src/components/ui/premium/PremiumCard.tsx`
- `src/components/ui/premium/PremiumButton.tsx`
- `src/components/common/AnimatedPage.tsx`
- `src/components/common/PremiumEmptyState.tsx`
- `src/components/common/PremiumLoader.tsx`
- `src/lib/animations.ts` (animation utilities)

### Modified Files (Core)
- `src/index.css` - Design tokens
- `tailwind.config.ts` - Animation keyframes
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/tabs.tsx`
- `src/components/ui/skeleton.tsx`

### Modified Files (Layout)
- `src/components/layout/Header.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/Footer.tsx`
- `src/components/layout/MainLayout.tsx`

### Modified Files (Pages)
- All pages in `src/pages/`

### Removed Files
- `src/pages/Notifications.tsx` (route disabled, file kept for reference)

---

## TEST CHECKLIST

### Visual Verification
- [ ] All buttons have hover/active/focus/disabled states
- [ ] All cards have proper shadows and borders
- [ ] Color contrast passes AA standards
- [ ] Typography hierarchy is clear
- [ ] Spacing is consistent (8px grid)

### Animation Verification
- [ ] Page transitions smooth
- [ ] Card entrances staggered
- [ ] Hover effects performant
- [ ] Loading states polished
- [ ] No layout shifts

### Mobile Verification
- [ ] Bottom nav works on all screens
- [ ] Cards stack vertically
- [ ] Modals become sheets
- [ ] Touch targets >= 44px
- [ ] No horizontal scroll

### Functionality Verification
- [ ] 1v1 match flow: create -> join -> ready -> result
- [ ] 2v2/3v3/4v4 match flow
- [ ] Team invites work from notification panel
- [ ] Wallet transactions collapsible
- [ ] Admin resolve buttons work
- [ ] Opponent visible when match completed

---

## SUCCESS METRICS

The redesign is complete when:
1. Every page looks cohesive and premium
2. Every interaction has appropriate feedback
3. Mobile experience is flawless
4. No "basic" or unstyled elements remain
5. Performance is maintained (60fps animations)
6. All existing functionality preserved

