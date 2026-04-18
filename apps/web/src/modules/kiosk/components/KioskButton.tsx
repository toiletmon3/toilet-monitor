import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon?: LucideIcon;
  emoji?: string;
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
  color?: string; // hex accent color
}

export default function KioskButton({ icon: Icon, emoji, label, onPress, fullWidth, color = '#00e5cc' }: Props) {
  const [pressed, setPressed] = useState(false);

  const handlePress = () => {
    setPressed(true);
    setTimeout(() => setPressed(false), 200);
    onPress();
  };

  // Parse hex color to rgba
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const rgba = (a: number) => `rgba(${r},${g},${b},${a})`;

  return (
    <button
      onPointerDown={handlePress}
      className="flex items-center justify-center rounded-2xl transition-all select-none w-full h-full"
      style={{
        flexDirection: fullWidth ? 'row' : 'column',
        gap: fullWidth ? '16px' : '8px',
        background: pressed
          ? `rgba(10,14,26,0.95)`
          : 'rgba(8,12,24,0.82)',
        border: `1.5px solid ${pressed ? rgba(0.9) : rgba(0.3)}`,
        boxShadow: pressed
          ? `0 0 32px ${rgba(0.6)}, inset 0 0 24px ${rgba(0.1)}, 0 2px 20px rgba(0,0,0,0.6)`
          : `0 0 12px ${rgba(0.15)}, inset 0 0 12px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.4)`,
        transform: pressed ? 'scale(0.93)' : 'scale(1)',
        transition: 'all 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
        backdropFilter: 'blur(12px)',
        padding: fullWidth ? '0 20px' : '0',
      }}
    >
      {/* Icon area */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: fullWidth ? 72 : 90,
          height: fullWidth ? 72 : 90,
          borderRadius: '50%',
          background: pressed ? rgba(0.22) : rgba(0.12),
          border: `1.5px solid ${rgba(0.3)}`,
          boxShadow: pressed ? `0 0 24px ${rgba(0.55)}` : `0 0 10px ${rgba(0.22)}`,
          transition: 'all 0.15s ease',
          flexShrink: 0,
        }}
      >
        {emoji ? (
          <span style={{ fontSize: fullWidth ? '2.6rem' : '3.4rem', lineHeight: 1, filter: pressed ? `drop-shadow(0 0 8px ${rgba(0.8)})` : 'none' }}>
            {emoji}
          </span>
        ) : Icon ? (
          <Icon
            size={fullWidth ? 36 : 44}
            strokeWidth={1.5}
            style={{
              color: pressed ? color : rgba(0.9),
              filter: pressed ? `drop-shadow(0 0 8px ${rgba(0.9)})` : `drop-shadow(0 0 3px ${rgba(0.4)})`,
              transition: 'all 0.15s ease',
            }}
          />
        ) : null}
      </div>

      {/* Label */}
      <span
        className="font-bold leading-tight text-center"
        style={{
          color: pressed ? color : 'rgba(255,255,255,0.92)',
          fontSize: fullWidth ? '1.2rem' : '1rem',
          textShadow: pressed ? `0 0 16px ${rgba(0.7)}` : 'none',
          transition: 'all 0.15s ease',
          direction: 'rtl',
          maxWidth: fullWidth ? undefined : '90%',
        }}
      >
        {label}
      </span>
    </button>
  );
}
