/**
 * KioskPageNeonVideo — "video background" template.
 *
 * Same approach as `neon-image`, but the background is a short MP4 that plays
 * in an infinite loop (muted + autoplay + playsinline, so Android/iOS kiosk
 * browsers start it without a user gesture). The video *is* the design —
 * transparent hotspot buttons are overlaid exactly on top of each animated
 * tile, positioned in percentages of the video itself inside an
 * aspect-ratio-locked wrapper, so they track the artwork on any screen size.
 *
 * Interactive elements: the issue-report hotspots plus a small "🧹 צוות"
 * button (bottom corner) that opens the same CleanerCheckIn screen as the
 * classic template. There is no language switcher.
 *
 * The video file lives in `apps/web/public/kiosk-templates/` so a missing file
 * never breaks the build; drop the MP4 there to activate the look.
 *
 * Tip: append `?hotspots=1` to the kiosk URL to draw outlines over every
 * hotspot, which makes fine-tuning the coordinates below trivial.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../../../lib/api';
import { queueIncident, syncPending, getPendingCount } from '../../../../lib/offline';
import { joinRestroom, sendHeartbeat } from '../../../../lib/socket';
import KioskConfirmation from '../../components/KioskConfirmation';
import CleanerCheckIn from '../../components/CleanerCheckIn';

/** Background video served from /public. The ?v= suffix is a cache-buster:
 *  nginx serves static assets as immutable for 1y, so bump this whenever the
 *  file changes to force every kiosk to fetch the new video. */
const VIDEO_URL = '/kiosk-templates/neon-video-bg.mp4?v=1';

/** The video's native aspect ratio (width / height). Locking the wrapper to
 *  the real pixel dimensions keeps the % hotspots glued to the artwork with no
 *  letterbox drift. */
const VID_W = 576;
const VID_H = 1024;

/** Default positions of the live overlay elements, as % of the stage. `right` =
 *  distance of the element's right edge from the physical right edge. These can
 *  be fine-tuned per template from the admin ("מיקום הנתונים על התבנית"). */
const NUM_POS = {
  usersNum:   { top: 10.8, right: 24.5 },
  periodWord: { top: 10.8, right: 61 },
  minutesNum: { top: 15.5, right: 26 },
};
const DEFAULT_FONT_SCALE = 1.3;

// Same visual spec as neon-image: overlay text scales with the artwork height
// (cqh) so it stays glued to the video's own typography on any screen.
const FONT_CQH = 2.62;

const NUM_STYLE = {
  position: 'absolute', color: '#eafffb', fontFamily: "'Heebo', sans-serif", fontWeight: 400,
  textShadow: '0 0 12px rgba(124,246,232,0.55)', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2,
} as const;

type ConnectionStatus = 'online' | 'offline' | 'syncing';

/**
 * Hotspot rectangles, measured as percentages of the 576×1024 video frame.
 * `code` maps to the same issue-type codes the other templates use, so each
 * tap creates exactly the same incident. Tweak these with `?hotspots=1`.
 */
const HOTSPOTS: { code: string; left: number; top: number; width: number; height: number }[] = [
  // Big "positive feedback" button across the top.
  { code: 'positive_feedback', left: 8.0, top: 22.2, width: 83.5, height: 13.6 },
  // Grid — row 1
  { code: 'toilet_paper',     left: 8.0,  top: 36.4, width: 41.1, height: 18.2 },
  { code: 'floor_cleaning',   left: 50.3, top: 36.4, width: 41.4, height: 18.2 },
  // Grid — row 2
  { code: 'trash_empty',      left: 8.0,  top: 55.1, width: 41.1, height: 18.1 },
  { code: 'toilet_cleaning',  left: 50.3, top: 55.1, width: 41.4, height: 18.1 },
  // Grid — row 3
  { code: 'fault_report',     left: 8.0,  top: 73.8, width: 41.1, height: 19.6 },
  { code: 'soap_refill',      left: 50.3, top: 73.8, width: 41.4, height: 19.6 },
];

export default function KioskPageNeonVideo() {
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const { i18n } = useTranslation();
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [issueTypes, setIssueTypes] = useState<any[]>([]);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [stats, setStats] = useState<{ weeklyReports: number; dailyReports: number; avgResponseMinutes: number | null } | null>(null);
  const [statsView, setStatsView] = useState<'week' | 'today'>('week');
  const [layout, setLayout] = useState<any>(null);
  const [showCleanerMode, setShowCleanerMode] = useState(false);
  const lang = i18n.language as 'he' | 'en';
  const showHotspots = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('hotspots');

  // Effective overlay positions + font scale, configured per template in the admin.
  const L = { ...NUM_POS, ...(layout || {}) } as typeof NUM_POS;
  const fontScale: number = layout?.fontScale ?? DEFAULT_FONT_SCALE;
  const numStyle = {
    ...NUM_STYLE,
    fontSize: `${(FONT_CQH * fontScale).toFixed(3)}cqh`,
  };

  useEffect(() => {
    async function init() {
      try {
        const { data: device } = await api.get(`/auth/kiosk/${deviceCode}`);
        setDeviceInfo(device);
        const orgId = device.restroom.floor.building.orgId;
        const { data: types } = await api.get(`/buildings/issue-types/${orgId}`);
        setIssueTypes(types);
        const buildingId = device.restroom.floor.building.id;
        api.get(`/analytics/kiosk-stats/building/${buildingId}`).then(r => setStats(r.data)).catch(() => {});
        api.get(`/buildings/kiosk-config/${deviceCode}`).then(r => setLayout(r.data?.statsLayout ?? null)).catch(() => {});
        api.get('/auth/default-org').then(r => {
          if (r.data?.kioskLang) import('../../../../i18n').then(m => m.setLanguage(r.data.kioskLang));
        }).catch(() => {});
        joinRestroom(device.restroom.id);
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

  // Alternate the top stat between "this week" and "today" every 10s.
  useEffect(() => {
    const id = setInterval(() => setStatsView(v => (v === 'week' ? 'today' : 'week')), 10_000);
    return () => clearInterval(id);
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
    setStats(s => (s ? { ...s, weeklyReports: s.weeklyReports + 1, dailyReports: s.dailyReports + 1 } : s));
    setConfirmed(issueCode);
    setTimeout(() => setConfirmed(null), 5000);
  }, [deviceInfo, issueTypes]);

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

  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available', background: '#000' }}
      dir="rtl"
    >
      {/* Aspect-ratio-locked stage holding the video + hotspots. Letterboxing
          (if the screen ratio differs from the video) happens around this box,
          so the hotspots stay glued to the animation. */}
      <div
        style={{
          position: 'relative',
          aspectRatio: `${VID_W} / ${VID_H}`,
          height: '100%',
          maxWidth: '100%',
          containerType: 'size', // lets the overlay font size (cqh) track the video
          background: '#000',
        }}
      >
        {/* The looping background video. muted + playsInline are required for
            autoplay on Android/iOS kiosk browsers; disablePictureInPicture and
            no controls keep it a pure background layer. */}
        <video
          src={VIDEO_URL}
          autoPlay
          muted
          loop
          playsInline
          disablePictureInPicture
          preload="auto"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* The real, clickable button hotspots — one per tile in the video. */}
        {HOTSPOTS.map(h => (
          <button
            key={h.code}
            type="button"
            aria-label={h.code}
            onPointerDown={() => handleIssuePress(h.code)}
            style={{
              position: 'absolute',
              left: `${h.left}%`,
              top: `${h.top}%`,
              width: `${h.width}%`,
              height: `${h.height}%`,
              borderRadius: 22,
              background: showHotspots ? 'rgba(124,246,232,0.18)' : 'transparent',
              border: showHotspots ? '2px dashed #7CF6E8' : 'none',
              WebkitTapHighlightColor: 'transparent',
              cursor: 'pointer',
              zIndex: 1,
            }}
          >
            {showHotspots && (
              <span style={{ color: '#7CF6E8', fontSize: 12 }}>{h.code}</span>
            )}
          </button>
        ))}

        {/* Live values dropped into the video's blank slots. The fixed words
            ("משתמשים" / "דקות …") are part of the video — we only add the number
            and the alternating period word ("שבוע"/"יום"). */}
        {stats && (
          <>
            <span style={{ ...numStyle, top: `${L.usersNum.top}%`, right: `${L.usersNum.right}%` }}>
              {statsView === 'week' ? stats.weeklyReports : stats.dailyReports}
            </span>
            <span style={{ ...numStyle, top: `${L.periodWord.top}%`, right: `${L.periodWord.right}%` }}>
              {statsView === 'week' ? 'שבוע' : 'יום'}
            </span>
            <span style={{ ...numStyle, top: `${L.minutesNum.top}%`, right: `${L.minutesNum.right}%` }}>
              {stats.avgResponseMinutes ?? 0}
            </span>
          </>
        )}

        {pendingCount > 0 && (
          <div style={{ position: 'absolute', bottom: '1%', insetInlineStart: '2%', fontSize: 12, color: 'rgba(255,200,0,0.8)', zIndex: 2 }}>
            ⏳ {pendingCount}
          </div>
        )}

        {/* Team / cleaner-mode entry — same behaviour as the classic template's
            corner button: opens CleanerCheckIn for check-in and resolving. */}
        <button
          type="button"
          onPointerDown={() => setShowCleanerMode(true)}
          className="select-none"
          style={{
            position: 'absolute',
            bottom: '1.2%',
            insetInlineEnd: '3%',
            zIndex: 2,
            padding: '6px 14px',
            borderRadius: 12,
            background: 'rgba(0,229,204,0.08)',
            color: 'rgba(0,229,204,0.55)',
            border: '1px solid rgba(0,229,204,0.2)',
            fontSize: 12,
            WebkitTapHighlightColor: 'transparent',
            cursor: 'pointer',
          }}>
          🧹 צוות
        </button>
      </div>
    </div>
  );
}
