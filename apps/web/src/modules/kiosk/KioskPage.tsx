import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../i18n';
import api from '../../lib/api';
import { queueIncident, syncPending, getPendingCount } from '../../lib/offline';
import { getSocket, joinRestroom, sendHeartbeat } from '../../lib/socket';
import KioskButton from './components/KioskButton';
import KioskConfirmation from './components/KioskConfirmation';
import CleanerCheckIn from './components/CleanerCheckIn';
import { Scroll, Wind, Trash2, ShowerHead, Wrench, Droplets, SmilePlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ISSUE_BUTTONS: { code: string; icon: LucideIcon }[] = [
  { code: 'toilet_paper', icon: Scroll },
  { code: 'floor_cleaning', icon: Wind },
  { code: 'toilet_cleaning', icon: ShowerHead },
  { code: 'trash_empty', icon: Trash2 },
  { code: 'soap_refill', icon: Droplets },
  { code: 'fault_report', icon: Wrench },
];

type ConnectionStatus = 'online' | 'offline' | 'syncing';

export default function KioskPage() {
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const { t, i18n } = useTranslation();
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [issueTypes, setIssueTypes] = useState<any[]>([]);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [showCleanerMode, setShowCleanerMode] = useState(false);
  const [stats] = useState({ weeklyUsers: 287, avgMinutes: 13 });
  const cornerTapCount = useRef(0);
  const cornerTapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
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

  // Hidden corner 3-tap to enter cleaner mode
  const handleCornerTap = useCallback(() => {
    cornerTapCount.current++;
    clearTimeout(cornerTapTimer.current);
    cornerTapTimer.current = setTimeout(() => { cornerTapCount.current = 0; }, 1500);
    if (cornerTapCount.current >= 3) {
      cornerTapCount.current = 0;
      setShowCleanerMode(true);
    }
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
      style={{ background: 'radial-gradient(ellipse at top, #0d1525 0%, #060a12 100%)' }}
    >
      {/* Header */}
      <div className="flex flex-col items-center pt-6 pb-3 px-5">
        <h1
          className="text-3xl font-bold mb-2 text-center"
          style={{ color: '#ffffff', textShadow: '0 0 20px rgba(0,229,204,0.4)', direction: 'rtl' }}
        >
          {t('kiosk.title')}
        </h1>
        <div className="flex gap-5 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'rgba(0,229,204,0.7)', fontSize: 14 }}>✦</span>
            <span>{stats.weeklyUsers} {t('kiosk.weeklyUsers')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ color: 'rgba(0,229,204,0.7)', fontSize: 14 }}>◷</span>
            <span>{stats.avgMinutes} {t('kiosk.minutes')} · {t('kiosk.avgResponse')}</span>
          </div>
        </div>
      </div>

      {/* Positive feedback button — full width */}
      <div className="px-4 mb-3" style={{ height: '13%' }}>
        <KioskButton
          icon={SmilePlus}
          label={t('kiosk.positiveFeedback')}
          onPress={() => handleIssuePress('positive_feedback')}
          fullWidth
        />
      </div>

      {/* 2×3 grid */}
      <div
        className="flex-1 grid grid-cols-2 gap-3 px-4 pb-2"
        style={{ gridTemplateRows: 'repeat(3, minmax(0, 1fr))', minHeight: 0 }}
      >
        {ISSUE_BUTTONS.map((btn) => {
          const issueType = issueTypes.find((it) => it.code === btn.code);
          const label = issueType
            ? (issueType.nameI18n[lang] ?? issueType.nameI18n['he'])
            : t(`kiosk.buttons.${btn.code}`);
          return (
            <KioskButton
              key={btn.code}
              icon={btn.icon}
              label={label}
              onPress={() => handleIssuePress(btn.code)}
            />
          );
        })}
      </div>

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

      {/* Hidden tap zone — cleaner mode */}
      <div className="absolute top-0 right-0 w-16 h-16 opacity-0" onPointerDown={handleCornerTap} />
    </div>
  );
}
