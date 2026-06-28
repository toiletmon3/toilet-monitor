/**
 * Generates admin-icon-192.png and admin-icon-512.png for the ADMIN PWA.
 * Node built-ins only (zlib) — no deps, mirrors generate-icons.mjs.
 *
 * Design: brand card (#0a0e1a bg, #1a1f2e card, cyan #00e5cc border) with a
 * settings GEAR + an open-end WRENCH across it.
 */
import { deflateSync } from 'zlib';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'apps', 'web', 'public');

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcVal = Buffer.alloc(4); crcVal.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([len, typeBytes, data, crcVal]);
}
function makePNG(size, drawFn) {
  const px = new Uint8Array(size * size * 3);
  for (let i = 0; i < size * size; i++) { px[i*3] = 0x0a; px[i*3+1] = 0x0e; px[i*3+2] = 0x1a; }
  drawFn(px, size);
  const rowBytes = size * 3;
  const raw = Buffer.alloc((1 + rowBytes) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (1 + rowBytes)] = 0;
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 3, d = y * (1 + rowBytes) + 1 + x * 3;
      raw[d] = px[s]; raw[d+1] = px[s+1]; raw[d+2] = px[s+2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function setPixel(px, size, x, y, r, g, b) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 3; px[i] = r; px[i+1] = g; px[i+2] = b;
}

// colors
const CY = [0x00, 0xe5, 0xcc];      // cyan
const CARD = [0x1a, 0x1f, 0x2e];    // card bg
const BG = [0x0a, 0x0e, 0x1a];      // page bg

function fillRoundRect(px, size, x0, y0, w, h, rad, c) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const inCorner = (
      (x < x0+rad && y < y0+rad && (x-(x0+rad))**2 + (y-(y0+rad))**2 > rad*rad) ||
      (x > x0+w-rad && y < y0+rad && (x-(x0+w-rad))**2 + (y-(y0+rad))**2 > rad*rad) ||
      (x < x0+rad && y > y0+h-rad && (x-(x0+rad))**2 + (y-(y0+h-rad))**2 > rad*rad) ||
      (x > x0+w-rad && y > y0+h-rad && (x-(x0+w-rad))**2 + (y-(y0+h-rad))**2 > rad*rad)
    );
    if (!inCorner) setPixel(px, size, x, y, ...c);
  }
}

// Gear centered at (cx,cy): toothed disk with a hole. Returns nothing.
function gearRadiusAt(ang, baseR, toothH, teeth) {
  // normalized position within a tooth period (0..1)
  let t = (ang / (2 * Math.PI)) * teeth;
  t = t - Math.floor(t);
  // tooth occupies ~45% of the period with small flats between
  const isTooth = t < 0.42;
  return baseR + (isTooth ? toothH : 0);
}
function drawGear(px, size, cx, cy, baseR, toothH, holeR, teeth, c) {
  const outer = baseR + toothH + 1;
  for (let y = Math.floor(cy - outer); y <= Math.ceil(cy + outer); y++) {
    for (let x = Math.floor(cx - outer); x <= Math.ceil(cx + outer); x++) {
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx) + Math.PI; // 0..2pi
      const rEdge = gearRadiusAt(ang, baseR, toothH, teeth);
      if (d <= rEdge && d >= holeR) setPixel(px, size, x, y, ...c);
    }
  }
}

// Open-end wrench centered at (cx,cy), rotated by `angle`, drawn in color c,
// hollow parts cut in color `hole`.
function drawWrench(px, size, cx, cy, angle, len, width, jawR, c, hole) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const half = len / 2, hw = width / 2;
  const ends = [half, -half];
  const reach = jawR + 2;
  const minX = cx - len, maxX = cx + len, minY = cy - len, maxY = cy + len;
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      const dx = x - cx, dy = y - cy;
      const u = dx * ca + dy * sa;       // along handle
      const v = -dx * sa + dy * ca;      // across handle
      let on = false;
      // handle
      if (Math.abs(u) <= half && Math.abs(v) <= hw) on = true;
      // jaws (open-end ring with a wedge cut on the outward side)
      for (const e of ends) {
        const du = u - e, dist = Math.hypot(du, v);
        if (dist <= jawR) {
          // solid head, then carve inner hole + outward opening
          const innerHole = dist < jawR * 0.5;
          // outward opening: a wedge facing away from center (sign of e)
          const outward = (e > 0 ? du > 0 : du < 0);
          const openWedge = outward && Math.abs(v) < jawR * 0.42;
          if (!innerHole && !openWedge) on = true;
        }
      }
      if (on) setPixel(px, size, x, y, ...c);
      else {
        // carve the hollow centers/openings explicitly so they read on the gear
        for (const e of ends) {
          const du = u - e, dist = Math.hypot(du, v);
          const outward = (e > 0 ? du > 0 : du < 0);
          if ((dist < jawR * 0.5 && dist >= 0) || (dist <= reach && outward && Math.abs(v) < jawR * 0.42 && Math.abs(du) < jawR)) {
            // leave as-is (background/gear shows) — no-op, but keeps openings clean
          }
        }
      }
    }
  }
}

function fillCircleColor(px, size, cx, cy, radius, c) {
  for (let y = Math.floor(cy-radius); y <= Math.ceil(cy+radius); y++)
    for (let x = Math.floor(cx-radius); x <= Math.ceil(cx+radius); x++)
      if ((x-cx)**2 + (y-cy)**2 <= radius*radius) setPixel(px, size, x, y, ...c);
}

function draw(px, size) {
  const pad = Math.round(16 * size/192);
  // card + cyan corner border
  fillRoundRect(px, size, pad, pad, size - pad*2, size - pad*2, Math.round(28*size/192), CARD);
  const bw = Math.max(3, Math.round(3*size/192));
  for (let i = 0; i < bw; i++) {
    const rad = Math.round(28*size/192) - i, x0 = pad+i, y0 = pad+i, w = size-pad*2-i*2, h = size-pad*2-i*2;
    for (let y = y0; y < y0+h; y++) for (let x = x0; x < x0+w; x++) {
      const inCorner = (
        (x < x0+rad && y < y0+rad && (x-(x0+rad))**2 + (y-(y0+rad))**2 > rad*rad) ||
        (x > x0+w-rad && y < y0+rad && (x-(x0+w-rad))**2 + (y-(y0+rad))**2 > rad*rad) ||
        (x < x0+rad && y > y0+h-rad && (x-(x0+rad))**2 + (y-(y0+h-rad))**2 > rad*rad) ||
        (x > x0+w-rad && y > y0+h-rad && (x-(x0+w-rad))**2 + (y-(y0+h-rad))**2 > rad*rad)
      );
      if (!inCorner && (x===x0 || y===y0 || x===x0+w-1 || y===y0+h-1)) setPixel(px, size, x, y, ...CY);
    }
  }

  // Everything centered → balanced. Wrench sits BEHIND a centred gear, separated
  // by a clean gap ring so it never overlaps the gear.
  const cx = size/2, cy = size/2;
  const base = size*0.185, tooth = size*0.052, hole = size*0.072;
  const gearOuter = base + tooth;

  // 1) wrench behind, centred & point-symmetric (both jaws peek out equally)
  drawWrench(px, size, cx, cy, -Math.PI/4, size*0.70, size*0.078, size*0.092, CY, CARD);
  // 2) gap ring: clear a card-coloured disc around the gear so the wrench is
  //    visibly separate (appears to pass behind the gear)
  fillCircleColor(px, size, cx, cy, gearOuter + size*0.03, CARD);
  // 3) gear on top, centred
  drawGear(px, size, cx, cy, base, tooth, hole, 8, CY);
  // 4) clean centre hole
  fillCircleColor(px, size, cx, cy, hole, CARD);
}

for (const size of [192, 512]) {
  const buf = makePNG(size, draw);
  writeFileSync(join(publicDir, `admin-icon-${size}.png`), buf);
  console.log(`wrote admin-icon-${size}.png (${buf.length} bytes)`);
}
