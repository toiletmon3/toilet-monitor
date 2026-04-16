import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  issueCode: string;
  onReturn: () => void;
}

export default function KioskConfirmation({ onReturn }: Props) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { onReturn(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onReturn]);

  return (
    <div
      className="kiosk-root h-screen flex flex-col items-center justify-center gap-8 px-8"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Checkmark */}
      <div
        className="animate-pop-in w-32 h-32 rounded-full flex items-center justify-center"
        style={{
          background: 'rgba(0,229,204,0.1)',
          border: '3px solid var(--color-accent)',
          boxShadow: '0 0 40px rgba(0,229,204,0.4)',
        }}
      >
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <path
            d="M12 32 L26 46 L52 18"
            stroke="var(--color-accent)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Text */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">{t('kiosk.confirmation.title')}</h2>
        <p className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>
          {t('kiosk.confirmation.subtitle')}
        </p>
      </div>

      {/* Countdown */}
      <div className="flex items-center gap-3" style={{ color: 'var(--color-text-secondary)' }}>
        <span className="text-sm">{t('kiosk.confirmation.returning')}</span>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg"
          style={{ border: '2px solid var(--color-accent)', color: 'var(--color-accent)' }}
        >
          {countdown}
        </div>
      </div>
    </div>
  );
}
