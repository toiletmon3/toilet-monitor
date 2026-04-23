import { useState } from 'react';

interface Props {
  IconCmp: (props: { size?: number; style?: React.CSSProperties }) => React.ReactElement;
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
  color?: string;
}

/**
 * KioskButtonNeonPro — same neon vibe as KioskButtonNeon but tuned to match
 * the hand-drawn cleaning-icon mockup: slimmer border, softer outer glow,
 * thinner stroke icons rendered via CSS color.
 */
export default function KioskButtonNeonPro({ IconCmp, label, onPress, fullWidth, color = '#7CF6E8' }: Props) {
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

  const iconSize = fullWidth ? 64 : 64;
  const labelSize = fullWidth ? '1.45rem' : '1.2rem';

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
        flexDirection: fullWidth ? 'row' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: fullWidth ? '1.5rem' : '1rem',
        padding: fullWidth ? '0 1.5rem' : '0.75rem 1rem',
      }}
    >
      <IconCmp
        size={iconSize}
        style={{
          color,
          filter: `drop-shadow(0 0 6px ${rgba(0.7)}) drop-shadow(0 0 12px ${rgba(0.35)})`,
          transition: 'transform 0.2s ease',
          transform: pressed ? 'scale(1.1)' : 'scale(1)',
          flexShrink: 0,
        }}
      />

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
