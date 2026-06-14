import { useState } from 'react';

interface Props {
  IconCmp: (props: { size?: number | string; style?: React.CSSProperties }) => React.ReactElement;
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
  color?: string;
  /** Icon/label size multiplier set per template in admin (1 = 100%). */
  scale?: number;
  /** Tile position — offsets the LED animation so colour flows between cubes. */
  ledIndex?: number;
}

/**
 * KioskButtonNeonPro — same neon vibe as KioskButtonNeon but tuned to match
 * the hand-drawn cleaning-icon mockup: slimmer border, softer outer glow,
 * thinner stroke icons rendered via CSS color.
 */
export default function KioskButtonNeonPro({ IconCmp, label, onPress, fullWidth, color = '#7CF6E8', scale = 1, ledIndex = 0 }: Props) {
  const [pressed, setPressed] = useState(false);

  const handlePress = () => {
    setPressed(true);
    setTimeout(() => setPressed(false), 200);
    onPress();
  };

  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;

  // Icon and label scale with the tile so the icon : tile ratio stays identical
  // on a phone and on a big tablet (was a fixed 64px → looked tiny on large
  // screens). Grid tiles stack icon-over-label (column); the full-width
  // positive-feedback button keeps icon-beside-label (row), matching the mockup.
  const s = Math.min(2.5, Math.max(0.5, scale || 1));
  const labelSize = fullWidth
    ? `calc(clamp(1.5rem, 3.6vh, 2.6rem) * ${s})`
    : `calc(clamp(1.25rem, 3.1vh, 2.3rem) * ${s})`;
  // Cap the height at 96% so a large multiplier can't overflow the tile.
  const iconBox = fullWidth
    ? `min(96%, calc(min(82%, 120px) * ${s}))`
    : `min(96%, calc(min(64%, 210px) * ${s}))`;

  return (
    <button
      onPointerDown={handlePress}
      className="group relative w-full h-full select-none"
      style={{
        borderRadius: 22,
        background: pressed ? rgba(0.05) : 'rgba(8,16,18,0.6)',
        border: `1.5px solid ${rgba(0.7)}`,
        boxShadow: pressed
          ? `0 0 28px ${rgba(0.55)}, inset 0 0 18px ${rgba(0.18)}`
          : `0 0 14px ${rgba(0.28)}, inset 0 0 10px ${rgba(0.06)}`,
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: 'all 0.2s cubic-bezier(0.34, 1.4, 0.64, 1)',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        flexDirection: fullWidth ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: fullWidth ? 'clamp(1rem, 2.6vh, 2rem)' : 'clamp(0.35rem, 1.2vh, 0.9rem)',
        padding: fullWidth ? '0 clamp(1rem, 2.6vh, 2rem)' : 'clamp(0.35rem, 1vh, 0.8rem)',
      }}
    >
      {/* Animated LED border: a colour-changing rainbow ring (layer 1) plus a
          bright strip that runs around the channel (layer 2). Per-tile delays
          make both flow from one cube to the next. */}
      <span
        className="kiosk-led-color"
        aria-hidden
        style={{ animationDelay: `${-ledIndex * 0.7}s` }}
      />
      <span
        className="kiosk-led-comet"
        aria-hidden
        style={{ animationDelay: `${-ledIndex * 0.45}s` }}
      />

      <span
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          aspectRatio: '1 / 1',
          height: iconBox,
          color,
          filter: `drop-shadow(0 0 6px ${rgba(0.7)}) drop-shadow(0 0 12px ${rgba(0.35)})`,
          transition: 'transform 0.2s ease',
          transform: pressed ? 'scale(1.1)' : 'scale(1)',
        }}
      >
        <IconCmp size="100%" />
      </span>

      <span
        className="leading-tight text-center"
        style={{
          color,
          fontSize: labelSize,
          fontWeight: 500,
          direction: 'rtl',
          textShadow: `0 0 6px ${rgba(0.55)}, 0 0 14px ${rgba(0.25)}`,
          transition: 'text-shadow 0.2s ease',
        }}
      >
        {label}
      </span>
    </button>
  );
}
