/**
 * Custom hand-drawn SVG cleaning icons for the "Neon Pro" kiosk wallpaper.
 * Single-colour line art (uses currentColor) so a neon glow can be applied
 * via CSS filter. Stroke 1.6 for a clean, modern look.
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
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  style,
});

export function ToiletPaperIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* outer roll */}
      <ellipse cx="22" cy="28" rx="14" ry="14" />
      {/* inner cardboard */}
      <ellipse cx="22" cy="28" rx="5" ry="5" />
      {/* paper hanging down with zig-zag tear */}
      <path d="M36 28 Q 44 32 46 40 Q 48 48 44 54" />
      <path d="M44 54 l 2 -3 l 2 3 l 2 -3 l 2 3" />
      {/* small highlight on roll */}
      <path d="M14 22 Q 18 18 22 18" />
    </svg>
  );
}

export function FloorCleaningIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* sparkles top-left */}
      <path d="M14 10 l1.5 3 l3 1.5 l-3 1.5 l-1.5 3 l-1.5 -3 l-3 -1.5 l3 -1.5 z" />
      <path d="M50 14 l1 2 l2 1 l-2 1 l-1 2 l-1 -2 l-2 -1 l2 -1 z" />
      {/* broom handle */}
      <path d="M40 14 L 24 30" />
      {/* broom head */}
      <path d="M22 28 L 30 36 L 26 42 L 18 34 z" />
      {/* bristles */}
      <path d="M19 36 L 16 40" />
      <path d="M22 39 L 19 43" />
      <path d="M25 42 L 22 46" />
      {/* bucket */}
      <path d="M16 44 L 50 44 L 46 58 L 20 58 z" />
      {/* bucket handle */}
      <path d="M22 44 Q 33 36 44 44" />
    </svg>
  );
}

export function TrashIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* lid */}
      <path d="M10 18 L 54 18" />
      <path d="M22 14 L 42 14 L 42 18 L 22 18 z" />
      {/* body */}
      <path d="M14 18 L 18 56 L 46 56 L 50 18" />
      {/* vertical lines */}
      <path d="M24 24 L 26 50" />
      <path d="M32 24 L 32 50" />
      <path d="M40 24 L 38 50" />
    </svg>
  );
}

export function ToiletIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* tank */}
      <path d="M16 8 L 36 8 L 36 22 L 16 22 z" />
      {/* flush button */}
      <circle cx="26" cy="15" r="2" />
      {/* bowl */}
      <path d="M14 22 L 38 22 L 36 38 Q 34 44 26 44 Q 18 44 16 38 z" />
      {/* base */}
      <path d="M20 44 L 18 56 L 34 56 L 32 44" />
      {/* brush handle (top right) */}
      <path d="M48 8 L 42 24" />
      {/* brush head */}
      <ellipse cx="40" cy="28" rx="5" ry="3" transform="rotate(-20 40 28)" />
      {/* brush bristles */}
      <path d="M37 30 L 35 33" />
      <path d="M40 31 L 38 34" />
      <path d="M43 30 L 42 34" />
    </svg>
  );
}

export function WrenchIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* wrench - diagonal from top-left to bottom-right */}
      <path d="M10 18 a 6 6 0 1 1 8 -8 l -3 3 l 3 3 l 3 -3 l 8 8 L 46 39 l 6 6 a 4 4 0 0 1 -6 6 l -6 -6 L 21 28 l -8 -8 z" />
      {/* screwdriver - diagonal from top-right to bottom-left */}
      <path d="M52 12 L 44 20 L 28 36 L 22 42 a 4 4 0 0 0 6 6 l 6 -6 L 50 28 L 58 20 z" />
      {/* screwdriver handle ridges */}
      <path d="M50 14 L 54 18" />
      <path d="M48 16 L 52 20" />
    </svg>
  );
}

export function SoapIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      {/* soap bubbles above */}
      <circle cx="42" cy="6" r="2" />
      <circle cx="48" cy="10" r="1.5" />
      <circle cx="38" cy="11" r="1.2" />
      {/* dispenser cap */}
      <path d="M36 14 L 50 14 L 50 22 L 36 22 z" />
      {/* nozzle */}
      <path d="M36 18 L 26 18 L 26 22" />
      {/* bottle */}
      <path d="M34 22 L 52 22 L 54 50 L 32 50 z" />
      {/* label band */}
      <path d="M34 32 L 53 32" />
      <path d="M34 38 L 53 38" />
      {/* hand below catching soap */}
      <path d="M8 40 Q 14 36 20 38" />
      <path d="M6 44 Q 16 50 28 50 L 30 56 L 8 56 Q 4 52 6 44 z" />
      {/* drop falling */}
      <path d="M26 26 q -1 3 0 5 q 1 -2 0 -5 z" />
    </svg>
  );
}

export function SmileIcon({ size = 56, className, style }: IconProps) {
  return (
    <svg {...base(size, style)} className={className}>
      <circle cx="32" cy="32" r="22" />
      <circle cx="24" cy="26" r="2" fill="currentColor" stroke="none" />
      <circle cx="40" cy="26" r="2" fill="currentColor" stroke="none" />
      <path d="M22 36 Q 32 46 42 36" />
    </svg>
  );
}
