import { useState } from 'react';

interface Props {
  icon: string;
  label: string;
  onPress: () => void;
}

export default function KioskButton({ icon, label, onPress }: Props) {
  const [pressed, setPressed] = useState(false);

  const handlePress = () => {
    setPressed(true);
    setTimeout(() => setPressed(false), 200);
    onPress();
  };

  return (
    <button
      onPointerDown={handlePress}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl transition-all select-none w-full h-full"
      style={{
        background: 'var(--color-card)',
        border: `1px solid ${pressed ? 'var(--color-accent)' : 'rgba(0,229,204,0.25)'}`,
        boxShadow: pressed
          ? '0 0 24px rgba(0,229,204,0.5), 0 0 48px rgba(0,229,204,0.2)'
          : '0 0 12px rgba(0,229,204,0.1)',
        transform: pressed ? 'scale(0.94)' : 'scale(1)',
        transition: 'all 0.12s ease',
      }}
    >
      <span className="text-4xl">{icon}</span>
      <span
        className="text-sm font-medium text-center px-2 leading-tight"
        style={{ color: pressed ? 'var(--color-accent)' : 'var(--color-text)' }}
      >
        {label}
      </span>
    </button>
  );
}
