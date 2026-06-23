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
- **Aspect ratio:** ~9:16 (portrait)
- **Resolution:** the current artwork is 1536×2752; the wrapper's
  `IMG_W`/`IMG_H` in
  `apps/web/src/modules/kiosk/templates/neon-image/KioskPageNeonImage.tsx`
  must match the file's real pixel dimensions so the hotspots stay aligned.

The component overlays transparent, clickable hotspots on top of each button in
the artwork. To fine-tune hotspot positions, open the kiosk with `?hotspots=1`
appended to the URL — every hotspot is then outlined and labelled.

If this file is missing the template still loads (no build break) — you just see
a black background with invisible-but-working hotspots.
