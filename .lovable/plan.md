

# Spline Test Page - Admin-Only Background Test

## Overview

Create a new admin-protected page at `/admin/spline-test` that loads a Spline 3D scene as a fullscreen background with interactive controls for opacity, pointer events, and performance monitoring. Uses the existing `is_admin()` RPC check (same pattern as other admin pages).

---

## New Files

### 1. `src/pages/SplineTest.tsx`

Single self-contained page with:

**Admin Guard (same pattern as `Admin.tsx`):**
- Calls `supabase.rpc('is_admin')` on mount
- If not admin or not logged in: redirect to `/`
- Shows loading spinner while checking

**Spline Background Layer:**
- `position: fixed; inset: 0; z-index: 0; pointer-events: none` wrapper
- Dynamically loads `@splinetool/viewer` script via `useEffect` (appends `<script>` tag if not already present, checks for duplicates)
- Renders `<spline-viewer url="...">` web component inside the fixed wrapper
- Opacity controlled via inline style bound to state (default 0.85)
- Pointer events toggled via state (default off)
- Fallback: if script fails to load or errors, shows a dark aurora gradient background

**Overlay UI (z-index: 1, relative positioning):**
- Glass card centered on page with:
  - Title: "Spline Background Test"
  - Scene ID info text
  - Opacity slider (0.2 to 1.0, step 0.05) using existing `Slider` component
  - Toggle: "Pointer Events" (default OFF) using existing `Switch` component
  - Toggle: "Pause when tab hidden" (default ON) using existing `Switch` component
  - Button: "Open Spline in new tab" (opens scene URL)
  - Button: "Copy embed code" (copies HTML snippet to clipboard, shows toast)
- Status badge (bottom-right of card):
  - States: "Loading..." / "Loaded" (with load time in ms) / "Error"
  - Color-coded: yellow/green/red

**Page Visibility API:**
- Listens to `visibilitychange` event
- When tab hidden + "Pause" toggle ON: hides the spline-viewer (display: none) and shows "Paused" overlay
- When tab visible again: restores spline-viewer

**Script Loading Logic:**
```
1. Check if script tag with spline src already exists in DOM
2. If not: create script tag, set type="module", set src, append to body
3. Listen for load event -> set status "loaded" + record load time
4. Listen for error event -> set status "error" + show toast
```

**Embed Code (copied on button click):**
```html
<script type="module" src="https://unpkg.com/@splinetool/viewer/build/spline-viewer.js"></script>
<spline-viewer url="https://prod.spline.design/OsDg3A0bZO-AUr9b/scene.splinecode"></spline-viewer>
```

---

## Modified Files

### 2. `src/App.tsx`

- Add import for `SplineTest` page (lazy or direct)
- Add route: `<Route path="/admin/spline-test" element={<SplineTest />} />`

---

## Technical Details

**No database changes needed.** Admin check uses the existing `is_admin()` RPC.

**No new dependencies.** The Spline viewer is loaded as a script tag at runtime, not as an npm package. The page uses existing UI components: `Slider`, `Switch`, `Button`, `Card`, and `toast`.

**TypeScript:** Will need a `declare namespace JSX` or module declaration for the `spline-viewer` custom element to avoid TS errors. This will be added inline in the page file or in `src/vite-env.d.ts`.

**Mobile:** Page works on mobile but is optimized for 1920x1080 desktop. The glass card is responsive with max-width.

