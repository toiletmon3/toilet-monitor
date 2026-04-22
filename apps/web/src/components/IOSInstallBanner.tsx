import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const STORAGE_KEY = 'ios-install-banner-dismissed-v2';

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
      style={{
        background: 'rgba(0,229,204,0.07)',
        borderBottom: '1px solid rgba(0,229,204,0.25)',
        direction: 'rtl',
      }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <span className="text-xl">📲</span>
        <span className="font-bold text-sm flex-1" style={{ color: 'var(--color-accent)' }}>
          כדי לקבל התראות — התקן את האפליקציה
        </span>
        <button onClick={dismiss} style={{ color: 'var(--color-text-secondary)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Steps */}
      <ol className="px-5 pb-3 flex flex-col gap-1" style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
        <li>1. לחץ על <strong style={{ color: '#fff' }}>⬆️ שיתוף</strong> בשורת הכתובת של Safari</li>
        <li>2. בחר <strong style={{ color: '#fff' }}>"הוסף למסך הבית"</strong></li>
        <li>3. פתח מהאייקון החדש — <strong style={{ color: '#fff' }}>לא מ-Safari</strong></li>
        <li>4. אשר הרשאת התראות כשנדרש</li>
      </ol>

      <div className="px-4 pb-3">
        <div className="text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          ⚠️ iOS 16.4 ומעלה בלבד · Safari בלבד (לא Chrome לiPhone)
        </div>
      </div>
    </div>
  );
}
