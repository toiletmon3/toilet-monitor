/**
 * Custom hand-drawn SVG cleaning icons for the "Neon Pro" kiosk wallpaper.
 * Single-colour line art (uses currentColor) so a neon glow can be applied
 * via CSS filter. Designed to match the reference mockup closely.
 */

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const base = (size: number, style?: React.CSSProperties): React.SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 64 64',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  style,
});

/* ─────────── TOILET PAPER ─────────── */
export function ToiletPaperIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* Outer roll — slightly oval to give 3D feel */}
      <ellipse cx="24" cy="26" rx="14" ry="13" />
      {/* Inner cardboard tube */}
      <ellipse cx="24" cy="26" rx="4" ry="4" />
      {/* Highlight curve on top of roll */}
      <path d="M14 22 Q 20 16 30 17" />
      {/* Paper sheet hanging down on the right */}
      <path d="M38 26 C 44 32, 47 40, 46 50" />
      <path d="M38 30 C 42 36, 44 44, 42 52" />
      {/* Zig-zag perforated edge */}
      <path d="M42 52 l 1.5 -2 l 1.5 2 l 1.5 -2 l 1.5 2" />
    </svg>
  );
}

/* ─────────── FLOOR CLEANING (broom + bucket + sparkles) ─────────── */
export function FloorCleaningIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* Sparkles top-left */}
      <path d="M10 8 l1 2.5 l2.5 1 l-2.5 1 l-1 2.5 l-1 -2.5 l-2.5 -1 l2.5 -1 z" />
      <path d="M48 6 l0.8 2 l2 0.8 l-2 0.8 l-0.8 2 l-0.8 -2 l-2 -0.8 l2 -0.8 z" />
      <circle cx="20" cy="14" r="0.8" fill="currentColor" stroke="none" />

      {/* Broom handle (diagonal, going into bucket) */}
      <path d="M44 12 L 28 32" />

      {/* Broom head — angled rectangle */}
      <path d="M22 28 L 32 38 L 28 44 L 18 34 z" />
      {/* Bristle lines */}
      <path d="M19 36 L 16 40" />
      <path d="M22 39 L 19 44" />
      <path d="M25 42 L 23 47" />

      {/* Bucket — trapezoid */}
      <path d="M14 46 L 50 46 L 47 60 L 17 60 z" />
      {/* Bucket rim */}
      <path d="M14 46 L 50 46" />
      {/* Bucket handle (curved arc above) */}
      <path d="M22 46 Q 32 38 42 46" />
    </svg>
  );
}

/* ─────────── TRASH BIN (pedal-style with lid) ─────────── */
export function TrashIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* Lid handle (small bump on top) */}
      <path d="M28 10 L 36 10" />
      {/* Lid (oval seen from front) */}
      <ellipse cx="32" cy="16" rx="20" ry="3" />
      {/* Lid bottom edge */}
      <path d="M12 16 L 12 19" />
      <path d="M52 16 L 52 19" />
      {/* Body */}
      <path d="M14 19 L 18 56 Q 18 60, 22 60 L 42 60 Q 46 60, 46 56 L 50 19" />
      {/* Vertical ridges on body */}
      <path d="M22 22 L 23 56" />
      <path d="M32 22 L 32 56" />
      <path d="M42 22 L 41 56" />
    </svg>
  );
}

/* ─────────── TOILET (bowl + tank + brush in holder beside) ─────────── */
export function ToiletIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* Tank */}
      <path d="M10 6 L 32 6 L 32 22 L 10 22 z" />
      {/* Flush button on tank */}
      <rect x="18" y="10" width="6" height="3" rx="1" />

      {/* Bowl seat (oval top) */}
      <ellipse cx="21" cy="24" rx="14" ry="3" />
      {/* Bowl body */}
      <path d="M9 24 Q 9 38, 14 42 L 28 42 Q 33 38, 33 24" />
      {/* Bowl base / pedestal */}
      <path d="M16 42 L 14 56 L 28 56 L 26 42" />

      {/* — Toilet brush in its holder, standing beside on the right — */}
      {/* Holder cup */}
      <path d="M44 44 L 56 44 L 54 60 L 46 60 z" />
      {/* Brush handle going up out of the holder */}
      <path d="M50 44 L 50 14" />
      {/* Brush head at top — oval/round bristles */}
      <ellipse cx="50" cy="11" rx="5" ry="4" />
      {/* Bristle dots/lines around the head */}
      <path d="M46 9 L 44 8" />
      <path d="M46 11 L 44 11" />
      <path d="M46 13 L 44 14" />
      <path d="M54 9 L 56 8" />
      <path d="M54 11 L 56 11" />
      <path d="M54 13 L 56 14" />
      <path d="M50 7 L 50 5" />
    </svg>
  );
}

/* ─────────── WRENCH + SCREWDRIVER (crossed) ─────────── */
export function WrenchIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* — Screwdriver (top-left → bottom-right diagonal) — */}
      {/* Handle */}
      <path d="M6 10 L 18 22 L 14 26 L 2 14 z" />
      {/* Handle ridges */}
      <path d="M6 14 L 10 18" />
      <path d="M9 11 L 13 15" />
      {/* Shaft */}
      <path d="M18 22 L 38 42" />
      {/* Tip */}
      <path d="M38 42 L 42 42 L 42 46 L 38 46 z" transform="rotate(45 40 44)" />

      {/* — Wrench (top-right → bottom-left diagonal) — */}
      {/* Open jaw at top */}
      <path d="M52 6 a 7 7 0 1 0 6 12 l -3 -3 l 3 -3 l -3 -3 z" />
      {/* Shaft */}
      <path d="M50 16 L 28 38" />
      {/* Closed end */}
      <circle cx="24" cy="42" r="6" />
      <circle cx="24" cy="42" r="2" />
    </svg>
  );
}

/* ─────────── SOAP DISPENSER (pump bottle + hand catching soap) ─────────── */
export function SoapIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* Bubbles above pump */}
      <circle cx="46" cy="4" r="1.5" />
      <circle cx="50" cy="8" r="1" />
      <circle cx="42" cy="9" r="1" />

      {/* Pump cap (top dome) */}
      <path d="M40 12 L 50 12 L 50 16 L 40 16 z" />
      {/* Nozzle going left */}
      <path d="M40 14 L 30 14 L 30 18" />

      {/* Bottle neck */}
      <path d="M38 16 L 38 22 L 52 22 L 52 16" />
      {/* Bottle body */}
      <path d="M36 22 L 54 22 L 56 46 L 34 46 z" />
      {/* Label band */}
      <path d="M36 30 L 56 30" />
      <path d="M36 38 L 56 38" />

      {/* Soap drop falling from nozzle */}
      <path d="M30 21 q -1 2 0 4 q 1 -2 0 -4 z" fill="currentColor" stroke="none" />
      <path d="M30 27 q -1 2 0 4 q 1 -2 0 -4 z" fill="currentColor" stroke="none" />

      {/* Hand below catching the soap (palm shape) */}
      <path d="M6 38 Q 12 34 20 36 L 22 38" />
      <path d="M4 44 Q 14 52 26 50 L 28 58 L 6 58 Q 2 52 4 44 z" />
      {/* Thumb */}
      <path d="M22 38 Q 25 38 25 42" />
    </svg>
  );
}

/* ─────────── SMILE / POSITIVE FEEDBACK ─────────── */
export function SmileIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      <circle cx="32" cy="32" r="22" />
      <circle cx="24" cy="26" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="40" cy="26" r="2.2" fill="currentColor" stroke="none" />
      <path d="M22 36 Q 32 47 42 36" />
    </svg>
  );
}
