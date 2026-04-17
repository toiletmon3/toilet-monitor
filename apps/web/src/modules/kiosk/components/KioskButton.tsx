import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  fullWidth?: boolean;
}

export default function KioskButton({ icon: Icon, label, onPress, fullWidth }: Props) {
  const [pressed, setPressed] = useState(false);

  const handlePress = () => {
    setPressed(true);
    setTimeout(() => setPressed(false), 180);
    onPress();
  };

  return (
    <button
      onPointerDown={handlePress}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl transition-all select-none w-full h-full"
      style={{
        background: pressed
          ? 'rgba(0,229,204,0.12)'
          : 'rgba(10,14,26,0.85)',
        border: `1.5px solid ${pressed ? 'rgba(0,229,204,0.9)' : 'rgba(0,229,204,0.35)'}`,
        boxShadow: pressed
          ? '0 0 28px rgba(0,229,204,0.55), inset 0 0 20px rgba(0,229,204,0.08)'
          : '0 0 10px rgba(0,229,204,0.12), inset 0 0 10px rgba(0,0,0,0.3)',
        transform: pressed ? 'scale(0.95)' : 'scale(1)',
        transition: 'all 0.13s ease',
        backdropFilter: 'blur(8px)',
        flexDirection: fullWidth ? 'row' : 'column',
        gap: fullWidth ? '14px' : '10px',
      }}
    >
      <div
        style={{
          color: pressed ? '#00e5cc' : 'rgba(255,255,255,0.88)',
          filter: pressed ? 'drop-shadow(0 0 8px rgba(0,229,204,0.8))' : 'drop-shadow(0 0 4px rgba(0,229,204,0.3))',
          transition: 'all 0.13s ease',
        }}
      >
        <Icon size={fullWidth ? 32 : 36} strokeWidth={1.5} />
      </div>
      <span
        className="font-medium leading-tight text-center"
        style={{
          color: pressed ? '#00e5cc' : 'rgba(255,255,255,0.9)',
          fontSize: fullWidth ? '1.1rem' : '0.82rem',
          textShadow: pressed ? '0 0 12px rgba(0,229,204,0.6)' : 'none',
          transition: 'all 0.13s ease',
        }}
      >
        {label}
      </span>
    </button>
  );
}
