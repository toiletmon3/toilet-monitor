import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon?: LucideIcon;
  emoji?: string;
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
  color?: string;
}

/**
 * KioskButtonNeon — pure-black button with a glowing cyan border.
 * Matches the Figma Make "Feedback Interface Design" template.
 */
export default function KioskButtonNeon({ icon: Icon, emoji, label, onPress, fullWidth, color = '#00E5FF' }: Props) {
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

  const iconSize = fullWidth ? 64 : 56;
  const labelSize = fullWidth ? '1.5rem' : '1.15rem';

  return (
    <button
      onPointerDown={handlePress}
      className="group relative w-full h-full rounded-lg select-none"
      style={{
        background: pressed ? rgba(0.08) : '#000000',
        border: `2px solid ${color}`,
        boxShadow: pressed
          ? `0 0 32px ${rgba(0.7)}, inset 0 0 20px ${rgba(0.15)}`
          : `0 0 20px ${rgba(0.3)}`,
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        transition: 'all 0.2s cubic-bezier(0.34, 1.4, 0.64, 1)',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex',
        flexDirection: fullWidth ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: fullWidth ? '1.5rem' : '1rem',
        padding: fullWidth ? '0 2rem' : '1.25rem',
      }}
    >
      {emoji ? (
        <span style={{ fontSize: fullWidth ? '4rem' : '3.5rem', lineHeight: 1, filter: `drop-shadow(0 0 10px ${rgba(0.6)})`, transition: 'transform 0.2s ease', transform: pressed ? 'scale(1.1)' : 'scale(1)' }}>
          {emoji}
        </span>
      ) : Icon ? (
        <Icon size={iconSize} strokeWidth={2} style={{ color, filter: `drop-shadow(0 0 10px ${rgba(0.6)})`, transition: 'transform 0.2s ease', transform: pressed ? 'scale(1.1)' : 'scale(1)', flexShrink: 0 }} />
      ) : null}

      <span className="leading-tight text-center" style={{ color: '#ffffff', fontSize: labelSize, fontWeight: 500, direction: 'rtl', textShadow: pressed ? `0 0 12px ${rgba(0.5)}` : 'none', transition: 'text-shadow 0.2s ease' }}>
        {label}
      </span>
    </button>
  );
}
