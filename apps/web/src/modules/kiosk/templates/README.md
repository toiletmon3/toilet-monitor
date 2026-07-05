# Kiosk UI Templates

Alternative kiosk look-and-feels you can swap in without touching the default
kiosk (`../KioskPage.tsx`). Each template is self-contained in its own folder.

## Available templates

### `neon/`
Pure-black background with glowing cyan (`#00E5FF`) neon borders,
Lucide icons with drop-shadow glow, minimalist header
("תודה על העזרה!" + Clock/Timer stats).

Based on the Figma Make "Feedback Interface Design" brief.

Files:
- `KioskPageNeon.tsx` — drop-in replacement for `KioskPage.tsx`
- `KioskButtonNeon.tsx` — drop-in replacement for `../components/KioskButton.tsx`

### `neon-image/`
Uses the designer's exact PNG mockup as a full-screen background and overlays
transparent, clickable hotspot buttons on top of each tile in the artwork.
Unlike `neon` / `neon-pro` (which recreate the buttons in CSS/SVG), nothing is
re-drawn — the image *is* the design, and only the tap targets are real DOM.

- `KioskPageNeonImage.tsx` — image background + percentage-positioned hotspots
  wired to the same `handleIssuePress(code)` logic as every other template.
- Background file: `apps/web/public/kiosk-templates/neon-image-bg.png`
  (1080×1920 PNG, 9:16). A missing file does not break the build.
- Hotspot coordinates are defined in the `HOTSPOTS` array; open the kiosk with
  `?hotspots=1` to outline and label every hotspot while tuning.

### `neon-video/`
Same hotspot approach as `neon-image`, but the background is a short MP4 that
plays in an infinite loop (`autoPlay muted loop playsInline`, so kiosk browsers
start it without a user gesture). The animated video *is* the design — only the
tap targets are real DOM.

- `KioskPageNeonVideo.tsx` — looping video background + percentage-positioned
  hotspots wired to the same `handleIssuePress(code)` logic as every other template.
- Background file: `apps/web/public/kiosk-templates/neon-video-bg.mp4`
  (576×1024 H.264, ~4s loop). A missing file does not break the build.
- Hotspot coordinates are defined in the `HOTSPOTS` array; open the kiosk with
  `?hotspots=1` to outline and label every hotspot while tuning.

Activated via the admin theme picker (theme ids `neon-image` / `neon-video`) —
no App.tsx edit needed; `KioskDispatcher` renders the matching template when the
device's template theme matches.

## How to activate a template

Edit **`apps/web/src/App.tsx`**:

```tsx
// Default:
import KioskPage from './modules/kiosk/KioskPage';

// Switch to neon template:
import KioskPage from './modules/kiosk/templates/neon/KioskPageNeon';
```

No other changes are required — the route (`/kiosk/:deviceCode`) stays the same,
and all other kiosk screens (selector, confirmation, cleaner check-in)
keep their default style.

## How to revert

Just swap the import back to the default `./modules/kiosk/KioskPage`.

## Adding a new template

1. Create a new folder under `templates/` (e.g. `templates/minimal/`).
2. Copy `KioskPage.tsx` + `components/KioskButton.tsx` into it.
3. Fix the relative imports (they need extra `../` levels from `templates/<name>/`):
   - `../../i18n` → `../../../../i18n`
   - `../../lib/api` → `../../../../lib/api`
   - `./components/KioskButton` → `./KioskButtonXxx`
   - `./components/KioskConfirmation` → `../../components/KioskConfirmation`
   - `./components/CleanerCheckIn` → `../../components/CleanerCheckIn`
4. Restyle to your heart's content.
5. Document it here.
