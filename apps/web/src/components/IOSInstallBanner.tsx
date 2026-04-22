import { useState, useEffect } from 'react';
import { X, Bell, BellOff } from 'lucide-react';

const DISMISSED_KEY = 'ios-install-banner-dismissed-v3';

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

interface Props {
  userId?: string;
  orgId?: string;
}

export default function IOSInstallBanner({ userId, orgId }: Props) {
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [notifState, setNotifState] = useState<'unknown' | 'prompt' | 'granted' | 'denied'>('unknown');

  useEffect(() => {
    const dismissed = sessionStorage.getItem(DISMISSED_KEY);

    // On iOS outside standalone: show install guide
    if (isIOS() && !isStandalone() && !dismissed) {
      setShowInstallGuide(true);
      return;
    }

    // Inside standalone (or non-iOS): check notification permission
    if (isPushSupported()) {
      const perm = (Notification as any).permission as NotificationPermission;
      if (perm === 'granted') {
        setNotifState('granted');
        // Auto-renew subscription silently (no permission prompt needed).
        // Covers: Android Chrome, installed PWA, or any browser where
        // permission was already granted in a previous session.
        if (userId && orgId) {
          import('../lib/push').then(({ registerPush }) =>
            registerPush(userId, orgId),
          ).catch(() => {});
        }
      } else if (perm === 'denied') {
        setNotifState('denied');
      } else {
        setNotifState('prompt');
      }
    }
  }, [userId, orgId]);

  const handleEnableNotifications = async () => {
    if (!isPushSupported() || !userId || !orgId) return;
    try {
      const { registerPush } = await import('../lib/push');
      await registerPush(userId, orgId);
      const perm = (Notification as any).permission as NotificationPermission;
      setNotifState(perm === 'granted' ? 'granted' : 'denied');
    } catch {
      setNotifState('denied');
    }
  };

  const currentUrl = window.location.href;

  // ── Install guide (iOS, not installed) ──────────────────────────────────────
  if (showInstallGuide) {
    return (
      <div style={{ background: 'rgba(0,229,204,0.07)', borderBottom: '1px solid rgba(0,229,204,0.25)', direction: 'rtl' }}>
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <span className="text-xl">📲</span>
          <span className="font-bold text-sm flex-1" style={{ color: 'var(--color-accent)' }}>
            התקן כאפליקציה לקבלת התראות
          </span>
          <button onClick={() => { sessionStorage.setItem(DISMISSED_KEY, '1'); setShowInstallGuide(false); }}
            style={{ color: 'var(--color-text-secondary)' }}>
            <X size={16} />
          </button>
        </div>

        <ol className="px-5 pb-2 flex flex-col gap-1" style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
          <li>1. לחץ על <strong style={{ color: '#fff' }}>⬆️ שיתוף</strong> בתחתית Safari</li>
          <li>2. בחר <strong style={{ color: '#fff' }}>"הוסף למסך הבית"</strong></li>
          <li>3. פתח <strong style={{ color: '#fff' }}>מהאייקון</strong> — לא מ-Safari</li>
          <li>4. לחץ על <strong style={{ color: '#fff' }}>"הפעל התראות"</strong> שיופיע</li>
        </ol>

        {/* Highlight the exact URL to save */}
        <div className="px-4 pb-3 flex flex-col gap-1.5">
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>הדף שצריך לשמור:</div>
          <div className="px-3 py-2 rounded-xl text-xs font-mono break-all select-all"
            style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,229,204,0.3)', color: '#00e5cc' }}>
            {currentUrl}
          </div>
          <div className="text-xs" style={{ color: 'rgba(239,68,68,0.8)' }}>
            ⚠️ iOS 16.4+ · Safari בלבד · חייב להיות <strong>מהאייקון</strong> ולא מ-Safari
          </div>
        </div>
      </div>
    );
  }

  // ── Notification button (standalone / non-iOS) ───────────────────────────────
  if (notifState === 'prompt') {
    return (
      <button
        onClick={handleEnableNotifications}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm"
        style={{
          background: 'rgba(0,229,204,0.07)',
          borderBottom: '1px solid rgba(0,229,204,0.2)',
          color: 'var(--color-accent)',
          direction: 'rtl',
        }}
      >
        <Bell size={16} />
        <span className="font-medium">הפעל התראות לפלאפון</span>
        <span className="text-xs ms-auto" style={{ color: 'var(--color-text-secondary)' }}>לחץ לאישור</span>
      </button>
    );
  }

  if (notifState === 'denied') {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 text-xs"
        style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.15)', color: '#f87171', direction: 'rtl' }}>
        <BellOff size={14} />
        <span>{isIOS()
          ? 'התראות חסומות — פתח הגדרות iOS ← Safari ← התראות ← אפשר'
          : 'התראות חסומות — פתח הגדרות האתר בדפדפן ← הרשאות ← התראות ← אפשר'
        }</span>
      </div>
    );
  }

  return null;
}
