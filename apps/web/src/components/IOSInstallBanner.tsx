import { useState, useEffect } from 'react';
import { X, Bell, BellOff, BellRing } from 'lucide-react';

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

    if (isIOS() && !isStandalone() && !dismissed) {
      setShowInstallGuide(true);
    }

    if (!isPushSupported() || !userId || !orgId) return;

    const perm = (Notification as any).permission as NotificationPermission;

    if (perm === 'granted' || perm === 'denied') {
      setNotifState(perm);
    }

    import('../lib/push').then(({ registerPush, wasPushApproved }) => {
      if (perm === 'granted') {
        registerPush(userId, orgId).catch(() => {});
      } else if (wasPushApproved()) {
        registerPush(userId, orgId)
          .then(() => {
            const updated = (Notification as any).permission as NotificationPermission;
            setNotifState(updated === 'granted' ? 'granted' : 'denied');
          })
          .catch(() => {});
      } else {
        setNotifState('prompt');
      }
    });
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

  return (
    <>
      {/* ── iOS install guide (not installed as PWA) ── */}
      {showInstallGuide && (
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
      )}

      {notifState === 'granted' && (
        <div
          className="w-full flex items-center gap-2 px-4 py-1.5 text-xs"
          style={{
            background: 'rgba(34,197,94,0.06)',
            borderBottom: '1px solid rgba(34,197,94,0.12)',
            color: '#22c55e',
            direction: 'rtl',
          }}
        >
          <BellRing size={12} />
          <span>התראות מופעלות</span>
        </div>
      )}

      {notifState === 'prompt' && (
        <div
          style={{
            background: 'rgba(0,229,204,0.07)',
            borderBottom: '1px solid rgba(0,229,204,0.2)',
            direction: 'rtl',
          }}
        >
          <button
            onClick={handleEnableNotifications}
            className="w-full flex items-center gap-3 px-4 py-3 text-sm"
            style={{ color: 'var(--color-accent)' }}
          >
            <Bell size={16} />
            <span className="font-medium">הפעל התראות לפלאפון</span>
            <span className="text-xs ms-auto" style={{ color: 'var(--color-text-secondary)' }}>לחץ לאישור</span>
          </button>
          {isIOS() && (
            <div className="px-4 pb-3 flex flex-col gap-1" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
              <div className="font-bold" style={{ color: 'var(--color-accent)' }}>📱 לבעלי אייפון:</div>
              <div>לאחר הלחיצה תופיע חלונית מערכת — לחצו <strong style={{ color: '#fff' }}>"אפשר" (Allow)</strong>.</div>
              <div>אם ההתראות לא מגיעות, ודאו ש:</div>
              <ol className="pr-4 flex flex-col gap-0.5" style={{ listStyleType: 'decimal' }}>
                <li>האפליקציה נפתחת <strong style={{ color: '#fff' }}>מהאייקון במסך הבית</strong> ולא מ-Safari</li>
                <li>הגדרות → התראות → האפליקציה הזו → <strong style={{ color: '#fff' }}>מופעל</strong></li>
              </ol>
            </div>
          )}
        </div>
      )}

      {notifState === 'denied' && (
        <div
          style={{ background: 'rgba(239,68,68,0.06)', borderBottom: '1px solid rgba(239,68,68,0.15)', direction: 'rtl' }}
        >
          <button
            onClick={handleEnableNotifications}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-xs"
            style={{ color: '#f87171' }}
          >
            <BellOff size={14} />
            <span>התראות חסומות — לחץ כאן לנסות שוב</span>
          </button>
          {isIOS() && (
            <div className="px-4 pb-2.5 flex flex-col gap-0.5" style={{ fontSize: 11, color: 'rgba(248,113,113,0.7)' }}>
              <div>אם זה לא עוזר, פתחו <strong style={{ color: '#f87171' }}>הגדרות</strong> באייפון:</div>
              <div className="pr-3">הגדרות → התראות → חפשו את האפליקציה → הפעילו התראות</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
