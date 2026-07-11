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

## `neon-video-he.mp4` / `neon-video-en.mp4` — backgrounds for the "Video Background" (`neon-video`) kiosk template

Drop the looping videos here with **exactly** these filenames (one per language;
the on-kiosk עב/EN toggle switches between them):

```
apps/web/public/kiosk-templates/neon-video-he.mp4
apps/web/public/kiosk-templates/neon-video-en.mp4
```

Requirements:
- **Format:** MP4 (H.264) — plays on every Android/iOS kiosk browser
- **Aspect ratio:** ~9:16 (portrait); short clip (a few seconds) that loops seamlessly
- **Resolution:** the current videos are 576×1024; the wrapper's
  `VID_W`/`VID_H` in
  `apps/web/src/modules/kiosk/templates/neon-video/KioskPageNeonVideo.tsx`
  must match the files' real pixel dimensions so the hotspots stay aligned.
- The button-tile layout must be identical in both videos — one hotspot set
  serves both languages.
- The stat text ("משתמשים השבוע" / response time) must NOT be baked into the
  artwork — the component overlays the complete sentences next to the ✦/🕐
  icons. Only the icons belong in the video.
- Keep each file small (≲2 MB) — kiosks re-download it after every deploy cache-bust.

The videos play muted in an infinite loop (`autoPlay muted loop playsInline`),
with the same transparent hotspot overlay as `neon-image`. Fine-tune with
`?hotspots=1`. Bump the `?v=` cache-buster in `VIDEO_URLS` when replacing a file.

If a file is missing the template still loads (no build break) — you just see
a black background with invisible-but-working hotspots.

`neon-video-bg.mp4` (the old single-language background) is kept for one
release so kiosks still running the previous service-worker bundle don't 404 on
it mid-transition; delete it in the next release.
