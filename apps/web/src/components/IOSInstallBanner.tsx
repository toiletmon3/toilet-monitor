import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

const STORAGE_KEY = 'ios-install-banner-dismissed';

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

export default function IOSInstallBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isIOS() && !isStandalone() && !sessionStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 text-sm"
      style={{
        background: 'rgba(0,229,204,0.08)',
        borderBottom: '1px solid rgba(0,229,204,0.2)',
        direction: 'rtl',
      }}
    >
      <span className="text-2xl flex-shrink-0">📲</span>
      <div className="flex-1">
        <div className="font-semibold mb-0.5" style={{ color: 'var(--color-accent)' }}>
          {t('common.iosInstall.title')}
        </div>
        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {t('common.iosInstall.body')}
        </div>
      </div>
      <button onClick={dismiss} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>
        <X size={16} />
      </button>
    </div>
  );
}
