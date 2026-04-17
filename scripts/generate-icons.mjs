/**
 * Generates icon-192.png and icon-512.png for the PWA manifest.
 * Uses only Node.js built-ins (zlib) — no extra dependencies needed.
 *
 * Icon design: dark background (#0a0e1a) with a cyan (#00e5cc) toilet/restroom symbol.
 */

import { deflateRawSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'apps', 'web', 'public');

// ─── PNG helpers ───────────────────────────────────────────────────────────────
function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([typeBytes, data]);
  const crcVal = Buffer.alloc(4);
  crcVal.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}

function makePNG(size, drawFn) {
  const pixels = new Uint8Array(size * size * 3);

  // Background: #0a0e1a (dark navy)
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3 + 0] = 0x0a;
    pixels[i * 3 + 1] = 0x0e;
    pixels[i * 3 + 2] = 0x1a;
  }

  drawFn(pixels, size);

  // Build raw scanlines (filter byte 0 = None before each row)
  const rowBytes = size * 3;
  const raw = Buffer.alloc((1 + rowBytes) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (1 + rowBytes)] = 0; // filter type None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 3;
      const dst = y * (1 + rowBytes) + 1 + x * 3;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
    }
  }

  const compressed = deflateRawSync(raw, { level: 9 });

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG magic
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── draw helpers ──────────────────────────────────────────────────────────────
function setPixel(pixels, size, x, y, r, g, b) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 3;
  pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
}

function fillCircle(pixels, size, cx, cy, radius, r, g, b) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) setPixel(pixels, size, x, y, r, g, b);
    }
  }
}

function fillRect(pixels, size, x0, y0, w, h, r, g, b) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPixel(pixels, size, x, y, r, g, b);
}

function fillRoundRect(pixels, size, x0, y0, w, h, radius, r, g, b) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const inCorner = (
        (x < x0 + radius && y < y0 + radius && (x - (x0 + radius)) ** 2 + (y - (y0 + radius)) ** 2 > radius * radius) ||
        (x > x0 + w - radius && y < y0 + radius && (x - (x0 + w - radius)) ** 2 + (y - (y0 + radius)) ** 2 > radius * radius) ||
        (x < x0 + radius && y > y0 + h - radius && (x - (x0 + radius)) ** 2 + (y - (y0 + h - radius)) ** 2 > radius * radius) ||
        (x > x0 + w - radius && y > y0 + h - radius && (x - (x0 + w - radius)) ** 2 + (y - (y0 + h - radius)) ** 2 > radius * radius)
      );
      if (!inCorner) setPixel(pixels, size, x, y, r, g, b);
    }
  }
}

// ─── icon drawing ──────────────────────────────────────────────────────────────
// Cyan: 0x00, 0xe5, 0xcc
const CR = 0x00, CG = 0xe5, CB = 0xcc;
// Card bg: #1a1f2e
const BR = 0x1a, BG = 0x1f, BB = 0x2e;

function drawIcon(pixels, size) {
  const s = size / 192; // scale factor

  // Outer rounded card
  const pad = Math.round(16 * s);
  fillRoundRect(pixels, size, pad, pad, size - pad * 2, size - pad * 2, Math.round(24 * s), BR, BG, BB);

  // Cyan border ring (just inner 4px of the card rect)
  const bw = 3; // border width pixels
  for (let i = 0; i < bw; i++) {
    const r = Math.round(24 * s) - i;
    const x0 = pad + i, y0 = pad + i, w = size - pad * 2 - i * 2, h = size - pad * 2 - i * 2;
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const inCorner = (
          (x < x0 + r && y < y0 + r && (x - (x0 + r)) ** 2 + (y - (y0 + r)) ** 2 > r * r) ||
          (x > x0 + w - r && y < y0 + r && (x - (x0 + w - r)) ** 2 + (y - (y0 + r)) ** 2 > r * r) ||
          (x < x0 + r && y > y0 + h - r && (x - (x0 + r)) ** 2 + (y - (y0 + h - r)) ** 2 > r * r) ||
          (x > x0 + w - r && y > y0 + h - r && (x - (x0 + w - r)) ** 2 + (y - (y0 + h - r)) ** 2 > r * r)
        );
        if (!inCorner) {
          const onEdge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1;
          if (onEdge) setPixel(pixels, size, x, y, CR, CG, CB);
        }
      }
    }
  }

  // Toilet icon (simplified stylized)
  const cx = size / 2;

  // Bowl - ellipse-ish using circles
  const bowlY = Math.round(size * 0.58);
  const bowlW = Math.round(size * 0.28);
  const bowlH = Math.round(size * 0.22);
  for (let y = bowlY - bowlH; y <= bowlY + bowlH; y++) {
    const dy = (y - bowlY) / bowlH;
    const hw = Math.round(bowlW * Math.sqrt(Math.max(0, 1 - dy * dy)));
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      setPixel(pixels, size, x, y, CR, CG, CB);
    }
  }

  // Seat ring (hollow ellipse on top of bowl)
  const seatY = Math.round(size * 0.44);
  const seatW = Math.round(size * 0.3);
  const seatH = Math.round(size * 0.1);
  const seatThick = Math.max(2, Math.round(size * 0.04));
  for (let y = seatY - seatH; y <= seatY + seatH; y++) {
    const dy = (y - seatY) / seatH;
    const outerHW = Math.round(seatW * Math.sqrt(Math.max(0, 1 - dy * dy)));
    const innerSW = seatW - seatThick, innerSH = seatH - seatThick;
    const innerHW = innerSW > 0 ? Math.round(innerSW * Math.sqrt(Math.max(0, 1 - (dy * seatH / innerSH) ** 2))) : 0;
    for (let x = Math.round(cx - outerHW); x <= Math.round(cx + outerHW); x++) {
      if (Math.abs(x - cx) > innerHW || Math.abs(dy) > (innerSH / seatH)) {
        setPixel(pixels, size, x, y, CR, CG, CB);
      }
    }
  }

  // Tank (rectangle above seat)
  const tankW = Math.round(size * 0.22);
  const tankH = Math.round(size * 0.18);
  const tankY = Math.round(size * 0.22);
  fillRoundRect(pixels, size,
    Math.round(cx - tankW / 2), tankY,
    tankW, tankH,
    Math.max(2, Math.round(size * 0.025)),
    CR, CG, CB
  );

  // Small dark hole in center of bowl
  fillCircle(pixels, size, cx, bowlY, Math.round(size * 0.07), BR, BG, BB);
}

// ─── generate ──────────────────────────────────────────────────────────────────
mkdirSync(publicDir, { recursive: true });

for (const size of [192, 512]) {
  const png = makePNG(size, drawIcon);
  const outPath = join(publicDir, `icon-${size}.png`);
  writeFileSync(outPath, png);
  console.log(`✅ Generated ${outPath} (${png.length} bytes)`);
}

console.log('🎉 Icons generated!');
