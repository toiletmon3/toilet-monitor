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
import { Scroll, Wind, Trash2, ShowerHead, Wrench, Droplets, SmilePlus, Star, Bell, AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  Scroll, Wind, Trash2, ShowerHead, Wrench, Droplets, SmilePlus, Star, Bell, AlertCircle,
};

// Emoji + color per button code
const BUTTON_META: Record<string, { emoji: string; color: string }> = {
  toilet_paper:      { emoji: '🧻', color: '#60a5fa' },
  floor_cleaning:    { emoji: '🧹', color: '#34d399' },
  toilet_cleaning:   { emoji: '🚽', color: '#a78bfa' },
  trash_empty:       { emoji: '🗑️', color: '#f87171' },
  soap_refill:       { emoji: '🧴', color: '#fbbf24' },
  fault_report:      { emoji: '🔧', color: '#fb923c' },
  positive_feedback: { emoji: '😊', color: '#00e5cc' },
};

const DEFAULT_BUTTONS = [
  { code: 'toilet_paper',   icon: 'Scroll',    nameHe: 'החלפת נייר טואלט', nameEn: 'Toilet Paper',    enabled: true, priority: 1 },
  { code: 'floor_cleaning', icon: 'Wind',      nameHe: 'ניקוי רצפה',       nameEn: 'Floor Cleaning',  enabled: true, priority: 2 },
  { code: 'toilet_cleaning',icon: 'ShowerHead',nameHe: 'ניקוי אסלה',       nameEn: 'Toilet Cleaning', enabled: true, priority: 3 },
  { code: 'trash_empty',    icon: 'Trash2',    nameHe: 'ריקון פח',         nameEn: 'Empty Trash',     enabled: true, priority: 4 },
  { code: 'soap_refill',    icon: 'Droplets',  nameHe: 'מילוי סבון',       nameEn: 'Soap Refill',     enabled: true, priority: 5 },
  { code: 'fault_report',   icon: 'Wrench',    nameHe: 'דיווח על תקלה',   nameEn: 'Fault Report',    enabled: true, priority: 6 },
  { code: 'positive_feedback', icon: 'SmilePlus', nameHe: 'עבודה טובה / משוב חיובי', nameEn: 'Positive Feedback', enabled: true, priority: 0 },
];

type ConnectionStatus = 'online' | 'offline' | 'syncing';

export default function KioskPage() {
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const { t, i18n } = useTranslation();
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [issueTypes, setIssueTypes] = useState<any[]>([]);
  const [kioskButtons, setKioskButtons] = useState<any[]>(DEFAULT_BUTTONS);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [showCleanerMode, setShowCleanerMode] = useState(false);
  const [stats] = useState({ weeklyUsers: 287, avgMinutes: 13 });
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
        if (err.response?.status !== 409) {
          // Fallback to offline queue
          await queueIncident({
            restroomId: deviceInfo.restroom.id,
            issueTypeId: issueType.id,
            deviceId: deviceInfo.id,
            reportedAt,
          });
          const count = await getPendingCount();
          setPendingCount(count);
        }
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
    setTimeout(() => setConfirmed(null), 3500);
  }, [deviceInfo, issueTypes]);

  const handleCornerTap = useCallback(() => {
    setShowCleanerMode(true);
  }, []);

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

  return (
    <div
      className="kiosk-root h-screen flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 120% 60% at 50% 0%, #0a1628 0%, #060a12 60%, #02050d 100%)' }}
    >
      {/* Decorative top glow */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '70%', height: 2, background: 'linear-gradient(90deg, transparent, rgba(0,229,204,0.6), transparent)', pointerEvents: 'none' }} />

      {/* Header */}
      <div className="flex flex-col items-center pt-5 pb-2 px-5">
        <h1
          className="text-3xl font-bold mb-2 text-center"
          style={{ color: '#ffffff', textShadow: '0 0 30px rgba(0,229,204,0.5), 0 2px 4px rgba(0,0,0,0.5)', direction: 'rtl', letterSpacing: '-0.02em' }}
        >
          {t('kiosk.title')}
        </h1>
        <div className="flex gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
          <div className="flex items-center gap-1">
            <span style={{ color: 'rgba(0,229,204,0.6)' }}>✦</span>
            <span>{stats.weeklyUsers} {t('kiosk.weeklyUsers')}</span>
          </div>
          <div className="flex items-center gap-1">
            <span style={{ color: 'rgba(0,229,204,0.6)' }}>◷</span>
            <span>{stats.avgMinutes} {t('kiosk.minutes')} · {t('kiosk.avgResponse')}</span>
          </div>
        </div>
      </div>

      {/* Positive feedback — full width */}
      {(() => {
        const posBtn = kioskButtons.find(b => b.code === 'positive_feedback' && b.enabled !== false);
        if (!posBtn) return null;
        const label = lang === 'he' ? posBtn.nameHe : posBtn.nameEn;
        const meta = BUTTON_META['positive_feedback'];
        return (
          <div className="px-4 mb-3" style={{ height: '14%' }}>
            <KioskButton emoji={meta.emoji} color={meta.color} label={label}
              onPress={() => handleIssuePress('positive_feedback')} fullWidth />
          </div>
        );
      })()}

      {/* 2×N grid — issue buttons */}
      {(() => {
        const gridBtns = kioskButtons.filter(b => b.code !== 'positive_feedback' && b.enabled !== false)
          .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
        const rows = Math.ceil(gridBtns.length / 2);
        return (
          <div className="flex-1 grid grid-cols-2 gap-3 px-4 pb-2"
            style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`, minHeight: 0 }}>
            {gridBtns.map((btn) => {
              const issueType = issueTypes.find(it => it.code === btn.code);
              const label = issueType
                ? (issueType.nameI18n[lang] ?? issueType.nameI18n['he'])
                : (lang === 'he' ? btn.nameHe : btn.nameEn);
              const meta = BUTTON_META[btn.code];
              return (
                <KioskButton key={btn.code}
                  emoji={meta?.emoji}
                  icon={meta ? undefined : (ICON_MAP[btn.icon] ?? Wrench)}
                  color={meta?.color ?? '#00e5cc'}
                  label={label}
                  onPress={() => handleIssuePress(btn.code)} />
              );
            })}
          </div>
        );
      })()}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-2 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'online' ? 'bg-green-400' : connectionStatus === 'syncing' ? 'bg-yellow-400 animate-pulse-slow' : 'bg-red-400 animate-pulse-slow'}`} />
          <span>
            {connectionStatus === 'online' && t('kiosk.online')}
            {connectionStatus === 'syncing' && t('kiosk.syncing')}
            {connectionStatus === 'offline' && `${t('kiosk.offline')}${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
          </span>
        </div>
        <div className="flex gap-2">
          {(['he', 'en'] as const).map((l) => (
            <button key={l} onClick={() => setLanguage(l)}
              className={`px-1.5 py-0.5 rounded text-xs transition-all ${lang === l ? 'text-cyan-400 font-bold' : 'opacity-40'}`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Staff entry — always visible small button, bottom-left */}
      <div className="absolute bottom-8 start-4" onPointerDown={handleCornerTap}>
        <span className="text-xs px-3 py-1.5 rounded-xl select-none"
          style={{ background: 'rgba(0,229,204,0.08)', color: 'rgba(0,229,204,0.45)', border: '1px solid rgba(0,229,204,0.15)', fontSize: 11, cursor: 'default' }}>
          🧹 צוות
        </span>
      </div>
    </div>
  );
}
