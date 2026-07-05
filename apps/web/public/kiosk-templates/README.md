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

## `neon-video-bg.mp4` — background for the "Video Background" (`neon-video`) kiosk template

Drop the looping video here with **exactly** this filename:

```
apps/web/public/kiosk-templates/neon-video-bg.mp4
```

Requirements:
- **Format:** MP4 (H.264) — plays on every Android/iOS kiosk browser
- **Aspect ratio:** ~9:16 (portrait); short clip (a few seconds) that loops seamlessly
- **Resolution:** the current video is 576×1024; the wrapper's
  `VID_W`/`VID_H` in
  `apps/web/src/modules/kiosk/templates/neon-video/KioskPageNeonVideo.tsx`
  must match the file's real pixel dimensions so the hotspots stay aligned.
- Keep it small (≲2 MB) — kiosks re-download it after every deploy cache-bust.

The video plays muted in an infinite loop (`autoPlay muted loop playsInline`),
with the same transparent hotspot overlay as `neon-image`. Fine-tune with
`?hotspots=1`. Bump the `?v=` cache-buster in `VIDEO_URL` when replacing the file.

If this file is missing the template still loads (no build break) — you just see
a black background with invisible-but-working hotspots.
