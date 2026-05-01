/**
 * KioskPageNeonPro — wallpaper #3 — neon look matching the hand-drawn
 * cleaning-icon mockup. Uses custom CleaningIcons SVGs, soft cyan glow,
 * thinner borders, and shows the same stats (weekly users + avg response).
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../../../i18n';
import api from '../../../../lib/api';
import { queueIncident, syncPending, getPendingCount } from '../../../../lib/offline';
import { getSocket, joinRestroom, sendHeartbeat } from '../../../../lib/socket';
import KioskButton from './KioskButtonNeonPro';
import KioskConfirmation from '../../components/KioskConfirmation';
import CleanerCheckIn from '../../components/CleanerCheckIn';
import { Clock, Timer } from 'lucide-react';
import {
  ToiletPaperIcon,
  FloorCleaningIcon,
  TrashIcon,
  ToiletIcon,
  WrenchIcon,
  SoapIcon,
  SmileIcon,
} from './CleaningIcons';

const NEON = '#7CF6E8';

const ICON_BY_CODE: Record<string, (props: { size?: number; style?: React.CSSProperties }) => React.ReactElement> = {
  toilet_paper: ToiletPaperIcon,
  floor_cleaning: FloorCleaningIcon,
  toilet_cleaning: ToiletIcon,
  trash_empty: TrashIcon,
  soap_refill: SoapIcon,
  fault_report: WrenchIcon,
  positive_feedback: SmileIcon,
};

const DEFAULT_BUTTONS = [
  { code: 'toilet_paper',      icon: 'ToiletPaper',     nameHe: 'החלפת נייר טואלט',         nameEn: 'Toilet Paper',       enabled: true, priority: 1 },
  { code: 'floor_cleaning',    icon: 'FloorCleaning',   nameHe: 'ניקוי רצפה',               nameEn: 'Floor Cleaning',     enabled: true, priority: 2 },
  { code: 'trash_empty',       icon: 'Trash',           nameHe: 'ריקון פח',                 nameEn: 'Empty Trash',        enabled: true, priority: 3 },
  { code: 'toilet_cleaning',   icon: 'Toilet',          nameHe: 'ניקוי אסלה',               nameEn: 'Toilet Cleaning',    enabled: true, priority: 4 },
  { code: 'fault_report',      icon: 'Wrench',          nameHe: 'דיווח על תקלה',            nameEn: 'Fault Report',       enabled: true, priority: 5 },
  { code: 'soap_refill',       icon: 'Soap',            nameHe: 'מילוי סבון',               nameEn: 'Soap Refill',        enabled: true, priority: 6 },
  { code: 'positive_feedback', icon: 'Smile',           nameHe: 'עבודה טובה / משוב חיובי',  nameEn: 'Positive Feedback',  enabled: true, priority: 0 },
];

type ConnectionStatus = 'online' | 'offline' | 'syncing';

export default function KioskPageNeonPro() {
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
  const [stats, setStats] = useState<{ weeklyReports: number; dailyReports: number; avgResponseMinutes: number | null } | null>(null);
  const [statsView, setStatsView] = useState<'week' | 'today'>('week');
  const lang = i18n.language as 'he' | 'en';

  useEffect(() => {
    const id = setInterval(() => setStatsView(v => (v === 'week' ? 'today' : 'week')), 10_000);
    return () => clearInterval(id);
  }, []);

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
        } catch {}
        api.get('/auth/default-org').then(r => {
          if (r.data?.kioskLang) import('../../../../i18n').then(m => m.setLanguage(r.data.kioskLang));
        }).catch(() => {});
        const buildingId = device.restroom.floor.building.id;
        api.get(`/analytics/kiosk-stats/building/${buildingId}`).then(r => setStats(r.data)).catch(() => {});
        joinRestroom(device.restroom.id);
        getSocket().on('incident:resolved', () => {});
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

  useEffect(() => {
    const handleOnline = async () => {
      setConnectionStatus('syncing');
      const count = await getPendingCount();
      if (count > 0 && deviceInfo) await syncPending(deviceInfo.id);
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

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLock?.release(); };
  }, []);

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
          setDuplicate(true);
          setTimeout(() => setDuplicate(false), 5000);
          return;
        }
        await queueIncident({ restroomId: deviceInfo.restroom.id, issueTypeId: issueType.id, deviceId: deviceInfo.id, reportedAt });
        const count = await getPendingCount();
        setPendingCount(count);
      }
    } else {
      await queueIncident({ restroomId: deviceInfo.restroom.id, issueTypeId: issueType.id, deviceId: deviceInfo.id, reportedAt });
      const count = await getPendingCount();
      setPendingCount(count);
    }
    setConfirmed(issueCode);
    setStats(s => s ? { ...s, weeklyReports: s.weeklyReports + 1, dailyReports: s.dailyReports + 1 } : s);
    setTimeout(() => setConfirmed(null), 5000);
  }, [deviceInfo, issueTypes]);

  const handleCornerTap = useCallback(() => setShowCleanerMode(true), []);

  if (duplicate) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 text-center px-8" style={{ background: '#040b0e' }}>
        <div className="text-7xl">⏳</div>
        <div>
          <div className="text-2xl font-bold text-white mb-2">{lang === 'he' ? 'כבר בטיפול' : 'Already Reported'}</div>
          <div className="text-base" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {lang === 'he' ? 'הדיווח הזה נשלח לאחרונה — צוות הניקוי כבר בדרך' : 'This was recently reported — our team is on the way'}
          </div>
        </div>
      </div>
    );
  }

  if (confirmed) return <KioskConfirmation issueCode={confirmed} onReturn={() => setConfirmed(null)} />;

  if (showCleanerMode && deviceInfo) {
    return (
      <CleanerCheckIn
        restroomId={deviceInfo.restroom.id}
        deviceCode={deviceCode}
        onBack={() => setShowCleanerMode(false)}
        onReassigned={() => window.location.reload()}
      />
    );
  }

  const gridBtns = kioskButtons.filter(b => b.code !== 'positive_feedback' && b.enabled !== false)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  const posBtn = kioskButtons.find(b => b.code === 'positive_feedback' && b.enabled !== false);

  return (
    <div
      className="kiosk-root flex flex-col overflow-hidden"
      style={{
        height: '100dvh',
        minHeight: '-webkit-fill-available',
        background: 'radial-gradient(ellipse at top, #0a1416 0%, #020608 70%, #000000 100%)',
      }}
      dir="rtl"
    >
      {/* top bar */}
      <div className="flex items-center justify-between px-6 pt-4 pb-1 flex-shrink-0">
        <div className="flex rounded-xl overflow-hidden" style={{ background: 'rgba(124,246,232,0.05)', border: `1px solid rgba(124,246,232,0.25)`, padding: 2, gap: 2 }}>
          {([
            { code: 'he', flag: '🇮🇱', label: 'עברית' },
            { code: 'en', flag: '🇺🇸', label: 'English' },
          ] as const).map(({ code, flag, label }) => (
            <button key={code} onClick={() => setLanguage(code)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all font-medium text-sm"
              style={{
                background: lang === code ? 'rgba(124,246,232,0.15)' : 'transparent',
                color: lang === code ? NEON : 'rgba(255,255,255,0.5)',
                textShadow: lang === code ? `0 0 8px rgba(124,246,232,0.5)` : 'none',
                WebkitTapHighlightColor: 'transparent',
              }}>
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
          <button type="button" onPointerDown={handleCornerTap} onClick={handleCornerTap}
            className="px-3 py-1.5 rounded-lg select-none text-xs"
            style={{ background: 'transparent', color: 'rgba(124,246,232,0.55)', border: '1px solid rgba(124,246,232,0.25)', WebkitTapHighlightColor: 'transparent', cursor: 'pointer' }}>
            🧹 צוות
          </button>
        </div>
      </div>

      {/* title + stats — centered to match the mockup */}
      <div className="px-6 pt-2 pb-3 flex-shrink-0 text-center">
        <h1
          className="mb-3"
          style={{
            color: NEON,
            fontSize: 'clamp(2rem, 4.5vw, 3.5rem)',
            fontWeight: 700,
            textShadow: `0 0 14px rgba(124,246,232,0.55), 0 0 28px rgba(124,246,232,0.3)`,
          }}
        >
          {t('kiosk.title')}
        </h1>
        {stats && (
          <div className="flex gap-6 justify-center flex-wrap">
            <div
              key={statsView}
              className="flex items-center gap-2 px-4 py-1.5 rounded-full"
              style={{
                color: NEON,
                border: `1px solid rgba(124,246,232,0.4)`,
                boxShadow: `0 0 10px rgba(124,246,232,0.2), inset 0 0 8px rgba(124,246,232,0.05)`,
                fontSize: 'clamp(0.95rem, 1.4vw, 1.1rem)',
                animation: 'kioskStatFade 0.5s ease',
              }}
            >
              <span>
                {statsView === 'week'
                  ? `${stats.weeklyReports} ${t('kiosk.weeklyUsers')}`
                  : `${stats.dailyReports} ${t('kiosk.dailyUsers')}`}
              </span>
              <Clock className="w-4 h-4" strokeWidth={2} style={{ filter: `drop-shadow(0 0 4px ${NEON})` }} />
            </div>
            <div
              className="flex items-center gap-2 px-4 py-1.5 rounded-full"
              style={{
                color: NEON,
                border: `1px solid rgba(124,246,232,0.4)`,
                boxShadow: `0 0 10px rgba(124,246,232,0.2), inset 0 0 8px rgba(124,246,232,0.05)`,
                fontSize: 'clamp(0.95rem, 1.4vw, 1.1rem)',
              }}
            >
              <span>{stats.avgResponseMinutes ?? '—'} {t('kiosk.minutes')} · {t('kiosk.avgResponse')}</span>
              <Timer className="w-4 h-4" strokeWidth={2} style={{ filter: `drop-shadow(0 0 4px ${NEON})` }} />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-4 px-6 pb-4" style={{ minHeight: 0, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {posBtn && (() => {
          const label = lang === 'he' ? posBtn.nameHe : posBtn.nameEn;
          const Icon = ICON_BY_CODE['positive_feedback'];
          return (
            <div style={{ flex: '0 0 14%', minHeight: 90 }}>
              <KioskButton IconCmp={Icon} color={NEON} label={label} onPress={() => handleIssuePress('positive_feedback')} fullWidth />
            </div>
          );
        })()}

        <div
          className="flex-1 grid grid-cols-2 gap-4"
          style={{ gridTemplateRows: `repeat(${Math.ceil(gridBtns.length / 2)}, minmax(0, 1fr))`, minHeight: 0 }}
        >
          {gridBtns.map((btn) => {
            const issueType = issueTypes.find(it => it.code === btn.code);
            const label = issueType ? (issueType.nameI18n[lang] ?? issueType.nameI18n['he']) : (lang === 'he' ? btn.nameHe : btn.nameEn);
            const Icon = ICON_BY_CODE[btn.code] ?? WrenchIcon;
            return (
              <KioskButton key={btn.code} IconCmp={Icon} color={NEON} label={label} onPress={() => handleIssuePress(btn.code)} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
