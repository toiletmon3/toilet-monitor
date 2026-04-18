import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../i18n';
import api from '../../lib/api';
import { queueIncident, syncPending, getPendingCount } from '../../lib/offline';
import { getSocket, joinRestroom, sendHeartbeat } from '../../lib/socket';
import KioskButton from './components/KioskButton';
import KioskConfirmation from './components/KioskConfirmation';
import CleanerCheckIn from './components/CleanerCheckIn';
import { Scroll, Sparkles, Trash2, Droplets, Wrench, Hand, Smile, Clock, Timer, Star, Bell, AlertCircle, Wind, ShowerHead, SmilePlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Scroll, Sparkles, Trash2, Droplets, Wrench, Hand, Smile, SmilePlus, Star, Bell, AlertCircle, Wind, ShowerHead,
};

// Lucide icon + neon color per button code (matches Figma design — all cyan by default)
const NEON_CYAN = '#00E5FF';
const BUTTON_META: Record<string, { icon: LucideIcon; color: string }> = {
  toilet_paper:      { icon: Scroll,    color: NEON_CYAN },
  floor_cleaning:    { icon: Sparkles,  color: NEON_CYAN },
  toilet_cleaning:   { icon: Droplets,  color: NEON_CYAN },
  trash_empty:       { icon: Trash2,    color: NEON_CYAN },
  soap_refill:       { icon: Hand,      color: NEON_CYAN },
  fault_report:      { icon: Wrench,    color: NEON_CYAN },
  positive_feedback: { icon: Smile,     color: NEON_CYAN },
};

const DEFAULT_BUTTONS = [
  { code: 'toilet_paper',   icon: 'Scroll',    nameHe: 'החלפת נייר טואלט', nameEn: 'Toilet Paper',    enabled: true, priority: 1 },
  { code: 'floor_cleaning', icon: 'Sparkles',  nameHe: 'ניקוי רצפה',       nameEn: 'Floor Cleaning',  enabled: true, priority: 2 },
  { code: 'toilet_cleaning',icon: 'Droplets',  nameHe: 'ניקוי אסלה',       nameEn: 'Toilet Cleaning', enabled: true, priority: 3 },
  { code: 'trash_empty',    icon: 'Trash2',    nameHe: 'ריקון פח',         nameEn: 'Empty Trash',     enabled: true, priority: 4 },
  { code: 'soap_refill',    icon: 'Hand',      nameHe: 'מילוי סבון',       nameEn: 'Soap Refill',     enabled: true, priority: 5 },
  { code: 'fault_report',   icon: 'Wrench',    nameHe: 'דיווח על תקלה',   nameEn: 'Fault Report',    enabled: true, priority: 6 },
  { code: 'positive_feedback', icon: 'Smile', nameHe: 'עבודה טובה / משוב חיובי', nameEn: 'Positive Feedback', enabled: true, priority: 0 },
];

type ConnectionStatus = 'online' | 'offline' | 'syncing';

export default function KioskPage() {
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const { t, i18n } = useTranslation();
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [issueTypes, setIssueTypes] = useState<any[]>([]);
  const [kioskButtons, setKioskButtons] = useState<any[]>(DEFAULT_BUTTONS);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [showCleanerMode, setShowCleanerMode] = useState(false);
  const [stats, setStats] = useState<{ weeklyReports: number; avgResponseMinutes: number | null } | null>(null);
  const lang = i18n.language as 'he' | 'en';

  // Load device info and issue types
  useEffect(() => {
    async function init() {
      try {
        const { data: device } = await api.get(`/auth/kiosk/${deviceCode}`);
        setDeviceInfo(device);

        const orgId = device.restroom.floor.building.orgId;
        const { data: types } = await api.get(`/buildings/issue-types/${orgId}`);
        setIssueTypes(types);

        try {
          const { data: btns } = await api.get(`/buildings/kiosk-buttons/${deviceCode}`);
          if (btns?.length) setKioskButtons(btns);
        } catch { /* use defaults */ }

        // Apply kiosk language from org settings
        api.get('/auth/default-org').then(r => {
          if (r.data?.kioskLang) import('../../i18n').then(m => m.setLanguage(r.data.kioskLang));
        }).catch(() => {});

        // Fetch real kiosk stats
        api.get(`/analytics/kiosk-stats/${device.restroom.id}`)
          .then(r => setStats(r.data))
          .catch(() => {});

        // Join WebSocket room for this restroom
        joinRestroom(device.restroom.id);
        getSocket().on('incident:resolved', () => {
          // Can show a "thank you" animation when incident is resolved
        });

        // Heartbeat every 60s
        const heartbeatInterval = setInterval(() => {
          api.patch(`/buildings/devices/${deviceCode}/heartbeat`).catch(() => {});
          sendHeartbeat(device.id, device.restroom.id);
        }, 60_000);

        return () => clearInterval(heartbeatInterval);
      } catch {
        setConnectionStatus('offline');
      }
    }
    init();
  }, [deviceCode]);

  // Monitor online status and sync
  useEffect(() => {
    const handleOnline = async () => {
      setConnectionStatus('syncing');
      const count = await getPendingCount();
      if (count > 0 && deviceInfo) {
        await syncPending(deviceInfo.id);
      }
      setConnectionStatus('online');
      setPendingCount(0);
    };
    const handleOffline = () => setConnectionStatus('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [deviceInfo]);

  // Keep screen awake (Wake Lock)
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch {}
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLock?.release(); };
  }, []);

  // Auto-reload every 6h to prevent memory leaks
  useEffect(() => {
    const timer = setTimeout(() => window.location.reload(), 6 * 60 * 60 * 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleIssuePress = useCallback(async (issueCode: string) => {
    if (!deviceInfo) return;

    const issueType = issueTypes.find((it) => it.code === issueCode);
    if (!issueType) return;

    const reportedAt = new Date().toISOString();

    if (navigator.onLine) {
      try {
        const { v4: uuidv4 } = await import('uuid');
        await api.post('/incidents', {
          restroomId: deviceInfo.restroom.id,
          issueTypeId: issueType.id,
          deviceId: deviceInfo.id,
          reportedAt,
          clientId: uuidv4(),
        });
      } catch (err: any) {
        if (err.response?.status === 409) {
          // Already reported recently — show duplicate screen
          setDuplicate(true);
          setTimeout(() => setDuplicate(false), 5000);
          return;
        }
        // Network error — fallback to offline queue
        await queueIncident({
          restroomId: deviceInfo.restroom.id,
          issueTypeId: issueType.id,
          deviceId: deviceInfo.id,
          reportedAt,
        });
        const count = await getPendingCount();
        setPendingCount(count);
      }
    } else {
      await queueIncident({
        restroomId: deviceInfo.restroom.id,
        issueTypeId: issueType.id,
        deviceId: deviceInfo.id,
        reportedAt,
      });
      const count = await getPendingCount();
      setPendingCount(count);
    }

    setConfirmed(issueCode);
    setTimeout(() => setConfirmed(null), 5000);
  }, [deviceInfo, issueTypes]);

  const handleCornerTap = useCallback(() => {
    setShowCleanerMode(true);
  }, []);

  if (duplicate) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 text-center px-8"
        style={{ background: '#000000' }}>
        <div className="text-7xl">⏳</div>
        <div>
          <div className="text-2xl font-bold text-white mb-2">
            {lang === 'he' ? 'כבר בטיפול' : 'Already Reported'}
          </div>
          <div className="text-base" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {lang === 'he' ? 'הדיווח הזה נשלח לאחרונה — צוות הניקוי כבר בדרך' : 'This was recently reported — our team is on the way'}
          </div>
        </div>
      </div>
    );
  }

  if (confirmed) {
    return <KioskConfirmation issueCode={confirmed} onReturn={() => setConfirmed(null)} />;
  }

  if (showCleanerMode && deviceInfo) {
    return (
      <CleanerCheckIn
        restroomId={deviceInfo.restroom.id}
        onBack={() => setShowCleanerMode(false)}
      />
    );
  }

  const gridBtns = kioskButtons.filter(b => b.code !== 'positive_feedback' && b.enabled !== false)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const posBtn = kioskButtons.find(b => b.code === 'positive_feedback' && b.enabled !== false);

  return (
    <div
      className="kiosk-root flex flex-col overflow-hidden"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available', background: '#000000' }}
      dir="rtl"
    >
      {/* Top bar: language switcher (small, left) + staff button (left) */}
      <div className="flex items-center justify-between px-6 pt-4 pb-1 flex-shrink-0">
        <div className="flex rounded-xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,229,255,0.25)', padding: 2, gap: 2 }}>
          {([
            { code: 'he', flag: '🇮🇱', label: 'עברית' },
            { code: 'en', flag: '🇺🇸', label: 'English' },
          ] as const).map(({ code, flag, label }) => (
            <button
              key={code}
              onClick={() => setLanguage(code)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm"
              style={{
                background: lang === code ? 'rgba(0,229,255,0.15)' : 'transparent',
                color: lang === code ? '#00E5FF' : 'rgba(255,255,255,0.5)',
                textShadow: lang === code ? '0 0 8px rgba(0,229,255,0.5)' : 'none',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span className="text-lg">{flag}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
            <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'online' ? 'bg-green-400' : connectionStatus === 'syncing' ? 'bg-yellow-400 animate-pulse-slow' : 'bg-red-400 animate-pulse-slow'}`} />
            <span>
              {connectionStatus === 'online' && t('kiosk.online')}
              {connectionStatus === 'syncing' && t('kiosk.syncing')}
              {connectionStatus === 'offline' && `${t('kiosk.offline')}${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
            </span>
          </div>
          <button
            type="button"
            onPointerDown={handleCornerTap}
            onClick={handleCornerTap}
            className="px-3 py-1.5 rounded-lg select-none text-xs"
            style={{ background: 'transparent', color: 'rgba(0,229,255,0.55)', border: '1px solid rgba(0,229,255,0.25)', WebkitTapHighlightColor: 'transparent', cursor: 'pointer' }}>
            🧹 צוות
          </button>
        </div>
      </div>

      {/* Header — title + stats */}
      <div className="px-6 pt-3 pb-3 flex-shrink-0">
        <h1
          className="text-white mb-3"
          style={{ fontSize: 'clamp(2rem, 4vw, 3.25rem)', fontWeight: 600, textShadow: '0 0 24px rgba(0,229,255,0.35)' }}
        >
          {t('kiosk.title')}
        </h1>

        {stats && (
          <div className="flex gap-8 flex-wrap">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6" strokeWidth={2.5} style={{ color: '#00E5FF', filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.6))' }} />
              <span className="text-white text-lg">
                {stats.weeklyReports} {t('kiosk.weeklyUsers')}
              </span>
            </div>
            {stats.avgResponseMinutes !== null && (
              <div className="flex items-center gap-3">
                <Timer className="w-6 h-6" strokeWidth={2.5} style={{ color: '#00E5FF', filter: 'drop-shadow(0 0 6px rgba(0,229,255,0.6))' }} />
                <span className="text-white text-lg">
                  {stats.avgResponseMinutes} {t('kiosk.minutes')} · {t('kiosk.avgResponse')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content grid: positive feedback full-width + 2×N grid */}
      <div className="flex-1 flex flex-col gap-4 px-6 pb-4" style={{ minHeight: 0, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {posBtn && (() => {
          const label = lang === 'he' ? posBtn.nameHe : posBtn.nameEn;
          const meta = BUTTON_META['positive_feedback'];
          return (
            <div style={{ flex: '0 0 14%', minHeight: 90 }}>
              <KioskButton icon={meta.icon} color={meta.color} label={label}
                onPress={() => handleIssuePress('positive_feedback')} fullWidth />
            </div>
          );
        })()}

        <div
          className="flex-1 grid grid-cols-2 gap-4"
          style={{ gridTemplateRows: `repeat(${Math.ceil(gridBtns.length / 2)}, minmax(0, 1fr))`, minHeight: 0 }}
        >
          {gridBtns.map((btn) => {
            const issueType = issueTypes.find(it => it.code === btn.code);
            const label = issueType
              ? (issueType.nameI18n[lang] ?? issueType.nameI18n['he'])
              : (lang === 'he' ? btn.nameHe : btn.nameEn);
            const meta = BUTTON_META[btn.code];
            const FallbackIcon = ICON_MAP[btn.icon] ?? Wrench;
            return (
              <KioskButton key={btn.code}
                icon={meta?.icon ?? FallbackIcon}
                color={meta?.color ?? NEON_CYAN}
                label={label}
                onPress={() => handleIssuePress(btn.code)} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
