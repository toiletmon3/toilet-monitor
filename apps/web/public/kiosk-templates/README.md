# Kiosk template assets

Static background artwork for image-based kiosk templates, served at
`/kiosk-templates/<file>` (Vite copies `public/` verbatim to the web root).

## `neon-image-bg.png` — background for the "Image Background" (`neon-image`) kiosk template

Drop the designer's PNG here with **exactly** this filename:

```
apps/web/public/kiosk-templates/neon-image-bg.png
```

Requirements:
- **Format:** PNG
- **Aspect ratio:** 9:16 (portrait)
- **Resolution:** 1080×1920 (matches the hotspot coordinates in
  `apps/web/src/modules/kiosk/templates/neon-image/KioskPageNeonImage.tsx`)

The component overlays transparent, clickable hotspots on top of each button in
the artwork. To fine-tune hotspot positions, open the kiosk with `?hotspots=1`
appended to the URL — every hotspot is then outlined and labelled.

If this file is missing the template still loads (no build break) — you just see
a black background with invisible-but-working hotspots.
