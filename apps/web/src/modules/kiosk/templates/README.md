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
